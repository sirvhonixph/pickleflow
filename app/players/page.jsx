"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import PlayerAvatar from "@/components/PlayerAvatar";
import { fetchPlayers, playerProfilePath } from "@/lib/players";
import MessagesNavLink from "@/components/MessagesNavLink";
import { getCurrentUser, getPlayerId } from "@/lib/session";

export default function PlayersSearchPage() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();
  const myId = getPlayerId(user);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      const data = await fetchPlayers(q);
      setPlayers(data.players ?? []);
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Find players</h1>
          <p className="text-slate-400 text-sm mt-1">
            Search by name or email to view profiles and send messages.
          </p>
        </div>
        <MessagesNavLink className="px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold" />
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player name…"
        className="w-full max-w-xl mb-6 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800"
      />

      {loading ? (
        <p className="text-slate-500 text-sm">Searching…</p>
      ) : players.length === 0 ? (
        <p className="text-slate-500 text-sm">No players found.</p>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.map((p) => (
            <li
              key={p.email}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3"
            >
              <PlayerAvatar player={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">
                  {p.name}
                  {p.email === myId && (
                    <span className="text-cyan-400 text-xs ml-1">(you)</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 truncate">{p.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Link
                    href={playerProfilePath(p.email)}
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    Profile
                  </Link>
                  {p.email !== myId && (
                    <Link
                      href={`/messages?with=${encodeURIComponent(p.email)}`}
                      className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                    >
                      Message
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
