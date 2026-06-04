"use client";

import { useEffect, useState } from "react";
import CategoryBadge from "@/components/CategoryBadge";
import {
  getCourtLayout,
  getPlayerBySlot,
  isEvenScore,
  scorePositionHint,
} from "@/lib/court-positions";

function PlayerSlot({ player, isBase, host, onSetBase, roleLabel }) {
  if (!player) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-3 min-h-[3.5rem] flex items-center justify-center text-xs text-slate-600">
        —
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-2 min-h-[3.5rem] flex flex-col justify-center ${
        isBase
          ? "bg-amber-500/15 border-amber-500/50"
          : "bg-slate-800/90 border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-sm truncate">{player.name}</span>
        {isBase && (
          <span className="text-[10px] font-bold text-amber-400 uppercase shrink-0">
            Base
          </span>
        )}
      </div>
      <CategoryBadge category={player.category} />
      <span className="text-[10px] text-slate-500 mt-0.5">{roleLabel}</span>
      {host && onSetBase && (
        <button
          type="button"
          onClick={() => onSetBase(player.playerId)}
          className="mt-1 text-[10px] text-left text-cyan-400 hover:underline"
        >
          {isBase ? "Base ✓" : "Set as base"}
        </button>
      )}
    </div>
  );
}

function TeamSideScore({
  teamLabel,
  score,
  accent,
  borderAccent,
  host,
  onMinus,
  onPlus,
  onSetScore,
}) {
  const [draft, setDraft] = useState(String(score ?? 0));

  useEffect(() => {
    setDraft(String(score ?? 0));
  }, [score]);

  const commitDraft = () => {
    const n = Math.max(0, Math.floor(Number(draft)) || 0);
    setDraft(String(n));
    if (n !== (score ?? 0)) {
      onSetScore?.(n);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg border ${borderAccent} bg-slate-950/50`}
    >
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {teamLabel} score
        </p>
        {host ? (
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={`mt-1 w-24 text-3xl md:text-4xl font-bold tabular-nums leading-none rounded-lg bg-slate-800 border border-slate-600 px-2 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${accent} focus:outline-none focus:ring-2 focus:ring-cyan-500/50`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
                e.currentTarget.blur();
              }
            }}
            aria-label={`${teamLabel} score`}
          />
        ) : (
          <p
            className={`text-4xl md:text-5xl font-bold tabular-nums leading-none mt-1 ${accent}`}
          >
            {score ?? 0}
          </p>
        )}
      </div>
      {host ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onMinus}
            className="w-11 h-11 rounded-lg bg-slate-700 hover:bg-slate-600 text-xl font-bold"
            aria-label={`Decrease ${teamLabel} score`}
          >
            −
          </button>
          <button
            type="button"
            onClick={onPlus}
            className="w-11 h-11 rounded-lg bg-slate-700 hover:bg-slate-600 text-xl font-bold"
            aria-label={`Increase ${teamLabel} score`}
          >
            +
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-slate-600 max-w-[4rem] text-right">
          Score for this side only
        </p>
      )}
    </div>
  );
}

function TeamRow({
  team,
  basePlayerId,
  teamScore,
  teamLabel,
  teamId,
  accent,
  borderAccent,
  host,
  onSetBase,
  onBumpScore,
  onSetScore,
  sideLabel,
  half,
  facingLabel,
}) {
  const screenLeft = getPlayerBySlot(team, "left");
  const screenRight = getPlayerBySlot(team, "right");
  const isTop = half === "top";
  const even = isEvenScore(teamScore);

  const leftHeader = isTop
    ? `Screen left · their ${even ? "RIGHT" : "LEFT"}`
    : `Screen left · their ${even ? "LEFT" : "RIGHT"}`;
  const rightHeader = isTop
    ? `Screen right · their ${even ? "LEFT" : "RIGHT"}`
    : `Screen right · their ${even ? "RIGHT" : "LEFT"}`;
  const leftRole = screenLeft?.playerId === basePlayerId ? "Base" : "Partner";
  const rightRole =
    screenRight?.playerId === basePlayerId ? "Base" : "Partner";

  return (
    <div className="px-3 py-3">
      <TeamSideScore
        teamLabel={teamLabel}
        score={teamScore}
        accent={accent}
        borderAccent={borderAccent}
        host={host}
        onMinus={() => onBumpScore?.(teamId, -1)}
        onPlus={() => onBumpScore?.(teamId, 1)}
        onSetScore={(value) => onSetScore?.(teamId, value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {sideLabel}
        </p>
        <span className="text-[10px] text-cyan-500/80">{facingLabel}</span>
      </div>
      {host && (
        <p className="text-[10px] text-amber-400/90 mb-2">
          {scorePositionHint(teamScore)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div
          className={`text-[10px] text-center leading-tight ${
            (isTop && even) || (!isTop && !even)
              ? "text-amber-500/90"
              : "text-slate-600"
          }`}
        >
          {leftHeader}
        </div>
        <div
          className={`text-[10px] text-center leading-tight ${
            (isTop && !even) || (!isTop && even)
              ? "text-amber-500/90"
              : "text-slate-600"
          }`}
        >
          {rightHeader}
        </div>
        <PlayerSlot
          player={screenLeft}
          isBase={screenLeft?.playerId === basePlayerId}
          host={host}
          onSetBase={onSetBase}
          roleLabel={leftRole}
        />
        <PlayerSlot
          player={screenRight}
          isBase={screenRight?.playerId === basePlayerId}
          host={host}
          onSetBase={onSetBase}
          roleLabel={rightRole}
        />
      </div>
    </div>
  );
}

function ScoringHelpBar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-800">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Scoring and base position help"
          title="How scoring works"
          className={`w-6 h-6 rounded-full border text-xs font-bold transition ${
            open
              ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
              : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200"
          }`}
        >
          i
        </button>
      </div>
      {open && (
        <p className="text-[11px] text-slate-400 leading-relaxed text-center mt-2">
          Each team&apos;s score is on <strong className="text-slate-300">their side</strong> of
          the court. Host can type a score or use +/−. Even (0,2,4…) = base right · Odd (1,3,5…) =
          base left.
        </p>
      )}
    </div>
  );
}

export default function CourtDiagram({
  match,
  scoreA,
  scoreB,
  host,
  onSetBase,
  onBumpScore,
  onSetScore,
}) {
  const layout = getCourtLayout({
    ...match,
    scoreA: scoreA ?? match.scoreA,
    scoreB: scoreB ?? match.scoreB,
  });

  const topIsA = layout.topTeamId === "A";
  const topLabel = topIsA ? "Team A" : "Team B";
  const bottomLabel = topIsA ? "Team B" : "Team A";
  const topAccent = topIsA ? "text-cyan-400" : "text-purple-400";
  const bottomAccent = topIsA ? "text-purple-400" : "text-cyan-400";
  const topBorder = topIsA ? "border-cyan-500/40" : "border-purple-500/40";
  const bottomBorder = topIsA ? "border-purple-500/40" : "border-cyan-500/40";

  return (
    <div className="rounded-xl border-2 border-slate-700 bg-slate-900/80 overflow-hidden">
      {host && (
        <ScoringHelpBar />
      )}

      <TeamRow
        team={layout.topTeam}
        basePlayerId={layout.topBase}
        teamScore={layout.topScore}
        teamLabel={topLabel}
        teamId={layout.topTeamId}
        accent={topAccent}
        borderAccent={topBorder}
        host={host}
        onBumpScore={onBumpScore}
        onSetScore={onSetScore}
        onSetBase={(id) => onSetBase(layout.topTeamId, id, "top")}
        sideLabel={`${topLabel} · far side`}
        half="top"
        facingLabel="Facing ↓"
      />

      <div className="py-2 px-4 bg-slate-800 border-y border-slate-600 text-center">
        <span className="text-xs font-bold text-slate-400 tracking-widest">
          NET
        </span>
      </div>

      <TeamRow
        team={layout.bottomTeam}
        basePlayerId={layout.bottomBase}
        teamScore={layout.bottomScore}
        teamLabel={bottomLabel}
        teamId={layout.bottomTeamId}
        accent={bottomAccent}
        borderAccent={bottomBorder}
        host={host}
        onBumpScore={onBumpScore}
        onSetScore={onSetScore}
        onSetBase={(id) => onSetBase(layout.bottomTeamId, id, "bottom")}
        sideLabel={`${bottomLabel} · near side`}
        half="bottom"
        facingLabel="Facing ↑"
      />
    </div>
  );
}
