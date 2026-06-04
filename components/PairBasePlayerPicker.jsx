"use client";

import { getPairBasePlayerId } from "@/lib/tournament-pairs";

/** Host picks which partner is the base (baseline) player for this pair. */
export default function PairBasePlayerPicker({ pair, busy, onSelect }) {
  const baseId = getPairBasePlayerId(pair);
  const players = [pair?.player1, pair?.player2].filter((p) => p?.playerId);

  return (
    <div className="mt-2 pt-2 border-t border-slate-800">
      <p className="text-[11px] text-slate-500 mb-1.5">
        Base player for this pair
      </p>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => {
          const selected = player.playerId === baseId;
          return (
            <button
              key={player.playerId}
              type="button"
              disabled={busy || selected}
              onClick={() => onSelect(player.playerId)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors disabled:opacity-70 ${
                selected
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-300 font-medium"
                  : "bg-slate-800 border-slate-700 hover:border-amber-500/40 text-slate-300"
              }`}
            >
              {player.name}
              {selected ? " · Base" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function basePlayerName(pair) {
  const id = getPairBasePlayerId(pair);
  if (!id) return null;
  if (pair?.player1?.playerId === id) return pair.player1.name;
  if (pair?.player2?.playerId === id) return pair.player2.name;
  return null;
}

/** Read-only: Team A / Team B base from each pair’s registration. */
export function MatchPairBasesSummary({ pairA, pairB, teamALabel = "Team A", teamBLabel = "Team B" }) {
  const nameA = basePlayerName(pairA);
  const nameB = basePlayerName(pairB);

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5 text-xs space-y-1">
      <p className="text-slate-500 font-medium">Base players (from pair setup)</p>
      <p>
        <span className="text-cyan-400/90">{teamALabel}:</span>{" "}
        {nameA ? (
          <span className="text-amber-300">{nameA}</span>
        ) : (
          <span className="text-red-400/90">not set — edit pairs</span>
        )}
      </p>
      <p>
        <span className="text-purple-400/90">{teamBLabel}:</span>{" "}
        {nameB ? (
          <span className="text-amber-300">{nameB}</span>
        ) : (
          <span className="text-red-400/90">not set — edit pairs</span>
        )}
      </p>
    </div>
  );
}
