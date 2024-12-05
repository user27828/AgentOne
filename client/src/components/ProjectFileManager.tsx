/**
 * Dialog with the project and file manager
 * Inclusion will display a button that would initiate the dialog
 */
import { useState } from "react";
import {
  Dialog,
  Grid2 as Grid,
  Button,
  Typography,
  Divider,
} from "@mui/material";
import ProjectManager from "./ProjectManager";
import FileManager from "./FileManager";
export const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

/**
 * @component
 */
const ProjectFileManager = ({ models }: { models: string[] }) => {
  const [open, setOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const handleClose = () => {
    setOpen(false);
    setSelectedProject(null); // Clear selected project on close
  };

  const handleProjectSelect = (project: any) => {
    setSelectedProject(project);
  };

  return (
    <>
      <Button variant="contained" size="small" onClick={() => setOpen(true)}>
        Manage User Data
      </Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xl">
        <Grid container direction="column" spacing={2} sx={{ padding: 2 }}>
          <Grid size={12}>
            <ProjectManager
              models={models}
              onSelectProject={handleProjectSelect}
            />
            <Divider />
          </Grid>
          <Grid size={12}>
            {selectedProject && ( // Only show FileManager if a project is selected
              <FileManager projectId={selectedProject.id} />
            )}
            {!selectedProject && (
              <Typography variant="body1">
                Select a project to manage files.
              </Typography>
            )}
          </Grid>
          <Grid size={12}>
            <Button variant="outlined" onClick={handleClose}>
              Close
            </Button>
          </Grid>
        </Grid>
      </Dialog>
    </>
  );
};

export default ProjectFileManager;
