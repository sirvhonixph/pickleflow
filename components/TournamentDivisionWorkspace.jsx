"use client";

import { useMemo } from "react";
import {
  divisionLabel,
  pairsInDivision,
  pairDisplayName,
  getEventDivisions,
} from "@/lib/tournament-divisions";
import { getDivisionSlotStatus } from "@/lib/tournament-registration";
import {
  getActiveDivisionForDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
  getDivisionChampionPairId,
} from "@/lib/tournament-division-schedule";
import { describeCourtPools, courtsForDivision } from "@/lib/tournament-court-pools";
import { planBracketDistribution } from "@/lib/tournament-brackets";
import { enrichPair } from "@/lib/tournament-pairs";
import TournamentCourtsManager from "@/components/TournamentCourtsManager";
import TournamentPairList from "@/components/TournamentPairList";
import TierDivisionOrderEditor from "@/components/TierDivisionOrderEditor";
import TournamentLiveStreamSettings from "@/components/TournamentLiveStreamSettings";

function divisionPlan(event, divisionId) {
  const count = pairsInDivision(event, divisionId).length;
  const divisionCourts = courtsForDivision(event, divisionId);
  if (count < 2 || divisionCourts.length < 1) return null;
  try {
    return {
      ...planBracketDistribution(count, divisionCourts.length),
      divisionCourtCount: divisionCourts.length,
      divisionCourtNames: divisionCourts.map((c) => c.name).join(", "),
    };
  } catch {
    return null;
  }
}

export default function TournamentDivisionWorkspace({
  event,
  eventId,
  host,
  isEnded,
  activeDivisionId,
  onSelectDivision,
  canRegister,
  pairForm,
  setPairForm,
  onRegisterPair,
  registering,
  pairRegisterError,
  onAddCourt,
  onRemoveCourt,
  courtBusy,
  streamUrl,
  onStreamUrlChange,
  streamBusy,
  onSaveLiveStream,
  setupBusy,
  onApplyDivision,
  onApplyAll,
  onRegenerateDivision,
  onRegenerateAll,
  onEventUpdate,
  schedulePanel = null,
  liveCourtsPanel = null,
  liveEmbedPanel = null,
}) {
  const divisions = useMemo(() => getEventDivisions(event), [event]);
  const courtPools = useMemo(() => describeCourtPools(event), [event]);
  const courtCount = event.courts?.length ?? 0;

  const openDivisions = useMemo(
    () => divisions.filter((d) => !isDivisionComplete(event.tournamentDivisions?.[d.id])),
    [divisions, event]
  );

  const eligibleForAll = useMemo(
    () =>
      openDivisions.filter((d) => {
        const count = pairsInDivision(event, d.id).length;
        const setup = event.tournamentDivisions?.[d.id];
        if (count < 2 || courtsForDivision(event, d.id).length < 1) return false;
        if (divisionHasMatchProgress(setup)) return false;
        if (setup?.brackets?.length) return false;
        return true;
      }),
    [openDivisions, event]
  );

  const divisionId =
    activeDivisionId && divisions.some((d) => d.id === activeDivisionId)
      ? activeDivisionId
      : divisions[0]?.id;

  const pairs = divisionId ? pairsInDivision(event, divisionId) : [];
  const slot = divisionId ? getDivisionSlotStatus(event, divisionId) : null;
  const setup = divisionId ? event.tournamentDivisions?.[divisionId] : null;
  const plan = divisionId ? divisionPlan(event, divisionId) : null;
  const divisionCourts = divisionId ? courtsForDivision(event, divisionId) : [];
  const hasBrackets = !!setup?.brackets?.length;
  const finished = isDivisionComplete(setup);
  const activeInPool = divisionId
    ? getActiveDivisionForDivision(event, divisionId)
    : null;
  const championId = getDivisionChampionPairId(setup);
  const championLabel = championId
    ? pairDisplayName(
        enrichPair(pairs.find((p) => p.id === championId) ?? {})
      )
    : null;

  const canApply =
    !!divisionId &&
    !finished &&
    pairs.length >= 2 &&
    divisionCourts.length >= 1 &&
    !divisionHasMatchProgress(setup) &&
    !hasBrackets;

  const canRegenerate =
    !!divisionId && !finished && hasBrackets && !divisionHasMatchProgress(setup);

  const tierLabel =
    courtPools.find((p) =>
      divisionCourts.some((c) => p.courts.some((pc) => pc.id === c.id))
    )?.label ?? null;

  if (!host || !divisions.length) return null;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Divisions</h2>
          <p className="text-slate-500 text-sm mt-1">
            Switch tabs to manage pairs, courts, live stream, and brackets for
            each category.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {eligibleForAll.length > 1 && onApplyAll && !isEnded && (
            <button
              type="button"
              disabled={setupBusy}
              onClick={onApplyAll}
              className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {setupBusy ? "Applying…" : `Generate all (${eligibleForAll.length})`}
            </button>
          )}
          {onRegenerateAll && !isEnded && (
            <button
              type="button"
              disabled={setupBusy}
              onClick={onRegenerateAll}
              className="px-4 py-2 border border-amber-500/50 text-amber-200 font-semibold rounded-lg text-sm disabled:opacity-50 hover:bg-amber-500/10"
            >
              {setupBusy ? "Working…" : "Regenerate all"}
            </button>
          )}
        </div>
      </div>

      {courtPools.length > 1 && (
        <ul className="text-sm space-y-1">
          {courtPools.map((pool) => (
            <li key={pool.skill} className="text-cyan-300/90">
              <span className="font-medium">{pool.label} tier:</span>{" "}
              {pool.courtNames || "No courts yet"}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {divisions.map((d) => {
          const count = pairsInDivision(event, d.id).length;
          const divSetup = event.tournamentDivisions?.[d.id];
          const isActive = divisionId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelectDivision(d.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                isActive
                  ? "bg-purple-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {divisionLabel(d.id, event)}
              <span className="ml-1.5 opacity-75">({count})</span>
              {!!divSetup?.brackets?.length && (
                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-80">
                  · bracketed
                </span>
              )}
            </button>
          );
        })}
      </div>

      {divisionId && (
        <div className="space-y-6 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-slate-500">Pairs</span>{" "}
              <span className="font-bold text-lg">{pairs.length}</span>
              {slot && canRegister && !finished && (
                <span className="text-xs text-slate-500 ml-2">
                  {slot.isFull
                    ? "Division full"
                    : `${slot.remaining} slot${slot.remaining === 1 ? "" : "s"} left`}
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Tier courts</span>{" "}
              <span className="font-bold text-lg">{divisionCourts.length}</span>
              {tierLabel && (
                <span className="text-xs text-slate-500 ml-1">({tierLabel})</span>
              )}
            </div>
            {championLabel && (
              <div className="text-amber-300">Champion: {championLabel}</div>
            )}
            {!finished && hasBrackets && activeInPool === divisionId && (
              <span className="text-cyan-400">Using courts now</span>
            )}
            {!finished && hasBrackets && activeInPool && activeInPool !== divisionId && (
              <span className="text-slate-400">Waiting for tier courts</span>
            )}
          </div>

          {canRegister && !isEnded && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-300">
                  Register a pair
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Walk-in pairs for {divisionLabel(divisionId, event)}. Online
                  registrations are added automatically.
                </p>
              </div>
              {pairRegisterError && (
                <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
                  {pairRegisterError}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  if (pairForm.divisionId !== divisionId) {
                    setPairForm((f) => ({ ...f, divisionId }));
                  }
                  onRegisterPair(e);
                }}
                className="grid sm:grid-cols-2 gap-3"
              >
                <input
                  required
                  placeholder="Player 1 name"
                  className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  value={pairForm.player1Name}
                  onChange={(e) =>
                    setPairForm({ ...pairForm, player1Name: e.target.value })
                  }
                />
                <input
                  required
                  placeholder="Player 2 name"
                  className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  value={pairForm.player2Name}
                  onChange={(e) =>
                    setPairForm({ ...pairForm, player2Name: e.target.value })
                  }
                />
                <input
                  placeholder="Player 1 email (optional)"
                  className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  value={pairForm.player1Email}
                  onChange={(e) =>
                    setPairForm({ ...pairForm, player1Email: e.target.value })
                  }
                />
                <input
                  placeholder="Player 2 email (optional)"
                  className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  value={pairForm.player2Email}
                  onChange={(e) =>
                    setPairForm({ ...pairForm, player2Email: e.target.value })
                  }
                />
                <input
                  placeholder="Team name (optional)"
                  className="sm:col-span-2 p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  value={pairForm.teamName}
                  onChange={(e) =>
                    setPairForm({ ...pairForm, teamName: e.target.value })
                  }
                />
                <button
                  type="submit"
                  disabled={registering}
                  className="sm:col-span-2 py-2.5 bg-purple-500 font-semibold rounded-lg text-sm disabled:opacity-50"
                >
                  {registering ? "Registering…" : "Register pair"}
                </button>
              </form>
            </div>
          )}

          <TournamentPairList
            event={event}
            eventId={eventId}
            host={host}
            isEnded={isEnded}
            onEventUpdate={onEventUpdate}
            divisionId={divisionId}
          />

          {!isEnded && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Courts are shared across divisions in the same skill tier
                {tierLabel ? ` (${tierLabel})` : ""}. Brackets map A → Court 1,
                B → Court 2, etc.
              </p>
              <TournamentCourtsManager
                courts={event.courts ?? []}
                onAdd={onAddCourt}
                onRemove={onRemoveCourt}
                adding={courtBusy?.adding}
                removingId={courtBusy?.removingId}
                disabled={setupBusy}
              />
              {divisionCourts.length > 0 && (
                <p className="text-xs text-cyan-300/90">
                  This division uses:{" "}
                  {divisionCourts.map((c) => c.name).join(", ")}
                </p>
              )}
            </div>
          )}

          {!isEnded && (
            <TournamentLiveStreamSettings
              compact
              streamUrl={streamUrl}
              onStreamUrlChange={onStreamUrlChange}
              liveStreamEnabled={event.liveStreamEnabled}
              streamBusy={streamBusy}
              onSave={onSaveLiveStream}
              onToggleEnabled={(enabled) =>
                onSaveLiveStream({
                  liveStreamUrl: streamUrl,
                  liveStreamEnabled: enabled,
                })
              }
            />
          )}

          {onEventUpdate && eventId && !isEnded && (
            <TierDivisionOrderEditor
              event={event}
              eventId={eventId}
              disabled={setupBusy}
              onEventUpdate={onEventUpdate}
            />
          )}

          {!isEnded && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
              <h3 className="font-semibold text-purple-200 text-sm">
                Brackets & matches
              </h3>
              {courtCount < 1 ? (
                <p className="text-sm text-amber-400">
                  Add at least one court above, then generate brackets.
                </p>
              ) : pairs.length < 2 ? (
                <p className="text-sm text-slate-400">
                  Need at least 2 pairs in this division.
                </p>
              ) : plan && !hasBrackets ? (
                <>
                  <div className="grid sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Pairs</p>
                      <p className="text-xl font-bold">{pairs.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Courts</p>
                      <p className="text-xl font-bold">{plan.divisionCourtCount}</p>
                      {plan.divisionCourtNames && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {plan.divisionCourtNames}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-500">Per bracket</p>
                      <p className="text-xl font-bold text-cyan-400">
                        {plan.pairsPerBracket}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">{plan.formulaText}</p>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {plan.distribution.map((size, i) => (
                      <li key={i}>
                        {String.fromCharCode(65 + i)} → Court {i + 1}: {size}{" "}
                        pairs, round robin
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={setupBusy || !canApply}
                    onClick={() => onApplyDivision(divisionId)}
                    className="px-4 py-2 bg-purple-500 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
                  >
                    {setupBusy ? "Applying…" : "Generate brackets for this division"}
                  </button>
                </>
              ) : hasBrackets ? (
                <div className="space-y-2">
                  {setup?.plan && !finished && (
                    <p className="text-sm text-slate-400">{setup.plan.formulaText}</p>
                  )}
                  {canRegenerate && onRegenerateDivision && (
                    <button
                      type="button"
                      disabled={setupBusy}
                      onClick={() => onRegenerateDivision(divisionId)}
                      className="px-4 py-2 border border-amber-500/50 text-amber-200 font-semibold rounded-lg text-sm disabled:opacity-50 hover:bg-amber-500/10"
                    >
                      {setupBusy ? "Working…" : "Regenerate division"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Not enough courts assigned to this tier yet.
                </p>
              )}
            </div>
          )}

          {liveEmbedPanel}
          {liveCourtsPanel}
          {schedulePanel}
        </div>
      )}
    </section>
  );
}
