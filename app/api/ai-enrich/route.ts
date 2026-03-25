/**
 * BioExtract — AI Enrichment API Route
 *
 * Server-side proxy to Anthropic Claude Haiku for unknown biomarker extraction.
 * Keeps the API key on the server; client never sees it.
 *
 * Only fires when NEXT_PUBLIC_AI_ENRICHMENT=true AND ANTHROPIC_API_KEY is set.
 * Context is truncated to 500 chars before forwarding (privacy-first).
 * Hard 3-second timeout against Anthropic to prevent UI stalls.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.BIOEXTRACT_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI enrichment not configured (BIOEXTRACT_ANTHROPIC_API_KEY not set)" },
      { status: 503 }
    );
  }

  let body: { biomarkerName?: unknown; contextText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const biomarkerName = typeof body.biomarkerName === "string" ? body.biomarkerName.trim() : "";
  const contextText = typeof body.contextText === "string" ? body.contextText : "";

  if (!biomarkerName || !contextText) {
    return NextResponse.json({ error: "biomarkerName and contextText are required" }, { status: 400 });
  }

  // Privacy-first: never send more than 500 chars to Anthropic
  const safeContext = contextText.slice(0, 500);

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system:
          "You are a clinical biomarker extraction assistant. Extract only the exact value from the text. Return ONLY valid JSON — no markdown, no explanation.",
        messages: [
          {
            role: "user",
            content:
              `Extract the most clinically relevant value for the biomarker "${biomarkerName}" from the text below.\n` +
              `Return ONLY this JSON: {"value": "...", "confidence": "high|medium|low", "rationale": "..."}\n\n` +
              `Text: ${safeContext}`,
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
      rationale?: string;
    };

    const value = (parsed.value ?? "").trim();
    if (!value || value.toLowerCase() === "not found" || value.toLowerCase() === "n/a") {
      return NextResponse.json({ error: "No value found by model" }, { status: 404 });
    }

    const confidence = ["high", "medium", "low"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "low";

    return NextResponse.json({
      value,
      confidence,
      rationale: (parsed.rationale ?? "").slice(0, 200),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "AI enrichment timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "AI enrichment failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
