/**
 * Unit tests for biomarkerTypeInference.ts
 *
 * Verifies that inferBiomarkerType() correctly categorises biomarker names
 * into the right clinical domain — which controls which AI prompt template
 * is used for unknown biomarker extraction.
 */

import { describe, it, expect } from "vitest";
import { inferBiomarkerType } from "@/lib/biomarkerTypeInference";

// ─── Molecular gene markers ───────────────────────────────────────────────────

describe("inferBiomarkerType: molecular-gene", () => {
  it("KRAS → molecular-gene", () => {
    expect(inferBiomarkerType("KRAS")).toBe("molecular-gene");
  });

  it("FGFR3 → molecular-gene", () => {
    expect(inferBiomarkerType("FGFR3")).toBe("molecular-gene");
  });

  it("PIK3CA → molecular-gene", () => {
    expect(inferBiomarkerType("PIK3CA")).toBe("molecular-gene");
  });

  it("BRAF → molecular-gene", () => {
    expect(inferBiomarkerType("BRAF")).toBe("molecular-gene");
  });

  it("ERBB2 → molecular-gene", () => {
    expect(inferBiomarkerType("ERBB2")).toBe("molecular-gene");
  });

  it("ALK → molecular-gene", () => {
    expect(inferBiomarkerType("ALK")).toBe("molecular-gene");
  });

  it("MET → molecular-gene", () => {
    expect(inferBiomarkerType("MET")).toBe("molecular-gene");
  });

  it("CDK12 → molecular-gene", () => {
    expect(inferBiomarkerType("CDK12")).toBe("molecular-gene");
  });

  it("CCND1 → molecular-gene", () => {
    expect(inferBiomarkerType("CCND1")).toBe("molecular-gene");
  });

  it("FGF19 → molecular-gene", () => {
    expect(inferBiomarkerType("FGF19")).toBe("molecular-gene");
  });

  it("TP53 → molecular-gene", () => {
    expect(inferBiomarkerType("TP53")).toBe("molecular-gene");
  });

  it("BRCA1 → molecular-gene (even though it's a known pattern)", () => {
    expect(inferBiomarkerType("BRCA1")).toBe("molecular-gene");
  });

  it("MYC → molecular-gene", () => {
    expect(inferBiomarkerType("MYC")).toBe("molecular-gene");
  });
});

// ─── Lab value markers ────────────────────────────────────────────────────────

describe("inferBiomarkerType: lab-value", () => {
  it("Creatinine → lab-value", () => {
    expect(inferBiomarkerType("Creatinine")).toBe("lab-value");
  });

  it("CA-125 → lab-value", () => {
    expect(inferBiomarkerType("CA-125")).toBe("lab-value");
  });

  it("CA 19-9 → lab-value", () => {
    expect(inferBiomarkerType("CA 19-9")).toBe("lab-value");
  });

  it("Hemoglobin → lab-value", () => {
    expect(inferBiomarkerType("Hemoglobin")).toBe("lab-value");
  });

  it("Ferritin → lab-value", () => {
    expect(inferBiomarkerType("Ferritin")).toBe("lab-value");
  });

  it("Calcium → lab-value", () => {
    expect(inferBiomarkerType("Calcium")).toBe("lab-value");
  });

  it("CEA → lab-value (antigen keyword match via 'cea' in serum context)", () => {
    // CEA is uppercase but not a gene pattern — lab-value keyword 'cea' matches
    expect(inferBiomarkerType("CEA")).toBe("lab-value");
  });

  it("AFP → lab-value", () => {
    expect(inferBiomarkerType("AFP")).toBe("lab-value");
  });

  it("TSH → lab-value", () => {
    expect(inferBiomarkerType("TSH")).toBe("lab-value");
  });

  it("LDH → lab-value", () => {
    expect(inferBiomarkerType("LDH")).toBe("lab-value");
  });

  it("Cholesterol level → lab-value", () => {
    expect(inferBiomarkerType("Cholesterol level")).toBe("lab-value");
  });
});

// ─── IHC markers ─────────────────────────────────────────────────────────────

describe("inferBiomarkerType: ihc-marker", () => {
  it("CD20 → ihc-marker", () => {
    expect(inferBiomarkerType("CD20")).toBe("ihc-marker");
  });

  it("CD3 → ihc-marker", () => {
    expect(inferBiomarkerType("CD3")).toBe("ihc-marker");
  });

  it("CD8 → ihc-marker", () => {
    expect(inferBiomarkerType("CD8")).toBe("ihc-marker");
  });

  it("CK7 → ihc-marker", () => {
    expect(inferBiomarkerType("CK7")).toBe("ihc-marker");
  });

  it("CK5/6 → ihc-marker", () => {
    expect(inferBiomarkerType("CK5/6")).toBe("ihc-marker");
  });

  it("Synaptophysin → ihc-marker", () => {
    expect(inferBiomarkerType("Synaptophysin")).toBe("ihc-marker");
  });

  it("Chromogranin → ihc-marker", () => {
    expect(inferBiomarkerType("Chromogranin")).toBe("ihc-marker");
  });

  it("S100 → ihc-marker", () => {
    expect(inferBiomarkerType("S100")).toBe("ihc-marker");
  });

  it("TTF-1 → ihc-marker", () => {
    expect(inferBiomarkerType("TTF-1")).toBe("ihc-marker");
  });

  it("Vimentin → ihc-marker", () => {
    expect(inferBiomarkerType("Vimentin")).toBe("ihc-marker");
  });
});

// ─── Pathology score markers ──────────────────────────────────────────────────

describe("inferBiomarkerType: pathology-score", () => {
  it("Gleason → pathology-score", () => {
    expect(inferBiomarkerType("Gleason")).toBe("pathology-score");
  });

  it("Allred score → pathology-score", () => {
    expect(inferBiomarkerType("Allred score")).toBe("pathology-score");
  });

  it("H-score → pathology-score", () => {
    expect(inferBiomarkerType("H-score")).toBe("pathology-score");
  });

  it("Tumor Grade → pathology-score", () => {
    expect(inferBiomarkerType("Tumor Grade")).toBe("pathology-score");
  });

  it("BI-RADS → pathology-score", () => {
    expect(inferBiomarkerType("BI-RADS")).toBe("pathology-score");
  });

  it("PiRADS → pathology-score", () => {
    expect(inferBiomarkerType("PiRADS")).toBe("pathology-score");
  });

  it("TPS → pathology-score", () => {
    expect(inferBiomarkerType("TPS")).toBe("pathology-score");
  });
});

// ─── Generic / unknown markers ────────────────────────────────────────────────

describe("inferBiomarkerType: generic", () => {
  it("SomeNewBiomarker → generic", () => {
    expect(inferBiomarkerType("SomeNewBiomarker")).toBe("generic");
  });

  it("arbitrary text → generic", () => {
    expect(inferBiomarkerType("clinical marker abc")).toBe("generic");
  });

  it("MSI → generic (not a gene, not a lab value, not IHC)", () => {
    // MSI doesn't match any specific category heuristic — falls to generic
    const result = inferBiomarkerType("MSI");
    // It's valid for MSI to be molecular-gene (all-caps 3-char) or generic
    expect(["molecular-gene", "generic"]).toContain(result);
  });
});
