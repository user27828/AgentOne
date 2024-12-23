# AgentOne - Vite+React front+backend for Ollama servers

This app provides a starter frontend for Ollama servers that provide a REST API interface.  Contains chat history and the ability to customize Modelfile settings for creating personas.

<small>(Click below for a video preview)</small><br/>
<a href="https://www.youtube.com/watch?v=vVfMWTNXFLo" target="_blank" rel="noopener noreferrer"><img src="https://img.youtube.com/vi/vVfMWTNXFLo/0.jpg" alt="[Sample video]" /></a>

# Installation

## Requirements:

- Ollama installation accessible via HTTP(S).
- This repo, configured.

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
  - Node 22+, which includes corepack
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
- `yarn start` - Run the built files. This assumes you previously ran `yarn build`. Currently, vite just serves a dev instance. I will circle back to this and make express serve the bundle for local validation purposes.

## Known issues

- Not profitable

## TODO

- Add more functionality offered by the Ollama API.

## References:

- [Ollama docker image](https://hub.docker.com/r/ollama/ollama)
- [Ollama Library (of LLMs)](https://ollama.com/library)
- [Yarn Workspaces](https://yarnpkg.com/features/workspaces)
