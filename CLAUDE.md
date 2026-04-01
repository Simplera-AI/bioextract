# CLAUDE.md — BioExtract

## Project Overview

**BioExtract** is a privacy-first, browser-based clinical biomarker extraction tool built with **Next.js 14** and **TypeScript**. It is the second product in the Simplera AI suite, complementing ClinDetect.

Where ClinDetect answers *presence/absence* questions ("does this record mention metastasis?"), BioExtract answers *measurement* questions ("what is the PSA value in this record?").

**Core principle: No AI. No backend. 100% client-side. Rule-based regex extraction.**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.5 (App Router) |
| Language | TypeScript 5 |
| UI | React 18 + Tailwind CSS 3.4 + Framer Motion |
| Icons | Lucide React |
| Excel parsing | SheetJS (xlsx) + PapaParse |
| Extraction | Custom TypeScript regex engine |
| Export | SheetJS + xlsx-js-style |
| Tests | Vitest 2.x |

---

## Project Structure

```
bioextract/
├── app/
│   ├── page.tsx           # 5-step state machine (Client Component)
│   ├── layout.tsx         # Root layout (Figtree font, dark mode script)
│   └── globals.css        # Tailwind base + component classes
├── components/
│   ├── FileUploader.tsx          # Drag-drop file upload
│   ├── SheetSelector.tsx         # Excel sheet picker
│   ├── ColumnSingleSelect.tsx    # Single-column picker (pill UI)
│   ├── BiomarkerInput.tsx        # Text input with autocomplete
│   ├── ExtractionProgress.tsx    # Animated progress bar
│   ├── ResultsPreview.tsx        # Stats cards + preview table
│   └── BioExtractDownloadButtons.tsx  # CSV + Excel download
├── lib/
│   ├── types.ts              # All TypeScript interfaces
│   ├── parse.ts              # File parsing (xlsx/csv) — copied from ClinDetect
│   ├── evidence.ts           # extractSnippet() — copied from ClinDetect
│   ├── textNormalize.ts      # normalizeForExtraction(), findAllMentions()
│   ├── biomarkerPatterns.ts  # 18+ biomarker patterns + fallback
│   ├── extractBiomarker.ts   # Core 6-phase extraction engine
│   └── export.ts             # CSV + Excel export with teal highlighting
├── __tests__/
│   ├── extractBiomarker.test.ts      # Unit tests for extraction engine
│   ├── biomarkerPatterns.test.ts     # Pattern-specific tests
│   └── integration/
│       └── extractionAccuracy.test.ts  # End-to-end accuracy tests
├── CLAUDE.md
├── package.json
└── vitest.config.ts
```

---

## User Flow (5 Steps)

```
Step 1 → Upload File        (CSV, XLSX, XLS — drag-drop or click)
Step 2 → Select Sheet       (Excel only; auto-skipped for CSV / single-sheet)
Step 3 → Configure          (select column + type biomarker name)
Step 4 → Extract            (progress bar, all in browser)
Step 5 → Results + Download (stats cards, preview table, CSV/Excel download)
```

---

## Development Commands

```bash
cd bioextract
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build (must pass with 0 errors)
npm test           # Run all Vitest tests (must all pass)
npm run test:watch # Watch mode
```

**Quality gates — always verify before committing:**
```bash
npm run build  # 0 TypeScript errors
npm test       # All tests pass
```

---

## Extraction Engine Architecture

### `lib/extractBiomarker.ts`

6-phase pipeline per text cell:

1. **Phase 0: Alias Resolution** — `getBiomarkerPattern(query)` → known pattern or `buildFallbackPattern()` for unknowns
2. **Phase 1: Mention Finding** — `findAllMentions()` with word-boundary-safe regex; aliases tried longest-first; overlapping hits deduplicated
3. **Phase 2: Pending Check** — look 80 chars after mention for pending phrases → value = "PENDING"
4. **Phase 3: Context Window** — extract `contextWindowChars` chars centered on mention
5. **Phase 4: Value Extraction** — try ordered `valuePatterns` on context window; first match wins; optional `transform()` applied
6. **Phase 5: Tie-Breaking** — when multiple mentions: `first|last|highest|lowest|all` per biomarker's strategy
7. **Evidence** — `extractSnippet()` from `evidence.ts` extracts full sentence containing the mention

### `lib/biomarkerPatterns.ts`

Pre-defined patterns for 18+ biomarkers:

| Biomarker | Tie-Break | Notes |
|-----------|-----------|-------|
| PSA | last | Serial PSA — most recent is most relevant |
| PiRADS | highest | Most suspicious lesion |
| TNM | last | Most recent staging supersedes prior |
| Gleason | highest | Most aggressive pattern |
| Ki-67 | highest | Highest proliferative index |
| ER / PR / HER2 | first | Primary IHC result |
| BRCA1 / BRCA2 | first | Primary genetic result |
| MSI / MMR | first | |
| PD-L1 | highest | Highest TPS/CPS drives treatment |
| KRAS / BRAF / EGFR / ALK | first | |
| Tumor Grade | first | |
| Tumor Stage | last | Most recent staging |
| PI-QUAL | first | |
| BI-RADS | highest | Most suspicious finding |

**Fallback pattern** (`buildFallbackPattern()`): dynamically generates 6 general-purpose patterns for any unknown biomarker: numeric+unit, categorical status (positive/negative/detected), comparison (</>), ratio (3/10), negation (not detected), and bare numeric with narrative connectors ("showed", "found to be", "measured at", "came back at").

### `lib/textNormalize.ts`

`normalizeForExtraction()` handles:
- Unicode whitespace (non-breaking space, em-space, thin-space from EMR exports) → regular space
- Em-dash/en-dash → hyphen
- European decimal comma: `4,2` → `4.2` (only 1–2 digit groups; preserves `8,000`)
- Unicode superscript digits (from PDF copy-paste) → ASCII

---

## Extraction Quality Features

### NegEx-style Negation Scope (`lib/extractBiomarker.ts`)

After extracting a numeric/comparison/range value, `isNegatedBetween()` checks whether a negation cue appears between the alias end and the captured value start, WITHOUT a scope terminator in between.

- **Negation cues**: `not`, `no`, `never`, `without`, `denies`, `denied`, `rules out`, `ruled out`, `absent`, `negative`, `unremarkable`
- **Scope terminators**: `.`, `;`, `!`, `?`, `but`, `however`, `except`, `although`, `despite`, `yet`, `though`, `whereas`
- Categorical results that ARE negation phrases (e.g. "not detected", "negative") are exempt — their raw value already encodes the negation.
- Example: `"PSA not detected; now 8.4 ng/mL"` → semicolon terminates scope → 8.4 extracted

### Pronoun Coreference Resolution (`lib/extractBiomarker.ts`)

`resolvePronounCoreferences()` runs before normalization. It replaces sentence-initial pronouns (`It`, `This`, `The value/level/result/score/marker/measurement`) with the biomarker's shortest alias when the pronoun appears within 200 chars of a prior biomarker mention.

- Only replaces at sentence boundaries (after `[.!?]`) to avoid false positives mid-sentence.
- Enables: `"PSA 8.4. It rose to 12.1 ng/mL."` → extracts 12.1 (tie-breaking: last)

### Sentence-Boundary Context Window Trimming (`lib/extractBiomarker.ts`)

`extractContextWindow()` trims the window's left edge to the nearest sentence boundary before the hit. This prevents biomarker patterns that embed the name as an anchor (e.g. PSA patterns contain "psa") from matching an EARLIER mention that falls in the same large context window.

- Example: `"PSA was 8.4. PSA rose to 12.1."` — the second PSA mention's window is trimmed to start at "PSA rose to 12.1.", so the pattern sees 12.1, not 8.4.

### Narrative Pattern Expansion (`lib/biomarkerPatterns.ts`)

PSA and fallback patterns recognise narrative verb phrases: `found to be`, `showed`, `revealed`, `returned at`, `measured at`, `came back at`, `resulted in/of`.

- Example: `"PSA was found to be 4.2 ng/mL"` → extracts 4.2

### AI Enrichment Safety Net (`lib/aiEnrichment.ts`)

`shouldEnrich()` decides whether Phase 2 AI enrichment fires for a given row:

| Biomarker type | Condition | AI fires? |
|----------------|-----------|-----------|
| **Known** (PSA, HER2, etc.) | Regex found nothing (`ruleResult === null`) | Yes — handles unseen report formats |
| **Known** | Regex found a value (any confidence) | No — trust the named pattern |
| **Unknown** (fallback) | Regex found nothing | Yes |
| **Unknown** | Bare-numeric value (possible misparse) | Yes |
| **Unknown** | Medium/low confidence result | Yes |
| **Unknown** | High-confidence non-numeric value | No |

**Key design decision**: Known biomarkers now get AI enrichment when regex finds nothing, so unseen clinical report formats (e.g. `"PSA concentration measured at 4.2"`, EMR table cells, free-text narrative) don't silently return empty. AI never overrides a successful regex extraction for known markers.

### TNM Labeled Field Format Coverage (`lib/extractTNM.ts`)

`LABELED_T_RE`, `LABELED_N_RE`, `LABELED_M_RE` handle all real-world label styles:

- `T: pT3a` — simple colon
- `T – pT2b` — en-dash
- `(T): T1a` — AJCC parenthesised form
- `T category: T2a` — qualifier word before colon
- `T stage: T3a` — qualifier word before colon
- `T classification: pT2` — qualifier word before colon

---

## Output Format

Original columns + 2 new columns appended:
- `[BiomarkerName] Value` — extracted value or "PENDING" or empty string
- `[BiomarkerName] Evidence` — the full sentence containing the match, or empty string

**XLSX export**: teal highlight (`#CCFBF1`) on Value cell, lighter teal (`#F0FDFA`) on Evidence cell and row background, for rows where a value was extracted.

---

## Key Design Decisions

**Why pure TypeScript (no Python)?**
All processing runs in each user's browser → zero shared server bottleneck → infinite horizontal scalability for parallel users. 100 simultaneous users = 100 independent browsers at full speed.

**Why ordered `valuePatterns` (first match wins)?**
Clinical text has domain-specific extraction precedence. For PSA, a comparison pattern ("decreased from X to Y") must be tried before the simple numeric pattern, otherwise the greedy numeric match captures only "Y" and loses the "from X" context.

**Why `tieBreaking: "last"` for PSA?**
Serial PSA is the dominant use case. "PSA 8.4 three months ago... PSA now 0.2 ng/mL" — the last mention is the current, most clinically relevant value.

**Why `tieBreaking: "highest"` for PiRADS/Ki-67?**
For PiRADS, the most suspicious lesion drives the clinical decision. For Ki-67, the highest proliferative index drives the most aggressive treatment.

---

## Known Limitations

- **Value-present-but-not-extracted**: If a biomarker is mentioned without a recognizable value pattern nearby (e.g., "PSA levels were measured" without a number), both output columns will be empty. This is intentional — returning a wrong value is worse than returning nothing.
- **Abbreviation ambiguity**: Short abbreviations like "ER" and "PR" can theoretically match in non-biomarker contexts. The word-boundary matching (`(?<![a-z0-9])er(?![a-z0-9])`) mitigates most false matches.
- **Language**: English only. French/German clinical text will likely fail pattern matching.
- **Multiple biomarkers per run**: Currently extracts one biomarker per run. Multiple biomarker extraction in a single pass is planned for a future version.
