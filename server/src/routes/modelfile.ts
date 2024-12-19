/**
 * Modelfile endpoints
 * /modelfile
 * @see {@link https://github.com/ollama/ollama/blob/main/docs/modelfile.md|Ollama Modelfiles}
 * @see {@link https://github.com/ollama/ollama/blob/main/docs/api.md|Ollama API}
 */
import { Router, Request, Response } from "express";
import slugid from "slugid";
import { db } from "../sqlite";

const router = Router();
const modelfile_template = `FROM %MODEL%
# sets the temperature to 1 [higher is more creative, lower is more coherent]
#PARAMETER temperature %TEMPERATURE%
# sets the context window size to 4096, this controls how many tokens the LLM can use as context to generate the next token
#PARAMETER num_ctx %CONTEXT%

# sets a custom system message to specify the behavior of the chat assistant
SYSTEM %CONTENT-SYSTEM%
`;
const modelfile_default_content =
  "You are George Washington, first President of the United States of America, acting as an assistant.";

//- Helper Functions
//------------------------------------------------------------------------------
interface GetModelfileTemplate {
  model: string;
  temperature?: number;
  context?: number | null;
  contentSystem?: string;
}
/**
 * Get a modelfile with template values entered
 * @param {string} param0.model - base model
 * @param {string} param0.temperature
 * @param {string} param0.context
 * @param {string} param0.contentSystem - SYSTEM message content
 * @returns {string} - String template with filled entries
 */
const getModelFileTemplate = ({
  model,
  temperature = 7,
  context = null,
  contentSystem = modelfile_default_content,
}: GetModelfileTemplate): string => {
  return modelfile_template
    .replace("%MODEL%", model)
    .replace("%TEMPERATURE%", temperature.toString())
    .replace("%CONTEXT%", context ? context.toString() : "4096")
    .replace("%CONTENT-SYSTEM%", contentSystem);
};

interface CreateOrUpdateModelfile {
  model: string;
  name: string;
  content: string;
  method: "POST" | "PUT";
  uid?: string | null;
  stream?: boolean;
  path?: string; // Unused
  quantize?: string; // Unused
}
/**
 * Helper function to create/update a modelfile (both in Ollama and SQLite)
 * @see {@Link https://github.com/ollama/ollama/blob/main/docs/api.md#create-a-model|Ollama: Create A Model}
 * @param {string} param0.model - Base modelfile
 * @param {string} param0.name - Newly created derived model name (if applicable)
 * @param {string} param0.content - Modelfile contents as a string
 * @param {string} param0.method - POST = INSERT, PUT = UPDATE
 * @param {boolean} param0.stream - Stream results to frontend?
 * @param {string} param0.uid - Modelfile UID for update
 * @param {string} param0.path - Filesystem path (unused)
 * @param {string} param0.quantize - quantize a non-quantized model (unused)
 * @returns {object} - {status: <boolean>, stream: <ReadableStream|null>, row: <Last inserted/updated row>}
 */
const createOrUpdateModelfile = async ({
  model,
  name,
  content,
  method,
  stream = true,
  uid = null,
  path = "", // Unused
  quantize = "", // Unused
}: CreateOrUpdateModelfile): Promise<{
  status: boolean;
  error?: string;
  stream?: ReadableStream | null;
  row?: any;
}> => {
  try {
    if (method === "PUT" && uid) {
      // Delete model in Ollama first (They don't have a modify/update endpoint)
      const deleteRes = await fetch(
        `${process.env.OLLAMA_API_URL}/api/delete`,
        {
          method: "DELETE",
          body: JSON.stringify({
            model: name,
          }),
        },
      );

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        if (deleteRes.status !== 404) {
          // 404 errors are skipped, it is fine if the model has been deleted already (not critical)
          throw new Error(
            `Ollama API update (delete stage) failed: ${deleteRes.status} - ${JSON.stringify(errorData)}`,
          );
        }
      }
    }

    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: name,
        stream,
        modelfile: content,
      }),
    });

    console.debug("createOrUpdateModelfile()", {
      method,
      model,
      name,
      uid,
      response,
      modelfile: content,
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Ollama API returned ${response.status}: ${JSON.stringify(errorData)}`,
      );
    }

    const sqlMethod = method === "POST" ? "INSERT" : "UPDATE";
    let lastId: string | boolean = false;

    if (sqlMethod === "INSERT") {
      const _uid = slugid.nice();
      const dbRes = db
        .prepare(
          `INSERT INTO modelfiles (uid, baseModel, name, content) VALUES (?, ?, ?, ?)`,
        )
        .run(_uid, model, name, content);
      lastId = dbRes.lastInsertRowid.toString() || false;
    } else {
      db.prepare(
        `UPDATE modelfiles SET baseModel = ?, name = ?, content = ? WHERE uid = ?`,
      ).run(model, name, content, uid);
    }

    const where = lastId ? "id = ?" : "uid = ?";
    const row =
      db
        .prepare(`SELECT * FROM modelfiles WHERE ${where}`)
        .get(lastId ? lastId : uid) || {};

    return { status: true, stream: stream ? response.body : null, row };
  } catch (error: any) {
    console.error("Error creating/updating modelfile:", error);
    return { status: false, error: error.message };
  }
};

/**
 * Delete a specific model file
 * @param {string} uid - Delete a modelfile by it's modelfile.uid
 * @returns {object} - {status: <integer>, message|error: <string>}
 */
const deleteModelfile = async (uid: string) => {
  try {
    const dbRes: any = db
      .prepare("SELECT name FROM modelfiles WHERE uid=?")
      .run(uid);
    if (dbRes) {
      db.prepare("DELETE FROM modelfiles WHERE uid = ?").run(uid);

      const response = await fetch(`${process.env.OLLAMA_API_URL}/api/delete`, {
        method: "DELETE",
        body: JSON.stringify({
          model: dbRes.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Ollama API delete failed: ${response.status} - ${JSON.stringify(errorData)}`,
        );
      }
    }
    return { status: true, message: "Modelfile deleted" };
  } catch (error: any) {
    console.error("Error deleting modelfile:", error);
    return { status: false, error: error.message };
  }
};

/**
 * Handle streaming or JSON responses
 * @param {Response} res
 * @param {ReadableStream} stream - If applicable
 * @param {object} successData
 * @param {integer} statusCode - HTTP status
 */
const handleStreamOrJSONResponse = async (
  res: Response,
  stream: ReadableStream | null = null,
  successData: any, // Data to send in a regular JSON response if not streaming
  statusCode: number = 200, // Allows custom status codes
): Promise<void> => {
  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = new TextDecoder().decode(value);
        res.write(`data: ${chunk}\n\n`);
      }
    } finally {
      reader.releaseLock();
    }

    res.end();
  } else {
    res.status(statusCode).json(successData);
  }
};

//- Endpoints
//------------------------------------------------------------------------------

/**
 * Get the base models from Ollama
 * GET /modelfile/list
 */
router.get("/list", async (req, res) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { models: modelFiles } = await response.json();
    res.json(modelFiles);
  } catch (error) {
    console.error("Error listing modelfiles:", error);
    res.status(500).json({ error: "Failed to list modelfiles" });
  }
});

/**
 * Get custom models from SQL
 */
router.get("/list-custom", async (req, res) => {
  try {
    const dbRes =
      db
        .prepare("SELECT id, uid, baseModel, name FROM modelfiles LIMIT 100")
        .all() || {};

    res.json(dbRes);
  } catch (error) {
    console.error("Error listing custom modelfiles:", error);
    res.status(500).json({ error: "Failed to list custom modelfiles" });
  }
});

/**
 * Return a pre-filled modelfile template using params sent to this endpoint
 * GET /modelfile/template
 * @param {string} req.params.model - Base model
 * @param {number} req.body.temperature
 * @param {number} req.body.context
 * @param {number} req.body.contentSystem - Contents for the SYSTEM section of a modelfile
 */
router.post("/template/:model", async (req, res) => {
  const { model } = req.params;
  const { temperature, context, contentSystem } = req.body;
  res.status(200).json({
    template: getModelFileTemplate({
      model,
      temperature,
      context,
      contentSystem,
    }),
  });
});

/**
 * Get SQL and Ollama data for a specific model
 * GET /modelfile/:uid
 * @param {string} req.params.uid - UID or model name
 */
router.get("/:uid", async (req, res) => {
  const { uid: uidOrName } = req.params;
  try {
    const dbRes: any =
      db
        .prepare("SELECT * FROM modelfiles WHERE uid = ? OR name = ? LIMIT 1")
        .get(uidOrName, uidOrName) || {};
    console.log({ uidOrName, dbRes });
    const response: any = await fetch(
      `${process.env.OLLAMA_API_URL}/api/show`,
      {
        method: "POST",
        body: JSON.stringify({
          model: dbRes.name,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    res.json({ llm: response?.data || {}, row: dbRes });
  } catch (error) {
    console.error("Error getting modelfile details:", error);
    res.status(500).json({ error: "Failed to get modelfile details" });
  }
});

/**
 * CREATE a modelfile
 * POST /modelfile/:uid
 * @param {string} req.body.model - Base model
 * @param {string} req.body.name - Name of new Modelfile
 * @param {string} req.body.content - Modelfile contents as string
 * @param {string} req.body.stream - Stream LLM API response?
 * @returns {ReadableStream|object} - Stream of results, or result object
 */
router.post("/create", async (req, res): Promise<any> => {
  const { model, name, content, stream: _doStream = false } = req.body;

  const { status, error, stream } = await createOrUpdateModelfile({
    model,
    name,
    content: content,
    method: "POST",
    stream: _doStream,
  });

  if (!status) {
    return res.status(500).json({ error });
  }

  await handleStreamOrJSONResponse(
    res,
    stream as ReadableStream,
    { model, name, content },
    201,
  ); // 201 Created
});

/**
 * UPDATE a modelfile
 * PUT /modelfile/:uid
 * @see {@link router.post("/create")} for params
 */
router.put("/:uid", async (req, res): Promise<any> => {
  const { uid } = req.params;
  const { model, name, content, stream: _doStream = false } = req.body;
  const { status, error, stream } = await createOrUpdateModelfile({
    uid,
    model,
    name,
    content: content,
    method: "PUT",
    stream: _doStream,
  });

  if (!status) {
    return res.status(500).json({ error });
  }

  await handleStreamOrJSONResponse(res, stream as ReadableStream, {
    model,
    name,
    content,
  });
});

/**
 * DELETE /modelfile/:uid
 * @param {string} req.params.uid - UID of modelfile entry
 */
router.delete("/:uid", async (req, res): Promise<any> => {
  const { uid } = req.params;
  const { status, message, error } = await deleteModelfile(uid);
  res.status(status ? 200 : 500).json(status ? { uid, message } : { error });
});

/**
 * Copy a modelfile definition to a destination model.  This can be useful for
 * testing the differences between model responses using the same modelfile definition
 * POST /modelfile/copy-to/:uid/:model
 * @param {string} req.params.uid - UID of source modelfile
 * @param {string} req.params.model - Destination base model
 */
router.post("/copy-to/:uid/:model", async (req, res): Promise<any> => {
  const { uid, model } = req.params;
  try {
    const srcRow: any =
      db.prepare("SELECT * FROM modelfiles WHERE uid = ?").get(uid) || {};

    if (!srcRow) {
      return res.status(404).json({ error: "Source modelfile not found" });
    }

    const newUid = slugid.nice(); // Generate new UID for the copied model

    const { status, error } = await createOrUpdateModelfile({
      uid: newUid,
      model,
      name: srcRow.name,
      content: srcRow.content,
      method: "POST",
    });
    if (status)
      //await deleteModelfile(uid); // Delete old modelfile (only for a move operation)
      return res.status(201).json({
        uid: newUid,
        model,
        name: srcRow.name,
        content: srcRow.content,
      });

    res.status(500).json({ error });
  } catch (error) {
    console.error("Error copying modelfile:", error);
    res.status(500).json({ error: "Failed to copy modelfile" });
  }
});

export default router;
