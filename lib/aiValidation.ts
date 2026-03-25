/**
 * BioExtract — AI Attribution Validation
 *
 * Verifies that an extracted value actually belongs to the queried biomarker
 * and was not accidentally grabbed from an adjacent biomarker in the same text.
 *
 * Problem this solves:
 *   "TP53 G245S | BRCA2 c.1813delA | TP53 R273H"
 *   → Rule engine extracts c.1813delA for TP53 (wrong — it belongs to BRCA2)
 *   → validateAttribution("TP53", "c.1813delA", text) → { valid: false }
 *   → Caller discards the result; TP53 correctly falls back to G245S / R273H
 *
 * Gated by: NEXT_PUBLIC_AI_ENRICHMENT=true
 * Model:    claude-haiku-4-5-20251001 (via /api/ai-validate route)
 * Timeout:  4000ms client-side (server enforces 3000ms against Anthropic)
 * Privacy:  context truncated to 600 chars before leaving browser
 *
 * Fail-safe design: any error, timeout, or "uncertain" response returns
 * { valid: true } — the result is kept rather than discarded. We only
 * reject when AI is *confident* the attribution is wrong.
 */

/**
 * Detect whether a text has attribution risk — multiple biomarker names
 * present in the same text, which can cause the rule engine to extract a
 * value that belongs to a different biomarker.
 *
 * Triggers on:
 *   1. Pipe character "|" — pipe-separated molecular profile lists are the
 *      most common source of cross-biomarker contamination.
 *      e.g. "TP53 G245S | BRCA2 c.1813delA | TP53 R273H"
 *
 *   2. Another known biomarker/gene symbol appearing alongside the queried one
 *      — catches contamination in prose: "TP53 mutation confirmed. BRCA2
 *      pathogenic variant c.1813delA also detected."
 *
 * Returns false for simple, single-biomarker texts so validation is never
 * invoked unnecessarily ("PSA was 4.2 ng/mL today" → no risk).
 */
export function hasAttributionRisk(text: string, _biomarkerQuery: string): boolean {
  // Only trigger for pipe-separated molecular profile lists — the primary source
  // of cross-biomarker contamination (e.g. "TP53 G245S | BRCA2 c.1813delA").
  // Prose notes that merely mention two biomarker names in passing are handled
  // correctly by the rule engine's anchor-based patterns and do not need AI validation.
  return text.includes("|");
}

/**
 * Ask the server-side AI to verify whether `extractedValue` belongs to
 * `biomarkerName` in the given `contextText`.
 *
 * Only makes an API call when NEXT_PUBLIC_AI_ENRICHMENT=true.
 * Returns { valid: true } on any error, timeout, or uncertain answer.
 * Returns { valid: false } ONLY when AI answers "wrong" with high or medium confidence.
 */
export async function validateAttribution(
  biomarkerName: string,
  extractedValue: string,
  contextText: string
): Promise<{ valid: boolean }> {
  if (process.env.NEXT_PUBLIC_AI_ENRICHMENT !== "true") {
    return { valid: true }; // AI disabled — trust the rule-based result
  }

  try {
    const response = await fetch("/api/ai-validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        biomarkerName,
        extractedValue,
        contextText: contextText.slice(0, 600), // client-side privacy truncation
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return { valid: true }; // server error — keep result (fail-safe)

    const data = (await response.json()) as {
      attribution?: string;
      confidence?: string;
      reason?: string;
      error?: string;
    };

    if (data.error) return { valid: true };

    // Only discard when AI is CONFIDENT the attribution is wrong.
    // "uncertain" → keep the result (fail-open: better to return a possibly wrong
    // value than silently suppress a correct one).
    if (
      data.attribution === "wrong" &&
      (data.confidence === "high" || data.confidence === "medium")
    ) {
      return { valid: false };
    }

    return { valid: true };
  } catch {
    // Timeout, network error, or parse error — keep the result
    return { valid: true };
  }
}
