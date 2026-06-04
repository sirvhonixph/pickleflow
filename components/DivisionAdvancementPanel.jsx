"use client";

import { pairDisplayName } from "@/lib/tournament-divisions";
import {
  getActiveKnockoutRoundLabel,
  quarterfinalsHaveStarted,
} from "@/lib/tournament-knockout-ui";
import { isMatchComplete, isMatchLive } from "@/lib/tournament-live";

function MatchStatus({ match }) {
  if (isMatchLive(match)) {
    return (
      <span className="text-green-400 font-bold text-xs">
        LIVE {match.scoreA ?? 0}–{match.scoreB ?? 0}
      </span>
    );
  }
  if (isMatchComplete(match)) {
    return (
      <span className="text-slate-400 text-xs">
        Final {match.scoreA ?? 0}–{match.scoreB ?? 0}
      </span>
    );
  }
  return <span className="text-slate-500 text-xs">Scheduled</span>;
}

function formatPointDiff(diff) {
  if (typeof diff !== "number" || Number.isNaN(diff)) return null;
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function recordDetail(q) {
  const diff = formatPointDiff(q.pointDiff);
  const parts = [`${q.wins}-${q.losses}`];
  if (diff != null) parts.push(`+/− ${diff}`);
  if (typeof q.tieBreaker === "number") parts.push(`TB ${q.tieBreaker}`);
  return parts.join(", ");
}

function EliminationPair({ pairId, name, match }) {
  const done = isMatchComplete(match);
  const won = done && match.winnerPairId === pairId;
  const lost = done && match.winnerPairId && match.winnerPairId !== pairId;

  return (
    <span
      className={
        won
          ? "text-green-400 font-semibold"
          : lost
            ? "text-slate-500"
            : "text-white"
      }
    >
      {name}
      {won && (
        <span className="ml-1 text-xs font-bold text-green-400/90">advances</span>
      )}
      {lost && <span className="ml-1 text-xs text-red-400/70">out</span>}
    </span>
  );
}

export default function DivisionAdvancementPanel({
  advancement,
  knockout,
  pairById,
  host,
  startingQuarterfinals,
  onStartQuarterfinals,
  hideKnockoutRounds = false,
}) {
  if (!advancement) return null;

  const { ready, ruleSummary, autoQualifiers, wildcards, allQualified, quarterfinals } =
    advancement;

  const knockoutActive = knockout?.initialized;
  const qfStarted = quarterfinalsHaveStarted(knockout);
  const canStartQuarterfinals = ready && host && !qfStarted;

  return (
    <section className="bg-slate-900 border border-green-500/30 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-green-300">
          {knockoutActive ? "Finals" : "Quarterfinals"}
        </h2>
        <p className="text-slate-400 text-sm mt-1">{ruleSummary}</p>
        {knockoutActive && hideKnockoutRounds && (
          <p className="text-purple-300/90 text-sm mt-2">
            Match scores and results are in{" "}
            <span className="font-medium">Finals</span> below.
          </p>
        )}
        {knockoutActive && !hideKnockoutRounds && (
          <p className="text-red-400/90 text-sm mt-2 font-medium">
            {getActiveKnockoutRoundLabel(knockout)} — only winners advance.
          </p>
        )}
        {!ready && (
          <p className="text-amber-400/90 text-sm mt-2">
            Complete all bracket round-robin matches to calculate who advances.
          </p>
        )}
        {canStartQuarterfinals && (
          <button
            type="button"
            disabled={startingQuarterfinals}
            onClick={onStartQuarterfinals}
            className="mt-3 px-5 py-2.5 bg-green-500 text-black font-bold rounded-lg text-sm disabled:opacity-50"
          >
            {startingQuarterfinals
              ? "Starting quarterfinals…"
              : "Start quarterfinals on courts"}
          </button>
        )}
      </div>

      {ready && (
        <>
          {!knockoutActive ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-800 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                  Automatic qualifiers ({autoQualifiers.length})
                </h3>
                <ul className="text-sm space-y-1">
                  {(autoQualifiers ?? []).map((q) => (
                    <li key={q.pairId} className="text-slate-300">
                      <span className="text-green-400 font-medium">
                        {q.bracketLabel} #{q.rank}
                      </span>{" "}
                      — {q.name}
                      {q.rank > 1 && (
                        <span className="text-slate-500 ml-1">
                          ({recordDetail(q)})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {(wildcards ?? []).length > 0 && (
                <div className="rounded-lg border border-slate-800 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    Wildcards ({wildcards.length})
                  </h3>
                  <ul className="text-sm space-y-1">
                    {(wildcards ?? []).map((w) => (
                      <li key={w.pairId} className="text-slate-300">
                        <span className="text-cyan-400 font-medium">
                          {w.bracketLabel} #{w.rank}
                        </span>{" "}
                        — {w.name}
                        <span className="text-slate-500 ml-1">
                          ({recordDetail(w)})
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500 mt-2">
                    Best record &amp; tiebreak among eligible wildcard spots (wins →
                    TB → +/−).
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                8 quarterfinal teams (from pool play)
              </h3>
              <ol className="text-sm space-y-1 list-decimal list-inside text-slate-300 columns-1 sm:columns-2">
                {(allQualified ?? []).map((q) => (
                  <li key={q.pairId}>
                    {q.name}
                    <span className="text-slate-500 ml-1">
                      ({q.bracketLabel} #{q.rank}
                      {q.slot === "wildcard" ? ", wildcard" : ""})
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {knockoutActive && !hideKnockoutRounds && (
            <div className="space-y-4">
              {(knockout.rounds ?? []).map((round) => (
                <div key={round.id}>
                  <h3 className="text-sm font-semibold text-purple-300 mb-3">
                    {round.label}
                  </h3>
                  <ul className="grid sm:grid-cols-2 gap-3">
                    {(round.matches ?? []).map((m) => {
                      const nameA = m.pairAId
                        ? pairById?.get(m.pairAId)?.displayName ??
                          pairDisplayName(pairById?.get(m.pairAId) ?? {})
                        : "TBD";
                      const nameB = m.pairBId
                        ? pairById?.get(m.pairBId)?.displayName ??
                          pairDisplayName(pairById?.get(m.pairBId) ?? {})
                        : "TBD";

                      return (
                        <li
                          key={m.id}
                          className={`rounded-lg border p-3 text-sm ${
                            isMatchLive(m)
                              ? "border-green-500/40 bg-green-500/5"
                              : isMatchComplete(m)
                                ? "border-slate-700 bg-slate-800/40"
                                : "border-purple-500/30 bg-purple-500/5"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                            <p className="text-xs text-slate-500">{m.label}</p>
                            <MatchStatus match={m} />
                          </div>
                          <p className="font-medium">
                            <EliminationPair
                              pairId={m.pairAId}
                              name={nameA}
                              match={m}
                            />{" "}
                            <span className="text-slate-500">vs</span>{" "}
                            <EliminationPair
                              pairId={m.pairBId}
                              name={nameB}
                              match={m}
                            />
                          </p>
                          {m.courtName && (
                            <p className="text-xs text-cyan-400/80 mt-1">
                              {m.courtName}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {!knockoutActive && quarterfinals?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-purple-300 mb-3">
                Quarterfinal matchups
              </h3>
              <ul className="grid sm:grid-cols-2 gap-3">
                {quarterfinals.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 text-sm"
                  >
                    <p className="text-xs text-slate-500 mb-1">{m.label}</p>
                    <p className="font-medium">
                      {m.pairA?.name}{" "}
                      <span className="text-slate-500">vs</span> {m.pairB?.name}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!knockoutActive && (
            <div className="rounded-lg border border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                All 8 quarterfinal teams
              </h3>
              <ol className="text-sm space-y-1 list-decimal list-inside text-slate-300">
                {(allQualified ?? []).map((q) => (
                  <li key={q.pairId}>
                    {q.name}
                    <span className="text-slate-500 ml-1">
                      ({q.bracketLabel} #{q.rank}
                      {q.slot === "wildcard" ? ", wildcard" : ""})
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
