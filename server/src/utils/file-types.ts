/**
 * Valid file types for upload, inline viewing, etc
 */
import { some, get } from "lodash";

//- Data definitions
//------------------------------------------------------------------------------
export const MAX_INLINE_FILE_SIZE = 500 * 1048576; // 500MB
export const MAX_UPLOAD_DOCS = 20 * 1048576; // Ex: pdf, xls, doc
export const MAX_UPLOAD_DATA = 100 * 1048576; // Ex: json, txt, csv

// Extensions that can be displayed inline, and their MIME type
export const inlineExtToMimeType: { [key: string]: string } = {
  txt: "text/plain",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
};

// MIME-types that are allowed to display inline
export const inlineValidMimeTypes: string[] = [
  "text/",
  "image/", // Some things may incorrectly pass like image/bmp, but the browser will fallback to download
  "audio/",
  "video/",
  "application/json",
];

// Restrict file uploads to these type definitions
// Used by both client and server
// WARNING: "extensions" should only be used for convenience on the client-only!
export const allowedUploadTypes = [
  {
    mimeTypes: [
      "text/plain",
      "text/csv",
      "text/html",
      "application/json",
      "application/jsonl",
      "application/xml",
    ],
    extensions: ["txt", "htm", "html", "csv", "json", "jsonl", "xml"],
    maxSizeBytes: MAX_UPLOAD_DATA,
  },
  {
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/svg+xml"],
    extensions: ["jpg", "jpeg", "png", "gif", "svg"],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  {
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"],
    maxSizeBytes: MAX_UPLOAD_DOCS,
  },
  {
    mimeTypes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    extensions: ["xls", "xlsx"],
    maxSizeBytes: MAX_UPLOAD_DOCS,
  },
  {
    mimeTypes: ["application/rtf"],
    extensions: ["rtf"],
    maxSizeBytes: MAX_UPLOAD_DOCS,
  },
  {
    mimeTypes: ["text/markdown"],
    extensions: ["md"],
    maxSizeBytes: MAX_UPLOAD_DOCS,
  },
];

//- Functions
//------------------------------------------------------------------------------
/**
 * Validate if a particular file can be displayed inline based on extension/mime type
 * For a given extension, return the MIME type or false if not in the list
 * @param {string} extension - File extension
 * @returns {string} - MIME type or false
 */
export const inlineTypesByExtension = (extension: string): string | boolean =>
  get(inlineExtToMimeType, [extension], "").toLowerCase() || false;

/**
 * Check if an extension or mime-type is valid for inline viewing
 * @param {object} fileInfo - File object with ext and type properties
 * @param {array} startsWithFilters - MIME types start with these entries
 * @returns
 */
export const inlineViewable = (
  fileInfo: Record<string, string>,
  startsWithFilters: string[] = inlineValidMimeTypes,
) => {
  if (fileInfo?.ext || fileInfo?.type) {
    return (
      // 1. Allow any matching extension in inlineExtToMimeType
      inlineTypesByExtension(fileInfo.ext) ||
      // 2. Allow any matching mime-type only
      some(startsWithFilters, (v) => get(fileInfo, "type", "").startsWith(v))
    );
  }
  return false;
};
