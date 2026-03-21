/**
 * BioExtract — Core Extraction Engine
 *
 * Extracts biomarker VALUES from clinical text using a rule-based regex pipeline.
 * No AI, no backend — 100% client-side TypeScript.
 *
 * Pipeline per text cell:
 *   Phase 0: Alias Resolution → find BiomarkerPattern for user query
 *   Phase 1: Mention Finding  → find all alias occurrences with word-boundary safety
 *   Phase 2: Pending Check    → detect "PSA pending" → value = "PENDING"
 *   Phase 3: Context Window   → extract chars around each mention
 *   Phase 4: Value Extraction → try ordered regex patterns, first match wins
 *   Phase 5: Tie-Breaking     → pick from multiple mentions per pattern's strategy
 *   Phase 6: Evidence         → extract full sentence containing the match
 */

import { normalizeForExtraction, findAllMentions } from "./textNormalize";
import { extractSnippet } from "./evidence";
import {
  getBiomarkerPattern,
  buildFallbackPattern,
  type BiomarkerPattern,
  type ValueCapturePattern,
} from "./biomarkerPatterns";
import type {
  BiomarkerExtractionResult,
  BiomarkerValueType,
  ExtractionOutput,
  ExtractionStats,
} from "./types";

// ─── Phase 0: Alias Resolution ──────────────────────────────────────────

/**
 * Resolve a user-typed query to a BiomarkerPattern.
 * Checks the pre-defined pattern library first; falls back to dynamic pattern.
 */
function resolvePattern(query: string): BiomarkerPattern {
  return getBiomarkerPattern(query) ?? buildFallbackPattern(query);
}

// ─── Phase 1: Mention Finding ─────────────────────────────────────────────

interface MentionHit {
  alias: string;
  offset: number;
  length: number;
}

/**
 * Find all alias mentions in normalized text.
 * Two passes:
 *   1. String alias matching (exact, word-boundary-safe) — fast path
 *   2. aliasRegexes matching — flex path for truncated or misspelled queries
 *      e.g. the aliasRegex for "prostat vol" matches "prostate volume" in text
 * Results are merged, sorted, and deduplicated.
 */
function findMentions(normalizedText: string, pattern: BiomarkerPattern): MentionHit[] {
  const hits: MentionHit[] = [];

  // Pass 1: exact string aliases (longest-first ordering in pattern library)
  for (const alias of pattern.aliases) {
    const found = findAllMentions(normalizedText, alias);
    for (const f of found) {
      hits.push({ alias, offset: f.offset, length: alias.length });
    }
  }

  // Pass 2: flexible regex aliases (for fuzzy/fallback patterns)
  if (pattern.aliasRegexes) {
    for (const re of pattern.aliasRegexes) {
      re.lastIndex = 0; // reset stateful global regex before each use
      let m: RegExpExecArray | null;
      while ((m = re.exec(normalizedText)) !== null) {
        hits.push({ alias: m[0], offset: m.index, length: m[0].length });
      }
    }
  }

  // Sort by offset ascending, deduplicate overlapping hits (keep first/longer match)
  hits.sort((a, b) => a.offset - b.offset);
  const deduped: MentionHit[] = [];
  let lastEnd = -1;
  for (const hit of hits) {
    if (hit.offset >= lastEnd) {
      deduped.push(hit);
      lastEnd = hit.offset + hit.length;
    }
  }
  return deduped;
}

// ─── Phase 2: Pending Check ───────────────────────────────────────────────

/**
 * Check if the text around a mention indicates a pending/unavailable result.
 * Looks in a short window (80 chars after the mention).
 */
function isPending(normalizedText: string, hit: MentionHit, pendingPhrases: string[]): boolean {
  const window = normalizedText.slice(hit.offset, hit.offset + hit.length + 80);
  for (const phrase of pendingPhrases) {
    if (window.includes(phrase.toLowerCase())) return true;
  }
  return false;
}

// ─── Phase 3: Context Window ─────────────────────────────────────────────

/**
 * Extract a context window centered on the biomarker mention.
 * contextWindowChars is the TOTAL window size (half before, half after).
 */
function extractContextWindow(
  normalizedText: string,
  hit: MentionHit,
  contextWindowChars: number
): string {
  const half = Math.floor(contextWindowChars / 2);
  const start = Math.max(0, hit.offset - half);
  const end = Math.min(normalizedText.length, hit.offset + hit.length + half);
  return normalizedText.slice(start, end);
}

// ─── Phase 4: Value Extraction ────────────────────────────────────────────

interface CandidateResult {
  value: string;
  valueType: BiomarkerValueType;
  evidence: string;
  matchedAlias: string;
  confidence: "high" | "medium" | "low";
  numericValue: number | null;  // for tie-breaking
  offset: number;               // mention offset for tie-breaking
}

/**
 * Check if the context window contains an implicit clinical phrase.
 * Implicit values are checked AFTER regex valuePatterns (fallback only).
 * Longest phrase match wins (to handle "within normal limits" over "normal").
 */
function checkImplicitValues(
  contextWindow: string,
  implicitValues: Record<string, string>
): { value: string; valueType: BiomarkerValueType } | null {
  // Sort by phrase length descending so longer, more-specific phrases match first
  const phrases = Object.keys(implicitValues).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (contextWindow.includes(phrase.toLowerCase())) {
      return { value: implicitValues[phrase], valueType: "categorical" };
    }
  }
  return null;
}

/**
 * Try to extract a value from the context window using ordered patterns.
 * Tries regex valuePatterns FIRST. Falls back to implicitValues only when
 * no regex pattern matched — ensures "PSA 8.4 (elevated)" extracts "8.4",
 * not the implicit "> 4.0 ng/mL".
 */
function extractValueFromWindow(
  contextWindow: string,
  hit: MentionHit,
  valuePatterns: ValueCapturePattern[],
  _originalText: string,
  implicitValues?: Record<string, string>
): { value: string; valueType: BiomarkerValueType; confidence: "high" | "medium" | "low" } | null {
  for (const vp of valuePatterns) {
    const match = vp.pattern.exec(contextWindow);
    if (!match || !match[1]) continue;

    const rawValue = match[1].trim();
    if (!rawValue) continue;

    const value = vp.transform ? vp.transform(rawValue) : rawValue;

    // Determine confidence based on proximity of value to mention.
    // When the alias isn't found literally in the window (e.g. aliasRegex matched a
    // variant form), use the window centre as the reference point so distance is
    // never artificially 0 or inflated.
    const matchStart = match.index ?? 0;
    const aliasIndexInWindow = contextWindow.indexOf(hit.alias);
    const mentionRef = aliasIndexInWindow >= 0
      ? aliasIndexInWindow
      : Math.floor(contextWindow.length / 2);
    const distanceFromMention = Math.abs(matchStart - mentionRef);
    const confidence: "high" | "medium" | "low" =
      distanceFromMention <= 30 ? "high" :
      distanceFromMention <= 80 ? "medium" : "low";

    return { value, valueType: vp.valueType, confidence };
  }

  // Implicit value fallback — only fires when no regex pattern matched
  if (implicitValues) {
    const implicit = checkImplicitValues(contextWindow, implicitValues);
    if (implicit) return { ...implicit, confidence: "medium" };
  }

  return null;
}

/**
 * Parse a numeric value for tie-breaking. Returns null if not numeric.
 */
function parseNumericForTieBreaking(value: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(value);
  if (!m) return null;
  return parseFloat(m[1]);
}

// ─── Phase 5: Tie-Breaking ───────────────────────────────────────────────

// Keywords indicating a clinically significant mention (higher score = prefer this mention)
const CONTEXTUAL_KEYWORDS: Array<{ phrase: string; score: number }> = [
  { phrase: "most recent",   score: 10 },
  { phrase: "most current",  score: 10 },
  { phrase: "latest",        score: 9  },
  { phrase: "current",       score: 8  },
  { phrase: "today",         score: 8  },
  { phrase: "post-treatment",score: 7  },
  { phrase: "post treatment",score: 7  },
  { phrase: "nadir",         score: 7  },
  { phrase: "peak",          score: 6  },
  { phrase: "highest",       score: 6  },
  { phrase: "initial",       score: 5  },
  { phrase: "baseline",      score: 5  },
  { phrase: "pre-treatment", score: 4  },
  { phrase: "pre treatment", score: 4  },
  { phrase: "at diagnosis",  score: 3  },
];

/**
 * Score a candidate by scanning 60 chars BEFORE the mention for contextual keywords.
 */
function contextualScore(normalizedText: string, candidate: CandidateResult): number {
  const windowStart = Math.max(0, candidate.offset - 60);
  const window = normalizedText.slice(windowStart, candidate.offset);
  let score = 0;
  for (const kw of CONTEXTUAL_KEYWORDS) {
    if (window.includes(kw.phrase)) score += kw.score;
  }
  return score;
}

/**
 * Select the best candidate from multiple mentions using the pattern's strategy.
 */
function applyTieBreaking(
  candidates: CandidateResult[],
  strategy: BiomarkerPattern["tieBreaking"],
  normalizedText: string
): CandidateResult {
  if (candidates.length === 1) return candidates[0];

  switch (strategy) {
    case "first":
      return candidates[0];

    case "last":
      return candidates[candidates.length - 1];

    case "highest": {
      let best = candidates[0];
      for (const c of candidates.slice(1)) {
        const cv = c.numericValue;
        const bv = best.numericValue;
        if (cv !== null && (bv === null || cv > bv)) best = c;
      }
      return best;
    }

    case "lowest": {
      let best = candidates[0];
      for (const c of candidates.slice(1)) {
        const cv = c.numericValue;
        const bv = best.numericValue;
        if (cv !== null && (bv === null || cv < bv)) best = c;
      }
      return best;
    }

    case "all": {
      const allValues = candidates.map((c) => c.value).join(" | ");
      const allEvidence = candidates.map((c) => c.evidence).join(" | ");
      return {
        ...candidates[0],
        value: allValues,
        evidence: allEvidence,
        valueType: "composite",
      };
    }

    case "contextual": {
      // Score each candidate by proximity to contextual keywords; fall back to "first"
      let best = candidates[0];
      let bestScore = contextualScore(normalizedText, best);
      for (const c of candidates.slice(1)) {
        const score = contextualScore(normalizedText, c);
        if (score > bestScore) { best = c; bestScore = score; }
      }
      return best;
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Extract a biomarker value from a single text cell.
 *
 * @param text - Raw clinical text from one cell
 * @param biomarkerQuery - User-typed biomarker name (e.g. "PSA", "PiRADS", "Ki-67")
 * @returns Extraction result, or null if not mentioned in text
 */
export function extractBiomarker(
  text: string,
  biomarkerQuery: string
): BiomarkerExtractionResult | null {
  if (!text?.trim() || !biomarkerQuery?.trim()) return null;

  // Phase 0: Resolve pattern
  const pattern = resolvePattern(biomarkerQuery);

  // Normalize text
  const normalized = normalizeForExtraction(text);

  // Phase 1: Find all mentions
  const mentions = findMentions(normalized, pattern);
  if (mentions.length === 0) return null;

  // Phase 2-5: Process each mention
  const candidates: CandidateResult[] = [];

  for (const hit of mentions) {
    // Phase 2: Pending check
    if (isPending(normalized, hit, pattern.pendingPhrases)) {
      const evidence = extractSnippet(text, hit.offset, hit.length);
      candidates.push({
        value: "PENDING",
        valueType: "pending",
        evidence,
        matchedAlias: hit.alias,
        confidence: "high",
        numericValue: null,
        offset: hit.offset,
      });
      continue;
    }

    // Phase 3: Context window
    const contextWindow = extractContextWindow(normalized, hit, pattern.contextWindowChars);

    // Phase 4: Value extraction (regex first, implicit values as fallback)
    const extracted = extractValueFromWindow(
      contextWindow,
      hit,
      pattern.valuePatterns,
      text,
      pattern.implicitValues
    );

    if (!extracted) continue;

    // Phase 6: Evidence extraction (uses original text + offset)
    const evidence = extractSnippet(text, hit.offset, hit.length);

    candidates.push({
      value: extracted.value,
      valueType: extracted.valueType,
      evidence,
      matchedAlias: hit.alias,
      confidence: extracted.confidence,
      numericValue: parseNumericForTieBreaking(extracted.value),
      offset: hit.offset,
    });
  }

  if (candidates.length === 0) {
    // Biomarker mentioned but no value could be extracted
    return null;
  }

  // Phase 5: Tie-breaking
  const best = applyTieBreaking(candidates, pattern.tieBreaking, normalized);

  return {
    value: best.value,
    valueType: best.valueType,
    evidence: best.evidence,
    matchedAlias: best.matchedAlias,
    confidence: best.confidence,
  };
}

/**
 * Run biomarker extraction over an entire dataset.
 * Appends 2 columns to every row: "[BiomarkerName] Value" + "[BiomarkerName] Evidence"
 * Rows with no mention get empty strings in both new columns.
 */
export function runBiomarkerExtraction(
  rows: Record<string, string>[],
  originalHeaders: string[],
  selectedColumn: string,
  biomarkerQuery: string,
  onProgress?: (processed: number) => void
): ExtractionOutput {
  const startTime = Date.now();
  const trimmedQuery = biomarkerQuery.trim();
  const valueCol = trimmedQuery + " Value";
  const evidenceCol = trimmedQuery + " Evidence";

  const headersOut = [...originalHeaders, valueCol, evidenceCol];

  let foundCount = 0;
  let notFoundCount = 0;
  let pendingCount = 0;

  const rowsOut: Record<string, string>[] = rows.map((row, i) => {
    const cellText = row[selectedColumn] ?? "";
    const result = extractBiomarker(cellText, trimmedQuery);

    onProgress?.(i + 1);

    if (!result) {
      notFoundCount++;
      return { ...row, [valueCol]: "", [evidenceCol]: "" };
    }

    if (result.valueType === "pending") pendingCount++;
    else foundCount++;

    return {
      ...row,
      [valueCol]: result.value,
      [evidenceCol]: result.evidence,
    };
  });

  const stats: ExtractionStats = {
    totalRows: rows.length,
    foundCount,
    notFoundCount,
    pendingCount,
    biomarkerName: trimmedQuery,
    column: selectedColumn,
    durationMs: Date.now() - startTime,
  };

  return { headersOut, rowsOut, stats };
}
