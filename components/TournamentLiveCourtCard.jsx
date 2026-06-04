"use client";

import { useEffect, useMemo, useState } from "react";
import CourtDiagram from "@/components/CourtDiagram";
import {
  announceCourtMatch,
  formatCourtMatchAnnouncement,
  formatTeamSlash,
} from "@/lib/announce";
import {
  applyScoreDelta,
  applyScoreValue,
  alignTeamToScore,
  toggleChangeCourt,
} from "@/lib/court-positions";
import { patchTournamentMatch, updateCourt, updateTournamentPairBase } from "@/lib/events";
import { pairDisplayName } from "@/lib/tournament-divisions";
import { getCourtTournamentState } from "@/lib/tournament-live";

function PlayingPairs({ pairA, pairB }) {
  return (
    <div className="text-sm space-y-2">
      <div>
        <span className="text-slate-500">Pair A · </span>
        <span className="text-white">{pairA}</span>
      </div>
      <div>
        <span className="text-slate-500">Pair B · </span>
        <span className="text-white">{pairB}</span>
      </div>
    </div>
  );
}

export default function TournamentLiveCourtCard({
  court,
  event,
  eventId,
  pairById,
  host,
  onReload,
}) {
  const { live, next } = useMemo(
    () => getCourtTournamentState(event, court.id),
    [event, court.id]
  );

  const match = live?.match;
  const aiAnnounceOn = court.aiAnnounce !== false;
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (match) {
      setScoreA(match.scoreA ?? 0);
      setScoreB(match.scoreB ?? 0);
    }
  }, [match?.scoreA, match?.scoreB, match?.startedAt, match?.id]);

  const showActionError = (err, fallback) => {
    const msg = err?.message ?? fallback;
    if (msg.includes("event host")) {
      alert(
        `${msg}\n\nLog in with the same email you used when you created this tournament.`
      );
      return;
    }
    if (msg.includes("Blob") || msg.includes("cannot save")) {
      alert(`${msg}\n\nAsk your site admin to connect Vercel Blob storage.`);
      return;
    }
    alert(msg);
  };

  const patchLive = async (patch) => {
    if (!live) return;
    setBusy(true);
    try {
      await patchTournamentMatch(eventId, {
        divisionId: live.divisionId,
        bracketId: live.bracketId,
        roundId: live.roundId,
        matchId: live.match.id,
        status: "live",
        ...patch,
      });
      await onReload();
    } catch (err) {
      showActionError(err, "Could not update match");
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const bumpScore = async (team, delta) => {
    if (!match) return;
    const patch = applyScoreDelta(match, team, delta, { scoreA, scoreB });
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    await patchLive(patch);
  };

  const setTeamScore = async (team, value) => {
    if (!match) return;
    const patch = applyScoreValue(match, team, value, { scoreA, scoreB });
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    await patchLive(patch);
  };

  const handleSetBase = async (teamId, playerId, half) => {
    if (!match) return;
    if (teamId === "A") {
      await patchLive({
        basePlayerA: playerId,
        teamA: alignTeamToScore(match.teamA, playerId, half, scoreA),
      });
      if (match.pairAId) {
        await updateTournamentPairBase(eventId, match.pairAId, playerId);
      }
    } else {
      await patchLive({
        basePlayerB: playerId,
        teamB: alignTeamToScore(match.teamB, playerId, half, scoreB),
      });
      if (match.pairBId) {
        await updateTournamentPairBase(eventId, match.pairBId, playerId);
      }
    }
  };

  const handleChangeCourt = async () => {
    if (!match) return;
    await patchLive(toggleChangeCourt(match));
  };

  const startMatch = async (ctx) => {
    setBusy(true);
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: ctx.divisionId,
        bracketId: ctx.bracketId,
        roundId: ctx.roundId,
        matchId: ctx.match.id,
        status: "live",
      });
      const started = getCourtTournamentState(ev, court.id).live;
      if (aiAnnounceOn && started?.match?.teamA?.length && started?.match?.teamB?.length) {
        announceCourtMatch(court.name, started.match.teamA, started.match.teamB);
      }
      await onReload();
    } catch (err) {
      alert(err.message ?? "Could not start match");
    } finally {
      setBusy(false);
    }
  };

  const endMatch = async () => {
    if (!live) return;
    setBusy(true);
    try {
      await patchTournamentMatch(eventId, {
        divisionId: live.divisionId,
        bracketId: live.bracketId,
        roundId: live.roundId,
        matchId: live.match.id,
        scoreA,
        scoreB,
        status: "completed",
      });
      await onReload();
    } catch (err) {
      showActionError(err, "Could not end match");
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const pairAName =
    pairById.get(match?.pairAId)?.displayName ??
    pairDisplayName(pairById.get(match?.pairAId) ?? {});
  const pairBName =
    pairById.get(match?.pairBId)?.displayName ??
    pairDisplayName(pairById.get(match?.pairBId) ?? {});

  const nextPairA =
    pairById.get(next?.match?.pairAId)?.displayName ??
    (next ? pairDisplayName(pairById.get(next.match.pairAId) ?? {}) : "");
  const nextPairB =
    pairById.get(next?.match?.pairBId)?.displayName ??
    (next ? pairDisplayName(pairById.get(next.match.pairBId) ?? {}) : "");

  return (
    <div
      className={`rounded-xl border p-5 ${
        live
          ? "border-green-500/50 bg-green-500/5"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold">{court.name}</h3>
          {live && (
            <p className="text-xs text-purple-300/90 mt-0.5">
              {live.divisionName} · {live.bracketLabel}
              {live.phase === "knockout" && (
                <span className="text-red-400/90 ml-1">· win or go home</span>
              )}
            </p>
          )}
          {!live && next && (
            <p className="text-xs text-slate-500 mt-0.5">
              {next.divisionName} · {next.bracketLabel}
            </p>
          )}
        </div>
        <span
          className={`text-xs font-bold px-2 py-1 rounded ${
            live
              ? "bg-green-500 text-black"
              : next
                ? "bg-slate-700 text-slate-300"
                : "bg-slate-800 text-slate-500"
          }`}
        >
          {live ? "LIVE" : next ? "Ready" : "Idle"}
        </span>
      </div>

      {host && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-800/40 p-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={aiAnnounceOn}
              onChange={async (e) => {
                await updateCourt(eventId, court.id, {
                  aiAnnounce: e.target.checked,
                });
                await onReload();
              }}
            />
            <span className="text-sm">
              <span className="font-medium text-white block">
                AI announces players on this court
              </span>
              <span className="text-slate-400 text-xs mt-0.5 block">
                {live && match?.teamA?.length
                  ? formatCourtMatchAnnouncement(
                      court.name,
                      match.teamA,
                      match.teamB
                    )
                  : "Speaks court name and all four player names when a match starts."}
              </span>
            </span>
          </label>
          {live && match?.teamA?.length && aiAnnounceOn && (
            <button
              type="button"
              className="w-full py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 transition"
              onClick={() =>
                announceCourtMatch(court.name, match.teamA, match.teamB)
              }
            >
              Call players now
            </button>
          )}
        </div>
      )}

      {live && match?.teamA && match?.teamB && (
        <div className="mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
            Now playing
          </p>
          <CourtDiagram
            match={match}
            scoreA={host ? scoreA : match.scoreA}
            scoreB={host ? scoreB : match.scoreB}
            host={host}
            onSetBase={host ? handleSetBase : undefined}
            onBumpScore={host ? bumpScore : undefined}
            onSetScore={host ? setTeamScore : undefined}
          />

          {!host && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <PlayingPairs pairA={pairAName} pairB={pairBName} />
            </div>
          )}

          {host && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleChangeCourt}
                className="w-full mt-4 mb-4 py-2 text-sm font-medium rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Change court — teams switch ends
              </button>
              <div className="border-t border-slate-800 pt-4 flex flex-wrap gap-2 justify-center">
                {aiAnnounceOn && (
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm bg-violet-600 rounded-lg"
                    onClick={() =>
                      announceCourtMatch(court.name, match.teamA, match.teamB)
                    }
                  >
                    Call players again
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={endMatch}
                  className="px-4 py-2 text-sm bg-purple-500 rounded-lg font-medium disabled:opacity-50"
                >
                  End match
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!live && next && (
        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
            Up next
          </p>
          <PlayingPairs pairA={nextPairA} pairB={nextPairB} />
          {host && (
            <button
              type="button"
              disabled={busy}
              onClick={() => startMatch(next)}
              className="mt-4 w-full py-2.5 bg-cyan-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              Start match
            </button>
          )}
          {!host && (
            <p className="text-xs text-slate-500 mt-3">
              Waiting for the host to start this match.
            </p>
          )}
        </div>
      )}

      {!live && !next && (
        <p className="text-slate-500 text-sm">
          {host
            ? "No scheduled matches on this court right now."
            : "No match on this court right now."}
        </p>
      )}

      {live && !host && match?.teamA && (
        <p className="text-xs text-slate-500 mt-2">
          {formatTeamSlash(match.teamA)} vs {formatTeamSlash(match.teamB)}
        </p>
      )}
    </div>
  );
}
