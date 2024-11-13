# AgentOne - Vite/React front/backend for Ollama

This app provides a frontend for Ollama installations that provide a REST API interface.

Todo: Add more functionality offered by the Ollama API.

Requirements:

- Ollama installation accessible via HTTP(S).
- This repo, configured.

# Installation

## Install Ollama docker image:

- `docker pull ollama/ollama`
- Run the container
  - CPU-only: `docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama`
  - Nvidia GPUs: `docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama`
- Choose and run a model: `docker exec -it ollama ollama run llama3.2`
- _optional_ Verify list of available models: `http://localhost:11434/api/tags` (Host and port may vary)

Different models can be chosen from this list: [Ollama Library](https://ollama.com/library)

## Prepare the front/backend

- Install required tools
  - Node 18+, which includes corepack
  - Make sure corepack is enabled after making sure you're running Node 18+ (for yarn) - `corepack enable`<br />
    Note: It's no longer necessary to install yarn by itself from npm. Node bundles corepack, and corepack installs + manages yarn.
- Clone this repo - `git clone git@github.com:user27828/AgentOne.git`
- `cd AgentOne`
- Create and setup the root `.env` file. Ensure the following variables are defined, and with your own settings:
  - `VITE_API_HOST='http://localhost'`
  - `VITE_API_PORT=3001`
  - `OLLAMA_API_URL='http://localhost:11434'`
- `yarn`
- `yarn run`
- Access the URL shown in the console.

## Run

- `yarn dev` - Run the client and server in dev mode (hot reloading, transpile/interpret on save, etc)
- `yarn build` - Transpile the TypeScript files, and other files into a distributable package in `client/dist/*` and `server/dist/*`
- `yarn start` - Builds the environments and runs the built files - not ideal for dev.

## Known issues

- Scroll to latest response is not working.
- Not profitable

## References:

- [Ollama docker image](https://hub.docker.com/r/ollama/ollama)
- [Ollama Library (of LLMs)](https://ollama.com/library)
- [Yarn Workspaces](https://yarnpkg.com/features/workspaces)
