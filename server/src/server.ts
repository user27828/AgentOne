/**
 * Main server entry point
 */
import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { get, has, last } from "lodash";
import slugid from "slugid";
import cors from "cors";
//import FineTune from "./routes/finetune";
//import FileMan from "./routes/fileman";
import ChatSessions from "./routes/chat-session";
import Modelfile from "./routes/modelfile";
import { db } from "./sqlite";

dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

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

//app.use("/fileman", FileMan);
//app.use("/finetune", FineTune);
app.use("/session", ChatSessions);
app.use("/modelfile", Modelfile);

const getMeaningfulText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

//- Helper Functions
//------------------------------------------------------------------------------
/**
 * Save the chat message pair (query and reply)
 * @param {object} param0.request - Contents of /chat request.
 *  Note that this is NOT the express.Request object
 * @param {object} param0.response - Response from the bot, but not the
 *  express.Response object
 */
const saveChatMessage = async ({
  request,
  response,
}: {
  request: any;
  response: any;
}) => {
  try {
    const {
      sessionUid = "",
      chatUid = "",
      query,
      model,
      temperature = null,
      ...rest
    } = request;
    const hasChoices = has(response, ["choices", 0, "message", "content"]);
    const reply = hasChoices
      ? get(response, ["choices", 0, "message", "content"])
      : get(response, "message.content", "");
    const role = hasChoices
      ? get(response, ["choices", 0, "message", "role"])
      : get(response, "message.role", "assistant");
    const createdAt = new Date().toISOString();
    const trimmedQuery = getMeaningfulText(query);
    const trimmedReply = getMeaningfulText(reply);

    if (!trimmedQuery || !trimmedReply || !sessionUid) {
      return;
    }

    // Ensure session exists, create if not
    let session = sessionUid
      ? db.prepare("SELECT * FROM sessions WHERE uid = ?").get(sessionUid)
      : {};
    console.debug({ request, sessionUid, queriedSession: session });
    if (!session) {
      // Create new session if it doesn't exist - basic information only
      const uid = slugid.nice();
      const insertResult = db
        .prepare(
          `INSERT INTO sessions (uid, name, model, temperature, createdAt, updatedAt) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uid,
          `Chat on ${new Date(createdAt).toLocaleString()}`,
          model,
          temperature,
          createdAt,
          createdAt,
        );
      const sessionId = insertResult.lastInsertRowid; // Get new id of session
      session = db
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .get(sessionId);
    } else {
      db.prepare(
        "UPDATE sessions SET model = ?, temperature = ?, updatedAt = ? WHERE uid = ?",
      ).run(model, temperature, createdAt, sessionUid);
    }

    const insertChat = db.prepare(
      `INSERT INTO chats (uid, sessionId, query, reply, role, createdAt, jsonMeta) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const chatInsertResult = insertChat.run(
      chatUid ? chatUid : slugid.nice(),
      get(session, "id", null),
      trimmedQuery,
      trimmedReply,
      role,
      createdAt,
      JSON.stringify(rest),
    );

    // Update chats_fts virtual table
    const insertFTS = db.prepare(
      `INSERT INTO chats_fts (rowid, id, query, reply) VALUES (?, ?, ?, ?)`,
    );
    insertFTS.run(
      chatInsertResult.lastInsertRowid,
      chatInsertResult.lastInsertRowid,
      trimmedQuery,
      trimmedReply,
    );
  } catch (error) {
    console.error("Error saving chat message:", error);
  }
};

//- Endpoints
//------------------------------------------------------------------------------
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
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/tags`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Ollama tags request failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    const models = (data.models || []).map((model) =>
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
 * This also handles storage of chats in history
 * @param {string} req.body.query - Chat query
 * @param {string} req.body.model - Selected model on the backend
 * @param {number} req.body.temperature - LLM temperature (default .7)
 * @param {boolean} req.body.stream - Stream response?
 * @param {string} [req.body.sessionUid] - Session UID to return to user
 * @param {string} [req.body.chatUid] - Chat UID to return to user
 * @param {string} [req.body.system] - System message (overrides Modelfile, if exists)
 * @returns {mixed} - Object of results, or ReadableStream
 */
app.post("/chat", async (req: Request, res: Response): Promise<void> => {
  const {
    query,
    model,
    temperature,
    stream,
    sessionUid = "",
    chatUid = "",
    system = null,
  } = req.body;
  const trimmedQuery = getMeaningfulText(query);
  const trimmedModel = getMeaningfulText(model);
  const resolvedSessionUid = sessionUid || slugid.nice();
  const resolvedChatUid = chatUid || slugid.nice();

  if (!trimmedQuery) {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  if (!trimmedModel) {
    res.status(400).json({ error: "Model is required" });
    return;
  }

  console.debug({
    userQuery: trimmedQuery,
    model: trimmedModel,
    temperature,
    stream,
    system,
  });
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: trimmedModel,
        messages: [{ role: "user", content: trimmedQuery }],
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
        let fullContent = "";
        let _streamResult = {}; // Keep track of results, and use the last one for destructuring

        res.writeHead(200, {
          "Content-Type": "text/plain",
          "X-Session-Uid": resolvedSessionUid,
          "X-Chat-Uid": resolvedChatUid,
        });

        const streamResponse = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // saveChatMessage be here, otherwise awaiting streamResponse() would be blocking
              saveChatMessage({
                request: {
                  ...req.body,
                  query: trimmedQuery,
                  model: trimmedModel,
                  sessionUid: resolvedSessionUid,
                  chatUid: resolvedChatUid,
                },
                response: {
                  ..._streamResult,
                  message: null,
                  choices: [
                    { message: { content: fullContent, role: "assistant" } },
                  ],
                },
              });
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            const chunkData = chunk
              .split("\n")
              .filter((line) => line.trim() !== "")
              .map((line) => JSON.parse(line));
            _streamResult = last(chunkData);
            for (const data of chunkData) {
              const hasChoices = has(data, ["choices", 0, "delta", "content"]);
              fullContent += hasChoices
                ? data.choices[0].delta.content
                : data.message.content;
            }
            res.write(chunk);
          }
          res.end();
        };
        streamResponse();
      } else {
        throw new Error("Missing response body for streaming request");
      }
    } else {
      const result = await response.json();
      saveChatMessage({
        request: {
          ...req.body,
          query: trimmedQuery,
          model: trimmedModel,
          sessionUid: resolvedSessionUid,
          chatUid: resolvedChatUid,
        },
        response: result,
      });
      res.set({
        "X-Session-Uid": resolvedSessionUid,
        "X-Chat-Uid": resolvedChatUid,
      });
      res.json({
        ...result,
        sessionUid: resolvedSessionUid,
        chatUid: resolvedChatUid,
      });
    }
  } catch (error) {
    console.error("Error communicating with Ollama: ", error);
    res.set({
      "X-Session-Uid": resolvedSessionUid,
      "X-Chat-Uid": resolvedChatUid,
    });
    res.status(500).json({ error: "Failed to get response from Ollama" });
  }
});

//- Startup
//------------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Express server is running on http://localhost:${PORT}`);
});
