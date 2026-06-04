const MEDAL_STYLES = {
  gold: {
    emoji: "🏆",
    label: "Champion",
    sublabel: "Gold · 1st place",
    border: "border-amber-400/70",
    bg: "bg-gradient-to-b from-amber-500/25 via-yellow-500/15 to-amber-600/10",
    title: "text-amber-300",
    name: "text-amber-50",
    ring: "ring-amber-400/40",
    order: "order-2 sm:order-2",
    scale: "sm:scale-105 sm:-mt-2",
  },
  silver: {
    emoji: "🥈",
    label: "Silver",
    sublabel: "2nd place",
    border: "border-slate-300/50",
    bg: "bg-gradient-to-b from-slate-400/20 via-slate-300/10 to-slate-500/10",
    title: "text-slate-300",
    name: "text-slate-100",
    ring: "ring-slate-300/30",
    order: "order-1 sm:order-1",
    scale: "",
  },
  bronze: {
    emoji: "🥉",
    label: "Bronze",
    sublabel: "3rd place",
    border: "border-orange-500/50",
    bg: "bg-gradient-to-b from-orange-500/20 via-amber-700/10 to-orange-800/10",
    title: "text-orange-300",
    name: "text-orange-50",
    ring: "ring-orange-500/30",
    order: "order-3 sm:order-3",
    scale: "",
  },
};

function MedalCard({ medal, name }) {
  const s = MEDAL_STYLES[medal];
  return (
    <div
      className={`rounded-xl border px-4 py-5 text-center shadow-lg ring-1 ${s.border} ${s.bg} ${s.ring} ${s.order} ${s.scale}`}
    >
      <p className={`text-xs uppercase tracking-[0.15em] ${s.title}`}>
        {s.emoji} {s.label}
      </p>
      <p className={`text-xl sm:text-2xl font-bold mt-2 ${s.name}`}>{name}</p>
      <p className={`text-[11px] mt-1 ${s.title} opacity-80`}>{s.sublabel}</p>
    </div>
  );
}

export default function MedalPodium({
  goldName,
  silverName,
  bronzeName,
  subtitle,
  compact = false,
}) {
  const cards = [
    silverName ? { medal: "silver", name: silverName } : null,
    goldName ? { medal: "gold", name: goldName } : null,
    bronzeName ? { medal: "bronze", name: bronzeName } : null,
  ].filter(Boolean);

  if (cards.length === 0) return null;

  if (compact && goldName && !silverName && !bronzeName) {
    const s = MEDAL_STYLES.gold;
    return (
      <section
        className={`rounded-xl border px-6 py-8 text-center ${s.border} ${s.bg}`}
      >
        <p className={`text-sm uppercase tracking-[0.2em] ${s.title}`}>
          {s.emoji} {s.label}
        </p>
        <p className={`text-3xl sm:text-4xl font-bold mt-3 ${s.name}`}>
          {goldName}
        </p>
        {subtitle && (
          <p className="text-slate-400 text-sm mt-2">{subtitle}</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        {cards.map(({ medal, name }) => (
          <MedalCard key={medal} medal={medal} name={name} />
        ))}
      </div>
      {subtitle && (
        <p className="text-center text-slate-400 text-sm">{subtitle}</p>
      )}
    </section>
  );
}

export function medalEmoji(medal) {
  return MEDAL_STYLES[medal]?.emoji ?? "";
}

export function medalRowClass(medal) {
  switch (medal) {
    case "gold":
      return "text-amber-200 font-bold";
    case "silver":
      return "text-slate-200 font-semibold";
    case "bronze":
      return "text-orange-200 font-semibold";
    default:
      return "";
  }
}
