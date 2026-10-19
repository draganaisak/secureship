# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SecureShip is an AI-gated shipment-support chat app, delivered in five phased weeks (W1 skeleton + local LLM, W2 identity + 2FA, W3 tool-calling, W4 Auth0 admin, W5 hardening).
Customers chat with a locally-run LLM to check on shipments, but (from Week 2 onward) only after the assistant verifies their identity conversationally plus a mocked 6-digit 2FA code.
There is no end-user login; a single Auth0 admin (Week 4) manages the data.

- Full spec: `docs/project-requirements.md`
- Working plan (goal / approach / done-when per increment): `docs/PLAN.md`

**Current state: Week 5 in progress (hardening + docs)** - the stack runs, the state machine gates
a visitor through conversational identity collection + a mocked 6-digit 2FA code to `verified`, and
a verified user gets real shipment answers via tool-calling. The model is given a single
`lookup_shipments` tool (no direct DB access); the backend executes it and always scopes the query
to `session.customer_id`, never a model- or user-supplied id. That enforcement point lives in
`backend/tools.py` (`run_tool`), and the verified tool loop is `_verified_reply` in `main.py`.

Week 5 hardening added: the `/chat` LLM calls are wrapped so an Ollama outage returns a friendly
`SERVICE_BUSY_MSG` instead of a 500; off-topic questions mid-verification are answered via FAQ
while the gate state is preserved (`_is_topic_change` in `main.py`); request models carry basic
length bounds. The human-facing `README.md` and the regenerated diagrams (`docs/diagrams/`) are
also Week 5.

Week 4 adds the **admin** side: a single admin logs in via **Auth0** and manages Customer /
Shipment / Package data (full CRUD). The two identity systems are deliberately separate (Epic E4):
admin auth lives in `backend/auth.py` (`require_admin`), the CRUD routes in `backend/admin.py`
(one `APIRouter(prefix="/admin")` gated by `require_admin`), and the admin panel in
`frontend/src/admin/`. The chat's conversational verification never touches Auth0, and no code
path lets an admin token mutate `ChatSession` state or a chat session reach `/admin/*`.
Hardening/docs/diagrams are Week 5.

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

Admin (Week 4) needs Auth0 config in a root `.env` (gitignored; see `.env.example`):
`AUTH0_DOMAIN` + `AUTH0_AUDIENCE` (backend) and `VITE_AUTH0_DOMAIN` + `VITE_AUTH0_CLIENT_ID` +
`VITE_AUTH0_AUDIENCE` (frontend) - all public identifiers, no client secret. `docker-compose.yml`
substitutes them into the containers, so applying new values needs a full
`podman compose down && podman compose up -d` (not `--force-recreate`, which hits the
podman-compose dependent-container quirk and skips the frontend).

There is no automated test suite yet; verification is manual (curl `/health` and `/chat`,
`psql` on `chat_sessions`, and the browser chat). See `docs/DEMO.md` for the exact checks.

## Architecture (the big picture)

**One chat turn:** `ChatWindow.tsx` → `POST /chat {message, session_id}` → `backend/main.py`loads-or-creates a `ChatSession` row → appends the user turn → sends the system prompt + full stored history to Ollama via `llm/ollama_client.py` → appends the reply → saves → returns`{reply, session_id}`.

- **The server owns the conversation.** The browser only keeps a `session_id`; the full transcript lives in Postgres as a `JSONB` array of `{role, content, timestamp}` on `ChatSession.transcript`. This is the seam where identity gating is enforced: session state and the verified `customer_id` live on the server, never trusted from the client.
- **The gating enforcement point (Epic F, `backend/tools.py:run_tool`).** The tool layer always scopes shipment lookups to `session.customer_id` - never a model- or user-supplied id - and re-checks `state == verified` before running; the tool's `arguments` are deliberately ignored. This is the single auditable check, enforced outside the model's prompt. The model gets tools only in the verified branch (`_verified_reply` in `main.py`), which runs a capped tool-call loop. Keep this logic here; do not scatter it.
- **Frontend types are generated, never hand-written.** FastAPI publishes `/openapi.json`; Orval (`frontend/orval.config.ts`) generates React Query hooks + TS types into `frontend/src/api/generated/` (do **not** hand-edit). All requests route through `frontend/src/api/mutator.ts`, which prepends `VITE_API_URL`. After changing backend request/response models or routes: restart the backend, then `npx orval`, then commit the regenerated output.
- **The admin side is a second, separate identity system (Epic E).** A single admin logs in via **Auth0** and manages Customer/Shipment/Package data. The admin auth enforcement point is `backend/auth.py:require_admin` (built with the `auth0-fastapi-api` SDK - validates the Bearer access token against the tenant JWKS + issuer + audience; fails closed to 503 if unconfigured). It gates `backend/admin.py`, one `APIRouter(prefix="/admin")` with full CRUD. The panel is `frontend/src/admin/` (`/admin` route behind an Auth0 `ProtectedRoute`); `mutator.ts` attaches the Bearer token **only** to `/admin` URLs via a getter registered by `AuthTokenBridge`. Keep this separate from chat verification - the two never cross (Epic E4). Auth0 only does admin login; it never touches shipment data, which always comes from our Postgres.
- **Async all the way:** FastAPI + httpx (Ollama) + SQLAlchemy 2.0 async engine + asyncpg. Use the `get_session` dependency for DB access in handlers.

## Conventions and gotchas

The project's conventions and gotchas live in their own rules file, imported here so they load
every session. Add new rules there, not inline below.

@.claude/CONVENTIONS.md
