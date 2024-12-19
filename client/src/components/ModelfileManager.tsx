/**
 * Modelfile Management utility
 */
import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from "@mui/material";
import {
  Add as AddIcon,
  Cancel as CancelIcon,
  DeleteForever as DeleteIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import { size } from "lodash";
import { serverUrl } from "../../src/pages/gpt";
import { apiListModels } from "../../src/pages/gpt";

interface ModelfileManagerProps {
  open: boolean;
  onClose: () => void;
  models: string[];
  setModels: (state: any) => void;
  selectedModel: string;
  onSave?: (modelfile: any) => void;
  onDelete?: (modelfileId: string) => void;
  onModelCreateUpdate?: (model: string) => void;
  temperature?: number;
  stream?: boolean;
}

/**
 * Modelfile Management component
 * @param {boolean} param0.open - Open dialog state
 * @param {function} param0.onClose - Dialog closing actions
 * @param {array} param0.models - Models selection list from main component
 * @param {function} param0.setModels - Set the parent components model list
 * @param {string} param0.selectedModel - Selected model from parent component, populates setSelectedModelLocal()
 * @param {function} [param0.onSave]
 * @param {function} [param0.onDelete]
 * @param {function} [param0.onModelCreateUpdate]
 * @param {number} [param0.temperature=0.7] - Temperature from parent
 * @param {stream} [param0.stream=true] - Stream results?
 * @returns {React.JSX}
 * @component
 */
const ModelfileManager: React.FC<ModelfileManagerProps> = ({
  open,
  onClose,
  models,
  setModels,
  selectedModel,
  onSave,
  onDelete,
  onModelCreateUpdate,
  temperature = 0.7,
  stream = true,
}) => {
  // @ts-ignore
  // eslint-disable-next-line
  const [modelfileDialogOpen, setModelfileDialogOpen] = useState(false);
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [customModels, setCustomModels] = useState<any>(null);
  const [selectedModelLocal, setSelectedModelLocal] =
    useState<string>(selectedModel);
  const [selectedModelfile, setSelectedModelfile] = useState<any>(null);
  const [modelfileName, setModelfileName] = useState("");
  const [modelfileContent, setModelfileContent] = useState("");
  const [modelfileStreamContent, setModelfileStreamContent] = useState("");
  const [savingModelfile, setSavingModelfile] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    modelfileName?: string;
  }>({});

  // Reset state when the dialog opens (or selectedModel changes)
  useEffect(() => {
    if (open) {
      setSelectedModelfile(null);
      setModelfileName("");
      setModelfileContent("");
      setModelfileStreamContent("");
      setSavingModelfile(false);
      setBaseModels(models);
      models && loadCustomModels();
    }
  }, [open, selectedModelLocal, models]);

  useEffect(() => {
    if (selectedModelLocal && customModels && baseModels) {
      // If a model is pre-selected, load its template content
      if (baseModels.includes(selectedModelLocal)) {
        console.log("loading base template");
        loadModelfileTemplate(selectedModelLocal);
      } else {
        console.log("detected custom model");
        loadModelfile(selectedModelLocal);
      }
    }
  }, [baseModels, customModels, models]);

  /**
   * Get custom model list from endpoint.  Creates and populates values for
   *  setCustomModels() and setBaseModels()
   */
  const loadCustomModels = async () => {
    try {
      const response = await fetch(`${serverUrl}/modelfile/list-custom`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const customModels = await response.json();
      if (customModels) {
        console.log({ models, customModels });
        setCustomModels(
          customModels.filter((v: any) => models.includes(v.baseModel)),
        );
        // Set baseModels - do not include the ones found in custom
        setBaseModels(
          models.filter((v) => !customModels.some((cv: any) => cv.name === v)),
        );
      } else {
        setBaseModels(models);
      }
    } catch (error) {
      console.error("Error loading custom models:", error);
    }
  };

  /**
   * Load a modelfile by it's UID or name
   * @param uidOrName - UID or name of model.  A custom model will always have
   *  a UID and name, whereas base models only name names because their data is
   *  not stored in SQLite
   */
  const loadModelfile = async (uidOrName: string) => {
    try {
      const response = await fetch(`${serverUrl}/modelfile/${uidOrName}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { row } = await response.json();
      console.log({ row });
      setSelectedModelfile(row);
      setModelfileName(row.name);
      setModelfileContent(row.content);
    } catch (error) {
      console.error("Error loading modelfile:", error);
    }
  };

  /**
   * Get a template string from the server, and replace some strings
   * @param {string} model - Base model to return a template for
   */
  const loadModelfileTemplate = async (model: string) => {
    try {
      const response = await fetch(`${serverUrl}/modelfile/template/${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setModelfileName(model + " Custom Modelfile");
      setModelfileContent(data.template);
    } catch (error) {
      console.error("Error fetching template:", error);
    }
  };

  /**
   * onChange handler for the model dropdown list.  Assigns selectedModelLocal,
   * and initiates loading metadata for the selected model.
   * @param {SelectChangeEvent} event
   */
  const handleModelChangeForModelfile = async (event: SelectChangeEvent) => {
    const value = event.target.value;
    setSelectedModelLocal(value);

    const isCustom = !baseModels.includes(value);
    if (isCustom) {
      console.log("handleModelChangeForModelfile():isCustom");
      loadModelfile(value); // Load the selected custom modelfile
    } else if (!isCustom && value !== "") {
      console.log("handleModelChangeForModelfile():isBase");
      loadModelfileTemplate(value); // Load template for base models
    } else {
      // Handle the case where the model is default.
      setSelectedModelfile(null);
      setModelfileName("");
      setModelfileContent("");
    }
  };

  /**
   * Creates or updates the model when the action button is pressed.
   */
  const handleSaveModelfile = async () => {
    if (Object.keys(formErrors).length > 0) {
      return; // Errors are present
    }
    setSavingModelfile(true);
    setModelfileStreamContent("");
    const isCustomModel = !baseModels.includes(selectedModelLocal);
    const method = selectedModelfile && isCustomModel ? "PUT" : "POST";
    const uid = selectedModelfile?.uid;
    const url = `${serverUrl}/modelfile/${uid ? uid : "create"}`;

    console.log("handleSaveModelfile()", { selectedModelLocal, modelfileName });
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModelLocal,
          name: modelfileName,
          content: modelfileContent,
          stream,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`${response.status} - ${JSON.stringify(errorData)}`);
      }

      const savedModelfile = await response.json();
      onSave && onSave(savedModelfile); // Callback

      if (stream && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullStreamContent = ""; // Accumulate the entire stream

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true }); // Decode as stream
            fullStreamContent += chunk; // Accumulate

            const parsedMessages = fullStreamContent
              .split("\n\n")
              .filter((s) => s.trim() !== "")
              .map((msg) => {
                try {
                  return JSON.parse(msg.replace(/^data: /, ""));
                } catch (e) {
                  console.error("JSON parse error", e, msg);
                  return msg;
                }
              });

            setModelfileStreamContent(JSON.stringify(parsedMessages, null, 2));
          }
          // Process the complete response string HERE, not inside the loop
          const finalParsedMessages = fullStreamContent
            .split("\n\n")
            .filter((s) => s.trim() !== "")
            .map((msg) => {
              try {
                return JSON.parse(msg.replace(/^data: /, ""));
              } catch (e) {
                console.error("JSON parse error", e, msg);
                return msg;
              }
            });
          setModelfileStreamContent(
            JSON.stringify(finalParsedMessages, null, 2),
          );
        } finally {
          reader?.releaseLock();
        }
      }
    } catch (error: any) {
      console.error("Error saving modelfile:", error);
      setModelfileStreamContent("Error: " + error.message);
    } finally {
      setSavingModelfile(false);
      const _fetchModels = async () => {
        const availableModels = await apiListModels();
        setModels(availableModels); // Update parent model list
      };
      _fetchModels();
    }
    onModelCreateUpdate && onModelCreateUpdate(selectedModelLocal);
  };

  /**
   * Delete the selected modelfile
   */
  const handleDeleteModelfile = async () => {
    if (
      !selectedModelfile ||
      !window.confirm(`Delete Modelfile: ${selectedModelfile.name}?`)
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${serverUrl}/modelfile/${selectedModelfile.uid}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            model: selectedModelfile.name,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      onDelete && onDelete(selectedModelfile.uid); // Callback
    } catch (error) {
      console.error("Error deleting modelfile:", error);
    } finally {
      setModelfileDialogOpen(false);
      onClose();
    }
  };

  const handleModelfileNameChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    const errors = { ...formErrors };

    if (val.includes(" ")) {
      errors.modelfileName = "Modelfile name cannot contain spaces.";
    } else if (baseModels.includes(val)) {
      errors.modelfileName =
        "Modelfile name cannot be the same as a base model";
    } else {
      delete errors.modelfileName;
    }

    setModelfileName(val);
    setFormErrors(errors);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>Manage Modelfiles</DialogTitle>
      <DialogContent>
        {/* Model Selection */}
        <FormControl
          fullWidth
          disabled={size(baseModels) + size(customModels) < 1}
        >
          <InputLabel id="model-select-label">Models</InputLabel>
          <Select
            labelId="model-select-label"
            id="model-select"
            value={selectedModelLocal}
            onChange={handleModelChangeForModelfile}
          >
            {/* Base Models */}
            {size(baseModels) > 0 &&
              baseModels.map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            {/* Separator */}
            <Divider key="separator" />
            <ListSubheader key="custom-models-hdr">Custom Models</ListSubheader>

            {/* Custom Models */}
            {size(customModels) > 0 &&
              customModels.map((model: any) => (
                <MenuItem key={model.uid} value={model.name}>
                  ({model.baseModel}) {model.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        {/* Modelfile Name */}
        <TextField
          label="Modelfile Name"
          value={modelfileName}
          disabled={size(baseModels) + size(customModels) < 1}
          onChange={handleModelfileNameChange}
          fullWidth
          margin="normal"
          error={!!formErrors.modelfileName}
          helperText={formErrors.modelfileName}
        />

        {/* Modelfile Content */}
        <TextField
          label="Modelfile Content"
          value={modelfileContent}
          disabled={size(baseModels) + size(customModels) < 1}
          onChange={(e) => setModelfileContent(e.target.value)}
          multiline
          rows={10}
          fullWidth
          margin="normal"
        />
        {/* Streaming output during save/edit */}
        {(savingModelfile || size(modelfileStreamContent) > 0) && (
          <Card>
            <CardHeader>Last Create Result</CardHeader>
            <CardContent>
              <Box sx={{ mt: 2, whiteSpace: "pre-wrap", overflow: "auto" }}>
                <pre>{modelfileStreamContent}</pre>
              </Box>
            </CardContent>
          </Card>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          startIcon={<CancelIcon />}
          onClick={onClose}
          size="small"
        >
          Close
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleDeleteModelfile}
          disabled={!selectedModelfile}
          size="small"
        >
          Delete
        </Button>
        <Button
          variant="contained"
          startIcon={
            !baseModels.includes(selectedModelLocal) ? (
              <SaveIcon />
            ) : (
              <AddIcon />
            )
          }
          color="primary"
          onClick={handleSaveModelfile}
          disabled={
            savingModelfile ||
            size(modelfileName) <= 5 ||
            size(modelfileContent) <= 50 ||
            Object.keys(formErrors).length > 0
          }
        >
          {selectedModelfile && !baseModels.includes(selectedModelLocal)
            ? "Update"
            : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelfileManager;
