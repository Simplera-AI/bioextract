"use client";

import { CheckCircle2, FileSearch, TrendingUp } from "lucide-react";
import type { ExtractionOutput } from "@/lib/types";

interface ResultsPreviewProps {
  output: ExtractionOutput;
}

export default function ResultsPreview({ output }: ResultsPreviewProps) {
  const { stats, headersOut, rowsOut } = output;
  const valueCol = `${stats.biomarkerName} Value`;
  const evidenceCol = `${stats.biomarkerName} Evidence`;

  const foundRate = stats.totalRows > 0
    ? Math.round((stats.foundCount / stats.totalRows) * 100)
    : 0;

  // Show up to 50 rows in the preview, prioritize found rows first
  const foundRows = rowsOut.filter((r) => r[valueCol]);
  const emptyRows = rowsOut.filter((r) => !r[valueCol]);
  const previewRows = [...foundRows, ...emptyRows].slice(0, 50);

  // Columns to show: just the source column + 2 new columns (keep preview concise)
  const sourceCol = stats.column;
  const previewCols = [sourceCol, valueCol, evidenceCol];

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<FileSearch className="h-4 w-4" />}
          label="Total rows"
          value={stats.totalRows.toLocaleString()}
          color="gray"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Values found"
          value={stats.foundCount.toLocaleString()}
          color="teal"
        />
        {stats.pendingCount > 0 && (
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Pending"
            value={stats.pendingCount.toLocaleString()}
            color="amber"
          />
        )}
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Extraction rate"
          value={`${foundRate}%`}
          color="teal"
        />
      </div>

      {/* Preview table */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1F4E79]">
                {previewCols.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-white whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {previewRows.map((row, i) => {
                const hasValue = !!row[valueCol];
                return (
                  <tr
                    key={i}
                    className={
                      hasValue
                        ? "bg-teal-50/40 dark:bg-teal-950/10"
                        : "bg-white dark:bg-slate-900/50"
                    }
                  >
                    {previewCols.map((col) => (
                      <td
                        key={col}
                        className={[
                          "px-4 py-2 text-xs max-w-xs",
                          col === valueCol && hasValue
                            ? "font-semibold text-teal-700 dark:text-teal-300"
                            : col === evidenceCol && hasValue
                            ? "text-gray-600 dark:text-gray-400 italic"
                            : "text-gray-500 dark:text-slate-500",
                        ].join(" ")}
                      >
                        <div className="truncate max-w-[280px]" title={row[col] ?? ""}>
                          {row[col] || (
                            <span className="text-gray-300 dark:text-slate-600">&mdash;</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rowsOut.length > 50 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Showing 50 of {rowsOut.length.toLocaleString()} rows. Download to see all.
            </p>
          </div>
        )}
      </div>

      {stats.durationMs > 0 && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-right">
          Extraction completed in {(stats.durationMs / 1000).toFixed(2)}s &mdash;{" "}
          {Math.round(stats.totalRows / Math.max(stats.durationMs / 1000, 0.001)).toLocaleString()} rows/sec
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "teal" | "gray" | "amber";
}) {
  const colorClass = {
    teal: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30",
    gray: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/50",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
  }[color];

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-slate-700/60 p-3 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
