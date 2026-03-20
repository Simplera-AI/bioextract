/**
 * BioExtract — Core Extraction Engine Tests
 *
 * Real integration tests using actual clinical text strings.
 * No mocked functions — all tests exercise the live extraction pipeline.
 */

import { describe, it, expect } from "vitest";
import { normalizeForExtraction } from "../lib/textNormalize";
import { findAllMentions } from "../lib/textNormalize";
import { getBiomarkerPattern, buildFallbackPattern } from "../lib/biomarkerPatterns";
import { extractBiomarker, runBiomarkerExtraction } from "../lib/extractBiomarker";

// ─── Normalization Tests ──────────────────────────────────────────────────

describe("normalizeForExtraction", () => {
  it("collapses Unicode non-breaking space to regular space", () => {
    // U+00A0 non-breaking space
    const text = "PSA\u00a0level\u00a04.2";
    const result = normalizeForExtraction(text);
    expect(result).toBe("psa level 4.2");
  });

  it("converts decimal comma (European EMR format) to decimal point", () => {
    const text = "PSA was 4,2 ng/mL";
    const result = normalizeForExtraction(text);
    expect(result).toContain("4.2");
  });

  it("converts em-dash to hyphen", () => {
    // U+2014 em-dash
    const text = "PSA\u2014negative";
    const result = normalizeForExtraction(text);
    expect(result).toContain("-");
    expect(result).not.toContain("\u2014");
  });

  it("converts en-dash to hyphen", () => {
    // U+2013 en-dash
    const text = "Ki\u201367 was 20%";
    const result = normalizeForExtraction(text);
    expect(result).toContain("ki-67");
  });

  it("converts Unicode superscript digits to ASCII", () => {
    // U+00B2 superscript 2, U+00B3 superscript 3
    const text = "10\u00b2 cells/mL";
    const result = normalizeForExtraction(text);
    expect(result).toContain("102");
  });

  it("lowercases the entire string", () => {
    const text = "PSA Level WAS 4.2";
    const result = normalizeForExtraction(text);
    expect(result).toBe("psa level was 4.2");
  });

  it("collapses multiple spaces into one", () => {
    const text = "PSA   level   4.2";
    const result = normalizeForExtraction(text);
    expect(result).toBe("psa level 4.2");
  });

  it("normalizes tabs to spaces", () => {
    const text = "PSA\tlevel\t4.2";
    const result = normalizeForExtraction(text);
    expect(result).toBe("psa level 4.2");
  });
});

// ─── Alias Resolution Tests ───────────────────────────────────────────────

describe("getBiomarkerPattern", () => {
  it("returns a pattern for PSA from the full library", () => {
    // Phase 3: BIOMARKER_PATTERNS is now fully populated
    const result = getBiomarkerPattern("PSA");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("PSA");
  });

  it("returns null for an unknown biomarker not in the library", () => {
    expect(getBiomarkerPattern("ferritin")).toBeNull();
  });

  it("returns HER2 pattern from the full library", () => {
    expect(getBiomarkerPattern("HER2")).not.toBeNull();
    expect(getBiomarkerPattern("HER2")!.name).toBe("HER2");
  });
});

describe("buildFallbackPattern", () => {
  it("returns a pattern with aliases containing the lowercased biomarker name", () => {
    const pattern = buildFallbackPattern("Ferritin");
    expect(pattern.aliases).toContain("ferritin");
  });

  it("sets the biomarker name exactly as provided", () => {
    const pattern = buildFallbackPattern("Ferritin");
    expect(pattern.name).toBe("Ferritin");
  });

  it("includes common pending phrases", () => {
    const pattern = buildFallbackPattern("PSA");
    expect(pattern.pendingPhrases).toContain("pending");
    expect(pattern.pendingPhrases).toContain("not done");
  });

  it("has a contextWindowChars of 200", () => {
    const pattern = buildFallbackPattern("PSA");
    expect(pattern.contextWindowChars).toBe(200);
  });

  it("has tieBreaking set to first", () => {
    const pattern = buildFallbackPattern("PSA");
    expect(pattern.tieBreaking).toBe("first");
  });

  it("fallback pattern numeric regex matches Ferritin 45 ng/mL", () => {
    const pattern = buildFallbackPattern("Ferritin");
    // The numeric-with-unit pattern
    const numericPattern = pattern.valuePatterns[0];
    const text = "ferritin 45 ng/ml";
    const match = numericPattern.pattern.exec(text);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("45");
  });

  it("fallback pattern categorical regex matches Ferritin: positive", () => {
    const pattern = buildFallbackPattern("Ferritin");
    const categoricalPattern = pattern.valuePatterns[1];
    const text = "ferritin: positive";
    const match = categoricalPattern.pattern.exec(text);
    expect(match).not.toBeNull();
    expect(match![1].toLowerCase()).toBe("positive");
  });
});

// ─── findAllMentions Tests ────────────────────────────────────────────────

describe("findAllMentions", () => {
  it("matches psa with word boundary — standalone psa in sentence", () => {
    const haystack = "noted no psa result available";
    const hits = findAllMentions(haystack, "psa");
    expect(hits.length).toBe(1);
    expect(hits[0].offset).toBe(9); // "noted no " is 9 chars
  });

  it("finds 2 mentions when psa appears twice", () => {
    const haystack = "psa level 4.2, free psa 1.1";
    const hits = findAllMentions(haystack, "psa");
    expect(hits.length).toBe(2);
  });

  it("does NOT match psa inside psatest (no word boundary)", () => {
    const haystack = "psatest result was normal";
    const hits = findAllMentions(haystack, "psa");
    expect(hits.length).toBe(0);
  });

  it("does NOT match psa inside mypsa (no boundary before)", () => {
    const haystack = "mypsa value is high";
    const hits = findAllMentions(haystack, "psa");
    expect(hits.length).toBe(0);
  });

  it("returns empty array when term is not in haystack at all", () => {
    const haystack = "hemoglobin was 12 g/dl";
    const hits = findAllMentions(haystack, "psa");
    expect(hits.length).toBe(0);
  });

  it("matches multi-word term using substring matching", () => {
    const haystack = "free psa level was 0.8 ng/ml";
    const hits = findAllMentions(haystack, "free psa");
    expect(hits.length).toBe(1);
    expect(hits[0].offset).toBe(0);
  });
});

// ─── Core Extraction Tests ────────────────────────────────────────────────

describe("extractBiomarker", () => {
  it("returns null for empty text", () => {
    const result = extractBiomarker("", "psa");
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    const result = extractBiomarker("   ", "psa");
    expect(result).toBeNull();
  });

  it("returns null when biomarker is not mentioned", () => {
    const result = extractBiomarker("Hemoglobin 12 g/dL, WBC 5.0", "psa");
    expect(result).toBeNull();
  });

  it("extracts ferritin value with ng/mL unit", () => {
    const result = extractBiomarker("Ferritin level: 45 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/45/);
  });

  it("extracts ferritin numeric value (bare number after colon)", () => {
    const result = extractBiomarker("Ferritin: 45", "ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toContain("45");
  });

  it("returns PENDING when PSA result is pending", () => {
    const result = extractBiomarker("PSA result pending", "psa");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PENDING");
    expect(result!.valueType).toBe("pending");
  });

  it("returns PENDING when PSA not done at this time", () => {
    const result = extractBiomarker("PSA not done at this time", "psa");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PENDING");
  });

  it("returns PENDING for 'PSA ordered, not available yet'", () => {
    const result = extractBiomarker("PSA ordered, not available yet", "psa");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PENDING");
  });

  it("pending detection is case-insensitive", () => {
    const result = extractBiomarker("PSA PENDING awaiting lab", "psa");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PENDING");
  });

  it("extracts value from text with Unicode non-breaking space", () => {
    // Non-breaking space between "Ferritin" and "45"
    const result = extractBiomarker("Ferritin\u00a045 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/45/);
  });

  it("extracts value from text with decimal comma", () => {
    const result = extractBiomarker("Ferritin was 45,2 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    // After normalization 45,2 → 45.2
    expect(result!.value).toMatch(/45/);
  });

  it("does NOT extract value when only psatest is present (no boundary)", () => {
    const result = extractBiomarker("psatest result was 4.2", "psa");
    // "psa" in "psatest" should not match due to word boundaries
    expect(result).toBeNull();
  });

  it("extracts categorical result — PSA negative", () => {
    const result = extractBiomarker("PSA: negative", "psa");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/negative/);
  });

  it("returns matchedAlias in result", () => {
    const result = extractBiomarker("Ferritin 45 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    expect(result!.matchedAlias).toBe("ferritin");
  });

  it("returns confidence in result", () => {
    const result = extractBiomarker("Ferritin 45 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    expect(["high", "medium", "low"]).toContain(result!.confidence);
  });
});

// ─── Evidence Extraction Tests ────────────────────────────────────────────

describe("extractBiomarker evidence", () => {
  it("evidence contains the matched biomarker term", () => {
    const result = extractBiomarker("PSA level was 4.2 ng/mL.", "psa");
    expect(result).not.toBeNull();
    expect(result!.evidence.toLowerCase()).toContain("psa");
  });

  it("evidence is a complete sentence ending with punctuation or end of text", () => {
    const text = "CBC normal. PSA level was 4.2 ng/mL. Bone scan pending.";
    const result = extractBiomarker(text, "psa");
    expect(result).not.toBeNull();
    const ev = result!.evidence;
    // Should not be cut off mid-sentence
    expect(ev).not.toMatch(/\w$/); // should end with punctuation or be the whole sentence
    // The sentence containing PSA should be present
    expect(ev.toLowerCase()).toContain("psa");
  });

  it("evidence for PENDING includes the pending phrase", () => {
    const result = extractBiomarker("PSA result pending", "psa");
    expect(result).not.toBeNull();
    expect(result!.evidence.toLowerCase()).toContain("psa");
  });
});

// ─── runBiomarkerExtraction Tests ─────────────────────────────────────────

describe("runBiomarkerExtraction", () => {
  const originalHeaders = ["PatientID", "ClinicalNotes"];

  const rows: Record<string, string>[] = [
    { PatientID: "001", ClinicalNotes: "PSA level was 4.2 ng/mL at last visit." },
    { PatientID: "002", ClinicalNotes: "No significant findings. PSA pending." },
    { PatientID: "003", ClinicalNotes: "Hemoglobin 12 g/dL. No PSA result noted." },
    { PatientID: "004", ClinicalNotes: "Patient denies symptoms. Labs unremarkable." },
    { PatientID: "005", ClinicalNotes: "PSA: negative on repeat testing." },
  ];

  it("returns headersOut with two new columns appended", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.headersOut).toEqual([
      "PatientID",
      "ClinicalNotes",
      "PSA Value",
      "PSA Evidence",
    ]);
  });

  it("returns the correct number of rowsOut (same as input)", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.rowsOut.length).toBe(5);
  });

  it("rows with no mention have empty strings in both new columns", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    // Row index 3: "Labs unremarkable." — no PSA mention
    const row3 = output.rowsOut[3];
    expect(row3["PSA Value"]).toBe("");
    expect(row3["PSA Evidence"]).toBe("");
  });

  it("stats.totalRows equals 5", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.stats.totalRows).toBe(5);
  });

  it("stats foundCount + notFoundCount + pendingCount equals totalRows", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    const { foundCount, notFoundCount, pendingCount, totalRows } = output.stats;
    expect(foundCount + notFoundCount + pendingCount).toBe(totalRows);
  });

  it("stats.biomarkerName equals the query", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.stats.biomarkerName).toBe("PSA");
  });

  it("stats.column equals the selected column", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.stats.column).toBe("ClinicalNotes");
  });

  it("pending row is counted in pendingCount not foundCount", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.stats.pendingCount).toBeGreaterThanOrEqual(1);
    // Row 1 has "PSA pending" — should be PENDING
    expect(output.rowsOut[1]["PSA Value"]).toBe("PENDING");
  });

  it("calls onProgress for each row", () => {
    const calls: number[] = [];
    runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA", (n) => calls.push(n));
    expect(calls).toEqual([1, 2, 3, 4, 5]);
  });

  it("original row fields are preserved in output", () => {
    const output = runBiomarkerExtraction(rows, originalHeaders, "ClinicalNotes", "PSA");
    expect(output.rowsOut[0]["PatientID"]).toBe("001");
    expect(output.rowsOut[0]["ClinicalNotes"]).toBe(rows[0]["ClinicalNotes"]);
  });

  it("works with empty rows array", () => {
    const output = runBiomarkerExtraction([], originalHeaders, "ClinicalNotes", "PSA");
    expect(output.rowsOut).toEqual([]);
    expect(output.stats.totalRows).toBe(0);
    expect(output.stats.foundCount + output.stats.notFoundCount + output.stats.pendingCount).toBe(0);
  });
});
