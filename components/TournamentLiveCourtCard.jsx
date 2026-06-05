"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getTeamHalf,
  withCurrentScores,
} from "@/lib/court-positions";
import { patchTournamentMatch, updateCourt } from "@/lib/events";
import { pairDisplayName } from "@/lib/tournament-divisions";
import { getDivisionById } from "@/lib/tournament-divisions";
import {
  getCourtTournamentState,
  mergeLiveScoresIntoEvent,
  pairToTeamPlayers,
  resolveLiveMatchLayout,
} from "@/lib/tournament-live";
import {
  hasRecordedRoundRobinResult,
  sealRoundRobinMatchRow,
} from "@/lib/tournament-match-outcome";

function storedBracketMatch(event, ctx) {
  if (!event || !ctx) return null;
  const div = event.tournamentDivisions?.[ctx.divisionId];
  const bracket = div?.brackets?.find((b) => b.id === ctx.bracketId);
  return (bracket?.matches ?? []).find((m) => m.id === ctx.match?.id) ?? null;
}

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
  onEventUpdate,
  onPauseAutoRefresh,
}) {
  const { live, next } = useMemo(
    () => getCourtTournamentState(event, court.id),
    [event, court.id]
  );

  const match = live?.match;
  const aiAnnounceOn = court.aiAnnounce !== false;
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [localMatch, setLocalMatch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const pendingPatchRef = useRef(null);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(false);
  const saveChainRef = useRef(Promise.resolve());
  const scoreARef = useRef(scoreA);
  const scoreBRef = useRef(scoreB);
  scoreARef.current = scoreA;
  scoreBRef.current = scoreB;
  const liveRef = useRef(live);
  liveRef.current = live;
  const scoringSessionRef = useRef(null);
  const localMatchRef = useRef(null);
  const liveStartedAtRef = useRef(0);
  const completedMatchIdsRef = useRef(new Set());
  const eventRef = useRef(event);
  eventRef.current = event;
  localMatchRef.current = localMatch;

  const liveScoringSessionKey = (m) =>
    m ? `${m.id}:${m.startedAt ?? 0}` : null;

  const clearLiveScoringState = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    pendingPatchRef.current = null;
    scoringSessionRef.current = null;
    setScoreA(0);
    setScoreB(0);
  }, []);

  const resetScoresForNewLiveMatch = useCallback((serverMatch) => {
    setScoreA(0);
    setScoreB(0);
    if (serverMatch) {
      scoringSessionRef.current = liveScoringSessionKey(serverMatch);
      setLocalMatch({ ...serverMatch, scoreA: 0, scoreB: 0 });
      liveStartedAtRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!match) {
      setLocalMatch(null);
      clearLiveScoringState();
      return;
    }

    if (match.status === "live") {
      const sessionKey = liveScoringSessionKey(match);
      if (scoringSessionRef.current !== sessionKey) {
        resetScoresForNewLiveMatch(match);
        return;
      }
      setLocalMatch((prev) => ({
        ...match,
        scoreA: scoreARef.current,
        scoreB: scoreBRef.current,
        teamA: prev?.teamA?.length ? prev.teamA : match.teamA,
        teamB: prev?.teamB?.length ? prev.teamB : match.teamB,
        basePlayerA: prev?.basePlayerA ?? match.basePlayerA,
        basePlayerB: prev?.basePlayerB ?? match.basePlayerB,
        sidesSwapped: prev?.sidesSwapped ?? match.sidesSwapped,
      }));
      return;
    }

    scoringSessionRef.current = null;
    setScoreA(match.scoreA ?? 0);
    setScoreB(match.scoreB ?? 0);
    setLocalMatch(match);
  }, [
    match?.id,
    match?.status,
    match?.startedAt,
    clearLiveScoringState,
    resetScoresForNewLiveMatch,
  ]);

  const displayMatch = useMemo(() => {
    const base = localMatch ?? match;
    if (!base || !live) return null;
    const laid = resolveLiveMatchLayout(base, event, live.divisionId);
    if (!laid.teamA?.length || !laid.teamB?.length) return null;
    return { ...laid, scoreA, scoreB };
  }, [localMatch, match, scoreA, scoreB, event, live]);

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

  const applyEvent = useCallback(
    (ev) => {
      onPauseAutoRefresh?.(60000);
      if (!ev || !onEventUpdate) return;
      const ctx = liveRef.current;
      const courtLive = getCourtTournamentState(ev, court.id).live;
      let next = ev;
      if (
        ctx?.match?.id &&
        ctx.match.status === "live" &&
        courtLive?.match?.id === ctx.match.id
      ) {
        next = mergeLiveScoresIntoEvent(ev, {
          courtId: court.id,
          divisionId: ctx.divisionId,
          bracketId: ctx.bracketId,
          matchId: ctx.match.id,
          scoreA: scoreARef.current,
          scoreB: scoreBRef.current,
          localMatch: localMatchRef.current,
        });
      }
      onEventUpdate(next);
    },
    [court.id, onEventUpdate, onPauseAutoRefresh]
  );

  const flushLiveSave = useCallback(async () => {
    const ctx = liveRef.current;
    if (!ctx || !pendingPatchRef.current) return;
    if (savingRef.current) {
      saveTimerRef.current = setTimeout(() => flushLiveSave(), 150);
      return;
    }

    const patch = withCurrentScores(
      pendingPatchRef.current,
      scoreARef.current,
      scoreBRef.current
    );
    pendingPatchRef.current = null;
    savingRef.current = true;
    setSaving(true);
    onPauseAutoRefresh?.(30000);

    const run = async () => {
      try {
        if (completedMatchIdsRef.current.has(ctx.match.id)) {
          return;
        }
        const stored = storedBracketMatch(eventRef.current, ctx);
        if (
          stored &&
          hasRecordedRoundRobinResult(sealRoundRobinMatchRow(stored))
        ) {
          completedMatchIdsRef.current.add(ctx.match.id);
          return;
        }
        const sa = scoreARef.current;
        const sb = scoreBRef.current;
        await patchTournamentMatch(eventId, {
          divisionId: ctx.divisionId,
          bracketId: ctx.bracketId,
          roundId: ctx.roundId,
          matchId: ctx.match.id,
          status: "live",
          ...patch,
          scoreA: sa,
          scoreB: sb,
        });
        onPauseAutoRefresh?.(60000);
      } catch (err) {
        console.error("Live score sync failed:", err);
      } finally {
        savingRef.current = false;
        setSaving(false);
        if (pendingPatchRef.current) {
          saveTimerRef.current = setTimeout(() => flushLiveSave(), 80);
        }
      }
    };

    saveChainRef.current = saveChainRef.current.then(run, run);
    await saveChainRef.current;
  }, [eventId, onPauseAutoRefresh, court.id]);

  const queueLiveSave = useCallback(
    (patch) => {
      pendingPatchRef.current = withCurrentScores(
        {
          ...(pendingPatchRef.current ?? {}),
          ...patch,
          status: "live",
        },
        scoreARef.current,
        scoreBRef.current
      );
      onPauseAutoRefresh?.(60000);
      clearTimeout(saveTimerRef.current);
      const ms =
        Date.now() - liveStartedAtRef.current < 12000 ? 120 : 400;
      saveTimerRef.current = setTimeout(() => flushLiveSave(), ms);
    },
    [flushLiveSave, onPauseAutoRefresh]
  );

  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  const matchForScoring = () => {
    const base = localMatch ?? match;
    if (!base) return null;
    return { ...base, scoreA, scoreB };
  };

  const bumpScore = (team, delta) => {
    const m = matchForScoring();
    if (!m) return;
    const cur = { scoreA: scoreARef.current, scoreB: scoreBRef.current };
    const patch = applyScoreDelta(m, team, delta, cur);
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const setTeamScore = (team, value) => {
    const m = matchForScoring();
    if (!m) return;
    const cur = { scoreA: scoreARef.current, scoreB: scoreBRef.current };
    const patch = applyScoreValue(m, team, value, cur);
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const handleSetBase = (teamId, playerId) => {
    const m = matchForScoring();
    if (!m || !live) return;
    const pairId = teamId === "A" ? m.pairAId : m.pairBId;
    const pair = pairById.get(pairId);
    const skill = getDivisionById(event, live.divisionId)?.skill ?? "novice";
    let team = teamId === "A" ? m.teamA : m.teamB;
    if ((!team || team.length < 2) && pair) {
      team = pairToTeamPlayers(pair, skill);
    }
    if (!team?.length) {
      alert("Could not load players for this match. Try restarting the match.");
      return;
    }
    if (!team.some((p) => p.playerId === playerId) && pair) {
      team = pairToTeamPlayers(pair, skill);
    }
    if (!team.some((p) => p.playerId === playerId)) {
      alert("Could not set base for this player. Try again.");
      return;
    }
    const courtHalf = getTeamHalf(teamId, m.sidesSwapped ?? false);
    const teamScore = teamId === "A" ? scoreARef.current : scoreBRef.current;
    const patch =
      teamId === "A"
        ? {
            basePlayerA: playerId,
            teamA: alignTeamToScore(team, playerId, courtHalf, teamScore),
          }
        : {
            basePlayerB: playerId,
            teamB: alignTeamToScore(team, playerId, courtHalf, teamScore),
          };
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch, scoreA: scoreARef.current, scoreB: scoreBRef.current }));
    queueLiveSave(patch);
  };

  const handleChangeCourt = () => {
    const m = matchForScoring();
    if (!m) return;
    const patch = withCurrentScores(toggleChangeCourt(m), scoreARef.current, scoreBRef.current);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const startMatch = async (ctx) => {
    setActionBusy(true);
    clearTimeout(saveTimerRef.current);
    pendingPatchRef.current = null;
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: ctx.divisionId,
        bracketId: ctx.bracketId,
        roundId: ctx.roundId,
        matchId: ctx.match.id,
        status: "live",
        scoreA: 0,
        scoreB: 0,
      });
      const started = getCourtTournamentState(ev, court.id).live;
      const startedMatch = started?.match;
      if (aiAnnounceOn && startedMatch?.teamA?.length && startedMatch?.teamB?.length) {
        announceCourtMatch(court.name, startedMatch.teamA, startedMatch.teamB);
      }
      resetScoresForNewLiveMatch(startedMatch ?? null);
      onPauseAutoRefresh?.(60000);
      onEventUpdate?.(ev);
    } catch (err) {
      alert(err.message ?? "Could not start match");
    } finally {
      setActionBusy(false);
    }
  };

  const endMatch = async () => {
    if (!live) return;
    if (scoreA === 0 && scoreB === 0) {
      alert(
        "0–0 is not a valid result. Use “Default win” if one pair did not show, or enter a real score."
      );
      return;
    }
    clearTimeout(saveTimerRef.current);
    if (pendingPatchRef.current) {
      await flushLiveSave();
    }
    setActionBusy(true);
    const finishedMatchId = live.match.id;
    completedMatchIdsRef.current.add(finishedMatchId);
    pendingPatchRef.current = null;
    saveChainRef.current = Promise.resolve();
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: live.divisionId,
        bracketId: live.bracketId,
        roundId: live.roundId,
        matchId: finishedMatchId,
        scoreA,
        scoreB,
        status: "completed",
      });
      applyEvent(ev);
      clearLiveScoringState();
    } catch (err) {
      completedMatchIdsRef.current.delete(finishedMatchId);
      showActionError(err, "Could not end match");
      clearLiveScoringState();
    } finally {
      setActionBusy(false);
    }
  };

  const pairAName =
    pairById.get(match?.pairAId)?.displayName ??
    pairDisplayName(pairById.get(match?.pairAId) ?? {});
  const pairBName =
    pairById.get(match?.pairBId)?.displayName ??
    pairDisplayName(pairById.get(match?.pairBId) ?? {});

  const forfeitDefaultWin = async (winnerPairId) => {
    if (!live) return;
    const label =
      winnerPairId === live.match.pairAId ? pairAName : pairBName;
    if (
      !window.confirm(
        `Award default win to ${label}? Score will be 11–0 (other pair did not show).`
      )
    ) {
      return;
    }
    clearTimeout(saveTimerRef.current);
    setActionBusy(true);
    const finishedMatchId = live.match.id;
    completedMatchIdsRef.current.add(finishedMatchId);
    pendingPatchRef.current = null;
    saveChainRef.current = Promise.resolve();
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: live.divisionId,
        bracketId: live.bracketId,
        roundId: live.roundId,
        matchId: finishedMatchId,
        status: "completed",
        forfeitWinnerPairId: winnerPairId,
      });
      applyEvent(ev);
      clearLiveScoringState();
    } catch (err) {
      completedMatchIdsRef.current.delete(finishedMatchId);
      showActionError(err, "Could not record default win");
      clearLiveScoringState();
    } finally {
      setActionBusy(false);
    }
  };

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

      {live && !displayMatch && (
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-300/90 uppercase tracking-wide mb-2">
            Live match — loading court layout
          </p>
          <PlayingPairs pairA={pairAName} pairB={pairBName} />
          {host && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void onReload()}
              className="mt-3 w-full py-2 text-sm font-medium rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              Refresh court
            </button>
          )}
        </div>
      )}

      {live && displayMatch && (
        <div className="mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
            Now playing
          </p>
          <CourtDiagram
            key={liveScoringSessionKey(displayMatch)}
            match={displayMatch}
            scoreA={host ? scoreA : 0}
            scoreB={host ? scoreB : 0}
            host={host}
            disabled={false}
            onSetBase={host ? handleSetBase : undefined}
            onBumpScore={host ? bumpScore : undefined}
            onSetScore={host ? setTeamScore : undefined}
          />
          {host && saving && (
            <p className="text-[10px] text-slate-500 mt-1 text-center">
              Syncing to server…
            </p>
          )}

          {!host && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <PlayingPairs pairA={pairAName} pairB={pairBName} />
            </div>
          )}

          {host && (
            <>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={handleChangeCourt}
                className="w-full mt-4 mb-4 py-2 text-sm font-medium rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Change court — teams switch ends
              </button>
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-2 text-center">
                    One pair did not show?
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => forfeitDefaultWin(live.match.pairAId)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/50 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      Default win · Pair A
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => forfeitDefaultWin(live.match.pairBId)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/50 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      Default win · Pair B
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {aiAnnounceOn && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm bg-violet-600 rounded-lg"
                      onClick={() =>
                        announceCourtMatch(
                          court.name,
                          displayMatch.teamA,
                          displayMatch.teamB
                        )
                      }
                    >
                      Call players again
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={endMatch}
                    className="px-4 py-2 text-sm bg-purple-500 rounded-lg font-medium disabled:opacity-50"
                  >
                    End match
                  </button>
                </div>
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
              disabled={actionBusy}
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
