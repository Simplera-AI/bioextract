// ─── File & Sheet Types (same as ClinDetect) ───────────────────────────────

export type FileFormat = "csv" | "xlsx" | "xls";

export interface SheetData {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ParsedFile {
  format: FileFormat;
  sheetNames: string[];
  fileName: string;
  fileSize: number;
}

// ─── Biomarker Value Types ─────────────────────────────────────────────────

export type BiomarkerValueType =
  | "numeric"
  | "categorical"
  | "composite"
  | "range"
  | "comparison"
  | "pending"
  | "not_found";

// ─── Extraction Result (per cell) ─────────────────────────────────────────

export interface BiomarkerExtractionResult {
  value: string;
  valueType: BiomarkerValueType;
  evidence: string;
  matchedAlias: string;
  confidence: "high" | "medium" | "low";
  /** True when the value was produced by AI enrichment rather than rule-based extraction */
  aiEnriched?: boolean;
}

// ─── Row-level output ─────────────────────────────────────────────────────

export interface RowExtractionResult {
  value: string;
  evidence: string;
}

// ─── Dataset-level output ─────────────────────────────────────────────────

export interface ExtractionOutput {
  headersOut: string[];
  rowsOut: Record<string, string>[];
  stats: ExtractionStats;
}

export interface ExtractionStats {
  totalRows: number;
  foundCount: number;
  notFoundCount: number;
  pendingCount: number;
  biomarkerName: string;
  column: string;
  durationMs: number;
  /** Number of rows where AI enrichment was used (only non-zero when NEXT_PUBLIC_AI_ENRICHMENT=true) */
  aiEnrichedCount?: number;
}

// ─── UI State ─────────────────────────────────────────────────────────────

export type ExtractionStatus = "idle" | "running" | "done" | "error";

export interface ExtractionProgress {
  processed: number;
  total: number;
  percent: number;
}

// ─── App State (5-step state machine) ─────────────────────────────────────

export interface AppState {
  uploadedFile: File | null;
  parsedFile: ParsedFile | null;
  getSheet: ((name: string) => SheetData) | null;
  selectedSheet: string | null;
  sheetData: SheetData | null;
  selectedColumn: string | null;
  biomarkerQuery: string;
  extractionStatus: ExtractionStatus;
  progress: ExtractionProgress;
  output: ExtractionOutput | null;
  extractionError: string | null;
  activeStep: 1 | 2 | 3 | 4 | 5;
}
