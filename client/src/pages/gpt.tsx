/**
 * GPT chat page
 */
/* eslint-disable react-refresh/only-export-components */
import React, {
  useState,
  useCallback,
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
  List,
  ListItem,
  ListItemText,
  SelectChangeEvent,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  ChevronRight,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
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

type SendQueryResult = {
  ok: boolean;
  aborted?: boolean;
  sessionUid: string;
  chatUid: string;
  reply: string;
  createdAt?: string;
  payload?: any;
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

const hasMeaningfulChatText = (value?: string): boolean =>
  trim(value || "").length > 0;

const extractReplyContent = (payload: any): string => {
  if (has(payload, ["choices", 0, "message", "content"])) {
    return get(payload, ["choices", 0, "message", "content"], "");
  }

  return get(payload, "message.content", get(payload, "reply", ""));
};

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
  const [showHistoryDebug, setShowHistoryDebug] = useState<boolean | any>(
    false,
  );
  const [cookies, setCookie] = useCookies();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [uuids, setUuids] = useState<{ [sessionUid: string]: string[] }>({}); // Hierarchical UUIDs
  // @ts-expect-error - to be used soon
  const [scrollToBottomVisible, setScrollToBottomVisible] = useState(false);
  // @ts-expect-error - to be used soon
  const [scrollToTopVisible, setScrollToTopVisible] = useState(false);

  const queryFieldRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamFlushFrameRef = useRef<number | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);
  const chatListRef = useRef<HTMLUListElement>(null);

  const { handleCopy, isShowingSuccess } = useCopyHandler();

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
            nextIndex >= 0 ? nextIndex : refreshedHistory.length ? 0 : -1,
          );
          setUuids((prevUuids) => {
            const draftChatUids = prevUuids[DRAFT_SESSION_KEY] || [];

            return {
              ...prevUuids,
              [sendResult.sessionUid]:
                draftChatUids.length > 0
                  ? draftChatUids
                  : prevUuids[sendResult.sessionUid] || [],
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

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            try {
              const data = JSON.parse(line);
              const chunkContent = has(data, ["choices", 0, "delta", "content"])
                ? get(data, ["choices", 0, "delta", "content"], "")
                : get(data, "message.content", "");

              bufferedMessages.push(data);
              bufferedContent += chunkContent;
              finalContent += chunkContent;
            } catch (error) {
              console.error("Error parsing JSON:", error, line);
            }
          }

          scheduleStreamFlush();
        }

        cancelScheduledStreamFlush();
        flushBufferedStreamState();

        if (!hasMeaningfulChatText(finalContent)) {
          throw new Error("Received an empty response from Ollama");
        }

        const payload = {
          message: { content: finalContent, role: "assistant" },
          sessionUid: resolvedSessionUid,
          chatUid: resolvedChatUid,
        };

        setSessionChats((prevChats) => [
          ...prevChats,
          {
            uid: resolvedChatUid,
            query,
            reply: finalContent,
            role: "assistant",
            createdAt,
          },
        ]);
        setResult(payload);

        return {
          ok: true,
          sessionUid: resolvedSessionUid,
          chatUid: resolvedChatUid,
          reply: finalContent,
          createdAt,
          payload,
        };
      } else {
        const payload = await response.json();
        const responseChatUid = payload.chatUid || resolvedChatUid;
        const responseSessionUid = payload.sessionUid || resolvedSessionUid;
        const reply = extractReplyContent(payload);

        if (!hasMeaningfulChatText(reply)) {
          throw new Error("Received an empty response from Ollama");
        }

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
          payload,
        };
      }
    } catch (error) {
      cancelScheduledStreamFlush();
      removePendingChatUid();

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
    const pendingChatUid = last(uuids[getSessionKey(activeSession?.uid)] || []);
    const pendingReply = stream
      ? streamContentString
      : extractReplyContent(result);
    const isDuplicate = Boolean(
      query &&
      lastHistoryChat &&
      query === lastHistoryChat.query &&
      pendingChatUid === lastHistoryChat.uid,
    );

    // Combine history and current query for display, filtering out the duplicate last message if needed
    const chatToDisplay = [
      ...(sessionChats || []),
      sending && !isDuplicate
        ? {
            uid: pendingChatUid || "pending-chat",
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
                                      handleDeleteHistoryMessage(chat.uid)
                                    }
                                  >
                                    <Tooltip title="Delete this item pair">
                                      <DeleteIcon color="warning" />
                                    </Tooltip>
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() => setShowHistoryDebug(chat)}
                                  >
                                    <Tooltip title="Show debug data for this query/response pair">
                                      <InfoIcon color="primary" />
                                    </Tooltip>
                                  </IconButton>
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
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
          </CardContent>
        </Card>
        {showHistoryDebug !== false ? (
          <Dialog
            scroll="paper"
            open={showHistoryDebug !== false}
            onClose={() => setShowHistoryDebug(false)}
          >
            <DialogTitle>History Item Information</DialogTitle>
            <DialogContent dividers={true} className="debug-DialogContent">
              <h4>Query and response</h4>
              <React.Suspense fallback={null}>
                <CodeFormat
                  code={JSON.stringify(showHistoryDebug, null, 2)}
                  language="json"
                />
              </React.Suspense>
            </DialogContent>
            <DialogActions>
              <Button
                variant="outlined"
                onClick={() => setShowHistoryDebug(false)}
              >
                Close
              </Button>
            </DialogActions>
          </Dialog>
        ) : null}
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
      <Dialog open={showDebug} fullWidth={true} maxWidth="xl">
        <DialogTitle>Debug Data</DialogTitle>
        <DialogContent>
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
        setActiveHistoryIndex(0);
        const initialChats = await loadChatsForSession(initialHistory[0].uid);
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
