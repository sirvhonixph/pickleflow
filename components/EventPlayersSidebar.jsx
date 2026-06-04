"use client";

import { useState } from "react";
import CategoryBadge from "@/components/CategoryBadge";
import { SKILL_CATEGORIES } from "@/lib/categories";
import {
  formatWaitDuration,
  getPlayerWaitInfo,
  sortPlayersByWait,
} from "@/lib/player-wait";

export default function EventPlayersSidebar({
  event,
  currentPlayerId,
  host,
  onSeedSamplePlayers,
  onAddPlayer,
  onRemovePlayer,
}) {
  const [seeding, setSeeding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "beginner",
    email: "",
  });

  const registrations = event?.registrations ?? [];
  const sorted = sortPlayersByWait(registrations, event);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await onAddPlayer({
        name: form.name,
        category: form.category,
        email: form.email.trim() || undefined,
      });
      setForm({ name: "", category: "beginner", email: "" });
      setShowAddForm(false);
    } catch (err) {
      setError(err.message ?? "Could not add player");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (playerId) => {
    if (!confirm("Remove this player from the event?")) return;
    setRemovingId(playerId);
    setError("");
    try {
      await onRemovePlayer(playerId);
    } catch (err) {
      setError(err.message ?? "Could not remove player");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950 flex flex-col max-h-[min(420px,50vh)] lg:max-h-[calc(100vh-2rem)] lg:sticky lg:top-4">
      <div className="p-4 border-b border-slate-800">
        <h2 className="font-bold text-lg">Players</h2>
        <p className="text-xs text-slate-500 mt-1">
          {registrations.length} registered · sorted by longest wait
        </p>

        {host && (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="w-full py-2 text-xs font-medium rounded-lg bg-cyan-500 text-black hover:opacity-90"
            >
              {showAddForm ? "Cancel" : "+ Add walk-in player"}
            </button>

            {onSeedSamplePlayers && (
              <button
                type="button"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  setError("");
                  try {
                    await onSeedSamplePlayers();
                  } catch (err) {
                    setError(err.message ?? "Failed");
                  } finally {
                    setSeeding(false);
                  }
                }}
                className="w-full py-2 text-xs font-medium rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
              >
                {seeding ? "Adding…" : "Add 8 example players"}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1.5 rounded">
            {error}
          </p>
        )}

        {host && showAddForm && (
          <form onSubmit={handleAdd} className="mt-3 space-y-2">
            <input
              required
              placeholder="Full name"
              className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {SKILL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Email (optional)"
              className="w-full p-2 text-sm rounded-lg bg-slate-800 border border-slate-700"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <button
              type="submit"
              disabled={adding}
              className="w-full py-2 text-sm font-medium rounded-lg bg-cyan-600 text-white disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add to event"}
            </button>
          </form>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {sorted.length === 0 ? (
          <li className="p-4 text-sm text-slate-500">
            {host
              ? "No players yet. Add walk-ins or share the event link."
              : "No players registered yet."}
          </li>
        ) : (
          sorted.map((p) => {
            const wait = getPlayerWaitInfo(event, p.playerId);
            const isYou = p.playerId === currentPlayerId;

            return (
              <li
                key={p.playerId}
                className={`px-4 py-3 ${isYou ? "bg-cyan-500/10" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm leading-snug flex-1">
                    {p.name}
                    {isYou && (
                      <span className="text-cyan-400 text-xs ml-1">(you)</span>
                    )}
                  </span>
                  <CategoryBadge category={p.category} />
                </div>
                <p
                  className={`mt-1.5 text-xs ${
                    wait.status === "playing"
                      ? "text-green-400"
                      : "text-amber-400/95"
                  }`}
                >
                  {wait.status === "playing" ? (
                    <>On court · {wait.playingCourts.join(", ")}</>
                  ) : (
                    <>Waiting · {formatWaitDuration(wait.waitMs)}</>
                  )}
                </p>
                {host && onRemovePlayer && (
                  <button
                    type="button"
                    disabled={removingId === p.playerId}
                    onClick={() => handleRemove(p.playerId)}
                    className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {removingId === p.playerId ? "Removing…" : "Remove player"}
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
