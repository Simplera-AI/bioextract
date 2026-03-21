# BioExtract

**Privacy-first, browser-based clinical biomarker extraction.** Upload a CSV or Excel file of clinical notes, type a biomarker name, and extract values at scale — without AI, without a backend, without any data leaving your browser.

> Built by [Simplera AI](https://simpleraai.com) — companion tool to [ClinDetect](https://github.com/Simplera-AI/clinDetect).

---

## What it does

Where ClinDetect answers **presence/absence** questions ("does this record mention metastasis?"), BioExtract answers **measurement questions**: "what is the PSA level in this record?"

Upload a spreadsheet → select the column with clinical text → type a biomarker name → download results with two new columns appended: **Value** and **Evidence**.

---

## Supported Biomarkers

18 pre-defined patterns with clinical-grade regex:

| Biomarker | Example output |
|-----------|---------------|
| PSA | `4.2 ng/mL` |
| PiRADS / PI-RADS | `4` |
| TNM | `T2N0M0` |
| Gleason / Grade Group | `3+4=7` |
| Ki-67 | `23%` |
| ER / PR / HER2 | `Positive` |
| BRCA1 / BRCA2 | `Pathogenic variant` |
| MSI / MMR | `MSI-H` |
| PD-L1 | `TPS 60%` |
| KRAS / BRAF / EGFR / ALK | `G12D mutation` |
| Tumor Grade | `Grade II` |
| Tumor Stage | `Stage III` |
| PI-QUAL | `3` |
| BI-RADS | `Category 4` |

Any biomarker **not** in this list works via automatic fallback — BioExtract generates numeric and categorical patterns on the fly.

---

## Getting Started

```bash
git clone https://github.com/Simplera-AI/bioextract
cd bioextract
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Commands

```bash
npm run dev      # Dev server (localhost:3000)
npm run build    # Production build
npm test         # Run all 150 Vitest tests
```

---

## How it works

```
Upload CSV/XLSX
    ↓
Select column + type biomarker name
    ↓
Phase 0: Alias resolution (known pattern or fallback)
Phase 1: Find all mentions in each cell (word-boundary safe)
Phase 2: Pending check ("PSA pending" → PENDING)
Phase 3: Extract 200-char context window around each mention
Phase 4: Try ordered regex patterns → first match wins
Phase 5: Tie-break multiple mentions (first/last/highest/lowest)
Phase 6: Extract evidence sentence (full sentence containing the match)
    ↓
Output: original columns + "[Biomarker] Value" + "[Biomarker] Evidence"
```

**100% client-side.** No server, no AI, no API calls. All processing happens in your browser — PHI never leaves your machine.

---

## Output

| ... original columns ... | PSA Value | PSA Evidence |
|--------------------------|-----------|--------------|
| | `4.2 ng/mL` | "PSA level was 4.2 ng/mL on follow-up..." |
| | `PENDING` | "PSA result pending at time of dictation..." |
| | | ← not found = empty |

Excel export: teal highlight on rows where a value was found. CSV export always available.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 + Framer Motion |
| File parsing | SheetJS + PapaParse |
| Extraction | Pure TypeScript regex engine |
| Export | SheetJS + xlsx-js-style |
| Tests | Vitest 2 (150 tests) |

---

## License

MIT — © Simplera AI
