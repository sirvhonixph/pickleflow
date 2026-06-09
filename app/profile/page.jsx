"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import CategoryBadge from "@/components/CategoryBadge";
import TrophyBadge from "@/components/TrophyBadge";
import PlayerMatchHistory from "@/components/PlayerMatchHistory";
import PlayerAvatar from "@/components/PlayerAvatar";
import { fetchPlayerStats } from "@/lib/stats";
import { fetchPlayerProfile, updateMyProfile } from "@/lib/players";
import { readImageAsDataUrl } from "@/lib/image-upload";
import { resolvePlayerDisplayName } from "@/lib/display-name";
import { isValidCategory } from "@/lib/player-category";
import { SKILL_CATEGORIES, categoryLabel } from "@/lib/categories";
import MessagesNavLink from "@/components/MessagesNavLink";
import { getCurrentUser, getPlayerId, saveCurrentUser } from "@/lib/session";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState("");

  const syncProfile = useCallback(async (u, id, data, profile) => {
    const resolved =
      data.displayName ??
      resolvePlayerDisplayName({
        playerId: id,
        userName: u?.name,
        storeName: profile?.player?.name,
        historyEntries: data.history,
      }) ??
      "Player";

    const resolvedCategory =
      profile?.category ??
      profile?.player?.category ??
      (isValidCategory(u?.category) ? u.category : "");

    setDisplayName(resolved);
    setCategory(resolvedCategory);

    const patch = {};
    if (resolved && resolved !== "Player" && u?.name !== resolved) {
      patch.name = resolved;
    }
    if (resolvedCategory && u?.category !== resolvedCategory) {
      patch.category = resolvedCategory;
    }

    if (Object.keys(patch).length > 0 && u) {
      const next = { ...u, ...patch };
      saveCurrentUser(next);
      setUser(next);
      try {
        await updateMyProfile(patch);
      } catch {
        /* keep local session in sync even if server fails */
      }
    }
  }, []);

  const load = useCallback(async () => {
    const u = getCurrentUser();
    setUser(u);
    const id = getPlayerId(u);
    if (!id) {
      setStatsData(null);
      setDisplayName("");
      setCategory("");
      setLoading(false);
      return;
    }
    try {
      const [data, profile] = await Promise.all([
        fetchPlayerStats(id),
        fetchPlayerProfile(id).catch(() => null),
      ]);
      setStatsData(data);
      await syncProfile(u, id, data, profile);
    } catch {
      setStatsData(null);
      setDisplayName(u?.name?.trim() || "Player");
      setCategory(isValidCategory(u?.category) ? u.category : "");
    } finally {
      setLoading(false);
    }
  }, [syncProfile]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      const player = await updateMyProfile({ avatarDataUrl: dataUrl });
      const next = { ...getCurrentUser(), avatarDataUrl: player.avatarDataUrl };
      saveCurrentUser(next);
      setUser(next);
    } catch (err) {
      setAvatarError(err.message ?? "Could not update photo");
    } finally {
      setAvatarBusy(false);
      e.target.value = "";
    }
  };

  const handleCategoryChange = async (e) => {
    const nextCategory = e.target.value;
    if (!isValidCategory(nextCategory)) return;
    setCategoryBusy(true);
    setCategoryError("");
    try {
      const player = await updateMyProfile({ category: nextCategory });
      const next = { ...getCurrentUser(), category: player.category };
      saveCurrentUser(next);
      setUser(next);
      setCategory(player.category);
    } catch (err) {
      setCategoryError(err.message ?? "Could not update skill level");
    } finally {
      setCategoryBusy(false);
    }
  };

  const stats = statsData?.stats;
  const rank = statsData?.rank;

  return (
    <AppShell>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-4xl font-bold">My Profile</h1>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/players"
              className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-700"
            >
              Find players
            </Link>
            <MessagesNavLink className="px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold" />
            <Link
              href="/settings"
              className="px-4 py-2 bg-cyan-500 text-black rounded-lg text-sm font-semibold"
            >
              Settings
            </Link>
          </div>
        </div>

        {!user ? (
          <p className="text-slate-400">
            Not signed in.{" "}
            <Link href="/login" className="text-cyan-400 hover:underline">
              Log in
            </Link>
          </p>
        ) : (
          <div className="space-y-8">
            <div className="bg-slate-900 rounded-xl p-8 border border-slate-800">
              <div className="flex flex-wrap items-start gap-6">
                <div className="relative">
                  <PlayerAvatar user={user} size="lg" />
                  {statsData?.isTopThree && (
                    <div className="absolute -top-2 -right-3">
                      <TrophyBadge rank={rank} size="lg" />
                    </div>
                  )}
                  <label className="mt-3 flex flex-col items-center gap-1 cursor-pointer">
                    <span className="text-xs text-cyan-400 hover:underline">
                      {avatarBusy ? "Uploading…" : "Change photo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={avatarBusy}
                      onChange={handleAvatarChange}
                    />
                  </label>
                  {avatarError && (
                    <p className="text-xs text-red-400 mt-1 max-w-[120px] text-center">
                      {avatarError}
                    </p>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-3xl font-bold">{displayName || "Player"}</h2>
                  <p className="text-slate-400 mt-2">{user.email}</p>

                  <div className="mt-4">
                    <span className="text-sm text-slate-500 mr-2 block mb-2">
                      Skill level
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      {category && <CategoryBadge category={category} />}
                      <select
                        value={category || "novice"}
                        disabled={categoryBusy}
                        onChange={handleCategoryChange}
                        className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                      >
                        {SKILL_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      {category && (
                        <span className="text-xs text-slate-500">
                          {categoryLabel(category)}
                        </span>
                      )}
                      {categoryError && (
                        <p className="text-xs text-red-400 w-full">
                          {categoryError}
                        </p>
                      )}
                    </div>
                  </div>

                  {statsData?.isTopThree && (
                    <p className="mt-4 text-sm text-amber-300/90 font-medium">
                      You&apos;re in the top 3 open-play leaders globally.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                <div className="bg-slate-800 p-4 rounded-lg text-center">
                  <p className="text-xs text-slate-500 uppercase">Win %</p>
                  <p className="text-2xl font-bold text-cyan-400 mt-1">
                    {loading ? "—" : `${stats?.winPct ?? 0}%`}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">wins ÷ (W+L)</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg text-center">
                  <p className="text-xs text-slate-500 uppercase">Wins</p>
                  <p className="text-2xl font-bold text-green-400 mt-1">
                    {loading ? "—" : (stats?.wins ?? 0)}
                  </p>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg text-center">
                  <p className="text-xs text-slate-500 uppercase">Losses</p>
                  <p className="text-2xl font-bold text-red-400/90 mt-1">
                    {loading ? "—" : (stats?.losses ?? 0)}
                  </p>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg text-center">
                  <p className="text-xs text-slate-500 uppercase">Rank</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "—" : rank ? `#${rank}` : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 bg-slate-800/50 p-4 rounded-lg">
                <p className="text-xs text-slate-500">DUPR</p>
                <p className="text-xl font-bold mt-1">{user.dupr || "—"}</p>
              </div>
            </div>

            <section>
              <h2 className="text-xl font-bold mb-1">Your open play history</h2>
              <p className="text-slate-500 text-sm mb-4">
                Every completed match you played in (all events).
              </p>
              {loading ? (
                <p className="text-slate-500 text-sm">Loading history…</p>
              ) : (
                <div className="max-h-[min(480px,55vh)] overflow-y-auto overflow-x-hidden pr-1 -mr-1">
                  <PlayerMatchHistory history={statsData?.history ?? []} />
                </div>
              )}
            </section>
          </div>
        )}
    </AppShell>
  );
}
