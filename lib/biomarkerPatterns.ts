/**
 * BioExtract — Biomarker Pattern Library
 *
 * Pre-defined extraction patterns for 18+ clinical biomarkers.
 * Each BiomarkerPattern defines:
 *   - aliases: all recognized surface forms (longest first, lowercase)
 *   - valuePatterns: ordered regex patterns; first match wins
 *   - contextWindowChars: chars to extract around each mention
 *   - tieBreaking: what to do when biomarker appears multiple times
 *   - pendingPhrases: detect "PSA pending" → return "PENDING"
 */

import type { BiomarkerValueType } from "./types";

export type TieBreakingStrategy = "first" | "last" | "highest" | "lowest" | "all" | "contextual";

export interface ValueCapturePattern {
  pattern: RegExp;
  context: string;
  valueType: BiomarkerValueType;
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
  /**
   * Map of implicit clinical phrases → extracted value.
   * Checked BEFORE valuePatterns in Phase 4.
   * e.g. { "undetectable": "< 0.1 ng/mL", "normal": "< 4.0 ng/mL" }
   */
  implicitValues?: Record<string, string>;
}

// ─── Pattern Library ──────────────────────────────────────────────────────

export const BIOMARKER_PATTERNS: BiomarkerPattern[] = [

  // ── PSA (Prostate-Specific Antigen) ─────────────────────────────────────
  {
    name: "PSA",
    aliases: [
      "prostate specific antigen",
      "prostate-specific antigen",
      "psa density",
      "psa velocity",
      "free psa",
      "total psa",
      "psa",
    ],
    tieBreaking: "last",
    comparisonStrategy: "both",
    contextWindowChars: 250,
    pendingPhrases: ["pending", "ordered", "not available", "not done", "to follow", "awaited"],
    implicitValues: {
      "undetectable":           "< 0.1 ng/mL",
      "undetected":             "< 0.1 ng/mL",
      "below detection":        "< 0.1 ng/mL",
      "below the limit":        "< 0.1 ng/mL",
      "suppressed":             "< 0.1 ng/mL",
      "within normal limits":   "< 4.0 ng/mL",
      "within normal range":    "< 4.0 ng/mL",
      "normal":                 "< 4.0 ng/mL",
      "elevated":               "> 4.0 ng/mL",
      "high":                   "> 4.0 ng/mL",
      "significantly elevated": "> 10.0 ng/mL",
    },
    valuePatterns: [
      {
        // "PSA decreased from 8.4 to 0.2 ng/mL"
        pattern: /(?:decreased?|increased?|changed?|rose?|fell?|drop(?:ped)?|from)\s+(\d+(?:\.\d+)?\s*(?:ng\/ml|ng\/dl|u\/l|miu\/l)?[\s\S]{0,20}?to\s+\d+(?:\.\d+)?\s*(?:ng\/ml|ng\/dl|u\/l|miu\/l)?)/i,
        context: "comparison: from X to Y",
        valueType: "comparison",
        transform: (raw) => raw.trim().replace(/\s+/g, " "),
      },
      {
        // "PSA undetectable", "PSA <0.1"
        pattern: /(undetectable|below\s+(?:detection|threshold)|<\s*0\.\d+)\s*(?:ng\/ml|ng\/dl)?/i,
        context: "undetectable / below limit",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // "PSA 3.2-5.0 ng/mL" or "PSA 3.2–5.0"
        pattern: /psa[\s:=]*(?:was|is|of|at|level|value|result|measured|:)?\s*:?\s*(\d+(?:\.\d+)?\s*[-\u2013]\s*\d+(?:\.\d+)?\s*(?:ng\/ml|ng\/dl|u\/l)?)/i,
        context: "range value",
        valueType: "range",
        transform: (raw) => raw.trim(),
      },
      {
        // "PSA 4.2 ng/mL", "PSA: 4.2", "PSA was 4.2", "PSA level was 4.2", "PSA = 12.4 ng/mL"
        // Also matches alias forms like "prostate specific antigen 6.8"
        pattern: /(?:psa|prostate[\s-]specific\s+antigen|prostate\s+specific\s+antigen)[\s\S]{0,30}?(\d+(?:\.\d+)?\s*(?:ng\/ml|ng\/dl|u\/l|miu\/l)?)/i,
        context: "numeric value",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // "PSA: negative" — rare but valid clinical shorthand
        pattern: /psa[\s:=]*(?:is|was|:)?\s*(negative|positive|equivocal)/i,
        context: "PSA categorical",
        valueType: "categorical",
        transform: (raw) => raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase(),
      },
    ],
  },

  // ── PiRADS / PI-RADS ─────────────────────────────────────────────────────
  {
    name: "PiRADS",
    aliases: [
      "prostate imaging reporting and data system",
      "prostate imaging-reporting",
      "pi-rads",
      "pirads",
      "pi rads",
    ],
    tieBreaking: "highest",
    contextWindowChars: 200,
    pendingPhrases: ["not assigned", "indeterminate", "pending"],
    valuePatterns: [
      {
        // "PI-RADS v2.1 score: 4", "PIRADS 5", "PI-RADS category 3"
        pattern: /pi[-\s]?rads(?:\s+v\d+(?:\.\d+)?)?[\s:=]*(?:score|category|assessment|lesion)?[\s:=]*([1-5])\b/i,
        context: "PiRADS score 1-5",
        valueType: "composite",
        transform: (raw) => `PiRADS ${raw.trim()}`,
      },
    ],
  },

  // ── TNM Staging ──────────────────────────────────────────────────────────
  {
    name: "TNM",
    aliases: [
      "tnm staging",
      "tnm classification",
      "pathologic staging",
      "clinical staging",
      "tnm stage",
      "tnm",
    ],
    tieBreaking: "last",
    contextWindowChars: 300,
    pendingPhrases: ["not staged", "staging pending", "to be staged", "pending"],
    valuePatterns: [
      {
        // "ypT1N0M0", "pT2N1M1", "cT3N2M0" — full TNM with prefix
        pattern: /([ycra]?p?[tT][0-4x][a-d]?\s*[nN][0-3x][a-c]?\s*[mM][01x][a-b]?(?:\s*[rR][01])?(?:\s*[vV][01])?(?:\s*[lL][01])?(?:\s*[pP][nN][01])?)/,
        context: "full TNM code",
        valueType: "composite",
        transform: (raw) => raw.trim().replace(/\s+/g, ""),
      },
      {
        // "T2 N0 M0" with spaces
        pattern: /\b([tT][0-4x][a-d]?\s+[nN][0-3x][a-c]?\s+[mM][01x][a-b]?)\b/,
        context: "TNM with spaces",
        valueType: "composite",
        transform: (raw) => raw.trim().replace(/\s+/g, ""),
      },
      {
        // T-category alone when full TNM not available
        pattern: /\b([ycra]?p?[tT][0-4x][a-d]?)\b/,
        context: "T-category alone",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── Gleason Score ────────────────────────────────────────────────────────
  {
    name: "Gleason",
    aliases: [
      "gleason score",
      "gleason grade",
      "gleason sum",
      "gleason grading",
      "gleason",
    ],
    tieBreaking: "highest",
    contextWindowChars: 250,
    pendingPhrases: ["not graded", "awaiting pathology", "pending"],
    valuePatterns: [
      {
        // "Gleason 3+4=7", "Gleason score 4+3 = 7"
        pattern: /gleason[\s\S]{0,30}?(\d\s*\+\s*\d\s*=\s*\d+)/i,
        context: "Gleason components 3+4=7",
        valueType: "composite",
        transform: (raw) => raw.trim().replace(/\s/g, ""),
      },
      {
        // "Grade Group 2", "GGG 3", "Gleason Grade Group 4"
        pattern: /(?:gleason\s+)?grade\s+group\s+([1-5])\b/i,
        context: "Grade Group 1-5",
        valueType: "composite",
        transform: (raw) => `Grade Group ${raw.trim()}`,
      },
      {
        // "Gleason 7", "Gleason sum 8", "Gleason score 9"
        pattern: /gleason[\s\S]{0,20}?(?:sum|score|total|grade)?\s+([4-9]|10)\b/i,
        context: "Gleason sum score",
        valueType: "numeric",
        transform: (raw) => `Gleason ${raw.trim()}`,
      },
    ],
  },

  // ── Ki-67 ────────────────────────────────────────────────────────────────
  {
    name: "Ki-67",
    aliases: [
      "proliferative index",
      "proliferation index",
      "mib-1",
      "mib1",
      "ki-67",
      "ki67",
      "ki 67",
    ],
    tieBreaking: "highest",
    contextWindowChars: 200,
    pendingPhrases: ["not available", "not performed", "pending"],
    implicitValues: {
      "low":          "< 14%",
      "low grade":    "< 14%",
      "intermediate": "14-30%",
      "high":         "> 30%",
      "high grade":   "> 30%",
      "elevated":     "> 30%",
    },
    valuePatterns: [
      {
        // "Ki-67 15-25%"
        pattern: /ki[-\s]?67[\s\S]{0,30}?(\d+(?:\.\d+)?\s*[-\u2013]\s*\d+(?:\.\d+)?\s*%)/i,
        context: "Ki-67 percentage range",
        valueType: "range",
        transform: (raw) => raw.trim(),
      },
      {
        // "Ki-67 23%", "Ki-67 index: 45%"
        pattern: /ki[-\s]?67[\s\S]{0,30}?(\d+(?:\.\d+)?\s*%)/i,
        context: "Ki-67 percentage",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // "Ki-67: high", "Ki-67 low"
        pattern: /ki[-\s]?67[\s\S]{0,20}?(?:is|was|:)?\s*(low|intermediate|high|elevated|increased)\b/i,
        context: "categorical Ki-67",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── ER Status ────────────────────────────────────────────────────────────
  {
    name: "ER",
    aliases: [
      "estrogen receptor",
      "oestrogen receptor",
      "er status",
      "er",
    ],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["not done", "not performed", "pending"],
    implicitValues: {
      "strongly positive": "Positive (strong)",
      "weakly positive":   "Positive (weak)",
      "focally positive":  "Positive (focal)",
    },
    valuePatterns: [
      {
        // "ER: 90%, score 6/8 (Allred)"
        pattern: /\ber\b[\s\S]{0,40}?(\d+(?:\.\d+)?\s*%)/i,
        context: "ER percentage",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // "ER: positive", "ER negative", "ER+"
        pattern: /\ber\b[\s:=]*(?:is|was|:)?\s*(positive|negative|equivocal|\+|-|pos\b|neg\b)/i,
        context: "ER status",
        valueType: "categorical",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          if (r === "+" || r === "pos") return "Positive";
          if (r === "-" || r === "neg") return "Negative";
          return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
        },
      },
    ],
  },

  // ── PR Status ────────────────────────────────────────────────────────────
  {
    name: "PR",
    aliases: [
      "progesterone receptor",
      "pr status",
      "pgr",
      "pr",
    ],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["not done", "not performed", "pending"],
    valuePatterns: [
      {
        pattern: /\bpr\b[\s\S]{0,40}?(\d+(?:\.\d+)?\s*%)/i,
        context: "PR percentage",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: /\bpr\b[\s:=]*(?:is|was|:)?\s*(positive|negative|equivocal|\+|-|pos\b|neg\b)/i,
        context: "PR status",
        valueType: "categorical",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          if (r === "+" || r === "pos") return "Positive";
          if (r === "-" || r === "neg") return "Negative";
          return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
        },
      },
    ],
  },

  // ── HER2 Status ──────────────────────────────────────────────────────────
  {
    name: "HER2",
    aliases: [
      "her2/neu",
      "c-erb b-2",
      "cerbb2",
      "erbb2",
      "her2 status",
      "her2 neu",
      "her2",
    ],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["fish pending", "not performed", "pending"],
    implicitValues: {
      "overexpressed":     "Positive (overexpressed)",
      "not overexpressed": "Negative",
      "amplified":         "Positive (amplified)",
      "not amplified":     "Negative (not amplified)",
    },
    valuePatterns: [
      {
        // "HER2 3+" or "HER2 score 2+"
        pattern: /her2[\s\S]{0,30}?([0-3]\+)/i,
        context: "HER2 IHC score 0/1+/2+/3+",
        valueType: "composite",
        transform: (raw) => `HER2 ${raw.trim()}`,
      },
      {
        // "FISH ratio 2.3"
        pattern: /(?:fish|ish)\s+(?:ratio|result)[\s:=]*(\d+(?:\.\d+)?)/i,
        context: "HER2 FISH ratio",
        valueType: "numeric",
        transform: (raw) => `FISH ratio ${raw.trim()}`,
      },
      {
        // "HER2 positive", "HER2 amplified"
        pattern: /her2[\s\S]{0,30}?(positive|negative|equivocal|amplified|not\s+amplified|\+|-)/i,
        context: "HER2 categorical status",
        valueType: "categorical",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          if (r === "+") return "Positive";
          if (r === "-") return "Negative";
          return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
        },
      },
    ],
  },

  // ── BRCA1 ────────────────────────────────────────────────────────────────
  {
    name: "BRCA1",
    aliases: [
      "breast cancer gene 1",
      "brca1 mutation",
      "brca 1",
      "brca1",
    ],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["pending", "ordered", "sent out", "results pending"],
    valuePatterns: [
      {
        // Specific variant: "BRCA1 c.5266dupC"
        pattern: /brca\s*1[\s\S]{0,30}?(c\.\d+[a-z>_\-]+(?:\s*\(p\.[a-z0-9*]+\))?)/i,
        context: "BRCA1 specific variant",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        // "BRCA1: pathogenic variant detected"
        pattern: /brca\s*1[\s\S]{0,50}?(pathogenic\s+variant|likely\s+pathogenic|variant\s+of\s+uncertain\s+significance|vus|benign\s+variant|mutation\s+detected|mutation\s+not\s+detected|not\s+detected|detected|negative|positive)/i,
        context: "BRCA1 variant classification",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── BRCA2 ────────────────────────────────────────────────────────────────
  {
    name: "BRCA2",
    aliases: [
      "breast cancer gene 2",
      "brca2 mutation",
      "brca 2",
      "brca2",
    ],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["pending", "ordered", "sent out", "results pending"],
    implicitValues: {
      "wild type":    "Not detected",
      "wild-type":    "Not detected",
      "germline":     "Germline mutation detected",
      "no mutation":  "Not detected",
    },
    valuePatterns: [
      {
        pattern: /brca\s*2[\s\S]{0,30}?(c\.\d+[a-z>_\-]+(?:\s*\(p\.[a-z0-9*]+\))?)/i,
        context: "BRCA2 specific variant",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: /brca\s*2[\s\S]{0,50}?(pathogenic\s+variant|likely\s+pathogenic|variant\s+of\s+uncertain\s+significance|vus|benign\s+variant|mutation\s+detected|mutation\s+not\s+detected|not\s+detected|detected|negative|positive)/i,
        context: "BRCA2 variant classification",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── MSI / MMR ────────────────────────────────────────────────────────────
  {
    name: "MSI",
    aliases: [
      "microsatellite instability",
      "microsatellite status",
      "mismatch repair",
      "mmr status",
      "mmr",
      "msi status",
      "msi",
      "mss",
      "mlh1",
      "msh2",
      "msh6",
      "pms2",
    ],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["not performed", "not tested", "pending"],
    implicitValues: {
      "intact":          "pMMR (proficient)",
      "proficient":      "pMMR (proficient)",
      "deficient":       "dMMR (deficient)",
      "unstable":        "MSI-H",
      "stable":          "MSS",
    },
    valuePatterns: [
      {
        // "MSI-H", "MSI-L", "MSI high", "MSI unstable"
        pattern: /msi[-\s]?(high|low|stable|unstable|h\b|l\b|s\b)/i,
        context: "MSI classification with qualifier",
        valueType: "categorical",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          const map: Record<string, string> = {
            high: "MSI-H", h: "MSI-H",
            low: "MSI-L", l: "MSI-L",
            stable: "MSS", s: "MSS",
            unstable: "MSI-H",
          };
          return map[r] ?? raw.trim().toUpperCase();
        },
      },
      {
        // "MSS" standalone (microsatellite stable)
        pattern: /\b(mss)\b/i,
        context: "MSS standalone",
        valueType: "categorical",
        transform: () => "MSS",
      },
      {
        // "MMR deficient", "dMMR", "pMMR"
        pattern: /(?:d|p)?mmr[\s\S]{0,30}?(deficient|proficient|intact|deficiency)/i,
        context: "MMR status",
        valueType: "categorical",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          if (/defici/.test(r)) return "dMMR";
          if (/profici|intact/.test(r)) return "pMMR";
          return raw.trim();
        },
      },
      {
        // "MLH1 absent", "PMS2 loss"
        pattern: /(mlh1|msh2|msh6|pms2)[\s\S]{0,20}?(absent|loss|retained|intact|lost|deficient)/i,
        context: "MMR protein IHC",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── PD-L1 ────────────────────────────────────────────────────────────────
  {
    name: "PD-L1",
    aliases: [
      "programmed death ligand 1",
      "programmed death-ligand 1",
      "pd-l1",
      "pdl1",
      "pd l1",
    ],
    tieBreaking: "highest",
    contextWindowChars: 250,
    pendingPhrases: ["not performed", "not tested", "pending"],
    implicitValues: {
      "no expression":  "TPS 0%",
      "absent":         "TPS 0%",
      "high":           "> 50% TPS",
      "low":            "1-49% TPS",
    },
    valuePatterns: [
      {
        // "TPS 50%", "PD-L1 TPS: 1%"
        pattern: /(?:pd[-\s]?l1[\s\S]{0,20}?)?(?:tps|tumor\s+proportion\s+score)[\s:=]*(\d+(?:\.\d+)?\s*%?)/i,
        context: "TPS score",
        valueType: "numeric",
        transform: (raw) => `TPS ${raw.trim()}%`.replace(/%%$/, "%"),
      },
      {
        // "CPS 12", "PD-L1 CPS: 8"
        pattern: /(?:pd[-\s]?l1[\s\S]{0,20}?)?(?:cps|combined\s+positive\s+score)[\s:=]*(\d+(?:\.\d+)?)/i,
        context: "CPS score",
        valueType: "numeric",
        transform: (raw) => `CPS ${raw.trim()}`,
      },
      {
        // "PD-L1 expression 5%"
        pattern: /pd[-\s]?l1[\s\S]{0,30}?(?:expression|staining|positivity|:)?\s*:?\s*(\d+(?:\.\d+)?\s*%)/i,
        context: "PD-L1 percentage",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // "PD-L1 positive", "PD-L1 negative"
        pattern: /pd[-\s]?l1[\s\S]{0,40}?(positive|negative|high|low|equivocal)/i,
        context: "PD-L1 categorical",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── KRAS ─────────────────────────────────────────────────────────────────
  {
    name: "KRAS",
    aliases: ["k-ras", "ki-ras", "kras"],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["not tested", "pending", "ordered"],
    valuePatterns: [
      {
        // "KRAS G12C mutation", "KRAS p.G12D"
        pattern: /kras[\s\S]{0,40}?(g12[a-z]|g13[a-z]|q61[a-z]|a146[a-z]|p\.[a-z]\d+[a-z_>]+|codon\s+\d+)/i,
        context: "KRAS specific mutation",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: /kras[\s\S]{0,30}?(wild[-\s]?type|wt\b|mutant|mutation\s+(?:detected|not\s+detected)|not\s+mutated|mutated|positive|negative)/i,
        context: "KRAS mutation status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── BRAF ─────────────────────────────────────────────────────────────────
  {
    name: "BRAF",
    aliases: ["b-raf", "braf"],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["not tested", "pending"],
    valuePatterns: [
      {
        // "BRAF V600E mutation"
        pattern: /braf[\s\S]{0,40}?(v600[ekdgr]?|p\.v600[ekdgr]?|exon\s+15\s+mutation)/i,
        context: "BRAF V600 mutation",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: /braf[\s\S]{0,30}?(wild[-\s]?type|wt\b|mutant|mutation\s+(?:detected|not\s+detected)|not\s+mutated|mutated|positive|negative)/i,
        context: "BRAF mutation status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── EGFR ─────────────────────────────────────────────────────────────────
  {
    name: "EGFR",
    aliases: [
      "epidermal growth factor receptor",
      "egfr mutation",
      "her1",
      "egfr",
    ],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["not tested", "pending"],
    valuePatterns: [
      {
        // "EGFR exon 19 deletion", "EGFR L858R"
        pattern: /egfr[\s\S]{0,50}?(exon\s+\d+\s+(?:deletion|insertion|mutation)|l858r|t790m|c797s|g719[ax]|s768i|l861q|p\.[a-z]\d+[a-z_>]+)/i,
        context: "EGFR specific mutation",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        // "EGFR copy number 8"
        pattern: /egfr[\s\S]{0,30}?copy\s+(?:number|gain)[\s:=]*(\d+(?:\.\d+)?(?:\s*copies)?)/i,
        context: "EGFR copy number",
        valueType: "numeric",
        transform: (raw) => `CN ${raw.trim()}`,
      },
      {
        pattern: /egfr[\s\S]{0,30}?(wild[-\s]?type|wt\b|mutant|mutation\s+(?:detected|not\s+detected)|amplified|not\s+amplified|positive|negative)/i,
        context: "EGFR mutation status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── ALK ──────────────────────────────────────────────────────────────────
  {
    name: "ALK",
    aliases: [
      "anaplastic lymphoma kinase",
      "alk rearrangement",
      "alk fusion",
      "alk",
    ],
    tieBreaking: "first",
    contextWindowChars: 250,
    pendingPhrases: ["not tested", "fish pending", "pending"],
    valuePatterns: [
      {
        // "EML4-ALK fusion"
        pattern: /([a-z0-9]+[-\u2013]alk)\s+fusion/i,
        context: "ALK fusion partner",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        pattern: /alk[\s\S]{0,40}?(positive|negative|rearranged|rearrangement\s+(?:detected|not\s+detected)|amplified|translocation\s+(?:detected|not\s+detected))/i,
        context: "ALK status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── Tumor Grade ──────────────────────────────────────────────────────────
  {
    name: "Tumor Grade",
    aliases: [
      "histological grade",
      "histologic grade",
      "nuclear grade",
      "who grade",
      "fnclcc grade",
      "tumor grade",
      "tumour grade",
      "grade",
    ],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["to be graded", "pending"],
    valuePatterns: [
      {
        // "WHO Grade II", "Grade 3", "nuclear grade 2"
        pattern: /(?:who\s+)?(?:tumor|tumour|histologic(?:al)?|nuclear|fnclcc)?\s*grade[\s:=]*([1-4]|i{1,3}v?|iv)\b/i,
        context: "numeric or Roman numeral grade",
        valueType: "composite",
        transform: (raw) => `Grade ${raw.trim().toUpperCase()}`,
      },
      {
        // "high grade", "low grade", "intermediate grade"
        pattern: /(\b(?:low|intermediate|high)\s*[-\s]?grade\b)/i,
        context: "grade category",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
      {
        // "well differentiated", "poorly differentiated"
        pattern: /((?:well|moderately|poorly|undifferentiated)\s+differentiated)/i,
        context: "differentiation level",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
    ],
  },

  // ── Tumor Stage (AJCC) ───────────────────────────────────────────────────
  {
    name: "Tumor Stage",
    aliases: [
      "ajcc stage",
      "pathologic stage",
      "pathological stage",
      "clinical stage",
      "overall stage",
      "tumor stage",
      "tumour stage",
      "stage",
    ],
    tieBreaking: "last",
    contextWindowChars: 200,
    pendingPhrases: ["staging pending", "to be staged", "pending"],
    valuePatterns: [
      {
        // "Stage IIB", "AJCC Stage III"
        pattern: /(?:ajcc\s+)?(?:p|c)?stage[\s:=]*([iv]{1,4}[a-c]?)\b/i,
        context: "AJCC stage Roman numeral",
        valueType: "composite",
        transform: (raw) => `Stage ${raw.trim().toUpperCase()}`,
      },
      {
        // "Stage 2A", "Stage 4"
        pattern: /(?:ajcc\s+)?stage[\s:=]*([1-4][a-c]?)\b/i,
        context: "AJCC stage numeric",
        valueType: "composite",
        transform: (raw) => `Stage ${raw.trim()}`,
      },
    ],
  },

  // ── PI-QUAL ──────────────────────────────────────────────────────────────
  {
    name: "PI-QUAL",
    aliases: [
      "prostate imaging quality",
      "pi-qual",
      "piqual",
      "pi qual",
    ],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["not assigned", "pending"],
    valuePatterns: [
      {
        pattern: /pi[-\s]?qual[\s:=]*([1-5])\b/i,
        context: "PI-QUAL score 1-5",
        valueType: "composite",
        transform: (raw) => `PI-QUAL ${raw.trim()}`,
      },
    ],
  },

  // ── BI-RADS ──────────────────────────────────────────────────────────────
  {
    name: "BIRADS",
    aliases: [
      "breast imaging reporting and data system",
      "acr bi-rads",
      "bi-rads",
      "birads",
      "bi rads",
    ],
    tieBreaking: "highest",
    contextWindowChars: 200,
    pendingPhrases: ["not assigned", "incomplete", "pending"],
    valuePatterns: [
      {
        // "BI-RADS 4A", "BIRADS category 3"
        pattern: /bi[-\s]?rads[\s:=]*(?:category\s*)?([0-6][abc]?)\b/i,
        context: "BI-RADS category 0-6",
        valueType: "composite",
        transform: (raw) => `BI-RADS ${raw.trim()}`,
      },
    ],
  },

];

// ─── Pattern Lookup & Fallback ────────────────────────────────────────────

/**
 * Look up a biomarker pattern by name or alias (case-insensitive).
 * Returns null if not found — caller should use buildFallbackPattern().
 */
export function getBiomarkerPattern(query: string): BiomarkerPattern | null {
  const normalized = query.toLowerCase().trim()
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\t]/g, " ")
    .replace(/ {2,}/g, " ");

  return BIOMARKER_PATTERNS.find(
    (p) =>
      p.name.toLowerCase() === normalized ||
      p.aliases.some((a) => a === normalized)
  ) ?? null;
}

/**
 * Build a dynamic fallback pattern for an unknown biomarker.
 * Generates 6 general-purpose patterns tried in order:
 *   1. Comparison / threshold  (< 0.1, > 4.0, less than X)
 *   2. Ratio / fraction        (3/10 cores)
 *   3. Negation detection      (not detected, negative for X, wild-type)
 *   4. Numeric + unit          (4.2 ng/mL)
 *   5. Categorical status      (positive, negative, detected…)
 *   6. Bare numeric            (last resort)
 */
export function buildFallbackPattern(biomarkerName: string): BiomarkerPattern {
  const nameLower = biomarkerName.toLowerCase().trim();
  const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const units = "ng\\/ml|ng\\/dl|ug\\/l|%|u\\/l|iu\\/l|g\\/dl|mmol\\/l|pmol\\/l|mm|cm|miu\\/l|copies\\/ml";

  return {
    name: biomarkerName,
    aliases: [nameLower],
    tieBreaking: "first",
    contextWindowChars: 200,
    pendingPhrases: ["pending", "not done", "not performed", "ordered", "not available", "to follow"],
    valuePatterns: [
      {
        // 1. Comparison: "< 0.1 ng/mL", "> 4.0", "less than 5", "greater than 10"
        pattern: new RegExp(
          escaped + "[\\s\\S]{0,50}?((?:less\\s+than|below|under|<\\s*)\\d+(?:\\.\\d+)?\\s*(?:" + units + ")?|(?:greater\\s+than|above|over|>\\s*)\\d+(?:\\.\\d+)?\\s*(?:" + units + ")?)",
          "i"
        ),
        context: "comparison threshold",
        valueType: "comparison",
        transform: (raw) => {
          const r = raw.trim().toLowerCase();
          const ltMatch = /^(?:less\s+than|below|under)\s*(.+)/.exec(r);
          const gtMatch = /^(?:greater\s+than|above|over)\s*(.+)/.exec(r);
          if (ltMatch) return `< ${ltMatch[1].trim()}`;
          if (gtMatch) return `> ${gtMatch[1].trim()}`;
          return raw.trim();
        },
      },
      {
        // 2. Ratio / fraction: "3/10 cores", "2 of 12"
        pattern: new RegExp(
          escaped + "[\\s\\S]{0,50}?(\\d+\\s*\\/\\s*\\d+(?:\\s+(?:cores|cells|fields|samples|specimens|lymph\\s+nodes))?)",
          "i"
        ),
        context: "ratio or fraction",
        valueType: "composite",
        transform: (raw) => raw.trim(),
      },
      {
        // 3. Negation: "not detected", "negative for X", "wild-type", "no X identified"
        pattern: new RegExp(
          "(not\\s+detected|negative\\s+for\\s+" + escaped + "|no\\s+" + escaped + "\\s+(?:identified|detected|found|seen)|wild[-\\s]?type|absent|no\\s+mutation\\s+(?:detected|identified|found))",
          "i"
        ),
        context: "negation / not detected",
        valueType: "categorical",
        transform: () => "Not detected",
      },
      {
        // 4. Numeric + unit
        pattern: new RegExp(
          escaped + "[\\s\\S]{0,60}?(\\d+(?:\\.\\d+)?\\s*(?:" + units + ")?)",
          "i"
        ),
        context: "numeric value with optional unit",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
      {
        // 5. Categorical status
        pattern: new RegExp(
          escaped + "[\\s\\S]{0,50}?(positive|negative|detected|not\\s+detected|mutated|wild[-\\s]?type|amplified|not\\s+amplified|high|low|equivocal|absent|present|elevated|normal)",
          "i"
        ),
        context: "categorical status",
        valueType: "categorical",
        transform: (raw) => raw.trim(),
      },
      {
        // 6. Bare numeric (last resort)
        pattern: new RegExp(
          escaped + "[\\s:=]*(?:of|is|was|at|level|score|value|result|measured|:)?\\s*:?\\s*(\\d+(?:\\.\\d+)?)",
          "i"
        ),
        context: "bare numeric",
        valueType: "numeric",
        transform: (raw) => raw.trim(),
      },
    ],
  };
}
