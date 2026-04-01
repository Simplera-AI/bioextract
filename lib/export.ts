import Papa from "papaparse";
import { TNM_VALUE_COLS, TNM_EVIDENCE_COLS } from "./extractTNM";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
}

function buildFilename(originalName: string, suffix: string, ext: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  const ts = buildTimestamp();
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${base}_${safeSuffix}_${ts}.${ext}`;
}

// ─── CSV Export ───────────────────────────────────────────────────────────

export function exportCsv(
  headersOut: string[],
  rowsOut: Record<string, string>[],
  originalFileName: string,
  suffix: string
): void {
  const filename = buildFilename(originalFileName, suffix, "csv");
  const data = rowsOut.map((row) => {
    const ordered: Record<string, string> = {};
    for (const h of headersOut) ordered[h] = row[h] ?? "";
    return ordered;
  });
  const csv = Papa.unparse(data, { columns: headersOut });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ─── Cell style constants ─────────────────────────────────────────────────

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "1F4E79" } }, // dark navy
  alignment: { horizontal: "center" },
};

// Teal highlight for rows where a value was found
const VALUE_FOUND_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "CCFBF1" } }, // teal-100
  font: { bold: true, color: { rgb: "0F766E" } },             // teal-700
};

const EVIDENCE_FOUND_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "F0FDFA" } }, // teal-50
  font: { italic: true, color: { rgb: "115E59" } },           // teal-800
};

const ROW_FOUND_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "F0FDFA" } }, // teal-50 for other cells
};

// ─── Excel Export ─────────────────────────────────────────────────────────

/**
 * Export biomarker extraction results as Excel (.xlsx).
 *
 * Styling:
 * - Header row: dark navy background, white bold text
 * - Rows where value was found: teal-50 row background
 *   - Value column: teal-100 fill, bold teal text
 *   - Evidence column: teal-50 fill, italic teal text
 */
export async function exportBiomarkerXlsx(
  headersOut: string[],
  rowsOut: Record<string, string>[],
  originalFileName: string,
  suffix: string,
  biomarkerName: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = (await import("xlsx-js-style")) as any;
  const filename = buildFilename(originalFileName, suffix, "xlsx");

  // Detect TNM multi-field mode: biomarkerName is "TNM" (or a TNM alias) and
  // the output includes the standard TNM column set instead of a single Value/Evidence pair.
  const isTNMExport = TNM_VALUE_COLS.some((col) => headersOut.includes(col));

  // For standard exports: single value/evidence column pair.
  // For TNM exports:      four value columns + four evidence columns.
  const valueCol = isTNMExport ? "" : `${biomarkerName} Value`;
  const evidenceCol = isTNMExport ? "" : `${biomarkerName} Evidence`;
  const valueColIdx = isTNMExport ? -1 : headersOut.indexOf(valueCol);
  const evidenceColIdx = isTNMExport ? -1 : headersOut.indexOf(evidenceCol);

  // Index sets for TNM column styling (resolved once, reused per data row)
  const tnmValueIdxs = isTNMExport
    ? TNM_VALUE_COLS.map((col) => headersOut.indexOf(col)).filter((i) => i >= 0)
    : [];
  const tnmEvidenceIdxs = isTNMExport
    ? TNM_EVIDENCE_COLS.map((col) => headersOut.indexOf(col)).filter((i) => i >= 0)
    : [];

  // Build array of arrays
  const aoa: string[][] = [headersOut];
  for (const row of rowsOut) {
    aoa.push(headersOut.map((h) => row[h] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-column widths
  const colWidths = headersOut.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rowsOut.slice(0, 200).map((r) => (r[h] ?? "").length)
    );
    return { wch: Math.min(60, Math.max(10, maxLen)) };
  });
  ws["!cols"] = colWidths;

  // Style header row
  for (let c = 0; c < headersOut.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = HEADER_STYLE;
  }

  // Style data rows
  for (let r = 1; r <= rowsOut.length; r++) {
    const row = rowsOut[r - 1];

    // A row "has value" if any extracted field is non-empty
    const hasValue = isTNMExport
      ? TNM_VALUE_COLS.some((col) => !!(row[col]?.trim()))
      : (valueColIdx >= 0 && !!(row[valueCol]?.trim()));

    if (hasValue) {
      // Style all cells in this row with the base teal-50 background
      for (let c = 0; c < headersOut.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) {
          ws[ref] = { v: "", t: "s" };
        }
        if (isTNMExport) {
          const cellValue = String(aoa[r][c] ?? "").trim();
          if (tnmValueIdxs.includes(c) && cellValue) {
            ws[ref].s = VALUE_FOUND_STYLE;
          } else if (tnmEvidenceIdxs.includes(c) && cellValue) {
            ws[ref].s = EVIDENCE_FOUND_STYLE;
          } else {
            ws[ref].s = ROW_FOUND_STYLE;
          }
        } else {
          if (c === valueColIdx) {
            ws[ref].s = VALUE_FOUND_STYLE;
          } else if (c === evidenceColIdx) {
            ws[ref].s = EVIDENCE_FOUND_STYLE;
          } else {
            ws[ref].s = ROW_FOUND_STYLE;
          }
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BioExtract");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);
}
