"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { exportCsv, exportBiomarkerXlsx } from "@/lib/export";
import type { ExtractionOutput } from "@/lib/types";

interface BioExtractDownloadButtonsProps {
  output: ExtractionOutput;
  originalFileName: string;
}

export default function BioExtractDownloadButtons({
  output,
  originalFileName,
}: BioExtractDownloadButtonsProps) {
  const [xlsxLoading, setXlsxLoading] = useState(false);

  const suffix = output.stats.biomarkerName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 40);

  const handleCsv = () => {
    exportCsv(output.headersOut, output.rowsOut, originalFileName, suffix);
  };

  const handleXlsx = async () => {
    setXlsxLoading(true);
    try {
      await exportBiomarkerXlsx(
        output.headersOut,
        output.rowsOut,
        originalFileName,
        suffix,
        output.stats.biomarkerName
      );
    } finally {
      setXlsxLoading(false);
    }
  };

  const approxKb = Math.round(
    output.rowsOut.reduce(
      (sum, row) => sum + Object.values(row).reduce((s, v) => s + (v?.length ?? 0), 0),
      0
    ) / 1024
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {output.rowsOut.length.toLocaleString()} annotated rows ready to download.{" "}
        <span className="text-teal-600 dark:text-teal-400 font-medium">
          {output.stats.foundCount.toLocaleString()} rows
        </span>{" "}
        have extracted values. Approx size: ~{approxKb.toLocaleString()} KB.
      </p>
      <div className="flex flex-wrap gap-3">
        <button onClick={handleCsv} className="btn-primary cursor-pointer">
          <FileText className="h-4 w-4" />
          Download CSV
        </button>
        <button
          onClick={handleXlsx}
          disabled={xlsxLoading}
          className="btn-primary cursor-pointer"
        >
          {xlsxLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Download Excel
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Excel export: teal highlight on rows where a value was found.
        CSV uses UTF-8 BOM for correct Excel rendering.
      </p>
    </div>
  );
}
