/**
 * GPT chat page
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { get, has, isString, last, range, size, trim } from "lodash";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid2 as Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  Add,
  Cancel as CancelIcon,
  ChevronLeft,
  ChevronRight,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  MoreVert,
  MoveDown,
  PestControl as DebugIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  ThumbUp as ThumbUpIcon,
} from "@mui/icons-material";
import { useCookies } from "react-cookie";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeFormat from "../components/CodeFormat";
import slugid from "slugid";
import "../App.css";

const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

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
 * Load stored history from localStorage
 * @returns {JSON} - History list
 */
const loadHistory = () => {
  const savedHistory = localStorage.getItem("history");
  return savedHistory ? JSON.parse(savedHistory) : [];
};

/**
 * Save updated history to localStorage
 * @param {object} history - History object to store
 */
const saveHistory = (history: any) => {
  localStorage.setItem("history", JSON.stringify(history));
};

/**
 * Fetch a list of available models from the LLM server
 * @returns {array} - List of models and their properties
 */
const apiListModels = async () => {
  const response = await fetch(`${serverUrl}/list-models`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (response.status && response.status === 200) {
    const models = await response.json();
    return models;
  }
  return [];
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

interface QueryBoxProps {
  query: string;
  queryFieldRef?: any;
  handleQuery: (event: React.ChangeEvent<HTMLInputElement> | string) => void;
  handleSend: (event: React.FormEvent) => void;
  handleCancel: () => void;
  models: string[];
  selectedModel: string;
  handleModelChange: (event: SelectChangeEvent<any>) => void;
  temperature: number;
  handleTemperatureChange: (event: Event, value: number | number[]) => void;
  stream: boolean;
  handleStreamChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
  sending: boolean;
  showDebug: boolean;
  setShowDebug: (showDebug: boolean) => void;
}

/**
 * Query box and settings component
 * @component
 * @param param0
 * @returns {JSX.Element}
 */
const QueryBox: React.FC<QueryBoxProps> = ({
  query,
  queryFieldRef,
  handleQuery,
  handleSend,
  handleCancel,
  models,
  selectedModel,
  handleModelChange,
  temperature,
  handleTemperatureChange,
  stream,
  handleStreamChange,
  loading,
  sending,
  showDebug,
  setShowDebug,
}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [localQuery, setLocalQuery] = useState<string>("");

  // No need to send this outside of this component
  const handleLocalQuery = (event: React.ChangeEvent<HTMLInputElement>) =>
    setLocalQuery(event.target.value);

  /**
   * Handle the "Enter" button as submit
   * @param {object} event
   */
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Prevent the default "Enter" behavior to avoid newline in TextField
      handleLocalSend(event);
    }
  };

  const handleLocalSend = (event: React.FormEvent) => {
    event.preventDefault();
    handleQuery(localQuery);
    handleSend(event);
    setLocalQuery("");
    setShowSettings(false); // Close settings panel on send
  };

  useEffect(() => setLocalQuery(query), [query]);

  return (
    <Card>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={12}>
            <form onSubmit={(e) => e.preventDefault()}>
              <Tooltip
                title={
                  !size(models)
                    ? "Loading models... or no models available"
                    : null
                }
              >
                <TextField
                  multiline
                  maxRows={5}
                  value={localQuery}
                  onChange={handleLocalQuery}
                  onKeyDown={handleKeyPress}
                  placeholder={
                    !sending ? "Enter a query" : "(Waiting for response...)"
                  }
                  fullWidth
                  disabled={loading || sending || !size(models)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Send query.  Press enter or click this button to send. Shift+Enter for newlines.">
                            <IconButton
                              component="label"
                              role={undefined}
                              onClick={handleLocalSend}
                              disabled={sending || !size(models)}
                            >
                              <SendIcon
                                color={
                                  sending || !size(models)
                                    ? "inherit"
                                    : "primary"
                                }
                              />
                            </IconButton>
                          </Tooltip>
                          &nbsp;&nbsp;
                          <Tooltip title="Cancel processing query">
                            <IconButton
                              component="label"
                              role={undefined}
                              onClick={handleCancel}
                              disabled={!sending}
                            >
                              <CancelIcon
                                color={sending ? "error" : "inherit"}
                              />
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                  inputRef={queryFieldRef}
                />
              </Tooltip>
            </form>
          </Grid>
          <Grid container size={12}>
            <Grid container size={1}>
              <Grid size={6}>
                <Tooltip title="Settings: Model, temperature, stream, etc">
                  <IconButton onClick={() => setShowSettings(!showSettings)}>
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
              </Grid>
              <Grid size={6}>
                <Tooltip title="Show debug dialog">
                  <IconButton onClick={() => setShowDebug(!showDebug)}>
                    <DebugIcon />
                  </IconButton>
                </Tooltip>
              </Grid>
            </Grid>
            <Grid size={11}>
              {/* Collapsible Settings Panel */}
              {showSettings && (
                <Collapse in={showSettings}>
                  <FormControl
                    fullWidth
                    disabled={loading || sending || !size(models)}
                    sx={{ mb: 1 }}
                  >
                    <InputLabel>Model</InputLabel>
                    <Select
                      label="Model"
                      value={loading ? "" : selectedModel}
                      onChange={handleModelChange}
                    >
                      {loading ? (
                        <MenuItem value="">
                          <em>Loading...</em>
                          <CircularProgress
                            size={20}
                            style={{ marginLeft: 10 }}
                          />
                        </MenuItem>
                      ) : (
                        models &&
                        models.map((model) => (
                          <MenuItem key={model} value={model}>
                            {model}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                  <FormControl
                    fullWidth
                    disabled={loading || sending || !size(models)}
                    sx={{ mb: 1 }}
                  >
                    <InputLabel>Temperature</InputLabel>
                    <Tooltip
                      title={`Currently: ${temperature}.  Randomness of results/"truth" vs "creativity"`}
                    >
                      <Slider
                        disabled={!size(models)}
                        value={temperature}
                        onChange={handleTemperatureChange}
                        step={0.1}
                        marks
                        min={0}
                        max={1}
                      />
                    </Tooltip>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Tooltip title="Display results as they arrive from the API">
                        <Switch
                          disabled={!size(models)}
                          checked={stream}
                          onChange={handleStreamChange}
                        />
                      </Tooltip>
                    }
                    label="Stream"
                    disabled={loading || sending}
                  />
                </Collapse>
              )}
            </Grid>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
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
  const [history, setHistory] = useState<any[]>(loadHistory());
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(0); // Track currently active history
  const [showHistoryDebug, setShowHistoryDebug] = useState<boolean | any>(
    false,
  );
  const [pendingHistory, setPendingHistory] = useState<boolean>(false);
  const [cookies, setCookie] = useCookies(["settings"]);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [uuids, setUuids] = useState<{ [sessionUid: string]: string[] }>({}); // Hierarchical UUIDs
  const [scrollToBottomVisible, setScrollToBottomVisible] = useState(false);
  const [scrollToTopVisible, setScrollToTopVisible] = useState(false);

  const queryFieldRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);
  const chatListRef = useRef<HTMLUListElement>(null);

  const { handleCopy, isShowingSuccess } = useCopyHandler();

  const createNewHistoryItem = () => {
    const sessionUid = slugid.nice(); // Generate new session ID
    const chatUid = slugid.nice(); // Generate initial chat ID for the session

    const newHistoryItem = {
      name: "Chat on " + new Date().toLocaleString(),
      model: selectedModel,
      temperature: temperature,
      created_dt: new Date().toISOString(),
      updated_dt: new Date().toISOString(),
      sessionUid: sessionUid,
      chat: [],
    };

    setHistory((prevHistory) => [...prevHistory, newHistoryItem]);
    setActiveHistoryIndex(history.length); // Set new item as active
    saveHistory([...history, newHistoryItem]);
    setUuids((prevUuids) => ({
      ...prevUuids,
      [sessionUid]: [chatUid],
    })); // Update UI
  };

  /**
   * Get the initial list of available LLMs from the Ollama service
   */
  useEffect(() => {
    let availableModels: string[] = [];
    const _fetchModels = async () => {
      availableModels = await apiListModels();
      setModels(availableModels);
      setLoading(false);
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

    // Initialize history if it's empty, creating the first history item
    if (!history.length) {
      createNewHistoryItem();
    } else {
      const _activeHistoryIndex = history.length - 1;
      setActiveHistoryIndex(_activeHistoryIndex);
    }
  }, []);

  // Scroll to the bottom of the StreamingResultBox on updates
  useEffect(() => {
    streamingEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sending, streamContent, result]);

  const handleQuery = (event: React.ChangeEvent<HTMLInputElement> | string) => {
    const value = isString(event) ? event : event.target.value;
    setQuery(value);
  };

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
    const currentSessionUid = sessionUid
      ? sessionUid
      : history[activeHistoryIndex]?.sessionUid;
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
    if (response.ok) {
      // might use these to match the request
      //const _sessionUid = response.headers.get("X-Session-Uid") || "";
      //const _chatUid = response.headers.get("X-Chat-Uid") || "";
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
                finalContent += data.message.content;
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
    }
    setResult({
      content: `[Invalid server response - ${response.status} ${response.statusText}]`,
    });
    return false;
  };

  // Send the API request once there's a query and sending status.
  useEffect(() => {
    if (query && sending) {
      controllerRef.current = new AbortController();
      console.log({ SendingQuery: query, selectedModel, temperature, stream });

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
      // Local history
      let _result = {};
      const updatedHistory = [...history];
      const currentHistoryItem = updatedHistory[activeHistoryIndex];

      if (stream) {
        const lastObject = last(streamContent) || {};
        _result = {
          ...lastObject,
          content: streamContentString,
          message: {
            role: get(lastObject, "message.role"),
            content: "",
          },
        };
      } else {
        _result = result;
      }

      const updatedHistoryItem = {
        ...currentHistoryItem,
        model: selectedModel,
        temperature: temperature,
        updated_dt: new Date().toISOString(),
        chat: [
          ...(currentHistoryItem.chat || []),
          {
            query,
            chatUid: last(uuids[currentHistoryItem.sessionUid] || ""),
            result: _result,
          },
        ],
      };

      updatedHistory[activeHistoryIndex] = updatedHistoryItem;
      setHistory(updatedHistory);
      saveHistory(updatedHistory);
      setPendingHistory(false);
    }
  }, [
    stream,
    sending,
    result,
    streamContent,
    streamContentString,
    pendingHistory,
    uuids,
  ]);

  /**
   * Delete specific history item
   * @param {integer} index - History item by index
   */
  const handleDeleteHistoryMessage = (index: number) => {
    const updatedHistoryChat = history[activeHistoryIndex].chat.filter(
      (_: void, _index: number) => _index !== index,
    );
    const updatedHistory = history;
    updatedHistory[activeHistoryIndex].chat = updatedHistoryChat;
    setHistory([...updatedHistory]);
    saveHistory(updatedHistory);
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

  const handleModelChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedModel(event.target.value as string);
      setCookie(
        "settings",
        { ...cookies.settings, model: event.target.value },
        {
          path: "/",
          sameSite: "lax",
        },
      );
    },
    [cookies, setCookie],
  );

  const handleTemperatureChange = useCallback(
    (_event: Event, value: number | number[]) => {
      setTemperature(value as number);
      setCookie(
        "settings",
        { ...cookies.settings, temperature: value },
        {
          path: "/",
          sameSite: "lax",
        },
      );
    },
    [cookies, setCookie],
  );

  const handleStreamChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setStream(event.target.checked);
      setCookie(
        "settings",
        {
          ...cookies.settings,
          stream: event.target.checked,
        },
        {
          path: "/",
          sameSite: "lax",
        },
      );
    },
    [cookies, setCookie],
  );

  const handleToggleSidebar = useCallback(() => {
    setCookie(
      "settings",
      { ...cookies.settings, sidebarOpen: !sidebarOpen },
      {
        path: "/",
        sameSite: "lax",
      },
    );
    setSidebarOpen(!sidebarOpen);
  }, [sidebarOpen]);

  /**
   * LLM results
   * @component
   * @returns {JSX.Element}
   */
  const StreamingResultBox = () => {
    let _activeHistoryIndex = 0;
    if (!has(history, [activeHistoryIndex])) {
      // Active history item index might have been deleted
      _activeHistoryIndex = history.length - 1;
      setActiveHistoryIndex(_activeHistoryIndex);
    } else {
      _activeHistoryIndex = activeHistoryIndex;
    }
    const lastHistoryItem = history[_activeHistoryIndex] || [];
    const lastHistoryChat = last(lastHistoryItem?.chat) || {};
    const isDuplicate =
      query &&
      lastHistoryChat &&
      query === get(lastHistoryChat, "query") &&
      last(uuids[lastHistoryItem.sessionUid]) ===
        get(lastHistoryChat, "chatUid");

    // Combine history and current query for display, filtering out the duplicate last message if needed
    const chatToDisplay = [
      ...(history[activeHistoryIndex]?.chat || []),
      sending && !isDuplicate
        ? {
            query,
            result: stream ? { content: streamContentString } : result,
            chatUid: last(uuids[history[activeHistoryIndex]?.sessionUid.chat]),
          }
        : null, // Last duplicate filtered out below
    ].filter(Boolean);

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
        // [1] Move the function definition into useEffect
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
          // [2] Wrap in setTimeout
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
                            {index < size(history[activeHistoryIndex].chat) && (
                              <>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleDeleteHistoryMessage(index)
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
                    {chat.result && ( // LLM response
                      <ListItem sx={sxGptItem}>
                        <ListItemText
                          primaryTypographyProps={{ component: "div" }}
                          secondaryTypographyProps={{ component: "div" }}
                          primary={
                            <ReactMarkdown
                              className="results-box"
                              remarkPlugins={[remarkGfm]}
                            >
                              {get(
                                chat,
                                "result.content",
                                get(chat, "result.message.content"),
                              )}
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
                    )}
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
                true && (
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
                true && (
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
   * @component
   */
  const Sidebar = () => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renamingItemIndex, setRenamingItemIndex] = useState<number | null>(
      null,
    );
    const [newName, setNewName] = useState("");
    const renameFieldRef = useRef<HTMLInputElement | null>(null);

    const handleMenuOpen = (
      event: React.MouseEvent<HTMLElement>,
      index: number,
    ) => {
      event.stopPropagation();
      setAnchorEl(event.currentTarget);
      setRenamingItemIndex(index); // index of the item being activated
    };

    const handleMenuClose = (
      event?: React.SyntheticEvent<HTMLElement, Event> | undefined,
      reason?: string,
    ) => {
      event && event.stopPropagation();
      if (reason && reason !== "backdropClick") {
        return;
      }
      setAnchorEl(null);
    };

    const handleRenameClick = (event?: React.MouseEvent<HTMLElement>) => {
      event && event.stopPropagation();
      setRenameDialogOpen(true);
      setNewName(history[renamingItemIndex!]?.name || "");
      handleMenuClose();
    };

    /**
     * Delete a chat session
     */
    const handleDeleteClick = (event?: React.MouseEvent<HTMLElement>) => {
      event && event.stopPropagation();
      if (renamingItemIndex !== null) {
        const updatedHistory = history.filter(
          (_, i) => i !== renamingItemIndex,
        );
        setHistory(updatedHistory);
        saveHistory(updatedHistory);

        if (activeHistoryIndex === renamingItemIndex) {
          // Set new active history or default based on remaining history items.
          setActiveHistoryIndex(
            updatedHistory.length > 0 ? updatedHistory.length - 1 : 0,
          );
        }
        handleMenuClose();
      }
    };

    const handleRenameSave = () => {
      if (renamingItemIndex !== null) {
        const updatedHistory = [...history];
        updatedHistory[renamingItemIndex] = {
          ...updatedHistory[renamingItemIndex],
          name: newName,
        };
        setHistory(updatedHistory);
        saveHistory(updatedHistory);
      }
      setRenameDialogOpen(false);
      setNewName("");
    };

    const handleRenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setNewName(event.target.value);
    };

    const handleNewChat = () => {
      createNewHistoryItem();
    };

    const handleListItemClick = (index: number) => {
      setActiveHistoryIndex(index);
    };

    return (
      <Drawer
        variant="permanent"
        open={sidebarOpen}
        sx={{
          width: sidebarOpen ? 240 : 50, // minimal width when closed
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: sidebarOpen ? 240 : 50,
            transition: "width 0.3s",
            overflow: "hidden", // Prevent content overflow when closed
          },
        }}
      >
        {/* New Chat button */}
        <Tooltip title="New Chat">
          <IconButton
            onClick={handleNewChat}
            sx={{
              position: "absolute",
              // Align against dark mode switcher
              top: sidebarOpen ? 1 : 50,
              right: sidebarOpen ? 1 : "auto",
              left: sidebarOpen ? "auto" : "2px",
            }}
          >
            <Add />
          </IconButton>
        </Tooltip>

        {/* Sidebar Toggle Button */}
        <Box
          sx={{
            display: "flex",
            justifyContent: sidebarOpen ? "flex-end" : "center", // Centered when closed
            position: sidebarOpen ? "absolute" : "absolute", // Position outside when closed
            bottom: 35,
            right: sidebarOpen ? 0 : "-2px", // Adjust to ensure visibility when closed
            zIndex: 1,
            width: "100%",
          }}
        >
          <Tooltip title="Open Sidebar">
            <IconButton onClick={handleToggleSidebar}>
              {sidebarOpen ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Sidebar Content */}
        {sidebarOpen ? (
          <Box
            sx={{
              overflowY: "auto", // Enable vertical scrolling within this box
              overflowX: "hidden",
              flexGrow: 1,
              height: "calc(100vh - (50px + 90px))", //subtract height of New Chat/Toggle, and Bottom area from viewport height
              padding: "10px",
              marginTop: 4,
            }}
          >
            <List>
              {range(history.length - 1, -1, -1).map((index) => {
                // Reverse order (range() is less expensive than slice().reverse())
                const item = history[index];
                return (
                  <ListItem
                    dense
                    disableGutters
                    disablePadding
                    key={index}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        aria-label="more"
                        aria-controls={`menu-${index}`}
                        aria-haspopup="true"
                        onClick={(e) => handleMenuOpen(e, index)}
                      >
                        <MoreVert />
                      </IconButton>
                    }
                    sx={{ mb: 0.5 }}
                  >
                    <ListItemButton
                      dense
                      disableGutters
                      divider
                      selected={index === activeHistoryIndex}
                      onClick={() => handleListItemClick(index)}
                      sx={{
                        paddingLeft: 1,
                        paddingRight: "25px !important",
                        borderRadius: 2,
                      }}
                    >
                      <Tooltip
                        placement="right"
                        arrow
                        title={
                          <React.Fragment>
                            {item.name}
                            <br />
                            Created:{" "}
                            {new Date(item.created_dt).toLocaleString()}
                            <br />
                            Updated:{" "}
                            {new Date(item.updated_dt).toLocaleString()}
                            <br />
                            Chats: {item.chat.length}
                          </React.Fragment>
                        }
                        slotProps={{
                          popper: {
                            modifiers: [
                              {
                                name: "offset",
                                options: {
                                  offset: [0, 20],
                                },
                              },
                            ],
                          },
                        }}
                      >
                        <ListItemText
                          primary={item.name}
                          primaryTypographyProps={{
                            variant: "caption",
                            sx: {
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            },
                          }}
                        />
                      </Tooltip>
                      <Menu
                        id={`menu-${index}`}
                        anchorEl={anchorEl}
                        keepMounted
                        open={Boolean(anchorEl) && renamingItemIndex === index}
                        //onClose={handleMenuClose}
                        onClose={
                          handleMenuClose as (
                            event: {},
                            reason: "backdropClick" | "escapeKeyDown",
                          ) => void
                        }
                      >
                        <MenuItem onClick={handleRenameClick}>Rename</MenuItem>
                        <Divider />
                        <MenuItem onClick={handleDeleteClick}>Delete</MenuItem>
                      </Menu>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ) : (
          <React.Fragment />
        )}
        {/* Bottom static area */}
        <Box
          sx={{
            height: "90px",
            borderTop: "1px solid rgba(0, 0, 0, 0.12)",
            padding: "0 10px 0 5px",
          }}
        >
          {/* Add future features/content here */}
          {sidebarOpen ? (
            <div>&nbsp;</div> //future features
          ) : (
            <React.Fragment />
          )}
        </Box>

        {/* Rename Dialog */}
        <Dialog
          fullWidth
          maxWidth="sm"
          open={renameDialogOpen}
          onClose={() => setRenameDialogOpen(false)}
        >
          <DialogTitle>Rename Chat</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              id="name"
              label="New Name"
              type="text"
              fullWidth
              value={newName}
              onChange={handleRenameChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameSave();
                }
              }}
              inputRef={renameFieldRef}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameSave}>Save</Button>
          </DialogActions>
        </Dialog>
      </Drawer>
    );
  };

  return (
    <Box
      sx={{
        position: "relative",
        height: "100vh",
        display: "flex",
      }}
    >
      <Sidebar />

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
            query={query}
            queryFieldRef={queryFieldRef}
            handleQuery={handleQuery}
            handleSend={handleSend}
            handleCancel={handleCancel}
            models={models}
            selectedModel={selectedModel}
            handleModelChange={handleModelChange}
            temperature={temperature}
            handleTemperatureChange={handleTemperatureChange}
            stream={stream}
            handleStreamChange={handleStreamChange}
            loading={loading}
            sending={sending}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
          />
        </Box>
      </Box>

      <DebuggingResultDialog />
    </Box>
  );
};

export default Gpt;
