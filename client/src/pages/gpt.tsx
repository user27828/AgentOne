/**
 * GPT chat page
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
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
  Grid2 as Grid,
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
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "../components/Sidebar";
import QueryBox from "../components/QueryBox";
import CodeFormat from "../components/CodeFormat";
import "../App.css";
//import ProjectFileManager from "../components/ProjectFileManager";

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
  marginTop: 1,
  border: "1px solid rgba(255,255,255,.05)",
  background: "rgba(0,.1,0,.1)",
  padding: "5px",
  borderRadius: "5px",
};

/**
 * Fetch a list of available models from the LLM server
 * @returns {array} - List of models and their properties
 */
const apiListModels = async () => {
  try {
    const response = await axios.get(`${serverUrl}/list-models`);
    return response.data;
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
  const [result, setResult] = useState<{ [key: string]: any }>({});
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [stream, setStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState<any>([]);
  const [streamContentString, setStreamContentString] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(0); // Track currently active history
  const [sessionChats, setSessionChats] = useState<any[]>([]); // State for chats of the active session
  const [showHistoryDebug, setShowHistoryDebug] = useState<boolean | any>(
    false,
  );
  const [pendingHistory, setPendingHistory] = useState<boolean>(false);
  const [cookies, setCookie] = useCookies(["settings"]);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [uuids, setUuids] = useState<{ [sessionUid: string]: string[] }>({}); // Hierarchical UUIDs
  // @ts-expect-error - to be used soon
  const [scrollToBottomVisible, setScrollToBottomVisible] = useState(false);
  // @ts-expect-error - to be used soon
  const [scrollToTopVisible, setScrollToTopVisible] = useState(false);

  const queryFieldRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);
  const chatListRef = useRef<HTMLUListElement>(null);

  const { handleCopy, isShowingSuccess } = useCopyHandler();

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
  const saveHistory = async (session: any) => {
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
        // New session
        setHistory((prevHistory) => [...prevHistory, savedSession]);

        // Update uuids with the new session ID and an empty array for its chats
        setUuids((prevUuids) => ({ ...prevUuids, [savedSession.id]: [] }));
        setActiveHistoryIndex(history.length); // New item is active
      } else {
        // Existing session updated
        setHistory((prevHistory) =>
          prevHistory.map((s) => (s.uid === session.uid ? savedSession : s)),
        );
      }

      return savedSession;
    } catch (error) {
      console.error("Error saving session (history):", error);
    }
  };

  const createNewHistoryItem = async () => {
    const newSession = {
      name: "Chat on " + new Date().toLocaleString(),
      model: selectedModel,
      temperature: temperature,
      created_dt: new Date().toISOString(),
      updated_dt: new Date().toISOString(),
    };

    try {
      await saveHistory(newSession); // Use saveHistory to POST
    } catch (error) {
      console.error("Error creating new session:", error);
    }
  };

  const loadChatsForSession = async (sessionUid: string) => {
    try {
      const response = await fetch(`${serverUrl}/session/${sessionUid}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { chats } = await response.json();
      return chats || [];
    } catch (error) {
      console.error(`Error loading chats for session ${sessionUid}:`, error);
      return [];
    }
  };

  /**
   * Handle user chat query from QueryBox
   */
  const handleQuery = (event: React.ChangeEvent<HTMLInputElement> | string) => {
    const value = isString(event) ? event : event.target.value;
    setQuery(value);
  };

  /**
   * Handler for Send button in QueryBox
   */
  const handleSend = useCallback(
    (event: React.FormEvent) => {
      event?.preventDefault();
      setSending(true);
    },
    [query, selectedModel, temperature, stream],
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
  ) => {
    try {
      const currentSessionUid = sessionUid
        ? sessionUid
        : history[activeHistoryIndex]?.uid;
      const newChatUid = slugid.nice();
      setUuids((prev) => ({
        ...prev,
        [currentSessionUid]: [...(prev[currentSessionUid] || []), newChatUid],
      }));
      const response = await fetch(`${serverUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trim(query),
          model,
          temperature,
          stream,
          sessionUid: currentSessionUid,
        }),
        signal: controller.signal,
      });

      // might use these to match the request
      //const _sessionUid = response.headers.get("X-Session-Uid") || "";
      // @ts-ignore
      const _chatUid = response.headers.get("X-Chat-Uid") || "";
      setStreamContent([]);
      setStreamContentString("");
      setResult({});

      if (stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let finalContent = ""; // Full response string

        const processChunk = (chunk: string) => {
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                setStreamContent((prev: any) => [...prev, data]);
                const hasChoices = has(data, [
                  "choices",
                  0,
                  "delta",
                  "content",
                ]);
                finalContent += !hasChoices
                  ? data.message.content
                  : get(data, ["choices", 0, "delta", "content"]);
                setStreamContentString((prev) => prev + data.message.content); // Real-time string for display
              } catch (error) {
                console.error("Error parsing JSON:", error, line);
              }
            }
          }
        };

        const readStream = async (): Promise<void> => {
          const { done, value } = (await reader?.read()) || {};
          if (done) {
            // Construct the complete chat object using finalContent
            const newChat = { query, result: { content: finalContent } };
            setSessionChats((prevChats) => [...prevChats, newChat]); // Update sessionChats directly
            // Update session with the new chat array (for persistence)
            const updatedSession = {
              ...history[activeHistoryIndex],
            };

            try {
              await saveHistory(updatedSession);
            } catch (e) {
              console.error("Error saving session", e);
            }
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          processChunk(chunk);
          await readStream(); // Recurse
        };

        await readStream();
        setResult(streamContent);
        return finalContent; // Return the resulting string
      } else {
        const _result = await response.json();
        setResult(_result || {});
        return JSON.stringify(_result);
      }
    } catch (error: any) {
      setResult({
        content: `Request failure`,
      });
      return false;
    }
  };

  /**
   * Delete specific history item
   * @param {integer} index - History item by index
   */
  const handleDeleteHistoryMessage = async (uid: string) => {
    console.log({ uid });
    try {
      const currentSession = history[activeHistoryIndex];

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
      setSessionChats(sessionChats.filter((val) => val.uid !== uid));
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
    let _activeHistoryIndex = 0;
    // Show the scroll-to-<top|bottom> arrows if there are this many chats
    const arrowChatThreshold = size(sessionChats) > 5;
    if (!has(history, [activeHistoryIndex])) {
      // Active history item index might have been deleted
      _activeHistoryIndex = history.length - 1;
      setActiveHistoryIndex(_activeHistoryIndex);
    } else {
      _activeHistoryIndex = activeHistoryIndex;
    }
    const lastHistoryItem = history[_activeHistoryIndex] || [];
    const lastHistoryChat = last(sessionChats) || {};
    const isDuplicate =
      query &&
      lastHistoryChat &&
      query === get(lastHistoryChat, "query") &&
      last(uuids[lastHistoryItem.sessionUid]) ===
        get(lastHistoryChat, "chatUid");

    //Combine history and current query for display, filtering out the duplicate last message if needed
    const chatToDisplay = [
      ...(sessionChats || []),
      sending && !isDuplicate
        ? {
            query,
            reply: stream ? streamContentString : result,
            chatUid: last(
              uuids[get(history, [activeHistoryIndex, "sessionUid", "chat"])] ||
                [],
            ),
          }
        : null, // Last duplicate filtered out below
    ].filter(Boolean);
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
                  <React.Fragment key={`chat-item-${index}`}>
                    <ListItem sx={sxChatMeItem}>
                      <ListItemText
                        primaryTypographyProps={{ component: "div" }}
                        secondaryTypographyProps={{ component: "div" }}
                        primary={chat.query}
                        secondary={
                          <Stack
                            direction="row"
                            spacing={1}
                            justifyContent="right"
                            alignItems="center"
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
                                  onClick={() =>
                                    setShowHistoryDebug(get(history, [index]))
                                  }
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
                            primaryTypographyProps={{ component: "div" }}
                            secondaryTypographyProps={{ component: "div" }}
                            primary={
                              <ReactMarkdown
                                className="results-box"
                                remarkPlugins={[remarkGfm]}
                              >
                                {get(chat, "reply", "")}
                              </ReactMarkdown>
                            }
                            secondary={
                              <Stack
                                direction="row"
                                spacing={1}
                                justifyContent="left"
                                alignItems="center"
                              >
                                <small>{"(LLM)"}</small>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleCopy(chat.query, `response-${index}`)
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
                    <ChevronRight style={{ transform: "rotate(-90deg)" }} />{" "}
                  </IconButton>
                )
              }
            </List>
          </CardContent>
        </Card>
        <Dialog
          scroll="paper"
          open={showHistoryDebug !== false}
          onClose={() => setShowHistoryDebug(false)}
        >
          <DialogTitle>History Item Information</DialogTitle>
          <DialogContent dividers={true} className="debug-DialogContent">
            <h4>Query and response</h4>
            <CodeFormat
              code={JSON.stringify(showHistoryDebug, null, 2)}
              language="json"
            />
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

    return (
      <Dialog open={showDebug} fullWidth={true} maxWidth="xl">
        <DialogTitle>Debug Data</DialogTitle>
        <DialogContent>
          <h4>LLM Response</h4>
          <Card>
            <CardContent>
              <CodeFormat
                code={result ? JSON.stringify(debugResult, null, 2) : ""}
                language="json"
              />
            </CardContent>
          </Card>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setShowDebug(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  /**
   * Get the initial list of available LLMs from the Ollama service
   */
  useEffect(() => {
    let availableModels: string[] = [];
    const _fetchModels = async () => {
      availableModels = await apiListModels();
      setModels(availableModels);
    };
    _fetchModels();

    // Load settings from cookies
    const savedSettings = cookies.settings || {};
    setTemperature(savedSettings.temperature || 0.7);
    setStream(savedSettings.stream || stream);
    setSidebarOpen(savedSettings.sidebarOpen || sidebarOpen);
    setSelectedModel(
      savedSettings.model || selectedModel || availableModels[0],
    );

    const _fetchHistory = async () => {
      const initialHistory = await loadHistory(); // Load sessions as history
      setHistory(initialHistory);

      if (!initialHistory.length) {
        await createNewHistoryItem(); // Create initial session
      } else {
        const initialUuids: Record<string, string[]> = {};
        const session = initialHistory[0];
        const chats = await loadChatsForSession(session.uid);
        initialUuids[session.uid] = (chats || []).map((chat: any) => chat.uid);

        setUuids(initialUuids);

        setActiveHistoryIndex(0); // First item from DB

        // Load chats for the initially active session
        const initialChats = await loadChatsForSession(initialHistory[0].uid);
        setSessionChats(initialChats);
      }
      setLoading(false);
    };

    _fetchHistory();
  }, []);

  //  Update sessionChats whenever the activeHistoryIndex changes
  useEffect(() => {
    const _loadSessionChats = async () => {
      if (history.length > 0 && loading === false) {
        const currentSession = history[activeHistoryIndex];
        const chats = await loadChatsForSession(currentSession.uid);
        setSessionChats(chats);
      }
    };
    _loadSessionChats();
  }, [activeHistoryIndex, history]);

  // Scroll to the bottom of the StreamingResultBox on updates
  useEffect(() => {
    streamingEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sending, streamContent, result]);

  // Send the API chat request once there's a query and sending status.
  useEffect(() => {
    if (query && sending) {
      controllerRef.current = new AbortController();
      console.log({ SendingQuery: query, selectedModel, temperature, stream });

      // Clear previous results *BEFORE* sending the new query
      setStreamContent([]);
      setStreamContentString("");
      setResult({}); // Clear for both stream and non-stream cases

      apiSendQuery(
        query,
        selectedModel,
        temperature,
        stream,
        history[activeHistoryIndex]?.sessionUid,
        controllerRef.current,
      ).then(() => {
        setSending(false);
        setPendingHistory(true);
      });
    }
  }, [sending, query, selectedModel, temperature, stream, activeHistoryIndex]);

  /**
   * Save to history
   */
  useEffect(() => {
    if (
      pendingHistory &&
      sending === false &&
      query &&
      ((stream && size(streamContent) && size(streamContentString)) ||
        (!stream && size(result)))
    ) {
      const currentSession = history[activeHistoryIndex];
      const updatedSession = {
        ...currentSession,
        model: selectedModel,
        temperature,
        updated_dt: new Date().toISOString(),
      };

      saveHistory(updatedSession)
        .then((updatedSession) => {
          // Use the updated session returned by saveHistory
          setPendingHistory(false);
          setQuery("");

          const chatUid = last(uuids[updatedSession.id]);

          setUuids((prevUuids) => ({
            ...prevUuids,
            [updatedSession.id]: [
              ...(prevUuids[updatedSession.id] || []),
              chatUid,
            ],
          }));

          // Update the history state with the returned savedSession
          setHistory((prevHistory) =>
            prevHistory.map((s) =>
              s.id === updatedSession.id ? updatedSession : s,
            ),
          );
        })
        .catch((error) => {
          console.error("Error updating history", error);
        });
    }
  }, [
    stream,
    sending,
    result,
    streamContent,
    streamContentString,
    pendingHistory,
    uuids,
    query,
    activeHistoryIndex,
    selectedModel,
    temperature,
  ]);

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
        <Grid
          container
          direction="column"
          sx={{ flexGrow: 1, overflow: "hidden" }}
        >
          <Grid
            sx={{
              flexGrow: 1,
              overflowY: "auto",
              marginBottom: 1,
            }}
          >
            <StreamingResultBox />
            <div ref={streamingEndRef} />
          </Grid>
        </Grid>

        {/* QueryBox */}
        <Box
          sx={{
            width: "100%",
            flexShrink: 0, // Prevents QueryBox container from shrinking
            padding: "6px 1px 5px 1px",
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
