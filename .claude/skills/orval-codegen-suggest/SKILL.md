---
name: orval-codegen-suggest
description: Notice when the backend's OpenAPI surface (FastAPI request/response Pydantic models or routes in backend/main.py or backend/admin.py) has changed without a matching regeneration of the frontend's Orval client, and suggest regenerating it. Use after editing backend API models/routes, or when asked to sync, regenerate, or check the generated frontend API client. Suggest and wait for confirmation; never run the generator or overwrite generated files unprompted.
---

# Orval Codegen Suggestion

The frontend's API types and React Query hooks under `frontend/src/api/generated/`
are generated from the backend's OpenAPI schema by Orval - never hand-written. They
drift the moment a backend request/response model or route changes and nobody reruns
the generator. Your job is to NOTICE that drift and SUGGEST the fix. You do not apply
it yourself.

## Semi-automatic by design (non-negotiable)

- You SUGGEST regeneration and WAIT for an explicit "yes".
- You do NOT run `npx orval`, and you do NOT create, edit, or overwrite any file under
  `frontend/src/api/generated/` on your own initiative.
- The point is to keep a human in the loop reviewing generated output before it lands.
  Removing that confirmation step defeats the purpose of the skill.

## When this applies

Consider suggesting a regeneration when a change touches the backend's OpenAPI surface:

- Request/response Pydantic models (`BaseModel` subclasses used as a request body or a
  route `response_model`) in `backend/main.py` or `backend/admin.py` - fields added,
  removed, renamed, retyped, or constraint-changed (`Field(...)`, `min_length`,
  `pattern`, enum values, optionality).
- Route changes: new/removed/renamed routes, changed `operation_id`, changed path or
  method, changed `response_model`.

Do NOT suggest for changes that cannot alter the schema: DB-only models under
`backend/models/`, internal helpers, `tools.py`/`verification.py` logic, comments, or
frontend-only edits.

## Detection steps (read-only)

1. Inspect what changed: `git status` and `git diff` (and staged `git diff --cached`)
   for `backend/main.py` and `backend/admin.py`.
2. Decide whether any changed hunk alters the OpenAPI surface per the list above.
3. Check whether the generated client was already regenerated in the same working
   state: is anything under `frontend/src/api/generated/` modified in `git status`? If
   the backend schema changed but the generated client did not, that is drift worth
   flagging.

## What to tell the user

If you find drift, report it briefly and concretely, then stop and wait:

- Which backend model/route changed, and how (e.g. "`ShipmentCreate` gained a
  `pattern` on `tracking_number`", "new route `listPackages`").
- That the generated client under `frontend/src/api/generated/` has not been
  regenerated to match.
- The exact steps to regenerate, and the ordering gotcha:

  ```bash
  # Orval reads the LIVE schema from the running backend's /openapi.json, so the
  # backend must be running AND restarted to reflect the .py edits first
  # (the Podman mount does not hot-reload backend code):
  podman restart secureship_backend_1

  cd frontend && npx orval
  # then review the diff under src/api/generated/ and commit it
  ```

- Ask: "Want me to walk through regenerating, or will you run it?" and WAIT.

Only if the user explicitly confirms do you proceed to guide the commands. Even then,
the regenerated files are machine-owned: the user reviews and commits them; you never
hand-edit the generated output.
