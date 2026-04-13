# AgentOne

AgentOne is a local Ollama companion app built as a Yarn workspace monorepo. The main product surface is the chat UI at `/gpt`, backed by an Express API and a local SQLite database.

Current capabilities:

- Streaming chat with persisted sessions and history
- Session-scoped chat memory with rolling summaries, pinned facts, per-turn forget or remember controls, and memory diagnostics
- Modelfile management for creating customized model variants and personas
- Local persistence in `.user-data/AgentOne.db`

Present in the repo but not currently part of the main live flow:

- File and project management code
- Fine-tuning routes
- Optional FastAPI training service in `train_model/`

<small>(Click below for a video preview)</small><br/>
<a href="https://www.youtube.com/watch?v=vVfMWTNXFLo" target="_blank" rel="noopener noreferrer"><img src="https://img.youtube.com/vi/vVfMWTNXFLo/0.jpg" alt="[Sample video]" /></a>

## Stack

- Client: React 19, TypeScript, Vite 8, Material UI 9, React Router 7
- Server: Express 5, TypeScript, better-sqlite3
- Storage: local SQLite database at `.user-data/AgentOne.db`
- Model runtime: Ollama over HTTP

## Requirements

- Node 22+ with Corepack enabled
- Ollama installed locally or available over HTTP
- At least one Ollama model pulled locally
- Optional: a Python virtual environment at `train_model/.venv` if you want to run the training server

## Quick Start

1. Start Ollama and make sure it exposes an HTTP API.

Native install:

```bash
ollama serve
ollama pull llama3.2
```

Docker:

```bash
docker pull ollama/ollama
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
docker exec -it ollama ollama pull llama3.2
```

2. Clone the repo and install dependencies.

```bash
git clone git@github.com:user27828/AgentOne.git
cd AgentOne
corepack enable
yarn
```

3. Create a root `.env` file. The server reads this file directly, and the client Vite config also loads it from the repo root.

```dotenv
VITE_API_HOST=http://localhost
VITE_API_PORT=3001
OLLAMA_API_URL=http://localhost:11434
```

4. Start the app.

```bash
yarn dev
```

5. Open the client URL shown by Vite and navigate to `/gpt`.

Note: the `/` route exists, but it is only a lightweight landing page. The main chat experience lives at `/gpt`.

## Root Commands

- `yarn dev` runs the server and client in development mode
- `yarn dev:train` runs the server, client, and optional FastAPI training server
- `yarn build` builds both workspaces into `server/dist/` and `client/dist/`
- `yarn start` runs the built server and a Vite preview server for the built client
- `yarn preview` is an alias for `yarn start`
- `yarn lint` runs ESLint across the repo
- `yarn train-server` starts only the optional FastAPI training server on port `8010`

## Workspace Commands

- `yarn workspace @agentone/client dev`
- `yarn workspace @agentone/client build`
- `yarn workspace @agentone/client preview`
- `yarn workspace @agentone/server dev`
- `yarn workspace @agentone/server build`
- `yarn workspace @agentone/server start`

## Project Layout

- `client/` contains the React app. The main UI is `client/src/pages/gpt.tsx`.
- `server/` contains the Express API and SQLite bootstrap code.
- `train_model/` contains the optional FastAPI training service.
- `.user-data/AgentOne.db` is created locally for session, chat, Modelfile, and related app data.

## Active Server Surface

The live server currently mounts and uses:

- `/chat`
- `/list-models`
- `/session`
- `/modelfile`

The chat flow depends on Ollama endpoints such as `/api/tags`, `/api/chat`, `/api/create`, `/api/delete`, and `/api/show`.

## Notes

- Use Yarn for this repo. Do not use npm.
- `yarn start` expects that you already ran `yarn build`.
- Chat memory is persisted per session and stored locally alongside chat history.
- File manager and fine-tune code exists in the repository, but those routes are not currently mounted in the active server.

## Known Issues

- Not profitable.

## References

- [Ollama Docker image](https://hub.docker.com/r/ollama/ollama)
- [Ollama model library](https://ollama.com/library)
- [Yarn Workspaces](https://yarnpkg.com/features/workspaces)
