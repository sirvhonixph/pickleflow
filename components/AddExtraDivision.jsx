"use client";

import { useMemo, useState } from "react";
import { DIVISION_FORMATS, getEventDivisions } from "@/lib/tournament-divisions";
import { SKILL_CATEGORIES } from "@/lib/categories";

export default function AddExtraDivision({ event, onAdd, busy }) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState("beginner");
  const [format, setFormat] = useState("mens");

  const existingIds = useMemo(
    () => new Set(getEventDivisions(event).map((d) => d.id)),
    [event]
  );

  const canAdd = (s, f) => !existingIds.has(`${s}_${f}_doubles`);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onAdd({ skill, format });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-2 rounded-lg border border-dashed border-purple-500/50 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400 transition"
      >
        + Add another division
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-slate-800"
    >
      <div>
        <label className="text-xs text-slate-500">Skill</label>
        <select
          className="block mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          {SKILL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">Format</label>
        <select
          className="block mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {DIVISION_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={busy || !canAdd(skill, format)}
        className="px-3 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-3 py-2 text-sm text-slate-500 hover:text-slate-300"
      >
        Cancel
      </button>
      {!canAdd(skill, format) && (
        <p className="w-full text-xs text-amber-400/90">That division already exists.</p>
      )}
    </form>
  );
}
