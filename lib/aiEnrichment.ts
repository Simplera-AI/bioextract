/**
 * BioExtract — Surgical AI Enrichment
 *
 * Optional post-processing step for unknown biomarkers (those resolved via
 * buildFallbackPattern) when the rule-based pipeline returns null, a bare
 * digit-only number, or a low/medium-confidence result.
 *
 * Gated by: NEXT_PUBLIC_AI_ENRICHMENT=true
 * Model:    claude-sonnet-4-6 (configurable via BIOEXTRACT_AI_MODEL env var)
 * Timeout:  4000ms client-side (server enforces 3000ms against Anthropic)
 * Privacy:  context truncated to 800 chars before leaving the browser
 */

import type { BiomarkerExtractionResult, BiomarkerValueType } from "./types";
import type { BiomarkerCategory } from "./biomarkerTypeInference";
import { extractSnippet } from "./evidence";

interface AIEnrichmentResult {
  value: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Decide whether AI enrichment should fire for this result.
 *
 * Known biomarkers (isFallback=false):
 *   AI runs only when the rule engine found NOTHING (ruleResult === null).
 *   This handles unseen clinical report formats for known markers like PSA,
 *   HER2, EGFR etc. where the regex didn't match but the biomarker is present.
 *   We never second-guess a high-confidence rule extraction for known markers.
 *
 * Unknown biomarkers (isFallback=true):
 *   More aggressive — also fires for bare-digit results and medium/low confidence,
 *   since the generic fallback patterns are less specific than named patterns.
 */
export function shouldEnrich(
  ruleResult: BiomarkerExtractionResult | null,
  isFallback: boolean
): boolean {
  // Known biomarker: only enrich when regex found absolutely nothing.
  if (!isFallback) return ruleResult === null;

  // Unknown biomarker (fallback pattern): enrich when null, uncertain, or suspicious.
  if (ruleResult === null) return true;
  // Bare number with no letters, no unit — likely the fallback numeric pattern
  // captured a digit from inside an alphanumeric mutation code (e.g. G245S → 245).
  if (/^\d+(\.\d+)?$/.test(ruleResult.value.trim())) return true;
  // Low or medium confidence means the rule engine is uncertain — let AI verify.
  if (ruleResult.confidence !== "high") return true;
  return false;
}

/**
 * Call the /api/ai-enrich Next.js route to extract a value via Claude.
 * Returns null on any error, timeout, or empty response.
 */
async function callAIEnrichRoute(
  biomarkerName: string,
  contextText: string,
  biomarkerCategory?: BiomarkerCategory
): Promise<AIEnrichmentResult | null> {
  try {
    const response = await fetch("/api/ai-enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        biomarkerName,
        contextText: contextText.slice(0, 800), // client-side privacy truncation
        biomarkerCategory,
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as AIEnrichmentResult & { error?: string };
    const v = data.value?.trim().toLowerCase() ?? "";
    if (data.error || !data.value || v === "" || v === "not found" || v === "n/a" || v === "pending") {
      return null;
    }

    return {
      value: data.value,
      confidence: (["high", "medium", "low"].includes(data.confidence) ? data.confidence : "low") as
        "high" | "medium" | "low",
    };
  } catch {
    return null;
  }
}

/**
 * Optionally enrich a rule-based extraction result with AI for unknown biomarkers.
 *
 * AI fires when NEXT_PUBLIC_AI_ENRICHMENT=true AND the biomarker is
 * unknown (isFallback=true) AND one of these is true:
 *   • Rule result is null
 *   • Value is bare-numeric (likely misparse)
 *   • Confidence is not "high" (rule engine uncertain)
 *
 * @param biomarkerName     - User-typed biomarker query
 * @param rawText           - Original cell text (truncated to 800 chars before sending)
 * @param ruleResult        - Synchronous rule-based result (may be null)
 * @param isFallback        - Whether the biomarker used buildFallbackPattern
 * @param biomarkerCategory - Inferred clinical category for prompt routing
 */
export async function enrichWithAI(
  biomarkerName: string,
  rawText: string,
  ruleResult: BiomarkerExtractionResult | null,
  isFallback: boolean,
  biomarkerCategory?: BiomarkerCategory
): Promise<{ result: BiomarkerExtractionResult | null; aiEnriched: boolean }> {
  if (process.env.NEXT_PUBLIC_AI_ENRICHMENT !== "true") {
    return { result: ruleResult, aiEnriched: false };
  }

  if (!shouldEnrich(ruleResult, isFallback)) {
    return { result: ruleResult, aiEnriched: false };
  }

  const aiData = await callAIEnrichRoute(biomarkerName, rawText, biomarkerCategory);
  if (!aiData) return { result: ruleResult, aiEnriched: false };

  // Build a proper evidence snippet from the raw text.
  // Locate the biomarker alias in the text to anchor the snippet.
  // Falls back to the first 200 chars if no anchor found.
  const aliasOffset = rawText.toLowerCase().indexOf(biomarkerName.toLowerCase());
  const evidence = aliasOffset >= 0
    ? extractSnippet(rawText, aliasOffset, biomarkerName.length)
    : (ruleResult?.evidence ?? rawText.slice(0, 200));

  const enriched: BiomarkerExtractionResult = {
    value: aiData.value,
    valueType: "composite" as BiomarkerValueType,
    evidence,
    matchedAlias: biomarkerName.toLowerCase(),
    confidence: aiData.confidence,
    aiEnriched: true,
  };

  // Feature 5: Log high-confidence AI enrichment for known biomarkers to localStorage.
  // This is a silent, non-blocking foundation for future automatic pattern promotion.
  if (!isFallback && aiData.confidence === "high") {
    logAIPattern(biomarkerName, rawText.slice(0, 200), aiData.value);
  }

  return { result: enriched, aiEnriched: true };
}

/**
 * Log a high-confidence AI enrichment result to localStorage under key
 * 'bioextract_ai_patterns'. Stores the last 500 entries. Never throws.
 * Browser-only: silently no-ops in server/test environments.
 */
function logAIPattern(biomarkerName: string, context: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem("bioextract_ai_patterns");
    const entries: { biomarker: string; context: string; timestamp: number; value: string }[] =
      raw ? (JSON.parse(raw) as typeof entries) : [];
    entries.push({ biomarker: biomarkerName, context, timestamp: Date.now(), value });
    // Keep only the most recent 500 entries
    const trimmed = entries.length > 500 ? entries.slice(entries.length - 500) : entries;
    localStorage.setItem("bioextract_ai_patterns", JSON.stringify(trimmed));
  } catch {
    // localStorage unavailable (private browsing, storage full, SSR) — fail silently
  }
}
