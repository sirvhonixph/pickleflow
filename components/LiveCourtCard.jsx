"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CategoryBadge from "@/components/CategoryBadge";
import CourtDiagram from "@/components/CourtDiagram";
import {
  formatCourtMatchAnnouncement,
  announceCourtMatch,
  formatTeamSlash,
} from "@/lib/announce";
import {
  applyScoreDelta,
  applyScoreValue,
  alignTeamToScore,
  toggleChangeCourt,
} from "@/lib/court-positions";
import { updateCourt, updateLiveMatch, endCourtMatch } from "@/lib/events";
import { pickNextFour } from "@/lib/matchmaking";

function PlayingRoster({ teamA, teamB }) {
  return (
    <div className="text-sm space-y-2">
      <div>
        <span className="text-slate-500">Team A · </span>
        <span className="text-white">{formatTeamSlash(teamA ?? [])}</span>
      </div>
      <div>
        <span className="text-slate-500">Team B · </span>
        <span className="text-white">{formatTeamSlash(teamB ?? [])}</span>
      </div>
    </div>
  );
}

export default function LiveCourtCard({
  court,
  eventId,
  host,
  onReload,
  onEventUpdate,
  onPauseAutoRefresh,
  onRemoveCourt,
  onReviewPending,
}) {
  const match = court.currentMatch;
  const pending = court.pendingMatch;
  const isLive = court.status === "live" && match;
  const isPending = court.status === "pending" && pending;
  const autoMatchOn = court.autoMatch !== false && !court.lastMatch;
  const lastMatchOn = court.lastMatch === true;
  const canAutoStart =
    autoMatchOn && !isPending && pickNextFour(court.queue ?? []) !== null;
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [localMatch, setLocalMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const pendingPatchRef = useRef(null);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(false);
  const saveChainRef = useRef(Promise.resolve());
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    if (!match) {
      setLocalMatch(null);
      return;
    }
    setScoreA(match.scoreA ?? 0);
    setScoreB(match.scoreB ?? 0);
    setLocalMatch(match);
  }, [court.id, match?.startedAt]);

  const displayMatch = useMemo(() => {
    const base = localMatch ?? match;
    if (!base) return null;
    return { ...base, scoreA, scoreB };
  }, [localMatch, match, scoreA, scoreB]);

  const applyServerEvent = useCallback(
    (ev) => {
      onPauseAutoRefresh?.(30000);
      if (ev) onEventUpdate?.(ev);
      else onReload?.();
    },
    [onEventUpdate, onPauseAutoRefresh, onReload]
  );

  const flushLiveSave = useCallback(async () => {
    const m = matchRef.current;
    if (!m || !pendingPatchRef.current) return;
    if (savingRef.current) {
      saveTimerRef.current = setTimeout(() => flushLiveSave(), 150);
      return;
    }

    const patch = pendingPatchRef.current;
    pendingPatchRef.current = null;
    savingRef.current = true;
    setSaving(true);
    onPauseAutoRefresh?.(30000);

    const run = async () => {
      try {
        const ev = await updateLiveMatch(eventId, court.id, patch);
        applyServerEvent(ev);
      } catch {
        /* keep optimistic UI */
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
  }, [applyServerEvent, court.id, eventId]);

  const queueLiveSave = useCallback(
    (patch) => {
      pendingPatchRef.current = { ...(pendingPatchRef.current ?? {}), ...patch };
      onPauseAutoRefresh?.(30000);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => flushLiveSave(), 200);
    },
    [flushLiveSave, onPauseAutoRefresh]
  );

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const matchForScoring = () => {
    const base = localMatch ?? match;
    if (!base) return null;
    return { ...base, scoreA, scoreB };
  };

  const bumpScore = (team, delta) => {
    const m = matchForScoring();
    if (!m) return;
    const patch = applyScoreDelta(m, team, delta, { scoreA, scoreB });
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const setTeamScore = (team, value) => {
    const m = matchForScoring();
    if (!m) return;
    const patch = applyScoreValue(m, team, value, { scoreA, scoreB });
    setScoreA(patch.scoreA);
    setScoreB(patch.scoreB);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const handleSetBase = (teamId, playerId, half) => {
    const m = matchForScoring();
    if (!m) return;
    const patch =
      teamId === "A"
        ? {
            basePlayerA: playerId,
            teamA: alignTeamToScore(m.teamA, playerId, half, scoreA),
          }
        : {
            basePlayerB: playerId,
            teamB: alignTeamToScore(m.teamB, playerId, half, scoreB),
          };
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const handleChangeCourt = () => {
    const m = matchForScoring();
    if (!m) return;
    const patch = toggleChangeCourt(m);
    setLocalMatch((prev) => ({ ...(prev ?? m), ...patch }));
    queueLiveSave(patch);
  };

  const handleEndMatch = async () => {
    if (busy) return;
    clearTimeout(saveTimerRef.current);
    if (pendingPatchRef.current) {
      await flushLiveSave();
    }
    setBusy(true);
    try {
      const ev = await endCourtMatch(eventId, court.id);
      applyServerEvent(ev);
    } catch {
      /* keep current UI */
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = isLive
    ? lastMatchOn
      ? "LIVE · last match"
      : "LIVE"
    : isPending
      ? host
        ? "REVIEW"
        : "Up next"
      : lastMatchOn
        ? "Closed"
        : "Available";

  return (
    <div
      className={`rounded-xl border p-5 ${
        isLive
          ? "border-green-500/50 bg-green-500/5"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-lg font-semibold">{court.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {host && !isLive && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                lastMatchOn
                  ? "bg-orange-500/20 text-orange-300"
                  : autoMatchOn
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-slate-800 text-slate-500"
              }`}
            >
              {lastMatchOn
                ? "Last match"
                : autoMatchOn
                  ? "Auto-match on"
                  : "Auto-match off"}
            </span>
          )}
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${
              isLive
                ? "bg-green-500 text-black"
                : isPending
                  ? "bg-amber-500/30 text-amber-300"
                  : "bg-slate-700 text-slate-300"
            }`}
          >
            {statusLabel}
          </span>
          {host && isPending && onReviewPending && (
            <button
              type="button"
              onClick={onReviewPending}
              className="text-xs px-2 py-1 rounded bg-cyan-500 text-black font-semibold"
            >
              Review match
            </button>
          )}
          {host && onRemoveCourt && !isLive && !isPending && (
            <button
              type="button"
              onClick={() => onRemoveCourt(court.id)}
              className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              Remove court
            </button>
          )}
        </div>
      </div>

      {host && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-800/40 p-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoMatchOn}
              disabled={busy || lastMatchOn}
              onChange={async (e) => {
                setBusy(true);
                try {
                  const ev = await updateCourt(eventId, court.id, {
                    autoMatch: e.target.checked,
                  });
                  applyServerEvent(ev);
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span className="text-sm">
              <span className="font-medium text-white block">
                Auto-start matches on this court
              </span>
              <span className="text-slate-400 text-xs mt-0.5 block">
                When on, proposes the next 4 by wait time for your review (FIFO).
                {lastMatchOn ? " Turn off last match below to re-open this court." : ""}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={lastMatchOn}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  const patch = { lastMatch: e.target.checked };
                  if (e.target.checked) patch.autoMatch = false;
                  const ev = await updateCourt(eventId, court.id, patch);
                  applyServerEvent(ev);
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span className="text-sm">
              <span className="font-medium text-white block">
                Last match on this court
              </span>
              <span className="text-slate-400 text-xs mt-0.5 block">
                {isLive
                  ? "Finish this game, then no new matches will be scheduled here."
                  : isPending
                    ? "Complete or cancel the pending match, then this court closes to new games."
                    : "No new matches will be auto-scheduled on this court."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={court.aiAnnounce !== false}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  const ev = await updateCourt(eventId, court.id, {
                    aiAnnounce: e.target.checked,
                  });
                  applyServerEvent(ev);
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span className="text-sm">
              <span className="font-medium text-white block">
                AI announces players on this court
              </span>
              <span className="text-slate-400 text-xs mt-0.5 block">
                {isLive && match
                  ? formatCourtMatchAnnouncement(
                      court.name,
                      match.teamA,
                      match.teamB
                    )
                  : `Speaks court name and all four player names when you start a match`}
              </span>
            </span>
          </label>
          {isLive && match && court.aiAnnounce !== false && (
            <button
              type="button"
              className="mt-3 w-full py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 transition"
              onClick={() =>
                announceCourtMatch(court.name, match.teamA, match.teamB)
              }
            >
              Call players now
            </button>
          )}
        </div>
      )}

      {isLive && (
        <div className="mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
            Now playing
          </p>
          <CourtDiagram
            match={displayMatch ?? match}
            scoreA={host ? scoreA : (displayMatch ?? match).scoreA}
            scoreB={host ? scoreB : (displayMatch ?? match).scoreB}
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
              <PlayingRoster teamA={match.teamA} teamB={match.teamB} />
            </div>
          )}

          {host && (
            <>
              <button
                type="button"
                onClick={handleChangeCourt}
                disabled={busy}
                className="w-full mt-4 mb-4 py-2 text-sm font-medium rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Change court — teams switch ends (base moves to correct side)
              </button>
              <div className="border-t border-slate-800 pt-4 flex flex-wrap gap-2 justify-center">
                {court.aiAnnounce !== false && (
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
                  className="px-3 py-1.5 text-sm bg-purple-500 rounded-lg font-medium disabled:opacity-50"
                  onClick={handleEndMatch}
                >
                  {busy ? "Ending…" : "End match"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isPending && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          {pending.matchBracket && (
            <p className="text-sm text-cyan-400 font-medium mb-2">
              {pending.matchBracket}
            </p>
          )}
          <PlayingRoster teamA={pending.teamA} teamB={pending.teamB} />
          {!host && (
            <p className="text-xs text-slate-500 mt-3">
              Waiting for the host to start this match.
            </p>
          )}
          {host && (
            <p className="text-amber-400/90 text-sm mt-3">
              Review teams before starting or calling players.
            </p>
          )}
        </div>
      )}

      {host && !isLive && !isPending && (
        <p className="text-slate-500 text-sm mb-3">
          {lastMatchOn
            ? "This court is closed to new matches. Uncheck last match to schedule games here again."
            : autoMatchOn
              ? canAutoStart
                ? "Ready — a match proposal will appear for host review."
                : court.queue.length < 4
                  ? `Waiting for players (${court.queue.length}/4 in queue).`
                  : "Need 4 same skill, or odd count with adjacent levels (mixed or level lines)."
              : "Auto-match is off for this court."}
        </p>
      )}

      {!host && !isLive && !isPending && (
        <p className="text-slate-500 text-sm">No match on this court right now.</p>
      )}

      {host && (
        <div>
          <h4 className="text-sm text-slate-400 mb-2">
            Queue ({court.queue.length}) — longest wait first
          </h4>
          {court.queue.length === 0 ? (
            <p className="text-xs text-slate-600">No players queued yet</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {[...court.queue]
                .sort((a, b) => a.queuedAt - b.queuedAt)
                .map((q, i) => (
                  <li
                    key={q.playerId}
                    className="flex justify-between items-center text-sm gap-2"
                  >
                    <span>
                      {i + 1}. {q.name}
                    </span>
                    <CategoryBadge category={q.category} />
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
