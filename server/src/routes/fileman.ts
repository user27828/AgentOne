/**
 * <HTTP METHOD> /finetune/*
 * Fine tuning for Ollama models
 */
import { Router, Request, Response } from "express";
import fs from "fs-extra";
import path, { resolve } from "path";
import { isEmpty, size } from "lodash";
import mime from "mime-types";
import slugid from "slugid";
import multer from "multer";
import busboy from "busboy";
import { db } from "../sqlite";
import { uploadPath, docrootPath, projectsPath } from "../server";
import { allowedUploadTypes } from "../utils/file-types";

const router = Router();
const upload = multer({ dest: uploadPath });

//- Helper Functions
//------------------------------------------------------------------------------

//- Endpoints
//------------------------------------------------------------------------------
/**
 * Default
 */
router.get("/", (req, res) => {
  res.json({ data: "Hello /filemanUniverse!1" });
});

/**
 * Get a list of all projects
 */
router.get("/projects", (req, res) => {
  const projects = db.prepare("SELECT * FROM projects").all();
  res.json(projects);
});

/**
 * Get specific project data
 * @param {string} req.query.projectId - Project UID
 */
router.get("/project/:projectId", (req: Request, res: Response): void => {
  const projectId = req.params.projectId;
  try {
    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
    }

    const files = db
      .prepare("SELECT * FROM files WHERE projectId = ?")
      .all(projectId);
    res.json({ ...(project as object), files });
  } catch (error) {
    console.error("Error getting project details:", error);
    res.status(500).json({ error: "Failed to get project details" });
  }
});

/**
 * Create a new project
 */
router.post("/project", (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (isEmpty(name)) {
    res.status(422).json({ error: "Missing required parameters" });
  }
  const id = slugid.nice();
  const createdAt = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO projects (id, name, description, createdAt, status) VALUES (?, ?, ?, ?, ?)",
    ).run(id, name, description, createdAt, "created");
    console.log("Project Created: ", { id, name, createdAt });
    res.json({ id, name, description, createdAt });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

/**
 * Update/Patch Project Details
 * @param {string} req.query.projectId - Project UID
 * @param {string} req.body.name - Project name
 * @param {string} req.body.description - Project description
 * @param {array} req.body.models - Models used with this project
 */
router.patch("/project/:projectId", (req: Request, res: Response): void => {
  const projectId = req.params.projectId;
  const { name, description, models } = req.body; // Get the fields to update
  if (isEmpty(name)) {
    res.status(422).json({ error: "Missing required parameters" });
  }

  try {
    // Build SQL update statement dynamically based on provided fields
    let updateFields = [];
    let updateValues = [];

    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    if (description) {
      updateFields.push("description = ?");
      updateValues.push(description);
    }
    if (models) {
      updateFields.push("models = ?");
      updateValues.push(JSON.stringify(models)); // Store models as JSON string
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: "No fields to update provided" });
    }

    const updateStatement = `UPDATE projects SET ${updateFields.join(", ")} WHERE id = ?`;
    updateValues.push(projectId);

    // Execute the update
    const result = db.prepare(updateStatement).run(...updateValues);

    if (result.changes > 0) {
      res.json({ message: "Project updated successfully" });
    } else {
      res.status(404).json({ error: "Project not found" });
    }
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

/**
 * Delete Project - DB + fs
 * @param {string} req.query.projectId - Project UID
 */
router.delete("/project/:projectId", (req, res) => {
  const projectId = req.params.projectId;
  if (isEmpty(projectId)) {
    res.status(422).json({ error: "Missing required parameters" });
  }
  try {
    // Delete project from DB
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Delete from fs
    const projectDir = path.join(projectsPath, projectId);
    if (fs.existsSync(projectDir)) {
      fs.removeSync(projectDir);
    }

    res.json({ message: "Project deleted" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

/**
 * File(s) upload with progress
 * @param {string} req.query.projectId - Project UID
 */
router.post("/project/:projectId/files-progress", (req, res) => {
  const projectId = req.params.projectId;
  if (isEmpty(projectId)) {
    res.status(422).json({ error: "Missing required parameters" });
  }
  try {
    let errors: string[] = [];
    let files = [] as {
      id: string;
      originalName: string;
      type: string;
      path: string;
      ext: string;
      createdAt: string;
      progress: number;
    }[];
    let totalBytes = 0;
    let uploadedBytes = 0;
    // Get totalBytes from header *once* - more efficient
    if (req.headers["content-length"]) {
      totalBytes = Number(req.headers["content-length"]); // Use Number() to convert, not parseInt()
    }

    const busboyman = busboy({ headers: req.headers });

    busboyman.on("file", (fieldname: string, file: any, info: any) => {
      const { filename, encoding, mimeType } = info;
      const fileMimeType =
        mime.lookup(filename) || mimeType || "application/octet-stream";

      const isAllowed = allowedUploadTypes.some((category: any) =>
        category.mimeTypes.includes(fileMimeType),
      );
      if (!isAllowed) {
        const error = `Rejected file upload: ${filename} (Invalid type)`;
        errors.push(error);
        console.error(error);
        file.resume(); // Discard the file
        return; // Stop processing this file
      }

      let fileSize = 0;
      totalBytes += parseInt(req.headers["content-length"] || "");

      const id = slugid.nice();
      const ext = path.extname(filename).slice(1); // ext without the dot
      const filePath = path.join(
        projectsPath,
        projectId,
        `${id}${path.extname(filename)}`,
      );
      const fileRelativePath = filePath.replace(docrootPath, "");

      fs.ensureDirSync(path.dirname(filePath));

      const insertFileStatement = db.prepare(
        "INSERT INTO files (id, projectId, name, originalName, path, type, ext, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );

      const createdAt = new Date().toISOString();
      insertFileStatement.run(
        id,
        projectId,
        filename,
        filename,
        fileRelativePath, // Only keep the relative path
        fileMimeType,
        ext,
        createdAt,
      );

      files.push({
        id,
        originalName: filename,
        type: mimeType,
        path: fileRelativePath,
        ext,
        createdAt,
        progress: 0,
      });

      const writeStream = fs.createWriteStream(filePath);
      file.pipe(writeStream);

      file.on("data", (data: any) => {
        fileSize += data.length;
        uploadedBytes += data.length;

        const currentFileIndex = files.findIndex(
          (f) => f.originalName === filename,
        );
        if (currentFileIndex > -1) {
          files[currentFileIndex].progress = Math.round(
            (uploadedBytes / totalBytes) * 100,
          );
        }

        // Emit progress to the client
        res.write(JSON.stringify({ totalBytes, uploadedBytes, files }));
        console.log({ totalBytes, uploadedBytes, files });
      });

      file.on("end", () => {
        console.log(`File [${filename}] finished`);
        // Update file size
        const st = db.prepare("UPDATE files SET size=? WHERE id= ?");
        st.run(fileSize, id);
        res.write(JSON.stringify({ totalBytes, uploadedBytes, files }));
      });
    });

    busboyman.on("finish", () => {
      console.log(
        errors
          ? ["Some files uploaded successfully", ...errors]
          : "All files uploaded successfully.",
      );
      res.end();
    });

    req.pipe(busboyman);
  } catch (e) {
    console.error("Error processing file uploads", e);
    res.status(500).json({ error: "File upload failed" });
  }
});

/**
 * File upload endpoint - no progress
 * @param {string} req.query.projectId - Project UID
 */
router.post(
  "/project/:projectId/files",
  upload.array("files"),
  async (req: Request, res: Response) => {
    const projectId = req.params.projectId;
    if (isEmpty(projectId)) {
      res.status(422).json({ error: "Missing required parameters" });
    }
    const uploadedFiles = req.files as Express.Multer.File[];
    /**
     * Are the uploaded files valid?
     */
    const validFiles = uploadedFiles.filter((file) => {
      const mimeType =
        mime.lookup(file.originalname) || "application/octet-stream";
      const category = allowedUploadTypes.find((cat) =>
        cat.mimeTypes.includes(mimeType),
      );

      if (!category) {
        console.error(
          `Rejected file upload (invalid type): ${file.originalname}`,
        );
        return false;
      }

      if (file.size > category.maxSizeBytes) {
        console.error(`Rejected file upload (too large): ${file.originalname}`);
        return false;
      }
      return true;
    });

    if (validFiles.length < uploadedFiles.length) {
      // Some files were rejected - send a partial or error response as needed
      res.status(400).json({
        error: "Some files were rejected due to invalid type or size",
      });
    }

    try {
      const insertFileStatement = db.prepare(
        "INSERT INTO files (id, projectId, name, originalName, path, type, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );

      const files = uploadedFiles.map((file) => {
        const id = slugid.nice();
        const originalName = file.originalname;
        const type = mime.lookup(originalName) || "application/octet-stream";
        const filePath = path.join(
          projectsPath,
          projectId,
          id + path.extname(originalName),
        ); // Organize files by project
        const fileRelativePath = filePath.replace(docrootPath, "");

        fs.ensureDirSync(path.dirname(filePath)); // Make sure directory exists
        fs.moveSync(file.path, filePath);
        const createdAt = new Date().toISOString();
        insertFileStatement.run(
          id,
          projectId,
          originalName,
          originalName,
          fileRelativePath,
          type,
          createdAt,
        );

        return {
          id,
          projectId,
          name: originalName,
          originalName,
          path: fileRelativePath,
          type,
          createdAt,
        };
      });

      res.json({ files });
    } catch (error) {
      console.error("Error uploading files:", error);
      res.status(500).json({ error: "Failed to upload files" });
    }
  },
);

/**
 * Update/Patch File Details
 * @param {string} req.query.projectId - Project UID
 * @param {string} req.query.fileId - File UID
 */
router.patch(
  "/project/:projectId/files/:fileId",
  (req: Request, res: Response): void => {
    const projectId = req.params.projectId;
    const fileId = req.params.fileId;
    if (isEmpty(projectId) || isEmpty(fileId)) {
      res.status(422).json({ error: "Missing required parameters" });
    }
    const { name, description, models } = req.body; // Fields allowed to update

    try {
      // finfo from the database
      const file: any = db
        .prepare("SELECT * FROM files WHERE id = ? AND projectId = ?")
        .get(fileId, projectId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
      }

      // Build SQL update statement dynamically
      let updateFields = [];
      let updateValues = [];

      if (name) {
        updateFields.push("name = ?"); // Update both name and originalName if a new name is provided
        updateValues.push(name);
        // FS-based renames
        // const oldFilePath = file.path;
        // const newFilePath = path.join(path.dirname(oldFilePath), name + path.extname(oldFilePath));
        // updateFields.push("path = ?");
        // updateValues.push(newFilePath);
        // Rename on file system - disabled
        //fs.renameSync(oldFilePath, newFilePath);
      }

      if (description) {
        updateFields.push("description = ?");
        updateValues.push(description);
      }
      if (models) {
        updateFields.push("models = ?");
        updateValues.push(JSON.stringify(models)); // Store models as JSON string
      }

      if (updateFields.length === 0) {
        res.status(400).json({ error: "No fields to update provided" });
      }

      updateValues.push(fileId); // Add the fileId for the WHERE clause
      const updateStatement = `UPDATE files SET ${updateFields.join(", ")} WHERE id = ?`;
      // Execute update
      const result = db.prepare(updateStatement).run(...updateValues);

      if (result.changes > 0) {
        res.json({ message: "File updated successfully" });
      } else {
        res.status(404).json({ error: "File not found or not modified." });
      }
    } catch (error) {
      console.error("Error updating file:", error);
      res.status(500).json({ error: "Failed to update file" });
    }
  },
);

/**
 * Delete multiple files
 * @param {string} req.query.projectId - Project UID
 * @param {array} req.body.fileIds - File UIDs to delete
 */
router.delete(
  "/project/:projectId/files",
  (req: Request, res: Response): void => {
    const projectId = req.params.projectId;
    const fileIds = req.body.fileIds; // Expect an array of file IDs
    if (isEmpty(projectId) || size(fileIds) === 0) {
      res.status(422).json({ error: "Missing required parameters" });
    }
    if (!fileIds || !Array.isArray(fileIds)) {
      res
        .status(400)
        .json({ error: "Invalid fileIds provided.  Must be an array." });
    }

    try {
      const deleteFileStatement = db.prepare(
        "DELETE FROM files WHERE id = ? AND projectId = ?",
      );
      let deletedCount = 0;
      const errors = [];

      for (const fileId of fileIds) {
        // Get file info (for error reporting)
        const file: any = db
          .prepare("SELECT * FROM files WHERE id = ? AND projectId = ?")
          .get(fileId, projectId);

        if (file) {
          try {
            fs.removeSync(file.path); // file system
            deleteFileStatement.run(fileId, projectId); // Delete from database
            deletedCount++;
          } catch (fsError) {
            console.error(
              `Error deleting file ${fileId} from filesystem:`,
              fsError,
            );
            errors.push({ fileId, error: "Failed to delete from filesystem" });
          }
        } else {
          errors.push({ fileId, error: "File not found" });
        }
      }

      if (errors.length > 0) {
        // Some or all files failed to delete. Return partial success/list of failures
        res.status(207).json({
          message: `Deleted ${deletedCount} files. Some files may have failed to delete.`,
          errors: errors,
        });
      } else {
        res.json({ message: `Deleted ${deletedCount} files successfully` });
      }
    } catch (error) {
      console.error("Error deleting files:", error);
      res.status(500).json({ error: "Failed to delete files" });
    }
  },
);

/**
 * Move multiple files to a different project
 * @param {string} req.query.projectId - Project UID
 * @param {string} req.body.newProjectId - Destination Project UID
 * @param {string} req.body.fileIds - File UIDs
 */
router.post(
  "/project/:projectId/files/move",
  (req: Request, res: Response): void => {
    const projectId = req.params.projectId;
    const { newProjectId, fileIds } = req.body; // Get new project ID and array of file IDs
    if (isEmpty(projectId) || isEmpty(newProjectId) || size(fileIds) === 0) {
      res.status(422).json({ error: "Missing required parameters" });
    }
    if (!fileIds || !Array.isArray(fileIds)) {
      res
        .status(400)
        .json({ error: "Invalid fileIds provided. Must be an array." });
    }

    try {
      // Check if destination project exists
      const newProject = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(newProjectId);
      if (!newProject) {
        res.status(404).json({ error: "Destination project not found" });
      }

      let movedCount = 0;
      const errors = [];

      for (const fileId of fileIds) {
        try {
          // Get file info
          const file: any = db
            .prepare("SELECT * FROM files WHERE id = ? AND projectId = ?")
            .get(fileId, projectId);
          if (!file) {
            errors.push({ fileId, error: "File not found" });
            continue; // next file
          }

          // new file path
          const oldFilePath = file.path;
          const newFilePath = path.join(
            projectsPath,
            newProjectId,
            file.name + path.extname(oldFilePath),
          );

          fs.moveSync(oldFilePath, newFilePath); // Move file

          // Update DB
          db.prepare(
            "UPDATE files SET projectId = ?, path = ? WHERE id = ?",
          ).run(newProjectId, newFilePath, fileId);
          movedCount++;
        } catch (error) {
          console.error(`Error moving file ${fileId}:`, error);
          errors.push({ fileId, error: "Failed to move file" });
        }
      }

      if (errors.length > 0) {
        // Partial failure
        res.status(207).json({
          // 207 Multi-Status
          message: `Moved ${movedCount} files. Some files may have failed to move.`,
          errors,
        });
      } else {
        res.json({ message: `Moved ${movedCount} files successfully` });
      }
    } catch (error) {
      console.error("Error moving files:", error);
      res.status(500).json({ error: "Failed to move files" });
    }
  },
);

/**
 * Get file content for download or viewing
 * @param {string} req.query.projectId - Project UID
 * @param {string} req.body.fileId - File UID
 */
router.get(
  "/project/:projectId/files/:fileId",
  (req: Request, res: Response): void => {
    const projectId = req.params.projectId;
    const fileId = req.params.fileId;
    const download = req.query.download === "true"; // download?
    if (isEmpty(projectId) || isEmpty(fileId)) {
      res.status(422).json({ error: "Missing required parameters" });
    }

    try {
      // Retrieve file information from DB
      const file: any = db
        .prepare("SELECT * FROM files WHERE id = ? AND projectId = ?")
        .get(fileId, projectId);

      if (!file) {
        res.status(404).json({ error: "File not found" });
      }
      const filePath = docrootPath + file.path;

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error("File not found on file system:", filePath); // Log the error for debugging
        res.status(404).json({ error: "File not found on server" });
      }

      // Set Content-Type header based on file type
      const contentType = file.type || "application/octet-stream"; // Default to octet-stream if type is unknown
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store, max-age=0"); // Prevent caching

      // header for download or viewing
      res.setHeader(
        "Content-Disposition",
        download
          ? // Download
            `attachment; filename="${file.originalName}"`
          : // Inline
            `inline; filename="${file.originalName}"`,
      );

      // Send file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error getting file content:", error);
      res.status(500).json({ error: "Failed to retrieve file" });
    }
  },
);

export default router;
