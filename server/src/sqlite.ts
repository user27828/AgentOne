import Database from "better-sqlite3";
import path from "path";
//import { projectsPath } from "./server";

const dbPath = path.join(
  path.join(__dirname, "..", "..", ".user-data"),
  "AgentOne.db",
);

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL"); // For better concurrency

// Schema
// -Chat history - sessions
db.prepare(
  `CREATE TABLE IF NOT EXISTS sessions 
    (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, name TEXT, model TEXT, 
      temperature FLOAT DEFAULT 0.7, createdAt DATETIME, updatedAt DATETIME, 
      modelFileId TEXT, templateId TEXT, isArchive INTEGER DEFAULT 0, jsonMeta TEXT)`,
).run();

// -Chat history - chats
db.prepare(
  `CREATE TABLE IF NOT EXISTS chats 
    (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, sessionId INTEGER, 
      query TEXT, reply TEXT, role TEXT, createdAt DATETIME, jsonMeta TEXT)`,
).run();

// -Chat FTS virtual table
// SELECT * FROM chats WHERE id IN (SELECT id FROM chats_fts WHERE chats_fts MATCH 'what did you say about my dog?!');
// or
// SELECT sessions.*, chats.*
// FROM chats
// INNER JOIN sessions ON chats.sessionId = sessions.id
// WHERE chats.id IN (SELECT id FROM chats_fts WHERE chats_fts MATCH 'what did you say about my dog?!');
db.prepare(
  `CREATE VIRTUAL TABLE IF NOT EXISTS chats_fts USING fts5(
  id,
  query,
  reply,
  content='chats',
  content_rowid='id'
)`,
).run();

// -Modelfiles
db.prepare(
  `CREATE TABLE IF NOT EXISTS modelfiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE,
    baseModel TEXT,
    name TEXT,
    content TEXT,
    isArchive INTEGER DEFAULT 0,
    createdAt DATETIME,
    updatedAt DATETIME,
    archivedAt DATETIME
  )`,
).run();

// -Projects:
db.prepare(
  `CREATE TABLE IF NOT EXISTS projects 
    (id TEXT PRIMARY KEY, name TEXT, description TEXT, models TEXT, createdAt DATETIME, status TEXT)`,
).run();

// -Files:
db.prepare(
  `CREATE TABLE IF NOT EXISTS files 
  (id TEXT PRIMARY KEY, projectId TEXT, name TEXT, description TEXT, originalName TEXT, 
    path TEXT, type TEXT, models TEXT, ext TEXT, size BIGINT,createdAt DATETIME)`,
).run();

// -Jobs:
db.prepare(
  `CREATE TABLE IF NOT EXISTS jobs 
    (id TEXT PRIMARY KEY, projectId TEXT, model TEXT, createdAt DATETIME, 
    lastUpdateAt DATETIME, finishedAt DATETIME, status TEXT, percentage NUMERIC)`,
).run();
