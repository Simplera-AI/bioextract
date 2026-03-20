/**
 * Normalizes whitespace: replaces newlines, tabs, and multiple spaces
 * with a single space, then trims.
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Smart truncation for clinical report text.
 *
 * Radiology reports follow a predictable structure:
 *   HISTORY → TECHNIQUE → FINDINGS (often long) → IMPRESSION (short, critical)
 *
 * Naive `.slice(0, maxChars)` cuts off the IMPRESSION when the FINDINGS section
 * is long. This function preserves the IMPRESSION (or CONCLUSION / SUMMARY /
 * ASSESSMENT) even when it falls beyond the character budget.
 *
 * Algorithm:
 *  1. Search for a labeled section header (case-insensitive).
 *  2. If found and the section fits within `maxChars`, prepend as much of the
 *     report beginning as the remaining budget allows, then append the section.
 *  3. If the section alone exceeds `maxChars`, return the beginning of the section.
 *  4. Fallback (no labeled section): take the first 45% + last 55% of the budget,
 *     joined with "\n...\n". Impression is typically at the end.
 */
const IMPRESSION_SECTION_RE =
  /\b(impression|conclusion|summary|assessment|final\s+read|diagnosis|interpretation)\s*:/i;

export function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const SEPARATOR = "\n...\n";
  const SEP_LEN = SEPARATOR.length;

  const match = IMPRESSION_SECTION_RE.exec(text);
  if (match) {
    const sectionStart = match.index;
    const sectionText = text.slice(sectionStart);

    if (sectionText.length <= maxChars) {
      // Section fits — prepend as much of the beginning as budget allows
      const prefixBudget = maxChars - sectionText.length - SEP_LEN;
      if (prefixBudget >= 50) {
        return text.slice(0, prefixBudget).trimEnd() + SEPARATOR + sectionText;
      }
      // Budget too tight for a meaningful prefix — return section only
      return sectionText.slice(0, maxChars);
    }

    // Section alone exceeds budget — return beginning of the section
    return sectionText.slice(0, maxChars);
  }

  // No labeled section — take beginning (45%) + end (55%)
  // The Impression is typically near the end of the document.
  const tailChars = Math.floor(maxChars * 0.55);
  const headChars = maxChars - tailChars - SEP_LEN;
  if (headChars < 50) {
    // Very tight budget — just take the end
    return text.slice(text.length - maxChars);
  }
  const head = text.slice(0, headChars).trimEnd();
  const tail = text.slice(text.length - tailChars).trimStart();
  return head + SEPARATOR + tail;
}

/**
 * Extracts the full sentence containing the match at `charOffset`.
 *
 * Replaces the old fixed-window (120 char) approach. Sentence boundaries are
 * detected by scanning backward and forward from the match position for `.`,
 * `!`, or `?`. This guarantees the returned snippet always contains the
 * complete clinical clause that drove the classification decision — no
 * mid-sentence truncation, no hardcoded length limit.
 *
 * Callers pass `textLower` (already normalised via `normaliseText`) so
 * offsets are in the same coordinate space as `findAllTermHits` results.
 * `normalizeWhitespace` is still applied internally as a safety net.
 *
 * Returns empty string if `text` is empty.
 */
export function extractSnippet(
  text: string,
  charOffset: number,
  matchLen: number
): string {
  if (!text) return "";

  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  const offset = Math.max(0, Math.min(charOffset, normalized.length - 1));

  // Scan backward from the match for the previous sentence-ending punctuation.
  // The sentence starts at the character AFTER that punctuation.
  let sentStart = 0;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = normalized[i];
    if (ch === "." || ch === "!" || ch === "?") {
      sentStart = i + 1;
      // Skip any leading whitespace after the punctuation.
      while (sentStart < normalized.length && normalized[sentStart] === " ") sentStart++;
      break;
    }
  }

  // Scan forward from the end of the match for the next sentence-ending punctuation.
  // Include the punctuation character itself in the snippet.
  const matchEnd = Math.min(offset + matchLen, normalized.length);
  let sentEnd = normalized.length;
  for (let i = matchEnd; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "." || ch === "!" || ch === "?") {
      sentEnd = i + 1;
      break;
    }
  }

  return normalized.slice(sentStart, sentEnd).trim();
}
