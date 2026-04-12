/**
 * Dialog with the project and file manager
 * Inclusion will display a button that would initiate the dialog
 */
import { useState } from "react";
import { Dialog, Button, Typography, Divider, Box, Stack } from "@mui/material";
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
        <Stack spacing={2} sx={{ padding: 2 }}>
          <Box>
            <ProjectManager
              models={models}
              onSelectProject={handleProjectSelect}
            />
            <Divider />
          </Box>
          <Box>
            {selectedProject && ( // Only show FileManager if a project is selected
              <FileManager projectId={selectedProject.id} />
            )}
            {!selectedProject && (
              <Typography variant="body1">
                Select a project to manage files.
              </Typography>
            )}
          </Box>
          <Box>
            <Button variant="outlined" onClick={handleClose}>
              Close
            </Button>
          </Box>
        </Stack>
      </Dialog>
    </>
  );
};

export default ProjectFileManager;
