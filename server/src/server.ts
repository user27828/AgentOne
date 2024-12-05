/**
 * Main server entry point
 */
import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import FineTune from "./routes/finetune";
import FileMan from "./routes/fileman";
import { has } from "lodash";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PORT = process.env.VITE_API_PORT || 3001; // Express server port
export const uploadPath = "uploads/";
export const docrootPath = path.join(__dirname, "..", "..");
export const projectsPath = path.join(docrootPath, ".projects");
export const ollamaModelDir = "/root/.ollama/models"; // Docker
export const ollamaManifestDir = `${ollamaModelDir}/manifests/registry.ollama.ai/library/`; // Docker
export const ollamaBlobDir = `${ollamaModelDir}/blobs`; // Docker
export const ollamaContainerName = "ollama";
export const ollamaModelPathTmpl = `${ollamaBlobDir}/%MODEL%`; // Docker
export const ollamaFtDestinationTmpl = `${ollamaModelDir}/%MODEL%-finetuned`;

const app = express();
app.use(cors());
app.use(express.json({ inflate: true, type: "application/json" }));

app.use("/fileman", FileMan);
app.use("/finetune", FineTune);

/**
 * Default
 */
app.get("/", (req, res) => {
  res.json({ data: "Hello Universe!1" });
});

/**
 * Endpoint to list available models
 * @returns {JSON} - List of models
 */
app.get("/list-models", async (req, res) => {
  try {
    const response = await axios.get(`${process.env.OLLAMA_API_URL}/api/tags`, {
      headers: { "Content-Type": "application/json" },
    });
    const models = response.data.models.map((model: any) =>
      model.name.replace(":latest", ""),
    );
    res.json(models);
  } catch (error) {
    console.error("Error listing models:", error);
    res.status(500).json({ error: "Failed to list models" });
  }
});

/**
 * Main chat endpoint
 *
 * @param {string} req.body.query - Chat query
 * @param {string} req.body.model - Selected model on the backend
 * @param {number} req.body.temperature - LLM temperature (default .7)
 * @param {boolean} req.body.stream - Stream response?
 * @param {string} req.body.sessionUid - Session UID to return to user
 * @param {string} req.body.chatUid - Chat UID to return to user
 * @param {string} req.body.system - System message (overrides Modelfile, if exists)
 */
app.post("/chat", async (req, res) => {
  const {
    query,
    model,
    temperature,
    stream,
    sessionUid = "",
    chatUid = "",
    system = null,
  } = req.body;
  console.debug({ userQuery: query, model, temperature, stream, system });
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: query }],
        temperature: temperature || 0.7, // Default temperature
        stream: stream || false, // Default to non-streaming
        system,
      }),
    });

    if (!response.ok) {
      throw new Error("API response failed");
    }

    console.log("POST: /chat res:", { response });
    if (stream) {
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "X-Session-Uid": sessionUid,
          "X-Chat-Uid": chatUid,
        });
        const streamResponse = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
          }
          res.end();
        };
        streamResponse();
      }
    } else {
      const result = await response.json();
      res.json({ ...result, sessionUid, chatUid });
    }
  } catch (error) {
    console.error("Error communicating with Ollama: ", error);
    res.set({
      "X-Session-Uid": sessionUid,
      "X-Chat-Uid": chatUid,
    });
    res.status(500).json({ error: "Failed to get response from Ollama" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
