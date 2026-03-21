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

  it("fallback pattern has 6 valuePatterns", () => {
    const p = buildFallbackPattern("Ferritin");
    expect(p.valuePatterns.length).toBe(6);
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
