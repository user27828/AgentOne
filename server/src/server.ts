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
app.use(
  cors({
    exposedHeaders: ["X-Session-Uid", "X-Chat-Uid"],
  }),
);
app.use(express.json({ inflate: true, type: "application/json" }));

//app.use("/fileman", FileMan);
//app.use("/finetune", FineTune);
app.use("/session", ChatSessions);
app.use("/modelfile", Modelfile);

const getMeaningfulText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

type StoredChatRow = {
  id: number;
  uid: string;
  query: string | null;
  reply: string | null;
  createdAt: string | null;
};

type SessionRow = {
  id: number;
  uid: string;
  name: string;
  updatedAt: string | null;
  jsonMeta: string | null;
};

type SessionTitleSource = "placeholder" | "heuristic" | "llm" | "manual";

type SessionTitleState = {
  source: SessionTitleSource;
  firstChatUid: string | null;
};

type InitialSessionTitleSource = "placeholder" | "heuristic";

type InitialSessionTitle = {
  sessionTitle: string;
  sessionTitleSource: InitialSessionTitleSource;
  isInitialSessionTitle: true;
};

type OllamaChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatMemorySettings = {
  verbatimHistoryChats: number;
  verbatimHistoryTokens: number;
  summaryTokens: number;
  summaryQueryTokens: number;
  summaryReplyTokens: number;
};

type SessionMemoryControls = {
  pinnedFacts: string[];
  forgottenChatUids: string[];
};

type PersistedSummaryEntry = {
  chatId: number;
  query: string;
  reply: string;
  baseTokenEstimate: number;
};

type SessionMemoryRow = {
  jsonState: string | null;
  updatedAt: string | null;
};

type SessionMemoryState = {
  summaryEntries: PersistedSummaryEntry[];
  summarizedThroughChatId: number;
  tokenEstimatorScale: number;
  tokenEstimatorObservations: number;
  lastPromptEvalCount: number | null;
  lastPromptEstimatedTokens: number | null;
  updatedAt: string | null;
};

type ChatMemoryRuntime = {
  promptBaseTokenEstimate: number;
  promptTokenEstimate: number;
};

type MemoryPromptMessage = {
  role: "user" | "assistant";
  content: string;
  estimatedTokens: number;
};

type RetrievedChatMatch = {
  chatId: number;
  chatUid: string;
  createdAt: string | null;
  query: string;
  reply: string;
  totalTokens: number;
  score: number;
};

type PromptBuildResult = {
  messages: OllamaChatMessage[];
  messageDiagnostics: MemoryPromptMessage[];
  summary: string;
  tokenEstimatorScale: number;
  chatMemoryContext: ChatMemoryContext;
};

type ConversationSummaryResult = {
  summary: string;
  visibleEntries: PersistedSummaryEntry[];
  omittedChats: number;
  estimatedTokens: number;
};

type ChatMemoryContext = {
  sessionId: number | null;
  controls: SessionMemoryControls;
  allChats: StoredChatRow[];
  storedChats: StoredChatRow[];
  recentChats: StoredChatRow[];
  olderChats: StoredChatRow[];
  retrievedChats: RetrievedChatMatch[];
  retrievedEstimatedTokens: number;
  sessionMemoryState: SessionMemoryState;
  summaryResult: ConversationSummaryResult;
  tokenEstimatorScale: number;
};

type ChatMemorySnapshot = {
  version: number;
  sessionUid: string;
  sessionFound: boolean;
  settings: ChatMemorySettings;
  controls: SessionMemoryControls;
  rawStoredChatCount: number;
  storedChatCount: number;
  forgottenChatCount: number;
  recentChatCount: number;
  olderChatCount: number;
  omittedOlderChatCount: number;
  visibleSummaryEntryCount: number;
  retrievedChatCount: number;
  summary: string;
  summaryEstimatedTokens: number;
  verbatimEstimatedTokens: number;
  retrievalEstimatedTokens: number;
  tokenEstimatorScale: number;
  tokenEstimatorObservations: number;
  lastPromptEvalCount: number | null;
  lastPromptEstimatedTokens: number | null;
  updatedAt: string | null;
  systemPrompt: string | null;
  promptBaseTokenEstimate: number;
  promptTokenEstimate: number;
  messages: MemoryPromptMessage[];
  recentChats: Array<{
    chatId: number;
    chatUid: string;
    createdAt: string | null;
    query: string;
    reply: string;
    queryTokens: number;
    replyTokens: number;
    totalTokens: number;
  }>;
  visibleSummaryEntries: Array<{
    chatId: number;
    query: string;
    reply: string;
    totalTokens: number;
  }>;
  retrievedChats: RetrievedChatMatch[];
};

type ChatMemoryDiagnostics = {
  sessionUid: string;
  sessionFound: boolean;
  settings: ChatMemorySettings;
  controls: SessionMemoryControls;
  rawStoredChatCount: number;
  storedChatCount: number;
  forgottenChatCount: number;
  recentChatCount: number;
  olderChatCount: number;
  omittedOlderChatCount: number;
  persistedSummaryEntryCount: number;
  visibleSummaryEntryCount: number;
  pinnedFactCount: number;
  pinnedFacts: string[];
  retrievedChatCount: number;
  summary: string;
  summaryEstimatedTokens: number;
  verbatimEstimatedTokens: number;
  retrievalEstimatedTokens: number;
  storedSummaryEstimatedTokens: number;
  tokenEstimatorScale: number;
  tokenEstimatorObservations: number;
  lastPromptEvalCount: number | null;
  lastPromptEstimatedTokens: number | null;
  updatedAt: string | null;
  recentChats: Array<{
    chatId: number;
    createdAt: string | null;
    query: string;
    reply: string;
    queryTokens: number;
    replyTokens: number;
    totalTokens: number;
  }>;
  visibleSummaryEntries: Array<{
    chatId: number;
    query: string;
    reply: string;
    totalTokens: number;
  }>;
  retrievedChats: RetrievedChatMatch[];
};

const LEGACY_CHARS_PER_TOKEN = 4;
const MEMORY_SNAPSHOT_VERSION = 1;
const TOKENS_PER_MESSAGE_OVERHEAD = 4;
const TOKENS_PER_SYSTEM_PROMPT_OVERHEAD = 6;
const TOKEN_ESTIMATOR_MIN_SCALE = 0.5;
const TOKEN_ESTIMATOR_MAX_SCALE = 2.5;
const TOKEN_ESTIMATOR_WEIGHT_LIMIT = 10;
const MAX_VERBATIM_HISTORY_CHATS = 8;
const MAX_VERBATIM_HISTORY_TOKENS = 3000;
const MAX_SUMMARY_TOKENS = 1000;
const MAX_SUMMARY_QUERY_TOKENS = 60;
const MAX_SUMMARY_REPLY_TOKENS = 90;
const MAX_PINNED_FACTS = 12;
const MAX_PINNED_FACT_TOKENS = 80;
const MAX_RETRIEVAL_QUERY_TERMS = 8;
const MAX_RETRIEVAL_CANDIDATES = 12;
const MAX_RETRIEVED_CHATS = 3;
const MAX_RETRIEVED_QUERY_TOKENS = 80;
const MAX_RETRIEVED_REPLY_TOKENS = 120;
const MAX_RETRIEVED_CONTEXT_TOKENS = 500;
const MAX_SESSION_TITLE_LENGTH = 72;
const MAX_AUTO_SESSION_TITLE_WORDS = 8;
const SESSION_TITLE_GENERATION_QUERY_TOKENS = 80;
const SESSION_TITLE_GENERATION_REPLY_TOKENS = 120;
const SESSION_TITLE_GENERATION_TIMEOUT_MS = 4000;
const SESSION_TITLE_PLACEHOLDER = "New chat";
const LEGACY_AUTO_SESSION_TITLE_PREFIX = "Chat on ";

const SESSION_TITLE_SOURCES = new Set<SessionTitleSource>([
  "placeholder",
  "heuristic",
  "llm",
  "manual",
]);

const GENERIC_SESSION_TITLES = new Set([
  "chat",
  "conversation",
  "help",
  "new chat",
  "question",
  "test",
  "untitled",
]);

const RETRIEVAL_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "from",
  "have",
  "into",
  "just",
  "more",
  "that",
  "their",
  "them",
  "then",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

const DEFAULT_CHAT_MEMORY_SETTINGS: ChatMemorySettings = {
  verbatimHistoryChats: MAX_VERBATIM_HISTORY_CHATS,
  verbatimHistoryTokens: MAX_VERBATIM_HISTORY_TOKENS,
  summaryTokens: MAX_SUMMARY_TOKENS,
  summaryQueryTokens: MAX_SUMMARY_QUERY_TOKENS,
  summaryReplyTokens: MAX_SUMMARY_REPLY_TOKENS,
};

const DEFAULT_SESSION_MEMORY_CONTROLS: SessionMemoryControls = {
  pinnedFacts: [],
  forgottenChatUids: [],
};

const createDefaultSessionMemoryState = (): SessionMemoryState => ({
  summaryEntries: [],
  summarizedThroughChatId: 0,
  tokenEstimatorScale: 1,
  tokenEstimatorObservations: 0,
  lastPromptEvalCount: null,
  lastPromptEstimatedTokens: null,
  updatedAt: null,
});

const getSessionByUid = db.prepare("SELECT * FROM sessions WHERE uid = ?");
const getSessionById = db.prepare("SELECT * FROM sessions WHERE id = ?");
const countChatsForSessionId = db.prepare(
  "SELECT COUNT(*) AS total FROM chats WHERE sessionId = ?",
);
const getChatsForPrompt = db.prepare(
  `SELECT id, uid, query, reply, createdAt
    FROM chats
    WHERE sessionId = ?
    ORDER BY createdAt ASC, id ASC`,
);
const getChatsForPromptAfterId = db.prepare(
  `SELECT id, uid, query, reply, createdAt
    FROM chats
    WHERE sessionId = ? AND id > ?
    ORDER BY createdAt ASC, id ASC`,
);
const getChatUidForSession = db.prepare(
  "SELECT id, uid FROM chats WHERE sessionId = ? AND uid = ?",
);
const getSessionMemoryBySessionId = db.prepare(
  "SELECT jsonState, updatedAt FROM session_memory WHERE sessionId = ?",
);
const upsertSessionMemoryBySessionId = db.prepare(
  `INSERT INTO session_memory (sessionId, jsonState, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET
      jsonState = excluded.jsonState,
      updatedAt = excluded.updatedAt`,
);
const updateSessionJsonMetaById = db.prepare(
  "UPDATE sessions SET jsonMeta = ?, updatedAt = ? WHERE id = ?",
);
const updateSessionTitleById = db.prepare(
  "UPDATE sessions SET name = ?, jsonMeta = ?, updatedAt = ? WHERE id = ?",
);
const updateSessionTitleByIdIfUpdatedAt = db.prepare(
  "UPDATE sessions SET name = ?, jsonMeta = ?, updatedAt = ? WHERE id = ? AND updatedAt = ?",
);
const deleteSessionMemoryBySessionId = db.prepare(
  "DELETE FROM session_memory WHERE sessionId = ?",
);
const searchChatsForMemoryRecall = db.prepare(
  `SELECT c.id, c.uid, c.query, c.reply, c.createdAt, bm25(chats_fts) AS rank
    FROM chats_fts
    INNER JOIN chats c ON c.id = chats_fts.rowid
    WHERE c.sessionId = ? AND chats_fts MATCH ?
    ORDER BY rank
    LIMIT ?`,
);

const normalizePromptText = (value: unknown): string =>
  getMeaningfulText(value).replace(/\s+/g, " ").trim();

const clampNumber = (
  value: number,
  minValue: number,
  maxValue: number,
): number => Math.min(Math.max(value, minValue), maxValue);

const toFiniteNumber = (value: unknown): number | null => {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
};

const toBoundedInteger = (
  value: unknown,
  fallback: number,
  maxValue: number,
): number => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return fallback;
  }

  return Math.min(Math.max(0, Math.floor(numericValue)), maxValue);
};

const parseOptionalNonNegativeInteger = (value: unknown): number | null => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return null;
  }

  return Math.max(0, Math.floor(numericValue));
};

const clampTokenEstimatorScale = (value: number): number =>
  clampNumber(value, TOKEN_ESTIMATOR_MIN_SCALE, TOKEN_ESTIMATOR_MAX_SCALE);

const resolveTokenBudget = (
  tokenValue: unknown,
  legacyCharValue: unknown,
  fallback: number,
  maxValue: number,
): number => {
  const parsedTokenValue = toFiniteNumber(tokenValue);

  if (parsedTokenValue !== null) {
    return Math.min(Math.max(0, Math.floor(parsedTokenValue)), maxValue);
  }

  const parsedLegacyChars = toFiniteNumber(legacyCharValue);

  if (parsedLegacyChars !== null) {
    return Math.min(
      Math.max(0, Math.floor(parsedLegacyChars / LEGACY_CHARS_PER_TOKEN)),
      maxValue,
    );
  }

  return fallback;
};

const resolveChatMemorySettings = (value: unknown): ChatMemorySettings => {
  const settings = value && typeof value === "object" ? value : {};

  return {
    verbatimHistoryChats: toBoundedInteger(
      get(settings, "verbatimHistoryChats", null),
      DEFAULT_CHAT_MEMORY_SETTINGS.verbatimHistoryChats,
      MAX_VERBATIM_HISTORY_CHATS,
    ),
    verbatimHistoryTokens: resolveTokenBudget(
      get(settings, "verbatimHistoryTokens", null),
      get(settings, "verbatimHistoryChars", null),
      DEFAULT_CHAT_MEMORY_SETTINGS.verbatimHistoryTokens,
      MAX_VERBATIM_HISTORY_TOKENS,
    ),
    summaryTokens: resolveTokenBudget(
      get(settings, "summaryTokens", null),
      get(settings, "summaryChars", null),
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryTokens,
      MAX_SUMMARY_TOKENS,
    ),
    summaryQueryTokens: resolveTokenBudget(
      get(settings, "summaryQueryTokens", null),
      get(settings, "summaryQueryChars", null),
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryQueryTokens,
      MAX_SUMMARY_QUERY_TOKENS,
    ),
    summaryReplyTokens: resolveTokenBudget(
      get(settings, "summaryReplyTokens", null),
      get(settings, "summaryReplyChars", null),
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryReplyTokens,
      MAX_SUMMARY_REPLY_TOKENS,
    ),
  };
};

const estimateBaseTextTokens = (value: unknown): number => {
  const text = normalizePromptText(value);

  if (!text) {
    return 0;
  }

  const byteLength = Buffer.byteLength(text, "utf8");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const punctuationCount = (text.match(/[^\w\s]/g) || []).length;

  return (
    Math.max(1, Math.ceil(byteLength / 4), wordCount) +
    Math.ceil(punctuationCount / 6)
  );
};

const scaleTokenEstimate = (
  baseTokens: number,
  tokenEstimatorScale: number,
): number => {
  if (baseTokens <= 0) {
    return 0;
  }

  return Math.max(
    1,
    Math.ceil(baseTokens * clampTokenEstimatorScale(tokenEstimatorScale)),
  );
};

const estimateTextTokens = (
  value: unknown,
  tokenEstimatorScale: number,
): number =>
  scaleTokenEstimate(estimateBaseTextTokens(value), tokenEstimatorScale);

const estimateMessageTokens = (
  value: unknown,
  tokenEstimatorScale: number,
): number => {
  const contentTokens = estimateTextTokens(value, tokenEstimatorScale);

  return contentTokens > 0 ? contentTokens + TOKENS_PER_MESSAGE_OVERHEAD : 0;
};

const estimatePromptTokens = (
  messages: OllamaChatMessage[],
  systemPrompt: string | null,
  tokenEstimatorScale: number,
): number => {
  const messageTokens = messages.reduce(
    (total, message) =>
      total + estimateMessageTokens(message.content, tokenEstimatorScale),
    0,
  );

  if (!systemPrompt) {
    return messageTokens;
  }

  return (
    messageTokens +
    estimateTextTokens(systemPrompt, tokenEstimatorScale) +
    TOKENS_PER_SYSTEM_PROMPT_OVERHEAD
  );
};

const truncateTextToTokenBudget = (
  value: unknown,
  maxTokens: number,
  tokenEstimatorScale: number,
): string => {
  const text = normalizePromptText(value);

  if (!text || maxTokens <= 0) {
    return "";
  }

  if (estimateTextTokens(text, tokenEstimatorScale) <= maxTokens) {
    return text;
  }

  let low = 0;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const prefix = text.slice(0, mid).trimEnd();
    const candidate = prefix && mid < text.length ? `${prefix}...` : prefix;

    if (
      candidate &&
      estimateTextTokens(candidate, tokenEstimatorScale) <= maxTokens
    ) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
};

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

const parseSessionTitleState = (
  sessionName: unknown,
  jsonMeta: unknown,
): SessionTitleState => {
  const rawTitleMeta = get(parseJsonObject(jsonMeta), "titleMeta", {});
  const source = getMeaningfulText(get(rawTitleMeta, "source", ""));
  const firstChatUid = getMeaningfulText(get(rawTitleMeta, "firstChatUid", ""));

  if (SESSION_TITLE_SOURCES.has(source as SessionTitleSource)) {
    return {
      source: source as SessionTitleSource,
      firstChatUid: firstChatUid || null,
    };
  }

  const trimmedSessionName = getMeaningfulText(sessionName);

  if (
    !trimmedSessionName ||
    trimmedSessionName === SESSION_TITLE_PLACEHOLDER ||
    trimmedSessionName.startsWith(LEGACY_AUTO_SESSION_TITLE_PREFIX)
  ) {
    return {
      source: "placeholder",
      firstChatUid: null,
    };
  }

  return {
    source: "manual",
    firstChatUid: null,
  };
};

const buildJsonMetaWithTitleState = (
  existingJsonMeta: unknown,
  titleState: SessionTitleState,
): string | null => {
  const nextMeta = parseJsonObject(existingJsonMeta);
  nextMeta.titleMeta = titleState;

  return Object.keys(nextMeta).length ? JSON.stringify(nextMeta) : null;
};

const normalizeSessionTitleText = (value: unknown): string =>
  normalizePromptText(value)
    .replace(/^title\s*:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[-:*#>\s]+/, "")
    .replace(/[\s\-:;,.!?]+$/g, "")
    .trim();

const truncateSessionTitle = (value: string): string => {
  if (value.length <= MAX_SESSION_TITLE_LENGTH) {
    return value;
  }

  const truncatedValue = value.slice(0, MAX_SESSION_TITLE_LENGTH).trimEnd();
  const lastWhitespaceIndex = truncatedValue.lastIndexOf(" ");

  return lastWhitespaceIndex >= Math.floor(MAX_SESSION_TITLE_LENGTH * 0.6)
    ? truncatedValue.slice(0, lastWhitespaceIndex).trimEnd()
    : truncatedValue;
};

const truncateSessionTitleWords = (value: string, maxWords: number): string => {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return value;
  }

  return words.slice(0, maxWords).join(" ");
};

const normalizeSessionTitle = (value: unknown): string => {
  const normalizedTitle = truncateSessionTitle(
    normalizeSessionTitleText(value),
  );

  if (!normalizedTitle) {
    return "";
  }

  return normalizedTitle[0].toUpperCase() + normalizedTitle.slice(1);
};

const normalizeAutoSessionTitle = (value: unknown): string =>
  normalizeSessionTitle(
    truncateSessionTitleWords(
      normalizeSessionTitleText(value),
      MAX_AUTO_SESSION_TITLE_WORDS,
    ),
  );

const isGenericSessionTitle = (value: string): boolean => {
  const normalizedTitle = value.toLowerCase();

  return (
    normalizedTitle.length < 4 ||
    GENERIC_SESSION_TITLES.has(normalizedTitle) ||
    /^(hello|hey|hi|please help|need help|question)$/i.test(normalizedTitle)
  );
};

const extractTitleCandidate = (value: unknown): string => {
  const normalizedText = normalizePromptText(value)
    .replace(/`{1,3}[^`]+`{1,3}/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const firstLine = normalizedText.split(/\r?\n/)[0] || "";
  const firstSentence = firstLine.split(/[.?!]/)[0] || firstLine;
  const strippedCandidate = firstSentence.replace(
    /^(please\s+)?(can you|could you|would you|will you|help me(?: with)?|i need help(?: with)?|i need|i want|show me|tell me|explain|debug|fix|write|create|make)\s+/i,
    "",
  );
  const normalizedCandidate = normalizeSessionTitle(
    strippedCandidate || firstSentence,
  );

  return normalizedCandidate;
};

const buildHeuristicSessionTitle = (query: string, reply: string): string => {
  const queryCandidate = extractTitleCandidate(query);

  if (queryCandidate && !isGenericSessionTitle(queryCandidate)) {
    return normalizeAutoSessionTitle(queryCandidate);
  }

  const replyCandidate = extractTitleCandidate(reply);

  if (replyCandidate && !isGenericSessionTitle(replyCandidate)) {
    return normalizeAutoSessionTitle(replyCandidate);
  }

  return (
    normalizeAutoSessionTitle(query) ||
    normalizeAutoSessionTitle(reply) ||
    SESSION_TITLE_PLACEHOLDER
  );
};

const updateSessionTitle = ({
  session,
  title,
  titleState,
  expectedUpdatedAt = null,
}: {
  session: SessionRow;
  title: string;
  titleState: SessionTitleState;
  expectedUpdatedAt?: string | null;
}): SessionRow => {
  const normalizedTitle = normalizeSessionTitle(title);

  if (!normalizedTitle) {
    return session;
  }

  const updatedAt = new Date().toISOString();
  const nextJsonMeta = buildJsonMetaWithTitleState(
    session.jsonMeta,
    titleState,
  );
  const result = expectedUpdatedAt
    ? updateSessionTitleByIdIfUpdatedAt.run(
        normalizedTitle,
        nextJsonMeta,
        updatedAt,
        session.id,
        expectedUpdatedAt,
      )
    : updateSessionTitleById.run(
        normalizedTitle,
        nextJsonMeta,
        updatedAt,
        session.id,
      );

  return result.changes > 0
    ? {
        ...session,
        name: normalizedTitle,
        updatedAt,
        jsonMeta: nextJsonMeta,
      }
    : session;
};

const normalizeInitialSessionTitle = (
  value: unknown,
): InitialSessionTitle | null => {
  const sessionTitle = normalizeAutoSessionTitle(
    get(value, "sessionTitle", ""),
  );
  const sessionTitleSource = getMeaningfulText(
    get(value, "sessionTitleSource", ""),
  );

  if (
    !sessionTitle ||
    (sessionTitleSource !== "placeholder" && sessionTitleSource !== "heuristic")
  ) {
    return null;
  }

  return {
    sessionTitle,
    sessionTitleSource,
    isInitialSessionTitle: true,
  };
};

const buildImmediateSessionTitle = (
  query: string,
  reply: string,
): InitialSessionTitle => {
  const sessionTitle = buildHeuristicSessionTitle(query, reply);

  return {
    sessionTitle,
    sessionTitleSource:
      sessionTitle === SESSION_TITLE_PLACEHOLDER ? "placeholder" : "heuristic",
    isInitialSessionTitle: true,
  };
};

const resolveInitialSessionTitle = ({
  sessionUid,
  query,
  reply,
}: {
  sessionUid: string;
  query: string;
  reply: string;
}): InitialSessionTitle | null => {
  const session = sessionUid
    ? (getSessionByUid.get(sessionUid) as SessionRow | undefined)
    : undefined;

  if (session) {
    const totalChats = Number(
      get(countChatsForSessionId.get(session.id), "total", 0),
    );

    if (totalChats > 0) {
      return null;
    }

    const titleState = parseSessionTitleState(session.name, session.jsonMeta);

    if (titleState.source === "manual") {
      return null;
    }
  }

  return buildImmediateSessionTitle(query, reply);
};

const buildChatResponseMetadata = ({
  sessionUid,
  chatUid,
  initialSessionTitle,
}: {
  sessionUid: string;
  chatUid: string;
  initialSessionTitle: InitialSessionTitle | null;
}) => ({
  sessionUid,
  chatUid,
  ...(initialSessionTitle || {}),
});

const buildStreamChatResponseMetadataChunk = (metadata: {
  sessionUid: string;
  chatUid: string;
  sessionTitle?: string;
  sessionTitleSource?: string;
  isInitialSessionTitle?: boolean;
}): string | null =>
  metadata.isInitialSessionTitle
    ? `${JSON.stringify({
        agentOneMeta: {
          kind: "chat-response-meta",
          ...metadata,
        },
      })}\n`
    : null;

const parseAssistantResponseMessage = (
  value: unknown,
): { reply: string; role: string } => {
  const hasChoices = has(value, ["choices", 0, "message", "content"]);
  const reply = getMeaningfulText(
    hasChoices
      ? get(value, ["choices", 0, "message", "content"], "")
      : get(value, "message.content", ""),
  );
  const role = getMeaningfulText(
    hasChoices
      ? get(value, ["choices", 0, "message", "role"], "assistant")
      : get(value, "message.role", "assistant"),
  );

  return {
    reply,
    role: role || "assistant",
  };
};

const normalizePinnedFact = (value: unknown): string =>
  truncateTextToTokenBudget(
    normalizePromptText(value),
    MAX_PINNED_FACT_TOKENS,
    1,
  );

const toUniqueNormalizedStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of value) {
    const normalizedItem = getMeaningfulText(item);

    if (!normalizedItem) {
      continue;
    }

    const key = normalizedItem.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(normalizedItem);
  }

  return results;
};

const sanitizeSessionMemoryControls = (
  value: unknown,
): SessionMemoryControls => {
  const rawControls = value && typeof value === "object" ? value : {};
  const pinnedFacts = toUniqueNormalizedStrings(
    get(rawControls, "pinnedFacts", []),
  )
    .map((fact) => normalizePinnedFact(fact))
    .filter(Boolean)
    .slice(0, MAX_PINNED_FACTS);
  const forgottenChatUids = toUniqueNormalizedStrings(
    get(rawControls, "forgottenChatUids", []),
  );

  return {
    pinnedFacts,
    forgottenChatUids,
  };
};

const parseSessionMemoryControls = (value: unknown): SessionMemoryControls =>
  sanitizeSessionMemoryControls(
    get(parseJsonObject(value), "memoryControls", {}),
  );

const buildSessionJsonMeta = (
  existingJsonMeta: unknown,
  controls: SessionMemoryControls,
): string | null => {
  const nextMeta = parseJsonObject(existingJsonMeta);

  if (controls.pinnedFacts.length || controls.forgottenChatUids.length) {
    nextMeta.memoryControls = controls;
  } else {
    delete nextMeta.memoryControls;
  }

  return Object.keys(nextMeta).length ? JSON.stringify(nextMeta) : null;
};

const persistSessionMemoryControls = (
  session: SessionRow,
  nextControls: SessionMemoryControls,
): SessionMemoryControls => {
  const sanitizedControls = sanitizeSessionMemoryControls(nextControls);
  const updatedAt = new Date().toISOString();

  updateSessionJsonMetaById.run(
    buildSessionJsonMeta(session.jsonMeta, sanitizedControls),
    updatedAt,
    session.id,
  );

  return sanitizedControls;
};

const buildSummaryEntryText = (query: string, reply: string): string => {
  const lines = [`- User: ${query || "(empty)"}`];

  if (reply) {
    lines.push(`  Assistant: ${reply}`);
  }

  return lines.join("\n");
};

const buildOmissionNotice = (omittedChats: number): string =>
  `- ${omittedChats} earlier exchange(s) omitted from the rolling summary.`;

const buildRetrievedChatText = (query: string, reply: string): string => {
  const lines = [`- Earlier user: ${query || "(empty)"}`];

  if (reply) {
    lines.push(`  Earlier assistant: ${reply}`);
  }

  return lines.join("\n");
};

const buildPinnedFactsText = (pinnedFacts: string[]): string => {
  if (!pinnedFacts.length) {
    return "";
  }

  return [
    "Pinned facts to preserve across the conversation:",
    ...pinnedFacts.map((fact) => `- ${fact}`),
  ].join("\n");
};

const buildRetrievedContextText = (
  retrievedChats: RetrievedChatMatch[],
): string => {
  if (!retrievedChats.length) {
    return "";
  }

  return [
    "Potentially relevant earlier exchanges:",
    ...retrievedChats.map((chat) =>
      buildRetrievedChatText(chat.query, chat.reply),
    ),
    "Use these recalled exchanges only when they are relevant to the user's latest request.",
  ].join("\n");
};

const buildRetrievalTerms = (value: unknown): string[] => {
  const terms = normalizePromptText(value)
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g);

  if (!terms) {
    return [];
  }

  const uniqueTerms: string[] = [];

  for (const term of terms) {
    if (RETRIEVAL_STOPWORDS.has(term) || uniqueTerms.includes(term)) {
      continue;
    }

    uniqueTerms.push(term);

    if (uniqueTerms.length >= MAX_RETRIEVAL_QUERY_TERMS) {
      break;
    }
  }

  return uniqueTerms;
};

const filterStoredChatsForMemory = (
  chats: StoredChatRow[],
  controls: SessionMemoryControls,
): StoredChatRow[] => {
  if (!controls.forgottenChatUids.length) {
    return chats;
  }

  const forgottenChatUidSet = new Set(controls.forgottenChatUids);

  return chats.filter((chat) => !forgottenChatUidSet.has(chat.uid));
};

const parseSessionMemoryState = (value: unknown): SessionMemoryState => {
  try {
    const parsedValue =
      typeof value === "string" && value
        ? JSON.parse(value)
        : value && typeof value === "object"
          ? value
          : {};
    const rawSummaryEntries = Array.isArray(
      get(parsedValue, "summaryEntries", []),
    )
      ? (get(parsedValue, "summaryEntries", []) as unknown[])
      : [];
    const summaryEntries = rawSummaryEntries
      .map((entry): PersistedSummaryEntry | null => {
        const chatId = parseOptionalNonNegativeInteger(
          get(entry, "chatId", null),
        );
        const query = normalizePromptText(get(entry, "query", ""));
        const reply = normalizePromptText(get(entry, "reply", ""));
        const baseTokenEstimate = parseOptionalNonNegativeInteger(
          get(entry, "baseTokenEstimate", null),
        );

        if (chatId === null || (!query && !reply)) {
          return null;
        }

        return {
          chatId,
          query,
          reply,
          baseTokenEstimate:
            baseTokenEstimate ??
            estimateBaseTextTokens(buildSummaryEntryText(query, reply)),
        };
      })
      .filter((entry): entry is PersistedSummaryEntry => entry !== null)
      .sort((left, right) => left.chatId - right.chatId);
    const defaultState = createDefaultSessionMemoryState();
    const lastSummaryEntry = summaryEntries[summaryEntries.length - 1];
    const lastSummaryChatId = lastSummaryEntry ? lastSummaryEntry.chatId : 0;

    return {
      summaryEntries,
      summarizedThroughChatId: Math.max(
        toBoundedInteger(
          get(parsedValue, "summarizedThroughChatId", lastSummaryChatId),
          lastSummaryChatId,
          Number.MAX_SAFE_INTEGER,
        ),
        lastSummaryChatId,
      ),
      tokenEstimatorScale: clampTokenEstimatorScale(
        toFiniteNumber(get(parsedValue, "tokenEstimatorScale", 1)) ??
          defaultState.tokenEstimatorScale,
      ),
      tokenEstimatorObservations: toBoundedInteger(
        get(parsedValue, "tokenEstimatorObservations", 0),
        defaultState.tokenEstimatorObservations,
        Number.MAX_SAFE_INTEGER,
      ),
      lastPromptEvalCount: parseOptionalNonNegativeInteger(
        get(parsedValue, "lastPromptEvalCount", null),
      ),
      lastPromptEstimatedTokens: parseOptionalNonNegativeInteger(
        get(parsedValue, "lastPromptEstimatedTokens", null),
      ),
      updatedAt: getMeaningfulText(get(parsedValue, "updatedAt", "")) || null,
    };
  } catch {
    return createDefaultSessionMemoryState();
  }
};

const loadSessionMemoryState = (sessionId: number): SessionMemoryState => {
  const sessionMemoryRow = getSessionMemoryBySessionId.get(sessionId) as
    | SessionMemoryRow
    | undefined;

  return parseSessionMemoryState(sessionMemoryRow?.jsonState ?? null);
};

const estimateStoredSummaryTokens = (
  summaryEntries: PersistedSummaryEntry[],
  tokenEstimatorScale: number,
): number =>
  summaryEntries.reduce(
    (total, entry) =>
      total + scaleTokenEstimate(entry.baseTokenEstimate, tokenEstimatorScale),
    0,
  );

const estimateStoredChatTokens = (
  chat: Pick<StoredChatRow, "query" | "reply">,
  tokenEstimatorScale: number,
): number =>
  estimateMessageTokens(chat.query, tokenEstimatorScale) +
  estimateMessageTokens(chat.reply, tokenEstimatorScale);

const trimSessionMemoryState = (
  state: SessionMemoryState,
  tokenEstimatorScale: number,
): SessionMemoryState => {
  const nextSummaryEntries = [...state.summaryEntries];

  while (
    nextSummaryEntries.length > 0 &&
    estimateStoredSummaryTokens(nextSummaryEntries, tokenEstimatorScale) >
      MAX_SUMMARY_TOKENS
  ) {
    nextSummaryEntries.shift();
  }

  return nextSummaryEntries.length === state.summaryEntries.length
    ? state
    : { ...state, summaryEntries: nextSummaryEntries };
};

const createRebuildSeedState = (
  previousState: SessionMemoryState,
): SessionMemoryState => ({
  ...createDefaultSessionMemoryState(),
  tokenEstimatorScale: previousState.tokenEstimatorScale,
  tokenEstimatorObservations: previousState.tokenEstimatorObservations,
  lastPromptEvalCount: previousState.lastPromptEvalCount,
  lastPromptEstimatedTokens: previousState.lastPromptEstimatedTokens,
});

const persistSessionMemoryState = (
  sessionId: number,
  state: SessionMemoryState,
): SessionMemoryState => {
  const updatedState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  upsertSessionMemoryBySessionId.run(
    sessionId,
    JSON.stringify(updatedState),
    updatedState.updatedAt,
  );

  return updatedState;
};

const rebuildSessionMemoryState = (
  sessionId: number,
  chats: StoredChatRow[],
): SessionMemoryState => {
  const previousState = loadSessionMemoryState(sessionId);
  let nextState = appendChatsToSessionMemoryState(
    createRebuildSeedState(previousState),
    chats,
  );

  nextState = trimSessionMemoryState(nextState, nextState.tokenEstimatorScale);

  return persistSessionMemoryState(sessionId, nextState);
};

const createPersistedSummaryEntry = (
  chat: StoredChatRow,
  tokenEstimatorScale: number,
): PersistedSummaryEntry | null => {
  const query = truncateTextToTokenBudget(
    chat.query,
    MAX_SUMMARY_QUERY_TOKENS,
    tokenEstimatorScale,
  );
  const reply = truncateTextToTokenBudget(
    chat.reply,
    MAX_SUMMARY_REPLY_TOKENS,
    tokenEstimatorScale,
  );

  if (!query && !reply) {
    return null;
  }

  return {
    chatId: chat.id,
    query,
    reply,
    baseTokenEstimate: estimateBaseTextTokens(
      buildSummaryEntryText(query, reply),
    ),
  };
};

const appendChatsToSessionMemoryState = (
  state: SessionMemoryState,
  chats: StoredChatRow[],
): SessionMemoryState => {
  let nextState = trimSessionMemoryState(state, state.tokenEstimatorScale);

  for (const chat of chats) {
    if (chat.id <= nextState.summarizedThroughChatId) {
      continue;
    }

    const summaryEntry = createPersistedSummaryEntry(
      chat,
      nextState.tokenEstimatorScale,
    );

    nextState = {
      ...nextState,
      summarizedThroughChatId: chat.id,
      summaryEntries: summaryEntry
        ? [...nextState.summaryEntries, summaryEntry]
        : nextState.summaryEntries,
    };
    nextState = trimSessionMemoryState(
      nextState,
      nextState.tokenEstimatorScale,
    );
  }

  return nextState;
};

const syncSessionMemoryState = (
  sessionId: number,
  chats: StoredChatRow[],
): SessionMemoryState => {
  const existingState = loadSessionMemoryState(sessionId);
  const nextState = appendChatsToSessionMemoryState(existingState, chats);

  return JSON.stringify(existingState) === JSON.stringify(nextState)
    ? nextState
    : persistSessionMemoryState(sessionId, nextState);
};

const selectRetrievedChats = (
  sessionId: number,
  query: string,
  olderChats: StoredChatRow[],
  tokenEstimatorScale: number,
): RetrievedChatMatch[] => {
  if (!olderChats.length) {
    return [];
  }

  const retrievalTerms = buildRetrievalTerms(query);

  if (!retrievalTerms.length) {
    return [];
  }

  const candidateChatIds = new Set(olderChats.map((chat) => chat.id));
  const matchQuery = retrievalTerms.map((term) => `${term}*`).join(" OR ");

  try {
    const matches = searchChatsForMemoryRecall.all(
      sessionId,
      matchQuery,
      MAX_RETRIEVAL_CANDIDATES,
    ) as Array<StoredChatRow & { rank: number | null }>;
    const selectedChats: RetrievedChatMatch[] = [];
    let accumulatedTokens = 0;

    for (const match of matches) {
      if (!candidateChatIds.has(match.id)) {
        continue;
      }

      const truncatedQuery = truncateTextToTokenBudget(
        match.query,
        MAX_RETRIEVED_QUERY_TOKENS,
        tokenEstimatorScale,
      );
      const truncatedReply = truncateTextToTokenBudget(
        match.reply,
        MAX_RETRIEVED_REPLY_TOKENS,
        tokenEstimatorScale,
      );

      if (!truncatedQuery && !truncatedReply) {
        continue;
      }

      const totalTokens = estimateStoredChatTokens(
        { query: truncatedQuery, reply: truncatedReply },
        tokenEstimatorScale,
      );
      const wouldExceedBudget =
        accumulatedTokens + totalTokens > MAX_RETRIEVED_CONTEXT_TOKENS;

      if (
        selectedChats.length > 0 &&
        (selectedChats.length >= MAX_RETRIEVED_CHATS || wouldExceedBudget)
      ) {
        break;
      }

      selectedChats.push({
        chatId: match.id,
        chatUid: match.uid,
        createdAt: match.createdAt,
        query: truncatedQuery,
        reply: truncatedReply,
        totalTokens,
        score: Number(match.rank ?? 0),
      });
      accumulatedTokens += totalTokens;
    }

    return selectedChats;
  } catch (error) {
    console.error("Error selecting retrieved chats:", error);
    return [];
  }
};

const buildConversationSummary = (
  olderChats: StoredChatRow[],
  state: SessionMemoryState,
  settings: ChatMemorySettings,
): ConversationSummaryResult => {
  if (
    !olderChats.length ||
    settings.summaryTokens <= 0 ||
    (settings.summaryQueryTokens <= 0 && settings.summaryReplyTokens <= 0)
  ) {
    return {
      summary: "",
      visibleEntries: [],
      omittedChats: 0,
      estimatedTokens: 0,
    };
  }

  const olderChatIds = new Set(olderChats.map((chat) => chat.id));
  const visibleEntries = state.summaryEntries.filter((entry) =>
    olderChatIds.has(entry.chatId),
  );
  const omittedChats = Math.max(olderChats.length - visibleEntries.length, 0);
  let remainingTokens = settings.summaryTokens;
  const summaryLines: string[] = [];
  const includedEntries: PersistedSummaryEntry[] = [];

  if (omittedChats > 0) {
    const omissionNotice = buildOmissionNotice(omittedChats);
    const omissionTokens = estimateTextTokens(
      omissionNotice,
      state.tokenEstimatorScale,
    );

    if (omissionTokens > remainingTokens) {
      const summary = truncateTextToTokenBudget(
        omissionNotice,
        remainingTokens,
        state.tokenEstimatorScale,
      );

      return {
        summary,
        visibleEntries: [],
        omittedChats,
        estimatedTokens: estimateTextTokens(summary, state.tokenEstimatorScale),
      };
    }

    summaryLines.push(omissionNotice);
    remainingTokens -= omissionTokens;
  }

  for (const entry of visibleEntries) {
    const query = truncateTextToTokenBudget(
      entry.query,
      settings.summaryQueryTokens,
      state.tokenEstimatorScale,
    );
    const reply = truncateTextToTokenBudget(
      entry.reply,
      settings.summaryReplyTokens,
      state.tokenEstimatorScale,
    );

    if (!query && !reply) {
      continue;
    }

    const summaryLine = buildSummaryEntryText(query, reply);
    const visibleEntry: PersistedSummaryEntry = {
      chatId: entry.chatId,
      query,
      reply,
      baseTokenEstimate: estimateBaseTextTokens(summaryLine),
    };
    const summaryLineTokens = estimateTextTokens(
      summaryLine,
      state.tokenEstimatorScale,
    );

    if (summaryLineTokens > remainingTokens) {
      const compactLine = truncateTextToTokenBudget(
        summaryLine,
        remainingTokens,
        state.tokenEstimatorScale,
      );

      if (compactLine) {
        summaryLines.push(compactLine);
      }

      break;
    }

    summaryLines.push(summaryLine);
    includedEntries.push(visibleEntry);
    remainingTokens -= summaryLineTokens;

    if (remainingTokens <= 0) {
      break;
    }
  }

  const summary = summaryLines.join("\n");

  return {
    summary,
    visibleEntries: includedEntries,
    omittedChats,
    estimatedTokens: estimateTextTokens(summary, state.tokenEstimatorScale),
  };
};

const buildSystemPrompt = (
  baseSystem: unknown,
  summary: string,
  pinnedFacts: string[],
  retrievedChats: RetrievedChatMatch[],
): string | null => {
  const systemParts = [getMeaningfulText(baseSystem)];
  const pinnedFactsText = buildPinnedFactsText(pinnedFacts);
  const retrievedContextText = buildRetrievedContextText(retrievedChats);

  if (pinnedFactsText) {
    systemParts.push(pinnedFactsText);
  }

  if (summary) {
    systemParts.push(
      [
        "Earlier conversation context:",
        summary,
        "Use this as background context. If any detail conflicts with the most recent verbatim turns or the user's latest instruction, prefer the newer instruction.",
      ].join("\n"),
    );
  }

  if (retrievedContextText) {
    systemParts.push(retrievedContextText);
  }

  const mergedSystem = systemParts.filter(Boolean).join("\n\n");

  return mergedSystem || null;
};

const selectRecentChats = (
  chats: StoredChatRow[],
  settings: ChatMemorySettings,
  tokenEstimatorScale: number,
): StoredChatRow[] => {
  if (
    settings.verbatimHistoryChats <= 0 ||
    settings.verbatimHistoryTokens <= 0
  ) {
    return [];
  }

  const selectedChats: StoredChatRow[] = [];
  let accumulatedTokens = 0;

  for (let index = chats.length - 1; index >= 0; index -= 1) {
    const chat = chats[index];
    const chatTokens =
      estimateMessageTokens(chat.query, tokenEstimatorScale) +
      estimateMessageTokens(chat.reply, tokenEstimatorScale);
    const wouldExceedBudget =
      accumulatedTokens + chatTokens > settings.verbatimHistoryTokens;

    if (
      selectedChats.length > 0 &&
      (selectedChats.length >= settings.verbatimHistoryChats ||
        wouldExceedBudget)
    ) {
      break;
    }

    selectedChats.unshift(chat);
    accumulatedTokens += chatTokens;
  }

  return selectedChats;
};

const buildChatMemoryContext = (
  sessionUid: string,
  settings: ChatMemorySettings,
  query: string,
): ChatMemoryContext => {
  const session = sessionUid
    ? (getSessionByUid.get(sessionUid) as SessionRow | undefined)
    : undefined;

  if (!session) {
    return {
      sessionId: null,
      controls: DEFAULT_SESSION_MEMORY_CONTROLS,
      allChats: [],
      storedChats: [],
      recentChats: [],
      olderChats: [],
      retrievedChats: [],
      retrievedEstimatedTokens: 0,
      sessionMemoryState: createDefaultSessionMemoryState(),
      summaryResult: {
        summary: "",
        visibleEntries: [],
        omittedChats: 0,
        estimatedTokens: 0,
      },
      tokenEstimatorScale: 1,
    };
  }

  const controls = parseSessionMemoryControls(session.jsonMeta);
  const allChats = getChatsForPrompt.all(session.id) as StoredChatRow[];
  const storedChats = filterStoredChatsForMemory(allChats, controls);
  const sessionMemoryState = syncSessionMemoryState(session.id, storedChats);
  const tokenEstimatorScale = sessionMemoryState.tokenEstimatorScale;
  const recentChats = selectRecentChats(
    storedChats,
    settings,
    tokenEstimatorScale,
  );
  const olderChats = storedChats.slice(
    0,
    Math.max(storedChats.length - recentChats.length, 0),
  );
  const summaryResult = buildConversationSummary(
    olderChats,
    sessionMemoryState,
    settings,
  );
  const retrievedChats = selectRetrievedChats(
    session.id,
    query,
    olderChats,
    tokenEstimatorScale,
  );

  return {
    sessionId: session.id,
    controls,
    allChats,
    storedChats,
    recentChats,
    olderChats,
    retrievedChats,
    retrievedEstimatedTokens: retrievedChats.reduce(
      (total, chat) => total + chat.totalTokens,
      0,
    ),
    sessionMemoryState,
    summaryResult,
    tokenEstimatorScale,
  };
};

const buildChatMemoryDiagnostics = (
  sessionUid: string,
  settings: ChatMemorySettings,
  query: string,
): ChatMemoryDiagnostics => {
  const context = buildChatMemoryContext(sessionUid, settings, query);
  const { sessionMemoryState, tokenEstimatorScale } = context;

  return {
    sessionUid,
    sessionFound: context.sessionId !== null,
    settings,
    controls: context.controls,
    rawStoredChatCount: context.allChats.length,
    storedChatCount: context.storedChats.length,
    forgottenChatCount: Math.max(
      context.allChats.length - context.storedChats.length,
      0,
    ),
    recentChatCount: context.recentChats.length,
    olderChatCount: context.olderChats.length,
    omittedOlderChatCount: context.summaryResult.omittedChats,
    persistedSummaryEntryCount: sessionMemoryState.summaryEntries.length,
    visibleSummaryEntryCount: context.summaryResult.visibleEntries.length,
    pinnedFactCount: context.controls.pinnedFacts.length,
    pinnedFacts: context.controls.pinnedFacts,
    retrievedChatCount: context.retrievedChats.length,
    summary: context.summaryResult.summary,
    summaryEstimatedTokens: context.summaryResult.estimatedTokens,
    verbatimEstimatedTokens: context.recentChats.reduce(
      (total, chat) =>
        total + estimateStoredChatTokens(chat, tokenEstimatorScale),
      0,
    ),
    retrievalEstimatedTokens: context.retrievedEstimatedTokens,
    storedSummaryEstimatedTokens: estimateStoredSummaryTokens(
      sessionMemoryState.summaryEntries,
      tokenEstimatorScale,
    ),
    tokenEstimatorScale,
    tokenEstimatorObservations: sessionMemoryState.tokenEstimatorObservations,
    lastPromptEvalCount: sessionMemoryState.lastPromptEvalCount,
    lastPromptEstimatedTokens: sessionMemoryState.lastPromptEstimatedTokens,
    updatedAt: sessionMemoryState.updatedAt,
    recentChats: context.recentChats.map((chat) => {
      const queryTokens = estimateMessageTokens(
        chat.query,
        tokenEstimatorScale,
      );
      const replyTokens = estimateMessageTokens(
        chat.reply,
        tokenEstimatorScale,
      );

      return {
        chatId: chat.id,
        createdAt: chat.createdAt,
        query: getMeaningfulText(chat.query),
        reply: getMeaningfulText(chat.reply),
        queryTokens,
        replyTokens,
        totalTokens: queryTokens + replyTokens,
      };
    }),
    visibleSummaryEntries: context.summaryResult.visibleEntries.map(
      (entry) => ({
        chatId: entry.chatId,
        query: entry.query,
        reply: entry.reply,
        totalTokens: scaleTokenEstimate(
          entry.baseTokenEstimate,
          tokenEstimatorScale,
        ),
      }),
    ),
    retrievedChats: context.retrievedChats,
  };
};

const buildChatMessages = (
  sessionUid: string,
  query: string,
  settings: ChatMemorySettings,
): PromptBuildResult => {
  const trimmedQuery = getMeaningfulText(query);
  const chatMemoryContext = buildChatMemoryContext(
    sessionUid,
    settings,
    trimmedQuery,
  );
  const messageDiagnostics: MemoryPromptMessage[] = [];

  if (!chatMemoryContext.sessionId) {
    const messages: OllamaChatMessage[] = trimmedQuery
      ? [{ role: "user", content: trimmedQuery }]
      : [];

    return {
      messages,
      messageDiagnostics: trimmedQuery
        ? [
            {
              role: "user",
              content: trimmedQuery,
              estimatedTokens: estimateMessageTokens(trimmedQuery, 1),
            },
          ]
        : [],
      summary: "",
      tokenEstimatorScale: 1,
      chatMemoryContext,
    };
  }

  const { recentChats, summaryResult, tokenEstimatorScale } = chatMemoryContext;
  const messages: OllamaChatMessage[] = [];

  for (const chat of recentChats) {
    const priorQuery = getMeaningfulText(chat.query);
    const priorReply = getMeaningfulText(chat.reply);

    if (priorQuery) {
      messages.push({ role: "user", content: priorQuery });
      messageDiagnostics.push({
        role: "user",
        content: priorQuery,
        estimatedTokens: estimateMessageTokens(priorQuery, tokenEstimatorScale),
      });
    }

    if (priorReply) {
      messages.push({ role: "assistant", content: priorReply });
      messageDiagnostics.push({
        role: "assistant",
        content: priorReply,
        estimatedTokens: estimateMessageTokens(priorReply, tokenEstimatorScale),
      });
    }
  }

  if (trimmedQuery) {
    messages.push({ role: "user", content: trimmedQuery });
    messageDiagnostics.push({
      role: "user",
      content: trimmedQuery,
      estimatedTokens: estimateMessageTokens(trimmedQuery, tokenEstimatorScale),
    });
  }

  return {
    messages,
    messageDiagnostics,
    summary: summaryResult.summary,
    tokenEstimatorScale,
    chatMemoryContext,
  };
};

const buildChatMemorySnapshot = ({
  sessionUid,
  settings,
  context,
  messages,
  systemPrompt,
  runtime,
}: {
  sessionUid: string;
  settings: ChatMemorySettings;
  context: ChatMemoryContext;
  messages: MemoryPromptMessage[];
  systemPrompt: string | null;
  runtime: ChatMemoryRuntime;
}): ChatMemorySnapshot => {
  const { sessionMemoryState, tokenEstimatorScale } = context;

  return {
    version: MEMORY_SNAPSHOT_VERSION,
    sessionUid,
    sessionFound: context.sessionId !== null,
    settings,
    controls: context.controls,
    rawStoredChatCount: context.allChats.length,
    storedChatCount: context.storedChats.length,
    forgottenChatCount: Math.max(
      context.allChats.length - context.storedChats.length,
      0,
    ),
    recentChatCount: context.recentChats.length,
    olderChatCount: context.olderChats.length,
    omittedOlderChatCount: context.summaryResult.omittedChats,
    visibleSummaryEntryCount: context.summaryResult.visibleEntries.length,
    retrievedChatCount: context.retrievedChats.length,
    summary: context.summaryResult.summary,
    summaryEstimatedTokens: context.summaryResult.estimatedTokens,
    verbatimEstimatedTokens: context.recentChats.reduce(
      (total, chat) =>
        total + estimateStoredChatTokens(chat, tokenEstimatorScale),
      0,
    ),
    retrievalEstimatedTokens: context.retrievedEstimatedTokens,
    tokenEstimatorScale,
    tokenEstimatorObservations: sessionMemoryState.tokenEstimatorObservations,
    lastPromptEvalCount: sessionMemoryState.lastPromptEvalCount,
    lastPromptEstimatedTokens: sessionMemoryState.lastPromptEstimatedTokens,
    updatedAt: sessionMemoryState.updatedAt,
    systemPrompt,
    promptBaseTokenEstimate: runtime.promptBaseTokenEstimate,
    promptTokenEstimate: runtime.promptTokenEstimate,
    messages,
    recentChats: context.recentChats.map((chat) => {
      const queryText = getMeaningfulText(chat.query);
      const replyText = getMeaningfulText(chat.reply);
      const queryTokens = estimateMessageTokens(queryText, tokenEstimatorScale);
      const replyTokens = estimateMessageTokens(replyText, tokenEstimatorScale);

      return {
        chatId: chat.id,
        chatUid: chat.uid,
        createdAt: chat.createdAt,
        query: queryText,
        reply: replyText,
        queryTokens,
        replyTokens,
        totalTokens: queryTokens + replyTokens,
      };
    }),
    visibleSummaryEntries: context.summaryResult.visibleEntries.map(
      (entry) => ({
        chatId: entry.chatId,
        query: entry.query,
        reply: entry.reply,
        totalTokens: scaleTokenEstimate(
          entry.baseTokenEstimate,
          tokenEstimatorScale,
        ),
      }),
    ),
    retrievedChats: context.retrievedChats,
  };
};

const calibrateTokenEstimator = (
  state: SessionMemoryState,
  runtime: ChatMemoryRuntime | null,
  promptEvalCount: number | null,
): SessionMemoryState => {
  if (!runtime || !promptEvalCount || runtime.promptBaseTokenEstimate <= 0) {
    return state;
  }

  const observedScale = clampTokenEstimatorScale(
    promptEvalCount / runtime.promptBaseTokenEstimate,
  );
  const currentScale = clampTokenEstimatorScale(state.tokenEstimatorScale);
  const observationWeight = Math.min(
    state.tokenEstimatorObservations,
    TOKEN_ESTIMATOR_WEIGHT_LIMIT,
  );
  const nextScale = clampTokenEstimatorScale(
    (currentScale * observationWeight + observedScale) /
      (observationWeight + 1),
  );

  return {
    ...state,
    tokenEstimatorScale: nextScale,
    tokenEstimatorObservations: state.tokenEstimatorObservations + 1,
    lastPromptEvalCount: promptEvalCount,
    lastPromptEstimatedTokens: Math.max(
      0,
      Math.ceil(runtime.promptBaseTokenEstimate * nextScale),
    ),
  };
};

//- Helper Functions
//------------------------------------------------------------------------------
const getRebuildableSessionChats = (
  sessionId: number,
  controls: SessionMemoryControls,
): StoredChatRow[] =>
  filterStoredChatsForMemory(
    getChatsForPrompt.all(sessionId) as StoredChatRow[],
    controls,
  );

const generateSessionTitleWithModel = async ({
  model,
  query,
  reply,
}: {
  model: string;
  query: string;
  reply: string;
}): Promise<string> => {
  const trimmedModel = getMeaningfulText(model);
  const trimmedQuery = truncateTextToTokenBudget(
    query,
    SESSION_TITLE_GENERATION_QUERY_TOKENS,
    1,
  );
  const trimmedReply = truncateTextToTokenBudget(
    reply,
    SESSION_TITLE_GENERATION_REPLY_TOKENS,
    1,
  );

  if (!trimmedModel || !trimmedQuery || !trimmedReply) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SESSION_TITLE_GENERATION_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: trimmedModel,
        temperature: 0.2,
        stream: false,
        system:
          "Generate a concise conversation title from the first user and assistant exchange. Return only the title text, with no quotes, markdown, or prefix. The title must be concise and no more than 8 words.",
        messages: [
          {
            role: "user",
            content: [
              "First user message:",
              trimmedQuery,
              "",
              "First assistant reply:",
              trimmedReply,
            ].join("\n"),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    return normalizeAutoSessionTitle(
      has(data, ["choices", 0, "message", "content"])
        ? get(data, ["choices", 0, "message", "content"], "")
        : get(data, ["message", "content"], ""),
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      console.error("Error generating session title:", error);
    }

    return "";
  } finally {
    clearTimeout(timeout);
  }
};

const refineSessionTitleInBackground = ({
  sessionId,
  model,
  query,
  reply,
  firstChatUid,
}: {
  sessionId: number;
  model: string;
  query: string;
  reply: string;
  firstChatUid: string;
}) => {
  void (async () => {
    const generatedTitle = await generateSessionTitleWithModel({
      model,
      query,
      reply,
    });

    if (!generatedTitle || isGenericSessionTitle(generatedTitle)) {
      return;
    }

    const latestSession = getSessionById.get(sessionId) as
      | SessionRow
      | undefined;

    if (!latestSession) {
      return;
    }

    const titleState = parseSessionTitleState(
      latestSession.name,
      latestSession.jsonMeta,
    );

    if (
      titleState.source === "manual" ||
      (titleState.firstChatUid && titleState.firstChatUid !== firstChatUid)
    ) {
      return;
    }

    updateSessionTitle({
      session: latestSession,
      title: generatedTitle,
      titleState: {
        source: "llm",
        firstChatUid,
      },
      expectedUpdatedAt: latestSession.updatedAt,
    });
  })();
};

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
      chatMemoryRuntime = null,
      chatMemorySnapshot = null,
      initialSessionTitle = null,
      ...rest
    } = request;
    const normalizedInitialSessionTitle =
      normalizeInitialSessionTitle(initialSessionTitle);
    const { reply, role } = parseAssistantResponseMessage(response);
    const createdAt = new Date().toISOString();
    const trimmedQuery = getMeaningfulText(query);
    const trimmedReply = reply;

    if (!trimmedQuery || !trimmedReply || !sessionUid) {
      return;
    }

    let session = sessionUid
      ? (getSessionByUid.get(sessionUid) as SessionRow | undefined)
      : undefined;
    console.debug({ request, sessionUid, queriedSession: session });

    if (!session) {
      const uid = sessionUid || slugid.nice();
      const initialJsonMeta = buildJsonMetaWithTitleState(null, {
        source: "placeholder",
        firstChatUid: null,
      });
      const insertResult = db
        .prepare(
          `INSERT INTO sessions (uid, name, model, temperature, createdAt, updatedAt, jsonMeta)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uid,
          SESSION_TITLE_PLACEHOLDER,
          model,
          temperature,
          createdAt,
          createdAt,
          initialJsonMeta,
        );

      session = getSessionById.get(Number(insertResult.lastInsertRowid)) as
        | SessionRow
        | undefined;
    } else {
      db.prepare(
        "UPDATE sessions SET model = ?, temperature = ?, updatedAt = ? WHERE uid = ?",
      ).run(model, temperature, createdAt, sessionUid);
      session = {
        ...session,
        updatedAt: createdAt,
      };
    }

    const persistedSessionId = Number(get(session, "id", 0));

    if (!persistedSessionId) {
      return;
    }

    const existingChatCount = Number(
      get(countChatsForSessionId.get(persistedSessionId), "total", 0),
    );

    const insertChat = db.prepare(
      `INSERT INTO chats (uid, sessionId, query, reply, role, createdAt, jsonMeta)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const resolvedChatUid = chatUid ? chatUid : slugid.nice();
    const chatJsonMeta = {
      ...rest,
      memorySnapshot: chatMemorySnapshot,
    };
    const chatInsertResult = insertChat.run(
      resolvedChatUid,
      persistedSessionId,
      trimmedQuery,
      trimmedReply,
      role,
      createdAt,
      JSON.stringify(chatJsonMeta),
    );
    const insertedChatId = Number(chatInsertResult.lastInsertRowid);

    if (existingChatCount === 0 && session) {
      const titleState = parseSessionTitleState(session.name, session.jsonMeta);

      if (titleState.source !== "manual") {
        const nextInitialSessionTitle =
          normalizedInitialSessionTitle ||
          buildImmediateSessionTitle(trimmedQuery, trimmedReply);

        session = updateSessionTitle({
          session,
          title: nextInitialSessionTitle.sessionTitle,
          titleState: {
            source: nextInitialSessionTitle.sessionTitleSource,
            firstChatUid: resolvedChatUid,
          },
          expectedUpdatedAt: session.updatedAt,
        });

        refineSessionTitleInBackground({
          sessionId: persistedSessionId,
          model,
          query: trimmedQuery,
          reply: trimmedReply,
          firstChatUid: resolvedChatUid,
        });
      }
    }

    const insertFTS = db.prepare(
      `INSERT INTO chats_fts (rowid, id, query, reply) VALUES (?, ?, ?, ?)`,
    );
    insertFTS.run(insertedChatId, insertedChatId, trimmedQuery, trimmedReply);

    let sessionMemoryState = loadSessionMemoryState(persistedSessionId);
    const sessionControls = parseSessionMemoryControls(
      get(session, "jsonMeta", null),
    );
    const missingChats = filterStoredChatsForMemory(
      getChatsForPromptAfterId.all(
        persistedSessionId,
        sessionMemoryState.summarizedThroughChatId,
      ) as StoredChatRow[],
      sessionControls,
    );

    sessionMemoryState = appendChatsToSessionMemoryState(
      sessionMemoryState,
      missingChats,
    );
    sessionMemoryState = calibrateTokenEstimator(
      sessionMemoryState,
      chatMemoryRuntime as ChatMemoryRuntime | null,
      parseOptionalNonNegativeInteger(get(response, "prompt_eval_count", null)),
    );
    sessionMemoryState = trimSessionMemoryState(
      sessionMemoryState,
      sessionMemoryState.tokenEstimatorScale,
    );
    persistSessionMemoryState(persistedSessionId, sessionMemoryState);
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

app.post(
  "/chat-memory-diagnostics",
  async (req: Request, res: Response): Promise<void> => {
    const { sessionUid = "", chatMemory = null, query = "" } = req.body;

    try {
      const resolvedChatMemorySettings = resolveChatMemorySettings(chatMemory);
      const diagnostics = buildChatMemoryDiagnostics(
        getMeaningfulText(sessionUid),
        resolvedChatMemorySettings,
        getMeaningfulText(query),
      );

      res.json(diagnostics);
    } catch (error) {
      console.error("Error building chat memory diagnostics:", error);
      res.status(500).json({ error: "Failed to load chat memory diagnostics" });
    }
  },
);

app.post(
  "/session/:sessionUid/memory/rebuild",
  async (req: Request, res: Response): Promise<void> => {
    const sessionUid = getMeaningfulText(req.params.sessionUid);
    const session = getSessionByUid.get(sessionUid) as SessionRow | undefined;

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      const controls = parseSessionMemoryControls(session.jsonMeta);
      rebuildSessionMemoryState(
        session.id,
        getRebuildableSessionChats(session.id, controls),
      );
      res.json({ sessionUid, controls, rebuilt: true });
    } catch (error) {
      console.error("Error rebuilding session memory:", error);
      res.status(500).json({ error: "Failed to rebuild session memory" });
    }
  },
);

app.post(
  "/session/:sessionUid/memory/turn",
  async (req: Request, res: Response): Promise<void> => {
    const sessionUid = getMeaningfulText(req.params.sessionUid);
    const chatUid = getMeaningfulText(get(req.body, "chatUid", ""));
    const forgotten = Boolean(get(req.body, "forgotten", false));
    const session = getSessionByUid.get(sessionUid) as SessionRow | undefined;

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!chatUid) {
      res.status(400).json({ error: "chatUid is required" });
      return;
    }

    const chat = getChatUidForSession.get(session.id, chatUid) as
      | { id: number; uid: string }
      | undefined;

    if (!chat) {
      res.status(404).json({ error: "Chat not found for session" });
      return;
    }

    try {
      const currentControls = parseSessionMemoryControls(session.jsonMeta);
      const nextControls = persistSessionMemoryControls(session, {
        ...currentControls,
        forgottenChatUids: forgotten
          ? [...currentControls.forgottenChatUids, chat.uid]
          : currentControls.forgottenChatUids.filter((uid) => uid !== chat.uid),
      });

      rebuildSessionMemoryState(
        session.id,
        getRebuildableSessionChats(session.id, nextControls),
      );
      res.json({
        sessionUid,
        chatUid: chat.uid,
        forgotten,
        controls: nextControls,
      });
    } catch (error) {
      console.error("Error updating forgotten turn state:", error);
      res.status(500).json({ error: "Failed to update forgotten turn state" });
    }
  },
);

app.post(
  "/session/:sessionUid/memory/pin",
  async (req: Request, res: Response): Promise<void> => {
    const sessionUid = getMeaningfulText(req.params.sessionUid);
    const session = getSessionByUid.get(sessionUid) as SessionRow | undefined;
    const fact = normalizePinnedFact(get(req.body, "fact", ""));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!fact) {
      res.status(400).json({ error: "fact is required" });
      return;
    }

    try {
      const currentControls = parseSessionMemoryControls(session.jsonMeta);
      const nextControls = persistSessionMemoryControls(session, {
        ...currentControls,
        pinnedFacts: [...currentControls.pinnedFacts, fact],
      });

      res.json({ sessionUid, fact, controls: nextControls });
    } catch (error) {
      console.error("Error pinning fact:", error);
      res.status(500).json({ error: "Failed to pin fact" });
    }
  },
);

app.post(
  "/session/:sessionUid/memory/unpin",
  async (req: Request, res: Response): Promise<void> => {
    const sessionUid = getMeaningfulText(req.params.sessionUid);
    const session = getSessionByUid.get(sessionUid) as SessionRow | undefined;
    const fact = normalizePinnedFact(get(req.body, "fact", ""));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!fact) {
      res.status(400).json({ error: "fact is required" });
      return;
    }

    try {
      const currentControls = parseSessionMemoryControls(session.jsonMeta);
      const factKey = fact.toLowerCase();
      const nextControls = persistSessionMemoryControls(session, {
        ...currentControls,
        pinnedFacts: currentControls.pinnedFacts.filter(
          (existingFact) => existingFact.toLowerCase() !== factKey,
        ),
      });

      res.json({ sessionUid, fact, controls: nextControls });
    } catch (error) {
      console.error("Error unpinning fact:", error);
      res.status(500).json({ error: "Failed to unpin fact" });
    }
  },
);

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
    chatMemory = null,
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
    const resolvedChatMemorySettings = resolveChatMemorySettings(chatMemory);
    const {
      messages,
      messageDiagnostics,
      summary,
      tokenEstimatorScale,
      chatMemoryContext,
    } = buildChatMessages(
      resolvedSessionUid,
      trimmedQuery,
      resolvedChatMemorySettings,
    );
    const systemPrompt = buildSystemPrompt(
      system,
      summary,
      chatMemoryContext.controls.pinnedFacts,
      chatMemoryContext.retrievedChats,
    );
    const chatMemoryRuntime: ChatMemoryRuntime = {
      promptBaseTokenEstimate: estimatePromptTokens(messages, systemPrompt, 1),
      promptTokenEstimate: estimatePromptTokens(
        messages,
        systemPrompt,
        tokenEstimatorScale,
      ),
    };
    const chatMemorySnapshot = buildChatMemorySnapshot({
      sessionUid: resolvedSessionUid,
      settings: resolvedChatMemorySettings,
      context: chatMemoryContext,
      messages: messageDiagnostics,
      systemPrompt,
      runtime: chatMemoryRuntime,
    });

    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: trimmedModel,
        messages,
        temperature: temperature ?? 0.7,
        stream: stream || false,
        system: systemPrompt || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error("API response failed");
    }

    console.log("POST: /chat res:", { response });

    if (stream) {
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("Missing response body for streaming request");
      }

      const decoder = new TextDecoder();
      let fullContent = "";
      let streamResult = {};
      let pendingLine = "";

      res.writeHead(200, {
        "Content-Type": "text/plain",
        "X-Session-Uid": resolvedSessionUid,
        "X-Chat-Uid": resolvedChatUid,
      });

      const streamResponse = async () => {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            const trailingLine = pendingLine.trim();

            if (trailingLine) {
              try {
                const trailingData = JSON.parse(trailingLine);
                streamResult = trailingData || streamResult;

                const hasChoices = has(trailingData, [
                  "choices",
                  0,
                  "delta",
                  "content",
                ]);
                fullContent += hasChoices
                  ? get(trailingData, ["choices", 0, "delta", "content"], "")
                  : get(trailingData, "message.content", "");
              } catch (error) {
                console.error("Error parsing streamed JSON line:", error);
              }
            }

            const initialSessionTitle = resolveInitialSessionTitle({
              sessionUid: resolvedSessionUid,
              query: trimmedQuery,
              reply: fullContent,
            });
            const responseMetadata = buildChatResponseMetadata({
              sessionUid: resolvedSessionUid,
              chatUid: resolvedChatUid,
              initialSessionTitle,
            });

            saveChatMessage({
              request: {
                ...req.body,
                chatMemory: resolvedChatMemorySettings,
                chatMemoryRuntime,
                chatMemorySnapshot,
                initialSessionTitle,
                query: trimmedQuery,
                model: trimmedModel,
                sessionUid: resolvedSessionUid,
                chatUid: resolvedChatUid,
              },
              response: {
                ...streamResult,
                message: null,
                choices: [
                  { message: { content: fullContent, role: "assistant" } },
                ],
              },
            });

            const metadataChunk =
              buildStreamChatResponseMetadataChunk(responseMetadata);

            if (metadataChunk) {
              res.write(metadataChunk);
            }

            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = `${pendingLine}${chunk}`.split("\n");
          pendingLine = lines.pop() || "";
          const chunkData = lines
            .filter((line) => line.trim() !== "")
            .map((line) => JSON.parse(line));

          streamResult = last(chunkData) || streamResult;

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
      const result = await response.json();
      const { reply } = parseAssistantResponseMessage(result);
      const initialSessionTitle = resolveInitialSessionTitle({
        sessionUid: resolvedSessionUid,
        query: trimmedQuery,
        reply,
      });
      const responseMetadata = buildChatResponseMetadata({
        sessionUid: resolvedSessionUid,
        chatUid: resolvedChatUid,
        initialSessionTitle,
      });

      saveChatMessage({
        request: {
          ...req.body,
          chatMemory: resolvedChatMemorySettings,
          chatMemoryRuntime,
          chatMemorySnapshot,
          initialSessionTitle,
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
        ...responseMetadata,
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
