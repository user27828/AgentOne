/**
 * File manager for combined project/file manager component
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  DialogActions,
  LinearProgress,
  Grid2 as Grid,
  Typography,
  Divider,
  Box,
  ListItemIcon,
  Tooltip,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Tab as ViewIcon,
  MoveUp as MoveIcon,
  LocalFireDepartment as DestroyIcon,
  DoneAll as SelectAllIcon,
  Deselect as DeselectAllIcon,
} from "@mui/icons-material";
import axios from "axios";
import { serverUrl } from "./ProjectFileManager";
import { get, size, toInteger } from "lodash";
import {
  MAX_INLINE_FILE_SIZE,
  allowedUploadTypes,
  inlineViewable,
} from "../../../server/src/utils/file-types";

/**
 * File Manager
 * @param param0.projectId - Project ID to fetch files for
 * @returns {React.JSX}
 * @component
 */
const FileManager = ({ projectId }: { projectId: string }) => {
  const [files, setFiles] = useState([]);
  const [editFile, setEditFile] = useState<any>(null);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<any>(null);
  const [moveFileDialogOpen, setMoveFileDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [openConfirmDeleteDialog, setOpenConfirmDeleteDialog] = useState(false);
  const [moveFileDestinationProject, setMoveFileDestinationProject] = useState<
    string | null
  >(null);
  const [projects, setProjects] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden input

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get(`${serverUrl}/fileman/projects`);
        setProjects(response.data);
      } catch (error) {
        console.error("Error fetching projects: ", error);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [projectId]); // Re-fetch when projectId changes

  const fetchFiles = async () => {
    try {
      const projectResponse = await axios.get(
        `${serverUrl}/fileman/project/${projectId}`,
      );
      setFiles(projectResponse.data.files || []);
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  };

  const handleUploadButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (event.target === fileInputRef.current) {
      return; // Don't handle click if input itself
    }
    event.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click(); // Trigger file input click
    }
  };

  const handleUploadFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    try {
      setUploadProgress(null); // Clear previous progress
      let files = Array.from(event.target.files || []);

      // Get a list of invalid files:
      const invalidFiles: File[] = Array.from(files).filter((file: any) => {
        const mimeType = file.type;
        const allowed = allowedUploadTypes.some(
          (category) =>
            category.mimeTypes.includes(mimeType) && // Check mime-type
            file.size <= category.maxSizeBytes, // Check size
        );
        // Only return files not allowed for removal
        return !allowed;
      });

      if (!files || files.length === 0) {
        return; // No files selected
      }

      if (invalidFiles.length > 0) {
        alert(
          `The following file types are not allowed: ${invalidFiles.map((file) => file.name).join(", ")}`,
        );
        files = files.filter((file: File) => !invalidFiles.includes(file));
        if (files.length === 0) {
          throw new Error("No valid files for upload");
        }
      }

      const formData = new FormData();
      for (let i = 0; i < files.length; ++i) {
        formData.append("files", files[i]);
      }

      const response = await axios.post(
        `${serverUrl}/fileman/project/${projectId}/files-progress`,
        formData,
        {
          onUploadProgress: (progressEvent: any) => {
            let progressUpdates: any = null;

            try {
              if (get(progressEvent, "event.currentTarget.response")) {
                // Split response into individual lines, filtering out empty lines:
                const lines = progressEvent.event.currentTarget.response
                  .split("\n")
                  .filter((line: string) => line.trim() !== "");

                for (const line of lines) {
                  try {
                    const parsed = JSON.parse(line);
                    progressUpdates = parsed; // last valid parsed line
                  } catch (e) {
                    // Ignore invalid JSON lines (this is how the progress events are sent from the server)
                    console.warn(
                      "Invalid JSON received from server. Ignoring.",
                      e,
                      line,
                    );
                  }
                }

                if (progressUpdates) {
                  setUploadProgress((prevProgress: any) => {
                    if (!progressUpdates) {
                      return prevProgress; // Do nothing if parsing failed
                    }

                    const updatedFiles = progressUpdates.files.map(
                      (updatedFile: any) => {
                        const existingFile = (prevProgress?.files || []).find(
                          (f: any) =>
                            f.originalName === updatedFile.originalName,
                        );

                        if (existingFile) {
                          return {
                            ...existingFile,
                            progress: updatedFile.progress,
                          }; // Update existing file progress
                        }

                        return updatedFile; // Add new file if not present
                      },
                    );

                    return { files: updatedFiles };
                  });
                }
              }
            } catch (parseError) {
              console.error(
                "JSON parsing error in onUploadProgress:",
                parseError,
              );
            }
          },
        },
      );

      // Upload complete
      console.log("Upload Complete", response);
      fetchFiles();
      setUploadProgress(null); // Clear progress after upload
    } catch (error) {
      console.error("Error uploading file: ", error);
      setUploadProgress(null);
    }
  };

  const handleEditFile = (
    file: any,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    console.log("FileManager:handleFileEdit()", file);
    setEditFile(file);
    setOpenEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setOpenEditDialog(false);
    setEditFile(null);
  };

  const handleSaveFile = async () => {
    try {
      await axios.patch(
        `${serverUrl}/fileman/project/${projectId}/files/${editFile.id}`,
        editFile,
      );
      fetchFiles();
      handleCloseEditDialog();
    } catch (error) {
      console.error("Error saving file: ", error);
    }
  };

  /**
   * Send delete queue list
   * @param {array} fileIds - File IDs (slugID)
   */
  const handleDeleteFiles = async (fileIds: string[]) => {
    try {
      await axios.delete(`${serverUrl}/fileman/project/${projectId}/files`, {
        data: { fileIds },
      });
      fetchFiles();
      setOpenConfirmDeleteDialog(false);
      setSelectedFiles([]);
    } catch (error: any) {
      console.error("Error deleting files:", error);
      if (error.response && error.response.status === 207) {
        // Handle partial failures (some files deleted, some not)
        const { errors } = error.response.data;
        // <display or log the errors>
        errors.forEach((err: any) =>
          console.warn(`Failed to delete file ${err.fileId}: ${err.error}`),
        );
        // TODO: let user know results
      } else {
        // Other delete failure issues
      }
    }
  };

  const handleOpenConfirmDeleteDialog = () => {
    if (selectedFiles.length === 0) {
      // no files are selected
      console.warn("No files selected to delete.");
      return;
    }
    setOpenConfirmDeleteDialog(true);
  };

  const handleCloseConfirmDeleteDialog = () => {
    setSelectedFiles([]);
    setOpenConfirmDeleteDialog(false);
  };

  const handleMoveFile = (fileId: string, checked: boolean) => {
    if (checked) {
      const file = files.find((f: any) => f.id === fileId);
      if (file) {
        setSelectedFiles((prevSelected) => [...prevSelected, file]);
      }
    } else {
      setSelectedFiles((prevSelected) =>
        prevSelected.filter((f) => f.id !== fileId),
      );
    }
  };

  const handleOpenMoveFileDialog = () => {
    if (selectedFiles.length === 0) {
      // TODO: no files are selected, show a notification
      console.warn("No files selected to move.");
      return;
    }
    setMoveFileDialogOpen(true);
  };

  const handleCloseMoveFileDialog = () => {
    setMoveFileDialogOpen(false);
    setSelectedFiles([]); // Clear selections
    setMoveFileDestinationProject(null);
  };

  const handleMoveFilesConfirm = async () => {
    if (selectedFiles.length === 0 || !moveFileDestinationProject) {
      // Handle cases where no files or destination is selected
      console.error("No files or destination project selected.");
      handleCloseMoveFileDialog();
      return;
    }

    try {
      await axios.post(`${serverUrl}/fileman/project/${projectId}/files/move`, {
        newProjectId: moveFileDestinationProject,
        fileIds: selectedFiles.map((f) => f.id), // array of file IDs
      });
      fetchFiles();
      handleCloseMoveFileDialog();
    } catch (error: any) {
      console.error("Error moving files: ", error);
      if (error.response && error.response.status === 207) {
        // Partial failure
        const { errors } = error.response.data;
        // TODO display which files failed (errors array)
        console.warn("Some files failed to move:", errors);
      }
    }
  };

  const handleViewOrDownloadFile = async (
    file: any,
    download: boolean = false, // True for download, false for inline
  ) => {
    try {
      const response = await axios.get(
        `${serverUrl}/fileman/project/${projectId}/files/${file.id}`,
        {
          params: { download },
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      if (download) {
        link.setAttribute("download", file.originalName); // Set download attribute for downloads only
      } else {
        link.setAttribute("target", "_blank"); // For inline, open in new tab
      }

      document.body.appendChild(link);
      link.click(); // Trigger click to download/open

      // Cleanup – prevent memory leaks
      setTimeout(() => {
        // short delay to allow file to be opened
        window.URL.revokeObjectURL(url);
        link.remove();
      }, 100);
    } catch (error) {
      console.error("Error viewing/downloading file:", error);
    }
  };

  const handleSelectAll = () => {
    setSelectedFiles(files);
  };

  const handleDeselectAll = () => {
    setSelectedFiles([]);
  };

  return (
    <>
      <Typography variant="h6">Files (Total: {size(files)})</Typography>
      <Grid
        container
        spacing={2}
        direction="row"
        justifyContent="flex-start"
        alignItems="flex-start"
        sx={{ width: "100%" }}
      >
        <Grid size={3}>
          <Grid
            container
            spacing={1}
            direction="column"
            justifyContent="flex-end"
            sx={{
              borderRight: "1px solid rgba(200,200,200,.3)",
              pr: 1,
              height: "100%",
              textAlign: "right",
            }}
          >
            <Grid size={12}>
              <Divider textAlign="center" variant="inset">
                Select
              </Divider>
              <IconButton
                onClick={handleSelectAll}
                disabled={selectedFiles.length === files.length}
              >
                <SelectAllIcon
                  color="primary"
                  sx={{
                    opacity: selectedFiles.length === files.length ? 0.4 : 1,
                  }}
                />
              </IconButton>
              <IconButton
                onClick={handleDeselectAll}
                disabled={selectedFiles.length === 0}
              >
                <DeselectAllIcon
                  color="warning"
                  sx={{
                    opacity: selectedFiles.length === 0 ? 0.4 : 1,
                  }}
                />
              </IconButton>
            </Grid>
            <Grid size={12}>
              <Divider textAlign="center" variant="inset">
                Actions
              </Divider>
              <Button
                startIcon={<MoveIcon />}
                aria-label="move"
                size="small"
                variant="outlined"
                onClick={handleOpenMoveFileDialog}
                disabled={selectedFiles.length === 0}
              >
                Move File(s)
              </Button>
            </Grid>
            <Grid size={12}>
              <Button
                startIcon={<DeleteIcon />}
                aria-label="delete"
                size="small"
                variant="outlined"
                onClick={handleOpenConfirmDeleteDialog}
                disabled={selectedFiles.length === 0}
              >
                Delete File(s)
              </Button>
            </Grid>
            <Grid size={12} sx={{ pt: 2 }}>
              <Divider textAlign="center" variant="inset">
                Upload
              </Divider>
              <Button
                variant="contained"
                size="small"
                onClick={handleUploadButtonClick}
                sx={{ mt: 1 }}
              >
                Upload File(s)
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleUploadFile}
                  hidden
                />
              </Button>
              {/* Multiple file upload */}
              {uploadProgress && (
                <Box>
                  {uploadProgress.files.map((file: any, i: number) => (
                    <div key={i}>
                      <Typography variant="body2">
                        Uploading file {file.originalName}: {file.progress}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={file.progress}
                      />
                    </div>
                  ))}
                </Box>
              )}
            </Grid>
          </Grid>
        </Grid>
        <Grid size={9}>
          <List dense>
            {files.map((file: any) => {
              const isInlineViewable =
                inlineViewable({
                  ext: file.ext,
                  type: file.type,
                }) && file.size < MAX_INLINE_FILE_SIZE;

              return (
                <React.Fragment key={`files-list-${file.id}`}>
                  <ListItem
                    key={file.id}
                    secondaryAction={
                      <>
                        <Tooltip title="Edit File Metadata">
                          <IconButton
                            edge="end"
                            aria-label="edit"
                            size="small"
                            onClick={(e) => handleEditFile(file, e)}
                          >
                            <EditIcon color="primary" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="View file inline (if possible).  If your browser cannot view inline, it will be downloaded.">
                          <IconButton
                            size="small"
                            disabled={!isInlineViewable}
                            onClick={() => handleViewOrDownloadFile(file)}
                          >
                            <ViewIcon
                              color="secondary"
                              sx={{ opacity: isInlineViewable ? 1 : 0.4 }}
                            />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download file">
                          <IconButton
                            size="small"
                            onClick={() => handleViewOrDownloadFile(file, true)}
                          >
                            <DownloadIcon color="secondary" />
                          </IconButton>
                        </Tooltip>
                      </>
                    }
                    sx={{}}
                  >
                    <ListItemText
                      primary={
                        <>
                          <Checkbox
                            checked={selectedFiles.includes(file)}
                            onChange={(e: any) =>
                              handleMoveFile(file.id, e.target.checked)
                            }
                          />
                          <Tooltip title={file.type}>
                            <Box>{file.name || file.originalName}</Box>
                          </Tooltip>
                        </>
                      }
                      secondary={
                        <React.Fragment key={`item-txt-${file.id}`}>
                          {`${file.name !== file.originalName && file.originalName ? `Original name: ${file.originalName}, ` : ""}` +
                            `ID: ${file.id || ""}, ` +
                            (toInteger(file?.size) > 0
                              ? `Size: ${file?.size} kb, `
                              : "") +
                            (file?.description
                              ? `Description: ${file.description}`
                              : "")}
                        </React.Fragment>
                      }
                    />
                  </ListItem>
                  <Divider key={`divider-${file.id}}`} />
                </React.Fragment>
              );
            })}
          </List>
        </Grid>
      </Grid>

      {/* Edit File Dialog */}
      <Dialog open={openEditDialog} onClose={handleCloseEditDialog}>
        <DialogTitle>Edit File</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            margin="dense"
            id="name"
            label="File Name"
            type="text"
            variant="outlined"
            value={get(editFile, "name", "") || ""}
            onChange={(e) => setEditFile({ ...editFile, name: e.target.value })}
          />
          <TextField
            margin="dense"
            id="description"
            label="File Description"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            minRows={3}
            value={get(editFile, "description", "") || ""}
            onChange={(e) =>
              setEditFile({ ...editFile, description: e.target.value })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleCloseEditDialog}>
            Cancel
          </Button>
          <Button variant="outlined" onClick={handleSaveFile}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={openConfirmDeleteDialog}
        onClose={handleCloseConfirmDeleteDialog}
      >
        <DialogTitle>Confirm File Delete</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            <Typography variant="body2" color="error">
              Are you sure you want to delete these files? This action cannot be
              undone.
            </Typography>
          </Alert>
          <List>
            {selectedFiles.map((file) => (
              <ListItem key={file.id}>
                <ListItemIcon>
                  <DestroyIcon color="error" sx={{ size: "16px" }} />
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={
                    file.name != file.originalName
                      ? `(Original Name: ${file.originalName})`
                      : ""
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleCloseConfirmDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            onClick={() => handleDeleteFiles(selectedFiles.map((f) => f.id))}
            color="error"
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move file dialog */}
      <Dialog open={moveFileDialogOpen} onClose={handleCloseMoveFileDialog}>
        <DialogTitle>Move File</DialogTitle>
        <DialogContent>
          <FormControl fullWidth>
            <InputLabel id="move-file-project-select-label">
              Destination Project
            </InputLabel>
            <Select
              labelId="move-file-project-select-label"
              id="move-file-project-select"
              value={moveFileDestinationProject || ""}
              onChange={(e) =>
                setMoveFileDestinationProject(e.target.value as string)
              }
            >
              {projects.map((project) =>
                project.id !== projectId ? ( // Disable current project
                  <MenuItem key={project.id} value={project.id}>
                    {project.name}
                  </MenuItem>
                ) : null,
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMoveFileDialog}>Cancel</Button>
          <Button
            onClick={handleMoveFilesConfirm}
            disabled={!moveFileDestinationProject}
          >
            Move
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FileManager;
