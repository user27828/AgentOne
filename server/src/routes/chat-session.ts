/**
 * Chat session endpoints:
 * /session
 */
import { Router, Request, Response } from "express";
import slugid from "slugid";
import { db } from "../sqlite";

const router = Router();

type ChatIdRow = {
  id: number;
  uid?: string;
};

type SessionRow = {
  id: number;
  jsonMeta: string | null;
};

const deleteFtsChat = db.prepare(
  "DELETE FROM chats_fts WHERE rowid = ? OR id = ?",
);
const deleteChatById = db.prepare("DELETE FROM chats WHERE id = ?");
const countChatsForSession = db.prepare(
  "SELECT COUNT(*) AS total FROM chats WHERE sessionId = ?",
);
const deleteSessionById = db.prepare("DELETE FROM sessions WHERE id = ?");
const deleteSessionMemoryBySessionId = db.prepare(
  "DELETE FROM session_memory WHERE sessionId = ?",
);
const updateSessionJsonMetaById = db.prepare(
  "UPDATE sessions SET jsonMeta = ?, updatedAt = ? WHERE id = ?",
);

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  try {
    if (typeof value === "string" && value) {
      const parsedValue = JSON.parse(value) as unknown;

      return parsedValue &&
        typeof parsedValue === "object" &&
        !Array.isArray(parsedValue)
        ? (parsedValue as Record<string, unknown>)
        : {};
    }

    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const buildManualSessionTitleJsonMeta = (
  existingJsonMeta: unknown,
): string | null => {
  const nextMeta = parseJsonObject(existingJsonMeta);
  nextMeta.titleMeta = {
    source: "manual",
    firstChatUid: null,
  };

  return Object.keys(nextMeta).length ? JSON.stringify(nextMeta) : null;
};

const pruneForgottenChatUids = (
  jsonMeta: unknown,
  deletedChatUids: string[],
): string | null => {
  if (!deletedChatUids.length) {
    return typeof jsonMeta === "string" ? jsonMeta : null;
  }

  const nextMeta = parseJsonObject(jsonMeta);
  const rawMemoryControls = nextMeta.memoryControls;

  if (
    !rawMemoryControls ||
    typeof rawMemoryControls !== "object" ||
    Array.isArray(rawMemoryControls)
  ) {
    return Object.keys(nextMeta).length ? JSON.stringify(nextMeta) : null;
  }

  const deletedChatUidSet = new Set(deletedChatUids);
  const currentForgottenChatUids = Array.isArray(
    (rawMemoryControls as { forgottenChatUids?: unknown }).forgottenChatUids,
  )
    ? (
        (rawMemoryControls as { forgottenChatUids?: unknown })
          .forgottenChatUids as unknown[]
      )
        .map((uid) => String(uid || "").trim())
        .filter(Boolean)
    : [];
  const nextForgottenChatUids = currentForgottenChatUids.filter(
    (uid) => !deletedChatUidSet.has(uid),
  );
  const currentPinnedFacts = Array.isArray(
    (rawMemoryControls as { pinnedFacts?: unknown }).pinnedFacts,
  )
    ? (
        (rawMemoryControls as { pinnedFacts?: unknown })
          .pinnedFacts as unknown[]
      )
        .map((fact) => String(fact || "").trim())
        .filter(Boolean)
    : [];

  if (currentPinnedFacts.length || nextForgottenChatUids.length) {
    nextMeta.memoryControls = {
      ...rawMemoryControls,
      pinnedFacts: currentPinnedFacts,
      forgottenChatUids: nextForgottenChatUids,
    };
  } else {
    delete nextMeta.memoryControls;
  }

  return Object.keys(nextMeta).length ? JSON.stringify(nextMeta) : null;
};

const deleteChatRows = (chatRows: ChatIdRow[]) => {
  for (const { id } of chatRows) {
    deleteFtsChat.run(id, id);
    deleteChatById.run(id);
  }
};

//- Helper Functions
//------------------------------------------------------------------------------

//- Endpoints
//------------------------------------------------------------------------------
/**
 * Get a list of chat sessions and their metadata
 * @param {boolean} req.params.archive - 0 or 1 - Show archived sessions
 */
const listSessions = (req: Request, res: Response) => {
  const isArchive = req.params.archive === "archive" ? 1 : 0;
  try {
    const sessions = db
      .prepare(
        `SELECT s.*, COUNT(c.id) AS totalChats
      FROM sessions s
      LEFT JOIN chats c ON s.id = c.sessionId
      WHERE s.isArchive = ?
      GROUP BY s.id
      HAVING COUNT(c.id) > 0
      ORDER BY s.updatedAt ASC, s.id ASC`,
      )
      .all(isArchive);

    res.json(sessions);
  } catch (error) {
    console.error("Error getting sessions:", error);
    res.status(500).json({ error: "Failed to get sessions" });
  }
};

router.get("/list", listSessions);
router.get("/list/:archive", listSessions);

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
  const nextJsonMeta = name
    ? buildManualSessionTitleJsonMeta(jsonMeta)
    : jsonMeta;

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
        nextJsonMeta,
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
      ? db
          .prepare(
            "SELECT * FROM chats WHERE sessionId = ? ORDER BY createdAt ASC, id ASC",
          )
          .all(session.id)
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
    const nextJsonMeta = name
      ? buildManualSessionTitleJsonMeta(
          jsonMeta !== undefined ? jsonMeta : session.jsonMeta,
        )
      : jsonMeta;

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
    if (name || jsonMeta) {
      updateFields.push("jsonMeta = ?");
      updateValues.push(nextJsonMeta);
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
    const session = db
      .prepare("SELECT id, jsonMeta FROM sessions WHERE uid = ?")
      .get(sessionUid) as SessionRow | undefined;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const chatRows = db
      .prepare("SELECT id FROM chats WHERE sessionId = ?")
      .all(session.id) as ChatIdRow[];

    const deleteSession = db.transaction(() => {
      deleteChatRows(chatRows);
      deleteSessionMemoryBySessionId.run(session.id);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    });

    deleteSession();
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
    const session = db
      .prepare("SELECT id, jsonMeta FROM sessions WHERE uid = ?")
      .get(sessionUid) as SessionRow | undefined;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const placeholders = chatIdsToDelete.map(() => "?").join(", ");
    const chatRows = db
      .prepare(
        `SELECT id, uid FROM chats WHERE sessionId = ? AND uid IN (${placeholders})`,
      )
      .all(session.id, ...chatIdsToDelete) as ChatIdRow[];

    let deletedSession = false;

    const deleteChats = db.transaction(() => {
      deleteChatRows(chatRows);
      deleteSessionMemoryBySessionId.run(session.id);

      if (chatRows.length) {
        updateSessionJsonMetaById.run(
          pruneForgottenChatUids(
            session.jsonMeta,
            chatRows.map((chatRow) => chatRow.uid || "").filter(Boolean),
          ),
          new Date().toISOString(),
          session.id,
        );
      }

      const remainingChats = countChatsForSession.get(session.id) as {
        total: number;
      };

      if (remainingChats.total === 0) {
        deleteSessionById.run(session.id);
        deletedSession = true;
      }
    });

    deleteChats();

    return res.json({
      message: `Deleted ${chatRows.length} chats`,
      deletedSession,
    });
  } catch (error) {
    console.error("Error deleting chats:", error);
    res.status(500).json({ error: "Failed to delete chats" });
  }
});

export default router;
