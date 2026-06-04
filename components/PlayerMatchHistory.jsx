"use client";

import { formatMatchAnnouncement } from "@/lib/announce";

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resultBadge(result) {
  if (result === "win") {
    return (
      <span className="text-xs font-bold uppercase text-green-400 bg-green-500/15 px-2 py-0.5 rounded">
        Win
      </span>
    );
  }
  if (result === "loss") {
    return (
      <span className="text-xs font-bold uppercase text-red-400 bg-red-500/15 px-2 py-0.5 rounded">
        Loss
      </span>
    );
  }
  return (
    <span className="text-xs font-bold uppercase text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">
      Tie
    </span>
  );
}

export default function PlayerMatchHistory({ history = [], compact = false }) {
  if (!history.length) {
    return (
      <p className="text-slate-500 text-sm">
        No completed open-play games yet. Your results will show here after
        matches end.
      </p>
    );
  }

  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      {history.map((entry) => (
        <li
          key={entry.id}
          className={`rounded-xl border border-slate-800 bg-slate-900/80 ${
            compact ? "p-3" : "p-4"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-white">{entry.eventName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {entry.courtName} · {formatTime(entry.endedAt)}
              </p>
            </div>
            {resultBadge(entry.result)}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {formatMatchAnnouncement(entry.teamA, entry.teamB)}
          </p>
          <p className="text-sm mt-1 tabular-nums">
            <span className="text-slate-500">Your score </span>
            <span
              className={
                entry.result === "win"
                  ? "text-green-400 font-bold"
                  : "text-slate-300"
              }
            >
              {entry.playerScore}
            </span>
            <span className="text-slate-600 mx-1">–</span>
            <span className="text-slate-400">{entry.opponentScore}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
