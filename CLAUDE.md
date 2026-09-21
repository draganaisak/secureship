# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SecureShip is an AI-gated shipment-support chat app, delivered in five phased weeks (W1 skeleton + local LLM, W2 identity + 2FA, W3 tool-calling, W4 Auth0 admin, W5 hardening).
Customers chat with a locally-run LLM to check on shipments, but (from Week 2 onward) only after the assistant verifies their identity conversationally plus a mocked 6-digit 2FA code.
There is no end-user login; a single Auth0 admin (Week 4) manages the data.

- Full spec: `docs/project-requirements.md`
- Working plan (goal / approach / done-when per increment): `docs/PLAN.md`

**Current state: Week 1 complete** - the stack runs and holds a real conversation with the
local model, with **no gating yet** (asking about a shipment just gets answered; that is intentional and temporary). The seeded shipment data is not reachable by the chat until Week 3's tool-calling.

## Environment constraints (non-negotiable, chosen deliberately)

- **Podman, not Docker** (company laptop). Use `podman compose`. It shells out to the external
  `podman-compose` provider, which has quirks - keep `docker-compose.yml` conservative.
- **Chat transport is HTTP** request/response, not WebSocket.
- **Ollama runs on the host**, not in a container (Metal GPU acceleration). The backend
  container reaches it at `http://host.containers.internal:11434`. The runtime chat brain must
  stay the local model - never call an external LLM API for the chat itself.
- **Model:** `qwen3:8b` via Ollama on the host.
- Schema is created by `init_db()` at backend startup (`create_all`).

## Commands

```bash
# Prereqs (once): Podman VM + Ollama model
podman machine start
ollama pull qwen3:8b

# Run the whole stack (frontend :5173, backend :8000, postgres :5432)
podman compose up                       # add --build after dependency/Dockerfile changes

# IMPORTANT: backend .py edits do NOT hot-reload over the Podman mount. After editing backend:
podman compose up -d --force-recreate backend

# Seed mock data (idempotent) - customers/shipments/packages
podman compose exec backend python -m scripts.seed_data

# Inspect the DB
podman compose exec postgres psql -U user -d secureship

# Regenerate the frontend API client from the backend's OpenAPI schema (backend must be running)
cd frontend && npx orval

# Frontend lint / typecheck-build
cd frontend && npm run lint
cd frontend && npm run build
```

There is no automated test suite yet; verification is manual (curl `/health` and `/chat`,
`psql` on `chat_sessions`, and the browser chat). See `docs/DEMO.md` for the exact checks.

## Architecture (the big picture)

**One chat turn:** `ChatWindow.tsx` → `POST /chat {message, session_id}` → `backend/main.py`loads-or-creates a `ChatSession` row → appends the user turn → sends the system prompt + full stored history to Ollama via `llm/ollama_client.py` → appends the reply → saves → returns`{reply, session_id}`.

- **The server owns the conversation.** The browser only keeps a `session_id`; the full transcript lives in Postgres as a `JSONB` array of `{role, content, timestamp}` on `ChatSession.transcript`. This is the seam where identity gating will be enforced (Weeks 2-3): session state and the verified `customer_id` live on the server, never trusted from the client.
- **The gating enforcement point (future, Epic F).** When tool-calling lands, the tool layer must always scope shipment lookups to `session.customer_id` - never a model- or user-supplied id - and the "verified" check must be a single auditable point in the backend, enforced outside the model's prompt. Do not scatter this logic.
- **Frontend types are generated, never hand-written.** FastAPI publishes `/openapi.json`; Orval (`frontend/orval.config.ts`) generates React Query hooks + TS types into `frontend/src/api/generated/` (do **not** hand-edit). All requests route through `frontend/src/api/mutator.ts`, which prepends `VITE_API_URL`. After changing backend request/response models or routes: restart the backend, then `npx orval`, then commit the regenerated output.
- **Async all the way:** FastAPI + httpx (Ollama) + SQLAlchemy 2.0 async engine + asyncpg. Use the `get_session` dependency for DB access in handlers.

## Conventions and gotchas

- **Give new routes an explicit `operation_id`** (e.g. `operation_id="sendChat"`) so Orval generates clean hook names (`useSendChat`) instead of `useChatEndpointChatPost`.
- **Orval response types are discriminated unions** (`{data, status}` for 200 vs 422). Narrow on`response.status === 200` before reading `response.data`, even though `mutator.ts` throws on non-2xx.
- **JSONB updates must reassign**, not mutate in place - `session.transcript = [...]`, because
  SQLAlchemy does not track an in-place `.append`.
- **Persona/system prompt is prepended server-side** in `main.py` and is never stored as a user turn in the transcript.
- **qwen3 is a thinking model:** `ollama_client.py` disables thinking and strips
  `<think>...</think>` defensively; keep both.
- **Styling is Tailwind CSS v4** - utility classes in JSX; `@tailwindcss/vite` plugin, CSS-first config (`@import "tailwindcss";` in `src/index.css`). Extract a component before repeating long utility strings; avoid `@apply` as a general approach.
- Comments in code/config stay minimal and non-editorial.
- Work plan-first: agree the approach in `docs/PLAN.md` before implementing a feature.
