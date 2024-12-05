/**
 * <HTTP METHOD> /finetune/*
 * Fine tuning for Ollama models
 */
import { Router, Request, Response, NextFunction } from "express";
import { ServerResponse } from "http";
import fs from "fs-extra";
import path from "path";
import { exec } from "child_process";
import axios from "axios";
import mime from "mime-types";
import dayjs from "dayjs";
//import * as transformers from "@huggingface/transformers";
import { db } from "../sqlite";
import * as fileProcs from "../utils/file-processing";
import slugid from "slugid";
import {
  docrootPath,
  projectsPath,
  ollamaModelDir,
  ollamaManifestDir,
  ollamaBlobDir,
  ollamaContainerName,
  ollamaModelPathTmpl,
  ollamaFtDestinationTmpl,
} from "../server";
import { endsWith, isArray, isObject, size, uniqBy } from "lodash";

const router = Router();

//- Helper Functions
//------------------------------------------------------------------------------
/**
 * Execute ollama commands in the docker container
 * @param {string} command -
 * @param {string} container - Docker container name
 * @returns {Promise<string>}
 */
const runOllamaCommand = (
  command: string,
  container: string = ollamaContainerName,
): Promise<string> => {
  //  -i = interactive
  const dockerCmd = `docker exec -i ${container} ${command}`;

  return new Promise((resolve, reject) => {
    exec(dockerCmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr);
      } else {
        resolve(stdout);
      }
    });
  });
};

interface ProgressUpdate {
  progress: number;
  type?: string;
  res?: ServerResponse;
  socket?: any; // Add a socket property for Socket.IO
  projectId?: string; // Add projectId if using Socket.IO in rooms
}

const sendProgressUpdateToClient = ({
  progress,
  type = "res",
  res,
  socket,
  projectId, // Pass the projectId if using Socket.IO rooms
}: ProgressUpdate): void => {
  // using res.write()
  if (type === "res") {
    if (res) {
      res?.write(JSON.stringify({ finetuningProgress: progress }));
    }
  } else if (type === "socket" && socket) {
    if (projectId) {
      // Send to a specific room (project)
      socket.to(projectId).emit("finetuningProgress", progress);
    } else {
      // Direct to client
      socket.emit("finetuningProgress", progress);
    }
  } else {
    console.warn(
      "Invalid progress update type or missing response/socket object.",
    );
  }
};

/**
 * Update job status for various tables.  Fields set to update will determine
 * what tables and fields will update
 * use projectStatus for user-selected project status, such as "ready"(to process), "archive", etc
 * use jobStatus for automated status states
 *
 */
const updateStatus = ({
  projectId,
  fileId = null,
  jobId = null,
  model = null,
  projectStatus = null,
  jobStatus = "touch", // touch, start, finetune, complete, error, stop
  percentage = null,
}: {
  projectId: string;
  fileId?: string | string[] | null;
  jobId?: string | null;
  model?: string | null;
  projectStatus?: string | null;
  jobStatus?: string | null;
  percentage?: number | null;
}) => {
  return; // Enable the rest after implementing fine tuning
  const validProjectStatus = ["normal"];
  const validJobStatus = [
    "touch",
    "start",
    "finetune",
    "complete",
    "processing",
    "processed",
    "error",
    "stop",
  ];
  const _now = new Date().toISOString();
  const fileIds = !isArray(fileId) ? [fileId] : fileId;
  //const _multipleFiles = size(fileIds) > 1;
  let _insertJob = null;

  // Get current data
  const projectJob: any = db
    .prepare(
      `SELECT p.id as projectId, p.models, p.status, 
  j.id as jobId, j.model as jobModel, j.status AS jobStatus, j.createdAt AS jobCreatedAt, 
  j.lastUpdateAt, j.finishedAt
  FROM projects p
  LEFT JOIN jobs j ON j.projectId = p.id`,
    )
    .all();

  const files: any = db
    .prepare(`SELECT * FROM files WHERE projectId = ?`)
    .all(projectId);
  console.log("finetune:updateStatus()", { projectJob, files });

  // Files to process
  const procFiles =
    size(fileIds) > 0
      ? files.filter((f: any) => fileIds?.includes(f.id))
      : files;

  const hasJobEntry = projectJob?.jobId;
  const hasFiles = size(files) > 0;
  let projectFields: string[] = [];
  let projectValues: any[] = [];
  let jobFields: string[] = [];
  let jobValues: any[] = [];
  let fileFields: Record<string, string[]> = {};
  let fileValues: Record<string, string[]> = {};

  if (hasFiles) {
    // Cant do anything without files!
    if (!hasJobEntry) {
      jobId = slugid.nice();
      // Add job entry
      const _res = db
        .prepare(
          "INSERT INTO jobs (id, projectId, status, model, createdAt) VALUES(?, ?, ?, ?, ?)",
        )
        .run(jobId, projectId, jobStatus, model, _now);
      _insertJob = _res && _res.changes;
    }
    // Build update fields/values
    if (projectStatus) {
      if (!validProjectStatus.includes(projectStatus as string)) {
        throw new Error(
          `Invalid status passed.  Tried ${projectStatus}.  Valid options: ${validProjectStatus.join(", ")}`,
        );
      }
      projectFields.push("status = ?");
      projectValues.push(projectStatus);
    }

    if (jobStatus) {
      if (!validJobStatus.includes(jobStatus as string)) {
        throw new Error(
          `Invalid status passed.  Tried ${jobStatus}.  Valid options: ${validJobStatus.join(", ")}`,
        );
      }
      jobFields.push("status = ?");
      jobValues.push(jobStatus);
      if (jobStatus === "complete") {
        jobFields.push("finishedAt=?");
        jobValues.push(_now);
      }
    }
    if (model) {
      // Check existing model(s) for project & files and update if necessary
      // Projects and files may have multiple models they were trained on
      if (projectJob.models && projectId) {
        let existingModels = projectJob.models
          ? JSON.parse(projectJob.models)
          : [];
        existingModels = uniqBy(
          [...existingModels, { name: model, tunedAt: _now, projectId }],
          "name",
        );
        projectFields.push("models = ?");
        projectValues.push(JSON.stringify(existingModels));
      }
    }
    if (files.models && model) {
      // If only a subset of files are passed, update those only
      procFiles.forEach((file: any, index: number) => {
        if (file.model) {
          let existingModels = file.models ? JSON.parse(file.models) : [];
          existingModels = uniqBy(
            [...existingModels, { name: model, tunedAt: _now, projectId }],
            "name",
          );
          fileFields = {
            ...(fileFields || {}),
            [file.name]: fileFields[file.name] || [],
          };
          fileValues = {
            ...(fileValues || {}),
            [file.name]: fileValues[file.name] || [],
          };
          fileFields[file.name].push("models = ?");
          fileValues[file.name].push(JSON.stringify(existingModels));
        }
      });
    }
    if (percentage) {
      jobFields.push("percentage = ?");
      jobValues.push(percentage);
    }
  }
  // Run Queries
  let status: any = { projects: {}, files: {}, jobs: {} };
  // Projects
  for (const [key, val] of Object.entries({
    projects: { fields: projectFields, vals: projectValues },
    jobs: { fields: jobFields, vals: jobValues },
    files: { fields: fileFields, vals: fileValues },
  })) {
    let primaryKeyVal: string | null = "";
    switch (key) {
      case "projects":
        primaryKeyVal = projectId;
        break;
      case "jobs":
        primaryKeyVal = jobId;
        break;
    }
    if (key !== "files" && size(val.fields) > 0 && primaryKeyVal) {
      // Projects or Jobs
      const st = `UPDATE ${key} SET ${(val.fields as string[]).join(", ")} WHERE id = ?`;
      const result = db
        .prepare(st)
        .run(...((val.vals as any[]) || []), primaryKeyVal);
      status[key] = {
        ...result,
        _status: result.changes > 0 ? "success" : "failed",
      };
    } else if (key === "files" && size(val.fields) > 0 && isObject(val.vals)) {
      // Files
      for (const [fileUid, fileVals] of Object.entries(val.vals)) {
        const st = `UPDATE files SET ${(fileVals.fields[fileUid] as string[]).join(", ")} WHERE id = ?`;
        const result = db
          .prepare(st)
          .run(...((fileVals.vals[fileUid] as any[]) || []), fileUid);
        status[key] = {
          ...result,
          _status: result.changes > 0 ? "success" : "failed",
        };
      }
    }
  }
};

interface MyFiles {
  path: string;
  type: string;
  name: string;
  originalName: string;
}
interface PrepareTrainingData {
  projectId: string;
  path: string;
}

interface PrepareTrainingDataReturn {
  project: any;
  files: MyFiles[];
  //combinedData: string;
}
/**
 * Prepare the training data
 * @param param0.projectId
 * @returns
 */
const prepareTrainingData = async ({
  projectId,
  path: _path,
}: PrepareTrainingData): Promise<PrepareTrainingDataReturn> => {
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId);

  const files = db
    .prepare("SELECT path FROM files WHERE projectId = ?")
    .all(projectId) as MyFiles[];

  // Prepare data for finetuning based on file types
  const jsonData: any[] = [];

  if (project && files) {
    for (const file of files) {
      try {
        file.path = path.join(docrootPath, file.path);
        const mimeType = mime.lookup(file.path) || file.type;
        let fileContent: any = {};

        switch (mimeType) {
          case "text/plain":
            fileContent.text = fileProcs.preprocessText(file.path) + "\n"; // Assuming each text file is a single entry.
            break;
          case "application/json":
            fileContent.json_text = fileProcs.preprocessJSON(file.path) + "\n";
            break;
          case "application/jsonl": // Process as JSONL (triples or other format)
            fileContent.jsonl_text =
              fileProcs.preprocessJSONL(file.path) + "\n"; // Or appropriate preprocessing for JSONL format
            break;
          case "application/pdf":
            fileContent.pdf_text = await fileProcs.preprocessPDF(file.path);
            break;
          case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            fileContent.docx_text = await fileProcs.preprocessDocx(file.path);
            break;
          case "text/csv":
          case "application/vnd.ms-excel": // Handle both .csv and .xls as CSV
            fileContent.csv_text = await fileProcs.preprocessCSV(file.path);
            break;
          case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            fileContent.xls_text = await fileProcs.preprocessXlsx(file.path);
            break;

          default:
            console.warn(
              `Unsupported file type: ${file.type} for file ${file.originalName}`,
            );
        }
        console.log("Pre-process file: ", {
          file: file.path,
          size: size(fileContent),
          mimeType,
        });
        if (Object.keys(fileContent).length > 0) {
          // Add to main array only if content was extracted
          jsonData.push(fileContent);
        }
      } catch (error) {
        console.error(`Error processing file ${file.originalName}:`, error);
      }
    }
  }

  const jsonlData = jsonData.map((item) => JSON.stringify(item)).join("\n");
  fs.writeFileSync(_path, jsonlData);
  return { project, files };
};

/**
 * Get the manifest for a particular model
 * @param {string|array|null} param0.model - Model name, names, or empty for all
 * @returns {object} - Manifest list
 */
const getManifests = async ({
  model = [],
}: {
  model: string[] | string | null;
}): Promise<{ status: boolean; manifest: any }> => {
  let modelNames = [];

  try {
    if (typeof model === "string") {
      modelNames = [model];
    } else if (Array.isArray(model)) {
      modelNames = model;
    } else {
      const modelDirs = await runOllamaCommand(`ls ${ollamaManifestDir}`);
      modelNames = modelDirs
        .trim()
        .split("\n")
        .filter((name) => name.trim() !== "");
    }

    let manifests: { [key: string]: any } = {};
    for (const modelName of modelNames) {
      try {
        const manifestContent = await runOllamaCommand(
          `cat ${path.join(ollamaManifestDir, modelName, "latest")}`,
        );
        manifests[modelName] = JSON.parse(manifestContent);

        const modelLayer = manifests[modelName].layers.find(
          (layer: any) =>
            layer.mediaType === "application/vnd.ollama.image.model",
        );

        if (modelLayer) {
          manifests[modelName].modelBlobPath = path.join(
            ollamaBlobDir,
            modelLayer.digest.replace(":", "-"),
          );

          // Filter extensions ending with:
          const extensionsToRead = ["system", "template", "params"];
          const extensionsToParse = ["params"]; // JSON.parse() these
          const maxSizeToParse = 512 * 1024;

          manifests[modelName].files = [];
          for (const layer of manifests[modelName].layers) {
            if (
              extensionsToRead.some((v) => endsWith(layer.mediaType, v)) &&
              layer.size <= maxSizeToParse
            ) {
              const blobPath = path.join(
                ollamaBlobDir,
                layer.digest.replace(":", "-"),
              );

              try {
                const fileContent = await runOllamaCommand(`cat ${blobPath}`);
                manifests[modelName].files.push({
                  type: layer.mediaType,
                  path: blobPath,
                  content: extensionsToParse.some((v) =>
                    endsWith(layer.mediaType, v),
                  )
                    ? JSON.parse(fileContent.trim())
                    : fileContent.trim(), // Add trimmed content
                });
              } catch (readError) {
                console.error(
                  `Error reading file content for ${modelName}/${layer.mediaType}:`,
                  readError,
                );
              }
            }
          }
        } else {
          console.warn(
            `No model layer found for ${modelName}. Manifest might be invalid.`,
          );
        }
      } catch (error) {
        console.error(
          `Error reading or processing manifest for ${modelName}:`,
          error,
        );
      }
    }
    return { manifest: manifests, status: true };
  } catch (error) {
    return { manifest: {}, status: false };
  }
};

//- Endpoints
//------------------------------------------------------------------------------
/**
 * Default
 */
router.get("/", (req, res) => {
  res.json({ data: "Hello /finetuneUniverse!1" });
});

/**
 * Initiate the finetuning process for a given project
 * @param {string} req.query.projectId - Project UID
 * @param {string} req.body.model - Model to finetune
 */
router.post(
  "/:projectId/initiate",
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId;
    const { model } = req.body; // Add model selection
    //const filePaths = files.map((file: any) => file.path);
    const trainingDataPath = path.join(
      projectsPath,
      projectId,
      "training_data.jsonl",
    );

    try {
      const {
        project,
        files,
        //combinedData: trainingData,
      } = await prepareTrainingData({
        projectId,
        path: trainingDataPath,
      });
      if (!files) {
        res.status(404).json({ error: "Project not found" });
      }

      // Source model path
      const baseModelPath = `${ollamaModelPathTmpl.replace("%MODEL%", model)}`;
      // Training output path
      const outputPath = `/tmp/trained_models/${projectId}/${model}`; // Tmp
      const filePaths = files.map((file: any) => file.path);

      // Get manifest data for this model
      const { manifest }: any = (await getManifests({ model })) || {};

      // Create the request body
      const requestBody = {
        base_model_path: manifest[model]["modelBlobPath"],
        output_path: outputPath,
        training_data_path: trainingDataPath,
      };

      // Request to FastAPI
      const trainingResponse = await axios.post(
        `http://localhost:8010/train/${projectId}/${model}`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
          },
          responseType: "stream", // Handle streaming responses
        },
      );

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      if (trainingResponse.status >= 400) {
        const errorData = trainingResponse.data;
        const errorMessage = errorData?.detail || trainingResponse.statusText;
        throw new Error(
          `FastAPI training request failed (${trainingResponse.status}): ${errorMessage}`,
        );
      }

      const reader = trainingResponse.data?.getReader();

      if (!reader) {
        throw new Error("No response body to read");
      }

      let decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        let chunk = decoder.decode(value, { stream: true });
        let messages = chunk.split("\n").filter((msg) => msg.length > 0); // Split into individual json

        messages.forEach((message) => {
          let parsedMessage;
          try {
            parsedMessage = JSON.parse(message);
            updateStatus({ projectId, model, jobStatus: "finetune" });
          } catch (e) {
            console.error("Error parsing FastAPI stream message:", e, message);
            return;
          }

          if ("progress" in parsedMessage) {
            const progress = parsedMessage.progress;
            sendProgressUpdateToClient({ progress: progress, res });
            console.log("Training progress:", progress);
          } else if (parsedMessage.status === "success") {
            const trainedModelDir = parsedMessage.trained_model_dir;

            const destinationDir = ollamaFtDestinationTmpl.replace(
              "%MODEL%",
              model,
            ); // path within Docker:Ollama container

            // Copy trained model from local > Docker:ollama:/path/to/destination
            runOllamaCommand(
              `docker cp ${trainedModelDir} ${ollamaContainerName}:${destinationDir}`,
            )
              .then((output) => {
                // Execute finetuning and update status (this is a simplified status update)
                updateStatus({
                  projectId,
                  jobStatus: "complete",
                });
                res.write(
                  `data: ${JSON.stringify({ message: "Fine-tuning and model move complete", output })}\n\n`,
                ); // Send final message to the client

                // Import trained model into Ollama as a new model:
                runOllamaCommand(
                  `ollama create ${model}-FT-${dayjs().format("YYYYMMDD.HHmm")} ${trainedModelDir} ${ollamaContainerName}:${destinationDir}`,
                ).then((output) => {});

                res.end();
              })
              .catch((copyError) => {
                console.error(
                  "Error copying model to Ollama container",
                  copyError,
                );
                res
                  .status(500)
                  .json({ error: "Error moving model to Ollama container" });
              });
          } else {
            updateStatus({
              projectId,
              jobStatus: "error",
            });
            console.error("Unexpected response from FastAPI:", message);
          }
        });
      }
    } catch (error: any) {
      updateStatus({
        projectId,
        jobStatus: "error",
      });
      console.error("Error during fine-tuning:", error); // Log and handle the error appropriately
      res
        .status(500)
        .json({ error: "Failed to fine-tune model: " + error.message }); // Send error response to the client
    }
  },
);

/**
 * Stop finetuning for a project
 * TODO: Complete logic for murdering the finetune process
 * @param {string} req.query.projectId - Project UID
 */
router.post("/:projectId/stop", async (req, res) => {
  const projectId = req.params.projectId;
  try {
    // Execute pkill inside the Ollama container
    //const processName = `ollama_finetune_${projectId}`;
    //await runOllamaCommand(`pkill -f ${processName}`)  // Use -f (full command) if possible

    // Only enable this when the actual stop process occurs
    // updateStatus({
    //   projectId,
    //   jobStatus: "stop",
    // });
    res.json({ message: "Finetuning stopped" });
  } catch (error) {
    console.error("Error stopping finetuning:", error);
    res.status(500).json({ error: "Failed to stop finetuning" });
  }
});

/**
 * Get Fine-tuning status
 * @param {string} req.query.projectId - Project UID
 */
router.get("/status/:projectId?", (req: Request, res: Response): void => {
  const projectIds = req.params.projectId
    ? req.params.projectId.split(",")
    : null;

  try {
    let query = "SELECT * FROM jobs";
    let params: string[] = [];

    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => "?").join(",");
      query += ` WHERE projectId IN (${placeholders})`;
      params = projectIds;
    }

    const projects = db.prepare(query).all(...params);
    if (projects.length === 0 && projectIds) {
      // No results is not necessarily a failure
      res.status(204).json({ error: "No matching project(s) found" });
    } else {
      res.json(projects);
    }
  } catch (error) {
    console.error("Error getting finetuning status:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * Get a list of model manifests from the docker image
 * @param {string} req.query.model - model name
 */
router.get("/manifests/:model?", async (req: Request, res: Response) => {
  const requestedModel = req.params.model;
  const manifest = await getManifests({ model: requestedModel });

  if (manifest.status === true) {
    res.status(200).json(manifest.manifest);
  } else {
    res.status(500).json({ error: "Failed to fetch manifests" });
  }
});

export default router;
