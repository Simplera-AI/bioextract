import Papa from "papaparse";

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

// Stub — full implementation in Phase 5
export async function exportBiomarkerXlsx(
  headersOut: string[],
  rowsOut: Record<string, string>[],
  originalFileName: string,
  suffix: string,
  biomarkerName: string
): Promise<void> {
  // Temporary: fall back to CSV export until Phase 5 implements this
  void biomarkerName;
  exportCsv(headersOut, rowsOut, originalFileName, suffix);
}
