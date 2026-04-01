/**
 * BioExtract — TNM Staging AI Enrichment Route
 *
 * Specialized endpoint for TNM multi-field extraction via Claude.
 * Unlike /api/ai-enrich (returns a single value), this route returns a
 * structured JSON object with four fields: T, N, M, and stage_group.
 *
 * Called by extractTNM.enrichTNMWithAI() when the rule engine is missing
 * one or more TNM components. Only fills gaps — fields already extracted
 * by the rule engine are NOT sent for override.
 *
 * Privacy: context truncated to 1200 chars server-side.
 * Timeout: 5 seconds (longer than single-value route due to more complex parsing).
 */

import { NextRequest, NextResponse } from "next/server";

const TNM_SYSTEM_PROMPT =
  "You are a clinical oncology staging assistant. Extract TNM staging components from pathology and clinical notes. " +
  "You must handle ALL clinical report formats — structured tables, narrative text, compact codes, and mixed styles. " +
  "Return ONLY valid JSON — no markdown, no explanation, no surrounding text.";

function buildTNMPrompt(context: string): string {
  return (
    `Extract the TNM staging components from this clinical text. Handle ANY format you encounter.\n\n` +
    `Return ONLY this JSON object. Use null for any component not found:\n` +
    `{"T": "pT2a", "N": "N0", "M": "M0", "stage_group": "Stage IIB", "confidence": "high|medium|low"}\n\n` +
    `Rules:\n` +
    `- T: primary tumour category exactly as written. null if absent.\n` +
    `- N: regional nodes category exactly as written. null if absent.\n` +
    `- M: distant metastasis category exactly as written. null if absent.\n` +
    `- stage_group: AJCC/pathologic overall stage (e.g. "Stage IIB", "Stage IV"). null if absent.\n` +
    `- Do NOT infer or calculate stage_group from T+N+M — only extract what is explicitly stated.\n` +
    `- Extract values EXACTLY as written — preserve prefixes (p, c, yp, rp) and suffixes (a, b, is, mi).\n\n` +
    `All these formats express the same data — extract correctly from whichever appears:\n` +
    `  Compact:      "pT2N0M0"  |  "T3N1M0"  |  "ypT1bN0M0"\n` +
    `  AJCC table:   "Primary Tumor (T): T2a" / "Regional Lymph Nodes (N): N1"\n` +
    `  Colon format: "T: pT3a, N: pN1b, M: M0"\n` +
    `  Dash format:  "T – pT2b / N – N0 / M – M0"\n` +
    `  Narrative:    "pathologic staging revealed T2 N0 M0 disease"\n` +
    `  Category:     "T category: T2a" / "N stage: N1" / "M classification: M0"\n\n` +
    `Text:\n${context}`
  );
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.BIOEXTRACT_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI enrichment not configured" },
      { status: 503 }
    );
  }

  let body: { contextText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contextText = typeof body.contextText === "string" ? body.contextText : "";
  if (!contextText.trim()) {
    return NextResponse.json({ error: "contextText is required" }, { status: 400 });
  }

  // Privacy: never send more than 1200 chars to Anthropic
  const safeContext = contextText.slice(0, 1200);
  const model = process.env.BIOEXTRACT_AI_MODEL ?? "claude-sonnet-4-6";
  const prompt = buildTNMPrompt(safeContext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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
        max_tokens: 150,
        system: TNM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
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

    // Strip markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as {
      T?: string | null;
      N?: string | null;
      M?: string | null;
      stage_group?: string | null;
      confidence?: string;
    };

    const confidence = ["high", "medium", "low"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "low";

    return NextResponse.json({
      T: parsed.T ?? null,
      N: parsed.N ?? null,
      M: parsed.M ?? null,
      stage_group: parsed.stage_group ?? null,
      confidence,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "TNM AI enrichment timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "TNM AI enrichment failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
