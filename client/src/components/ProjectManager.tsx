/**
 * Project manager for combined project/file manager component
 */
import React, { useState, useEffect } from "react";
import { get, size, toInteger } from "lodash";
import {
  Alert,
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  SelectChangeEvent,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ModelTraining as TrainModelIcon,
  RemoveRoad as TrainCancelIcon,
  LocalFireDepartment as DestroyIcon,
} from "@mui/icons-material";
import axios from "axios";
import { serverUrl } from "./ProjectFileManager";

// TODO: lower when developing this feature or in prod
const jobStatusRefresh = 100000; // Refresh job status every x ms

/**
 * Project Manager
 * @param {function} param0.onSelectProject - Function to pass project object as param
 * @returns {React.JSX}
 * @component
 */
const ProjectManager = ({
  models,
  onSelectProject,
}: {
  models: string[];
  onSelectProject: (project: any) => void;
}) => {
  const [projects, setProjects] = useState([]);
  const [editProject, setEditProject] = useState<any>({});
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any | null>(null); // project object
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [openConfirmDeleteDialog, setOpenConfirmDeleteDialog] = useState(false);
  const [openConfirmTrainDialog, setOpenConfirmTrainDialog] = useState(false);
  const [trainingModel, setTrainingModel] = useState<string | null>(null); // to hold selected model for training
  const [projectToTrain, setProjectToTrain] = useState<any>(null);

  const [trainingStatus, setTrainingStatus] = useState<{
    [projectId: string]: any;
  }>({});

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${serverUrl}/fileman/projects`);
      const projectsData = response.data;
      setProjects(projectsData);
      console.log("ProjectManager:fetchProjects()", projectsData);

      if (projectsData.length === 1 && !selectedProject) {
        // Check if only one project and none selected yet
        onSelectProject(projectsData[0]);
        setSelectedProject(projectsData[0]);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      // <handle error>
    }
  };

  /**
   * Get files within a specified project
   * NOTE: Similar version in FileManager.tsx
   * @param {string} projectId - Project ID
   * @param {function} func - Callback with files as param
   * @returns {array} - Array of file metadata objects
   */
  // @ts-ignore
  // eslint-disable-next-line
  const fetchFiles = async (projectId: string, func = (file: any) => {}) => {
    try {
      const projectResponse = await axios.get(
        `${serverUrl}/fileman/project/${projectId}`,
      );
      func(projectResponse.data.files || []);
      return projectResponse.data.files;
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  };

  /**
   * Initiate the delete confirmation dialog
   * @param {string} project - Project metadata object
   */
  const handleDeleteProject = async (project: any) => {
    project.files = await fetchFiles(project.id);
    setProjectToDelete(project);
    setOpenConfirmDeleteDialog(true);
  };

  /**
   * Delete has been confirmed, delete the project and files
   */
  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      try {
        await axios.delete(
          `${serverUrl}/fileman/project/${projectToDelete.id}`,
        );
        fetchProjects();
        setOpenConfirmDeleteDialog(false);
        setProjectToDelete(null);

        if (selectedProject && selectedProject.id === projectToDelete.id) {
          setSelectedProject(null); // Clear selected project
          onSelectProject(null);
        }
      } catch (error) {
        console.error("Error deleting project:", error);
        setOpenConfirmDeleteDialog(false);
        setProjectToDelete(null);
      }
    }
  };

  const handleCloseConfirmDeleteDialog = () => {
    setOpenConfirmDeleteDialog(false);
    setProjectToDelete(null);
  };

  const handleAddProject = () => {
    setEditProject({ name: "", description: "" }); // Clear existing project data
    setOpenEditDialog(true);
  };

  const handleEditProject = (project: any) => {
    setEditProject(project);
    setOpenEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setEditProject({});
    setOpenEditDialog(false);
  };

  const handleSaveProject = async () => {
    try {
      const isEdit = editProject && editProject?.id;
      const _axiosMethod = isEdit ? "patch" : "post";
      await axios[_axiosMethod](
        isEdit
          ? `${serverUrl}/fileman/project/${editProject.id}`
          : `${serverUrl}/fileman/project`,
        editProject,
      );
      setEditProject({});
      fetchProjects();
      handleCloseEditDialog();
    } catch (error) {
      console.error("Error saving project:", error);
    }
  };

  const handleTrainModel = (project: any) => {
    setProjectToTrain(project);
    setTrainingModel(models[0] || null);
    setOpenConfirmTrainDialog(true);
  };

  const handleCloseConfirmTrainDialog = () => {
    setOpenConfirmTrainDialog(false);
    setProjectToTrain(null);
    setTrainingModel(null);
  };

  const handleConfirmTrain = async () => {
    if (!projectToTrain || !trainingModel) {
      console.error("Project or Model not selected for training.");
      handleCloseConfirmTrainDialog();
      return;
    }

    try {
      await axios.post(`${serverUrl}/finetune/${projectToTrain.id}/initiate`, {
        model: trainingModel, // Pass the selected training model
      });

      // TODO: <handle success, show progress indicator>
      handleCloseConfirmTrainDialog(); // Close dialog after successful initiation.
    } catch (error) {
      console.error("Error initiating training:", error);
      // handle error in the UI
    }
  };

  const handleModelSelection = (e: SelectChangeEvent<string>) => {
    setTrainingModel(e.target.value);
  };

  const handleStopTraining = async (projectId: string) => {
    try {
      await axios.post(`${serverUrl}/finetune/${projectId}/stop`);
    } catch (error) {
      console.error("Error stopping training:", error);
    }
  };

  // Poll status webservice for jobs
  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const projectIdsString = projects.map((p: any) => p.id).join(","); // ID list
        const response = await axios.get(
          `${serverUrl}/finetune/status/${projectIdsString}`,
        );
        const newStatus: any = {};
        response.data.forEach((status: any) => {
          newStatus[status.projectId] = status;
        });

        setTrainingStatus(newStatus);
      } catch (error) {
        console.error("Error fetching training statuses:", error);
      }
    }, jobStatusRefresh);

    return () => clearInterval(intervalId);
  }, [projects]);

  return (
    <>
      <Typography variant="h6">Projects (Total: {size(projects)})</Typography>
      <Grid
        container
        spacing={2}
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Grid size={2}>
          <Button variant="contained" size="small" onClick={handleAddProject}>
            Add Project
          </Button>
        </Grid>

        <Grid container size={10}>
          <List dense sx={{ width: "100%" }}>
            {size(projects) > 0 ? (
              projects.map((project: any) => {
                const startJobEnabled =
                  get(trainingStatus, [project.id, "status"]) !== "finetune" ||
                  true;
                const stopJobEnabled =
                  get(trainingStatus, [project.id, "status"]) === "finetune" ||
                  false;
                return (
                  <React.Fragment key={`projects-${project.id}`}>
                    <ListItemButton
                      key={project.id}
                      onClick={() => onSelectProject(project)}
                    >
                      <Grid
                        container
                        size={12}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Grid>
                          <RadioGroup
                            value={selectedProject?.id || null}
                            onChange={(e) => {
                              const newSelectedProject = projects.find(
                                (p: any) => p.id === e.target.value,
                              );
                              onSelectProject(newSelectedProject); // selected project state in parent
                              setSelectedProject(newSelectedProject); // keep selected state consistent
                            }}
                          >
                            <FormControlLabel
                              value={project.id}
                              control={<Radio />}
                              label={
                                <ListItemText
                                  primary={project.name}
                                  secondary={project.description}
                                />
                              }
                            />
                          </RadioGroup>
                        </Grid>
                        <Grid>
                          <Tooltip title="Edit Project Metadata">
                            <IconButton
                              size="small"
                              edge="end"
                              aria-label="edit"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent click from selecting the project
                                handleEditProject(project);
                              }}
                            >
                              <EditIcon color="primary" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete this project">
                            <IconButton
                              size="small"
                              edge="end"
                              aria-label="delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(project);
                              }}
                            >
                              <DeleteIcon color="error" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Initiate Fine-tuning">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTrainModel(project);
                              }}
                              disabled={!startJobEnabled}
                            >
                              <TrainModelIcon
                                color="primary"
                                sx={{
                                  opacity: startJobEnabled ? 1 : 0.4,
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip
                            title={`Cancel fine-tuning process - ${stopJobEnabled ? "enabled" : "disabled (not running)"}`}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStopTraining(project.id);
                              }}
                              disabled={stopJobEnabled}
                            >
                              <TrainCancelIcon
                                color="warning"
                                sx={{
                                  opacity: stopJobEnabled ? 1 : 0.4,
                                  cursor: stopJobEnabled
                                    ? "pointer"
                                    : "default",
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Grid>
                      </Grid>
                    </ListItemButton>
                    <Divider />
                  </React.Fragment>
                );
              })
            ) : (
              <React.Fragment />
            )}
          </List>
        </Grid>
      </Grid>

      {/* Edit/Add Project Dialog */}
      <Dialog open={openEditDialog} onClose={handleCloseEditDialog}>
        <DialogTitle>
          {editProject ? "Edit Project" : "Add Project"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            margin="dense"
            id="name"
            label="Project Name"
            type="text"
            value={get(editProject, "name", "")}
            onChange={(e) => {
              setEditProject({ ...editProject, name: e.target.value });
            }}
          />
          <TextField
            margin="dense"
            id="description"
            label="Project Description"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            minRows={3}
            value={get(editProject, "description", "")}
            onChange={(e) =>
              setEditProject({ ...editProject, description: e.target.value })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleCloseEditDialog}>
            Cancel
          </Button>
          <Button variant="outlined" onClick={handleSaveProject}>
            {editProject ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={openConfirmDeleteDialog}
        onClose={handleCloseConfirmDeleteDialog}
      >
        <DialogTitle>Confirm Project Deletion</DialogTitle>
        <DialogContent>
          {projectToDelete && (
            <>
              <Alert severity="warning">
                <Typography variant="body1" gutterBottom>
                  Are you sure you want to delete the project "
                  <strong>{projectToDelete.name}</strong>"?
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This action will also delete all associated files (Total
                  Files: {size(projectToDelete.files)}). This cannot be undone.
                </Typography>
              </Alert>
              {/* Files to be deleted */}
              <List dense sx={{ width: "100%" }}>
                {projectToDelete.files &&
                  projectToDelete.files.map((file: any) => (
                    <ListItem key={file.id}>
                      <ListItemIcon>
                        <DestroyIcon color="error" sx={{ size: "16px" }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <React.Fragment
                            key={`prj-item-txt-primary-${file.id}`}
                          >
                            {`${file.name} (${toInteger(file.size / 1024 || 0)} kb)`}
                          </React.Fragment>
                        }
                        secondary={
                          <React.Fragment
                            key={`prj-item-txt-secondary-${file.id}`}
                          >
                            {`Created: ${file.createdAt}`}
                          </React.Fragment>
                        }
                      />
                    </ListItem>
                  ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleCloseConfirmDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            onClick={handleConfirmDelete}
            color="error"
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Training */}
      <Dialog
        open={openConfirmTrainDialog}
        onClose={handleCloseConfirmTrainDialog}
      >
        <DialogTitle>Confirm Model Training</DialogTitle>
        <DialogContent>
          {projectToTrain && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Train a model using data from project "
                <strong>{projectToTrain.name}</strong>"?
              </Typography>

              {/* Added Select Input to choose Model */}
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel id="training-model-select-label">
                  Select Model
                </InputLabel>
                <Select
                  labelId="training-model-select-label"
                  id="training-model-select"
                  value={trainingModel || ""} // Set initial value based on state
                  label="Select Model"
                  onChange={handleModelSelection}
                >
                  {models.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={handleCloseConfirmTrainDialog}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            onClick={handleConfirmTrain}
            color="primary"
            disabled={!trainingModel}
          >
            Train Model
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ProjectManager;
