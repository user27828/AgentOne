/**
 * Various file pre-processing functions for fine-tuning
 */
import fs from "fs-extra";
import { Parser } from "json2csv";
import mammoth from "mammoth"; // docx
import xlsx from "xlsx";
import PDFParser from "pdf-parse";
import { isArray, isObject, keys, get } from "lodash";

/**
 * Preprocess: text
 * @param {string} filePath
 * @returns
 */
export const preprocessText = (filePath: string): string => {
  let fileContent = "";
  try {
    fileContent = fs.readFileSync(filePath, "utf-8"); // Or specify encoding if needed
  } catch (error) {
    console.error("Error reading file:", error);
    return ""; // or throw; depends on desired error handling
  }

  // Lowercase
  let processedText = fileContent.toLowerCase();

  // Remove HTML tags (if present) - adjust regex as needed.
  processedText = processedText.replace(/<[^>]*>/g, "");

  // Handle special characters and punctuation - customize as needed.
  // Example: removing everything except letters, numbers, and spaces:
  processedText = processedText.replace(/[^a-z0-9\s]/g, "");

  // Normalize whitespace
  processedText = processedText.replace(/\s+/g, " ").trim();

  return processedText;
};

/**
 * Preprocess: JSON
 * @param {string} filePath - The JSON data to preprocess.
 * @returns {string} - The preprocessed text.
 * @throws {Error} If the input is not a valid JSON object or array.
 */
export const preprocessJSON = (filePath: string): string => {
  let jsonData: object | any[] | null = null;

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    jsonData = JSON.parse(fileContent); // Parse content after reading file
  } catch (error) {
    console.error("Error reading or parsing JSON file:", error);
    return ""; // Or throw an error depending on your needs
  }

  if (!jsonData || (!isObject(jsonData) && !isArray(jsonData))) {
    console.error("Invalid JSON data in file. Must be an object or array.");
    return ""; // Or throw an error
  }

  let processedText = "";
  const processItem = (item: any) => {
    switch (typeof item) {
      case "string":
        processedText += item + " ";
        break;
      case "number":
      case "boolean":
        processedText += item.toString() + " ";
        break;
      case "object":
        if (isArray(item)) item.forEach(processItem);
        else if (isObject(item))
          keys(item).forEach((key) => processItem(get(item, [key])));
        break;
    }
  };

  // Initial recursive call based on provided jsonData structure
  if (isArray(jsonData)) {
    jsonData.forEach(processItem); // For arrays, directly process each item
  } else {
    keys(jsonData).forEach((key) => {
      processItem(get(jsonData, [key])); // For objects, iterate through values only
    });
  }

  return processedText.trim(); // Remove trailing spaces before returning
};

/**
 * Preprocess: JSONL/triples
 * @param {string} filePath
 * @returns
 */
export const preprocessJSONL = (filePath: string): string => {
  let processedText = "";

  try {
    const data = fs.readFileSync(filePath, "utf-8").split("\n");

    data.forEach((line) => {
      if (line.trim() !== "") {
        // Skip empty lines
        try {
          const jsonObject = JSON.parse(line);

          const processItem = (item: any) => {
            // Nested function (same as in preprocessJSON)
            if (typeof item === "string") {
              processedText += item + " ";
            } else if (typeof item === "number" || typeof item === "boolean") {
              processedText += item.toString() + " ";
            } else if (isArray(item)) {
              item.forEach(processItem);
            } else if (isObject(item)) {
              keys(item).forEach((key) => processItem(get(item, [key])));
            }
          };

          processItem(jsonObject); // Process each JSON object
        } catch (error) {
          console.error("Error parsing JSONL line:", error, { line });
          // You might want to skip lines that cause parsing errors or throw an error.
        }
      }
    });
  } catch (error) {
    console.error("Error reading or processing JSONL file:", error);
    return ""; // Or throw an error as needed
  }

  return processedText.trim();
};

/**
 * Preprocess: PDF
 * @param {string} filePath
 * @returns
 */
export const preprocessPDF = async (filePath: string): Promise<string> => {
  try {
    const pdfData = await PDFParser(fs.readFileSync(filePath));
    let processedText = pdfData.text.toLowerCase(); // Lowercase
    processedText = processedText.replace(/<[^>]*>/g, ""); // Remove HTML-like tags

    processedText = processedText.replace(/[^a-z0-9\s]/g, ""); // Special characters/Punctuation
    processedText = processedText.replace(/\s+/g, " ").trim(); // Whitespace

    return processedText;
  } catch (error) {
    console.error("Error preprocessing PDF:", error);
    throw error; // Re-throw for handling in calling function
  }
};

/**
 * Preprocess: DOCX
 * @param {string} filePath
 * @returns
 */
export const preprocessDocx = async (filePath: string): Promise<string> => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    let processedText = result.value.toLowerCase(); // Lowercase
    processedText = processedText.replace(/[^a-z0-9\s]/g, ""); // Special characters, punctuation
    processedText = processedText.replace(/\s+/g, " ").trim(); // Whitespace
    return processedText;
  } catch (error) {
    console.error("Error preprocessing docx:", error);
    throw error;
  }
};

/**
 * Preprocess: CSV
 * @param {string} filePath
 * @returns
 */
export const preprocessCSV = async (filePath: string): Promise<string> => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = get(workbook, ["SheetNames", 0]);
    const worksheet = get(workbook, ["Sheets", sheetName]);
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    let processedText = "";
    jsonData.forEach((row: any) => {
      row.forEach((cell: any) => {
        // Process each cell individually
        if (typeof cell === "string") {
          let processedCell = cell.toLowerCase();
          processedCell = processedCell.replace(/[^a-z0-9\s]/g, ""); // Characters/Punctuation
          processedText += processedCell + " ";
        } else if (typeof cell === "number" || typeof cell === "boolean") {
          processedText += cell.toString() + " ";
        }
      });
    });
    return processedText.trim();
  } catch (error) {
    console.error("Error preprocessing CSV/XLSX:", error);
    throw error;
  }
};

/**
 * Preprocess: XLS
 * @param filePath
 * @returns
 */
export const preprocessXlsx = async (filePath: string): Promise<string> => {
  // Convert XLSX to JSON, then to CSV using json2csv.  It's much easier
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Get first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }); // returns json

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(jsonData);

    return csv;
  } catch (error) {
    console.error("Error preprocessing XLSX:", error);
    throw error;
  }
};

/**
 * Count files in a directory (sync - for simplicity)
 */
export const countFilesInDirectory = (directory: string): number => {
  try {
    const files = fs.readdirSync(directory);
    return files.length;
  } catch (error) {
    console.error("Error counting files:", error);
    return 0; // Return 0 if there's an error
  }
};
