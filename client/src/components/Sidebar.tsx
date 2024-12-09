/**
 * Sidebar
 */
import React, { useState, useRef } from "react";
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
  Grid2 as Grid,
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
  Switch,
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
  Thermostat as TemperatureIcon,
  InterpreterMode as ModelfileIcon,
} from "@mui/icons-material";
import { serverUrl } from "../../src/pages/gpt";
import ModelfileManager from "./ModelfileManager";
interface SidebarProps {
  models: string[];
  setModels: (state: any) => void;
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
  sidebarOpen: boolean;
  handleToggleSidebar: () => void;
  setShowDebug: (showDebug: boolean) => void;
  handleModelChange: (event: SelectChangeEvent<any>) => void;
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
  sidebarOpen,
  handleToggleSidebar,
  createNewHistoryItem,
  saveHistory,
  setShowDebug,
  handleModelChange,
  handleStreamChange,
  handleTemperatureChange,
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
  const [modelfileManagerOpen, setModelfileManagerOpen] = useState(false);

  const handleClickTemp = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElTemp(event.currentTarget);
  };

  const handleCloseTemp = () => {
    setAnchorElTemp(null);
  };

  const handleSettingsClick = () => {
    setSettingsOpen(true);
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
    event && event.stopPropagation();
    setRenameDialogOpen(true);
    setNewName(history[renamingItemIndex!]?.name || "");
    handleMenuClose();
  };

  /**
   * Delete a chat session
   */
  const handleDeleteClick = async (event?: React.MouseEvent<HTMLElement>) => {
    event && event.stopPropagation();

    if (renamingItemIndex !== null) {
      const sessionToDelete = history[renamingItemIndex];

      try {
        const response = await fetch(
          `${serverUrl}/session/${sessionToDelete.id}`,
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
            updatedHistory.length > 0 ? updatedHistory.length - 1 : 0,
          );
        }

        // Remove from uuids
        setUuids((prev: any) => {
          const newUuids = { ...prev };
          delete newUuids[sessionToDelete.id];
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
        maxWidth="md"
        fullWidth
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClick={(event) => event.stopPropagation()} // Prevent closing on inside click
      >
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <Grid container direction="column" spacing={2}>
            <Grid container direction="row" size={12}>
              <Grid size={6}>
                <FormControlLabel
                  control={
                    <Switch
                      disabled={!size(models)}
                      checked={stream}
                      onChange={handleStreamChange}
                    />
                  }
                  label="Stream"
                />
              </Grid>
              <Grid size={6}>
                Stream controls whether or not you will see "realtime" chat
                responses, or everything at once.
              </Grid>
            </Grid>
            <Divider textAlign="left">Modelfiles</Divider>
            <Grid container direction="row" size={12}>
              <Grid size={6}>
                <Button
                  variant="contained"
                  startIcon={<ModelfileIcon />}
                  onClick={() => setModelfileManagerOpen(true)}
                >
                  Manage Modelfiles
                </Button>
              </Grid>
              <Grid size={6}>
                Modelfiles allow you to create a version of a base model which
                has specific SYSTEM instructions. As an example, you can create
                a persona of Carl Sagan to answer all of your cosmic questions.
                These customized versions appear in your model list selection.
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setSettingsOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/*  Modelfile Manager Dialog */}
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
