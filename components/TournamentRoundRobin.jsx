"use client";

import { useMemo } from "react";
import { pairDisplayName } from "@/lib/tournament-divisions";
import {
  expectedRoundRobinMatchCount,
  findDuplicateRoundRobinPairings,
  getBracketRoundRobinMatches,
  matchesPerPairInRoundRobin,
  normalizeStoredMatch,
} from "@/lib/tournament-brackets";
import {
  compareStandings,
  orderStandingsForDisplay,
  ROUND_ROBIN_WIN_POINTS,
} from "@/lib/tournament-standings";
import {
  isMatchComplete,
  isMatchLive,
  isMatchPlayable,
  isRoundRobinMatchDone,
  matchCountsForStandings,
} from "@/lib/tournament-live";
import {
  isForfeitMatch,
  needsRematch,
} from "@/lib/tournament-match-outcome";

function MatchScheduleRow({
  m,
  bracket,
  pairById,
  readOnly,
  host,
  onStartMatch,
  onForfeitWin,
  startingMatchId,
  forfeitBusyId,
}) {
  const nameA =
    pairById.get(m.pairAId)?.displayName ??
    pairDisplayName(pairById.get(m.pairAId) ?? {});
  const nameB =
    pairById.get(m.pairBId)?.displayName ??
    pairDisplayName(pairById.get(m.pairBId) ?? {});
  const live = isMatchLive(m);
  const done =
    isRoundRobinMatchDone(m) || matchCountsForStandings(m);
  const playable = isMatchPlayable(m);
  const rematch = !done && needsRematch(m);
  const forfeit = isForfeitMatch(m);
  const canStart = playable && !live;
  const nameAShort = nameA.split(" / ")[0] ?? "Pair A";
  const nameBShort = nameB.split(" / ")[0] ?? "Pair B";

  return (
    <li
      className={`rounded-lg border p-3 text-sm transition-colors ${
        live
          ? "border-green-500/40 bg-green-500/5"
          : done
            ? "border-slate-800/80 bg-slate-900/30 opacity-55"
            : canStart || rematch
              ? "border-cyan-500/40 bg-cyan-500/5"
              : "border-slate-800 bg-slate-900/50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {m.scheduleOrder != null && (
            <span className="text-slate-500 font-normal mr-2">
              #{m.scheduleOrder}
            </span>
          )}
          {nameA} <span className="text-slate-500">vs</span> {nameB}
        </p>
        {live && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500 text-black">
            LIVE
          </span>
        )}
        {rematch && !live && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
            Rematch
          </span>
        )}
        {done && !live && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-400">
            Done
          </span>
        )}
        {playable && !live && !rematch && !done && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
            To play
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
          <span className="text-green-400 ml-2">
            {forfeit ? "default win" : "final"}
          </span>
        </p>
      ) : rematch ? (
        <p className="text-slate-400 mt-1 tabular-nums">
          {m.scoreA ?? 0} – {m.scoreB ?? 0}
          <span className="text-amber-400 ml-2 text-xs">needs clear winner</span>
        </p>
      ) : null}
      {!readOnly && host && canStart && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onStartMatch && (
            <button
              type="button"
              disabled={startingMatchId === m.id || forfeitBusyId === m.id}
              onClick={() => onStartMatch(m.id)}
              className="px-3 py-1.5 bg-cyan-500 text-black text-xs font-semibold rounded disabled:opacity-50"
            >
              {startingMatchId === m.id ? "Starting…" : "Start on court"}
            </button>
          )}
          {onForfeitWin && (
            <>
              <button
                type="button"
                disabled={forfeitBusyId === m.id || startingMatchId === m.id}
                onClick={() => onForfeitWin(m.id, m.pairAId)}
                className="px-2 py-1 text-[10px] font-semibold rounded border border-amber-500/40 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {forfeitBusyId === m.id ? "…" : `Default · ${nameAShort}`}
              </button>
              <button
                type="button"
                disabled={forfeitBusyId === m.id || startingMatchId === m.id}
                onClick={() => onForfeitWin(m.id, m.pairBId)}
                className="px-2 py-1 text-[10px] font-semibold rounded border border-amber-500/40 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {forfeitBusyId === m.id ? "…" : `Default · ${nameBShort}`}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function TournamentRoundRobin({
  bracket,
  pairById,
  divisionAdvancement,
  scheduleResetAt,
  host,
  onStartMatch,
  onForfeitWin,
  startingMatchId,
  forfeitBusyId,
  readOnly = false,
}) {
  const standings = bracket.standings ?? [];
  const displayStandings = useMemo(
    () => orderStandingsForDisplay(standings, bracket.pairIds, pairById),
    [standings, bracket.pairIds, pairById]
  );
  const showPoolLeaders = bracket.poolComplete;
  const { top1PairId, top2PairId } = useMemo(() => {
    if (!showPoolLeaders || standings.length === 0) {
      return { top1PairId: null, top2PairId: null };
    }
    const sorted = [...standings].sort(compareStandings);
    return {
      top1PairId: sorted[0]?.pairId ?? null,
      top2PairId: sorted.length > 1 ? sorted[1]?.pairId ?? null : null,
    };
  }, [standings, showPoolLeaders]);
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
  const scheduleMatches = useMemo(
    () =>
      getBracketRoundRobinMatches(bracket, {
        scheduleResetAt: scheduleResetAt ?? bracket.scheduleResetAt,
      }).map((m) => normalizeStoredMatch(m)),
    [bracket, scheduleResetAt]
  );
  const duplicatePairings = useMemo(
    () => findDuplicateRoundRobinPairings(bracket.matches, bracket.pairIds),
    [bracket.matches, bracket.pairIds]
  );
  const expectedFromPairs = expectedRoundRobinMatchCount(pairCount);
  const scheduleCountMismatch =
    pairCount >= 2 &&
    (scheduleMatches.length !== expectedFromPairs ||
      (bracket.matches ?? []).length > expectedFromPairs);
  const finished = scheduleMatches.filter((m) =>
    matchCountsForStandings(m)
  ).length;
  const matchesLeft = Math.max(0, expectedTotal - finished);
  const liveMatches = scheduleMatches.filter((m) => isMatchLive(m));
  const doneMatches = scheduleMatches.filter((m) => isRoundRobinMatchDone(m));
  const canHostStart = !readOnly && host && onStartMatch;
  const showMatchSchedule = scheduleMatches.length > 0;

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
              pair plays every other pair once ({perPair} games per pair,{" "}
              {finished}/{expectedTotal} done
              {matchesLeft > 0 ? `, ${matchesLeft} left` : ""})
            </p>
          )}
          {(duplicatePairings.length > 0 || scheduleCountMismatch) && (
            <p className="text-xs text-amber-400/90 mt-1">
              Schedule needs repair
              {duplicatePairings.length > 0
                ? ` (${duplicatePairings.length} duplicate pairing${duplicatePairings.length === 1 ? "" : "s"})`
                : scheduleCountMismatch
                  ? ` (expected ${expectedFromPairs}, showing ${scheduleMatches.length})`
                  : ""}
              . Regenerate this division to rebuild the round robin.
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
                <th className="py-2 text-center" title="Wins">
                  W
                </th>
                <th className="py-2 text-center" title="Losses">
                  L
                </th>
                <th
                  className="py-2 text-right pl-2 tabular-nums"
                  title="Points for (total scored)"
                >
                  PF
                </th>
                <th
                  className="py-2 text-right pl-2 tabular-nums"
                  title="Points against (total allowed)"
                >
                  PA
                </th>
                <th
                  className="py-2 text-right pl-2 tabular-nums"
                  title="Point differential (PF − PA)"
                >
                  Diff
                </th>
                <th
                  className="py-2 text-right pl-2 tabular-nums font-semibold text-cyan-400/90"
                  title={`Tournament points (win = ${ROUND_ROBIN_WIN_POINTS}, loss = 0, default win = ${ROUND_ROBIN_WIN_POINTS})`}
                >
                  Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {displayStandings.map((row, i) => {
                const isTop1 = row.pairId === top1PairId;
                const isTop2 = row.pairId === top2PairId;
                return (
                <tr
                  key={row.pairId}
                  className={`border-b border-slate-800/80 ${
                    advanced.has(row.pairId)
                      ? "bg-green-500/10"
                      : isTop1
                        ? "bg-amber-500/10"
                        : isTop2
                          ? "bg-slate-700/30"
                          : ""
                  }`}
                >
                  <td className="py-2 pr-2 font-bold text-slate-500">{i + 1}</td>
                  <td className="py-2 font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{row.name}</span>
                      {isTop1 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-black">
                          TOP 1
                        </span>
                      )}
                      {isTop2 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-500 text-white">
                          TOP 2
                        </span>
                      )}
                    </div>
                    {divisionReady && advanced.has(row.pairId) && (
                      <span className="mt-1 inline-block text-xs text-green-400 font-bold">
                        {wildcardIds.has(row.pairId) ? "WILDCARD" : "ADVANCES"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center text-green-400">{row.wins}</td>
                  <td className="py-2 text-center text-red-400/80">{row.losses}</td>
                  <td className="py-2 text-right pl-2 text-slate-300 tabular-nums">
                    {row.pointsFor ?? 0}
                  </td>
                  <td className="py-2 text-right pl-2 text-slate-400 tabular-nums">
                    {row.pointsAgainst ?? 0}
                  </td>
                  <td
                    className={`py-2 text-right pl-2 font-semibold tabular-nums ${
                      isTop1
                        ? "text-slate-600"
                        : (row.pointDiff ?? 0) > 0
                          ? "text-cyan-300"
                          : (row.pointDiff ?? 0) < 0
                            ? "text-red-400/90"
                            : "text-slate-400"
                    }`}
                  >
                    {isTop1 ? "" : formatPointDiff(row.pointDiff)}
                  </td>
                  <td className="py-2 text-right pl-2 font-bold text-cyan-300 tabular-nums">
                    {isTop1
                      ? ""
                      : row.tournamentPoints ?? row.wins * ROUND_ROBIN_WIN_POINTS}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Pair list stays in bracket order. TOP 1 / TOP 2 badges appear after this
          bracket finishes all pool matches (Pts → Diff → PF; TOP 1 leaves Diff and
          Pts blank). Win ={" "}
          {ROUND_ROBIN_WIN_POINTS} pts, loss = 0 (default win = {ROUND_ROBIN_WIN_POINTS}
          ). Each pair plays {perPair} matches ({expectedTotal} total). Advancement:
          Pts → Diff → PF.{" "}
          {divisionReady
            ? "Green = advances to quarterfinals."
            : showTiebreakCols
              ? "Finish all matches to lock advancement."
              : "Play matches in schedule order (1…" + expectedTotal + ")."}
        </p>
      </div>

      {showMatchSchedule && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 flex flex-col max-h-96">
          <div className="shrink-0 mb-2">
            <h4 className="text-sm font-semibold text-slate-200">
              {readOnly ? "Match schedule" : "Matches to play"}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {matchesLeft} left on {bracket.courtName}
              {doneMatches.length > 0
                ? ` · ${doneMatches.length} done`
                : ""}
              {liveMatches.length > 0 ? ` · ${liveMatches.length} live` : ""}.{" "}
              {canHostStart
                ? "Highlighted rows can be started — dimmed rows are already finished (each pairing once)."
                : "Highlighted = still to play · dimmed = done."}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {scheduleMatches.map((m) => (
                <MatchScheduleRow
                  key={m.id}
                  m={m}
                  bracket={bracket}
                  pairById={pairById}
                  readOnly={readOnly}
                  host={host}
                  onStartMatch={onStartMatch}
                  onForfeitWin={onForfeitWin}
                  startingMatchId={startingMatchId}
                  forfeitBusyId={forfeitBusyId}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
