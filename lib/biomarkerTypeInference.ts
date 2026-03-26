/**
 * BioExtract — Biomarker Type Inference
 *
 * Infers the clinical category of a biomarker from its name.
 * Used to route AI enrichment prompts to the appropriate few-shot template,
 * dramatically improving extraction accuracy for unknown biomarkers.
 *
 * Categories:
 *   molecular-gene   — Gene names expecting mutation codes, HGVS notation, fusions
 *   lab-value        — Lab measurements expecting numeric values with units
 *   ihc-marker       — IHC/pathology markers expecting scores or pos/neg status
 *   pathology-score  — Scoring systems expecting grades, scores, or stage categories
 *   generic          — Anything else (fallback)
 */

export type BiomarkerCategory =
  | "molecular-gene"
  | "lab-value"
  | "ihc-marker"
  | "pathology-score"
  | "generic";

// ─── Known term sets ─────────────────────────────────────────────────────────

/**
 * Common laboratory measurement keywords.
 * Biomarker names containing any of these words are classified as lab-value.
 */
const LAB_VALUE_KEYWORDS = new Set([
  "hemoglobin", "haemoglobin", "hematocrit", "haematocrit",
  "creatinine", "creatinin",
  "ferritin", "calcium", "albumin", "glucose", "sodium", "potassium",
  "chloride", "bicarbonate", "bilirubin", "platelet", "leukocyte",
  "lymphocyte", "neutrophil", "eosinophil", "basophil", "monocyte",
  "triglyceride", "cholesterol", "urea", "uric acid", "thyroid",
  "testosterone", "estradiol", "cortisol", "insulin", "prolactin",
  "ldh", "ldl", "hdl", "alt", "ast", "alp", "ggt", "amylase",
  "lipase", "tsh", "t3", "t4", "free t3", "free t4",
  "antigen", "level", "serum", "plasma",
  "ca-125", "ca 125", "ca-19", "ca 19", "ca-15", "ca 15",
  "afp", "cea", "hcg", "bhcg", "b-hcg",
]);

/**
 * Common IHC/immunohistochemistry marker keywords and name patterns.
 */
const IHC_KEYWORDS = new Set([
  "synaptophysin", "chromogranin", "vimentin", "desmin",
  "actin", "calretinin", "mesothelioma",
  "ttf-1", "ttf1", "napsin", "p40", "p63", "p53",
  "sox10", "s100", "hmb45", "melan-a", "melanaa",
  "myogenin", "myo", "smooth muscle",
  "ki67", "ki-67", // overlap with pathology score, but IHC label drives interpretation
  "pdl1", "pd-l1", "pd1", "pd-1",
  "e-cadherin", "ecadherin", "n-cadherin",
  "cytokeratin", "panck",
]);

/**
 * Pathology scoring / staging system keywords.
 */
const PATHOLOGY_SCORE_KEYWORDS = new Set([
  "gleason", "allred", "h-score", "hscore", "h score",
  "tps", "cps", "tap",
  "grade", "grading", "score", "staging",
  "birads", "bi-rads",
  "pirads", "pi-rads",
  "pi-qual", "piqual",
  "tnm", "tumor grade", "tumour grade",
  "nottingham",
]);

// ─── Main inference function ──────────────────────────────────────────────────

/**
 * Infer the clinical category of a biomarker from its name.
 *
 * Heuristics are applied in this priority order:
 *   1. Known IHC keyword match
 *   2. Known pathology-score keyword match
 *   3. Known lab-value keyword match
 *   4. CD/CK + digits (IHC panel marker)
 *   5. Short ALL-CAPS gene name (2–8 uppercase letters + optional digits)
 *   6. Fallback → generic
 */
export function inferBiomarkerType(query: string): BiomarkerCategory {
  const q = query.trim();
  const lower = q.toLowerCase();

  // ── 1. CD/CK panel markers (e.g. CD20, CD3, CD8, CK7, CK20, CK5/6) ───
  // Must come first — CDK12 is a gene, CD20 is IHC panel.
  if (/^c[dk]\d+(?:\/\d+)?$/i.test(q)) return "ihc-marker";

  // ── 2. Lab-value keyword match ─────────────────────────────────────────
  // Checked BEFORE the ALL-CAPS gene pattern so that short lab acronyms
  // (CEA, AFP, TSH, LDH, ALT, AST) are not mistaken for gene names.
  for (const kw of LAB_VALUE_KEYWORDS) {
    if (lower.includes(kw)) return "lab-value";
  }

  // ── 3. Pathology-score keyword match ───────────────────────────────────
  // Checked BEFORE gene pattern — short score abbreviations like TPS / CPS
  // match the ALL-CAPS gene regex but are unambiguously pathology scores.
  for (const kw of PATHOLOGY_SCORE_KEYWORDS) {
    if (lower.includes(kw)) return "pathology-score";
  }

  // ── 4. Short ALL-CAPS gene name ────────────────────────────────────────
  // Checked AFTER lab-value AND pathology-score keywords but BEFORE IHC
  // keywords so "TP53" (gene) is not swallowed by the "p53" IHC substring.
  // Matches: KRAS, FGFR3, PIK3CA, CCND1, FGF19, CDK12, ERBB2, ALK, MET, TP53
  // Does NOT match: "Ki-67" (has lowercase), "Ca-125" (has dash-number),
  //                 "S100" (letter + pure-digits only — handled below as IHC)
  if (/^[A-Z]{2,}[0-9]*[A-Z]*[0-9]*$/.test(q)) return "molecular-gene";

  // ── 5. IHC keyword match (including S100, HMB45 and multi-word names) ──
  for (const kw of IHC_KEYWORDS) {
    if (lower.includes(kw)) return "ihc-marker";
  }

  // ── 6. Fallback ────────────────────────────────────────────────────────
  return "generic";
}
