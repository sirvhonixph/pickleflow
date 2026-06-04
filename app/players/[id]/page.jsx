"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CategoryBadge from "@/components/CategoryBadge";
import TrophyBadge from "@/components/TrophyBadge";
import PlayerAvatar from "@/components/PlayerAvatar";
import PlayerMatchHistory from "@/components/PlayerMatchHistory";
import { fetchPlayerProfile } from "@/lib/players";
import { getCurrentUser, getPlayerId } from "@/lib/session";

export default function PublicPlayerProfilePage() {
  const params = useParams();
  const playerId = decodeURIComponent(params.id ?? "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();
  const myId = getPlayerId(user);
  const isSelf = myId && myId === playerId;

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    try {
      const res = await fetchPlayerProfile(playerId);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const player = data?.player;
  const stats = data?.stats;
  const skillLevel = data?.category ?? player?.category ?? "";

  return (
    <AppShell>
      <Link href="/players" className="text-sm text-slate-500 hover:text-cyan-400">
        ← Find players
      </Link>

      {loading ? (
        <p className="text-slate-500 mt-8">Loading profile…</p>
      ) : !player ? (
        <p className="text-slate-500 mt-8">Player not found.</p>
      ) : (
        <div className="mt-6 space-y-8">
          <div className="bg-slate-900 rounded-xl p-8 border border-slate-800">
            <div className="flex flex-wrap items-start gap-6">
              <div className="relative">
                <PlayerAvatar player={player} size="lg" />
                {data?.isTopThree && (
                  <div className="absolute -top-2 -right-3">
                    <TrophyBadge rank={data.rank} size="lg" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold">{player.name}</h1>
                <p className="text-slate-400 mt-1 text-sm">{player.email}</p>
                <div className="mt-3">
                  <span className="text-sm text-slate-500 mr-2">Skill level</span>
                  {skillLevel ? (
                    <CategoryBadge category={skillLevel} />
                  ) : (
                    <span className="text-slate-500 text-sm">Not set</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  {isSelf ? (
                    <Link
                      href="/profile"
                      className="px-4 py-2 bg-cyan-500 text-black rounded-lg text-sm font-semibold"
                    >
                      Edit my profile
                    </Link>
                  ) : (
                    <Link
                      href={`/messages?with=${encodeURIComponent(player.email)}`}
                      className="px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold"
                    >
                      Send message
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              <div className="bg-slate-800 p-4 rounded-lg text-center">
                <p className="text-xs text-slate-500 uppercase">Win %</p>
                <p className="text-2xl font-bold text-cyan-400 mt-1">
                  {stats?.winPct ?? 0}%
                </p>
                <p className="text-[10px] text-slate-600 mt-1">of decided games</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg text-center">
                <p className="text-xs text-slate-500 uppercase">Wins</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {stats?.wins ?? 0}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg text-center">
                <p className="text-xs text-slate-500 uppercase">Losses</p>
                <p className="text-2xl font-bold text-red-400/90 mt-1">
                  {stats?.losses ?? 0}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg text-center">
                <p className="text-xs text-slate-500 uppercase">Rank</p>
                <p className="text-2xl font-bold mt-1">
                  {data?.rank ? `#${data.rank}` : "—"}
                </p>
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-bold mb-4">Recent open play</h2>
            <div className="max-h-[min(360px,45vh)] overflow-y-auto">
              <PlayerMatchHistory history={data?.history ?? []} />
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
