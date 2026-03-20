import Papa from "papaparse";
import type { ParsedFile, SheetData } from "./types";

// Store the last workbook so SheetSelector can re-extract rows without re-reading the file
let _lastWorkbook: unknown = null;

export function getLastWorkbook(): unknown {
  return _lastWorkbook;
}

/** Normalize a cell value to a string */
function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toLocaleDateString();
  return String(val).trim();
}

/** Normalize column header: trim, replace blank with Column_N */
function normalizeHeader(h: unknown, idx: number): string {
  const s = cellToString(h).trim();
  return s || `Column_${idx + 1}`;
}

/**
 * Extract rows from a SheetJS worksheet.
 * Uses header:1 (array mode) to avoid duplicate-column overwrite bug.
 */
export function extractSheetRows(workbook: unknown, sheetName: string): SheetData {
  // Dynamic import of xlsx only in this function (client-side only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = workbook as any;
  const ws = wb.Sheets[sheetName];
  if (!ws) return { headers: [], rows: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: unknown[][] = (globalThis as any).XLSX
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (globalThis as any).XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })
    : [];

  if (raw.length === 0) return { headers: [], rows: [] };

  const headerRow = raw[0];
  const headers = headerRow.map((h, i) => normalizeHeader(h, i));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const rawRow = raw[i];
    // Skip completely empty rows
    if (!rawRow || rawRow.every((v) => v === "" || v === null || v === undefined)) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cellToString((rawRow as unknown[])[j]);
    }
    rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Parse an uploaded file (CSV, XLSX, or XLS).
 * Returns ParsedFile metadata + a getSheet function for extracting sheet data.
 */
export async function parseFile(
  file: File
): Promise<{ parsed: ParsedFile; getSheet: (name: string) => SheetData }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    return parseCsvFile(file);
  } else if (ext === "xlsx" || ext === "xls") {
    return parseExcelFile(file, ext as "xlsx" | "xls");
  } else {
    throw new Error(
      `Unsupported file type ".${ext}". Please upload a .csv, .xlsx, or .xls file.`
    );
  }
}

async function parseCsvFile(
  file: File
): Promise<{ parsed: ParsedFile; getSheet: (name: string) => SheetData }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete(results) {
        const headers = (results.meta.fields ?? []).map((h, i) =>
          normalizeHeader(h, i)
        );
        const rows = (results.data as Record<string, unknown>[]).map((r) => {
          const obj: Record<string, string> = {};
          for (const h of headers) {
            obj[h] = cellToString(r[h]);
          }
          return obj;
        });

        const sheetData: SheetData = { headers, rows };

        resolve({
          parsed: {
            format: "csv",
            sheetNames: ["Sheet1"],
            fileName: file.name,
            fileSize: file.size,
          },
          getSheet: () => sheetData,
        });
      },
      error(err) {
        reject(new Error(`CSV parse error: ${err.message}`));
      },
    });
  });
}

async function parseExcelFile(
  file: File,
  format: "xlsx" | "xls"
): Promise<{ parsed: ParsedFile; getSheet: (name: string) => SheetData }> {
  // Dynamically import xlsx to ensure it's client-side only
  const XLSX = await import("xlsx");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        _lastWorkbook = wb;

        // Make XLSX available for extractSheetRows (used after dynamic import)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).XLSX = XLSX;

        const sheetNames = wb.SheetNames;
        if (sheetNames.length === 0) {
          reject(new Error("The Excel file contains no sheets."));
          return;
        }

        const getSheet = (name: string): SheetData => {
          const ws = wb.Sheets[name];
          if (!ws) return { headers: [], rows: [] };

          const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: "",
          });

          if (raw.length === 0) return { headers: [], rows: [] };

          const headerRow = raw[0] as unknown[];
          const headers = headerRow.map((h, i) => normalizeHeader(h, i));

          const rows: Record<string, string>[] = [];
          for (let i = 1; i < raw.length; i++) {
            const rawRow = raw[i] as unknown[];
            if (!rawRow || rawRow.every((v) => v === "" || v === null || v === undefined))
              continue;
            const obj: Record<string, string> = {};
            for (let j = 0; j < headers.length; j++) {
              obj[headers[j]] = cellToString(rawRow[j]);
            }
            rows.push(obj);
          }

          return { headers, rows };
        };

        resolve({
          parsed: {
            format,
            sheetNames,
            fileName: file.name,
            fileSize: file.size,
          },
          getSheet,
        });
      } catch (err) {
        reject(
          new Error(
            `Failed to parse Excel file: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
