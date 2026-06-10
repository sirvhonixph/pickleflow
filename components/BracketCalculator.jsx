"use client";



import { useMemo } from "react";

import {

  getEventDivisions,

  divisionLabel,

  pairsInDivision,

  pairDisplayName,

} from "@/lib/tournament-divisions";

import { describeCourtPools, courtsForDivision } from "@/lib/tournament-court-pools";
import { planBracketDistribution } from "@/lib/tournament-brackets";

import {
  getCourtOccupyingDivisionId,
  getActiveDivisionForDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
  getDivisionChampionPairId,
} from "@/lib/tournament-division-schedule";

import { enrichPair } from "@/lib/tournament-pairs";
import TournamentCourtsManager from "@/components/TournamentCourtsManager";
import TierDivisionOrderEditor from "@/components/TierDivisionOrderEditor";



function divisionIsFinished(event, divisionId) {

  const setup = event.tournamentDivisions?.[divisionId];

  return isDivisionComplete(setup);

}



export default function BracketCalculator({

  event,

  selectedDivisionId,

  onSelectDivision,

  onApplyDivision,

  onApplyAll,

  onRegenerateDivision,

  onRegenerateAll,

  busy,

  onAddCourt,

  onRemoveCourt,

  courtBusy,

  canManageCourts = false,

  onEventUpdate,

  eventId,

}) {

  const courtCount = event.courts?.length ?? 0;
  const courtPools = useMemo(() => describeCourtPools(event), [event]);

  const divisions = getEventDivisions(event);



  const openDivisions = useMemo(

    () => divisions.filter((d) => !divisionIsFinished(event, d.id)),

    [divisions, event]

  );



  const finishedDivisions = useMemo(

    () => divisions.filter((d) => divisionIsFinished(event, d.id)),

    [divisions, event]

  );



  const plans = useMemo(() => {

    const out = {};

    for (const d of openDivisions) {
      const count = pairsInDivision(event, d.id).length;
      const divisionCourts = courtsForDivision(event, d.id);
      if (count >= 2 && divisionCourts.length >= 1) {
        try {
          out[d.id] = {
            ...planBracketDistribution(count, divisionCourts.length),
            divisionCourtCount: divisionCourts.length,
            divisionCourtNames: divisionCourts.map((c) => c.name).join(", "),
          };
        } catch {
          /* skip */
        }
      }
    }

    return out;

  }, [event, courtCount, openDivisions]);



  const selectedPlan =

    selectedDivisionId && !divisionIsFinished(event, selectedDivisionId)

      ? plans[selectedDivisionId]

      : null;

  const selectedPairs = selectedDivisionId

    ? pairsInDivision(event, selectedDivisionId).length

    : 0;



  const selectedCanApply = useMemo(() => {

    if (

      !selectedDivisionId ||
      divisionIsFinished(event, selectedDivisionId) ||
      selectedPairs < 2 ||
      (courtsForDivision(event, selectedDivisionId).length ?? 0) < 1
    ) {
      return false;
    }
    const setup = event.tournamentDivisions?.[selectedDivisionId];
    return (
      !divisionHasMatchProgress(setup) &&
      !setup?.brackets?.length
    );
  }, [
    selectedDivisionId,
    selectedPairs,
    event,
  ]);

  const selectedSetup = selectedDivisionId
    ? event.tournamentDivisions?.[selectedDivisionId]
    : null;
  const selectedHasBrackets = !!selectedSetup?.brackets?.length;
  const selectedCanRegenerate =
    !!selectedDivisionId &&
    !divisionIsFinished(event, selectedDivisionId) &&
    selectedHasBrackets;



  const eligibleForAll = useMemo(() => {

    return openDivisions.filter((d) => {

      const count = pairsInDivision(event, d.id).length;

      const setup = event.tournamentDivisions?.[d.id];

      if (count < 2 || courtsForDivision(event, d.id).length < 1) return false;

      if (divisionHasMatchProgress(setup)) return false;

      if (setup?.brackets?.length) return false;

      return true;

    });

  }, [openDivisions, event, courtCount]);

  const eligibleForRegenerateAll = useMemo(() => {
    return openDivisions.filter((d) => {
      const setup = event.tournamentDivisions?.[d.id];
      return !!setup?.brackets?.length && !divisionIsFinished(event, d.id);
    });
  }, [openDivisions, event]);



  if (openDivisions.length === 0) {

    return (

      <section className="bg-slate-900 border border-purple-500/30 rounded-xl p-6">

        <h2 className="text-xl font-bold text-purple-300">Bracket calculator</h2>

        <p className="text-slate-400 text-sm mt-2">

          All divisions with brackets are finished or in progress. View completed

          results in the division tabs below.

        </p>

      </section>

    );

  }



  return (

    <section className="bg-slate-900 border border-purple-500/30 rounded-xl p-6 space-y-5">

      <div>

        <h2 className="text-xl font-bold text-purple-300">Bracket calculator</h2>

        <p className="text-slate-500 text-sm mt-1">
          Divide registered pairs into brackets by skill-tier court pools. Example:
          20 pairs ÷ 4 courts = 5 pairs per bracket. Within each tier, divisions
          play in the order you set below. Novice and intermediate can run at the
          same time on separate courts.
        </p>
        {courtPools.length > 1 && (
          <ul className="text-sm mt-3 space-y-1">
            {courtPools.map((pool) => {
              const activeId = getCourtOccupyingDivisionId(
                event,
                pool.courts[0]?.id
              );
              return (
                <li key={pool.skill} className="text-cyan-300/90">
                  <span className="font-medium">{pool.label}:</span>{" "}
                  {pool.courtNames || "—"}
                  {activeId && (
                    <span className="text-amber-400/90">
                      {" "}
                      · now playing {divisionLabel(activeId, event)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {courtPools.length === 1 && courtPools[0]?.courtNames && (
          <p className="text-cyan-300/90 text-sm mt-2">
            Courts: {courtPools[0].courtNames}
          </p>
        )}

      </div>



      {canManageCourts && onAddCourt && onRemoveCourt && (

        <TournamentCourtsManager

          courts={event.courts ?? []}

          onAdd={onAddCourt}

          onRemove={onRemoveCourt}

          adding={courtBusy?.adding}

          removingId={courtBusy?.removingId}

          disabled={busy}

        />

      )}

      {onEventUpdate && eventId && (
        <TierDivisionOrderEditor
          event={event}
          eventId={eventId}
          disabled={busy}
          onEventUpdate={onEventUpdate}
        />
      )}

      {courtCount < 1 ? (

        !canManageCourts && (

          <p className="text-amber-400 text-sm">Add courts first, then run the calculator.</p>

        )

      ) : (

        <>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {openDivisions.map((d) => {

              const count = pairsInDivision(event, d.id).length;

              const plan = plans[d.id];

              const active = selectedDivisionId === d.id;

              const setup = event.tournamentDivisions?.[d.id];

              const hasBrackets = !!setup?.brackets?.length;

              const activeInPool = getActiveDivisionForDivision(event, d.id);

              const divisionCourts = courtsForDivision(event, d.id);

              return (

                <button

                  key={d.id}

                  type="button"

                  disabled={count < 2}

                  onClick={() => onSelectDivision(d.id)}

                  className={`text-left p-4 rounded-lg border transition ${

                    active

                      ? "border-purple-500 bg-purple-500/15"

                      : "border-slate-700 hover:border-slate-600 disabled:opacity-40"

                  }`}

                >

                  <p className="font-medium text-sm">{divisionLabel(d.id, event)}</p>

                  <p className="text-2xl font-bold mt-1">{count}</p>

                  <p className="text-xs text-slate-500">pairs registered</p>

                  {plan && !hasBrackets && (
                    <p className="text-xs text-cyan-400/90 mt-2">
                      {plan.bracketCount} brackets · {plan.pairsPerBracket}/bracket
                      {divisionCourts.length > 0 && (
                        <span className="block text-slate-500 mt-0.5">
                          {divisionCourts.map((c) => c.name).join(", ")}
                        </span>
                      )}
                    </p>
                  )}

                  {hasBrackets && activeInPool !== d.id && !isDivisionComplete(event.tournamentDivisions?.[activeInPool]) && (
                    <p className="text-xs text-green-400/90 mt-1">
                      Schedule ready — courts when earlier divisions finish
                    </p>
                  )}

                  {activeInPool === d.id && (
                    <p className="text-xs text-cyan-400/90 mt-1">
                      Using courts now
                    </p>
                  )}

                  {!hasBrackets &&
                    activeInPool &&
                    activeInPool !== d.id &&
                    !isDivisionComplete(event.tournamentDivisions?.[activeInPool]) && (
                    <p className="text-xs text-slate-500 mt-1">
                      Can generate schedule anytime
                    </p>
                  )}

                </button>

              );

            })}

          </div>



          {finishedDivisions.length > 0 && (

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">

              <p className="text-sm font-medium text-amber-200/90">

                Finished — not included in calculator

              </p>

              <ul className="text-xs text-slate-400 space-y-1">

                {finishedDivisions.map((d) => {

                  const setup = event.tournamentDivisions?.[d.id];

                  const championId = getDivisionChampionPairId(setup);

                  const championPair = (event.pairRegistrations ?? []).find(

                    (p) => p.id === championId

                  );

                  const championLabel = championPair

                    ? pairDisplayName(enrichPair(championPair))

                    : null;

                  return (

                    <li key={d.id}>

                      {divisionLabel(d.id, event)}

                      {championLabel ? ` — 🏆 ${championLabel}` : ""}

                    </li>

                  );

                })}

              </ul>

            </div>

          )}



          {eligibleForAll.length > 0 && onApplyAll && (

            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 flex flex-wrap items-center justify-between gap-3">

              <div>

                <p className="font-medium text-cyan-200 text-sm">

                  Generate all open divisions

                </p>

                <p className="text-xs text-slate-400 mt-1">
                  {eligibleForAll.length} division
                  {eligibleForAll.length === 1 ? "" : "s"} ready — each uses its
                  skill tier&apos;s court pool. Within a tier, men&apos;s plays
                  first, then women&apos;s, then mixed. Novice and intermediate
                  can run in parallel.
                </p>

              </div>

              <button

                type="button"

                disabled={busy}

                onClick={onApplyAll}

                className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50 shrink-0"

              >

                {busy ? "Applying…" : "Apply all open divisions"}

              </button>

            </div>

          )}



          {eligibleForRegenerateAll.length > 0 && onRegenerateAll && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-amber-200 text-sm">
                  Regenerate all bracketed divisions
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {eligibleForRegenerateAll.length} division
                  {eligibleForRegenerateAll.length === 1 ? "" : "s"} — rebuilds
                  every bracket from current pairs and courts and erases all
                  scores, live matches, and knockout results in those divisions.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={onRegenerateAll}
                className="px-4 py-2 border border-amber-500/50 text-amber-200 font-semibold rounded-lg text-sm disabled:opacity-50 shrink-0 hover:bg-amber-500/10"
              >
                {busy ? "Working…" : "Regenerate all & erase"}
              </button>
            </div>
          )}



          {selectedPlan && (

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">

              <h3 className="font-semibold">

                {divisionLabel(selectedDivisionId, event)}

              </h3>

              <div className="grid sm:grid-cols-3 gap-4 text-sm">

                <div>

                  <p className="text-slate-500">Pairs</p>

                  <p className="text-xl font-bold">{selectedPairs}</p>

                </div>

                <div>

                  <p className="text-slate-500">Courts</p>

                  <p className="text-xl font-bold">
                    {selectedPlan.divisionCourtCount ?? courtCount}
                  </p>
                  {selectedPlan.divisionCourtNames && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {selectedPlan.divisionCourtNames}
                    </p>
                  )}

                </div>

                <div>

                  <p className="text-slate-500">Per bracket</p>

                  <p className="text-xl font-bold text-cyan-400">

                    {selectedPlan.pairsPerBracket}

                  </p>

                </div>

              </div>

              <p className="text-sm text-slate-400">{selectedPlan.formulaText}</p>

              <ul className="text-sm text-slate-300 space-y-1">

                {selectedPlan.distribution.map((size, i) => (

                  <li key={i}>

                    {String.fromCharCode(65 + i)} → Court {i + 1}: {size} pairs,

                    round robin

                  </li>

                ))}

              </ul>

              <button

                type="button"

                disabled={busy || !selectedCanApply}

                onClick={() => onApplyDivision(selectedDivisionId)}

                className="px-4 py-2 bg-purple-500 text-white font-semibold rounded-lg text-sm disabled:opacity-50"

              >

                {busy ? "Applying…" : "Apply brackets for this division"}

              </button>

              {selectedCanRegenerate && onRegenerateDivision && (
                <div className="pt-2 border-t border-slate-700 space-y-2">
                  <p className="text-xs text-slate-500">
                    Rebuilds brackets from current pairs and courts.
                    {divisionHasMatchProgress(selectedSetup) ||
                    divisionIsFinished(event, selectedDivisionId)
                      ? " Erases all match scores, live courts, standings, and knockout results for this division."
                      : " Clears the current schedule so you can run the bracket again."}
                    {" "}Other divisions are unchanged.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRegenerateDivision(selectedDivisionId)}
                    className="px-4 py-2 border border-amber-500/50 text-amber-200 font-semibold rounded-lg text-sm disabled:opacity-50 hover:bg-amber-500/10"
                  >
                    {busy
                      ? "Regenerating…"
                      : divisionHasMatchProgress(selectedSetup) ||
                          divisionIsFinished(event, selectedDivisionId)
                        ? "Regenerate & erase all scores"
                        : "Regenerate division"}
                  </button>
                </div>
              )}

            </div>

          )}

        </>

      )}

    </section>

  );

}

