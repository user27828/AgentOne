/**
 * Chat session endpoints:
 * /session
 */
import { Router, Request, Response } from "express";
import slugid from "slugid";
import { db } from "../sqlite";

const router = Router();

//- Helper Functions
//------------------------------------------------------------------------------

//- Endpoints
//------------------------------------------------------------------------------
/**
 * Get a list of chat sessions and their metadata
 * @param {boolean} req.params.archive - 0 or 1 - Show archived sessions
 */
router.get("/list/:archive?", (req, res) => {
  const isArchive = req.params.archive === "archive" ? 1 : 0;
  try {
    const sessions = db
      .prepare(
        `SELECT s.*, COUNT(c.id) AS totalChats
      FROM sessions s
      LEFT JOIN chats c ON s.id = c.sessionId
      WHERE s.isArchive = ?
      GROUP BY s.id`,
      )
      .all(isArchive);

    res.json(sessions);
  } catch (error) {
    console.error("Error getting sessions:", error);
    res.status(500).json({ error: "Failed to get sessions" });
  }
});

/**
 * Create a new chat session
 * @param {string} req.body.name - Session name
 * @param {string} req.body.model
 * @param {number} req.body.temperature
 * @param {integer} [req.body.modelFileId]
 * @param {integer} [req.body.templateId]
 * @param {JSON} [req.body.jsonMeta]
 */
router.post("/", (req, res) => {
  const {
    name,
    model,
    temperature = null,
    modelFileId = null,
    templateId = null,
    jsonMeta = null,
  } = req.body;
  const uid = slugid.nice(); // Generate a new UID

  const createdAt = new Date().toISOString();

  try {
    const insertResult = db
      .prepare(
        `INSERT INTO sessions (uid, name, model, temperature, createdAt, updatedAt, modelFileId, templateId, jsonMeta) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uid,
        name,
        model,
        temperature,
        createdAt,
        createdAt,
        modelFileId,
        templateId,
        jsonMeta,
      );

    const newSession = db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(insertResult.lastInsertRowid);
    res.status(201).json(newSession); // 201 Created
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/**
 * Get full session data, including associated chats
 * @param {string} req.params.sessionUid - Session UID
 * @returns {object} {sessions: <session>, chats: <chats>}
 */
router.get("/:sessionUid", (req: Request, res: Response): any => {
  const sessionUid = req.params.sessionUid;
  try {
    const session: any = db
      .prepare("SELECT * FROM sessions WHERE uid = ?")
      .get(sessionUid);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const chats = session.id
      ? db.prepare("SELECT * FROM chats WHERE sessionId = ?").all(session.id)
      : [];
    res.json({ session, chats });
  } catch (error) {
    console.error("Error getting session details:", error);
    res.status(500).json({ error: "Failed to get session details" });
  }
});

/**
 * Rename or alter session data
 * @param {string} req.params.sessionUid
 * @param {string} [req.body.name]
 * @param {string} [req.body.model]
 * @param {number} [req.body.temperature]
 * @param {integer} [req.body.modelFileId]
 * @param {integer} [req.body.templateId]
 * @param {integer} [req.body.isArchive]
 * @param {JSON} [req.body.jsonMeta]
 */
router.put("/:sessionUid", (req: Request, res: Response): any => {
  const sessionUid = req.params.sessionUid;
  const {
    name,
    model,
    temperature,
    modelFileId,
    templateId,
    isArchive,
    jsonMeta,
  } = req.body;

  try {
    const session: any = db
      .prepare("SELECT * FROM sessions WHERE uid = ?")
      .get(sessionUid);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    let updateFields = [];
    let updateValues = [];

    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    if (model) {
      updateFields.push("model = ?");
      updateValues.push(model);
    }
    if (temperature !== undefined) {
      updateFields.push("temperature = ?");
      updateValues.push(temperature);
    } // Check for undefined
    if (modelFileId) {
      updateFields.push("modelFileId = ?");
      updateValues.push(modelFileId);
    }
    if (templateId) {
      updateFields.push("templateId = ?");
      updateValues.push(templateId);
    }
    if (isArchive !== undefined) {
      updateFields.push("isArchive = ?");
      updateValues.push(isArchive);
    } // Check for undefined
    if (jsonMeta) {
      updateFields.push("jsonMeta = ?");
      updateValues.push(jsonMeta);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update provided" });
    }
    updateFields.push("updatedAt = ?");
    updateValues.push(new Date().toISOString());
    updateValues.push(session.id);

    const updateStatement = `UPDATE sessions SET ${updateFields.join(", ")} WHERE id = ?`;
    const result = db.prepare(updateStatement).run(...updateValues);
    if (result.changes > 0) {
      const updatedSession = db
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .get(session.id);
      return res.json(updatedSession);
    } else {
      return res.status(404).json({ error: "Session not updated." });
    }
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({ error: "Failed to update session" });
  }
});

/**
 * Delete a session
 * @param {string} req.params.sessionUid
 */
router.delete("/:sessionUid", (req, res): any => {
  const sessionUid = req.params.sessionUid;
  try {
    db.prepare("DELETE FROM chats WHERE sessionId = ?").run(sessionUid);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionUid);
    return res.json({ message: "Session and associated chats deleted" });
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

/**
 * Delete a specific chat
 * @param {string} req.params.sessionUid
 */
router.post("/:sessionUid/chat/delete", (req, res): any => {
  const sessionUid = req.params.sessionUid;
  const chatIdsToDelete = req.body.chatIds; // Array of chat IDs
  console.log({ sessionUid, chatIdsToDelete });
  if (!Array.isArray(chatIdsToDelete) || chatIdsToDelete.length === 0) {
    return res
      .status(400)
      .json({ error: "Invalid chatIds provided. Must be a non-empty array." });
  }

  try {
    const { id: sessionId } = db
      .prepare("SELECT id FROM sessions WHERE uid = ?")
      .get(sessionUid) as any;
    if (sessionId) {
      const deleteStmt = db.prepare(
        "DELETE FROM chats WHERE sessionId = ? AND uid = ?",
      );
      let deletedCount = 0;
      for (const chatId of chatIdsToDelete) {
        const result = deleteStmt.run(sessionId, chatId);
        deletedCount += result.changes;
      }
      return res.json({ message: `Deleted ${deletedCount} chats` });
    } else {
      return res.json({ error: "Session not found" });
    }
  } catch (error) {
    console.error("Error deleting chats:", error);
    res.status(500).json({ error: "Failed to delete chats" });
  }
});

export default router;
