"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard } from "@/lib/stats";
import TrophyBadge from "@/components/TrophyBadge";

export default function OpenPlayLeaderboard({
  eventId = null,
  currentPlayerId = null,
  title = "Open play leaders",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchLeaderboard(eventId);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData({ leaderboard: [], totalMatches: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(async () => {
      try {
        const res = await fetchLeaderboard(eventId);
        if (!cancelled) setData(res);
      } catch {
        /* ignore */
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId]);

  const board = data?.leaderboard ?? [];

  return (
    <section>
      <h2 className="text-xl font-bold mb-1">{title}</h2>
      <p className="text-slate-500 text-sm mb-4">
        Individual win rate from decided games (wins ÷ wins+losses, max 100%).
        Sorted by wins, then win %.
      </p>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading leaderboard…</p>
      ) : board.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
          No completed games yet. Stats appear after the host ends matches.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-left">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">T</th>
                <th className="px-4 py-3 text-right">Win %</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row, i) => {
                const rank = i + 1;
                const isYou = row.playerId === currentPlayerId;
                return (
                  <tr
                    key={row.playerId}
                    className={`border-b border-slate-800/80 last:border-0 ${
                      isYou ? "bg-cyan-500/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400">{rank}</span>
                        {rank <= 3 && <TrophyBadge rank={rank} size="sm" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {row.name}
                      {isYou && (
                        <span className="text-cyan-400 text-xs ml-1">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-green-400 font-semibold">
                      {row.wins}
                    </td>
                    <td className="px-4 py-3 text-center text-red-400/90">
                      {row.losses}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {row.ties}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {row.winPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}
