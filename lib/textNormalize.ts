/**
 * Text normalization for BioExtract.
 * Extends ClinDetect's normaliseText with clinical-specific fixes.
 */

// ─── Word-to-Number Conversion ───────────────────────────────────────────────

const ONES = [
  "zero","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
  "seventeen","eighteen","nineteen",
];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function wordToNum(word: string): number | null {
  const oi = ONES.indexOf(word);
  if (oi >= 0) return oi;
  const ti = TENS.indexOf(word);
  if (ti >= 0) return ti * 10;
  return null;
}

/**
 * Convert English word-form numbers in clinical text to digits.
 * Handles three patterns:
 *   1. "X point Y"   → X.Y   (e.g. "four point two" → "4.2")
 *   2. "forty-two"   → 42    (tens + ones compound)
 *   3. word number adjacent to a unit → digit
 *      (e.g. "five ng/mL" → "5 ng/mL")
 *
 * Operates on already-lowercased text.
 */
export function convertWordNumbers(text: string): string {
  const onesPattern = ONES.join("|");
  const tensPattern = TENS.filter(Boolean).join("|");
  const allWords    = [...ONES, ...TENS.filter(Boolean)].join("|");

  // 1. "four point two" → "4.2"
  text = text.replace(
    new RegExp(`\\b(${allWords})\\s+point\\s+(${allWords})\\b`, "g"),
    (_, intWord: string, fracWord: string) => {
      const i = wordToNum(intWord);
      const f = wordToNum(fracWord);
      return i !== null && f !== null ? `${i}.${f}` : _;
    }
  );

  // 2. "forty-two" / "forty two" → 42
  text = text.replace(
    new RegExp(`\\b(${tensPattern})[\\s-](${onesPattern})\\b`, "g"),
    (_, tens: string, ones: string) => {
      const t = wordToNum(tens);
      const o = wordToNum(ones);
      return t !== null && o !== null ? String(t + o) : _;
    }
  );

  // 3. Standalone word number followed by a clinical unit
  const unitSuffix = "(?=\\s*(?:ng\\/ml|ng\\/dl|ug\\/l|%|u\\/l|iu\\/l|g\\/dl|mmol\\/l|pmol\\/l|mm|cm|miu\\/l|copies\\/ml))";
  text = text.replace(
    new RegExp(`\\b(${allWords})\\b${unitSuffix}`, "g"),
    (match: string) => { const n = wordToNum(match); return n !== null ? String(n) : match; }
  );

  return text;
}

/**
 * Normalize clinical text for biomarker matching:
 * 1. Collapse Unicode whitespace variants (non-breaking space, em-space, thin-space, tabs) → regular space
 * 2. Normalize dashes (em-dash, en-dash, minus sign) → hyphen
 * 3. Collapse runs of spaces → single space
 * 4. Normalize decimal commas: "4,2" → "4.2" (European locale EMR exports)
 * 5. Normalize Unicode superscript/subscript digits → ASCII (from PDF copy-paste)
 * 6. Convert word-form numbers → digits
 * 7. Lowercase
 */
export function normalizeForExtraction(text: string): string {
  const step1 = text
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\t\r\n]/g, " ")  // Unicode whitespace → space
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")                       // dashes → hyphen
    .replace(/ {2,}/g, " ")                                             // collapse spaces
    .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")                         // decimal comma: 4,2 → 4.2 (not 8,000 → 8.000)
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]/g, (c) => {     // superscript digits
      const map: Record<string, string> = {
        "\u00b9": "1", "\u00b2": "2", "\u00b3": "3",
        "\u2074": "4", "\u2075": "5", "\u2076": "6",
        "\u2077": "7", "\u2078": "8", "\u2079": "9", "\u2070": "0",
      };
      return map[c] ?? c;
    })
    .toLowerCase()
    // "twenty percent" → "twenty %" so convertWordNumbers can recognise the unit
    .replace(/\bpercent(?:age)?\b/g, "%")
    // "mg/dl", "mg/l" → recognise unit variants
    .replace(/\bmg\/dl\b/g, "mg/dl")
    .replace(/\bcells\/ul\b/g, "cells/ul");

  return convertWordNumbers(step1);
}

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find all occurrences of a term in haystack (already normalized/lowercased).
 * Uses word-boundary matching for single-token terms >= 2 chars.
 * Uses plain substring for multi-word terms (spaces/hyphens imply boundaries).
 *
 * Returns array of {term, offset} for each occurrence.
 */
export function findAllMentions(
  haystack: string,
  term: string
): Array<{ term: string; offset: number }> {
  const normalized = term.toLowerCase().replace(/[\u2012\u2013\u2014\u2212]/g, "-");
  if (!haystack.includes(normalized)) return [];

  const hits: Array<{ term: string; offset: number }> = [];

  const hasWhitespaceOrHyphen = /[\s\-]/.test(normalized);
  const isShortBoundaryTerm = normalized.length === 2 && /^[a-z0-9]{2}$/.test(normalized);

  if (!hasWhitespaceOrHyphen && (normalized.length >= 3 || isShortBoundaryTerm)) {
    // Single alphanumeric token — use word boundaries
    const escaped = escapeRegex(normalized);
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      hits.push({ term: normalized, offset: m.index });
    }
  } else {
    // Multi-word phrase or single char — plain substring
    let start = 0;
    let idx: number;
    while ((idx = haystack.indexOf(normalized, start)) !== -1) {
      hits.push({ term: normalized, offset: idx });
      start = idx + normalized.length;
    }
  }

  return hits;
}
