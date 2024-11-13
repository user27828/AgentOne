/**
 * GPT chat page
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { isString, trim } from "lodash";
import {
  Button,
  Card,
  CardContent,
  CardActions,
  TextField,
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
} from "@mui/icons-material";
import { useCookies } from "react-cookie";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../App.css";

const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

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
  console.log("serverUrl:", serverUrl);
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
  query: string;
  handleQuery: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSend: () => void;
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
}

/**
 * Query box and settings component
 * @component
 * @param param0
 * @returns {JSX.Element}
 */
const QueryBox: React.FC<QueryBoxProps> = ({
  query,
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
}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);

  return (
    <Card>
      <CardContent>
        {/* Collapsible Settings Panel */}
        <Grid container direction="row" spacing={2} sx={{ pb: 2 }}>
          <Grid size={12}>
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
                <FormControl fullWidth disabled={loading || sending}>
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

        <Grid container direction="row" spacing={2} sx={{ pb: 2 }}>
          <Grid size={1}>
            <Tooltip title="Settings: Model, temperature, stream, etc">
              <IconButton onClick={() => setShowSettings(!showSettings)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Grid>
          <Grid size={11}>
            <TextField
              label="Query"
              multiline
              rows={2}
              maxRows={5}
              value={query}
              onChange={handleQuery}
              placeholder="Enter a query"
              fullWidth
              disabled={loading || sending}
              sx={{ mb: 2 }}
            />
          </Grid>
        </Grid>
      </CardContent>
      <CardActions>
        <Button
          component="label"
          role={undefined}
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleSend}
          disabled={sending}
        >
          Send
        </Button>
        <Button
          component="label"
          role={undefined}
          variant="outlined"
          startIcon={<CancelIcon />}
          onClick={handleCancel}
          disabled={!sending}
        >
          Cancel
        </Button>
      </CardActions>
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
  const controllerRef = useRef<AbortController | null>(null);

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

  const handleQuery = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setQuery(value);
    },
    [],
  );

  const handleSend = useCallback(() => {
    setSending(true);
    controllerRef.current = new AbortController();
    apiSendQuery(
      query,
      selectedModel,
      temperature,
      stream,
      controllerRef.current,
    ).then((res) => {
      if (stream) {
        let chunks = isString(res) ? res.split("\n").filter(Boolean) : false;
        let parsedChunks =
          (chunks && chunks.map((chunk: string) => JSON.parse(chunk))) || [];
        let content = parsedChunks
          .map((chunk: any) => chunk.message.content)
          .join(" ");
        setResult({ ...parsedChunks[parsedChunks.length - 1], content });
      } else {
        setResult((res && JSON.parse(res)) || "[No Data]");
      }
      setSending(false);
    });

    // Local history
    const newHistoryItem = { query, result };
    const updatedHistory = [newHistoryItem, ...history];
    setHistory(updatedHistory);
    saveHistory(updatedHistory);
  }, [query, selectedModel, temperature, stream]);

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
    return (
      <>
        {content ? <h3>Results:</h3> : <p>&nbsp;</p>}
        {content ? (
          <Card>
            <CardContent>
              <ReactMarkdown
                className="results-box"
                remarkPlugins={[remarkGfm]}
              >
                {content}
              </ReactMarkdown>
            </CardContent>
          </Card>
        ) : (
          <p>&nbsp;</p>
        )}
      </>
    );
  };

  /**
   * Debugging box
   * @component
   * @returns {JSX.Element}
   */
  const DebuggingResultBox = () => {
    const debugResult = { ...result };
    return result ? (
      <>
        <h4>Debug data</h4>
        <Card>
          <CardContent>
            <TextField
              multiline
              maxRows={10}
              value={JSON.stringify(debugResult, null, 2)}
              aria-readonly
              fullWidth
              placeholder="Debugging information..."
            />
          </CardContent>
        </Card>
      </>
    ) : (
      <p>&nbsp;</p>
    );
  };

  return (
    <Grid container direction="column" sx={{ width: "100%" }}>
      <Grid>Hello GPT!!1</Grid>
      <Grid>
        <QueryBox
          query={query}
          handleQuery={handleQuery}
          handleSend={handleSend}
          handleCancel={handleCancel}
          // showSettings={showSettings}
          // setShowSettings={setShowSettings}
          models={models}
          selectedModel={selectedModel}
          handleModelChange={handleModelChange}
          temperature={temperature}
          handleTemperatureChange={handleTemperatureChange}
          stream={stream}
          handleStreamChange={handleStreamChange}
          loading={loading}
          sending={sending}
        />
      </Grid>
      <Grid>
        <StreamingResultBox />
      </Grid>
      <Grid>
        <DebuggingResultBox />
      </Grid>
    </Grid>
  );
};

export default Gpt;
