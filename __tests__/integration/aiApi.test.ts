/**
 * Real AI API integration tests.
 *
 * These tests make LIVE calls to the Anthropic API — they cost money and
 * require a valid BIOEXTRACT_ANTHROPIC_API_KEY with available balance.
 *
 * All tests skip automatically when the key is absent so that `npm test`
 * never fails in a CI environment or on a machine without credentials.
 *
 * Run locally to verify:
 *   1. The API key is valid and has credits
 *   2. The model name is correct
 *   3. The ai-enrich prompt extracts biomarker values correctly
 *   4. The ai-validate prompt correctly identifies attribution (right/wrong biomarker)
 */

import { describe, it, expect, beforeAll } from "vitest";

const API_KEY = process.env.BIOEXTRACT_ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const skip = !API_KEY;

// ─── Helper: call Anthropic directly ─────────────────────────────────────────

async function callAnthropic(system: string, user: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
  return data.content?.[0]?.text ?? "";
}

// ─── Connectivity + key validation ───────────────────────────────────────────

describe.skipIf(skip)("Anthropic API — connectivity", () => {
  it("API key is valid and has balance", async () => {
    // Any non-empty response without an exception = key works and has balance
    const text = await callAnthropic("You are a test assistant.", "Say one word.");
    expect(text.trim().length).toBeGreaterThan(0);
  }, 10_000);
});

// ─── AI Enrichment prompt ─────────────────────────────────────────────────────

describe.skipIf(skip)("AI Enrichment — real prompt validation", () => {
  const ENRICH_SYSTEM =
    "You are a clinical biomarker extraction assistant. Extract only the exact value from the text. Return ONLY valid JSON — no markdown, no explanation.";

  function enrichPrompt(biomarkerName: string, context: string): string {
    return (
      `Extract the most clinically relevant value for the biomarker "${biomarkerName}" from the text below.\n` +
      `Return ONLY this JSON: {"value": "...", "confidence": "high|medium|low", "rationale": "..."}\n\n` +
      `Text: ${context}`
    );
  }

  it("extracts mutation notation for unknown genomic biomarker", async () => {
    const raw = await callAnthropic(
      ENRICH_SYSTEM,
      enrichPrompt("TP53", "Molecular profiling: TP53 G245S pathogenic variant confirmed.")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { value: string; confidence: string };
    expect(parsed.value).toMatch(/G245S/i);
    expect(["high", "medium", "low"]).toContain(parsed.confidence);
  }, 10_000);

  it("returns not found for text with no relevant value", async () => {
    const raw = await callAnthropic(
      ENRICH_SYSTEM,
      enrichPrompt("TP53", "Patient is scheduled for routine follow-up next month.")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { value: string };
    // Model should say "not found" or similar — value should not be a clinical result
    expect(parsed.value.toLowerCase()).toMatch(/not found|n\/a|none|no value|unavailable/i);
  }, 10_000);

  it("extracts numeric value with units for unknown lab marker", async () => {
    const raw = await callAnthropic(
      ENRICH_SYSTEM,
      enrichPrompt("LDH", "Serum LDH measured at 412 U/L, consistent with elevated tumor burden.")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { value: string };
    expect(parsed.value).toMatch(/412/);
  }, 10_000);
});

// ─── AI Validation prompt ─────────────────────────────────────────────────────

describe.skipIf(skip)("AI Validation — attribution check", () => {
  const VALIDATE_SYSTEM =
    'You are a clinical data validator. Answer with ONLY valid JSON: {"attribution":"correct"|"wrong"|"uncertain","confidence":"high"|"medium"|"low","reason":"..."}';

  function validatePrompt(biomarkerName: string, extractedValue: string, context: string): string {
    return (
      `Does the value "${extractedValue}" belong to the biomarker "${biomarkerName}" in the text below?\n` +
      `Answer "correct" if yes, "wrong" if it clearly belongs to a different biomarker, "uncertain" if unsure.\n\n` +
      `Text: ${context}`
    );
  }

  it("confirms correct attribution for TP53 value in pipe-separated profile", async () => {
    const raw = await callAnthropic(
      VALIDATE_SYSTEM,
      validatePrompt("TP53", "G245S", "TP53 G245S | BRCA2 c.1813delA | TP53 R273H")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { attribution: string };
    expect(parsed.attribution).toBe("correct");
  }, 10_000);

  it("flags wrong attribution when BRCA2 value is returned for TP53", async () => {
    const raw = await callAnthropic(
      VALIDATE_SYSTEM,
      validatePrompt("TP53", "c.1813delA", "TP53 G245S | BRCA2 c.1813delA | TP53 R273H")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { attribution: string };
    // c.1813delA belongs to BRCA2, not TP53
    expect(parsed.attribution).toBe("wrong");
  }, 10_000);

  it("returns correct attribution for unambiguous single-biomarker text", async () => {
    const raw = await callAnthropic(
      VALIDATE_SYSTEM,
      validatePrompt("PSA", "4.2 ng/mL", "PSA was 4.2 ng/mL on the date of biopsy.")
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { attribution: string };
    expect(parsed.attribution).toBe("correct");
  }, 10_000);
});
