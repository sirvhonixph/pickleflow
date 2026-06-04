"use client";

import AddExtraDivision from "@/components/AddExtraDivision";
import {
  TOURNAMENT_DIVISIONS,
  divisionLabel,
  getEventDivisions,
  getOfferedDivisions,
} from "@/lib/tournament-divisions";
import { getDivisionSlotStatus } from "@/lib/tournament-registration";

export default function OfferedDivisionsPicker({
  value = [],
  onChange,
  divisions: divisionsProp,
  event,
  onAddDivision,
  addDivisionBusy = false,
}) {
  const divisions =
    divisionsProp ??
    (event ? getEventDivisions(event) : TOURNAMENT_DIVISIONS).map((d) => ({
      ...d,
      label: d.label ?? divisionLabel(d.id, event ?? null),
    }));
  const allIds = divisions.map((d) => d.id);

  const toggle = (id) => {
    const current = value.length === 0 ? allIds : value;
    let next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    if (next.length === 0) return;
    onChange(next.length === allIds.length ? [] : next);
  };

  const isChecked = (id) => value.length === 0 || value.includes(id);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Choose which divisions players can register for.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
        {divisions.map((d) => (
          <label
            key={d.id}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm cursor-pointer hover:border-slate-600"
          >
            <input
              type="checkbox"
              checked={isChecked(d.id)}
              onChange={() => toggle(d.id)}
            />
            <span>
              {d.label ?? divisionLabel(d.id, event ?? null)}
              {d.extra ? (
                <span className="ml-1 text-xs text-purple-400">(added)</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {onAddDivision && event && (
        <AddExtraDivision
          event={event}
          busy={addDivisionBusy}
          onAdd={onAddDivision}
        />
      )}
    </div>
  );
}

export function OfferedDivisionsList({ event, compact = false }) {
  const divisions = event ? getOfferedDivisions(event) : [];

  if (!divisions.length) {
    return (
      <p className="text-sm text-amber-400">No divisions offered yet.</p>
    );
  }

  return (
    <ul
      className={
        compact ? "space-y-1 text-sm" : "grid sm:grid-cols-2 gap-2 text-sm"
      }
    >
      {divisions.map((d) => {
        const slot = getDivisionSlotStatus(event, d.id);
        return (
          <li
            key={d.id}
            className="rounded-lg border border-slate-700 px-3 py-2 bg-slate-950/40"
          >
            <span className="font-medium text-purple-300/90">
              {divisionLabel(d.id, event)}
            </span>
            <span className="text-slate-500 ml-2">
              {slot.isFull
                ? "Full"
                : `${slot.remaining} slot${slot.remaining === 1 ? "" : "s"} left`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
