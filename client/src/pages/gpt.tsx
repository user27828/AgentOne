/**
 * GPT chat page
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { get, isNumber, isString, last, map, size, trim } from "lodash";
import {
  Button,
  Box,
  Card,
  CardContent,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Drawer,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  Grid2 as Grid,
  InputLabel,
  Stack,
  Switch,
  FormControlLabel,
  Slider,
  SelectChangeEvent,
  CircularProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  ChevronLeft,
  ChevronRight,
  Send as SendIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  PestControl as DebugIcon,
} from "@mui/icons-material";
import { useCookies } from "react-cookie";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeFormat from "../components/CodeFormat";
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
  const savedHistory = localStorage.getItem("queryHistory");
  return savedHistory ? JSON.parse(savedHistory) : [];
};

/**
 * Save updated history to localStorage
 * @param {object} history - History object to store
 */
const saveHistory = (history: any) => {
  localStorage.setItem("queryHistory", JSON.stringify(history));
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

interface QueryBoxProps {
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

  const handleLocalSend = (event: React.FormEvent) => {
    handleQuery(localQuery);
    handleSend(event);
    setLocalQuery("");
    setShowSettings(false); // Close settings panel on send
  };

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

  return (
    <Card>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={12}>
            <form onSubmit={(e) => e.preventDefault()}>
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
                disabled={loading || sending}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Send query.  Press enter or click this button to send. Shift+Enter for newlines.">
                          <IconButton
                            component="label"
                            role={undefined}
                            onClick={handleLocalSend}
                            disabled={sending}
                          >
                            <SendIcon color={sending ? "inherit" : "primary"} />
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
                            <CancelIcon color={sending ? "error" : "inherit"} />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
              />
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
                    disabled={loading || sending}
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
                    disabled={loading || sending}
                    sx={{ mb: 1 }}
                  >
                    <InputLabel>Temperature</InputLabel>
                    <Tooltip
                      title={`Currently: ${temperature}.  Randomness of results/"truth" vs "creativity"`}
                    >
                      <Slider
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
  const [history, setHistory] = useState(loadHistory());
  const [showHistoryDebug, setShowHistoryDebug] = useState<boolean | any>(
    false,
  );
  const [pendingHistory, setPendingHistory] = useState<boolean>(false);
  const [cookies, setCookie] = useCookies(["settings"]);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);

  /**
   * Get the initial list of available LLMs from the Ollama service
   */
  useEffect(() => {
    const fetchModels = async () => {
      const availableModels = await apiListModels();
      setModels(availableModels);
      setLoading(false);
      if (availableModels.length > 0) {
        const defaultModel = cookies.settings?.model || availableModels[0];
        setSelectedModel(defaultModel);
        setCookie(
          "settings",
          { ...cookies.settings, model: defaultModel },
          {
            path: "/",
            sameSite: "lax",
          },
        );
      }
    };
    fetchModels();

    // Load settings from cookies
    const savedSettings = cookies.settings || {};
    setTemperature(savedSettings.temperature || 0.7);
    setStream(savedSettings.stream || stream);
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
    [query, selectedModel],
  );

  /**
   * Send a query to the LLM server for evaluation
   * @param {string} query - User query
   * @param {string} model - Selected LLM model
   * @param {number} temperature - LLM temperature
   * @param {boolean} stream - Stream response?
   * @param {object} controller - Fetch controller for aborting
   * @returns {JSON} - JSON object or stream of objects
   */
  const apiSendQuery = async (
    query: string,
    model: string,
    temperature: number,
    stream: boolean,
    controller: AbortController,
  ) => {
    const response = await fetch(`${serverUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trim(query), model, temperature, stream }),
      signal: controller.signal,
    });
    if (response.ok) {
      setStreamContent([]);
      setStreamContentString("");

      if (stream) {
        let _result = "";
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let data = {};
        while (true) {
          const { done, value } = (await reader?.read()) || {};
          if (done) break;
          _result += decoder.decode(value, { stream: true });
          // Process each line of data
          const lines: string[] = _result ? _result.split("\n") : [];
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.trim()) {
              data = JSON.parse(line);
              setStreamContent((prev: any) => [...prev, data]);
              setStreamContentString(
                (prev: string) => prev + get(data, "message.content"),
              );
            }
          }
          // Keep the last partial line in the buffer
          _result = lines[lines.length - 1];
        }
        setResult({ ...data, content: _result });
        return _result;
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
        controllerRef.current,
      ).then(() => {
        setSending(false);
        setPendingHistory(true);
      });
    }
  }, [query, sending]);

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
      if (stream) {
        const lastObject = last(streamContent) || {};
        _result = {
          ...lastObject,
          content: streamContentString,
          message: { role: get(lastObject, "message.role"), content: "" },
        };
      } else {
        _result = result;
      }
      const newHistoryItem = { query, result: _result };
      const updatedHistory = [...history, newHistoryItem];
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
  ]);

  /**
   * Delete specific history item
   * @param {integer} index - History item by index
   */
  const handleDeleteHistoryItem = (index: number) => {
    const updatedHistory = history.filter(
      (_: unknown, i: number) => i !== index,
    );
    setHistory(updatedHistory);
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

  /**
   * LLM results
   * @component
   * @returns {JSX.Element}
   */
  const StreamingResultBox = () => {
    /**
     * Display an <Item> pair for the chat "gpt" vs "me"
     */
    interface ItemPairProps {
      index: number | string;
      me: string;
      gpt: string;
      realtime?: boolean | null;
      sending?: boolean | null;
      source?: string | null;
    }
    const ItemPair: React.FC<ItemPairProps> = ({
      index,
      me,
      gpt,
      realtime = false,
      sending = false,
      source = null,
    }) => {
      const lastHistoryItem = last(history) || [];
      // const lastHistoryQuery = get(lastHistoryItem, "query");
      const lastHistoryResult =
        get(lastHistoryItem, "result.content") ||
        get(lastHistoryItem, "result.message.content");
      const showMyMessage =
        // Show all history messages
        !realtime ||
        // Show realtime messages where the source isn't history,
        // GPT said something, and my realtime query isn't the last history query
        (realtime &&
          source !== "history" &&
          size(gpt) &&
          me !== get(lastHistoryItem, "query"));
      const showReply =
        (!realtime && size(trim(gpt)) > 0) ||
        (realtime && source !== "history" && gpt !== lastHistoryResult);

      return (
        <React.Fragment key={`container-${index}`}>
          {showMyMessage ? (
            <ListItem key={`me-${index}`} sx={sxChatMeItem}>
              <ListItemText
                primaryTypographyProps={{ component: "div" }}
                secondaryTypographyProps={{ component: "div" }}
                primary={me}
                secondary={
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="right"
                    alignItems="center"
                  >
                    <small>{"(Me)"}&nbsp;</small>
                    {isNumber(index) && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteHistoryItem(index)}
                        >
                          <DeleteIcon color="warning" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() =>
                            setShowHistoryDebug(get(history, [index]))
                          }
                        >
                          <InfoIcon color="primary" />
                        </IconButton>
                      </>
                    )}
                  </Stack>
                }
                sx={
                  !realtime
                    ? sxChatMeItemText
                    : { ...sxChatMeItemText, opacity: sending ? 0.5 : 0.9 }
                }
              />
            </ListItem>
          ) : (
            <React.Fragment />
          )}
          {/* Don't display the last history item's response if it duplicates the realtime response */}
          {showReply ? (
            <ListItem key={`response-${index}`} sx={sxGptItem}>
              <ListItemText
                primaryTypographyProps={{ component: "div" }}
                primary={
                  <ReactMarkdown
                    className="results-box"
                    remarkPlugins={[remarkGfm]}
                  >
                    {gpt}
                  </ReactMarkdown>
                }
                secondary={<small>{"(LLM)"}</small>}
                sx={sxGptItemText}
              ></ListItemText>
            </ListItem>
          ) : (
            <React.Fragment />
          )}
        </React.Fragment>
      );
    };

    return (
      <>
        <Card>
          <CardContent>
            <List dense={true}>
              {/* History items */}
              {size(history) ? (
                map(
                  history,
                  (chat, index) =>
                    chat && (
                      <ItemPair
                        key={`component-call-history-${index}`}
                        {...{
                          index,
                          me: chat.query,
                          gpt: get(
                            chat,
                            "result.content",
                            get(chat, "result.message.content"),
                          ),
                          realtime: false,
                          source: "history",
                        }}
                      />
                    ),
                )
              ) : (
                <ListItem key="_default">
                  <ListItemText>
                    Please ask me something, or else my matricies will rust! 😟
                  </ListItemText>
                </ListItem>
              )}
              {/* Realtime/current item */}
              {query ||
              streamContentString ||
              get(result, "message.content") ||
              get(result, "content") ? (
                <ItemPair
                  key={`component-call-realtime`}
                  {...{
                    index: "realtime",
                    me: query,
                    gpt:
                      streamContentString ||
                      get(result, "message.content") ||
                      get(result, "content"),
                    realtime: true,
                    sending,
                  }}
                />
              ) : (
                <React.Fragment />
              )}
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
            <IconButton onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Sidebar Content */}
        {sidebarOpen && (
          <Box sx={{ padding: "45px 10px 10px 10px" }}>
            Hi, I'm a sidebar. In the future, I will contain a history of user
            sessions.
          </Box>
        )}
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
