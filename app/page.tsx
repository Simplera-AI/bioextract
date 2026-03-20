"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Table2, Search, Zap, Download,
  ChevronRight, RotateCcw, Moon, Sun, Microscope,
} from "lucide-react";

import FileUploader from "@/components/FileUploader";
import SheetSelector from "@/components/SheetSelector";
import ColumnSingleSelect from "@/components/ColumnSingleSelect";
import BiomarkerInput from "@/components/BiomarkerInput";
import ExtractionProgress from "@/components/ExtractionProgress";
import ResultsPreview from "@/components/ResultsPreview";
import BioExtractDownloadButtons from "@/components/BioExtractDownloadButtons";

import { runBiomarkerExtraction } from "@/lib/extractBiomarker";
import type {
  AppState,
  ParsedFile,
  SheetData,
  ExtractionOutput,
} from "@/lib/types";

// ─── Step definitions ─────────────────────────────────────────────────────

const STEPS = [
  { id: 1, icon: Upload,   label: "Upload"    },
  { id: 2, icon: Table2,   label: "Sheet"     },
  { id: 3, icon: Search,   label: "Configure" },
  { id: 4, icon: Zap,      label: "Extract"   },
  { id: 5, icon: Download, label: "Results"   },
] as const;

// ─── Initial state ────────────────────────────────────────────────────────

const INITIAL_STATE: AppState = {
  uploadedFile: null,
  parsedFile: null,
  getSheet: null,
  selectedSheet: null,
  sheetData: null,
  selectedColumn: null,
  biomarkerQuery: "",
  extractionStatus: "idle",
  progress: { processed: 0, total: 0, percent: 0 },
  output: null,
  extractionError: null,
  activeStep: 1,
};

// ─── Dark mode toggle ─────────────────────────────────────────────────────

function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }, [dark]);

  return { dark, toggle };
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const { dark, toggle: toggleDark } = useDarkMode();

  // ── Step 1: File uploaded ─────────────────────────────────────────────
  const handleFileParsed = useCallback(
    (file: File, parsed: ParsedFile, getSheet: (name: string) => SheetData) => {
      const firstSheet = parsed.sheetNames[0];
      const sheetData = getSheet(firstSheet);
      setState({
        ...INITIAL_STATE,
        uploadedFile: file,
        parsedFile: parsed,
        getSheet,
        selectedSheet: firstSheet,
        sheetData,
        // Skip step 2 for CSV (single sheet) or single-sheet Excel
        activeStep: parsed.sheetNames.length > 1 ? 2 : 3,
      });
    },
    []
  );

  // ── Step 2: Sheet selected ────────────────────────────────────────────
  const handleSheetSelect = useCallback(
    (name: string) => {
      if (!state.getSheet) return;
      const sheetData = state.getSheet(name);
      setState((s) => ({
        ...s,
        selectedSheet: name,
        sheetData,
        selectedColumn: null,
        activeStep: 3,
      }));
    },
    [state.getSheet]
  );

  // ── Step 3: Column + biomarker configured ─────────────────────────────
  const handleColumnSelect = useCallback((col: string) => {
    setState((s) => ({ ...s, selectedColumn: col }));
  }, []);

  const handleBiomarkerChange = useCallback((val: string) => {
    setState((s) => ({ ...s, biomarkerQuery: val }));
  }, []);

  // ── Step 4: Run extraction ────────────────────────────────────────────
  const handleRunExtraction = useCallback(() => {
    const { sheetData, selectedColumn, biomarkerQuery } = state;
    if (!sheetData || !selectedColumn || !biomarkerQuery.trim()) return;

    const rows = sheetData.rows;
    const total = rows.length;

    setState((s) => ({
      ...s,
      extractionStatus: "running",
      activeStep: 4,
      progress: { processed: 0, total, percent: 0 },
      extractionError: null,
    }));

    // Use setTimeout to allow React to re-render the progress UI before extraction starts
    setTimeout(() => {
      try {
        const output: ExtractionOutput = runBiomarkerExtraction(
          rows,
          sheetData.headers,
          selectedColumn,
          biomarkerQuery.trim(),
          (processed) => {
            const percent = Math.round((processed / total) * 100);
            setState((s) => ({
              ...s,
              progress: { processed, total, percent },
            }));
          }
        );

        setState((s) => ({
          ...s,
          extractionStatus: "done",
          output,
          activeStep: 5,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          extractionStatus: "error",
          extractionError: err instanceof Error ? err.message : "Extraction failed.",
        }));
      }
    }, 50);
  }, [state]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const {
    activeStep,
    parsedFile,
    sheetData,
    selectedColumn,
    biomarkerQuery,
    progress,
    output,
    extractionStatus,
    extractionError,
  } = state;

  const canRun = !!selectedColumn && biomarkerQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-cyan-50/10 dark:from-slate-950 dark:via-teal-950/10 dark:to-slate-900">

      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-teal-400/10 dark:bg-teal-500/5 blur-3xl" />
        <div className="absolute top-1/2 -right-24 h-80 w-80 rounded-full bg-cyan-400/10 dark:bg-cyan-500/5 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-teal-300/10 dark:bg-teal-600/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-gray-200/60 dark:border-slate-700/40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-[0_4px_14px_rgba(20,184,166,0.4)]">
              <Microscope className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-50 leading-tight">
                BioExtract
              </h1>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-tight">
                Clinical Biomarker Extraction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeStep > 1 && (
              <button
                onClick={handleReset}
                className="btn-secondary gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Analysis
              </button>
            )}
            <button
              onClick={toggleDark}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-5xl px-6 py-10">

        {/* Step indicator */}
        <StepIndicator activeStep={activeStep} />

        {/* Step content */}
        <div className="mt-8 workspace-card">
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <StepWrapper key="step1">
                <StepHeader
                  icon={<Upload className="h-5 w-5" />}
                  title="Upload your clinical data file"
                  description="Drag and drop or click to browse. Supports .xlsx, .xls, and .csv files exported from any EMR system."
                />
                <FileUploader onFileParsed={handleFileParsed} />
              </StepWrapper>
            )}

            {activeStep === 2 && parsedFile && (
              <StepWrapper key="step2">
                <StepHeader
                  icon={<Table2 className="h-5 w-5" />}
                  title="Select sheet"
                  description={`${parsedFile.fileName} — ${parsedFile.sheetNames.length} sheets found`}
                />
                <SheetSelector
                  sheetNames={parsedFile.sheetNames}
                  selectedSheet={state.selectedSheet}
                  onSheetSelect={handleSheetSelect}
                />
              </StepWrapper>
            )}

            {activeStep === 3 && sheetData && (
              <StepWrapper key="step3">
                <StepHeader
                  icon={<Search className="h-5 w-5" />}
                  title="Configure extraction"
                  description={`${sheetData.rows.length.toLocaleString()} rows · ${sheetData.headers.length} columns`}
                />
                <div className="space-y-6">
                  <ColumnSingleSelect
                    headers={sheetData.headers}
                    selectedColumn={selectedColumn}
                    onColumnSelect={handleColumnSelect}
                  />
                  <BiomarkerInput
                    value={biomarkerQuery}
                    onChange={handleBiomarkerChange}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      {canRun
                        ? `Ready to extract "${biomarkerQuery}" from "${selectedColumn}"`
                        : "Select a column and enter a biomarker to continue"}
                    </p>
                    <button
                      onClick={handleRunExtraction}
                      disabled={!canRun}
                      className="btn-primary"
                    >
                      <Zap className="h-4 w-4" />
                      Extract
                      <ChevronRight className="h-4 w-4 -ml-1" />
                    </button>
                  </div>
                </div>
              </StepWrapper>
            )}

            {activeStep === 4 && (
              <StepWrapper key="step4">
                <StepHeader
                  icon={<Zap className="h-5 w-5" />}
                  title="Extracting biomarker values"
                  description="Processing entirely in your browser — no data leaves your device"
                />
                {extractionStatus === "error" ? (
                  <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 p-4">
                    <p className="text-sm text-red-700 dark:text-red-400">{extractionError}</p>
                    <button
                      onClick={() => setState((s) => ({ ...s, activeStep: 3, extractionStatus: "idle" }))}
                      className="mt-3 btn-secondary text-xs"
                    >
                      Go back
                    </button>
                  </div>
                ) : (
                  <ExtractionProgress
                    progress={progress}
                    biomarkerName={biomarkerQuery}
                  />
                )}
              </StepWrapper>
            )}

            {activeStep === 5 && output && (
              <StepWrapper key="step5">
                <StepHeader
                  icon={<Download className="h-5 w-5" />}
                  title="Extraction complete"
                  description={`Found "${output.stats.biomarkerName}" in ${output.stats.foundCount.toLocaleString()} of ${output.stats.totalRows.toLocaleString()} rows`}
                />
                <div className="space-y-6">
                  <ResultsPreview output={output} />
                  <div className="border-t border-gray-100 dark:border-slate-700 pt-5">
                    <BioExtractDownloadButtons
                      output={output}
                      originalFileName={state.parsedFile?.fileName ?? "results"}
                    />
                  </div>
                </div>
              </StepWrapper>
            )}
          </AnimatePresence>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-slate-600">
          BioExtract processes all data locally in your browser. No files are uploaded to any server.
          &nbsp;&middot;&nbsp; <span className="text-teal-500">Simplera AI</span>
        </p>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <nav className="flex items-center justify-center gap-1 sm:gap-2">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep;
        const isComplete = step.id < activeStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center gap-1 sm:gap-2">
            <div className={[
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300",
              isActive
                ? "bg-teal-500 text-white shadow-[0_2px_10px_rgba(20,184,166,0.5)]"
                : isComplete
                ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
                : "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500",
            ].join(" ")}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={[
                "h-px w-4 sm:w-6 transition-colors duration-300",
                step.id < activeStep
                  ? "bg-teal-300 dark:bg-teal-700"
                  : "bg-gray-200 dark:bg-slate-700",
              ].join(" ")} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-gray-100 dark:border-slate-700/60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
