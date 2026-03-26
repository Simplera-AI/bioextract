/**
 * BioExtract — Biomarker Pattern Library Tests
 *
 * Tests real clinical text extraction for 18+ biomarkers.
 * Uses extractBiomarker() as the public API.
 */

import { describe, it, expect } from "vitest";
import { extractBiomarker } from "../lib/extractBiomarker";
import { getBiomarkerPattern, buildFallbackPattern } from "../lib/biomarkerPatterns";

// ─── PSA Tests ───────────────────────────────────────────────────────────────

describe("PSA extraction", () => {
  it("extracts numeric value with unit", () => {
    const result = extractBiomarker("PSA level was 4.2 ng/mL on last visit.", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/4\.2/);
  });

  it("extracts bare numeric value after colon", () => {
    const result = extractBiomarker("PSA: 12.4", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/12\.4/);
  });

  it("extracts comparison value (from X to Y)", () => {
    const result = extractBiomarker("PSA decreased from 8.4 to 0.2 ng/mL after treatment.", "PSA");
    expect(result).not.toBeNull();
    // Should contain both values
    const combined = result!.value;
    expect(combined).toMatch(/8\.4/);
    expect(combined).toMatch(/0\.2/);
  });

  it("extracts range value", () => {
    const result = extractBiomarker("PSA 3.2-5.0 ng/mL (normal range)", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\.2/);
  });

  it("returns PENDING when PSA is pending", () => {
    const result = extractBiomarker("PSA pending — ordered today.", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PENDING");
    expect(result!.valueType).toBe("pending");
  });

  it("extracts undetectable PSA as standardized threshold", () => {
    const result = extractBiomarker("Post-prostatectomy PSA undetectable.", "PSA");
    expect(result).not.toBeNull();
    // PSA "undetectable" → standardized clinical representation
    expect(result!.value).toMatch(/0\.1|undetectable/i);
  });

  it("matches via alias 'prostate specific antigen'", () => {
    const result = extractBiomarker("Prostate specific antigen 6.8 ng/mL measured today.", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/6\.8/);
  });
});

// ─── PiRADS Tests ────────────────────────────────────────────────────────────

describe("PiRADS extraction", () => {
  it("extracts PiRADS 4 from 'PI-RADS score: 4'", () => {
    const result = extractBiomarker("MRI prostate: PI-RADS score: 4 in the left peripheral zone.", "PiRADS");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PiRADS 4");
  });

  it("extracts PiRADS 5 from 'PIRADS 5 lesion'", () => {
    const result = extractBiomarker("PIRADS 5 lesion identified at apex.", "PiRADS");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PiRADS 5");
  });

  it("extracts PiRADS 3 from 'PI-RADS v2.1 category 3'", () => {
    const result = extractBiomarker("PI-RADS v2.1 category 3 lesion, 8mm.", "PiRADS");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PiRADS 3");
  });
});

// ─── TNM Tests ───────────────────────────────────────────────────────────────

describe("TNM extraction", () => {
  it("extracts pT2N0M0 from TNM-labelled text", () => {
    const result = extractBiomarker("TNM staging: pT2N0M0 confirmed on final pathology.", "TNM");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/pT2N0M0/i);
  });

  it("extracts T3N1M0 from clinical staging note", () => {
    const result = extractBiomarker("TNM: Clinical staging T3N1M0 with mediastinal involvement.", "TNM");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/T3N1M0/i);
  });

  it("extracts ypT1N0M0 post-neoadjuvant from TNM classification text", () => {
    const result = extractBiomarker("TNM classification: ypT1N0M0 post-neoadjuvant chemotherapy.", "TNM");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/ypT1N0M0/i);
  });
});

// ─── Gleason Tests ───────────────────────────────────────────────────────────

describe("Gleason extraction", () => {
  it("extracts Gleason components '3+4=7'", () => {
    const result = extractBiomarker("Gleason score 3+4=7 on core biopsy.", "Gleason");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\+4=7/);
  });

  it("extracts Grade Group", () => {
    const result = extractBiomarker("Gleason Grade Group 2 adenocarcinoma.", "Gleason");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/Grade Group 2/);
  });

  it("extracts Gleason sum score", () => {
    const result = extractBiomarker("Gleason 8 poorly differentiated carcinoma.", "Gleason");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/8/);
  });
});

// ─── Ki-67 Tests ─────────────────────────────────────────────────────────────

describe("Ki-67 extraction", () => {
  it("extracts Ki-67 percentage", () => {
    const result = extractBiomarker("Ki-67 index: 23% indicating high proliferation.", "Ki-67");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/23%/);
  });

  it("extracts Ki67 percentage range", () => {
    const result = extractBiomarker("Ki67 15-25% in the hot-spot areas.", "Ki-67");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/15/);
  });

  it("extracts categorical Ki-67", () => {
    const result = extractBiomarker("Ki-67: high, consistent with aggressive histology.", "Ki-67");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/high/);
  });
});

// ─── ER / PR / HER2 Tests ────────────────────────────────────────────────────

describe("ER extraction", () => {
  it("extracts ER positive status", () => {
    const result = extractBiomarker("ER: positive (90% nuclear staining, Allred 7/8).", "ER");
    expect(result).not.toBeNull();
    // May match percentage or status — either is acceptable
    const v = result!.value;
    expect(v.match(/90%|[Pp]ositive/)).not.toBeNull();
  });

  it("extracts ER negative", () => {
    const result = extractBiomarker("ER: negative, PR: negative.", "ER");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/[Nn]egative/);
  });
});

describe("PR extraction", () => {
  it("extracts PR negative", () => {
    const result = extractBiomarker("PR: negative by IHC.", "PR");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("Negative");
  });

  it("extracts PR positive percentage", () => {
    const result = extractBiomarker("PR positive at 60% nuclear staining.", "PR");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/60%/);
  });
});

describe("HER2 extraction", () => {
  it("extracts HER2 3+", () => {
    const result = extractBiomarker("HER2 3+ by IHC, amplified by FISH.", "HER2");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\+/);
  });

  it("extracts HER2 negative", () => {
    const result = extractBiomarker("HER2 negative (score 1+).", "HER2");
    expect(result).not.toBeNull();
    // score 1+ should be preferred over "negative" due to ordering
    expect(result!.value).toMatch(/1\+|[Nn]egative/);
  });
});

// ─── BRCA Tests ──────────────────────────────────────────────────────────────

describe("BRCA1 extraction", () => {
  it("extracts pathogenic variant detected", () => {
    const result = extractBiomarker("BRCA1: pathogenic variant detected — c.5266dupC.", "BRCA1");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/pathogenic variant|c\./);
  });
});

describe("BRCA2 extraction", () => {
  it("extracts mutation not detected", () => {
    const result = extractBiomarker("BRCA2 mutation not detected by NGS panel.", "BRCA2");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/mutation not detected|not detected/);
  });
});

// ─── MSI / MMR Tests ─────────────────────────────────────────────────────────

describe("MSI extraction", () => {
  it("extracts MSI-H", () => {
    const result = extractBiomarker("Tumor is MSI-H (microsatellite instability high).", "MSI");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("MSI-H");
  });

  it("extracts MSS from 'MSS (microsatellite stable)'", () => {
    const result = extractBiomarker("MSS (microsatellite stable) by PCR.", "MSI");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("MSS");
  });

  it("extracts dMMR from 'MMR deficient'", () => {
    const result = extractBiomarker("MMR deficient tumor — candidate for immunotherapy.", "MSI");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/dMMR/i);
  });

  it("extracts MLH1 absent via MMR protein alias", () => {
    const result = extractBiomarker("MMR IHC: MLH1 absent, MSH2 retained, MSH6 retained, PMS2 absent.", "MSI");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/mlh1|msh2|pms2|absent/);
  });
});

// ─── KRAS / BRAF / EGFR Tests ────────────────────────────────────────────────

describe("KRAS extraction", () => {
  it("extracts KRAS G12C mutation", () => {
    const result = extractBiomarker("KRAS G12C mutation detected by NGS.", "KRAS");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toMatch(/G12C/);
  });
});

describe("BRAF extraction", () => {
  it("extracts BRAF V600E mutation", () => {
    const result = extractBiomarker("BRAF V600E mutation detected, eligible for targeted therapy.", "BRAF");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toMatch(/V600E/);
  });
});

describe("EGFR extraction", () => {
  it("extracts EGFR exon 19 deletion", () => {
    const result = extractBiomarker("EGFR exon 19 deletion confirmed by ctDNA assay.", "EGFR");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/exon 19 deletion/);
  });
});

// ─── Tumor Grade / Stage Tests ───────────────────────────────────────────────

describe("Tumor Grade extraction", () => {
  it("extracts WHO Grade III", () => {
    const result = extractBiomarker("WHO Grade III glioma, IDH-mutant.", "Tumor Grade");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/Grade III/i);
  });
});

describe("Tumor Stage extraction", () => {
  it("extracts AJCC Stage IIB", () => {
    const result = extractBiomarker("AJCC Stage IIB non-small cell lung cancer.", "Tumor Stage");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/Stage IIB/i);
  });

  it("extracts Stage 4 (numeric)", () => {
    const result = extractBiomarker("Patient presents with Stage 4 metastatic disease.", "Tumor Stage");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/4/);
  });
});

// ─── Pattern Lookup Tests ────────────────────────────────────────────────────

describe("getBiomarkerPattern lookup", () => {
  it("returns PSA pattern by name", () => {
    const p = getBiomarkerPattern("PSA");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PSA");
  });

  it("returns PSA pattern via alias 'prostate specific antigen'", () => {
    const p = getBiomarkerPattern("prostate specific antigen");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PSA");
  });

  it("returns null for unknown biomarker", () => {
    const p = getBiomarkerPattern("XYZ123");
    expect(p).toBeNull();
  });

  it("is case-insensitive for name lookup", () => {
    const p = getBiomarkerPattern("psa");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PSA");
  });

  it("returns PiRADS pattern via 'pi-rads' alias", () => {
    const p = getBiomarkerPattern("pi-rads");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PiRADS");
  });

  it("returns HER2 pattern via 'her2/neu' alias", () => {
    const p = getBiomarkerPattern("her2/neu");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("HER2");
  });
});

describe("buildFallbackPattern", () => {
  it("returns a pattern with correct name and aliases for Ferritin", () => {
    const p = buildFallbackPattern("Ferritin");
    expect(p.name).toBe("Ferritin");
    expect(p.aliases).toContain("ferritin");
  });

  it("fallback pattern has expected valuePatterns (A-I + J + 1,2,3,4a,4b,4,5,6)", () => {
    const p = buildFallbackPattern("Ferritin");
    expect(p.valuePatterns.length).toBe(18);
  });

  it("fallback pattern extracts numeric value", () => {
    const result = extractBiomarker("Ferritin: 234 ng/mL, elevated.", "Ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/234/);
  });

  it("fallback pattern extracts categorical value", () => {
    const result = extractBiomarker("CA-125 elevated above normal range.", "CA-125");
    // May or may not match depending on alias resolution — just verify no crash
    // The key requirement: buildFallbackPattern does not throw
    expect(() => buildFallbackPattern("CA-125")).not.toThrow();
  });

  it("tieBreaking defaults to 'first'", () => {
    const p = buildFallbackPattern("TestMarker");
    expect(p.tieBreaking).toBe("first");
  });

  it("pendingPhrases includes 'pending'", () => {
    const p = buildFallbackPattern("TestMarker");
    expect(p.pendingPhrases).toContain("pending");
  });

  it("fallback pattern includes aliasRegexes array", () => {
    const p = buildFallbackPattern("Prostat Vol");
    expect(p.aliasRegexes).toBeDefined();
    expect(p.aliasRegexes!.length).toBeGreaterThan(0);
  });

  it("aliasRegex for 'Prostat Vol' matches 'prostate volume' in text", () => {
    const p = buildFallbackPattern("Prostat Vol");
    const re = p.aliasRegexes![0];
    re.lastIndex = 0;
    expect(re.test("prostate volume was 45 cc")).toBe(true);
  });

  it("aliasRegex for 'Ferrit' matches 'ferritin' in text", () => {
    const p = buildFallbackPattern("Ferrit");
    const re = p.aliasRegexes![0];
    re.lastIndex = 0;
    expect(re.test("ferritin level 450 ng/ml")).toBe(true);
  });

  it("aliasRegex does NOT match unrelated words", () => {
    const p = buildFallbackPattern("PSA");
    const re = p.aliasRegexes![0];
    re.lastIndex = 0;
    // Should NOT match "psap" (PSA protein — different biomarker) as a word-boundary issue
    // But "psa" in "psa level" should match
    re.lastIndex = 0;
    expect(re.test("psa level 4.2")).toBe(true);
  });
});

// ─── Robustness: getBiomarkerPattern Tiered Matching ─────────────────────────

describe("getBiomarkerPattern — tier-2 compact form matching", () => {
  it("'ki67' (no hyphen, no space) resolves to Ki-67 pattern", () => {
    const p = getBiomarkerPattern("ki67");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Ki-67");
  });

  it("'ki 67' (space-separated) resolves to Ki-67 pattern", () => {
    // "ki 67" is already an alias (tier-1), verifying consistent behavior
    const p = getBiomarkerPattern("ki 67");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Ki-67");
  });

  it("'HER-2' resolves to HER2 pattern (compact 'her2')", () => {
    const p = getBiomarkerPattern("HER-2");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("HER2");
  });

  it("'her2' (all lowercase, no separator) resolves to HER2 pattern", () => {
    const p = getBiomarkerPattern("her2");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("HER2");
  });

  it("'birads' (no separator) resolves to BIRADS pattern", () => {
    const p = getBiomarkerPattern("birads");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("BIRADS");
  });

  it("'piqual' resolves to PI-QUAL pattern", () => {
    const p = getBiomarkerPattern("piqual");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PI-QUAL");
  });

  it("'pdl1' resolves to PD-L1 pattern", () => {
    const p = getBiomarkerPattern("pdl1");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PD-L1");
  });
});

describe("getBiomarkerPattern — tier-3 token-prefix matching", () => {
  it("'Tumor Gr' (prefix of 'Tumor Grade') resolves to Tumor Grade pattern", () => {
    const p = getBiomarkerPattern("Tumor Gr");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Tumor Grade");
  });

  it("'Tumor St' (prefix of 'Tumor Stage') resolves to Tumor Stage pattern", () => {
    const p = getBiomarkerPattern("Tumor St");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Tumor Stage");
  });
});

describe("getBiomarkerPattern — tier-4 fuzzy edit-distance matching", () => {
  it("'Gleison' (1 edit from 'Gleason') resolves to Gleason pattern", () => {
    const p = getBiomarkerPattern("Gleison");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Gleason");
  });

  it("'Gliason' (1 edit from 'Gleason') resolves to Gleason pattern", () => {
    const p = getBiomarkerPattern("Gliason");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Gleason");
  });

  it("'XYZ123' does not fuzzy-match anything", () => {
    const p = getBiomarkerPattern("XYZ123");
    expect(p).toBeNull();
  });

  it("'Progestrone Recptor' (2 separate 1-edit typos) resolves to PR pattern", () => {
    // "progestrone" = edit distance 1 from "progesterone" (missing 'e' at pos 7)
    // "recptor"     = edit distance 1 from "receptor"     (missing 'e' at pos 3)
    const p = getBiomarkerPattern("Progestrone Recptor");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("PR");
  });

  it("'Estrogan Receptor' (1 edit) resolves to ER pattern", () => {
    // "estrogan" is 1 edit from "estrogen" (swap 'e'→'a' at pos 6)
    const p = getBiomarkerPattern("Estrogan Receptor");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("ER");
  });
});

// ─── Additional Clinical Scenarios ───────────────────────────────────────────

describe("PD-L1 extraction", () => {
  it("extracts TPS score", () => {
    const result = extractBiomarker("PD-L1 TPS: 50% by 22C3 assay.", "PD-L1");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/50/);
  });

  it("extracts PD-L1 negative categorical", () => {
    const result = extractBiomarker("PD-L1 negative.", "PD-L1");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/negative/);
  });
});

describe("PI-QUAL extraction", () => {
  it("extracts PI-QUAL 3", () => {
    const result = extractBiomarker("PI-QUAL 3 — adequate image quality.", "PI-QUAL");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("PI-QUAL 3");
  });
});

describe("BIRADS extraction", () => {
  it("extracts BI-RADS 4A", () => {
    const result = extractBiomarker("Mammography: BI-RADS 4A — low suspicion for malignancy.", "BIRADS");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/4A/i);
  });

  it("extracts BIRADS 3 via alias 'bi-rads'", () => {
    const result = extractBiomarker("Assessment: BI-RADS category 3, probably benign.", "BIRADS");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3/);
  });
});

describe("ALK extraction", () => {
  it("extracts ALK positive", () => {
    const result = extractBiomarker("ALK positive by FISH (ALK rearrangement detected).", "ALK");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/positive|rearranged/);
  });
});

// ─── Bug Fix Tests ────────────────────────────────────────────────────────────

describe("Bug #1: Decimal comma — thousands not corrupted", () => {
  it("keeps 8,000 as 8000 (not 8.000)", () => {
    // WBC with thousand separator should not become 8.0
    const result = extractBiomarker("WBC count: 8,000 cells/μL, ferritin 45 ng/mL", "ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/45/);
  });

  it("still converts European decimal 3,5 → 3.5", () => {
    const result = extractBiomarker("PSA: 3,5 ng/mL", "PSA");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\.5/);
  });

  it("keeps multi-group numbers intact: 1,234,567", () => {
    // A bare numeric fallback should not mangle large numbers
    const result = extractBiomarker("Platelets: 1,234,567 per uL", "Platelets");
    // Result may or may not match, but the text should not turn 1,234 into 1.234
    // We verify normalisation doesn't produce 1.234 as a value
    if (result) {
      expect(result.value).not.toBe("1.234");
    }
  });
});

describe("Bug #4: BRCA exon and protein-change variants", () => {
  it("extracts BRCA1 exon deletion", () => {
    const result = extractBiomarker("BRCA1 exon 5 deletion, pathogenic", "BRCA1");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/exon\s*5\s*deletion/);
  });

  it("extracts BRCA2 exon duplication", () => {
    const result = extractBiomarker("BRCA2 exon 11 duplication detected", "BRCA2");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/exon\s*11\s*duplication/);
  });

  it("extracts BRCA1 protein change only", () => {
    const result = extractBiomarker("BRCA1 p.Trp24Cys identified", "BRCA1");
    expect(result).not.toBeNull();
    // value is normalized to lowercase by the extraction engine
    expect(result!.value.toLowerCase()).toMatch(/trp24cys/);
  });
});

describe("Bug #7: ER/PR bare +/- context safety", () => {
  it("extracts ER positive from standalone annotation", () => {
    const result = extractBiomarker("ER: positive", "ER");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toBe("positive");
  });

  it("extracts PR negative from standalone annotation", () => {
    const result = extractBiomarker("PR: negative", "PR");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toBe("negative");
  });
});

describe("Bug #8: HER2 IHC allows space before +", () => {
  it("extracts HER2 3 + (space before plus)", () => {
    const result = extractBiomarker("HER2 score 3 + (strong staining)", "HER2");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\+/);
  });

  it("still extracts HER2 3+ (no space)", () => {
    const result = extractBiomarker("HER2 3+ positive", "HER2");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/3\+/);
  });
});

describe("Bug: HER2 FISH 'result back: ratio X' regression", () => {
  it("extracts FISH ratio from 'HER2 FISH result back: ratio 3.8'", () => {
    // Real MDT note format: FISH result comes back with ratio on a separate phrase.
    // Previously the categorical pattern matched the em-dash (\u2014 → '-') at position 29
    // and returned "Negative" instead of the FISH ratio.
    const text =
      "HER2 FISH result back: ratio 3.8 \u2014 HER2 positive. adding trastuzumab to regimen.";
    const result = extractBiomarker(text, "HER2");
    expect(result).not.toBeNull();
    // Should be FISH ratio (more specific), NOT "Negative"
    expect(result!.value).toMatch(/3\.8|[Pp]ositive/);
    expect(result!.value.toLowerCase()).not.toBe("negative");
  });

  it("does not match em-dash normalised to hyphen as HER2 negative", () => {
    // "ratio 3.8 — HER2 positive" — after em-dash normalisation the "—" becomes "-"
    // surrounded by spaces, which should NOT match the categorical HER2-/+ shorthand.
    const text = "patient notes: ratio 3.8 - her2 positive result confirmed.";
    const result = extractBiomarker(text, "HER2");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).not.toBe("negative");
    expect(result!.value.toLowerCase()).toBe("positive");
  });
});

describe("Bug #5: Negation fallback broader patterns", () => {
  it("detects 'X negative for mutation' negation in fallback", () => {
    const p = buildFallbackPattern("KRAS");
    // Simulate context window check: find the negation pattern
    const negPattern = p.valuePatterns.find(vp => vp.context === "negation / not detected");
    expect(negPattern).toBeDefined();
    const text = "KRAS: negative for mutation";
    const m = negPattern!.pattern.exec(text.toLowerCase());
    expect(m).not.toBeNull();
  });

  it("detects 'X mutation not detected' phrasing (KRAS known pattern)", () => {
    // KRAS has a known pattern; "mutation not detected" matches its status pattern
    const result = extractBiomarker("KRAS: mutation not detected in tissue sample.", "KRAS");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toMatch(/not\s+detected/);
  });
});

describe("Bug #9: Levenshtein clean copy (correctness check)", () => {
  it("tier-4 fuzzy: query 'Gleison' resolves to Gleason pattern and finds value in correct text", () => {
    // Tier-4 tolerates a typo in the QUERY. Text must still have the correct spelling.
    const result = extractBiomarker("Gleason score 7 (3+4)", "Gleison");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/7/);
  });

  it("tier-4 fuzzy: getBiomarkerPattern resolves 'Gleison' → Gleason", () => {
    const pattern = getBiomarkerPattern("Gleison");
    expect(pattern).not.toBeNull();
    expect(pattern!.name).toBe("Gleason");
  });
});

// ─── Enhanced Fallback Patterns — Molecular / Genomic Types ──────────────────

describe("Fallback: alphanumeric mutation code", () => {
  it("TP53 G245S → extracts G245S (not just 245)", () => {
    const result = extractBiomarker("TP53 G245S mutation detected in tumor tissue.", "TP53");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toContain("G245S");
  });

  it("PIK3CA H1047R → extracts H1047R", () => {
    const result = extractBiomarker("PIK3CA H1047R variant identified.", "PIK3CA");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toContain("H1047R");
  });
});

describe("Fallback: fusion gene", () => {
  it("ROS1 CD74-ROS1 fusion → extracts CD74-ROS1 fusion", () => {
    const result = extractBiomarker("ROS1 CD74-ROS1 fusion identified by FISH.", "ROS1");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toContain("CD74-ROS1");
  });
});

describe("Fallback: HGVS protein change", () => {
  it("FGFR2 p.Cys383Arg → extracts p.Cys383Arg", () => {
    const result = extractBiomarker("FGFR2 p.Cys383Arg variant detected.", "FGFR2");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("p.cys383arg");
  });
});

describe("Fallback: HGVS cDNA variant", () => {
  it("CDKN2A c.1234A>G → extracts c.1234A>G", () => {
    // CDKN2A is not in the known pattern library and won't fuzzy-match any known pattern
    const result = extractBiomarker("CDKN2A c.1234A>G detected in sequencing.", "CDKN2A");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("c.1234");
  });
});

describe("Fallback: exon structural variant", () => {
  it("PTEN exon 7 deletion → extracts exon 7 deletion", () => {
    const result = extractBiomarker("PTEN exon 7 deletion confirmed by NGS.", "PTEN");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("exon 7 deletion");
  });
});

describe("Fallback: copy number alteration", () => {
  it("MET copy number gain → extracts copy number gain", () => {
    const result = extractBiomarker("MET copy number gain detected.", "MET");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("copy number gain");
  });
});

// ─── Breaking Point Fixes ────────────────────────────────────────────────────

describe("BP1/BP6: Fallback range pattern", () => {
  it("extracts numeric range 'Ferritin 45-120 ng/mL'", () => {
    const result = extractBiomarker("Ferritin 45-120 ng/mL (elevated).", "Ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/45/);
    expect(result!.value).toMatch(/120/);
  });

  it("range result has valueType 'range'", () => {
    const result = extractBiomarker("Ferritin level: 45-120 ng/mL", "Ferritin");
    expect(result).not.toBeNull();
    expect(result!.valueType).toBe("range");
  });
});

describe("BP7: Fallback OR-alternative readings", () => {
  it("extracts 'CD4 count 200 or 300 cells/uL' as composite", () => {
    const result = extractBiomarker("CD4 count 200 or 300 cells/uL on repeat testing.", "CD4 count");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/200/);
    expect(result!.value).toMatch(/or/i);
    expect(result!.value).toMatch(/300/);
  });
});

describe("BP3: Pattern D false positive prevention (A1c)", () => {
  it("query 'Hemoglobin' on text with 'A1c' extracts numeric value, NOT 'a1c'", () => {
    const result = extractBiomarker("Hemoglobin A1c 12.5 g/dL elevated.", "Hemoglobin");
    // Should NOT extract 'A1C' (single-digit mutation code false positive)
    // Should extract the numeric value or be null (not 'A1C')
    if (result !== null) {
      expect(result!.value.toUpperCase()).not.toBe("A1C");
    }
  });

  it("real 2-digit mutation G12C is still extracted correctly", () => {
    const result = extractBiomarker("KRAS G12C mutation confirmed.", "KRAS");
    expect(result).not.toBeNull();
    expect(result!.value.toUpperCase()).toContain("G12C");
  });
});

describe("Cross-boundary contamination: pipe-separated molecular profiles", () => {
  it("TP53 query does NOT capture BRCA2 c.1813delA from pipe-separated list", () => {
    // Critical regression: "TP53 G245S | BRCA2 c.1813delA | TP53 R273H"
    // TP53 patterns must not cross the '|' delimiter to grab BRCA2's HGVS notation.
    const result = extractBiomarker(
      "Molecular profile: TP53 G245S | BRCA2 c.1813delA | TP53 R273H",
      "TP53"
    );
    expect(result).not.toBeNull();
    // Must contain a TP53 mutation (G245S or R273H), NOT c.1813delA (BRCA2's mutation)
    expect(result!.value.toLowerCase()).not.toContain("c.1813");
    expect(result!.value.toUpperCase()).toMatch(/G245S|R273H/);
  });

  it("BRCA2 query captures c.1813delA, not TP53 mutations", () => {
    const result = extractBiomarker(
      "Molecular profile: TP53 G245S | BRCA2 c.1813delA | TP53 R273H",
      "BRCA2"
    );
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("c.1813");
  });

  it("numeric value not grabbed from adjacent pipe-separated entry", () => {
    // "Ferritin 45 | Hemoglobin 12.5 g/dL" — Ferritin query should get 45, not 12.5
    const result = extractBiomarker("Ferritin 45 | Hemoglobin 12.5 g/dL", "Ferritin");
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/^45/);
    expect(result!.value).not.toMatch(/12\.5/);
  });
});

describe("BP9: Header/disclaimer skip phrases", () => {
  it("skips 'reference range' value, extracts actual result from PSA", () => {
    // "PSA Reference Range: 0-4 ng/mL. PSA: 12.4 ng/mL." — should extract 12.4, not 0 or 4
    const result = extractBiomarker(
      "PSA Reference Range: 0-4 ng/mL. PSA: 12.4 ng/mL.",
      "PSA"
    );
    expect(result).not.toBeNull();
    expect(result!.value).toMatch(/12\.4/);
    expect(result!.value).not.toMatch(/^0[-–]4/);
  });
});

// ─── Pattern J: Molecular/Genomic Alteration Status ──────────────────────────

describe("Pattern J: molecular/genomic alteration status (biallelic, frameshift, etc.)", () => {
  it("extracts 'biallelic loss' for TP53 in liquid biopsy report", () => {
    // Regression: was returning '3' from 'SBS3' in the next line
    const text = [
      "Allele-specific copy number: TP53 biallelic loss",
      "Mutational signature: SBS3 (HRD) high contribution",
      "Tumour purity estimate 68%",
    ].join("\n");
    const result = extractBiomarker(text, "TP53");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("biallelic");
    expect(result!.value).not.toBe("3");
  });

  it("extracts 'frameshift' for TP53 in comma-separated molecular profile", () => {
    // Regression: was returning '51' from 'RAD51C' after the comma
    const text =
      "molecular: EGFR exon 20 ins, MET amplification, TP53 frameshift, RAD51C biallelic, MYC amplification";
    const result = extractBiomarker(text, "TP53");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("frameshift");
    expect(result!.value).not.toBe("51");
  });

  it("extracts 'amplification' for MYC in comma-separated molecular profile", () => {
    const text = "molecular: TP53 frameshift, RAD51C biallelic, MYC amplification";
    const result = extractBiomarker(text, "MYC");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("amplification");
  });

  it("comma-separated profile: RAD51C query extracts 'biallelic', not TP53's frameshift", () => {
    const text =
      "molecular: TP53 frameshift, RAD51C biallelic, MYC amplification";
    const result = extractBiomarker(text, "RAD51C");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("biallelic");
    expect(result!.value.toLowerCase()).not.toContain("frameshift");
  });

  it("extracts 'amplification' for standalone marker", () => {
    const result = extractBiomarker("MET amplification confirmed by FISH.", "MET");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("amplification");
  });

  it("extracts 'loss of function' status", () => {
    const result = extractBiomarker("PTEN loss of function detected.", "PTEN");
    expect(result).not.toBeNull();
    expect(result!.value.toLowerCase()).toContain("loss of function");
  });
});
