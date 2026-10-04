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
- 2FA: 6-digit code, 3 attempts then invalidate, 10-minute expiry (Epic C3/C4). Mock SMS logs the code to backend stdout only, never PII.
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

## Out of scope until Week 4+

Auth0 admin login + Customer/Shipment/Package CRUD (Week 4, Epic E). Hardening, diagram regen, README finalize, and optional stretch goals (Twilio, containerized Ollama, admin chat viewer) - Week 5.
