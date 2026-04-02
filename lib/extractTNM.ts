/**
 * BioExtract — TNM Multi-Field Extraction
 *
 * Extracts T, N, M, and Stage Group as four independent fields from clinical text.
 * Unlike standard biomarker extraction (one value per query), TNM has structured
 * clinical semantics: each component is separately reportable and often appears
 * in different parts of the same report.
 *
 * Extraction strategy:
 *   Step 1 — Compact code: find "pT2N0M0" and decompose into T/N/M.
 *   Step 2 — Labeled fields: find "T: pT3a / N: pN1" style markup.
 *   Step 3 — Stage Group: independent full-text search.
 *   Step 4 — AI fill-in: if any field still null, call /api/ai-enrich-tnm.
 *
 * Alias matching: uses the TNM biomarker pattern's alias list plus additional
 * synonyms to gate extraction — returns null immediately if the text contains
 * no staging terminology at all (avoids wasted computation on irrelevant rows).
 */

import { normalizeForExtraction } from "./textNormalize";
import { extractSnippet } from "./evidence";
import type { TNMResult } from "./types";

// ─── TNM Query Detection ───────────────────────────────────────────────────

/**
 * Set of lowercased query strings that resolve to TNM staging extraction.
 * Must match the TNM pattern's aliases in biomarkerPatterns.ts.
 */
const TNM_QUERY_ALIASES = new Set([
  "tnm",
  "tnm stage",
  "tnm staging",
  "tnm classification",
  "pathologic staging",
  "pathological staging",
  "clinical staging",
  "stage group",
  "ajcc staging",
  "ajcc stage",
  "final staging",
  "overall staging",
]);

/**
 * Returns true if the user's biomarker query should route to TNM multi-field extraction.
 */
export function isTNMQuery(query: string): boolean {
  return TNM_QUERY_ALIASES.has(query.trim().toLowerCase());
}

// ─── Extraction Regexes ────────────────────────────────────────────────────

/**
 * Compact TNM code: pT2N0M0, cT3N1M0, ypT1N0M0, T2N0M0, etc.
 * Capture groups: 1=T-component, 2=N-component, 3=M-component
 *
 * Prefixes:
 *   [ycra]   = y (post-treatment), c (clinical), r (recurrence), a (autopsy)
 *   yp / rp  = compound prefix (post-treatment pathologic, recurrence pathologic)
 *   p        = pathologic
 * Suffixes for T: is (in situ), mi (microinvasion), a-d (sub-classifications)
 * Suffixes for N: a-c, mi (micrometastasis), i+/i-/mol+/mol- (sentinel node)
 * Suffixes for M: a-d (organ-specific sub-categories, e.g. M1a lung, M1b bone)
 */
const COMPACT_TNM_RE =
  /\b([ycra]?(?:yp|rp)?p?[cC]?[tT][0-4x][a-d]?(?:is|mi)?)\s*([ycra]?p?[nN][0-3x][a-c]?(?:mi)?)\s*([ycra]?p?[mM][01x][a-d]?)\b/i;

/**
 * T-category labeled field.
 * Handles a wide range of real-world clinical report formats:
 *   "T: pT3a"               — simple colon
 *   "T – pT2b"              — en-dash
 *   "(T):    T1a"           — parenthesised label (AJCC report format)
 *   "Primary Tumor (T): T2" — full AJCC label
 *   "T category: T2a"       — qualifier word before colon
 *   "T stage: T3a"          — qualifier word before colon
 *   "T classification: T1"  — qualifier word before colon
 *
 * Pattern: optional `(T)` parenthesised form OR bare `T` (not preceded by a letter)
 * optionally followed by ONE qualifier word (category, stage, value, etc.) then a
 * colon/dash separator.
 */
const LABELED_T_RE =
  /(?:\(T\)\s*:|(?<![a-zA-Z])T(?:\s+\w+)?\s*[-:–])\s*([ycra]?(?:yp|rp)?p?[cC]?[tT][0-4x][a-d]?(?:is|mi)?)\b/i;

/**
 * N-category labeled field.
 * Handles: "N: N1b", "N – pN2", "(N): N1", "N category: N2a", "N stage: N0"
 */
const LABELED_N_RE =
  /(?:\(N\)\s*:|(?<![a-zA-Z])N(?:\s+\w+)?\s*[-:–])\s*([ycra]?p?[nN][0-3x][a-c]?(?:mi)?)\b/i;

/**
 * M-category labeled field.
 * Handles: "M: M0", "M – cM1a", "(M): M0", "M category: M1a", "M stage: M0"
 */
const LABELED_M_RE =
  /(?:\(M\)\s*:|(?<![a-zA-Z])M(?:\s+\w+)?\s*[-:–])\s*([ycra]?p?[mM][01x][a-d]?)\b/i;

/**
 * Stage Group: "AJCC Stage IIB", "Stage IIIA", "Overall stage: II", "stage group 2A"
 * Handles Roman numeral (I–IV) and digit (1–4) forms, with optional A/B/C suffix.
 */
const STAGE_GROUP_RE =
  /\b(?:ajcc\s+)?(?:overall\s+|final\s+|pathologic(?:al)?\s+|clinical\s+)?(?:stage\s*group\s*[:\-]?\s*|stage\s*[:\-]?\s*)([ivIV]{1,4}[abcABC]?|\d[abcABC]?)\b/i;

// ─── Presence Gate ─────────────────────────────────────────────────────────

/**
 * Quick gate: does the normalized text contain ANY staging terminology?
 * Avoids running the full TNM extraction pipeline on unrelated cell text.
 */
const STAGING_GATE_RE =
  /\b(?:staging|stage|tnm|patholog\w*|clinical\s+stage|[ycra]?(?:yp|rp)?p?[cC]?[tT][0-4x])\b/i;

// ─── Normalise captured component to canonical form ────────────────────────

function canonicalTNM(raw: string): string {
  // Preserve original case for T/N/M letters, trim whitespace
  return raw.trim().replace(/\s+/g, "");
}

// ─── Main Extraction Function ──────────────────────────────────────────────

/**
 * Extract T, N, M, and Stage Group from a single clinical text cell.
 *
 * @param rawText  - Original cell text (NOT pre-normalized)
 * @returns TNMResult with per-field values and evidence, or null if no staging found
 */
export function extractTNMFields(rawText: string): TNMResult | null {
  if (!rawText?.trim()) return null;

  // Gate: skip texts with no staging terminology at all
  if (!STAGING_GATE_RE.test(rawText)) return null;

  const normalized = normalizeForExtraction(rawText);

  let T: string | null = null;
  let N: string | null = null;
  let M: string | null = null;
  let stageGroup: string | null = null;
  let evidenceT = "";
  let evidenceN = "";
  let evidenceM = "";
  let evidenceStageGroup = "";

  // ── Step 1: Compact TNM code ────────────────────────────────────────────
  // Try normalized text first (lowercase), then original for evidence offset
  const compactMatch = COMPACT_TNM_RE.exec(normalized);
  if (compactMatch) {
    T = canonicalTNM(compactMatch[1]).toUpperCase();
    N = canonicalTNM(compactMatch[2]).toUpperCase();
    M = canonicalTNM(compactMatch[3]).toUpperCase();
    const snippet = extractSnippet(rawText, compactMatch.index, compactMatch[0].length);
    evidenceT = snippet;
    evidenceN = snippet;
    evidenceM = snippet;
  }

  // ── Step 2: Labeled field fallback ─────────────────────────────────────
  // Only fills components still null after compact code search.
  if (!T) {
    const m = LABELED_T_RE.exec(normalized);
    if (m) {
      T = canonicalTNM(m[1]).toUpperCase();
      evidenceT = extractSnippet(rawText, m.index, m[0].length);
    }
  }

  if (!N) {
    const m = LABELED_N_RE.exec(normalized);
    if (m) {
      N = canonicalTNM(m[1]).toUpperCase();
      evidenceN = extractSnippet(rawText, m.index, m[0].length);
    }
  }

  if (!M) {
    const m = LABELED_M_RE.exec(normalized);
    if (m) {
      M = canonicalTNM(m[1]).toUpperCase();
      evidenceM = extractSnippet(rawText, m.index, m[0].length);
    }
  }

  // ── Step 3: Stage Group (always searched independently) ────────────────
  const sgMatch = STAGE_GROUP_RE.exec(rawText);
  if (sgMatch) {
    // Normalise: "IIB" → "Stage IIB", "2a" → "Stage 2A"
    const raw = sgMatch[1].trim().toUpperCase();
    stageGroup = `Stage ${raw}`;
    evidenceStageGroup = extractSnippet(rawText, sgMatch.index, sgMatch[0].length);
  }

  // ── Null guard: nothing found at all ───────────────────────────────────
  if (!T && !N && !M && !stageGroup) return null;

  // ── Confidence: high if compact code or labeled fields; medium otherwise
  const confidence: TNMResult["confidence"] =
    compactMatch ? "high" :
    (T || N || M) ? "medium" : "low";

  return { T, N, M, stageGroup, evidenceT, evidenceN, evidenceM, evidenceStageGroup, confidence };
}

// ─── AI Enrichment ────────────────────────────────────────────────────────

export interface TNMAIResult {
  T?: string | null;
  N?: string | null;
  M?: string | null;
  stage_group?: string | null;
  confidence?: string;
}

/**
 * Call /api/ai-enrich-tnm to fill in any null TNM fields via Claude.
 * Only fires when NEXT_PUBLIC_AI_ENRICHMENT=true.
 * Returns null on timeout, error, or disabled.
 */
export async function enrichTNMWithAI(
  rawText: string,
  partial: TNMResult
): Promise<TNMResult | null> {
  if (process.env.NEXT_PUBLIC_AI_ENRICHMENT !== "true") return null;
  // Only call AI if at least one field is missing
  if (partial.T && partial.N && partial.M && partial.stageGroup) return null;

  try {
    const response = await fetch("/api/ai-enrich-tnm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextText: rawText.slice(0, 1200) }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TNMAIResult & { error?: string };
    if (data.error) return null;

    // Fill only the null fields from AI response
    const filled: TNMResult = { ...partial, aiEnriched: true };

    if (!filled.T && data.T && data.T.toLowerCase() !== "null" && data.T.toLowerCase() !== "not found") {
      filled.T = data.T.toUpperCase();
      filled.evidenceT = "AI-extracted";
    }
    if (!filled.N && data.N && data.N.toLowerCase() !== "null" && data.N.toLowerCase() !== "not found") {
      filled.N = data.N.toUpperCase();
      filled.evidenceN = "AI-extracted";
    }
    if (!filled.M && data.M && data.M.toLowerCase() !== "null" && data.M.toLowerCase() !== "not found") {
      filled.M = data.M.toUpperCase();
      filled.evidenceM = "AI-extracted";
    }
    if (!filled.stageGroup && data.stage_group && data.stage_group.toLowerCase() !== "null" && data.stage_group.toLowerCase() !== "not found") {
      filled.stageGroup = data.stage_group;
      filled.evidenceStageGroup = "AI-extracted";
    }

    // If AI filled nothing new, return null (no enrichment happened)
    const anyFilled = (filled.T !== partial.T) || (filled.N !== partial.N) ||
                      (filled.M !== partial.M) || (filled.stageGroup !== partial.stageGroup);
    return anyFilled ? filled : null;
  } catch {
    return null;
  }
}

// ─── Column helpers (used by export and extraction pipeline) ────────────────

export const TNM_VALUE_COLS = [
  "TNM T Value",
  "TNM N Value",
  "TNM M Value",
  "TNM Stage Group Value",
] as const;

export const TNM_EVIDENCE_COLS = [
  "TNM T Evidence",
  "TNM N Evidence",
  "TNM M Evidence",
  "TNM Stage Group Evidence",
] as const;

export const TNM_CONFIDENCE_COL = "TNM Confidence" as const;

export const TNM_ALL_COLS = [
  "TNM T Value",       "TNM T Evidence",
  "TNM N Value",       "TNM N Evidence",
  "TNM M Value",       "TNM M Evidence",
  "TNM Stage Group Value", "TNM Stage Group Evidence",
  "TNM Confidence",
] as const;

/**
 * Convert a TNMResult into a flat key→value map for row output.
 */
export function tnmResultToRow(result: TNMResult | null): Record<string, string> {
  if (!result) {
    return {
      "TNM T Value": "", "TNM T Evidence": "",
      "TNM N Value": "", "TNM N Evidence": "",
      "TNM M Value": "", "TNM M Evidence": "",
      "TNM Stage Group Value": "", "TNM Stage Group Evidence": "",
      "TNM Confidence": "",
    };
  }
  const confidenceLabel = result.aiEnriched ? "ai-enriched" : (result.confidence ?? "");
  return {
    "TNM T Value":              result.T           ?? "",
    "TNM T Evidence":           result.evidenceT   ?? "",
    "TNM N Value":              result.N           ?? "",
    "TNM N Evidence":           result.evidenceN   ?? "",
    "TNM M Value":              result.M           ?? "",
    "TNM M Evidence":           result.evidenceM   ?? "",
    "TNM Stage Group Value":    result.stageGroup  ?? "",
    "TNM Stage Group Evidence": result.evidenceStageGroup ?? "",
    "TNM Confidence":           confidenceLabel,
  };
}
