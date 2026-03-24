/**
 * BioExtract — Surgical AI Enrichment
 *
 * Optional post-processing step for unknown biomarkers (those resolved via
 * buildFallbackPattern) when the rule-based pipeline returns null or a bare
 * digit-only number (indicating the fallback numeric pattern misread an
 * alphanumeric code such as G245S → 245).
 *
 * Gated by: NEXT_PUBLIC_AI_ENRICHMENT=true
 * Model:    claude-haiku-4-5-20251001  (via /api/ai-enrich route)
 * Timeout:  4000ms client-side (server enforces 3000ms against Anthropic)
 * Privacy:  context truncated to 500 chars before leaving the browser
 */

import type { BiomarkerExtractionResult, BiomarkerValueType } from "./types";

interface AIEnrichmentResult {
  value: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

/**
 * Decide whether AI enrichment should fire for this result.
 * Criteria:
 *   1. Biomarker is unknown (used buildFallbackPattern — caller passes isFallback)
 *   2. Rule result is null  OR  value is a bare digit string (e.g. "245" from "G245S")
 */
function shouldEnrich(
  ruleResult: BiomarkerExtractionResult | null,
  isFallback: boolean
): boolean {
  if (!isFallback) return false;
  if (ruleResult === null) return true;
  // Bare number with no letters, no unit — likely the fallback numeric pattern
  // captured a digit from inside an alphanumeric mutation code.
  if (/^\d+(\.\d+)?$/.test(ruleResult.value.trim())) return true;
  return false;
}

/**
 * Call the /api/ai-enrich Next.js route to extract a value via Claude Haiku.
 * Returns null on any error, timeout, or empty response.
 */
async function callAIEnrichRoute(
  biomarkerName: string,
  contextText: string
): Promise<AIEnrichmentResult | null> {
  try {
    const response = await fetch("/api/ai-enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        biomarkerName,
        contextText: contextText.slice(0, 500), // client-side privacy truncation
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as AIEnrichmentResult & { error?: string };
    if (data.error || !data.value || data.value.trim() === "" || data.value.toLowerCase() === "not found") {
      return null;
    }

    return {
      value: data.value,
      confidence: (["high", "medium", "low"].includes(data.confidence) ? data.confidence : "low") as
        "high" | "medium" | "low",
      rationale: data.rationale ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Optionally enrich a rule-based extraction result with AI for unknown biomarkers.
 *
 * AI only fires when NEXT_PUBLIC_AI_ENRICHMENT=true AND the biomarker is
 * unknown (isFallback=true) AND the rule result is null or bare-numeric.
 *
 * @param biomarkerName - User-typed biomarker query
 * @param rawText       - Original cell text (truncated to 500 chars before sending)
 * @param ruleResult    - Synchronous rule-based result (may be null)
 * @param isFallback    - Whether the biomarker used buildFallbackPattern
 */
export async function enrichWithAI(
  biomarkerName: string,
  rawText: string,
  ruleResult: BiomarkerExtractionResult | null,
  isFallback: boolean
): Promise<{ result: BiomarkerExtractionResult | null; aiEnriched: boolean }> {
  if (process.env.NEXT_PUBLIC_AI_ENRICHMENT !== "true") {
    return { result: ruleResult, aiEnriched: false };
  }

  if (!shouldEnrich(ruleResult, isFallback)) {
    return { result: ruleResult, aiEnriched: false };
  }

  const aiData = await callAIEnrichRoute(biomarkerName, rawText);
  if (!aiData) return { result: ruleResult, aiEnriched: false };

  const enriched: BiomarkerExtractionResult = {
    value: aiData.value,
    valueType: "composite" as BiomarkerValueType,
    evidence: ruleResult?.evidence ?? rawText.slice(0, 200),
    matchedAlias: biomarkerName.toLowerCase(),
    confidence: aiData.confidence,
    aiEnriched: true,
  };

  return { result: enriched, aiEnriched: true };
}
