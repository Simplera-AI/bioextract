"use client";

interface SheetSelectorProps {
  sheetNames: string[];
  selectedSheet: string | null;
  onSheetSelect: (name: string) => void;
}

export default function SheetSelector({
  sheetNames,
  selectedSheet,
  onSheetSelect,
}: SheetSelectorProps) {
  if (sheetNames.length <= 1) return null;

  return (
    <div className="space-y-2">
      <p className="label-base">Select sheet</p>
      <div className="flex flex-wrap gap-2">
        {sheetNames.map((name) => (
          <button
            key={name}
            onClick={() => onSheetSelect(name)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              selectedSheet === name
                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-600 text-teal-700 dark:text-teal-300"
                : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-600 dark:hover:text-teal-400"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
