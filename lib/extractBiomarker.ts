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
import { enrichWithAI } from "./aiEnrichment";
import { hasAttributionRisk, validateAttribution } from "./aiValidation";
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
 * Returns both the window string and the start offset so callers can compute
 * exact alias positions within the window.
 *
 * The left edge is trimmed to the nearest sentence boundary (. ! ?) before
 * the hit. This prevents patterns that embed the biomarker name as an anchor
 * (e.g. PSA patterns contain "psa") from matching an EARLIER mention that
 * happens to fall in the same large context window. For example, when
 * processing the second "psa" in "PSA was 8.4. psa rose to 12.1 ng/mL.",
 * trimming starts the window at "psa rose to 12.1…" so the pattern sees 12.1,
 * not 8.4.
 */
function extractContextWindow(
  normalizedText: string,
  hit: MentionHit,
  contextWindowChars: number
): { window: string; windowStart: number } {
  const half = Math.floor(contextWindowChars / 2);
  let windowStart = Math.max(0, hit.offset - half);
  const end = Math.min(normalizedText.length, hit.offset + hit.length + half);

  // Trim left edge to the start of the sentence containing this hit.
  if (windowStart < hit.offset) {
    const beforeHit = normalizedText.slice(windowStart, hit.offset);
    const sentBoundaryRe = /[.!?]\s+/g;
    let m: RegExpExecArray | null;
    let lastBoundaryEnd = -1;
    while ((m = sentBoundaryRe.exec(beforeHit)) !== null) {
      lastBoundaryEnd = m.index + m[0].length;
    }
    if (lastBoundaryEnd >= 0) {
      windowStart = windowStart + lastBoundaryEnd;
    }
  }

  return { window: normalizedText.slice(windowStart, end), windowStart };
}

// ─── Coreference Resolution ───────────────────────────────────────────────

/**
 * Simple pronoun coreference: replace sentence-initial pronouns ("It", "This",
 * "The value/level/result/score/marker") with the biomarker's primary alias
 * when they appear within 200 chars of a prior biomarker mention.
 *
 * Enables extraction from: "PSA 8.4. It rose to 12.1." → finds both values.
 * Conservative: only replaces at sentence boundaries (after [.!?]) to avoid
 * false positives in the middle of a sentence.
 */
function resolvePronounCoreferences(text: string, pattern: BiomarkerPattern): string {
  // Shortest alias = most likely to appear as a clean replacement
  const shortAlias = pattern.aliases[pattern.aliases.length - 1];
  const lowerText = text.toLowerCase();

  // Quick exit: no alias present in text at all
  if (!pattern.aliases.some((a) => lowerText.includes(a.toLowerCase()))) return text;

  // Find all sentence-boundary pronouns in text
  const pronounRe = /([.!?]\s{0,3})(It|This|The\s+(?:value|level|result|score|marker|measurement))\s+/gi;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  let m: RegExpExecArray | null;
  pronounRe.lastIndex = 0;
  while ((m = pronounRe.exec(text)) !== null) {
    const pronounStart = m.index + m[1].length; // start of the pronoun itself
    const pronounEnd = m.index + m[0].length;   // end of the pronoun + trailing space

    // Only replace if a biomarker alias appears within 200 chars BEFORE this pronoun
    const lookback = text.slice(Math.max(0, pronounStart - 200), pronounStart).toLowerCase();
    if (pattern.aliases.some((a) => lookback.includes(a.toLowerCase()))) {
      replacements.push({ start: pronounStart, end: pronounEnd, replacement: shortAlias + " " });
    }
  }

  // Apply replacements in reverse order so offsets remain valid
  let result = text;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }
  return result;
}

// ─── NegEx-Style Negation Scope ───────────────────────────────────────────

/** Negation trigger words — if any appear between alias and value, value is negated. */
const NEGATION_CUES = /\b(?:not|no|never|without|denies|den[yi]ed|rules?\s+out|ruled\s+out|absent|negative|unremarkable)\b/i;

/** Scope terminators — negation scope ends at these tokens. */
const SCOPE_TERMINATORS = /[.;!?]|\b(?:but|however|except|although|despite|yet|though|whereas)\b/i;

/**
 * Returns true if a negation cue appears between `aliasEnd` and `captureStart`
 * in the context window, WITHOUT a scope terminator (sentence boundary, "but",
 * etc.) in between.
 *
 * Only applies to numeric/comparison/range values — categorical patterns like
 * "not detected" are themselves negation results and should not be filtered.
 */
function isNegatedBetween(
  contextWindow: string,
  aliasEnd: number,
  captureStart: number
): boolean {
  if (aliasEnd >= captureStart) return false; // no gap to check

  const between = contextWindow.slice(aliasEnd, captureStart);

  // If ANY scope terminator appears between the alias and the value, the negation
  // scope has already ended before the value — value is safe (not negated).
  if (SCOPE_TERMINATORS.test(between)) return false;

  // No terminator found — check if the entire between-text contains a negation cue
  return NEGATION_CUES.test(between);
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
  aliasIndexInWindow: number,
  hit: MentionHit,
  valuePatterns: ValueCapturePattern[],
  _originalText: string,
  implicitValues?: Record<string, string>,
  skipPhrases?: string[]
): { value: string; valueType: BiomarkerValueType; confidence: "high" | "medium" | "low" } | null {
  for (const vp of valuePatterns) {
    const match = vp.pattern.exec(contextWindow);
    if (!match || !match[1]) continue;

    const rawValue = match[1].trim();
    if (!rawValue) continue;

    // Header/disclaimer skip: if any skipPhrase appears within 80 chars BEFORE the
    // captured value, this match is likely from a reference-range row — skip it.
    if (skipPhrases && skipPhrases.length > 0) {
      const captureStart = (match.index ?? 0) + match[0].indexOf(match[1]);
      const lookback = contextWindow.slice(Math.max(0, captureStart - 80), captureStart).toLowerCase();
      if (skipPhrases.some((phrase) => lookback.includes(phrase.toLowerCase()))) {
        continue;
      }
    }

    const value = vp.transform ? vp.transform(rawValue) : rawValue;

    // NegEx-style negation scope check.
    // Skip numeric/comparison/range values when a negation cue appears between
    // the alias and the captured value (within the same clause — scope ends at
    // sentence boundaries and words like "but", "however", etc.).
    // Categorical results that ARE negation phrases (e.g. "not detected") are
    // exempt — their rawValue already encodes the negation.
    const isNegationResult = /\b(?:not\s+(?:detected|identified|found|present)|negative|absent|wild[-\s]?type)\b/i.test(rawValue);
    if (!isNegationResult && (vp.valueType === "numeric" || vp.valueType === "comparison" || vp.valueType === "range")) {
      if (aliasIndexInWindow >= 0) {
        const captureStart = (match.index ?? 0) + match[0].indexOf(match[1]);
        if (isNegatedBetween(contextWindow, aliasIndexInWindow + hit.alias.length, captureStart)) {
          continue; // negation scope covers this value — skip candidate
        }
      }
    }

    // Determine confidence based on proximity of value to mention.
    // When the alias isn't found literally in the window (e.g. aliasRegex matched a
    // variant form), use the window centre as the reference point so distance is
    // never artificially 0 or inflated.
    const matchStart = match.index ?? 0;
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
 *
 * - comparison: returns the MAX number (e.g. "decreased from 8.4 to 0.2" → 8.4
 *   so "highest" strategy correctly picks the comparison candidate when appropriate)
 * - range: returns the UPPER bound (e.g. "3.2-5.0 ng/mL" → 5.0)
 * - all others: returns the FIRST number
 */
function parseNumericForTieBreaking(value: string, valueType?: BiomarkerValueType): number | null {
  const nums = [...value.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
  if (nums.length === 0) return null;
  if (valueType === "comparison") return Math.max(...nums);
  if (valueType === "range") return nums[nums.length - 1]; // upper bound
  return nums[0]; // first number (default)
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

  // Coreference pre-pass: replace sentence-initial pronouns ("It", "This",
  // "The value/level") with the biomarker alias when near a prior mention.
  const corefText = resolvePronounCoreferences(text, pattern);

  // Normalize text
  const normalized = normalizeForExtraction(corefText);

  // Phase 1: Find all mentions
  const mentions = findMentions(normalized, pattern);
  if (mentions.length === 0) return null;

  // Phase 2-5: Process each mention
  const candidates: CandidateResult[] = [];

  for (const hit of mentions) {
    // Phase 2: Pending check
    if (isPending(normalized, hit, pattern.pendingPhrases)) {
      const evidence = extractSnippet(corefText, hit.offset, hit.length);
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
    const { window: contextWindow, windowStart } = extractContextWindow(normalized, hit, pattern.contextWindowChars);
    // Exact alias position within this window — avoids indexOf finding the wrong
    // occurrence when the text is short and both mentions share the same window.
    const aliasIndexInWindow = hit.offset - windowStart;

    // Phase 4: Value extraction (regex first, implicit values as fallback)
    const extracted = extractValueFromWindow(
      contextWindow,
      aliasIndexInWindow,
      hit,
      pattern.valuePatterns,
      text,
      pattern.implicitValues,
      pattern.skipPhrases
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
      numericValue: parseNumericForTieBreaking(extracted.value, extracted.valueType),
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

// ─── Async variants with optional AI enrichment ──────────────────────────────

/**
 * Async variant of extractBiomarker with two AI-powered enhancements:
 *
 * Step 1 — Enrichment (unknown biomarkers only):
 *   When the biomarker is not in the known pattern library AND the rule result
 *   is null or bare-numeric (likely misread an alphanumeric code), call Claude
 *   Haiku to extract the value directly from the context text.
 *   Gated by: NEXT_PUBLIC_AI_ENRICHMENT=true
 *
 * Step 2 — Attribution Validation (all biomarkers):
 *   When AI is enabled AND the text contains multiple biomarker names (e.g.
 *   pipe-separated molecular profiles like "TP53 G245S | BRCA2 c.1813delA"),
 *   ask Claude Haiku: "Does this value actually belong to the queried biomarker?"
 *   If AI is confident the value belongs to a DIFFERENT biomarker, the result
 *   is discarded (returns null) — preventing cross-biomarker contamination.
 *   This fires for BOTH known (PSA, KRAS, etc.) and unknown biomarkers.
 *   Fail-safe: any timeout, error, or uncertain response keeps the result.
 */
export async function extractBiomarkerAsync(
  text: string,
  biomarkerQuery: string
): Promise<BiomarkerExtractionResult | null> {
  const isFallback = getBiomarkerPattern(biomarkerQuery) === null;
  const ruleResult = extractBiomarker(text, biomarkerQuery);

  // Step 1: AI enrichment for unknown biomarkers with null / bare-numeric results
  let finalResult = ruleResult;
  let markedAiEnriched = false;
  if (isFallback) {
    const enrichment = await enrichWithAI(biomarkerQuery, text, ruleResult, isFallback);
    finalResult = enrichment.result;
    markedAiEnriched = enrichment.aiEnriched;
  }

  // Step 2: Attribution validation — fires for ALL biomarkers (known + unknown)
  // when AI is enabled AND the text has multiple biomarker names that could
  // cause the rule engine to grab the wrong biomarker's value.
  if (
    finalResult &&
    process.env.NEXT_PUBLIC_AI_ENRICHMENT === "true" &&
    hasAttributionRisk(text, biomarkerQuery)
  ) {
    const { valid } = await validateAttribution(biomarkerQuery, finalResult.value, text);
    if (!valid) return null; // AI confirmed wrong attribution — discard
  }

  if (markedAiEnriched && finalResult) {
    return { ...finalResult, aiEnriched: true };
  }
  return finalResult;
}

/**
 * Async variant of runBiomarkerExtraction with optional AI enrichment per row.
 * Falls back to sync extractBiomarker for known biomarkers (no extra latency).
 * Tracks how many rows were AI-enriched in stats.aiEnrichedCount.
 */
export async function runBiomarkerExtractionAsync(
  rows: Record<string, string>[],
  originalHeaders: string[],
  selectedColumn: string,
  biomarkerQuery: string,
  onProgress?: (processed: number) => void
): Promise<ExtractionOutput> {
  const startTime = Date.now();
  const trimmedQuery = biomarkerQuery.trim();
  const valueCol = trimmedQuery + " Value";
  const evidenceCol = trimmedQuery + " Evidence";
  const headersOut = [...originalHeaders, valueCol, evidenceCol];

  let foundCount = 0;
  let notFoundCount = 0;
  let pendingCount = 0;
  let aiEnrichedCount = 0;

  const rowsOut: Record<string, string>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cellText = rows[i][selectedColumn] ?? "";
    const result = await extractBiomarkerAsync(cellText, trimmedQuery);

    onProgress?.(i + 1);

    if (!result) {
      notFoundCount++;
      rowsOut.push({ ...rows[i], [valueCol]: "", [evidenceCol]: "" });
      continue;
    }

    if (result.valueType === "pending") pendingCount++;
    else foundCount++;
    if (result.aiEnriched) aiEnrichedCount++;

    rowsOut.push({
      ...rows[i],
      [valueCol]: result.value,
      [evidenceCol]: result.evidence,
    });
  }

  const stats: ExtractionStats = {
    totalRows: rows.length,
    foundCount,
    notFoundCount,
    pendingCount,
    biomarkerName: trimmedQuery,
    column: selectedColumn,
    durationMs: Date.now() - startTime,
    aiEnrichedCount,
  };

  return { headersOut, rowsOut, stats };
}
