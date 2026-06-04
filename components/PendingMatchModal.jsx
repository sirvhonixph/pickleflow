"use client";

import { useEffect, useMemo, useState } from "react";
import CategoryBadge from "@/components/CategoryBadge";
import { formatCourtMatchAnnouncement } from "@/lib/announce";
import { getAlternatePlayers } from "@/lib/court-pending";
import {
  applyAdjacentFormation,
  filterAlternatesForBracket,
  getMatchBracket,
} from "@/lib/matchmaking";
import { formatWaitDuration } from "@/lib/player-wait";

function queuePlayer(p) {
  return {
    playerId: p.playerId,
    name: p.name,
    email: p.email ?? p.playerId,
    category: p.category,
    queuedAt: p.queuedAt ?? Date.now(),
  };
}

function waitLabel(player, now) {
  const ms = Math.max(0, now - (player.queuedAt ?? now));
  return formatWaitDuration(ms);
}

export default function PendingMatchModal({
  event,
  court,
  open,
  onClose,
  onConfirm,
  onCancel,
}) {
  const pending = court?.pendingMatch;
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [callPlayers, setCallPlayers] = useState(true);
  const [adjacentFormation, setAdjacentFormation] = useState("mixed");
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  useEffect(() => {
    if (!pending) return;
    setTeamA((pending.teamA ?? []).map(queuePlayer));
    setTeamB((pending.teamB ?? []).map(queuePlayer));
    setCallPlayers(court.aiAnnounce !== false);
    setAdjacentFormation(pending.formation ?? "mixed");
  }, [pending?.proposedAt, court?.id, court?.aiAnnounce, pending?.formation]);

  const fifoRoster = useMemo(() => {
    if (!pending?.players?.length) return [];
    return [...pending.players].sort(
      (a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0)
    );
  }, [pending]);

  const bracket = useMemo(
    () => getMatchBracket([...teamA, ...teamB]),
    [teamA, teamB]
  );

  const applyFormation = (formation) => {
    const players = [...teamA, ...teamB];
    const draft = applyAdjacentFormation(players, formation);
    setTeamA(draft.teamA.map(queuePlayer));
    setTeamB(draft.teamB.map(queuePlayer));
    setAdjacentFormation(formation);
  };

  const alternates = useMemo(() => {
    if (!event || !court) return [];
    const ids = [...teamA, ...teamB].map((p) => p.playerId);
    const raw = getAlternatePlayers(event, court.id, ids);
    return filterAlternatesForBracket(raw, bracket);
  }, [event, court, teamA, teamB, bracket]);

  if (!open || !pending) return null;

  const moveToTeam = (playerId, target) => {
    const fromA = teamA.find((p) => p.playerId === playerId);
    const fromB = teamB.find((p) => p.playerId === playerId);
    const player = fromA ?? fromB;
    if (!player) return;

    if (target === "A") {
      if (fromA) return;
      if (teamA.length >= 2) return;
      setTeamB((t) => t.filter((p) => p.playerId !== playerId));
      setTeamA((t) => [...t, player]);
    } else {
      if (fromB) return;
      if (teamB.length >= 2) return;
      setTeamA((t) => t.filter((p) => p.playerId !== playerId));
      setTeamB((t) => [...t, player]);
    }
  };

  const swapWithinTeams = (playerId) => {
    if (teamA.some((p) => p.playerId === playerId) && teamA.length === 2) {
      setTeamA(([a, b]) => [b, a]);
    }
    if (teamB.some((p) => p.playerId === playerId) && teamB.length === 2) {
      setTeamB(([a, b]) => [b, a]);
    }
  };

  const replacePlayer = (playerId, alternate) => {
    const next = queuePlayer(alternate);
    if (teamA.some((p) => p.playerId === playerId)) {
      setTeamA((t) => t.map((p) => (p.playerId === playerId ? next : p)));
    } else {
      setTeamB((t) => t.map((p) => (p.playerId === playerId ? next : p)));
    }
  };

  const renderTeam = (label, side, players, otherSide) => (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <h4 className="text-sm font-semibold text-cyan-400 mb-3">{label}</h4>
      <ul className="space-y-3">
        {players.map((p, idx) => (
          <li
            key={p.playerId}
            className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-slate-500 ml-2">
                  waited {waitLabel(p, now)}
                </span>
              </div>
              <CategoryBadge category={p.category} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                onClick={() => moveToTeam(p.playerId, otherSide)}
              >
                Move to {otherSide === "A" ? "Team A" : "Team B"}
              </button>
              {players.length === 2 && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                  onClick={() => swapWithinTeams(p.playerId)}
                >
                  Swap partner
                </button>
              )}
            </div>
            {alternates.length > 0 && (
              <label className="block text-xs text-slate-500">
                Replace with (FIFO alternates)
                <select
                  className="mt-1 w-full p-2 rounded bg-slate-800 border border-slate-600 text-sm text-white"
                  value=""
                  onChange={(e) => {
                    const alt = alternates.find(
                      (a) => a.playerId === e.target.value
                    );
                    if (alt) replacePlayer(p.playerId, alt);
                    e.target.value = "";
                  }}
                >
                  <option value="">— next available —</option>
                  {alternates.map((a) => (
                    <option key={a.playerId} value={a.playerId}>
                      {a.name} ({waitLabel(a, now)} wait)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
        {players.length < 2 && (
          <p className="text-xs text-amber-400">Add a player from the other team.</p>
        )}
      </ul>
    </div>
  );

  const canStart =
    teamA.length === 2 &&
    teamB.length === 2 &&
    new Set([...teamA, ...teamB].map((p) => p.playerId)).size === 4 &&
    bracket.type !== "invalid";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-match-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/40 bg-slate-900 shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 px-6 py-4">
          <h2 id="pending-match-title" className="text-xl font-bold">
            Review match — {court.name}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {pending.matchBracket ? (
              <span className="text-cyan-400 font-medium">
                {pending.matchBracket}
              </span>
            ) : (
              "Skill bracket match"
            )}{" "}
            · FIFO (longest wait first). Edit teams, then start. Players are not
            called until you confirm.
          </p>
        </div>

        <div className="px-6 py-4 space-y-5">
          {bracket.canToggleFormation && (
            <section className="rounded-lg border border-slate-700 p-3 space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">
                Cross-level format (2 + 2)
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`text-xs px-3 py-1.5 rounded-lg ${
                    adjacentFormation === "mixed"
                      ? "bg-cyan-500 text-black font-semibold"
                      : "bg-slate-700 text-slate-300"
                  }`}
                  onClick={() => applyFormation("mixed")}
                >
                  Mixed (e.g. Novice/Intermediate vs Novice/Intermediate)
                </button>
                <button
                  type="button"
                  className={`text-xs px-3 py-1.5 rounded-lg ${
                    adjacentFormation === "level-split"
                      ? "bg-cyan-500 text-black font-semibold"
                      : "bg-slate-700 text-slate-300"
                  }`}
                  onClick={() => applyFormation("level-split")}
                >
                  Level lines (Novice vs Intermediate)
                </button>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">
              FIFO order (longest wait first)
            </h3>
            <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1">
              {fifoRoster.map((p) => (
                <li key={p.playerId}>
                  {p.name}
                  <span className="text-slate-600 ml-1">
                    · {waitLabel(p, now)}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid sm:grid-cols-2 gap-4">
            {renderTeam("Team A", "A", teamA, "B")}
            {renderTeam("Team B", "B", teamB, "A")}
          </div>

          {canStart && (
            <p className="text-sm text-slate-400 rounded-lg bg-slate-800/60 p-3">
              {formatCourtMatchAnnouncement(court.name, teamA, teamB)}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={callPlayers}
              onChange={(e) => setCallPlayers(e.target.checked)}
            />
            Call players (AI — court + player names) when match starts
          </label>
        </div>

        <div className="sticky bottom-0 flex flex-wrap gap-2 justify-end border-t border-slate-800 bg-slate-900/95 px-6 py-4">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-300"
            disabled={busy}
            onClick={onClose}
          >
            Review later
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-red-500/50 text-red-400"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCancel();
              } finally {
                setBusy(false);
              }
            }}
          >
            Cancel proposal
          </button>
          <button
            type="button"
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-cyan-500 text-black disabled:opacity-40"
            disabled={!canStart || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ teamA, teamB, callPlayers });
              } finally {
                setBusy(false);
              }
            }}
          >
            Start match
          </button>
        </div>
      </div>
    </div>
  );
}
