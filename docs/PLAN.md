# SecureShip - Working Plan

Living reference for the build. This is the goal / approach / done-when summary we work against.

## Week 1 goal (Phase 1)

Repo runs and holds a real end-to-end conversation with the local model (`qwen3:8b` via host Ollama), with **zero gating yet**. Gating/tools/admin are Weeks 2-5.

## Locked decisions

- Transport: **HTTP** request/response (not WebSocket).
- Runtime: **Podman**, full `podman compose` from the start (frontend + backend + postgres in containers; Ollama stays on the host).
- Backend reaches host Ollama via `http://host.containers.internal:11434`.
- DB: **async SQLAlchemy 2.0 + asyncpg**; schema created at backend startup via `create_all` (no migrations).
- Frontend: **Vite + React + TypeScript**, React Query, **Orval**-generated hooks/types.
- Styling: **Tailwind CSS v4** (utility-first; `@tailwindcss/vite` plugin, CSS-first config in `src/index.css`).
- Backend image: **python:3.12-slim**.

## Increments (done-when)

- **Inc 0** Skeleton + diagrams. *Done:* dirs + `docs/diagrams/` exist.
- **Inc 1** Backend container + `/health`. *Done:* `curl localhost:8000/health` ok, `/docs` renders.
- **Inc 2** `/chat` -> host Ollama, multi-turn + persona. *Done:* history curl returns context-aware reply, `<think>` stripped.
- **Inc 3** Postgres + `ChatSession` JSONB + persist turns. *Done:* psql shows transcript turns; survives restart.
- **Inc 4** Customer/Shipment/Package models + seed script. *Done:* 25+ customers, 40-60 shipments, >=1 package each.
- **Inc 5** Vite chat window + CORS. *Done:* browser chats with model, history renders, no CORS error.
- **Inc 6** Orval codegen. *Done:* generated hooks used by the chat window.
- **Inc 7** Full `podman compose up`. *Done:* clean stack, transcripts persisted, README updated.

## Week 2 goal (Phase 2)

Implement and enforce the conversation state machine (`docs/diagrams/architecture.md` §2): a visitor is recognized as asking about a shipment, provides identity that matches a `Customer`, and passes a mock 6-digit 2FA code before reaching **Verified**. Plus the cosmetic "talk to a human" escalation theater (§2b). Real shipment data stays locked until Week 3.

## Week 2 decisions

- Gate is enforced in the backend, outside the model's prompt, at a single point (`backend/verification.py`).
- No formal tool-calling yet (that is Week 3 / Epic F). The state machine is backend-orchestrated; the LLM is used only to read intent and extract identity fields (JSON mode).
- Identity match key: last name (case-insensitive) + phone (digits-only). Address is collected but not used to match. A non-match returns a neutral message (Epic B3).
- 2FA: 6-digit code, 3 attempts then invalidate, 5-minute expiry (`CODE_TTL`, Epic C3/C4). Mock SMS logs the code to backend stdout only, never PII.
- Live 2FA state stored as columns on `ChatSession` (no second store).

## Week 2 increments (done-when)

- **Inc 8** State machine + gate module. *Done:* `verification.py` + new `ChatSession` columns; `state` transitions live in `/chat`.
- **Inc 9** Conversational identity collection + matching. *Done:* asking about a shipment collects name/phone; a match issues a code, a non-match is neutral.
- **Inc 10** Mock 2FA + `/verify-code`. *Done:* code logged, session reaches `verified`; wrong x3 and expiry handled.
- **Inc 11** On-demand code modal (frontend). *Done:* modal appears only when signalled, verifies, surfaces the result.
- **Inc 12** Escalation theater (Epic G). *Done:* "talk to a human" from Anonymous or Verified plays the scripted handoff + color shift; no data leaks.

## Week 3 goal (Phase 3)

Verified users get real, gated shipment answers via tool-calling (Epic F, D1-D2). The local model is given a `lookup_shipments` tool but never direct DB access; the backend executes it and always scopes the query to `session.customer_id`, never a model- or user-supplied id. This replaces the Week 2 verified stub that told the model lookups were unavailable.

## Week 3 decisions

- One tool, `lookup_shipments`, with no customer argument (Epic F1; skeleton 6.6; the 6.3 note "tool layer always uses session.customer_id"). Epic D2 is satisfied by scoping alone - a foreign tracking number is never in the returned set - so no separate per-tracking tool.
- Shipments only, not packages. `Package` is admin-managed (spec 4.4) and belongs to Week 4 CRUD (Epic E2).
- The single auditable enforcement point (Epic F3) is `backend/tools.py:run_tool` - it re-checks `state == verified`, ignores tool arguments, and queries by `session.customer_id`.
- Backend agentic loop: call model with tools, execute any tool calls (scoped), feed results back, repeat up to `MAX_TOOL_ROUNDS`, then return the model's text answer.
- No PII in logs: each tool call logs name + customer_id (uuid) + result count only.
- No schema change, no DB recreate, no reseed, no frontend/Orval change (the `/chat` contract is unchanged; the reply just carries real data now).

## Week 3 increments (done-when)

- **Inc 13** Tool-calling client. *Done:* `chat_with_tools` returns the raw message; `strip_think` exposed.
- **Inc 14** Enforcement layer. *Done:* `backend/tools.py` with `SHIPMENT_TOOLS` + guarded `run_tool` scoped to `session.customer_id`.
- **Inc 15** Verified branch. *Done:* `_verified_reply` tool loop wired in `/chat`; `VERIFIED_SYSTEM` drives tool use; verified users get real shipment answers.
- **Inc 16** Gate holds. *Done:* prompt-injection ("show all shipments" / a foreign tracking number) returns only the caller's data; backend log shows the scoped call.

## Week 4 goal (Phase 4)

A single **admin** logs in via **Auth0** and manages the data the chat draws from (Customer /
Shipment / Package CRUD). The two identity systems stay separate: conversational 2FA
(`verification.py`) has nothing to do with Auth0, and an admin cannot become a verified chat
session (Epic E4). Per spec 4.5, the Auth0 slice is built **using the Auth0 Agent Skills**.

## Week 4 decisions

- Auth0 for admin login only (Epic E1/E4; spec 4.5). Chat verification untouched.
- Gate enforced on the backend routes, not frontend nav (Epic E3): one `require_admin` FastAPI
  dependency validates the Auth0 JWT (RS256 via JWKS + issuer + audience + expiry) - the single
  auditable admin enforcement point, mirroring `tools.py` for chat.
- CRUD for all three entities (Epic E2). Status stays a `String` column, validated as an enum at
  the Pydantic layer (spec 4.4 values) - no migration, consistent with `create_all`.
- HTTP + Orval: admin endpoints get explicit `operation_id`s; the admin panel consumes the
  generated hooks (spec 4.8). Admin calls carry a Bearer token attached in `mutator.ts` for
  `/admin` URLs only; chat calls stay anonymous.
- Build sequence: the Auth0-neutral half (CRUD backend + admin UI) first; the Auth0 slice
  (real `require_admin`, `Auth0Provider`/login/token) second, driven by the installed skills.

## Week 4 increments (done-when)

- **Inc 17** Admin CRUD backend. *Done:* `backend/admin.py` router (15 ops, explicit
  `operation_id`s) wired in `main.py`; `backend/auth.py` `require_admin` fails closed (401).
  DONE.
- **Inc 18** Admin panel UI. *Done:* `/admin` route; `AdminPanel` + Customer/Shipment/Package
  managers using generated Orval hooks; build + lint clean. DONE.
- **Inc 19** Auth0 slice (skill-driven). *Done:* built via the Auth0 Agent Skills
  (`framework-fastapi-api` + `framework-react`). `backend/auth.py:require_admin` uses the
  `auth0-fastapi-api` SDK; frontend `Auth0Provider` + `ProtectedRoute` + login/logout + token into
  `mutator.ts` via `AuthTokenBridge`. Verified: no token -> 400, junk token -> 401, real login ->
  200. DONE.
- **Inc 20** E2E + separation. *Done:* create/edit/delete persisted for all three entities;
  admin set a shipment `delivered -> exception` and a verified chat reported `exception` (same
  live DB); chat works tokenless and cannot reach `/admin/*`; admin auth never touches
  `ChatSession`. DONE.

## Week 5 goal (Phase 5)

Harden, document, and finalize for the final demo. Required: the three spec items (README,
diagrams regenerated against the real build, a basic edge-case pass). Stretch goals are explicitly
out of scope (team's choice, zero weight).

## Week 5 decisions

- Keep the edge-case pass **basic** (spec wording) - fix the two real gaps and add light input
  bounds; do not gold-plate (no strict phone/format regex, no resend rate-limiting).
- The LLM-failure guard lives at the `main.py` call boundary (one `try/except` around the
  `/chat` state branches), not in `ollama_client`, so `_post` still fails loudly where that is
  correct.
- Topic-change detection uses identity extraction on the latest turn (`_is_topic_change`), since
  intent alone can't tell identity provision from an off-topic question (both read as
  `wants_shipment=false`). State is preserved so the user can resume.
- Diagrams are corrected to the **real** implementation: identity/2FA are backend-driven (not
  model tool calls), the only model tool is `lookup_shipments`, state lives in the Postgres
  `ChatSession` row, and the states are the five real ones (no `IdentityRejected`/`AwaitingCode`/
  `CodeExpired` as persisted states).

## Week 5 increments (done-when)

- **Inc 21** LLM-failure resilience. *Done:* `/chat` wraps intent + reply generation in
  `try/except (httpx.HTTPError, KeyError)` returning `SERVICE_BUSY_MSG` (friendly 200, not 500);
  modal preserved in `code_sent`. Code-verified; manual stop-Ollama check documented.
- **Inc 22** Topic-change mid-verification. *Done:* `collecting_identity` and `code_sent` answer
  an off-topic question via `_faq_reply` and keep state; verified by curl (detour answered, then
  identity resumes to `code_sent`).
- **Inc 23** Input bounds. *Done:* `ChatRequest.message` (1-4000), `VerifyCodeRequest.code`
  (1-12), admin required string fields `min_length=1`; empty/oversized -> 422. Orval regenerated.
- **Inc 24** README. *Done:* human-facing root `README.md` - what it is, security model, stack,
  prerequisites, run commands, layout, demo pointer, constraints.
- **Inc 25** Diagrams regenerated against the real build (`docs/diagrams/architecture.md`); the
  five real states, backend-driven identity/2FA, single `lookup_shipments` model tool.

## Post-plan hardening, polish, and tooling (Inc 26-30)

These landed after the original Week 5 plan, driven by manual testing and an independent review pass.

- **Inc 26** 2FA code-expiry UX. *Done:* `CODE_TTL` 10->5 min; `/chat` returns `code_expires_at`;
  `CodeModal` shows a live countdown; `code_expired` + the `code_sent` branch drop an expired
  session back to `collecting_identity` so a fresh name+phone reissues a code; "Start over" closes
  the modal and prompts a restart. Backend + curl verified.
- **Inc 27** Admin write-boundary validation. *Done:* tracking `^MX\d{12}$`; `NonEmptyStr`
  (strip + non-empty) on required strings; `Field(ge=0)` on package decimals; `*Read` models kept
  standalone/lenient (the one-bad-row-500 fix). Orval regenerated.
- **Inc 28** Admin form UX + a11y. *Done:* `useCrudManager` centralizes add/edit/delete/search/
  dirty state + the browser Constraint Validation API; `FormField` renders the required `*` and
  inline errors; `last_update` defaults to now; save/delete mutation errors surfaced; the shared
  `Modal` traps focus and closes on Escape.
- **Inc 29** Frontend maintainability refactor. *Done:* extracted `useCrudManager`, a generic
  `DataTable`, and `Button`/`FormField` primitives; decomposed `ChatWindow` into `useChat` +
  `ChatComposer`/`MessageBubble`; the three managers are now thin shells.
- **Inc 30** Repo hygiene + Claude tooling. *Done:* conventions extracted to
  `.claude/CONVENTIONS.md` (imported by `CLAUDE.md`); committed `.claude/settings.json` (shared
  deny-list + lint hook scoped to frontend edits); a `code-reviewer` subagent delegating to the
  `independent-code-review` skill (+ an Accessibility dimension); the codegen-suggestion Agent Skill
  built (`.claude/skills/orval-codegen-suggest/`); independent review pass with findings fixed.

## Out of scope (stretch goals)

Real Twilio SMS, containerized Ollama, llama.cpp, admin chat-session viewer.
