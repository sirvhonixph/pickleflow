"use client";

import TournamentRoundRobin from "@/components/TournamentRoundRobin";
import { isMatchComplete } from "@/lib/tournament-live";

export default function RoundRobinResultsPanel({
  brackets,
  pairById,
  divisionAdvancement,
  divisionName,
}) {
  if (!brackets?.length) return null;

  const completedCount = brackets.reduce(
    (n, b) =>
      n +
      (b.matches ?? []).filter((m) => isMatchComplete(m)).length,
    0
  );

  return (
    <section className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Elimination round results</h2>
        <p className="text-slate-400 text-sm mt-1">
          {divisionName
            ? `${divisionName} — `
            : ""}
          Final standings and scores from pool play. Scroll here to review who
          qualified for finals.
        </p>
        {completedCount > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {completedCount} match{completedCount === 1 ? "" : "es"} completed
          </p>
        )}
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        {brackets.map((bracket) => (
          <TournamentRoundRobin
            key={bracket.id}
            bracket={bracket}
            pairById={pairById}
            divisionAdvancement={divisionAdvancement}
            readOnly
          />
        ))}
      </div>
    </section>
  );
}
