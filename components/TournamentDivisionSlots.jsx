"use client";

import { getAllDivisionSlotStatuses } from "@/lib/tournament-registration";
import { categoryLabel } from "@/lib/categories";

export default function TournamentDivisionSlots({
  event,
  highlightSkill = null,
  compact = false,
}) {
  const slots = getAllDivisionSlotStatuses(event);
  if (!slots.length) return null;

  const openCount = slots.filter((s) => !s.isFull).length;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <p className="text-slate-500 text-sm">
          {openCount === 0
            ? "All divisions are full."
            : `${openCount} division${openCount === 1 ? "" : "s"} still accepting pairs.`}
        </p>
      )}
      <ul
        className={
          compact
            ? "flex flex-wrap gap-2"
            : "grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
        }
      >
        {slots.map((slot) => {
          const isMine =
            highlightSkill && slot.skill === highlightSkill;
          return (
            <li
              key={slot.divisionId}
              className={`rounded-lg border px-3 py-2 ${
                compact ? "text-xs" : "text-sm"
              } ${
                slot.isFull
                  ? "border-slate-700 bg-slate-800/40"
                  : "border-cyan-500/30 bg-cyan-500/5"
              } ${isMine ? "ring-1 ring-purple-500/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-slate-200">{slot.label}</span>
                <span
                  className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    slot.isFull
                      ? "bg-slate-700 text-slate-400"
                      : "bg-green-500/20 text-green-300"
                  }`}
                >
                  {slot.isFull ? "Full" : "Open"}
                </span>
              </div>
              <p className="text-slate-500 mt-1">
                {slot.registered}/{slot.limit} pairs
                {!slot.isFull && (
                  <span className="text-cyan-400/90">
                    {" "}
                    · {slot.remaining} slot{slot.remaining === 1 ? "" : "s"} left
                  </span>
                )}
              </p>
              {isMine && !compact && (
                <p className="text-xs text-purple-400/90 mt-1">
                  Your category ({categoryLabel(highlightSkill)})
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
