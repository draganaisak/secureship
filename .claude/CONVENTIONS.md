# SecureShip - Conventions and Gotchas

Durable project rules and conventions. Imported into `CLAUDE.md` (via `@.claude/CONVENTIONS.md`)
so it loads into every session; also readable on its own. Add new rules here as they are agreed.

## Writing style (inherited from the author's global Claude instructions)

- **Never use the em dash character - only the regular hyphen (-).** Applies to everything:
  code, comments, docs, commit messages, and chat responses. Use a hyphen wherever a dash is
  needed; avoid the en dash too. This is why the whole repo uses `-` consistently.

## Engineering conventions and gotchas

- **Give new routes an explicit `operation_id`** (e.g. `operation_id="sendChat"`) so Orval generates clean hook names (`useSendChat`) instead of `useChatEndpointChatPost`.
- **Orval response types are discriminated unions** (`{data, status}` for 200 vs 422). Narrow on `response.status === 200` before reading `response.data`, even though `mutator.ts` throws on non-2xx.
- **JSONB updates must reassign**, not mutate in place - `session.transcript = [...]`, because
  SQLAlchemy does not track an in-place `.append`.
- **Column `default=` applies at INSERT (flush), not at object construction.** A freshly built
  `ChatSession()` has `state=None`, `code_attempts=None`, etc. until committed - so set gate-
  critical fields explicitly when creating (`ChatSession(state=STATE_ANONYMOUS)`) rather than
  reading them pre-flush. The state branch also fails **closed**: unknown/None state routes to the
  anonymous FAQ, never the verified/tool branch.
- **Persona/system prompt is prepended server-side** in `main.py` and is never stored as a user turn in the transcript.
- **qwen3 is a thinking model:** `ollama_client.py` disables thinking and strips
  `<think>...</think>` defensively; keep both.
- **Styling is Tailwind CSS v4** - utility classes in JSX; `@tailwindcss/vite` plugin, CSS-first config (`@import "tailwindcss";` in `src/index.css`). Extract a component before repeating long utility strings; avoid `@apply` as a general approach.
- **Adding a frontend dependency means rebuilding the frontend image, not just `npm install`.** The container's `node_modules` is an anonymous volume (`- /app/node_modules`) that shadows the host's and survives `down`/`up`. A host-only `npm install` leaves the container missing the package (`Failed to resolve import ...`). Fix: `podman exec secureship_frontend_1 npm install` then restart the container, or `podman compose up -d --build frontend` for a durable rebuild.
- Comments in code/config stay minimal and non-editorial.
- Work plan-first: agree the approach in `docs/PLAN.md` before implementing a feature.
- **Validate at the write boundary, never on the read path.** Request models
  (`*Create`/`*Update` in `admin.py`, `ChatRequest`/`VerifyCodeRequest` in `main.py`) carry the
  `Field(...)` constraints (`min_length`, `pattern`, bounds). Response/`*Read` models stay lenient
  and must reflect whatever is already stored - keep them **standalone** (not inheriting `*Create`).
  A `response_model` that re-validates stored data raises `ResponseValidationError` (500) for the
  whole list the moment one older row violates a newer rule.
- **Admin forms validate through the browser's Constraint Validation API, centralized in
  `useCrudManager`.** Each `<form>` is `noValidate`; every field gets a `name` plus its rule
  (`required`, `pattern`, `maxLength`); `useCrudManager.submit` walks the form controls, collects
  each `validationMessage` into per-field `errors` keyed by `name`, focuses the first invalid one,
  and only then calls `onSubmit`. The shared `ui/` primitives (`TextField`/`SelectField`) render
  the required `*` and the inline error; the modal/delete/search/dirty state machine lives once in
  `useCrudManager`. Do not re-implement per manager or add a second, hand-rolled validation source.
- **Recovery and edge states are resolved server-side, not guessed on the client** (same principle
  as "the server owns the conversation"). E.g. an expired 2FA code is detected in the backend
  (`verification.code_expired`) and the `/chat` `code_sent` branch drops back to
  `collecting_identity` so a fresh name+phone reissues a code; the frontend just closes the modal
  and prompts a restart - it never fakes a submit or assumes an expiry the backend has not confirmed.
- **After any frontend edit, run `npm run lint` + `npx tsc -b --noEmit` (and `npm run build` for
  non-trivial changes) before calling it done;** a `post-tool-use-lint` hook also gates edits, so
  unused vars / type errors must be resolved, not left for later.
