"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import PlayerAvatar from "@/components/PlayerAvatar";
import { SKILL_CATEGORIES } from "@/lib/categories";
import { updateMyProfile, fetchPlayerProfile } from "@/lib/players";
import { readImageAsDataUrl } from "@/lib/image-upload";
import { getCurrentUser, getPlayerId, saveCurrentUser } from "@/lib/session";
import { isValidCategory } from "@/lib/player-category";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "beginner",
    dupr: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const u = getCurrentUser();
      if (cancelled) return;
      setUser(u);
      if (!u) return;

      let category = isValidCategory(u.category) ? u.category : "beginner";
      const id = getPlayerId(u);
      if (id) {
        try {
          const profile = await fetchPlayerProfile(id);
          const resolved = profile?.category ?? profile?.player?.category;
          if (isValidCategory(resolved)) {
            category = resolved;
            if (u.category !== resolved) {
              const next = { ...u, category: resolved };
              saveCurrentUser(next);
              setUser(next);
            }
          }
        } catch {
          /* use session/default */
        }
      }

      if (cancelled) return;
      setForm({
        name: u.name ?? "",
        email: u.email ?? "",
        category,
        dupr: u.dupr ?? "",
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      const player = await updateMyProfile({ avatarDataUrl: dataUrl });
      const next = { ...getCurrentUser(), avatarDataUrl: player.avatarDataUrl };
      saveCurrentUser(next);
      setUser(next);
      setMessage("Profile photo updated.");
    } catch (err) {
      setError(err.message ?? "Could not upload photo");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const player = await updateMyProfile({
        name: form.name.trim(),
        category: form.category,
        dupr: form.dupr.trim(),
      });
      const next = {
        ...user,
        name: player.name,
        category: player.category,
        dupr: player.dupr,
        avatarDataUrl: player.avatarDataUrl ?? user.avatarDataUrl,
      };
      saveCurrentUser(next);
      setUser(next);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <h1 className="text-4xl font-bold mb-8">Settings</h1>

      {!user ? (
        <p className="text-slate-400">
          <Link href="/login" className="text-cyan-400 hover:underline">
            Log in
          </Link>{" "}
          to edit settings.
        </p>
      ) : (
        <form
          onSubmit={handleSave}
          className="bg-slate-900 rounded-xl p-8 max-w-2xl border border-slate-800 space-y-6"
        >
          {message && (
            <p className="text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex items-center gap-4">
            <PlayerAvatar user={user} size="lg" />
            <label className="cursor-pointer">
              <span className="text-sm text-cyan-400 hover:underline">
                Change profile photo
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={handleAvatar}
              />
            </label>
          </div>

          <div>
            <label className="block mb-2 text-sm text-slate-400">Full name</label>
            <input
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm text-slate-400">Email</label>
            <input
              readOnly
              className="w-full p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-500"
              value={form.email}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm text-slate-400">Skill level</label>
            <select
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {SKILL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-2 text-sm text-slate-400">DUPR ID</label>
            <input
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.dupr}
              onChange={(e) => setForm({ ...form, dupr: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="bg-cyan-500 text-black px-5 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </AppShell>
  );
}
