"use client";

import { motion } from "framer-motion";
import type { ExtractionProgress } from "@/lib/types";

interface ExtractionProgressProps {
  progress: ExtractionProgress;
  biomarkerName: string;
}

export default function ExtractionProgress({
  progress,
  biomarkerName,
}: ExtractionProgressProps) {
  const { processed, total, percent } = progress;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Extracting <span className="text-teal-600 dark:text-teal-400">{biomarkerName}</span> values&hellip;
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            {processed.toLocaleString()} of {total.toLocaleString()} rows processed
          </p>
        </div>
        <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
          {percent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.15, ease: "linear" }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
        <div className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
        Processing entirely in your browser &mdash; no data sent to any server
      </div>
    </div>
  );
}
