/**
 * BioExtract Biomarker Pattern Library
 * PLACEHOLDER — full implementation in Phase 3
 */

export type TieBreakingStrategy = "first" | "last" | "highest" | "lowest" | "all";

export interface ValueCapturePattern {
  pattern: RegExp;
  context: string;
  valueType: import("./types").BiomarkerValueType;
  transform?: (raw: string) => string;
}

export interface BiomarkerPattern {
  name: string;
  aliases: string[];
  valuePatterns: ValueCapturePattern[];
  contextWindowChars: number;
  tieBreaking: TieBreakingStrategy;
  comparisonStrategy?: "latest" | "both";
  pendingPhrases: string[];
}

/**
 * Look up a biomarker pattern by name or alias.
 * Returns null if not found (will use fallback).
 */
export function getBiomarkerPattern(query: string): BiomarkerPattern | null {
  const normalized = query.toLowerCase().trim();
  return BIOMARKER_PATTERNS.find(
    (p) =>
      p.name.toLowerCase() === normalized ||
      p.aliases.some((a) => a === normalized)
  ) ?? null;
}

/**
 * Build a dynamic fallback pattern for an unknown biomarker.
 */
export function buildFallbackPattern(biomarkerName: string): BiomarkerPattern {
  const nameLower = biomarkerName.toLowerCase().trim();
  // Escape special regex characters
  // Escape regex special chars: . * + ? ^ $ { } ( ) | [ ] \
  const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return {
    name: biomarkerName,
    aliases: [nameLower],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["pending", "not done", "not performed", "ordered", "not available", "to follow"],
    valuePatterns: [
      {
        pattern: new RegExp(
          escapedName + "[\\s\\S]{0,60}?(\\d+(?:\\.\\d+)?\\s*(?:ng\\/ml|ng\\/dl|%|u\\/l|mm|cm|miu\\/l|copies\\/ml|iu\\/l|g\\/dl|mmol\\/l|pmol\\/l))",
          "i"
        ),
        context: "numeric value with optional unit",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: new RegExp(
          escapedName + "[\\s\\S]{0,50}?(positive|negative|detected|not\\s+detected|mutated|wild[-\\s]?type|amplified|not\\s+amplified|high|low|equivocal|absent|present)",
          "i"
        ),
        context: "categorical status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: new RegExp(
          escapedName + "[\\s:=]*(?:of|is|was|at|level|score|value|result|measured|:)?\\s*:?\\s*(\\d+(?:\\.\\d+)?)",
          "i"
        ),
        context: "bare numeric",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
    ],
  };
}

// Placeholder — will be replaced with full 18-pattern library in Phase 3
export const BIOMARKER_PATTERNS: BiomarkerPattern[] = [];
