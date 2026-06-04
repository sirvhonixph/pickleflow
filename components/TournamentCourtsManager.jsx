"use client";

import { useState } from "react";

export default function TournamentCourtsManager({
  courts = [],
  onAdd,
  onRemove,
  removingId = null,
  adding = false,
  disabled = false,
}) {
  const [label, setLabel] = useState("");

  const handleAdd = async () => {
    await onAdd?.(label);
    setLabel("");
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-300">
          Courts ({courts.length})
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Brackets map to courts in order — Bracket A → Court 1, B → Court 2, etc.
        </p>
      </div>

      {courts.length > 0 ? (
        <ul className="space-y-1.5">
          {courts.map((court, index) => (
            <li
              key={court.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2"
            >
              <span className="text-sm text-slate-200">
                <span className="text-slate-500 mr-2">#{index + 1}</span>
                {court.name}
              </span>
              {courts.length > 1 && (
                <button
                  type="button"
                  disabled={disabled || removingId === court.id}
                  onClick={() => onRemove?.(court.id)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-600 text-slate-400 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50 shrink-0"
                >
                  {removingId === court.id ? "…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-400">Add at least one court to run brackets.</p>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <input
          className="flex-1 min-w-[140px] p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
          placeholder="Court name (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={disabled || adding}
        />
        <button
          type="button"
          disabled={disabled || adding}
          onClick={handleAdd}
          className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add court"}
        </button>
      </div>
    </div>
  );
}
