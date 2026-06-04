"use client";

import CategoryBadge from "@/components/CategoryBadge";
import { formatMatchAnnouncement } from "@/lib/announce";
import { winnerLabel } from "@/lib/match-history";

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TeamRow({ team, score, isWinner, isLoser, basePlayerId }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${
        isWinner
          ? "bg-green-500/15 border border-green-500/40"
          : isLoser
            ? "bg-slate-800/50 opacity-75"
            : "bg-slate-800/80"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isWinner && (
          <span className="text-xs font-bold uppercase text-green-400">
            Winner
          </span>
        )}
        <span className="font-medium">{team.map((p) => p.name).join(" / ")}</span>
        {team.map((p) => (
          <CategoryBadge key={p.playerId} category={p.category} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {team.some((p) => p.playerId === basePlayerId) && (
          <span className="text-xs text-amber-400">Base</span>
        )}
        <span
          className={`text-xl font-bold tabular-nums ${
            isWinner ? "text-green-400" : "text-slate-300"
          }`}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

export default function MatchHistory({ history = [] }) {
  const sorted = [...history].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

  return (
    <section>
      <h2 className="text-xl font-bold mb-1">Game history</h2>
      <p className="text-slate-500 text-sm mb-4">
        Completed matches — winner highlighted in green.
      </p>

      {sorted.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
          No completed games yet. When the host ends a match, it will appear
          here with the winner.
        </div>
      ) : (
        <div className="max-h-[min(480px,55vh)] overflow-y-auto overflow-x-hidden pr-1 -mr-1">
          <ul className="space-y-4">
          {sorted.map((entry) => {
            const win = winnerLabel(entry);
            const teamAWins = entry.winner === "A";
            const teamBWins = entry.winner === "B";
            const isTie = entry.winner === "tie";

            return (
              <li
                key={entry.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <span className="font-semibold text-cyan-400/90">
                      {entry.courtName}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatTime(entry.endedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    {isTie ? (
                      <span className="text-sm font-bold text-amber-400">
                        Tie game
                      </span>
                    ) : (
                      <span className="text-sm">
                        <span className="text-slate-500">Winner · </span>
                        <span className="font-bold text-green-400">
                          {win.text}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 mb-2">
                  {formatMatchAnnouncement(entry.teamA, entry.teamB)}
                </p>

                <div className="space-y-2">
                  <TeamRow
                    team={entry.teamA}
                    score={entry.scoreA}
                    isWinner={teamAWins}
                    isLoser={teamBWins}
                    basePlayerId={entry.basePlayerA}
                  />
                  <TeamRow
                    team={entry.teamB}
                    score={entry.scoreB}
                    isWinner={teamBWins}
                    isLoser={teamAWins}
                    basePlayerId={entry.basePlayerB}
                  />
                </div>
              </li>
            );
          })}
          </ul>
        </div>
      )}
    </section>
  );
}
