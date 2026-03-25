import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local so tests can access BIOEXTRACT_ANTHROPIC_API_KEY.
// Only sets variables that aren't already in process.env (system vars stay untouched).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.local absent — skippable tests will self-skip
}
