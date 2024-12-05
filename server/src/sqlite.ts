import Database from "better-sqlite3";
import path from "path";
//import { projectsPath } from "./server";

const dbPath = path.join(
  path.join(__dirname, "..", "..", ".projects"),
  "database.db",
);

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL"); // For better concurrency

// Schema
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
