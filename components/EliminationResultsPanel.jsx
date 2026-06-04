"use client";

import { useState } from "react";
import { pairDisplayName } from "@/lib/tournament-divisions";
import {
  getActiveKnockoutRoundLabel,
  getKnockoutMedalists,
  hasPendingBronzeMatch,
} from "@/lib/tournament-knockout-ui";
import { isMatchComplete, isMatchLive } from "@/lib/tournament-live";
import { patchTournamentMatch } from "@/lib/events";
import MedalPodium, { medalEmoji, medalRowClass } from "@/components/MedalPodium";

function MatchScoreBadge({ match }) {
  if (isMatchLive(match)) {
    return (
      <span className="text-green-400 font-bold text-sm tabular-nums">
        LIVE {match.scoreA ?? 0}–{match.scoreB ?? 0}
      </span>
    );
  }
  if (isMatchComplete(match)) {
    return (
      <span className="text-white font-bold text-sm tabular-nums">
        {match.scoreA ?? 0}–{match.scoreB ?? 0}
        <span className="text-slate-500 font-normal text-xs ml-2">final</span>
      </span>
    );
  }
  return <span className="text-slate-500 text-xs">Not started</span>;
}

function ResultRow({ pairId, name, match, medalByPairId }) {
  const done = isMatchComplete(match);
  const won = done && match.winnerPairId === pairId;
  const lost = done && match.winnerPairId && match.winnerPairId !== pairId;
  const medal = pairId ? medalByPairId.get(pairId) : null;

  return (
    <span
      className={
        medal
          ? medalRowClass(medal)
          : won
            ? "text-green-400 font-semibold"
            : lost
              ? "text-slate-500 line-through decoration-slate-600"
              : "text-slate-200"
      }
    >
      {medal && (
        <span className="mr-1.5" aria-hidden>
          {medalEmoji(medal)}
        </span>
      )}
      {name}
      {won && !medal && (
        <span className="ml-1.5 text-xs font-bold no-underline">W</span>
      )}
    </span>
  );
}

function pairName(pairId, pairById) {
  if (!pairId) return null;
  return (
    pairById?.get(pairId)?.displayName ??
    pairDisplayName(pairById?.get(pairId) ?? {})
  );
}

export default function EliminationResultsPanel({
  knockout,
  pairById,
  host = false,
  divisionId,
  eventId,
  onReload,
}) {
  const [startingBronze, setStartingBronze] = useState(false);
  if (!knockout?.initialized) return null;

  const rounds = knockout.rounds ?? [];
  const displayRounds = ["final", "bronze", "sf", "qf"]
    .map((id) => rounds.find((r) => r.id === id))
    .filter(Boolean);
  const completedCount = rounds.reduce(
    (n, r) =>
      n + (r.matches ?? []).filter((m) => isMatchComplete(m)).length,
    0
  );

  const { goldId, silverId, bronzeId } = getKnockoutMedalists(knockout);
  const goldName = pairName(goldId, pairById);
  const silverName = pairName(silverId, pairById);
  const bronzeName = pairName(bronzeId, pairById);

  const medalByPairId = new Map();
  if (goldId) medalByPairId.set(goldId, "gold");
  if (silverId) medalByPairId.set(silverId, "silver");
  if (bronzeId) medalByPairId.set(bronzeId, "bronze");

  const bronzePending = hasPendingBronzeMatch(knockout);
  const pendingBronzeMatch = bronzePending
    ? knockout.rounds?.find((r) => r.id === "bronze")?.matches?.[0]
    : null;

  const startBronzeMatch = async () => {
    if (!pendingBronzeMatch || !divisionId || !eventId) return;
    setStartingBronze(true);
    try {
      await patchTournamentMatch(eventId, {
        divisionId,
        bracketId: "bronze",
        roundId: "bronze",
        matchId: pendingBronzeMatch.id,
        status: "live",
      });
      await onReload?.();
    } catch (err) {
      alert(err.message ?? "Could not start bronze match");
    } finally {
      setStartingBronze(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-purple-500/40 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-purple-200">Finals</h2>
        <p className="text-slate-400 text-sm mt-1">
          {getActiveKnockoutRoundLabel(knockout)} — review all finals scores. Only
          winners advance.
        </p>
        {bronzePending && pendingBronzeMatch && (
          <div className="mt-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 space-y-3">
            <p className="text-sm text-orange-200">
              🥉 Bronze medal match still to play
              {pendingBronzeMatch.courtName
                ? ` on ${pendingBronzeMatch.courtName}`
                : ""}
              . Start it here or from the live court card.
            </p>
            {host && !isMatchLive(pendingBronzeMatch) && (
              <button
                type="button"
                disabled={startingBronze}
                onClick={startBronzeMatch}
                className="w-full sm:w-auto px-4 py-2.5 bg-orange-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50"
              >
                {startingBronze ? "Starting…" : "Start bronze medal match"}
              </button>
            )}
          </div>
        )}
        {completedCount > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {completedCount} match{completedCount === 1 ? "" : "es"} completed
          </p>
        )}
      </div>

      {(goldName || silverName || bronzeName) && (
        <MedalPodium
          goldName={goldName}
          silverName={silverName}
          bronzeName={bronzeName}
        />
      )}

      <div className="space-y-6">
        {displayRounds.map((round) => (
          <div key={round.id}>
            <h3 className="text-sm font-semibold text-purple-300 mb-3 uppercase tracking-wide">
              {round.label}
            </h3>
            <ul className="space-y-3">
              {(round.matches ?? []).map((m) => {
                const nameA = m.pairAId
                  ? pairName(m.pairAId, pairById) ?? "TBD"
                  : "TBD";
                const nameB = m.pairBId
                  ? pairName(m.pairBId, pairById) ?? "TBD"
                  : "TBD";
                const isMedalMatch =
                  round.id === "final" || round.id === "bronze";

                return (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-4 ${
                      isMedalMatch && isMatchComplete(m)
                        ? round.id === "final"
                          ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-400/20"
                          : "border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-400/20"
                        : isMatchLive(m)
                          ? "border-green-500/50 bg-green-500/5"
                          : isMatchComplete(m)
                            ? "border-slate-600 bg-slate-800/60"
                            : "border-slate-800 bg-slate-900/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <MatchScoreBadge match={m} />
                    </div>
                    <p className="text-base font-medium">
                      <ResultRow
                        pairId={m.pairAId}
                        name={nameA}
                        match={m}
                        medalByPairId={medalByPairId}
                      />
                      <span className="text-slate-500 mx-2">vs</span>
                      <ResultRow
                        pairId={m.pairBId}
                        name={nameB}
                        match={m}
                        medalByPairId={medalByPairId}
                      />
                    </p>
                    {m.courtName && (
                      <p className="text-xs text-cyan-400/70 mt-2">{m.courtName}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
