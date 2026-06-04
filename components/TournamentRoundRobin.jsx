"use client";

import { pairDisplayName } from "@/lib/tournament-divisions";
import { matchesPerPairInRoundRobin } from "@/lib/tournament-brackets";
import { getRemainingMatchupsForPair } from "@/lib/tournament-standings";
import {
  isMatchComplete,
  isMatchLive,
  isMatchPlayable,
  matchCountsForStandings,
} from "@/lib/tournament-live";

export default function TournamentRoundRobin({
  bracket,
  pairById,
  divisionAdvancement,
  host,
  onStartMatch,
  startingMatchId,
  readOnly = false,
}) {
  const standings = bracket.standings ?? [];
  const advanced = new Set(bracket.advancedPairIds ?? []);
  const wildcardIds = new Set(
    (divisionAdvancement?.wildcards ?? [])
      .filter((w) => w.bracketId === bracket.id)
      .map((w) => w.pairId)
  );
  const divisionReady = divisionAdvancement?.ready;
  const showTiebreakCols = bracket.poolComplete;
  const pairCount = bracket.pairIds?.length ?? 0;
  const perPair =
    bracket.roundRobinMeta?.matchesPerPair ??
    matchesPerPairInRoundRobin(pairCount);
  const expectedTotal =
    bracket.roundRobinMeta?.matchCount ??
    (pairCount >= 2 ? (pairCount * (pairCount - 1)) / 2 : 0);
  const finished =
    bracket.roundRobinMeta?.finishedMatches ??
    (bracket.matches ?? []).filter((m) => matchCountsForStandings(m)).length;
  const matchesLeft =
    bracket.roundRobinMeta?.matchesRemaining ??
    Math.max(0, expectedTotal - finished);
  const playableCount = (bracket.matches ?? []).filter((m) =>
    isMatchPlayable(m)
  ).length;

  function formatPointDiff(diff) {
    if (typeof diff !== "number" || Number.isNaN(diff)) return "—";
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{bracket.label}</h3>
          <p className="text-sm text-cyan-400">{bracket.courtName}</p>
          {pairCount >= 2 && (
            <p className="text-xs text-slate-500 mt-0.5">
              Round robin: {pairCount} pairs, {expectedTotal} matches total — each
              pair must play {perPair} games ({finished}/{expectedTotal} done
              {matchesLeft > 0 ? `, ${matchesLeft} left` : ""})
            </p>
          )}
        </div>
        {readOnly && (
          <span className="text-xs font-bold px-2 py-1 rounded bg-slate-700 text-slate-300">
            {(bracket.matches ?? []).some((m) => isMatchComplete(m))
              ? "Results"
              : "Schedule"}
          </span>
        )}
        {!readOnly && bracket.poolComplete && !divisionReady && (
          <span className="text-xs font-bold px-2 py-1 rounded bg-green-500/20 text-green-400">
            Bracket complete
          </span>
        )}
        {!readOnly && !bracket.poolComplete && matchesLeft > 0 && (
          <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-400">
            {matchesLeft} match{matchesLeft === 1 ? "" : "es"} left
          </span>
        )}
        {divisionReady && (
          <span className="text-xs font-bold px-2 py-1 rounded bg-green-500/20 text-green-400">
            Advancement set
          </span>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-400 mb-2">Standings</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-left border-b border-slate-800">
                <th className="py-2 pr-2">#</th>
                <th className="py-2">Pair</th>
                <th className="py-2 text-center">W</th>
                <th className="py-2 text-center">L</th>
                <th
                  className="py-2 text-center"
                  title={`Games played (need ${perPair} per pair)`}
                >
                  GP
                </th>
                <th className="py-2 text-right" title="Win rate in completed games">
                  Win %
                </th>
                {showTiebreakCols && (
                  <>
                    <th
                      className="py-2 text-right pl-2 tabular-nums"
                      title="Total points scored"
                    >
                      For
                    </th>
                    <th
                      className="py-2 text-right pl-2 tabular-nums"
                      title="Total points allowed"
                    >
                      Agst
                    </th>
                    <th
                      className="py-2 text-right pl-2 tabular-nums"
                      title="Point differential (For − Agst); breaks ties when TB matches"
                    >
                      +/−
                    </th>
                    <th
                      className="py-2 text-right pl-2 tabular-nums"
                      title="Wins + avg points in wins & losses (2nd-place tiebreak)"
                    >
                      TB
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr
                  key={row.pairId}
                  className={`border-b border-slate-800/80 ${
                    advanced.has(row.pairId) ? "bg-green-500/10" : ""
                  }`}
                >
                  <td className="py-2 pr-2 font-bold text-slate-500">{i + 1}</td>
                  <td className="py-2 font-medium">
                    <div>{row.name}</div>
                    {!bracket.poolComplete &&
                      finished > 0 &&
                      (row.matchesPlayed ?? 0) < perPair && (
                        <p className="text-[10px] text-amber-400/90 mt-0.5 font-normal">
                          Still needs:{" "}
                          {getRemainingMatchupsForPair(bracket, row.pairId, pairById)
                            .map((m) => m.opponentName)
                            .join(", ") || "more games"}
                        </p>
                      )}
                    {divisionReady && advanced.has(row.pairId) && (
                      <span className="ml-2 text-xs text-green-400 font-bold">
                        {wildcardIds.has(row.pairId) ? "WILDCARD" : "ADVANCES"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center text-green-400">{row.wins}</td>
                  <td className="py-2 text-center text-red-400/80">{row.losses}</td>
                  <td
                    className={`py-2 text-center tabular-nums ${
                      (row.matchesPlayed ?? 0) >= perPair
                        ? "text-green-400"
                        : "text-amber-400"
                    }`}
                  >
                    {row.matchesPlayed ?? 0}/{perPair}
                  </td>
                  <td className="py-2 text-right">{row.winPct}%</td>
                  {showTiebreakCols && (
                    <>
                      <td className="py-2 text-right pl-2 text-slate-300 tabular-nums">
                        {row.pointsFor ?? 0}
                      </td>
                      <td className="py-2 text-right pl-2 text-slate-400 tabular-nums">
                        {row.pointsAgainst ?? 0}
                      </td>
                      <td
                        className={`py-2 text-right pl-2 font-semibold tabular-nums ${
                          (row.pointDiff ?? 0) > 0
                            ? "text-cyan-300"
                            : (row.pointDiff ?? 0) < 0
                              ? "text-red-400/90"
                              : "text-slate-400"
                        }`}
                      >
                        {formatPointDiff(row.pointDiff)}
                      </td>
                      <td className="py-2 text-right pl-2 text-slate-400 tabular-nums">
                        {i === 0
                          ? "—"
                          : typeof row.tieBreaker === "number"
                            ? row.tieBreaker
                            : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {showTiebreakCols ? (
            <>
              Rank order: wins → TB → +/−. GP must be {perPair}/{perPair} for every
              pair before this bracket is final.{" "}
              {divisionReady
                ? "Green = advances to quarterfinals."
                : "Finish all remaining matches to lock advancement."}
            </>
          ) : (
            <>
              Pool play rules: each pair plays every other pair in this bracket once (
              {perPair} games each). End each match with a winner on the court. GP
              shows games played; tiebreak columns appear when the bracket is fully
              done.
            </>
          )}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-400 mb-2">
          {readOnly ? "Match results" : "Round robin schedule"}
        </h4>
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {(bracket.matches ?? []).map((m) => {
            const nameA =
              pairById.get(m.pairAId)?.displayName ??
              pairDisplayName(pairById.get(m.pairAId) ?? {});
            const nameB =
              pairById.get(m.pairBId)?.displayName ??
              pairDisplayName(pairById.get(m.pairBId) ?? {});
            const done = isMatchComplete(m);
            const live = isMatchLive(m);

            return (
              <li
                key={m.id}
                className={`rounded-lg border p-3 text-sm ${
                  live
                    ? "border-green-500/40 bg-green-500/5"
                    : done
                      ? "border-slate-700 bg-slate-800/40"
                      : "border-slate-800 bg-slate-900/50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {nameA}{" "}
                    <span className="text-slate-500">vs</span> {nameB}
                  </p>
                  {live && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500 text-black">
                      LIVE
                    </span>
                  )}
                </div>
                {live ? (
                  <p className="text-cyan-400 mt-1 tabular-nums font-semibold">
                    {m.scoreA ?? 0} – {m.scoreB ?? 0}
                    <span className="text-slate-500 font-normal ml-2 text-xs">
                      scoring on {bracket.courtName}
                    </span>
                  </p>
                ) : done ? (
                  <p className="text-slate-400 mt-1 tabular-nums">
                    {m.scoreA ?? 0} – {m.scoreB ?? 0}
                    <span className="text-green-400 ml-2">final</span>
                  </p>
                ) : !readOnly && host && onStartMatch ? (
                  <button
                    type="button"
                    disabled={startingMatchId === m.id}
                    onClick={() => onStartMatch(m.id)}
                    className="mt-2 px-3 py-1 bg-cyan-500/90 text-black text-xs font-semibold rounded disabled:opacity-50"
                  >
                    {startingMatchId === m.id ? "Starting…" : "Start on court"}
                  </button>
                ) : (
                  <p className="text-slate-500 mt-1 text-xs">Scheduled</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
