/**
 * BioExtract — AI Attribution Validation API Route
 *
 * Server-side proxy that asks Claude Haiku whether an extracted value
 * actually belongs to the queried biomarker, or was accidentally grabbed
 * from an adjacent biomarker in the same clinical text.
 *
 * Use case: "TP53 G245S | BRCA2 c.1813delA" — rule engine may return
 * c.1813delA for a TP53 query. This route answers: does c.1813delA
 * actually belong to TP53, or to BRCA2?
 *
 * Only fires when NEXT_PUBLIC_AI_ENRICHMENT=true AND ANTHROPIC_API_KEY is set.
 * Context truncated to 600 chars (slightly more than enrichment — disambiguation
 * needs broader view to see all biomarkers in the vicinity).
 * Hard 3-second timeout against Anthropic.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI validation not configured (ANTHROPIC_API_KEY not set)" },
      { status: 503 }
    );
  }

  let body: { biomarkerName?: unknown; extractedValue?: unknown; contextText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const biomarkerName = typeof body.biomarkerName === "string" ? body.biomarkerName.trim() : "";
  const extractedValue = typeof body.extractedValue === "string" ? body.extractedValue.trim() : "";
  const contextText = typeof body.contextText === "string" ? body.contextText : "";

  if (!biomarkerName || !extractedValue || !contextText) {
    return NextResponse.json(
      { error: "biomarkerName, extractedValue, and contextText are required" },
      { status: 400 }
    );
  }

  // Allow broader context for attribution — needs to see all biomarkers in the text
  const safeContext = contextText.slice(0, 600);

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
        max_tokens: 100,
        system:
          "You are a clinical genomics expert verifying biomarker attribution. " +
          "Return ONLY valid JSON — no markdown, no explanation.",
        messages: [
          {
            role: "user",
            content:
              `I searched clinical text for biomarker "${biomarkerName}" and extracted the value "${extractedValue}".\n` +
              `Does "${extractedValue}" represent a result FOR "${biomarkerName}" specifically, ` +
              `or does it belong to a DIFFERENT biomarker mentioned in the text?\n\n` +
              `Clinical text:\n${safeContext}\n\n` +
              `Return ONLY this JSON: {"attribution": "correct" | "wrong" | "uncertain", "confidence": "high" | "medium" | "low", "reason": "one sentence"}`,
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
      attribution?: string;
      confidence?: string;
      reason?: string;
    };

    const attribution = ["correct", "wrong", "uncertain"].includes(parsed.attribution ?? "")
      ? parsed.attribution
      : "uncertain";
    const confidence = ["high", "medium", "low"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "low";

    return NextResponse.json({
      attribution,
      confidence,
      reason: (parsed.reason ?? "").slice(0, 200),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "AI validation timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "AI validation failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
