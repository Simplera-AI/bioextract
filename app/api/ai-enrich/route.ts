/**
 * BioExtract — AI Enrichment API Route
 *
 * Server-side proxy to Anthropic Claude for unknown biomarker extraction.
 * Keeps the API key on the server; client never sees it.
 *
 * Only fires when NEXT_PUBLIC_AI_ENRICHMENT=true AND BIOEXTRACT_ANTHROPIC_API_KEY is set.
 * Context is truncated to 800 chars before forwarding (privacy-first).
 * Hard 3-second timeout against Anthropic to prevent UI stalls.
 *
 * Model is configurable via BIOEXTRACT_AI_MODEL env var.
 * Default: claude-sonnet-4-6 (accurate on complex genomic/clinical text).
 * Downgrade to claude-haiku-4-5-20251001 for faster/cheaper processing.
 */

import { NextRequest, NextResponse } from "next/server";
import type { BiomarkerCategory } from "@/lib/biomarkerTypeInference";

// ─── Category-aware prompt builder ───────────────────────────────────────────

const CATEGORY_INSTRUCTIONS: Record<BiomarkerCategory, string> = {
  "molecular-gene":
    `This is a molecular/genomic biomarker (gene name). Extract the mutation, variant, or status.
Examples of valid values: "G12C", "V600E", "c.1799T>A", "p.Val600Glu", "Exon 19 deletion",
"Amplified", "Wild-type", "Not detected", "FGFR3-TACC3 fusion", "Copy number gain", "S310F".`,

  "lab-value":
    `This is a laboratory measurement. Extract the numeric value with its units.
Examples of valid values: "4.2 ng/mL", "450 U/mL", "12.5 g/dL", "< 0.1 ng/mL", "> 4.0", "2.3 mmol/L".`,

  "ihc-marker":
    `This is an immunohistochemistry (IHC) or pathology marker. Extract the score or status.
Examples of valid values: "3+", "2+", "Positive", "Negative", "80%", "Allred score 7/8", "Strong positive".`,

  "pathology-score":
    `This is a pathology or clinical scoring system. Extract the score, grade, or category.
Examples of valid values: "7 (3+4)", "Grade 2", "Score 5", "Stage III", "4/5", "High grade".`,

  "generic":
    `Extract the most clinically relevant value. This may be a number with units, a categorical result
(positive/negative/detected/not detected), a mutation code, or a clinical status.`,
};

function buildPrompt(
  biomarkerName: string,
  context: string,
  category: BiomarkerCategory
): string {
  const instructions = CATEGORY_INSTRUCTIONS[category] ?? CATEGORY_INSTRUCTIONS["generic"];
  return (
    `You are extracting a clinical value from a medical note. Biomarker: "${biomarkerName}"\n\n` +
    `${instructions}\n\n` +
    `Rules:\n` +
    `- Extract the EXACT value as written in the text — do not interpret or rephrase\n` +
    `- The value may appear in ANY format: "PSA: 4.2", "PSA was 4.2 ng/mL", "PSA concentration measured at 4.2",\n` +
    `  "PSA = 4.2", "PSA level: 4.2 ng/mL", "PSA (4.2)", table cells, structured reports, narrative notes.\n` +
    `- Look for the value ASSOCIATED with the biomarker name — it may follow ":", "=", "–", "was", "of", "at", etc.\n` +
    `- If the biomarker is mentioned but has no value, return "not found"\n` +
    `- If the value is pending/awaited, return "PENDING"\n` +
    `- Return ONLY this JSON, nothing else: {"value": "...", "confidence": "high|medium|low"}\n\n` +
    `Text: ${context}`
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.BIOEXTRACT_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI enrichment not configured (BIOEXTRACT_ANTHROPIC_API_KEY not set)" },
      { status: 503 }
    );
  }

  let body: { biomarkerName?: unknown; contextText?: unknown; biomarkerCategory?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const biomarkerName = typeof body.biomarkerName === "string" ? body.biomarkerName.trim() : "";
  const contextText = typeof body.contextText === "string" ? body.contextText : "";
  const biomarkerCategory: BiomarkerCategory =
    typeof body.biomarkerCategory === "string" &&
    ["molecular-gene", "lab-value", "ihc-marker", "pathology-score", "generic"].includes(body.biomarkerCategory)
      ? (body.biomarkerCategory as BiomarkerCategory)
      : "generic";

  if (!biomarkerName || !contextText) {
    return NextResponse.json({ error: "biomarkerName and contextText are required" }, { status: 400 });
  }

  // Privacy-first: never send more than 800 chars to Anthropic
  const safeContext = contextText.slice(0, 800);

  const model = process.env.BIOEXTRACT_AI_MODEL ?? "claude-sonnet-4-6";
  const prompt = buildPrompt(biomarkerName, safeContext, biomarkerCategory);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        system:
          "You are a clinical biomarker extraction assistant. Extract only the exact value from the text. Return ONLY valid JSON — no markdown, no explanation.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Anthropic error ${response.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text: string }>;
    };

    const rawText = data.content?.[0]?.text ?? "";
    if (!rawText) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
    }

    // Strip any accidental markdown fences before parsing
    const cleaned = rawText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as {
      value?: string;
      confidence?: string;
    };

    const value = (parsed.value ?? "").trim();
    if (!value || value.toLowerCase() === "not found" || value.toLowerCase() === "n/a") {
      return NextResponse.json({ error: "No value found by model" }, { status: 404 });
    }

    const confidence = ["high", "medium", "low"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "low";

    return NextResponse.json({ value, confidence });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "AI enrichment timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "AI enrichment failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
