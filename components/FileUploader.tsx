"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, AlertCircle, CheckCircle2, X } from "lucide-react";
import { parseFile, formatFileSize } from "@/lib/parse";
import type { ParsedFile, SheetData } from "@/lib/types";

interface FileUploaderProps {
  onFileParsed: (
    file: File,
    parsed: ParsedFile,
    getSheet: (name: string) => SheetData
  ) => void;
}

export default function FileUploader({ onFileParsed }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<ParsedFile | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileInfo(null);
      setIsLoading(true);
      try {
        const { parsed, getSheet } = await parseFile(file);
        setFileInfo(parsed);
        onFileParsed(file, parsed, getSheet);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file.");
      } finally {
        setIsLoading(false);
      }
    },
    [onFileParsed]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={[
          "relative flex flex-col items-center justify-center gap-4",
          "rounded-2xl border-2 cursor-pointer transition-all duration-300",
          "px-8 py-12 min-h-[200px]",
          isDragging
            ? "border-teal-400 bg-teal-50/70 dark:bg-teal-950/30 ring-4 ring-teal-400/20 shadow-[0_0_30px_rgba(20,184,166,0.2)]"
            : "border-gray-200 dark:border-slate-700/60 border-dashed bg-gray-50/40 dark:bg-slate-800/20 hover:border-teal-300/60 dark:hover:border-teal-600/50 hover:bg-teal-50/30 dark:hover:bg-teal-950/10 hover:shadow-[0_0_20px_rgba(20,184,166,0.1)]",
        ].join(" ")}
      >
        {/* Upload icon */}
        <div className={[
          "flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
          isDragging
            ? "bg-teal-100 dark:bg-teal-900/50"
            : "bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-900/30 dark:to-teal-800/20",
        ].join(" ")}>
          {isLoading ? (
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          ) : (
            <Upload className={[
              "h-7 w-7 transition-colors",
              isDragging ? "text-teal-500" : "text-teal-400 dark:text-teal-500",
            ].join(" ")} />
          )}
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {isLoading
              ? "Parsing file…"
              : isDragging
              ? "Release to upload"
              : "Drop file here, or click to browse"}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Supports .xlsx, .xls, .csv
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File card */}
      {fileInfo && !isLoading && (
        <motion.div
          initial={{ scale: 0.97, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="flex items-center gap-4 rounded-2xl border border-teal-200/60 dark:border-teal-800/40 bg-gradient-to-r from-teal-50/80 to-cyan-50/40 dark:from-teal-950/30 dark:to-cyan-950/20 px-4 py-3.5 shadow-sm"
        >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/50">
              <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                {fileInfo.fileName}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {fileInfo.format.toUpperCase()} &bull;{" "}
                {formatFileSize(fileInfo.fileSize)} &bull;{" "}
                {fileInfo.sheetNames.length === 1
                  ? "1 sheet"
                  : `${fileInfo.sheetNames.length} sheets`}
              </p>
            </div>

            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-500 dark:text-teal-400" />
        </motion.div>
      )}
    </div>
  );
}
