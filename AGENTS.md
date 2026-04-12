# AI Agent Instructions for AgentOne

## Engineering Standards

Every change, no matter how small, must follow first-principles logic and be production-grade.

- Before implementing, build a concrete plan. Back-trace each step from its preconditions and forward-trace the downstream effects.
- Eliminate implementation gaps, race conditions, leaks, and avoidable bugs before proposing a solution.
- Reuse existing utilities and patterns before introducing new abstractions.
- Optimize for robustness, security, and conciseness.
- If anything is unclear, ask instead of guessing.

## Critical Agent Guidelines

**AGENTS MUST NOT COMMIT CODE**

AI agents must never run `git commit`, `git push`, or any other git write operation. Leave code staged or unstaged for the user to handle manually.

**Do not create summary documents for routine work**

Do not create files such as `FIX.md`, `SUMMARY.md`, or similar for small or medium changes unless the user explicitly asks for them.

**Use ASCII by default**

- Do not introduce smart quotes unless the user asks for them.
- Do not use box-drawing dash characters such as `─` in comments or documentation.
- If you add divider comments, use plain ASCII dashes only.

## Project Overview

AgentOne is a Yarn workspace monorepo for a local Ollama companion application.

- Client: React 19, TypeScript, Vite 7, Material UI 7, React Router 7.
- Server: Express 5, TypeScript, better-sqlite3.
- Storage: local SQLite database at `.user-data/AgentOne.db`.
- Optional service: FastAPI training server in `train_model/`.

### Live product surface

- The main app is the chat UI at `/gpt`.
- Active server behavior includes chat streaming, chat session history, model listing, and Modelfile management.

### Present in the repo but not currently active

- `server/src/routes/fileman.ts` and `server/src/routes/finetune.ts` exist, but their routers are commented out in `server/src/server.ts`.
- The related client project/file manager components also exist, but they are not part of the main live flow right now.
- Treat these as in-progress code, not active product behavior, unless the user explicitly asks to wire them in.

## Workspace Layout

- `client/`: React app. `client/src/pages/gpt.tsx` is the main product surface. `client/src/pages/root.tsx` is still mostly starter/demo content.
- `server/`: Express API and SQLite schema. `server/src/server.ts` is the active entry point. `server/src/sqlite.ts` creates the database tables on startup.
- `train_model/`: optional FastAPI service used by `yarn train-server`.
- `scripts/`: helper scripts. `scripts/killnode.sh` is intentionally broad and should not be run unless the user explicitly requests it.
- Generated or runtime directories such as `client/dist/`, `server/dist/`, `.vite/`, and `.user-data/` are not primary source files.

## Package Management and Commands

This repo uses Yarn exclusively. Do not use npm.

### Root commands

- `yarn dev`: starts client and server.
- `yarn dev:train`: starts client, server, and the Python training API.
- `yarn build`: builds both workspaces.
- `yarn lint`: lints the repo.
- `yarn start`: runs built server plus client preview.

### Workspace commands

- `yarn workspace @agentone/client dev`
- `yarn workspace @agentone/client build`
- `yarn workspace @agentone/client preview`
- `yarn workspace @agentone/server dev`
- `yarn workspace @agentone/server build`
- `yarn workspace @agentone/server start`

## Environment and Runtime

- The client builds API URLs from `VITE_API_HOST` and `VITE_API_PORT`.
- The server reads `VITE_API_PORT` and `OLLAMA_API_URL` from the root `.env`.
- Ollama must expose its HTTP API. The server proxies or forwards calls that depend on `/api/tags`, `/api/chat`, `/api/create`, `/api/delete`, and `/api/show`.
- `yarn train-server` expects a local virtual environment at `train_model/.venv` and starts Uvicorn on port `8010`.

## Active Architecture

- Client routing is plain React Router via `createBrowserRouter`. This repo does not use Vike, Next.js, Redux, or server-side rendering.
- `client/src/main.tsx` uses `React.StrictMode`. Duplicate renders, effects, and development-only API calls are expected in dev. Do not try to suppress them unless there is a real side-effect bug.
- The client mostly uses local React state, cookies, and localStorage. Do not assume there is a global app store.
- The live server mounts `/session` and `/modelfile`, plus top-level `/chat` and `/list-models`.
- `server/src/sqlite.ts` is the source of truth for the local schema: `sessions`, `chats`, `chats_fts`, `modelfiles`, `projects`, `files`, and `jobs`.

## Frontend Conventions

- Follow the existing stack: React function components, hooks, Material UI, and local state.
- Material UI 7 is in use. Preserve existing component APIs and styling patterns unless a broader refactor is part of the task.
- Imports with explicit `.ts` or `.tsx` extensions are intentional and supported by the client TypeScript configuration. Do not remove them just to make the code look more conventional.
- `serverUrl` is currently derived inline in multiple components from the same environment variables. If you refactor it, keep the behavior consistent across the client.
- Some files still contain starter or in-progress sections. Prefer targeted edits over broad cleanup unless cleanup is explicitly requested.
- The primary user-facing screen is `/gpt`, not the demo-like root page.

## Backend Conventions

- The server is on Express 5. Legacy optional route syntax like `:param?` is not safe here. Register explicit route pairs such as `/path` and `/path/:param` instead.
- The active middleware stack is minimal: `cors()` and `express.json()`.
- There is no auth, session framework, Redis, queue system, or external database layer in the active server.
- Reuse the shared `db` instance from `server/src/sqlite.ts` instead of adding another database abstraction without a clear need.
- The chat endpoint supports streaming and uses `X-Session-Uid` and `X-Chat-Uid` headers to keep the client aligned with stored chat history.
- Modelfile operations proxy to Ollama and mirror metadata in SQLite. Keep both sides in sync when changing Modelfile behavior.
- If you work on file/project or fine-tune code, first verify whether the related routes are mounted before treating any bug as user-facing.

## TypeScript, Lint, and Style Notes

- TypeScript is `strict` in both client and server.
- The repo ESLint config relaxes several rules in practice, including `no-explicit-any`, `no-unused-vars`, and some React Hooks rules. Prefer better types when practical, but do not churn existing files just to eliminate current `any` usage.
- The codebase already uses a few `@ts-expect-error` comments in in-progress areas. Only add new ones as a last resort and keep them specific.
- `.editorconfig` enforces LF endings, final newlines, and 2-space indentation for `*.js`, `*.json`, and `*.yml`. Match the existing style for other file types as well.

## Validation Expectations

- For client changes, run the narrowest useful validation first, usually `yarn workspace @agentone/client build` or `yarn lint`.
- For server changes, run `yarn workspace @agentone/server build`. If routing or startup changes, verify that the server actually boots.
- For cross-workspace changes, run `yarn build`.
- If you touch the Python training service, keep the validation local to that work and do not assume it is part of the default workflow unless `yarn dev:train` is in use.

## Scope Discipline

- Keep future instruction updates tied to this repo only.
- Remove or ignore guidance about Supabase, PM2, BullMQ, browser extensions, payment systems, recruiter features, Vike, SSR, portal dependencies, or other architectures unless they are actually added to AgentOne.
- Prefer concise, high-signal guidance that helps future agents act correctly in this codebase.
