# BioExtract — How It Works
### A Plain-English + Technical Guide

> **Who is this for?**
> This document explains how BioExtract extracts medical information from clinical text. It is written for someone who is curious about the technology — you don't need to be a programmer to follow along, but all the technical detail is preserved for those who want it.

---

## What Is BioExtract?

BioExtract is a tool that reads clinical notes (text written by doctors) and automatically pulls out important medical measurements — things like **PSA level**, **HER2 status**, **Ki-67 score**, or **BRCA mutation result** — from free-form sentences.

For example, given a doctor's note like:
> *"Prostate specific antigen came back at 4.2 ng/mL. It rose to 12.1 ng/mL on repeat testing."*

BioExtract will output:
- **PSA = 12.1 ng/mL**
- **Evidence:** *"It rose to 12.1 ng/mL on repeat testing."*

**Key principle:** The entire system runs in your browser. No data is ever sent to a server. No AI model sees your patient data. Everything is pure logic — patterns, rules, and math.

---

## The Big Picture: 6 Phases

Every time you ask BioExtract to extract a biomarker, it runs through **6 phases** for every row of text in your spreadsheet:

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
Alias     Mention   Pending   Context   Value      Tie-       Evidence
Resolve   Finding   Check     Window    Extract    Breaking   Snippet
```

Let's walk through each phase in plain language.

---

## Phase 0 — "What Are You Looking For?" (Alias Resolution)

### Plain English
When you type `"PSA"` into the search box, the system first needs to figure out: *which biomarker is this?* And what are all the different ways doctors might write it in a note?

Doctors might write PSA as:
- `PSA`
- `prostate specific antigen`
- `prostate-specific antigen`
- `total PSA`
- `free PSA`
- `PSA density`

All of these mean the same thing. The system maintains a **hand-written list** of these variations (called **aliases**) for each known biomarker.

### The 4-Tier Matching System

If you type a query, the system tries to match it to a known biomarker using 4 increasingly lenient levels:

| Tier | Method | Example |
|------|--------|---------|
| **1 — Exact** | Your query matches a known name/alias exactly | `"PSA"` → PSA pattern |
| **2 — Compact** | Remove hyphens and spaces, then match | `"HER-2"` → stripped to `"her2"` → HER2 pattern |
| **3 — Token-prefix** | Each word in your query must *start* a word in the biomarker name | `"Prostate Vol"` → "prostate" and "vol" are prefixes of "prostate" and "volume" → PSA |
| **4 — Fuzzy (Levenshtein)** | Allow small spelling mistakes | `"Prostrate"` → 1-letter typo → matches "Prostate" → PSA |

**What is Levenshtein distance?** It's a measure of how many single-character changes (insert, delete, or replace a letter) it takes to turn one word into another.
- `"Prostate"` → `"Prostrate"` = 1 change (insert an `r`) → distance = 1 ✓ allowed
- `"PSA"` → `"CSA"` = 1 change (P→C) → distance = 1 ✓ allowed for 3-char words

The allowed tolerance scales with word length:
- Shorter than 3 characters: **must be exact** (prevents `"no"` matching `"mg"`)
- 3–6 characters: **1 edit allowed**
- 7+ characters: **2 edits allowed**

### What If the Biomarker Is Unknown?

If no known pattern matches (e.g., you type `"Ferritin"` and it's not in the database), the system **builds a pattern on the fly**:

1. Takes your query string: `"Ferritin"`
2. Creates a flexible regex: `(?<![a-z0-9])ferrit\w*(?![a-z0-9])` — this matches `"ferritin"`, `"ferritins"`, `"ferritin-bound"`, etc. The `\w*` suffix means "followed by any word characters"
3. Uses 6 generic value-extraction patterns that work for any lab result (numeric, range, categorical)

> **Technical note:** `aliasRegexes` is an array of `RegExp` objects attached to the pattern. For multi-word fallback queries like `"Prostate Vol"`, it generates: `/(?<![a-z0-9])prostat\w*[\s-]+vol\w*(?![a-z0-9])/g` — the `[\s-]+` allows any spacing or hyphen between the words.

---

## How Are Aliases Built? (No AI Involved)

This is often the first question people ask: *"How does the computer know that 'prostate specific antigen' and 'PSA' are the same thing?"*

The honest answer: **a human wrote that list.**

Each biomarker in `biomarkerPatterns.ts` has a hand-curated alias list. For PSA, it looks like this (simplified):

```typescript
aliases: [
  "prostate specific antigen",   // ← longest alias listed first
  "prostate-specific antigen",
  "prostate antigen",
  "psa density",
  "psa velocity",
  "free psa",
  "total psa",
  "psa",                         // ← shortest alias listed last
]
```

**Why longest first?** If `"psa"` were checked before `"free psa"`, the text `"free psa was 1.2"` would match just `"psa"` and miss the clinical context that it's the *free* fraction. By trying `"free psa"` first, we get the right alias.

There is **no machine learning**, no word embeddings, no neural network involved in this. It's just careful human curation combined with smart ordering.

---

## Phase 1 — "Where Is It in the Text?" (Mention Finding)

### Plain English
The system now scans through the doctor's note looking for every place where any of the aliases appear.

For example, in the text:
> *"Total PSA was 8.4 ng/mL. Free PSA was 1.2 ng/mL."*

It finds **two mentions**:
- `"total psa"` at position 0
- `"free psa"` at position 22

### Word Boundary Protection
The system doesn't just search for the string `"psa"` blindly. It uses **word-boundary rules**:

- For a single short alias: uses `(?<![a-z0-9])psa(?![a-z0-9])` — the `(?<!...)` and `(?!...)` are **lookbehind/lookahead assertions** that ensure PSA is not part of a longer word like `"capsaicin"`
- For multi-word aliases: a plain substring search (spaces naturally act as boundaries)

**Overlapping matches** are resolved by keeping the longer one. If `"total psa"` and `"psa"` both match in the same spot, `"total psa"` wins.

---

## Text Normalization (Runs Before Phase 1)

### Plain English
Before any searching happens, the text is "cleaned up" to handle the many weird ways the same thing can be written.

| Problem | Example | Fix |
|---------|---------|-----|
| Non-breaking space (invisible character) | `"PSA\u00A0Level"` | Replaced with regular space |
| Fancy dashes | `"4–6 ng/mL"` (en-dash) | Replaced with hyphen `"4-6 ng/mL"` |
| European decimal comma | `"3,5 ng/mL"` | Converted to `"3.5 ng/mL"` |
| But NOT thousands | `"8,000"` (thousands) | Kept as `"8,000"` |
| Superscript digits | `"10²"` | Converted to `"10^2"` |
| Written numbers | `"four point two"` | Converted to `"4.2"` |
| Everything | All text | Lowercased for matching |

**How does it tell `3,5` (European decimal) from `8,000` (thousands)?**

The regex `/(\d),(\d{1,2})(?!\d)/g` — it only converts when the digits AFTER the comma are **1 or 2 digits long** AND **not followed by another digit**. `8,000` has 3 digits after the comma, so it's left alone.

---

## Phase 2 — "Is It Just Ordered/Pending?" (Pending Check)

### Plain English
Some clinical notes mention a test was ordered but the result isn't back yet:
> *"PSA ordered, result pending."*

The system checks for phrases like `"pending"`, `"ordered"`, `"not available"`, `"awaited"` within 80 characters after each mention. If found, the extracted value is set to **"PENDING"** and the rest of processing is skipped.

---

## Phase 3 — "What's the Surrounding Text?" (Context Window)

### Plain English
For each mention found, the system grabs a "window" of text around it — text before and after the mention — to give the extraction patterns enough context.

For PSA: the window is **250 characters** (125 before + 125 after the mention).

**Important detail:** The left edge of the window is trimmed to the nearest sentence boundary (`.`, `!`, or `?`). This prevents the window from accidentally including numbers from a completely different sentence that happened to precede this one.

> **Example problem without trimming:**
> *"Glucose was 120. PSA was 4.2."* — without trimming, the PSA window would include `"120"` and might accidentally match it as the PSA value.

---

## Phase 4 — "What Is the Actual Value?" (Value Extraction)

### Plain English
This is the heart of the system. The context window text is tested against a series of **patterns** (called regular expressions) in a specific order. **The first pattern that matches wins.**

Think of it like a decision tree: start with the most specific cases and fall back to more general ones.

### Why Does Order Matter?

Take this text: *"PSA decreased from 8.4 to 0.2 ng/mL"*

- If you tried the **simple numeric pattern** first: you'd get `0.2 ng/mL` (the first number found) ✗ — wrong, you'd miss the "from" value
- If you tried the **comparison pattern** first: you'd get `"decreased from 8.4 to 0.2 ng/mL"` ✓ — captures the full change

For PSA, the extraction order is:

| Priority | Pattern Type | Example It Handles |
|----------|-------------|-------------------|
| 1st | Comparison change | `"decreased from 8.4 to 0.2"` |
| 2nd | Undetectable/below limit | `"undetectable"`, `"<0.1 ng/mL"` |
| 3rd | Range | `"3.2–5.0 ng/mL"` |
| 4th | Narrative phrases | `"found to be 4.2"`, `"showed 4.2"`, `"came back at 4.2"` |
| 5th | Standard numeric | `"PSA: 4.2 ng/mL"`, `"PSA was 4.2"` |
| 6th | Categorical | `"negative"`, `"positive"` |

### NegEx — Detecting Negated Values

**Plain English:** Doctors often write things like:
> *"PSA negative for elevation."*
> *"No PSA value obtained."*

These are NOT real results. The system has a **NegEx algorithm** (short for Negation Expression) that detects when a value is being denied.

**How it works:**

1. After finding a potential value, look at the text **between the alias and the value**
2. Check if any **negation cue** appears in that space:
   - `not`, `no`, `never`, `without`, `absent`, `negative`, `denies`, `rules out`
3. BUT — if a **scope terminator** appears before the negation cue, the negation doesn't apply:
   - Scope terminators: `.` `;` `!` `?` or words like `but`, `however`, `although`, `despite`

**Example of NegEx in action:**
- `"PSA not elevated, but currently 8.4 ng/mL"` — the word `"but"` is a scope terminator. So `"not"` (which appeared before `"but"`) does NOT negate the value `"8.4"`. Result: **8.4 ng/mL** ✓
- `"PSA not detected"` — no scope terminator between `"PSA"` and `"detected"`. Result: **negated, skip** ✓

> **Technical implementation:** `isNegatedBetween(contextWindow, aliasEnd, captureStart)` extracts the substring between the alias end-position and the captured value start-position. If `SCOPE_TERMINATORS.test(between)` is true → return false (safe). Otherwise, return `NEGATION_CUES.test(between)`.

### Implicit Value Fallback

If no regex matched at all, the system checks for **qualitative words** that imply a value:

| Word in text | Implied result |
|--------------|---------------|
| `"elevated"`, `"high"` | `"> normal range"` |
| `"within normal limits"`, `"wnl"` | `"< upper limit"` |
| `"low"`, `"reduced"` | `"< normal range"` |

---

## Pronoun Coreference Resolution (Pre-processing)

### Plain English
Doctors often use pronouns instead of repeating the biomarker name:
> *"PSA was 8.4 ng/mL. **It** rose to 12.1 ng/mL on repeat."*

The word `"It"` refers to PSA, but the computer doesn't know that without extra logic. This step replaces `"It"` with `"psa"` so the second mention is found correctly.

**Rules:**
- The pronoun must be at the **start of a sentence** (after `.`, `!`, or `?`)
- Replaceable pronouns: `"It"`, `"This"`, `"The value"`, `"The level"`, `"The result"`, `"The score"`, `"The marker"`, `"The measurement"`
- The biomarker must have been mentioned **within the previous 200 characters**
- The pronoun is replaced with the **shortest alias** of the biomarker (e.g., `"psa"`)

**Result of this step:**
> *"PSA was 8.4 ng/mL. **psa** rose to 12.1 ng/mL on repeat."*

Now the system finds TWO mentions of PSA and can compare both values.

> **Technical note:** This runs as `resolvePronounCoreferences(text, pattern)` before normalization. It uses a regex `/([.!?]\s{0,3})(It|This|The\s+(?:value|level|result|score|marker|measurement))\s+/gi` to find pronouns and replaces them only if a prior alias mention exists within 200 chars.

---

## Phase 5 — "Multiple Matches — Which One to Use?" (Tie-Breaking)

### Plain English
Often a doctor's note mentions a biomarker **more than once**:
> *"Previous PSA was 8.4. Current PSA is 0.2 after treatment."*

The system finds two values: 8.4 and 0.2. Which one does it report?

This depends on the **biomarker's clinical intent**, configured per pattern:

| Strategy | Which Value Is Kept | Used By |
|----------|--------------------|---------|
| `last` | The last mention in the text (= most recent result) | **PSA** |
| `highest` | The numerically largest value | **PiRADS**, **Ki-67**, **PD-L1** (worst-case matters) |
| `first` | The first mention (= primary result) | **ER, PR, HER2, BRCA** |

**Why "last" for PSA?** Because in a clinical note, the most recent PSA is the clinically relevant one — earlier values are context.

**Why "highest" for PiRADS?** A radiologist may mention multiple lesions. You want the most suspicious one (highest score).

---

## Phase 6 — "What's the Source Text?" (Evidence Snippet)

### Plain English
The final step finds the **original sentence** from the doctor's note that contained the winning value. This is shown in the `Evidence` column so you can always verify what the computer extracted.

This uses the **original, un-normalized text** — so the evidence reads naturally, not with all the lowercase/cleaned-up text the system used internally.

`extractSnippet()` looks for the nearest sentence-boundary characters (`.`, `!`, `?`) surrounding the matched position and extracts the full sentence.

---

## Complete Flow — Putting It All Together

Here is the complete journey of a single extraction request:

```
You type "PSA" and click Extract
           │
           ▼
┌─────────────────────────────────────┐
│ PHASE 0: Alias Resolution           │
│ "PSA" → 4-tier matching →           │
│ Found: PSA BiomarkerPattern         │
│ Aliases: ["prostate specific        │
│  antigen", ..., "psa"]              │
└──────────────┬──────────────────────┘
               │ (for each row in your spreadsheet)
               ▼
┌─────────────────────────────────────┐
│ PRE-PASS: Coreference Resolution    │
│ "It rose to 12.1" →                 │
│ "psa rose to 12.1"                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ NORMALIZATION                       │
│ Unicode cleanup, dashes, decimal    │
│ comma, written numbers, lowercase   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ PHASE 1: Mention Finding            │
│ Scan text for all aliases →         │
│ [{alias:"psa", offset:0},           │
│  {alias:"psa", offset:19}]          │
└──────────────┬──────────────────────┘
               │ (for each mention)
               ▼
┌─────────────────────────────────────┐
│ PHASE 2: Pending Check              │
│ "psa pending"? → value="PENDING"    │
│ Otherwise → continue                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ PHASE 3: Context Window             │
│ Grab 250 chars around mention       │
│ Trim left to sentence boundary      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ PHASE 4: Value Extraction           │
│ Try patterns in priority order      │
│ NegEx: skip negated values          │
│ Implicit fallback if nothing matched│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ PHASE 5: Tie-Breaking               │
│ Strategy: "last" for PSA            │
│ → pick candidate at highest offset  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ PHASE 6: Evidence Snippet           │
│ Find original sentence in raw text  │
│ Display to user in Evidence column  │
└──────────────┬──────────────────────┘
               │
               ▼
     Output: { value: "0.2 ng/mL",
               evidence: "PSA decreased
               from 8.4 to 0.2 ng/mL..." }
```

---

## Key Technical Summary (for the developer-minded reader)

| Concept | What it is | Where it lives |
|---------|-----------|---------------|
| `BiomarkerPattern` | TypeScript object: name, aliases, valuePatterns, tieBreaking | `lib/biomarkerPatterns.ts` |
| `aliasRegexes` | Optional array of `RegExp` for flex/fallback matching | `lib/biomarkerPatterns.ts` |
| `levenshtein()` | Edit-distance function for fuzzy tier-4 matching | `lib/biomarkerPatterns.ts` |
| `buildFallbackPattern()` | Dynamically generates a pattern for unknown queries | `lib/biomarkerPatterns.ts` |
| `normalizeText()` | Cleans Unicode, dashes, commas, word numbers | `lib/textNormalize.ts` |
| `extractBiomarker()` | Orchestrates all 6 phases | `lib/extractBiomarker.ts` |
| `isNegatedBetween()` | NegEx: detects negation between alias and value | `lib/extractBiomarker.ts` |
| `resolvePronounCoreferences()` | Replaces "It"/"This" with biomarker alias | `lib/extractBiomarker.ts` |
| `extractSnippet()` | Finds original evidence sentence | `lib/extractBiomarker.ts` |

---

## Why No AI?

A question worth addressing directly: *"Why not just use ChatGPT to read the notes?"*

1. **Privacy** — Patient data never leaves the browser. An AI API call would send data to an external server.
2. **Consistency** — Rules always produce the same output. AI models can vary between runs.
3. **Speed** — Processing thousands of rows takes milliseconds locally. API calls add latency and cost.
4. **Auditability** — You can read exactly which rule matched and why. AI decisions are opaque.
5. **No internet required** — Works offline, in air-gapped hospital environments.

The trade-off: new biomarkers must be manually added to the pattern library. An AI system would handle novel terminology more gracefully — but at the cost of the above benefits.

---

*Document generated from the BioExtract source code — `lib/biomarkerPatterns.ts`, `lib/extractBiomarker.ts`, `lib/textNormalize.ts`*
