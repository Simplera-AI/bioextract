"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { BIOMARKER_PATTERNS } from "@/lib/biomarkerPatterns";

// List of known biomarker names for autocomplete
const KNOWN_BIOMARKERS = BIOMARKER_PATTERNS.map((p) => p.name);

interface BiomarkerInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function BiomarkerInput({ value, onChange, disabled }: BiomarkerInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim().length > 0
    ? KNOWN_BIOMARKERS.filter((name) =>
        name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8)
    : KNOWN_BIOMARKERS.slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      <label className="label-base">Biomarker / Molecular Marker to extract</label>
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { setFocused(true); setShowSuggestions(true); }}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            placeholder="e.g. PSA, HER2, EGFR or any biomarker name…"
            className={[
              "input-base pl-9 pr-10",
              focused ? "border-teal-500 ring-2 ring-teal-500/30" : "",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={() => setShowSuggestions((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            tabIndex={-1}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showSuggestions ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Known biomarkers</p>
            </div>
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(name);
                  setShowSuggestions(false);
                }}
                className={[
                  "w-full text-left px-4 py-2 text-sm",
                  "hover:bg-teal-50 dark:hover:bg-teal-950/30",
                  "text-gray-700 dark:text-gray-300",
                  "hover:text-teal-700 dark:hover:text-teal-300",
                  value.toLowerCase() === name.toLowerCase()
                    ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 font-medium"
                    : "",
                  "transition-colors duration-100",
                ].join(" ")}
              >
                {name}
              </button>
            ))}
            {value.trim().length > 0 && !KNOWN_BIOMARKERS.some(n => n.toLowerCase() === value.toLowerCase().trim()) && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  &ldquo;{value}&rdquo; — custom biomarker (smart fallback extraction)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Select from the list above or type any biomarker name for automatic extraction.
      </p>
    </div>
  );
}
