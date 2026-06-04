"use client";

import { getDisplayName } from "@/lib/session";
import { resolvePlayerDisplayName } from "@/lib/display-name";

export default function PlayerAvatar({
  user,
  player,
  size = "md",
  className = "",
}) {
  const email = user?.email ?? player?.email ?? "";
  const name =
    resolvePlayerDisplayName({
      playerId: email,
      userName: user?.name,
      storeName: player?.name,
      historyEntries: [],
    }) ||
    getDisplayName(user) ||
    player?.name ||
    email ||
    "?";
  const avatar =
    player?.avatarDataUrl ?? user?.avatarDataUrl ?? "";

  const sizes = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-24 h-24 text-3xl",
  };

  const sizeClass = sizes[size] ?? sizes.md;

  if (avatar) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={avatar}
        alt={name}
        className={`${sizeClass} rounded-full object-cover border border-slate-700 shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-cyan-500/30 border border-cyan-500/50 flex items-center justify-center font-bold text-cyan-400 shrink-0 ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
