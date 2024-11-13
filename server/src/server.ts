/**
 * Main server entry point
 */
import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
app.use(cors());
app.use(express.json({ inflate: true, type: "application/json" }));

const PORT = process.env.VITE_API_PORT || 3001; // Express server port

/**
 * Default
 */
app.get("/", (req, res) => {
  res.json({ data: "Hello Universe!1" });
});

/**
 * Endpoint to list available models
 * GET /list-models
 * @returns {JSON} - List of models
 */
app.get("/list-models", async (req, res) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const result = await response.json();
    const models = result.models.map((model: any) =>
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
 * POST /chat
 * @param {string} body.query - Chat query
 * @param {string} body.model - Selected model on the backend
 * @param {number} body.temperature - LLM temperature (default .7)
 * @param {boolean} body.stream - Stream response?
 */
app.post("/chat", async (req, res) => {
  const { query, model, temperature, stream } = req.body;
  console.log({ apiUrl: process.env.OLLAMA_API_URL });
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2", // or the specific model you want to use
        messages: [{ role: "user", content: query }],
        temperature: temperature || 0.7, // Default temperature
        stream: stream || false, // Default to non-streaming
      }),
    });

    if (!response.ok) {
      throw new Error("API response failed");
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("Error communicating with Ollama: ", error);
    res.status(500).json({ error: "Failed to get response from Ollama" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
