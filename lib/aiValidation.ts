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
export function hasAttributionRisk(text: string, biomarkerQuery: string): boolean {
  // Pipe-separated lists are the strongest signal
  if (text.includes("|")) return true;

  // Secondary: another known gene/biomarker symbol appears in the same text.
  // This list covers the most common genomic and clinical biomarkers.
  // When any of these appear alongside the queried biomarker, multi-attribution risk exists.
  const lowerText = text.toLowerCase();
  const lowerQuery = biomarkerQuery.toLowerCase();

  const KNOWN_BIOMARKER_NAMES = [
    // Oncogenes & tumor suppressors
    "tp53", "brca1", "brca2", "kras", "braf", "egfr", "alk", "her2", "erbb2",
    "pik3ca", "pten", "apc", "mlh1", "msh2", "msh6", "pms2", "cdkn2a",
    "rb1", "vhl", "ret", "met", "ros1", "nras", "hras", "fgfr1", "fgfr2",
    "fgfr3", "erbb3", "erbb4", "kit", "pdgfra", "akt1", "ctnnb1", "notch1",
    "stk11", "keap1", "nf1", "nf2", "smad4", "arid1a", "crebbp", "mycn",
    "myc", "ntrk1", "ntrk2", "ntrk3", "rb1", "atm", "chek2", "palb2",
    // Clinical biomarkers (known pattern library)
    "psa", "ki-67", "ki67", "pirads", "pi-rads", "gleason", "birads", "bi-rads",
    "pd-l1", "pdl1", "msi", "mmr", "tnm", "her2",
    // Serum markers
    "ca-125", "ca 125", "ca-15-3", "ca 15-3", "afp", "cea", "ldh",
    "lag-3", "pd-1",
  ];

  return KNOWN_BIOMARKER_NAMES.some(
    (name) =>
      // Must appear in text
      lowerText.includes(name) &&
      // Must NOT be the queried biomarker itself
      !lowerQuery.includes(name) &&
      name !== lowerQuery
  );
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
