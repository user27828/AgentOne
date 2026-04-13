/**
 * GPT chat page
 */
/* eslint-disable react-refresh/only-export-components */
import React, {
  useState,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  startTransition,
} from "react";
import { get, has, isString, last, size, trim } from "lodash";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  SelectChangeEvent,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  ChevronRight,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  MoreVert,
  MoveDown,
  ThumbUp as ThumbUpIcon,
} from "@mui/icons-material";
import { useCookies } from "react-cookie";
import slugid from "slugid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "../components/Sidebar";
import QueryBox from "../components/QueryBox";
import { fetchJson } from "../utils/http";
import "../App.css";
//import ProjectFileManager from "../components/ProjectFileManager";

const CodeFormat = React.lazy(() => import("../components/CodeFormat"));

export const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

// CSS for chat
const sxChatMeItem = {
  justifyContent: "flex-end",
  textAlign: "right",
  paddingBottom: 0,
};
const sxChatMeItemText = {
  maxWidth: "94%",
  marginBottom: 0,
  background: "rgba(0,0,.1,.3)",
  padding: "10px",
  borderRadius: "10px",
  opacity: 0.9,
};

const sxGptItem = {
  paddingTop: 0,
  justifyContent: "flex-start",
  textAlign: "left",
};
const sxGptItemText = {
  marginTop: 0.1,
  border: "1px solid rgba(255,255,255,.05)",
  background: "rgba(0,.1,0,.1)",
  padding: "5px",
  borderRadius: "5px",
};

/**
 * Fetch a list of available models from the LLM server
 * @returns {array} - List of models and their properties
 */
export const apiListModels = async () => {
  try {
    return await fetchJson<string[]>(`${serverUrl}/list-models`);
  } catch (error) {
    console.error("Error listing models:", error);
    return [];
  }
};

const apiGetChatMemoryDiagnostics = async (
  sessionUid: string,
  chatMemorySettings: ChatMemorySettings,
  query: string,
): Promise<ChatMemoryDiagnostics> =>
  fetchJson<ChatMemoryDiagnostics>(`${serverUrl}/chat-memory-diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionUid,
      chatMemory: chatMemorySettings,
      query,
    }),
  });

const apiRebuildSessionMemory = async (
  sessionUid: string,
): Promise<SessionMemoryControlResponse> =>
  fetchJson<SessionMemoryControlResponse>(
    `${serverUrl}/session/${sessionUid}/memory/rebuild`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );

const apiUpdateForgottenTurn = async (
  sessionUid: string,
  chatUid: string,
  forgotten: boolean,
): Promise<SessionMemoryControlResponse> =>
  fetchJson<SessionMemoryControlResponse>(
    `${serverUrl}/session/${sessionUid}/memory/turn`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatUid, forgotten }),
    },
  );

const apiPinSessionFact = async (
  sessionUid: string,
  fact: string,
): Promise<SessionMemoryControlResponse> =>
  fetchJson<SessionMemoryControlResponse>(
    `${serverUrl}/session/${sessionUid}/memory/pin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact }),
    },
  );

const apiUnpinSessionFact = async (
  sessionUid: string,
  fact: string,
): Promise<SessionMemoryControlResponse> =>
  fetchJson<SessionMemoryControlResponse>(
    `${serverUrl}/session/${sessionUid}/memory/unpin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact }),
    },
  );

/**
 * types for useCopyHandler()
 */
type SuccessState = {
  [key: string]: boolean;
};
interface UseCopyHandlerResult {
  handleCopy: (text: string, identifier?: string) => Promise<void>;
  isShowingSuccess: (identifier?: string) => boolean;
}

type SessionRecord = {
  id: number;
  uid: string;
  name: string;
  model: string;
  temperature: number | null;
  createdAt: string;
  updatedAt: string;
  totalChats?: number;
  jsonMeta?: string | null;
};

type ChatRecord = {
  id?: number;
  uid: string;
  sessionId?: number;
  query: string;
  reply: string;
  role?: string;
  createdAt?: string;
  jsonMeta?: string | null;
};

type SessionTitleSource = "placeholder" | "heuristic" | "llm" | "manual";

type ChatResponseMetadata = {
  sessionUid: string;
  chatUid: string;
  sessionTitle?: string;
  sessionTitleSource?: SessionTitleSource;
  isInitialSessionTitle?: true;
};

type SendQueryResult = {
  ok: boolean;
  aborted?: boolean;
  sessionUid: string;
  chatUid: string;
  reply: string;
  createdAt?: string;
  sessionTitle?: string;
  sessionTitleSource?: SessionTitleSource;
  isInitialSessionTitle?: true;
  payload?: any;
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

type SessionMemoryControlResponse = {
  sessionUid: string;
  controls: SessionMemoryControls;
  rebuilt?: boolean;
  chatUid?: string;
  forgotten?: boolean;
  fact?: string;
};

type ChatMemoryDiagnosticChat = {
  chatId: number;
  createdAt: string | null;
  query: string;
  reply: string;
  queryTokens: number;
  replyTokens: number;
  totalTokens: number;
};

type ChatMemoryDiagnosticSummaryEntry = {
  chatId: number;
  query: string;
  reply: string;
  totalTokens: number;
};

type ChatMemoryRetrievedChat = {
  chatId: number;
  chatUid: string;
  createdAt: string | null;
  query: string;
  reply: string;
  totalTokens: number;
  score: number;
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
  recentChats: ChatMemoryDiagnosticChat[];
  visibleSummaryEntries: ChatMemoryDiagnosticSummaryEntry[];
  retrievedChats: ChatMemoryRetrievedChat[];
};

type LegacyChatMemorySettings = {
  verbatimHistoryChars?: unknown;
  summaryChars?: unknown;
  summaryQueryChars?: unknown;
  summaryReplyChars?: unknown;
};

const DEFAULT_CHAT_MEMORY_SETTINGS: ChatMemorySettings = {
  verbatimHistoryChats: 8,
  verbatimHistoryTokens: 3000,
  summaryTokens: 1000,
  summaryQueryTokens: 60,
  summaryReplyTokens: 90,
};

const LEGACY_CHARS_PER_TOKEN = 4;

const resolveNonNegativeInteger = (
  value: unknown,
  fallback: number,
): number => {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsedValue));
};

const resolveTokenBudget = (
  tokenValue: unknown,
  legacyCharValue: unknown,
  fallback: number,
): number => {
  const parsedTokenValue =
    typeof tokenValue === "number" ? tokenValue : Number(tokenValue);

  if (Number.isFinite(parsedTokenValue)) {
    return Math.max(0, Math.floor(parsedTokenValue));
  }

  const parsedLegacyChars =
    typeof legacyCharValue === "number"
      ? legacyCharValue
      : Number(legacyCharValue);

  if (Number.isFinite(parsedLegacyChars)) {
    return Math.max(0, Math.floor(parsedLegacyChars / LEGACY_CHARS_PER_TOKEN));
  }

  return fallback;
};

const resolveChatMemorySettings = (value: unknown): ChatMemorySettings => {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof ChatMemorySettings, unknown>> as Partial<
          Record<keyof ChatMemorySettings, unknown>
        > &
          LegacyChatMemorySettings)
      : {};

  return {
    verbatimHistoryChats: resolveNonNegativeInteger(
      settings.verbatimHistoryChats,
      DEFAULT_CHAT_MEMORY_SETTINGS.verbatimHistoryChats,
    ),
    verbatimHistoryTokens: resolveTokenBudget(
      settings.verbatimHistoryTokens,
      settings.verbatimHistoryChars,
      DEFAULT_CHAT_MEMORY_SETTINGS.verbatimHistoryTokens,
    ),
    summaryTokens: resolveTokenBudget(
      settings.summaryTokens,
      settings.summaryChars,
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryTokens,
    ),
    summaryQueryTokens: resolveTokenBudget(
      settings.summaryQueryTokens,
      settings.summaryQueryChars,
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryQueryTokens,
    ),
    summaryReplyTokens: resolveTokenBudget(
      settings.summaryReplyTokens,
      settings.summaryReplyChars,
      DEFAULT_CHAT_MEMORY_SETTINGS.summaryReplyTokens,
    ),
  };
};

const DRAFT_SESSION_KEY = "__draft__";

const chatTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatChatTimestamp = (value?: string): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : chatTimestampFormatter.format(date);
};

const getSessionKey = (sessionUid?: string): string =>
  sessionUid || DRAFT_SESSION_KEY;

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

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of value) {
    const nextValue = trim(String(item || ""));

    if (!nextValue) {
      continue;
    }

    const key = nextValue.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(nextValue);
  }

  return results;
};

const parseSessionMemoryControls = (value: unknown): SessionMemoryControls => {
  const rawControls = get(parseJsonObject(value), "memoryControls", {});

  return {
    pinnedFacts: toUniqueStrings(get(rawControls, "pinnedFacts", [])),
    forgottenChatUids: toUniqueStrings(
      get(rawControls, "forgottenChatUids", []),
    ),
  };
};

const hasMeaningfulChatText = (value?: string): boolean =>
  trim(value || "").length > 0;

const SESSION_TITLE_SOURCES = new Set<SessionTitleSource>([
  "placeholder",
  "heuristic",
  "llm",
  "manual",
]);

const extractReplyContent = (payload: any): string => {
  if (has(payload, ["choices", 0, "message", "content"])) {
    return get(payload, ["choices", 0, "message", "content"], "");
  }

  return get(payload, "message.content", get(payload, "reply", ""));
};

const normalizeChatResponseMetadata = (
  value: unknown,
): ChatResponseMetadata | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const sessionUid = trim(String(get(value, "sessionUid", "")));
  const chatUid = trim(String(get(value, "chatUid", "")));

  if (!sessionUid || !chatUid) {
    return null;
  }

  const metadata: ChatResponseMetadata = {
    sessionUid,
    chatUid,
  };
  const sessionTitle = trim(String(get(value, "sessionTitle", "")));
  const sessionTitleSource = trim(String(get(value, "sessionTitleSource", "")));
  const isInitialSessionTitle = Boolean(
    get(value, "isInitialSessionTitle", false),
  );

  if (
    isInitialSessionTitle &&
    sessionTitle &&
    SESSION_TITLE_SOURCES.has(sessionTitleSource as SessionTitleSource)
  ) {
    metadata.sessionTitle = sessionTitle;
    metadata.sessionTitleSource = sessionTitleSource as SessionTitleSource;
    metadata.isInitialSessionTitle = true;
  }

  return metadata;
};

const extractChatResponseMetadata = (
  payload: unknown,
): ChatResponseMetadata | null => normalizeChatResponseMetadata(payload);

const extractStreamChatResponseMetadata = (
  payload: unknown,
): ChatResponseMetadata | null =>
  normalizeChatResponseMetadata(get(payload, "agentOneMeta", null));

/**
 * Hook for copy functionality
 * @param successDuration - how long should the "success" icon display before reverting
 * @returns {object} - Hook functions
 */
const useCopyHandler = (
  successDuration: number = 1200,
): UseCopyHandlerResult => {
  const [successStates, setSuccessStates] = useState<SuccessState>({});

  const handleCopy = async (text: string, identifier?: string) => {
    try {
      await navigator.clipboard.writeText(text);

      const key = identifier || "default";
      setSuccessStates((prev) => ({
        ...prev,
        [key]: true,
      }));

      setTimeout(() => {
        setSuccessStates((prev) => ({
          ...prev,
          [key]: false,
        }));
      }, successDuration);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const isShowingSuccess = (identifier?: string): boolean => {
    const key = identifier || "default";
    return get(successStates, key, false);
  };

  return { handleCopy, isShowingSuccess };
};

/**
 * Default component
 * @component
 * @returns {JSX.Element}
 */
const Gpt = () => {
  const [query, setQuery] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>({});
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [stream, setStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState<any>([]);
  const [streamContentString, setStreamContentString] = useState<string>("");
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(-1); // Track currently active history
  const [sessionChats, setSessionChats] = useState<ChatRecord[]>([]); // State for chats of the active session
  const [chatMemorySettings, setChatMemorySettings] =
    useState<ChatMemorySettings>(DEFAULT_CHAT_MEMORY_SETTINGS);
  const [chatMemoryDiagnostics, setChatMemoryDiagnostics] =
    useState<ChatMemoryDiagnostics | null>(null);
  const [chatMemoryDiagnosticsError, setChatMemoryDiagnosticsError] =
    useState<string>("");
  const [chatMemoryDiagnosticsLoading, setChatMemoryDiagnosticsLoading] =
    useState<boolean>(false);
  const [chatMemoryRevision, setChatMemoryRevision] = useState<number>(0);
  const [sessionMemoryBusy, setSessionMemoryBusy] = useState<boolean>(false);
  const [newPinnedFact, setNewPinnedFact] = useState<string>("");
  const [showHistoryDebug, setShowHistoryDebug] = useState<boolean | any>(
    false,
  );
  const [chatActionMenuAnchorEl, setChatActionMenuAnchorEl] =
    useState<HTMLElement | null>(null);
  const [chatActionMenuChat, setChatActionMenuChat] =
    useState<ChatRecord | null>(null);
  const [cookies, setCookie] = useCookies();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [, setUuids] = useState<{ [sessionUid: string]: string[] }>({}); // Hierarchical UUIDs
  // @ts-expect-error - to be used soon
  const [scrollToBottomVisible, setScrollToBottomVisible] = useState(false);
  // @ts-expect-error - to be used soon
  const [scrollToTopVisible, setScrollToTopVisible] = useState(false);

  const queryFieldRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamFlushFrameRef = useRef<number | null>(null);
  const shouldRefocusQueryRef = useRef<boolean>(false);
  const pendingSessionScrollUidRef = useRef<string | null>(null);
  const pendingChatUidRef = useRef<string | null>(null);
  const pendingChatSessionKeyRef = useRef<string | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);
  const chatListRef = useRef<HTMLUListElement>(null);

  const { handleCopy, isShowingSuccess } = useCopyHandler();
  const deferredDebugQuery = useDeferredValue(query);
  const activeSession =
    activeHistoryIndex >= 0 && has(history, [activeHistoryIndex])
      ? history[activeHistoryIndex]
      : undefined;
  const activeSessionUid = activeSession?.uid || "";
  const activeSessionMemoryControls = parseSessionMemoryControls(
    activeSession?.jsonMeta,
  );

  const renderMarkdownCode = ({
    className,
    children,
  }: {
    className?: string;
    children?: React.ReactNode;
  }) => {
    const code = String(children || "").replace(/\n$/, "");
    const languageMatch = /language-([\w-]+)/.exec(className || "");
    const isCodeBlock = Boolean(languageMatch) || code.includes("\n");

    if (!isCodeBlock) {
      return <code className={className}>{children}</code>;
    }

    return (
      <React.Suspense fallback={null}>
        <CodeFormat code={code} language={languageMatch?.[1] || "text"} />
      </React.Suspense>
    );
  };

  const clearPendingChatPreview = () => {
    pendingChatUidRef.current = null;
    pendingChatSessionKeyRef.current = null;
  };

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (streamFlushFrameRef.current !== null) {
        cancelAnimationFrame(streamFlushFrameRef.current);
      }
    };
  }, []);

  /**
   * Load stored history from localStorage
   * @returns {JSON} - History list
   */
  const loadHistory = async () => {
    try {
      const response = await fetch(`${serverUrl}/session/list`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const sessions = await response.json();
      return sessions || [];
    } catch (error) {
      console.error("Error loading sessions (history):", error);
      return [];
    }
  };

  /**
   * Save/update history via endpoints
   * @param {object} history - History object to store
   */
  const saveHistory = async (
    session: Partial<SessionRecord> & { uid?: string },
  ) => {
    try {
      const method = session.uid ? "PUT" : "POST";
      const url = session.uid
        ? `${serverUrl}/session/${session.uid}`
        : `${serverUrl}/session`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const savedSession = await response.json();

      if (method === "POST") {
        setHistory((prevHistory) => {
          const nextHistory = [...prevHistory, savedSession];
          setActiveHistoryIndex(nextHistory.length - 1);
          return nextHistory;
        });
        setSessionChats([]);
        setUuids((prevUuids) => ({ ...prevUuids, [savedSession.uid]: [] }));
      } else {
        setHistory((prevHistory) =>
          prevHistory.map((s) =>
            s.uid === session.uid ? { ...s, ...savedSession } : s,
          ),
        );
      }

      return savedSession;
    } catch (error) {
      console.error("Error saving session (history):", error);
    }
  };

  const createNewHistoryItem = async (modelOverride?: string) => {
    const sessionModel = modelOverride || selectedModel || models[0] || "";
    if (sessionModel && sessionModel !== selectedModel) {
      setSelectedModel(sessionModel);
    }

    setActiveHistoryIndex(-1);
    setSessionChats([]);
    setQuery("");
    setResult({});
    setStreamContent([]);
    setStreamContentString("");
    setShowHistoryDebug(false);
    setUuids((prevUuids) => ({
      ...prevUuids,
      [DRAFT_SESSION_KEY]: [],
    }));
  };

  const loadChatsForSession = async (sessionUid: string) => {
    try {
      const response = await fetch(`${serverUrl}/session/${sessionUid}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { chats } = await response.json();
      const loadedChats = chats || [];

      setUuids((prevUuids) => ({
        ...prevUuids,
        [sessionUid]: loadedChats.map((chat: ChatRecord) => chat.uid),
      }));

      return loadedChats;
    } catch (error) {
      console.error(`Error loading chats for session ${sessionUid}:`, error);
      return [];
    }
  };

  /**
   * Handle user chat query from QueryBox
   */
  const handleQuery = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string,
  ) => {
    const value = isString(event) ? event : event.target.value;
    setQuery(value);
  };

  /**
   * Handler for Send button in QueryBox
   */
  const handleSend = useCallback(
    async (event: React.SyntheticEvent) => {
      event.preventDefault();

      if (sending) {
        return;
      }

      const trimmedQuery = trim(query);
      const activeSession =
        activeHistoryIndex >= 0 ? history[activeHistoryIndex] : undefined;

      if (!trimmedQuery || !selectedModel) {
        return;
      }

      shouldRefocusQueryRef.current = true;
      controllerRef.current = new AbortController();
      setSending(true);
      setStreamContent([]);
      setStreamContentString("");
      setResult({});

      try {
        const sendResult = await apiSendQuery(
          trimmedQuery,
          selectedModel,
          temperature,
          stream,
          chatMemorySettings,
          activeSession?.uid || "",
          controllerRef.current,
        );

        if (sendResult.ok) {
          const refreshedHistory = await loadHistory();
          const nextIndex = refreshedHistory.findIndex(
            (session: SessionRecord) => session.uid === sendResult.sessionUid,
          );

          setHistory(refreshedHistory);
          setActiveHistoryIndex(
            nextIndex >= 0
              ? nextIndex
              : refreshedHistory.length
                ? refreshedHistory.length - 1
                : -1,
          );
          setUuids((prevUuids) => {
            const draftChatUids = (prevUuids[DRAFT_SESSION_KEY] || []).filter(
              (uid) => uid !== sendResult.chatUid,
            );
            const sessionChatUids = (
              prevUuids[sendResult.sessionUid] || []
            ).filter((uid) => uid !== sendResult.chatUid);

            return {
              ...prevUuids,
              [sendResult.sessionUid]:
                draftChatUids.length > 0 ? draftChatUids : sessionChatUids,
              [DRAFT_SESSION_KEY]: [],
            };
          });
          setQuery("");
        }
      } finally {
        setSending(false);
      }
    },
    [
      activeHistoryIndex,
      history,
      query,
      selectedModel,
      sending,
      chatMemorySettings,
      stream,
      temperature,
    ],
  );

  /**
   * Move a value to the query box
   * @param {string} value
   */
  const moveQueryFocus = (value: string) => {
    setQuery(value);
    if (queryFieldRef.current) {
      //queryFieldRef.current.value = value;
      queryFieldRef.current.focus();
    }
  };

  /**
   * Send a query to the LLM server for evaluation
   * Calls to this function will create and assign a new chatUid
   * @param {string} query - User query
   * @param {string} model - Selected LLM model
   * @param {number} temperature - LLM temperature
   * @param {boolean} stream - Stream response?
   * @param {string} sessionUid - UUID for the specific session
   * @param {object} controller - Fetch controller for aborting
   * @returns {JSON} - JSON object or stream of objects
   */
  const apiSendQuery = async (
    query: string,
    model: string,
    temperature: number,
    stream: boolean,
    chatMemorySettings: ChatMemorySettings,
    sessionUid: string,
    controller: AbortController,
  ): Promise<SendQueryResult> => {
    const currentSessionUid = sessionUid
      ? sessionUid
      : history[activeHistoryIndex]?.uid || "";
    const sessionKey = getSessionKey(currentSessionUid);
    const newChatUid = slugid.nice();
    const createdAt = new Date().toISOString();
    let bufferedMessages: any[] = [];
    let bufferedContent = "";

    const flushBufferedStreamState = () => {
      streamFlushFrameRef.current = null;

      if (!bufferedMessages.length && !bufferedContent) {
        return;
      }

      const nextMessages = bufferedMessages;
      const nextContent = bufferedContent;
      bufferedMessages = [];
      bufferedContent = "";

      startTransition(() => {
        if (nextMessages.length) {
          setStreamContent((prev: any[]) => [...prev, ...nextMessages]);
        }

        if (nextContent) {
          setStreamContentString((prev) => prev + nextContent);
        }
      });
    };

    const cancelScheduledStreamFlush = () => {
      if (streamFlushFrameRef.current !== null) {
        cancelAnimationFrame(streamFlushFrameRef.current);
        streamFlushFrameRef.current = null;
      }
    };

    const scheduleStreamFlush = () => {
      if (streamFlushFrameRef.current !== null) {
        return;
      }

      streamFlushFrameRef.current = requestAnimationFrame(
        flushBufferedStreamState,
      );
    };

    const removePendingChatUid = () => {
      setUuids((prev) => {
        const existingChatUids = prev[sessionKey] || [];

        if (!existingChatUids.includes(newChatUid)) {
          return prev;
        }

        return {
          ...prev,
          [sessionKey]: existingChatUids.filter((uid) => uid !== newChatUid),
        };
      });
    };

    try {
      pendingChatUidRef.current = newChatUid;
      pendingChatSessionKeyRef.current = sessionKey;

      setUuids((prev) => ({
        ...prev,
        [sessionKey]: [...(prev[sessionKey] || []), newChatUid],
      }));

      const response = await fetch(`${serverUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          model,
          temperature,
          stream,
          chatMemory: chatMemorySettings,
          sessionUid: currentSessionUid,
          chatUid: newChatUid,
        }),
        signal: controller.signal,
      });

      const resolvedSessionUid =
        response.headers.get("X-Session-Uid") || currentSessionUid;
      const resolvedChatUid = response.headers.get("X-Chat-Uid") || newChatUid;

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          get(errorBody, "error", `HTTP error! status: ${response.status}`),
        );
      }

      if (stream) {
        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error("Missing streaming response body");
        }

        const decoder = new TextDecoder("utf-8");
        let finalContent = "";
        let pendingLine = "";
        let streamResponseMetadata: ChatResponseMetadata | null = null;

        const consumeStreamLine = (line: string) => {
          if (!line.trim()) {
            return;
          }

          try {
            const data = JSON.parse(line);
            const metadata = extractStreamChatResponseMetadata(data);

            if (metadata) {
              streamResponseMetadata = metadata;
              return;
            }

            const chunkContent = has(data, ["choices", 0, "delta", "content"])
              ? get(data, ["choices", 0, "delta", "content"], "")
              : get(data, "message.content", "");

            bufferedMessages.push(data);
            bufferedContent += chunkContent;
            finalContent += chunkContent;
          } catch (error) {
            console.error("Error parsing JSON:", error, line);
          }
        };

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            consumeStreamLine(pendingLine);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = `${pendingLine}${chunk}`.split("\n");
          pendingLine = lines.pop() || "";

          for (const line of lines) {
            consumeStreamLine(line);
          }

          scheduleStreamFlush();
        }

        cancelScheduledStreamFlush();
        flushBufferedStreamState();

        if (!hasMeaningfulChatText(finalContent)) {
          throw new Error("Received an empty response from Ollama");
        }

        const payloadMetadata: ChatResponseMetadata =
          streamResponseMetadata || {
            sessionUid: resolvedSessionUid,
            chatUid: resolvedChatUid,
          };
        removePendingChatUid();
        clearPendingChatPreview();
        const payload = {
          message: { content: finalContent, role: "assistant" },
          sessionUid: payloadMetadata.sessionUid || resolvedSessionUid,
          chatUid: payloadMetadata.chatUid || resolvedChatUid,
          ...(payloadMetadata.isInitialSessionTitle &&
          payloadMetadata.sessionTitle
            ? {
                sessionTitle: payloadMetadata.sessionTitle,
                sessionTitleSource: payloadMetadata.sessionTitleSource,
                isInitialSessionTitle: true,
              }
            : {}),
        };

        setSessionChats((prevChats) => [
          ...prevChats,
          {
            uid: payload.chatUid,
            query,
            reply: finalContent,
            role: "assistant",
            createdAt,
          },
        ]);
        setResult(payload);

        return {
          ok: true,
          sessionUid: payload.sessionUid,
          chatUid: payload.chatUid,
          reply: finalContent,
          createdAt,
          ...(payload.isInitialSessionTitle && payload.sessionTitle
            ? {
                sessionTitle: payload.sessionTitle,
                sessionTitleSource: payload.sessionTitleSource,
                isInitialSessionTitle: true,
              }
            : {}),
          payload,
        };
      } else {
        const payload = await response.json();
        const responseMetadata = extractChatResponseMetadata(payload);
        const responseChatUid = responseMetadata?.chatUid || resolvedChatUid;
        const responseSessionUid =
          responseMetadata?.sessionUid || resolvedSessionUid;
        const reply = extractReplyContent(payload);

        if (!hasMeaningfulChatText(reply)) {
          throw new Error("Received an empty response from Ollama");
        }

        removePendingChatUid();
        clearPendingChatPreview();
        setSessionChats((prevChats) => [
          ...prevChats,
          {
            uid: responseChatUid,
            query,
            reply,
            role: "assistant",
            createdAt,
          },
        ]);
        setResult(payload || {});

        return {
          ok: true,
          sessionUid: responseSessionUid,
          chatUid: responseChatUid,
          reply,
          createdAt,
          ...(responseMetadata?.isInitialSessionTitle &&
          responseMetadata.sessionTitle
            ? {
                sessionTitle: responseMetadata.sessionTitle,
                sessionTitleSource: responseMetadata.sessionTitleSource,
                isInitialSessionTitle: true,
              }
            : {}),
          payload,
        };
      }
    } catch (error) {
      cancelScheduledStreamFlush();
      removePendingChatUid();
      clearPendingChatPreview();

      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          ok: false,
          aborted: true,
          sessionUid: currentSessionUid,
          chatUid: newChatUid,
          reply: "",
        };
      }

      setResult({
        content: `Request failure`,
      });
      console.error("Error sending chat query:", error);

      return {
        ok: false,
        sessionUid: currentSessionUid,
        chatUid: newChatUid,
        reply: "",
      };
    }
  };

  /**
   * Delete specific history item
   * @param {integer} uid - History UID
   */
  const handleDeleteHistoryMessage = async (uid: string) => {
    console.log({ uid });
    try {
      const currentSession = history[activeHistoryIndex];

      if (!currentSession?.uid) {
        return;
      }

      const response = await fetch(
        `${serverUrl}/session/${currentSession.uid}/chat/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatIds: [uid] }), // Send as an array
        },
      );
      console.log({ response });
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      // Update the history state after successful deletion
      setSessionChats((prevChats) =>
        prevChats.filter((val) => val.uid !== uid),
      );

      const refreshedHistory = await loadHistory();
      const nextIndex = refreshedHistory.findIndex(
        (session: SessionRecord) => session.uid === currentSession.uid,
      );
      const fallbackIndex = refreshedHistory.length
        ? Math.min(activeHistoryIndex, refreshedHistory.length - 1)
        : -1;

      setHistory(refreshedHistory);
      setActiveHistoryIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);

      if (nextIndex < 0 && fallbackIndex < 0) {
        setSessionChats([]);
      }
    } catch (error) {
      console.error("Error deleting chat message:", error);
    }
  };

  /**
   * Query/Chat cancel button
   */
  const handleCancel = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      clearPendingChatPreview();
      setSending(false);
    }
  }, []);

  /**
   * Model change from Sidebar > Quick settings menu
   */
  const handleModelChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedModel(event.target.value as string);
      setCookie("settings", { ...cookies.settings, model: event.target.value });
    },
    [cookies, setCookie],
  );

  /**
   * Temperature change from Sidebar > Quick settings menu
   */
  const handleTemperatureChange = useCallback(
    (_event: Event, value: number | number[]) => {
      setTemperature(value as number);
      setCookie("settings", { ...cookies.settings, temperature: value });
    },
    [cookies, setCookie],
  );

  /**
   * Stream change from Sidebar > Settings dialog
   */
  const handleStreamChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setStream(event.target.checked);
      setCookie("settings", {
        ...cookies.settings,
        stream: event.target.checked,
      });
    },
    [cookies, setCookie],
  );

  /**
   * Chat memory settings change from Sidebar > Settings dialog
   */
  const handleChatMemorySettingChange = useCallback(
    (key: keyof ChatMemorySettings, value: number) => {
      if (!Number.isFinite(value)) {
        return;
      }

      const nextSettings = {
        ...chatMemorySettings,
        [key]: Math.max(0, Math.floor(value)),
      };

      setChatMemorySettings(nextSettings);
      setCookie("settings", {
        ...cookies.settings,
        chatMemory: nextSettings,
      });
    },
    [chatMemorySettings, cookies, setCookie],
  );

  const refreshSessionState = useCallback(
    async (sessionUid: string) => {
      const refreshedHistory = await loadHistory();
      const nextIndex = refreshedHistory.findIndex(
        (session: SessionRecord) => session.uid === sessionUid,
      );
      const fallbackIndex = refreshedHistory.length
        ? Math.min(activeHistoryIndex, refreshedHistory.length - 1)
        : -1;

      setHistory(refreshedHistory);
      setActiveHistoryIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);

      if (nextIndex < 0 && fallbackIndex < 0) {
        setSessionChats([]);
      }

      setChatMemoryRevision((prev) => prev + 1);
    },
    [activeHistoryIndex],
  );

  const handleRebuildSessionMemory = useCallback(async () => {
    if (!activeSessionUid || sessionMemoryBusy) {
      return;
    }

    setSessionMemoryBusy(true);

    try {
      await apiRebuildSessionMemory(activeSessionUid);
      await refreshSessionState(activeSessionUid);
    } catch (error) {
      console.error("Error rebuilding session memory:", error);
    } finally {
      setSessionMemoryBusy(false);
    }
  }, [activeSessionUid, refreshSessionState, sessionMemoryBusy]);

  const handleAddPinnedFact = useCallback(async () => {
    const fact = trim(newPinnedFact);

    if (!activeSessionUid || !fact || sessionMemoryBusy) {
      return;
    }

    setSessionMemoryBusy(true);

    try {
      await apiPinSessionFact(activeSessionUid, fact);
      setNewPinnedFact("");
      await refreshSessionState(activeSessionUid);
    } catch (error) {
      console.error("Error pinning session fact:", error);
    } finally {
      setSessionMemoryBusy(false);
    }
  }, [activeSessionUid, newPinnedFact, refreshSessionState, sessionMemoryBusy]);

  const handleRemovePinnedFact = useCallback(
    async (fact: string) => {
      if (!activeSessionUid || !fact || sessionMemoryBusy) {
        return;
      }

      setSessionMemoryBusy(true);

      try {
        await apiUnpinSessionFact(activeSessionUid, fact);
        await refreshSessionState(activeSessionUid);
      } catch (error) {
        console.error("Error unpinning session fact:", error);
      } finally {
        setSessionMemoryBusy(false);
      }
    },
    [activeSessionUid, refreshSessionState, sessionMemoryBusy],
  );

  const handleToggleForgottenTurn = useCallback(
    async (chat: ChatRecord, forgotten: boolean) => {
      if (!activeSessionUid || !chat.uid || sessionMemoryBusy) {
        return;
      }

      setSessionMemoryBusy(true);

      try {
        await apiUpdateForgottenTurn(activeSessionUid, chat.uid, forgotten);
        await refreshSessionState(activeSessionUid);
      } catch (error) {
        console.error("Error updating forgotten turn state:", error);
      } finally {
        setSessionMemoryBusy(false);
      }
    },
    [activeSessionUid, refreshSessionState, sessionMemoryBusy],
  );

  const handleChatActionMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>, chat: ChatRecord) => {
      event.stopPropagation();
      setChatActionMenuAnchorEl(event.currentTarget);
      setChatActionMenuChat(chat);
    },
    [],
  );

  const handleChatActionMenuClose = useCallback(() => {
    setChatActionMenuAnchorEl(null);
    setChatActionMenuChat(null);
  }, []);

  const handleOpenHistoryDebug = useCallback(
    (chat: ChatRecord) => {
      setShowHistoryDebug(chat);
      handleChatActionMenuClose();
    },
    [handleChatActionMenuClose],
  );

  const handleDeleteChatFromMenu = useCallback(async () => {
    const chatUid = chatActionMenuChat?.uid;

    handleChatActionMenuClose();

    if (!chatUid) {
      return;
    }

    await handleDeleteHistoryMessage(chatUid);
  }, [chatActionMenuChat?.uid, handleChatActionMenuClose]);

  const handleToggleForgottenTurnFromMenu = useCallback(async () => {
    const chat = chatActionMenuChat;

    handleChatActionMenuClose();

    if (!chat?.uid) {
      return;
    }

    const forgotten = !activeSessionMemoryControls.forgottenChatUids.includes(
      chat.uid,
    );
    await handleToggleForgottenTurn(chat, forgotten);
  }, [
    activeSessionMemoryControls.forgottenChatUids,
    chatActionMenuChat,
    handleChatActionMenuClose,
    handleToggleForgottenTurn,
  ]);

  useEffect(() => {
    if (!showDebug) {
      return;
    }

    if (!activeSessionUid) {
      setChatMemoryDiagnostics(null);
      setChatMemoryDiagnosticsError("");
      setChatMemoryDiagnosticsLoading(false);
      return;
    }

    let cancelled = false;

    const loadChatMemoryDiagnostics = async () => {
      setChatMemoryDiagnosticsLoading(true);
      setChatMemoryDiagnosticsError("");

      try {
        const diagnostics = await apiGetChatMemoryDiagnostics(
          activeSessionUid,
          chatMemorySettings,
          trim(deferredDebugQuery),
        );

        if (!cancelled) {
          setChatMemoryDiagnostics(diagnostics);
        }
      } catch (error) {
        if (!cancelled) {
          setChatMemoryDiagnostics(null);
          setChatMemoryDiagnosticsError(
            error instanceof Error
              ? error.message
              : "Failed to load chat memory diagnostics",
          );
        }
      } finally {
        if (!cancelled) {
          setChatMemoryDiagnosticsLoading(false);
        }
      }
    };

    loadChatMemoryDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [
    showDebug,
    activeSessionUid,
    chatMemorySettings,
    deferredDebugQuery,
    chatMemoryRevision,
  ]);

  useEffect(() => {
    if (sending || !shouldRefocusQueryRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      queryFieldRef.current?.focus();
      shouldRefocusQueryRef.current = false;
    });

    return () => cancelAnimationFrame(frame);
  }, [sending]);

  useEffect(() => {
    pendingSessionScrollUidRef.current = activeSessionUid || null;
  }, [activeSessionUid]);

  useEffect(() => {
    if (
      loading ||
      !activeSessionUid ||
      pendingSessionScrollUidRef.current !== activeSessionUid
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      streamingEndRef.current?.scrollIntoView({ behavior: "auto" });
      pendingSessionScrollUidRef.current = null;
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSessionUid, loading, sessionChats.length]);

  /**
   * Lower-left chevron for opening/closing sidebar
   */
  const handleToggleSidebar = useCallback(() => {
    setCookie("settings", { ...cookies.settings, sidebarOpen: !sidebarOpen });
    setSidebarOpen(!sidebarOpen);
  }, [sidebarOpen]);

  /**
   * LLM results
   * @returns {JSX.Element}
   * @component
   */
  const StreamingResultBox = () => {
    // Show the scroll-to-<top|bottom> arrows if there are this many chats
    const arrowChatThreshold = size(sessionChats) > 5;
    const hasActiveHistory =
      activeHistoryIndex >= 0 && has(history, [activeHistoryIndex]);
    const activeSession = hasActiveHistory
      ? history[activeHistoryIndex]
      : undefined;

    useEffect(() => {
      if (activeHistoryIndex < 0) {
        return;
      }

      if (!has(history, [activeHistoryIndex])) {
        setActiveHistoryIndex(history.length ? history.length - 1 : -1);
      }
    }, [history, activeHistoryIndex]);

    const lastHistoryChat = last(sessionChats);
    const activeSessionKey = getSessionKey(activeSession?.uid);
    const pendingChatUid =
      pendingChatSessionKeyRef.current === activeSessionKey
        ? pendingChatUidRef.current
        : null;
    const hasPendingChat = Boolean(sending && pendingChatUid);
    const pendingReply = stream
      ? streamContentString
      : extractReplyContent(result);
    const isDuplicate = Boolean(
      query &&
      lastHistoryChat &&
      pendingChatUid &&
      query === lastHistoryChat.query &&
      pendingChatUid === lastHistoryChat.uid,
    );

    // Combine history and current query for display, filtering out the duplicate last message if needed
    const chatToDisplay = [
      ...(sessionChats || []),
      hasPendingChat && !isDuplicate
        ? {
            uid: pendingChatUid,
            query,
            reply: pendingReply,
          }
        : null, // Last duplicate filtered out below
    ].filter(Boolean) as ChatRecord[];
    //console.log({ chatToDisplay });

    const scrollToBottom = () => {
      chatListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
    };

    const scrollToTop = () => {
      chatListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    // TODO: Auto-scroll to bottom kind-of works, but needs more attention
    useEffect(() => {
      const listElement = chatListRef.current;

      const handleScroll = () => {
        if (listElement) {
          // Check listElement after render
          const { scrollTop, scrollHeight, clientHeight } = listElement;
          const threshold = 100; // Adjust threshold if necessary

          setScrollToBottomVisible(
            scrollTop + clientHeight < scrollHeight - threshold,
          );
          setScrollToTopVisible(scrollTop > threshold);
        }
      };

      if (listElement) {
        // Use a timeout to ensure the List's content has rendered and scrollHeight is accurate
        setTimeout(() => {
          // Wrap in setTimeout
          handleScroll(); // Check initial visibility AFTER render and layout
        }, 1000);

        listElement.addEventListener("scroll", handleScroll);

        return () => listElement.removeEventListener("scroll", handleScroll);
      }
    }, [chatListRef?.current, chatToDisplay.length]);

    return (
      <>
        <Card>
          <CardContent>
            <List
              ref={chatListRef}
              dense={true}
              sx={{
                position: "relative",
              }}
            >
              {chatToDisplay.length > 0 &&
              size(chatToDisplay.filter((v) => size(v.query) > 0)) > 0 ? (
                chatToDisplay.map((chat, index) => (
                  <React.Fragment key={`chat-item-${chat.uid || index}`}>
                    <ListItem sx={sxChatMeItem}>
                      <ListItemText
                        slotProps={{
                          primary: { component: "div" },
                          secondary: { component: "div" },
                        }}
                        primary={chat.query}
                        secondary={
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <Box
                              component="small"
                              sx={{ opacity: 0.7, whiteSpace: "nowrap" }}
                            >
                              {formatChatTimestamp(chat.createdAt)}
                            </Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{
                                justifyContent: "flex-end",
                                alignItems: "center",
                              }}
                            >
                              <small>{"(Me)"}&nbsp;</small>
                              {index < size(sessionChats) && (
                                <>
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleCopy(chat.query, `query-${index}`)
                                    }
                                  >
                                    <Tooltip title="Copy this query text">
                                      {isShowingSuccess(`query-${index}`) ? (
                                        <ThumbUpIcon
                                          sx={{ color: "green", opacity: 0.5 }}
                                        />
                                      ) : (
                                        <CopyIcon color="primary" />
                                      )}
                                    </Tooltip>
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      size(chat.query) &&
                                      moveQueryFocus(chat.query)
                                    }
                                  >
                                    <Tooltip title="Copy text to query editor">
                                      <MoveDown color="primary" />
                                    </Tooltip>
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={(event) =>
                                      handleChatActionMenuOpen(event, chat)
                                    }
                                  >
                                    <Tooltip title="Open turn actions">
                                      <MoreVert color="primary" />
                                    </Tooltip>
                                  </IconButton>
                                </>
                              )}
                            </Stack>
                          </Stack>
                        }
                        sx={sxChatMeItemText}
                      />
                    </ListItem>
                    {(sending &&
                      !streamContentString &&
                      index === chatToDisplay.length - 1 && ( // Only for the last/current query
                        <ListItem>
                          <ListItemText secondary={<CircularProgress />} />
                        </ListItem>
                      )) ||
                      (chat.reply && ( // LLM response
                        <ListItem sx={sxGptItem}>
                          <ListItemText
                            slotProps={{
                              primary: { component: "div" },
                              secondary: { component: "div" },
                            }}
                            primary={
                              <div className="results-box">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    pre: ({ children }) => <>{children}</>,
                                    code: renderMarkdownCode,
                                  }}
                                >
                                  {get(chat, "reply", "")}
                                </ReactMarkdown>
                              </div>
                            }
                            secondary={
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{
                                    justifyContent: "flex-start",
                                    alignItems: "center",
                                  }}
                                >
                                  <small>{"(LLM)"}</small>
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleCopy(
                                        chat.reply,
                                        `response-${index}`,
                                      )
                                    }
                                  >
                                    <Tooltip title="Copy this query text">
                                      {isShowingSuccess(`response-${index}`) ? (
                                        <ThumbUpIcon
                                          sx={{ color: "green", opacity: 0.5 }}
                                        />
                                      ) : (
                                        <CopyIcon color="primary" />
                                      )}
                                    </Tooltip>
                                  </IconButton>
                                </Stack>
                                <Box
                                  component="small"
                                  sx={{ opacity: 0.7, whiteSpace: "nowrap" }}
                                >
                                  {formatChatTimestamp(chat.createdAt)}
                                </Box>
                              </Stack>
                            }
                            sx={sxGptItemText}
                          />
                        </ListItem>
                      ))}
                  </React.Fragment>
                ))
              ) : (
                <ListItem key="_default">
                  <ListItemText>
                    Please ask me something, or else my matricies will rust! 😟
                  </ListItemText>
                </ListItem>
              )}
              {/* Scroll to bottom arrow - not completely functional - auto detection logic is wrong*/}
              {
                //scrollToBottomVisible && !sending && !loading &&
                arrowChatThreshold && (
                  <IconButton
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: -15,
                      opacity: 0.7,
                      "&:hover": { opacity: 1 },
                    }}
                    onClick={scrollToBottom}
                  >
                    <ChevronRight style={{ transform: "rotate(90deg)" }} />{" "}
                  </IconButton>
                )
              }

              {/* Scroll to top arrow */}
              {
                //scrollToTopVisible && !sending && !loading && (
                arrowChatThreshold && (
                  <IconButton
                    sx={{
                      position: "absolute",
                      bottom: 0,
                      right: -15,
                      opacity: 0.7,
                      "&:hover": { opacity: 1 },
                    }}
                    onClick={scrollToTop}
                  >
                    <ChevronRight
                      style={{ transform: "rotate(-90deg)" }}
                    />{" "}
                  </IconButton>
                )
              }
            </List>
            <Menu
              anchorEl={chatActionMenuAnchorEl}
              open={
                Boolean(chatActionMenuAnchorEl) && Boolean(chatActionMenuChat)
              }
              onClose={handleChatActionMenuClose}
            >
              <MenuItem
                onClick={() =>
                  chatActionMenuChat &&
                  handleOpenHistoryDebug(chatActionMenuChat)
                }
              >
                <ListItemIcon>
                  <InfoIcon color="primary" fontSize="small" />
                </ListItemIcon>
                Memory Debug
              </MenuItem>
              <MenuItem onClick={handleToggleForgottenTurnFromMenu}>
                <ListItemIcon>
                  <InfoIcon color="primary" fontSize="small" />
                </ListItemIcon>
                {chatActionMenuChat?.uid &&
                activeSessionMemoryControls.forgottenChatUids.includes(
                  chatActionMenuChat.uid,
                )
                  ? "Remember Turn"
                  : "Forget Turn"}
              </MenuItem>
              <MenuItem onClick={handleDeleteChatFromMenu}>
                <ListItemIcon>
                  <DeleteIcon color="warning" fontSize="small" />
                </ListItemIcon>
                Delete Item Pair
              </MenuItem>
            </Menu>
          </CardContent>
        </Card>
        {showHistoryDebug !== false
          ? (() => {
              const historyDebugMeta = parseJsonObject(
                showHistoryDebug?.jsonMeta,
              );
              const historyMemorySnapshot = get(
                historyDebugMeta,
                "memorySnapshot",
                null,
              );
              const isForgottenHistoryTurn = Boolean(
                showHistoryDebug?.uid &&
                activeSessionMemoryControls.forgottenChatUids.includes(
                  showHistoryDebug.uid,
                ),
              );

              return (
                <Dialog
                  scroll="paper"
                  open={showHistoryDebug !== false}
                  onClose={() => setShowHistoryDebug(false)}
                  fullWidth={true}
                  maxWidth="lg"
                >
                  <DialogTitle>History Item Information</DialogTitle>
                  <DialogContent
                    dividers={true}
                    className="debug-DialogContent"
                  >
                    <Stack spacing={2}>
                      <Box>
                        <h4>Query and response</h4>
                        <React.Suspense fallback={null}>
                          <CodeFormat
                            code={JSON.stringify(
                              {
                                ...showHistoryDebug,
                                jsonMeta: historyDebugMeta,
                                forgottenFromMemory: isForgottenHistoryTurn,
                              },
                              null,
                              2,
                            )}
                            language="json"
                          />
                        </React.Suspense>
                      </Box>
                      <Box>
                        <h4>Stored Memory Snapshot</h4>
                        <React.Suspense fallback={null}>
                          <CodeFormat
                            code={
                              historyMemorySnapshot
                                ? JSON.stringify(historyMemorySnapshot, null, 2)
                                : JSON.stringify(
                                    {
                                      message:
                                        "No stored memory snapshot exists for this turn.",
                                    },
                                    null,
                                    2,
                                  )
                            }
                            language="json"
                          />
                        </React.Suspense>
                      </Box>
                    </Stack>
                  </DialogContent>
                  <DialogActions>
                    {showHistoryDebug?.uid ? (
                      <Button
                        variant="outlined"
                        disabled={sessionMemoryBusy}
                        onClick={() =>
                          handleToggleForgottenTurn(
                            showHistoryDebug,
                            !isForgottenHistoryTurn,
                          )
                        }
                      >
                        {isForgottenHistoryTurn
                          ? "Remember Turn"
                          : "Forget Turn"}
                      </Button>
                    ) : null}
                    <Button
                      variant="outlined"
                      onClick={() => setShowHistoryDebug(false)}
                    >
                      Close
                    </Button>
                  </DialogActions>
                </Dialog>
              );
            })()
          : null}
      </>
    );
  };

  /**
   * Debugging box
   * @component
   * @returns {JSX.Element}
   */
  const DebuggingResultDialog = () => {
    const debugResult = { result, streamContent };

    return showDebug ? (
      <Dialog
        open={showDebug}
        fullWidth={true}
        maxWidth="xl"
        onClose={() => setShowDebug(false)}
      >
        <DialogTitle>Debug Data</DialogTitle>
        <DialogContent dividers={true}>
          <Stack spacing={2}>
            <Box>
              <h4>LLM Response</h4>
              <Card>
                <CardContent>
                  <React.Suspense fallback={null}>
                    <CodeFormat
                      code={result ? JSON.stringify(debugResult, null, 2) : ""}
                      language="json"
                    />
                  </React.Suspense>
                </CardContent>
              </Card>
            </Box>
            <Box>
              <h4>Chat Memory</h4>
              <Card>
                <CardContent>
                  {chatMemoryDiagnosticsLoading ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 120,
                      }}
                    >
                      <CircularProgress size={28} />
                    </Box>
                  ) : chatMemoryDiagnosticsError ? (
                    <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap" }}>
                      {chatMemoryDiagnosticsError}
                    </Box>
                  ) : activeSessionUid && chatMemoryDiagnostics ? (
                    <React.Suspense fallback={null}>
                      <CodeFormat
                        code={JSON.stringify(chatMemoryDiagnostics, null, 2)}
                        language="json"
                      />
                    </React.Suspense>
                  ) : (
                    <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap" }}>
                      No active persisted session is selected.
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setShowDebug(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    ) : null;
  };

  /**
   * Get the initial list of available LLMs from the Ollama service
   */
  useEffect(() => {
    const savedSettings = cookies.settings || {};
    setTemperature(savedSettings.temperature ?? 0.7);
    setStream(savedSettings.stream ?? true);
    setSidebarOpen(savedSettings.sidebarOpen ?? false);
    setChatMemorySettings(resolveChatMemorySettings(savedSettings.chatMemory));

    const initializePage = async () => {
      const [availableModels, initialHistory] = await Promise.all([
        apiListModels(),
        loadHistory(),
      ]);
      const initialModel = savedSettings.model || availableModels[0] || "";

      setModels(availableModels);
      setSelectedModel(initialModel);
      setHistory(initialHistory);

      if (!initialHistory.length) {
        setActiveHistoryIndex(-1);
        setSessionChats([]);
      } else {
        const latestHistoryIndex = initialHistory.length - 1;
        setActiveHistoryIndex(latestHistoryIndex);
        const initialChats = await loadChatsForSession(
          initialHistory[latestHistoryIndex].uid,
        );
        setSessionChats(initialChats);
      }

      setLoading(false);
    };

    initializePage();
  }, []);

  //  Update sessionChats whenever the activeHistoryIndex changes
  useEffect(() => {
    const _loadSessionChats = async () => {
      if (loading) {
        return;
      }

      if (activeHistoryIndex < 0 || history.length === 0) {
        setSessionChats([]);
        return;
      }

      const currentSession = history[activeHistoryIndex];

      if (!currentSession?.uid) {
        setSessionChats([]);
        return;
      }

      const chats = await loadChatsForSession(currentSession.uid);
      setSessionChats(chats);
    };
    _loadSessionChats();
  }, [activeHistoryIndex, history, loading]);

  // Scroll to the bottom of the StreamingResultBox on updates
  useEffect(() => {
    streamingEndRef.current?.scrollIntoView({
      behavior: sending ? "auto" : "smooth",
    });
  }, [sending, streamContentString, result]);

  return (
    <Box
      sx={{
        position: "relative",
        height: "100vh",
        display: "flex",
      }}
    >
      {/* Sidebar > history/sessions, settings, quick settings */}
      <Sidebar
        {...{
          models,
          setModels,
          history,
          loading,
          sending,
          showDebug,
          activeHistoryIndex,
          setActiveHistoryIndex,
          handleToggleSidebar,
          sidebarOpen,
          setUuids,
          setHistory,
          selectedModel,
          temperature,
          stream,
          setShowDebug,
          createNewHistoryItem,
          saveHistory,
          chatMemorySettings,
          activeSessionUid,
          activeSessionMemoryControls,
          newPinnedFact,
          setNewPinnedFact,
          sessionMemoryBusy,
          handleRebuildSessionMemory,
          handleAddPinnedFact,
          handleRemovePinnedFact,
          handleChatMemorySettingChange,
          handleStreamChange,
          handleModelChange,
          handleTemperatureChange,
        }}
      />

      {/* Chat window */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Scrollable Chat Area */}
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            marginBottom: 0.5,
          }}
        >
          <StreamingResultBox />
          <Box ref={streamingEndRef} />
        </Box>
        {/* QueryBox */}
        <Box
          sx={{
            width: "100%",
            flexShrink: 0, // Prevents QueryBox container from shrinking
            boxShadow: "0 -2px 5px rgba(0,0,0,0.1)",
            backgroundColor: "rgba(0,0,0,0.05)",
          }}
        >
          <QueryBox
            {...{
              models,
              selectedModel,
              stream,
              handleStreamChange,
              loading,
              sending,
              query,
              queryFieldRef,
              handleQuery,
              handleSend,
              handleCancel,
            }}
          />
        </Box>
      </Box>

      <DebuggingResultDialog />
    </Box>
  );
};

export default Gpt;
