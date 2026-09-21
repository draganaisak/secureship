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

## Out of scope this week

Identity collection, 2FA, tool-calling/gating, Auth0, escalation theater. `state` stays a plain string; the state machine is Week 2.
