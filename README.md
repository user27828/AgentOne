# AgentOne

Vite/React frontend for Ollama

Install Ollama docker image:

- `docker pull ollama/ollama`
- Run the container
  - CPU-only: `docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama`
  - Nvidia GPUs: `docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama`
- docker exec -it ollama ollama run llama3.2
- Choose and run a model: `docker exec -it ollama ollama run llama3.2`
- _optional_ Verify list of available models: http://localhost:11434/api/tags (Host and port may vary)

<p>Different models can be chosen from this list: (Ollama Library)[https://ollama.com/library]</p>

References:
(Ollama docker image)[https://hub.docker.com/r/ollama/ollama]
