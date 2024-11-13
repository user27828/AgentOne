/**
 * GPT chat page
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { get, isNumber, isString, last, map, trim } from "lodash";
import {
  Button,
  Box,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  Switch,
  FormControlLabel,
  Slider,
  SelectChangeEvent,
  CircularProgress,
  Tooltip,
  Collapse,
  IconButton,
} from "@mui/material";
import {
  Send as SendIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  PestControl as DebugIcon,
} from "@mui/icons-material";
import { useCookies } from "react-cookie";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../App.css";

const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

// CSS for chat
const sxChatMeItem = {
  justifyContent: "flex-end",
  textAlign: "right",
};
const sxChatMeItemText = {
  maxWidth: "94%",
  background: "rgba(0,0,.1,.1)",
  padding: "10px",
  borderRadius: "10px",
  opacity: 0.9,
};

const sxGptItem = { justifyContent: "flex-start", textAlign: "left" };
const sxGptItemText = {
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
const saveHistory = (history: any) =>
  localStorage.setItem("queryHistory", JSON.stringify(history));

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
    if (stream) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let result = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }
        return result;
      }
    } else {
      const result = await response.json();
      return JSON.stringify(result);
    }
  }
  return false;
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
                placeholder="Enter a query"
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
                    <Tooltip title={temperature}>
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
                      <Switch checked={stream} onChange={handleStreamChange} />
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
  const [stream, setStream] = useState<boolean>(false);
  const [history, setHistory] = useState(loadHistory());
  const [cookies, setCookie] = useCookies(["settings"]);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingEndRef = useRef<null | HTMLDivElement>(null);
  const streamingBoxRef = useRef<null | HTMLDivElement>(null);

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
    setStream(savedSettings.stream || false);
  }, []);

  const scrollToBottom = () => {
    if (streamingBoxRef.current && streamingBoxRef.current.scrollHeight) {
      streamingBoxRef.current.scrollTop = streamingBoxRef.current.scrollHeight;
    }
    // if (streamingEndRef.current) {
    //   streamingEndRef.current.scrollIntoView({
    //     behavior: "smooth",
    //     block: "end",
    //   });
    // }
  };

  useEffect(() => {
    scrollToBottom();
  }, [stream, streamingBoxRef]);

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

  // Send the API request once there's a query and sending status.
  useEffect(() => {
    if (query && sending) {
      controllerRef.current = new AbortController();
      console.log({ SendingQuery: query });

      apiSendQuery(
        query,
        selectedModel,
        temperature,
        stream,
        controllerRef.current,
      ).then((res) => {
        let _result = {};
        if (stream) {
          let chunks = isString(res) ? res.split("\n").filter(Boolean) : false;
          let parsedChunks =
            (chunks && chunks.map((chunk: string) => JSON.parse(chunk))) || [];
          let content = parsedChunks
            .map((chunk: any) => chunk.message.content)
            .join(" ");
          _result = { ...parsedChunks[parsedChunks.length - 1], content };
          setResult(_result);
        } else {
          _result = (res && JSON.parse(res)) || {};
          setResult(_result);
        }
        // Local history
        const newHistoryItem = { query, result: _result };
        const updatedHistory = [...history, newHistoryItem];
        setHistory(updatedHistory);
        saveHistory(updatedHistory);
        setSending(false);
      });
    }
  }, [query, sending]);

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
    (event: Event, value: number | number[]) => {
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
    const [content, setContent] = useState<string>("");
    useEffect(() => {
      if (stream && result.content) {
        setContent(result.content);
      } else if (!stream && result.message) {
        setContent(result.message.content);
      }
    }, [result, stream]);

    interface ItemPairProps {
      index: number | string;
      me: string;
      gpt: string;
      realtime?: boolean | null;
      sending?: boolean | null;
    }
    const ItemPair: React.FC<ItemPairProps> = ({
      index,
      me,
      gpt,
      realtime = false,
      sending = false,
    }) => {
      const lastHistoryItem = last(history) || [];
      const lastHistoryQuery = get(lastHistoryItem, "query");
      const lastHistoryResult = get(lastHistoryItem, "result.message.content");

      return (
        <>
          {!realtime && (
            <ListItem key={`me-${index}`} sx={sxChatMeItem}>
              <ListItemText
                primary={me}
                secondary={
                  <Grid
                    container
                    direction="row"
                    justifyContent="right"
                    alignItems="center"
                  >
                    <Grid>(You)</Grid>
                    <Grid>
                      {isNumber(index) && (
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteHistoryItem(index)}
                        >
                          <DeleteIcon color="warning" />
                        </IconButton>
                      )}
                    </Grid>
                  </Grid>
                }
                sx={
                  !realtime
                    ? sxChatMeItemText
                    : { ...sxChatMeItemText, opacity: sending ? 0.5 : 0.9 }
                }
              />
            </ListItem>
          )}
          {/* Don't display the last history item's response */}
          {!(me !== lastHistoryQuery && realtime) &&
            !(realtime && gpt === lastHistoryResult) && (
              <ListItem key={`response-${index}`} sx={sxGptItem}>
                <ListItemText
                  primary={
                    <ReactMarkdown
                      className="results-box"
                      remarkPlugins={[remarkGfm]}
                    >
                      {gpt}
                    </ReactMarkdown>
                  }
                  secondary={"(LLM)"}
                  sx={sxGptItemText}
                ></ListItemText>
              </ListItem>
            )}
        </>
      );
    };

    return (
      <Card>
        <CardContent>
          <List dense={true}>
            {map(
              history,
              (chat, index) =>
                chat && (
                  <ItemPair
                    {...{
                      index,
                      me: chat.query,
                      gpt: get(chat, "result.message.content", ""),
                      realtime: false,
                    }}
                  />
                ),
            )}
            {query && content && (
              <ItemPair
                {...{
                  index: "rt",
                  me: query,
                  gpt: content || "Ask me anything",
                  realtime: true,
                  sending,
                }}
              />
            )}
          </List>
        </CardContent>
      </Card>
    );
  };

  /**
   * Debugging box
   * @component
   * @returns {JSX.Element}
   */
  const DebuggingResultDialog = () => {
    const debugResult = { ...result };

    return (
      <Dialog open={showDebug} fullWidth={true} maxWidth="xl">
        <DialogTitle>Debug Data</DialogTitle>
        <DialogContent>
          <h4>LLM Response</h4>
          <Card>
            <CardContent>
              <TextField
                multiline
                maxRows={10}
                value={result ? JSON.stringify(debugResult, null, 2) : ""}
                aria-readonly
                fullWidth
                placeholder="Debugging information..."
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

  return (
    <Box
      sx={{
        position: "relative",
        height: "100vh",
      }}
    >
      <Grid container direction="column" size={12} sx={{ height: "100%" }}>
        <Grid
          ref={streamingBoxRef}
          sx={{ flexGrow: 1, overflowY: "auto", pb: 5, mb: 20 }}
        >
          <StreamingResultBox />
          <div ref={streamingEndRef} />
        </Grid>
      </Grid>
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          width: "100%",
          padding: "10px 10px 0 0",
          boxShadow: "0 -2px 5px rgba(0,0,0,0.1)",
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
      <DebuggingResultDialog />
    </Box>
  );
};

export default Gpt;
