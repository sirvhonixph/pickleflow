export default function TrophyBadge({ rank, size = "md" }) {
  if (!rank || rank > 3) return null;

  const config = {
    1: {
      label: "Open play champion",
      emoji: "🏆",
      ring: "from-amber-300 via-yellow-400 to-amber-500",
      glow: "shadow-amber-400/50",
    },
    2: {
      label: "2nd place",
      emoji: "🥈",
      ring: "from-slate-300 via-slate-200 to-slate-400",
      glow: "shadow-slate-300/40",
    },
    3: {
      label: "3rd place",
      emoji: "🥉",
      ring: "from-orange-400 via-amber-600 to-orange-700",
      glow: "shadow-orange-500/40",
    },
  };

  const c = config[rank];
  const sizeClass =
    size === "lg"
      ? "w-20 h-20 text-3xl"
      : size === "sm"
        ? "w-10 h-10 text-lg"
        : "w-14 h-14 text-2xl";

  return (
    <div
      className="inline-flex flex-col items-center gap-1"
      title={c.label}
    >
      <div
        className={`relative rounded-full bg-gradient-to-br ${c.ring} ${sizeClass} flex items-center justify-center shadow-lg ${c.glow} animate-pulse`}
        aria-hidden
      >
        <span className="drop-shadow-md">{c.emoji}</span>
        <span className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-30" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
        Top {rank}
      </span>
    </div>
  );
}
