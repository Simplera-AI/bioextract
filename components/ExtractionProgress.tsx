"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ExtractionProgress as ProgressState } from "@/lib/types";

interface ExtractionProgressProps {
  progress: ProgressState;
  biomarkerName: string;
}

export default function ExtractionProgress({
  progress,
  biomarkerName,
}: ExtractionProgressProps) {
  const { processed, total, percent, phase, aiProcessed, aiTotal } = progress;

  // Elapsed time counter — ticks every second while extraction is running
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []); // starts when component mounts (i.e. when extraction begins)

  const elapsedLabel =
    elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const isEnriching = phase === "enriching" && aiTotal > 0;

  return (
    <div className="space-y-5">

      {/* Top row: primary label + elapsed time */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {isEnriching ? (
              <>AI enriching <span className="text-teal-600 dark:text-teal-400">{biomarkerName}</span> values&hellip;</>
            ) : (
              <>Scanning <span className="text-teal-600 dark:text-teal-400">{biomarkerName}</span> values&hellip;</>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            {isEnriching
              ? `AI enriching ${aiProcessed.toLocaleString()} of ${aiTotal.toLocaleString()} rows`
              : `${processed.toLocaleString()} of ${total.toLocaleString()} rows scanned`}
          </p>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
            {percent}%
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
            {elapsedLabel}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
        <motion.div
          className={[
            "h-full rounded-full",
            isEnriching
              ? "bg-gradient-to-r from-violet-500 to-teal-400"
              : "bg-gradient-to-r from-teal-500 to-cyan-400",
          ].join(" ")}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.2, ease: "linear" }}
        />
      </div>

      {/* Phase label */}
      <div className="flex items-center gap-2">
        <span className={[
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          isEnriching
            ? "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400"
            : "bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400",
        ].join(" ")}>
          <span className={[
            "h-1.5 w-1.5 rounded-full animate-pulse",
            isEnriching ? "bg-violet-500" : "bg-teal-500",
          ].join(" ")} />
          {isEnriching ? "Phase 2 — AI enrichment" : "Phase 1 — Rule engine"}
        </span>
      </div>

    </div>
  );
}
