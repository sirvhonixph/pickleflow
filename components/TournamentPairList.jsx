"use client";

import { useState } from "react";
import { divisionLabel, pairDisplayName } from "@/lib/tournament-divisions";
import { updateTournamentPair, updateTournamentPairBase } from "@/lib/events";
import PairBasePlayerPicker from "@/components/PairBasePlayerPicker";

function PairEditForm({ pair, busy, onSave, onCancel }) {
  const [player1Name, setPlayer1Name] = useState(pair.player1?.name ?? "");
  const [player2Name, setPlayer2Name] = useState(pair.player2?.name ?? "");
  const [teamName, setTeamName] = useState(pair.teamName ?? "");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onSave({ player1Name, player2Name, teamName });
    } catch (err) {
      setError(err.message ?? "Could not save");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-lg border border-purple-500/40 bg-slate-950/80 p-3">
      <input
        required
        placeholder="Player 1 name"
        className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
        value={player1Name}
        onChange={(e) => setPlayer1Name(e.target.value)}
        disabled={busy}
      />
      <input
        required
        placeholder="Player 2 name"
        className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
        value={player2Name}
        onChange={(e) => setPlayer2Name(e.target.value)}
        disabled={busy}
      />
      <input
        placeholder="Team name (optional — shown instead of Player 1 / Player 2)"
        className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        disabled={busy}
      />
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-purple-500 text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save names"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TournamentPairList({
  event,
  eventId,
  host,
  isEnded,
  onEventUpdate,
  divisionId = null,
  defaultCollapsed = null,
}) {
  const [collapsed, setCollapsed] = useState(
    defaultCollapsed ?? !!divisionId
  );
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  if (!host || isEnded) return null;

  const pairs = event?.pairRegistrations ?? [];
  const visiblePairs = divisionId
    ? pairs.filter((p) => p.divisionId === divisionId)
    : pairs;
  if (visiblePairs.length === 0) return null;

  const byDivision = new Map();
  for (const pair of visiblePairs) {
    const list = byDivision.get(pair.divisionId) ?? [];
    list.push(pair);
    byDivision.set(pair.divisionId, list);
  }

  const handleSave = async (pairId, names) => {
    setBusyId(pairId);
    try {
      const ev = await updateTournamentPair(eventId, pairId, names);
      onEventUpdate(ev);
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleBaseSelect = async (pairId, basePlayerId) => {
    setBusyId(pairId);
    try {
      const ev = await updateTournamentPairBase(eventId, pairId, basePlayerId);
      onEventUpdate(ev);
    } finally {
      setBusyId(null);
    }
  };

  const title = divisionId
    ? `Registered pairs — ${divisionLabel(divisionId, event)}`
    : "Pairs — base player";

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            {collapsed
              ? `${visiblePairs.length} pair${visiblePairs.length === 1 ? "" : "s"} registered`
              : divisionId
                ? "Edit names or set each pair's base player."
                : "Optional: pre-set each pair's base player here. You can also start the match first, then tap Set as base on the live court."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCollapsed((c) => !c);
            if (!collapsed) setEditingId(null);
          }}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-700 hover:border-purple-500/50 shrink-0"
        >
          {collapsed ? "Expand" : "Minimize"}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-5 mt-4">
          {[...byDivision.entries()].map(([divId, divisionPairs]) => (
            <div key={divId}>
              {!divisionId && (
                <h4 className="text-sm font-semibold text-purple-300/90 mb-2">
                  {divisionLabel(divId, event)}
                </h4>
              )}
              <ul className="space-y-2">
                {divisionPairs.map((pair) => (
                  <li
                    key={pair.id}
                    className="rounded-lg border border-slate-800 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {pairDisplayName(pair)}
                        </p>
                        {!pair.teamName?.trim() && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {pair.player1?.name} · {pair.player2?.name}
                          </p>
                        )}
                      </div>
                      {editingId !== pair.id && (
                        <button
                          type="button"
                          onClick={() => setEditingId(pair.id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:border-purple-500/50 shrink-0"
                        >
                          Edit names
                        </button>
                      )}
                    </div>
                    {editingId === pair.id && (
                      <PairEditForm
                        pair={pair}
                        busy={busyId === pair.id}
                        onSave={(names) => handleSave(pair.id, names)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                    {editingId !== pair.id && (
                      <PairBasePlayerPicker
                        pair={pair}
                        busy={busyId === pair.id}
                        onSelect={(basePlayerId) =>
                          handleBaseSelect(pair.id, basePlayerId)
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
