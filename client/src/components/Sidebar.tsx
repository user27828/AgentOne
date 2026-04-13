/**
 * Sidebar
 */
import React, { useState, useRef, Dispatch, SetStateAction } from "react";
import { range, size } from "lodash";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  Add,
  ChevronLeft,
  ChevronRight,
  Delete as DeleteIcon,
  MoreVert,
  PestControl as DebugIcon,
  Settings as SettingsIcon,
  DriveFileRenameOutline as RenameIcon,
  RestartAlt as RebuildMemoryIcon,
  PushPin as PinIcon,
  Thermostat as TemperatureIcon,
  InterpreterMode as ModelfileIcon,
} from "@mui/icons-material";
import { serverUrl } from "../../src/pages/gpt";
const ModelfileManager = React.lazy(() => import("./ModelfileManager"));

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

const CHAT_MEMORY_FIELDS: Array<{
  key: keyof ChatMemorySettings;
  label: string;
  description: string;
  serverMax: number;
}> = [
  {
    key: "verbatimHistoryChats",
    label: "Verbatim history chats",
    description:
      "How many recent chat exchanges should remain fully verbatim before older context is summarized.",
    serverMax: 8,
  },
  {
    key: "verbatimHistoryTokens",
    label: "Verbatim history tokens",
    description:
      "Approximate token budget for the recent chat exchanges that stay verbatim in the prompt.",
    serverMax: 3000,
  },
  {
    key: "summaryTokens",
    label: "Summary tokens",
    description:
      "Approximate token budget for the compact rolling summary of older conversation.",
    serverMax: 1000,
  },
  {
    key: "summaryQueryTokens",
    label: "Summary query tokens",
    description:
      "Approximate token cap for each older user message stored in the rolling summary.",
    serverMax: 60,
  },
  {
    key: "summaryReplyTokens",
    label: "Summary reply tokens",
    description:
      "Approximate token cap for each older assistant reply stored in the rolling summary.",
    serverMax: 90,
  },
];

interface SidebarProps {
  models: string[];
  setModels: Dispatch<SetStateAction<string[]>>;
  selectedModel: string;
  temperature: number;
  stream: boolean;
  loading: boolean;
  sending: boolean;
  showDebug: boolean;
  history: any[];
  setHistory: (history: any[]) => void;
  createNewHistoryItem: () => Promise<void>;
  saveHistory: (session: any) => Promise<void>;
  activeHistoryIndex: number;
  setActiveHistoryIndex: (index: number) => void;
  setUuids: (val: any) => void;
  chatMemorySettings: ChatMemorySettings;
  activeSessionUid: string;
  activeSessionMemoryControls: SessionMemoryControls;
  newPinnedFact: string;
  setNewPinnedFact: Dispatch<SetStateAction<string>>;
  sessionMemoryBusy: boolean;
  handleRebuildSessionMemory: () => Promise<void>;
  handleAddPinnedFact: () => Promise<void>;
  handleRemovePinnedFact: (fact: string) => Promise<void>;
  handleChatMemorySettingChange: (
    key: keyof ChatMemorySettings,
    value: number,
  ) => void;
  sidebarOpen: boolean;
  handleToggleSidebar: () => void;
  setShowDebug: (showDebug: boolean) => void;
  handleModelChange: (event: SelectChangeEvent<string>) => void;
  handleTemperatureChange: (event: Event, value: number | number[]) => void;
  handleStreamChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * @param {array} param0.models - Model list
 * @param {function} param0.setModels
 * @param {boolean} param0.loading - Main loading state
 * @param {boolean} param0.sending - Main data sending state
 * @param {string} param0.selectedModel
 * @param {number} param0.temperature
 * @param {boolean} param0.stream
 * @param {boolean} param0.showDebug
 * @param {object} param0.history
 * @param {function} param0.setHistory
 * @param {integer} param0.activeHistoryIndex
 * @param {function} param0.setActiveHistoryIndex
 * @param {function} param0.setUuids
 * @param {boolean} param0.sidebarOpen
 * @param {function} param0.handleToggleSidebar
 * @param {function} param0.createNewHistoryItem
 * @param {function} param0.saveHistory
 * @param {function} param0.setShowDebug
 * @param {function} param0.handleModelChange
 * @param {function} param0.handleStreamChange
 * @param {function} param0.handleTemperatureChange
 * @component
 */
const Sidebar: React.FC<SidebarProps> = ({
  models,
  setModels,
  loading,
  sending,
  selectedModel,
  temperature,
  stream,
  showDebug,
  history,
  setHistory,
  activeHistoryIndex,
  setActiveHistoryIndex,
  setUuids,
  activeSessionUid,
  activeSessionMemoryControls,
  newPinnedFact,
  setNewPinnedFact,
  sessionMemoryBusy,
  handleRebuildSessionMemory,
  handleAddPinnedFact,
  handleRemovePinnedFact,
  sidebarOpen,
  handleToggleSidebar,
  createNewHistoryItem,
  saveHistory,
  setShowDebug,
  handleModelChange,
  handleStreamChange,
  handleTemperatureChange,
  chatMemorySettings,
  handleChatMemorySettingChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingItemIndex, setRenamingItemIndex] = useState<number | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const renameFieldRef = useRef<HTMLInputElement | null>(null);
  const [anchorElTemp, setAnchorElTemp] = React.useState<null | HTMLElement>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = React.useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState(0);
  const [modelfileManagerOpen, setModelfileManagerOpen] = useState(false);

  const handleClickTemp = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElTemp(event.currentTarget);
  };

  const handleCloseTemp = () => {
    setAnchorElTemp(null);
  };

  const handleSettingsClick = () => {
    setSettingsTab(0);
    setSettingsOpen(true);
  };

  const handleSettingsTabChange = (
    _event: React.SyntheticEvent,
    newValue: number,
  ) => {
    setSettingsTab(newValue);
  };

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
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    event && event.stopPropagation();
    if (reason && reason !== "backdropClick") {
      return;
    }
    setAnchorEl(null);
  };

  /**
   * Rename a session
   * @param event
   */
  const handleRenameClick = (event?: React.MouseEvent<HTMLElement>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    event && event.stopPropagation();
    setRenameDialogOpen(true);
    setNewName(history[renamingItemIndex!]?.name || "");
    handleMenuClose();
  };

  /**
   * Delete a chat session
   */
  const handleDeleteClick = async (event?: React.MouseEvent<HTMLElement>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    event && event.stopPropagation();

    if (renamingItemIndex !== null) {
      const sessionToDelete = history[renamingItemIndex];

      try {
        const response = await fetch(
          `${serverUrl}/session/${sessionToDelete.uid}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const updatedHistory = history.filter(
          (_, i) => i !== renamingItemIndex,
        );
        setHistory(updatedHistory);

        // Update activeHistoryIndex if necessary
        if (activeHistoryIndex === renamingItemIndex) {
          setActiveHistoryIndex(
            updatedHistory.length > 0
              ? Math.min(renamingItemIndex, updatedHistory.length - 1)
              : -1,
          );
        } else if (renamingItemIndex < activeHistoryIndex) {
          setActiveHistoryIndex(activeHistoryIndex - 1);
        }

        // Remove from uuids
        setUuids((prev: any) => {
          const newUuids = { ...prev };
          delete newUuids[sessionToDelete.uid];
          return newUuids;
        });
      } catch (error) {
        console.error("Error deleting session:", error);
      } finally {
        handleMenuClose();
      }
    }
  };

  /**
   * Persistent storage saving for a rename
   */
  const handleRenameSave = async () => {
    if (renamingItemIndex !== null) {
      const updatedSession = {
        ...history[renamingItemIndex],
        name: newName,
      };

      try {
        await saveHistory(updatedSession); // saveHistory handles the PUT request
      } catch (error) {
        console.error("Error renaming session:", error);
      } finally {
        setRenameDialogOpen(false);
        setNewName("");
      }
    }
  };

  const handleRenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value);
  };

  const handleNewChat = async () => {
    await createNewHistoryItem();
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
          disabled={sending}
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
          bottom: 44,
          right: sidebarOpen ? 0 : "-2px", // Adjust to ensure visibility when closed
          width: "100%",
        }}
      >
        <Tooltip title={(sidebarOpen ? "Close" : "Open") + " Sidebar"}>
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
              const item = history[index] || {};
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
                          Created:
                          {new Date(item.createdAt).toLocaleString()}
                          <br />
                          Updated:
                          {new Date(item.updatedAt).toLocaleString()}
                          <br />
                          Chats: {item.totalChats}
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
                        slotProps={{
                          primary: {
                            variant: "caption",
                            sx: {
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            },
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
                          event: any,
                          reason: "backdropClick" | "escapeKeyDown",
                        ) => void
                      }
                    >
                      <MenuItem onClick={handleRenameClick}>
                        <ListItemIcon>
                          <RenameIcon color="primary" />
                        </ListItemIcon>
                        Rename
                      </MenuItem>
                      <Divider />
                      <MenuItem onClick={handleDeleteClick}>
                        <ListItemIcon>
                          <DeleteIcon color="error" />
                        </ListItemIcon>
                        Delete
                      </MenuItem>
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
          padding: "0 35px 0 5px",
          textAlign: "right",
        }}
      >
        {/* Add future settings/features here (not part of the history list area) */}
        {sidebarOpen ? (
          <>
            {/* <ProjectFileManager models={models} /> */}
            <Tooltip title="General settings">
              <IconButton onClick={handleSettingsClick}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Chat query options - Temperature, model, stream, etc.">
              <IconButton onClick={handleClickTemp}>
                <TemperatureIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorElTemp}
              open={Boolean(anchorElTemp)}
              onClose={handleCloseTemp}
            >
              <Box sx={{ width: "430px" }}>
                <MenuItem>
                  <FormControl
                    fullWidth
                    sx={{ mb: 1 }}
                    disabled={loading || sending || !size(models)}
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
                        models.map((model) => (
                          <MenuItem key={model} value={model}>
                            {model}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                </MenuItem>
                <MenuItem>
                  <FormControl
                    fullWidth
                    sx={{ mb: 1 }}
                    disabled={loading || sending || !size(models)}
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
                </MenuItem>
                <MenuItem>
                  <Tooltip title="Show debug dialog">
                    <IconButton onClick={() => setShowDebug(!showDebug)}>
                      <DebugIcon />
                    </IconButton>
                  </Tooltip>
                </MenuItem>
              </Box>
            </Menu>
          </>
        ) : (
          <React.Fragment />
        )}
      </Box>

      {/* General Settings Dialog */}
      <Dialog
        maxWidth="sm"
        fullWidth
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClick={(event) => event.stopPropagation()} // Prevent closing on inside click
      >
        <DialogTitle sx={{ px: 2.5, pt: 2, pb: 1 }}>Settings</DialogTitle>
        <DialogContent sx={{ px: 2.5, py: 1 }}>
          <Tabs
            variant="fullWidth"
            value={settingsTab}
            onChange={handleSettingsTabChange}
            sx={{
              mb: 1.5,
              minHeight: 38,
              "& .MuiTab-root": {
                minHeight: 38,
                px: 1,
                py: 0.75,
                fontSize: 13,
                textTransform: "none",
              },
            }}
          >
            <Tab label="General" />
            <Tab label="Chat Memory" />
          </Tabs>
          {settingsTab === 0 ? (
            <Stack spacing={1.5}>
              <Grid container spacing={1.5} sx={{ alignItems: "flex-start" }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        disabled={!size(models)}
                        checked={stream}
                        onChange={handleStreamChange}
                      />
                    }
                    label="Stream"
                    sx={{
                      m: 0,
                      "& .MuiFormControlLabel-label": {
                        fontSize: 14,
                        fontWeight: 500,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <Box
                    sx={{
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      color: "text.secondary",
                    }}
                  >
                    Stream controls whether or not you will see realtime chat
                    responses, or everything at once.
                  </Box>
                </Grid>
              </Grid>
              <Divider textAlign="left" sx={{ my: 0.25 }}>
                <Box
                  component="span"
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  Modelfiles
                </Box>
              </Divider>
              <Grid container spacing={1.5} sx={{ alignItems: "center" }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<ModelfileIcon />}
                    onClick={() => setModelfileManagerOpen(true)}
                  >
                    Manage Modelfiles
                  </Button>
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <Box
                    sx={{
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      color: "text.secondary",
                    }}
                  >
                    Modelfiles let you create customized variants of base models
                    with specific system instructions, such as a defined persona
                    or task style.
                  </Box>
                </Grid>
              </Grid>
            </Stack>
          ) : (
            <Stack spacing={1.25}>
              {CHAT_MEMORY_FIELDS.map((field) => (
                <Grid
                  container
                  spacing={1.25}
                  key={field.key}
                  sx={{ alignItems: "flex-start" }}
                >
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <TextField
                      fullWidth
                      type="number"
                      size="small"
                      margin="dense"
                      label={field.label}
                      value={chatMemorySettings[field.key]}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);

                        if (Number.isNaN(nextValue)) {
                          return;
                        }

                        handleChatMemorySettingChange(field.key, nextValue);
                      }}
                      helperText={
                        field.key === "verbatimHistoryChats"
                          ? `Cap ${field.serverMax} chats`
                          : `Cap ${field.serverMax} tokens`
                      }
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          max: field.serverMax,
                          step: 1,
                        },
                      }}
                      sx={{
                        "& .MuiInputBase-input": {
                          py: 1,
                        },
                        "& .MuiFormHelperText-root": {
                          mt: 0.25,
                          fontSize: 11,
                          lineHeight: 1.3,
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 7 }}>
                    <Box
                      sx={{
                        pt: { xs: 0, sm: 1 },
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: "text.secondary",
                      }}
                    >
                      {field.description}
                    </Box>
                  </Grid>
                </Grid>
              ))}
              <Divider textAlign="left" sx={{ my: 0.25 }}>
                <Box
                  component="span"
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  Session-Wide Memory
                </Box>
              </Divider>
              {activeSessionUid ? (
                <Stack spacing={1.25}>
                  <Grid
                    container
                    spacing={1.25}
                    sx={{ alignItems: "flex-start" }}
                  >
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RebuildMemoryIcon />}
                        onClick={handleRebuildSessionMemory}
                        disabled={sending || sessionMemoryBusy}
                      >
                        Rebuild Memory
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 7 }}>
                      <Box
                        sx={{
                          pt: { xs: 0, sm: 0.5 },
                          fontSize: 12,
                          lineHeight: 1.4,
                          color: "text.secondary",
                        }}
                      >
                        Recompute the persisted rolling summary for the current
                        session after forgetting turns or if the stored memory
                        looks stale.
                      </Box>
                    </Grid>
                  </Grid>
                  <Grid
                    container
                    spacing={1.25}
                    sx={{ alignItems: "flex-start" }}
                  >
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        margin="dense"
                        label="Session-wide pinned fact"
                        value={newPinnedFact}
                        onChange={(event) =>
                          setNewPinnedFact(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddPinnedFact();
                          }
                        }}
                        helperText={`Pinned facts: ${activeSessionMemoryControls.pinnedFacts.length}`}
                        disabled={sending || sessionMemoryBusy}
                        sx={{
                          "& .MuiInputBase-input": {
                            py: 1,
                          },
                          "& .MuiFormHelperText-root": {
                            mt: 0.25,
                            fontSize: 11,
                            lineHeight: 1.3,
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 7 }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{
                          pt: { xs: 0, sm: 0.5 },
                          alignItems: "flex-start",
                        }}
                      >
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<PinIcon />}
                          onClick={handleAddPinnedFact}
                          disabled={
                            sending ||
                            sessionMemoryBusy ||
                            !newPinnedFact.trim().length
                          }
                        >
                          Pin Fact
                        </Button>
                        <Box
                          sx={{
                            fontSize: 12,
                            lineHeight: 1.4,
                            color: "text.secondary",
                          }}
                        >
                          Pinned facts apply to the whole selected session, not
                          to a single turn. Use the turn menu for per-turn
                          memory actions like debug and forget/remember.
                        </Box>
                      </Stack>
                    </Grid>
                  </Grid>
                  {activeSessionMemoryControls.pinnedFacts.length ? (
                    <List dense disablePadding>
                      {activeSessionMemoryControls.pinnedFacts.map((fact) => (
                        <ListItem
                          key={fact}
                          disableGutters
                          secondaryAction={
                            <IconButton
                              size="small"
                              disabled={sending || sessionMemoryBusy}
                              onClick={() => handleRemovePinnedFact(fact)}
                            >
                              <DeleteIcon color="warning" fontSize="small" />
                            </IconButton>
                          }
                          sx={{ pr: 5 }}
                        >
                          <ListItemText
                            primary={fact}
                            slotProps={{
                              primary: {
                                variant: "body2",
                                sx: {
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                },
                              },
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Box
                      sx={{
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: "text.secondary",
                      }}
                    >
                      No session-wide pinned facts yet.
                    </Box>
                  )}
                  <Box
                    sx={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: "text.secondary",
                    }}
                  >
                    Forgotten turns:{" "}
                    {activeSessionMemoryControls.forgottenChatUids.length}. Use
                    a history item's debug dialog to forget or restore an
                    individual turn without deleting it.
                  </Box>
                </Stack>
              ) : (
                <Box
                  sx={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: "text.secondary",
                  }}
                >
                  Select a saved chat session to rebuild memory, pin facts, or
                  manage forgotten turns.
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setSettingsOpen(false)}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/*  Modelfile Manager Dialog */}
      {modelfileManagerOpen ? (
        <React.Suspense fallback={null}>
          <ModelfileManager
            {...{
              open: modelfileManagerOpen,
              onClose: () => setModelfileManagerOpen(false),
              models,
              setModels,
              selectedModel,
              temperature,
              stream,
              onSave: (response) => {
                console.log("Modelfile saved:", response);
              },
              onDelete: (response) => {
                console.log("Modelfile deleted:", response);
              },
              onModelCreateUpdate: (model) => {
                console.log("Modelfile Created/Updated:", model);
                handleModelChange({ target: { value: model } } as any);
              },
            }}
          />
        </React.Suspense>
      ) : null}

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
            autoFocus={true}
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
          <Button
            variant="contained"
            onClick={() => setRenameDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRenameSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default Sidebar;
