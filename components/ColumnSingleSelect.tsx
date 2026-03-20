"use client";

interface ColumnSingleSelectProps {
  headers: string[];
  selectedColumn: string | null;
  onColumnSelect: (col: string) => void;
}

export default function ColumnSingleSelect({
  headers,
  selectedColumn,
  onColumnSelect,
}: ColumnSingleSelectProps) {
  return (
    <div className="space-y-2">
      <p className="label-base">Select the column to search in</p>
      <div className="flex flex-wrap gap-2">
        {headers.map((h) => (
          <button
            key={h}
            onClick={() => onColumnSelect(h)}
            className={
              selectedColumn === h
                ? "col-pill-selected"
                : "col-pill"
            }
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
