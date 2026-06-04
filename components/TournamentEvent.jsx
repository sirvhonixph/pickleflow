"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TournamentPairList from "@/components/TournamentPairList";
import BracketCalculator from "@/components/BracketCalculator";
import DivisionAdvancementPanel from "@/components/DivisionAdvancementPanel";
import EliminationResultsPanel from "@/components/EliminationResultsPanel";
import TournamentLiveCourtCard from "@/components/TournamentLiveCourtCard";
import TournamentRoundRobin from "@/components/TournamentRoundRobin";
import {
  getEventDivisions,
  divisionLabel,
  pairsInDivision,
  pairDisplayName,
} from "@/lib/tournament-divisions";
import {
  fetchEventById,
  addCourt,
  removeCourt,
  endEvent,
  registerPair,
  runBracketSetup,
  patchTournamentMatch,
  startQuarterfinals,
  addTournamentDivision,
  updateEventStream,
  updateEventPaymentConfig,
  updateEventOfferedDivisions,
  registerForEvent,
  hostRemoveRegistration,
} from "@/lib/events";
import { getCurrentUser, isEventHost, getPlayerId } from "@/lib/session";
import { enrichPair } from "@/lib/tournament-pairs";
import {
  isPlayerRegistered,
  canPlayerRegisterForTournament,
  getTournamentRegistrationCount,
  tournamentRegistrationLimitLabel,
} from "@/lib/registration-status";
import { getKnockoutChampionPairId, getDivisionChampionPairId, getKnockoutMedalists } from "@/lib/tournament-knockout-ui";
import MedalPodium from "@/components/MedalPodium";
import RegistrationCountdown from "@/components/RegistrationCountdown";
import TournamentDivisionSlots from "@/components/TournamentDivisionSlots";
import TournamentPaymentSettings from "@/components/TournamentPaymentSettings";
import OfferedDivisionsPicker from "@/components/OfferedDivisionsPicker";
import TournamentRegisterForm from "@/components/TournamentRegisterForm";
import HostRegistrationRemoveButton from "@/components/HostRegistrationRemoveButton";
import { paymentMethodLabel } from "@/lib/tournament-payment";
import {
  getDivisionSlotStatus,
  isRegistrationClosed,
} from "@/lib/tournament-registration";
import {
  getCourtOccupyingDivisionId,
  getActiveDivisionForDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
} from "@/lib/tournament-division-schedule";
import { describeCourtPools } from "@/lib/tournament-court-pools";

function embedVideoUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      let id = u.searchParams.get("v");
      if (!id && u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return url;
  }
  return url;
}

export default function TournamentEvent({ eventId, initialEvent = null }) {
  const [event, setEvent] = useState(initialEvent);
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [courtLabel, setCourtLabel] = useState("");
  const [courtBusy, setCourtBusy] = useState({ adding: false, removingId: null });
  const [calcDivision, setCalcDivision] = useState("");
  const [viewDivision, setViewDivision] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [divisionBusy, setDivisionBusy] = useState(false);
  const [startingMatchId, setStartingMatchId] = useState(null);
  const [forfeitBusyId, setForfeitBusyId] = useState(null);
  const [startingQuarterfinals, setStartingQuarterfinals] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [pairForm, setPairForm] = useState({
    divisionId: "",
    player1Name: "",
    player2Name: "",
    player1Email: "",
    player2Email: "",
    teamName: "",
  });
  const [registering, setRegistering] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [offeredBusy, setOfferedBusy] = useState(false);
  const [offeredIds, setOfferedIds] = useState([]);
  const [playerRegisterBusy, setPlayerRegisterBusy] = useState(false);
  const bracketCalcRef = useRef(null);
  const playViewRef = useRef(null);
  const refreshPausedUntilRef = useRef(0);

  const pauseAutoRefresh = useCallback((ms = 15000) => {
    refreshPausedUntilRef.current = Date.now() + ms;
  }, []);

  const reload = useCallback(async () => {
    if (Date.now() < refreshPausedUntilRef.current) return;
    try {
      const ev = await fetchEventById(eventId);
      setEvent(ev);
      setUser(getCurrentUser());
      setLoadError(ev ? null : "Event not found");
    } catch (err) {
      console.error("Failed to load event:", err);
      setLoadError(err.message ?? "Failed to load event");
    }
  }, [eventId]);

  const poolPlay = event?.tournamentPhase === "pool_play";
  const knockoutPhase = event?.tournamentPhase === "knockout";

  useEffect(() => {
    if (event?.liveStreamUrl) setStreamUrl(event.liveStreamUrl);
  }, [event?.liveStreamUrl]);

  useEffect(() => {
    if (event) {
      setOfferedIds(event.offeredDivisionIds ?? []);
    }
  }, [event?.id, event?.offeredDivisionIds]);

  const pairById = useMemo(() => {
    const map = new Map();
    for (const p of event?.pairRegistrations ?? []) {
      map.set(p.id, enrichPair(p));
    }
    return map;
  }, [event?.pairRegistrations]);

  const divisions = useMemo(
    () => (event ? getEventDivisions(event) : []),
    [event]
  );

  const activeCourtDivisionId = useMemo(
    () => (event && viewDivision ? getActiveDivisionForDivision(event, viewDivision) : null),
    [event, viewDivision]
  );
  const courtPools = useMemo(
    () => (event ? describeCourtPools(event) : []),
    [event]
  );

  const bracketedDivisions = useMemo(
    () =>
      divisions.filter(
        (d) => (event?.tournamentDivisions?.[d.id]?.brackets?.length ?? 0) > 0
      ),
    [divisions, event?.tournamentDivisions]
  );

  const bracketedIdsKey = useMemo(
    () => bracketedDivisions.map((d) => d.id).join(","),
    [bracketedDivisions]
  );

  useEffect(() => {
    if (!divisions.length || !event?.id) return;
    const first = divisions[0].id;
    setCalcDivision((id) => (id && divisions.some((d) => d.id === id) ? id : first));
    setPairForm((f) =>
      divisions.some((d) => d.id === f.divisionId)
        ? f
        : { ...f, divisionId: first }
    );
  }, [event?.id, divisions]);

  useEffect(() => {
    if (!bracketedDivisions.length) return;
    setViewDivision((id) => {
      if (id && bracketedDivisions.some((d) => d.id === id)) return id;
      return bracketedDivisions[0].id;
    });
  }, [event?.id, bracketedIdsKey, bracketedDivisions]);

  useEffect(() => {
    reload();
  }, [eventId, reload]);

  useEffect(() => {
    if (!event) return undefined;
    const isHost = user && isEventHost(event, user);
    if (isHost && (poolPlay || knockoutPhase)) {
      return undefined;
    }
    const ms = poolPlay || knockoutPhase ? 20000 : 8000;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [eventId, reload, poolPlay, knockoutPhase, user, event?.id]);

  if (!event) {
    return (
      <p className="text-slate-400">
        {loadError ? (
          <>
            {loadError}.{" "}
            <button
              type="button"
              className="text-cyan-400 underline"
              onClick={() => reload()}
            >
              Retry
            </button>
          </>
        ) : (
          "Loading tournament…"
        )}
      </p>
    );
  }

  const host = isEventHost(event, user);
  const isEnded = event.status === "ended";
  const phase = event.tournamentPhase ?? "registration";
  const canRegister = phase === "registration" && !isEnded;
  const playerId = getPlayerId(user);
  const playerRegistered = isPlayerRegistered(event, playerId);
  const canRegisterMore = canPlayerRegisterForTournament(
    event,
    playerId,
    user?.name
  );
  const tournamentEntryCount = getTournamentRegistrationCount(event, playerId);
  const pendingEntries = (event.registrations ?? []).filter(
    (r) => r.tournamentEntry?.paymentProofDataUrl
  );
  const hasBrackets = Object.keys(event.tournamentDivisions ?? {}).length > 0;
  const courtCount = event.courts?.length ?? 0;
  const activeCourtDivisionLabel = activeCourtDivisionId
    ? divisionLabel(activeCourtDivisionId, event)
    : null;
  const canBracketAnyDivision = divisions.some((d) => {
    const setup = event.tournamentDivisions?.[d.id];
    if (isDivisionComplete(setup)) return false;
    if (setup?.brackets?.length) return false;
    const count = pairsInDivision(event, d.id).length;
    return (
      count >= 2 &&
      courtCount >= 1 &&
      !divisionHasMatchProgress(setup)
    );
  });
  const hasRegeneratableBrackets = divisions.some((d) => {
    const setup = event.tournamentDivisions?.[d.id];
    return !!setup?.brackets?.length && !isDivisionComplete(setup);
  });
  const showBracketCalculator =
    host &&
    !isEnded &&
    (phase === "registration" || canBracketAnyDivision || hasRegeneratableBrackets);
  const showPlayView =
    hasBrackets || phase === "pool_play" || phase === "knockout";

  const handleAddCourt = async (label) => {
    setCourtBusy((b) => ({ ...b, adding: true }));
    try {
      const ev = await addCourt(eventId, label);
      setEvent(ev);
      setCourtLabel("");
    } catch (err) {
      alert(err.message ?? "Could not add court");
    } finally {
      setCourtBusy((b) => ({ ...b, adding: false }));
    }
  };

  const handleRemoveCourt = async (courtId) => {
    const court = event?.courts?.find((c) => c.id === courtId);
    if (
      !window.confirm(
        `Remove ${court?.name ?? "this court"}? Bracket plans will update to use fewer courts.`
      )
    ) {
      return;
    }
    setCourtBusy((b) => ({ ...b, removingId: courtId }));
    try {
      const ev = await removeCourt(eventId, courtId);
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not remove court");
    } finally {
      setCourtBusy((b) => ({ ...b, removingId: null }));
    }
  };

  const handleDivisionCardClick = (divisionId) => {
    const pairs = pairsInDivision(event, divisionId).length;
    const hasSetup = !!event.tournamentDivisions?.[divisionId];

    if (hasSetup) {
      setViewDivision(divisionId);
      playViewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (courtCount < 1) {
      alert("Add courts before running brackets.");
      return;
    }

    if (pairs < 2) {
      return;
    }

    setCalcDivision(divisionId);
    bracketCalcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRegisterPair = async (e) => {
    e.preventDefault();
    if (!user || !host) return;
    setRegistering(true);
    try {
      const ev = await registerPair(eventId, pairForm, getPlayerId(user));
      setEvent(ev);
      setPairForm((f) => ({
        ...f,
        player1Name: "",
        player2Name: "",
        teamName: "",
      }));
    } catch (err) {
      alert(err.message ?? "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const divisionSetup = event.tournamentDivisions?.[viewDivision];
  const brackets = divisionSetup?.brackets ?? [];
  const divisionFinished = isDivisionComplete(divisionSetup);
  const divisionKnockoutActive = !!divisionSetup?.knockout?.initialized;
  const divisionCanScore =
    host &&
    !isEnded &&
    !divisionFinished &&
    !divisionKnockoutActive &&
    (!activeCourtDivisionId || viewDivision === activeCourtDivisionId);
  const championPairId = getDivisionChampionPairId(divisionSetup);
  const medalists = getKnockoutMedalists(divisionSetup?.knockout);
  const resolveMedalName = (pairId) =>
    pairId
      ? pairById.get(pairId)?.displayName ??
        pairDisplayName(pairById.get(pairId) ?? {})
      : null;
  const championName = resolveMedalName(championPairId);
  const silverName = resolveMedalName(medalists.silverId);
  const bronzeName = resolveMedalName(medalists.bronzeId);
  const embed = embedVideoUrl(event.liveStreamUrl);

  const handleStartMatch = async (bracketId, matchId) => {
    setStartingMatchId(matchId);
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: viewDivision,
        bracketId,
        matchId,
        status: "live",
        scoreA: 0,
        scoreB: 0,
      });
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not start match");
    } finally {
      setStartingMatchId(null);
    }
  };

  const handleForfeitWin = async (bracketId, matchId, forfeitWinnerPairId) => {
    const winner = pairById.get(forfeitWinnerPairId);
    const label =
      winner?.displayName ?? pairDisplayName(winner ?? {});
    if (
      !window.confirm(
        `Default win for ${label}? Records as 11–0 (other pair did not show).`
      )
    ) {
      return;
    }
    setForfeitBusyId(matchId);
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: viewDivision,
        bracketId,
        matchId,
        status: "completed",
        forfeitWinnerPairId,
      });
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not record default win");
    } finally {
      setForfeitBusyId(null);
    }
  };

  const handleStartQuarterfinals = async () => {
    setStartingQuarterfinals(true);
    try {
      const ev = await startQuarterfinals(eventId, viewDivision);
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not start quarterfinals");
    } finally {
      setStartingQuarterfinals(false);
    }
  };

  const handleRegenerateBracket = async (divisionId) => {
    const label = divisionLabel(divisionId, event);
    const msg = `Regenerate ${label}? All pool and knockout matches for this division will be removed and scores erased. Other divisions are not changed.`;
    if (!window.confirm(msg)) return;

    setSetupBusy(true);
    try {
      const ev = await runBracketSetup(eventId, {
        divisionId,
        regenerate: true,
        force: true,
      });
      setEvent(ev);
      setViewDivision(divisionId);
    } catch (err) {
      alert(err.message ?? "Regenerate failed");
    } finally {
      setSetupBusy(false);
    }
  };

  const handleRegenerateAllBrackets = async () => {
    if (
      !window.confirm(
        "Regenerate all bracketed divisions that have no scores yet? Divisions with match progress are skipped — regenerate those individually with erase scores."
      )
    ) {
      return;
    }
    setSetupBusy(true);
    try {
      const ev = await runBracketSetup(eventId, { all: true, regenerate: true });
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Regenerate failed");
    } finally {
      setSetupBusy(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-cyan-400"
          >
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold mt-2">{event.name}</h1>
          <p className="text-slate-400 mt-1">
            Tournament
            {host && (
              <span className="ml-2 text-purple-400 text-sm">(You are the host)</span>
            )}
          </p>
          {phase === "registration" && !isEnded && (
            <RegistrationCountdown
              event={event}
              className="text-sm text-slate-400 mt-2"
            />
          )}
          <p className="text-xs text-slate-500 mt-2">
            {host ? (
              <>
                Pairs register by division (skill + men&apos;s / women&apos;s / mixed).
                {phase === "registration"
                  ? " Use the calculator before play starts."
                  : phase === "pool_play"
                    ? " Live court scoring — top teams advance to quarterfinals."
                    : phase === "knockout"
                      ? championName
                        ? ` Champion: ${championName} — scroll for full finals results.`
                        : " Finals — quarterfinals through championship."
                      : " Event finished."}
              </>
            ) : showPlayView ? (
              "Live scores, brackets, and match schedule — read only."
            ) : isEnded ? (
              "This tournament has ended."
            ) : (
              "The host is setting up the tournament. Brackets and schedule will appear here when play starts."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEnded && (
            <span className="text-sm px-3 py-1.5 rounded-lg bg-slate-700">Ended</span>
          )}
          {host && !isEnded && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("End this tournament for everyone?")) return;
                try {
                  const ev = await endEvent(eventId);
                  setEvent(ev);
                } catch (err) {
                  alert(
                    err?.message?.includes("Blob") ||
                      err?.message?.includes("cannot save")
                      ? `${err.message}\n\nConnect Vercel Blob storage to the pickleflow project, then redeploy.`
                      : err?.message ?? "Could not end tournament"
                  );
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold"
            >
              End tournament
            </button>
          )}
        </div>
      </div>

      {host && phase === "registration" && !isEnded && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-1">Divisions offered</h2>
          <p className="text-slate-500 text-sm mb-4">
            Choose which categories and formats players can register for.
          </p>
          <OfferedDivisionsPicker
            value={offeredIds}
            onChange={setOfferedIds}
            event={event}
            addDivisionBusy={divisionBusy}
            onAddDivision={async (payload) => {
              setDivisionBusy(true);
              try {
                const ev = await addTournamentDivision(
                  eventId,
                  payload,
                  getPlayerId(user)
                );
                setEvent(ev);
                const newId = `${payload.skill}_${payload.format}_doubles`;
                setOfferedIds((prev) => {
                  if (prev.length === 0) return prev;
                  return prev.includes(newId) ? prev : [...prev, newId];
                });
              } catch (err) {
                alert(err.message ?? "Could not add division");
              } finally {
                setDivisionBusy(false);
              }
            }}
          />
          <button
            type="button"
            disabled={offeredBusy}
            className="mt-4 px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg disabled:opacity-50"
            onClick={async () => {
              setOfferedBusy(true);
              try {
                const ev = await updateEventOfferedDivisions(eventId, offeredIds);
                setEvent(ev);
              } catch (err) {
                alert(err.message ?? "Could not save divisions");
              } finally {
                setOfferedBusy(false);
              }
            }}
          >
            {offeredBusy ? "Saving…" : "Save offered divisions"}
          </button>
        </section>
      )}

      {host && phase === "registration" && !isEnded && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-1">Payment settings</h2>
          <p className="text-slate-500 text-sm mb-4">
            Set GCash number and/or upload a bank QR code for player registrations.
          </p>
          <TournamentPaymentSettings
            event={event}
            busy={paymentBusy}
            onSave={async (paymentConfig) => {
              setPaymentBusy(true);
              try {
                const ev = await updateEventPaymentConfig(eventId, paymentConfig);
                setEvent(ev);
              } finally {
                setPaymentBusy(false);
              }
            }}
          />
        </section>
      )}

      {host && pendingEntries.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-1">Registration submissions</h2>
          <p className="text-slate-500 text-sm mb-4">
            Paid registrations are added to their division automatically. Review
            payment proof below — remove if payment is invalid or fraudulent.
          </p>
          <ul className="space-y-4">
            {pendingEntries.map((entry) => (
              <li
                key={entry.registrationId ?? `${entry.playerId}-${entry.tournamentEntry.pairId}`}
                className="rounded-lg border border-slate-800 p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{entry.tournamentEntry.pairName}</p>
                    <p className="text-sm text-slate-400">
                      {entry.name} & {entry.tournamentEntry.partnerName} ·{" "}
                      {entry.tournamentEntry.clubName}
                    </p>
                    <p className="text-sm text-purple-300/90 mt-1">
                      {entry.tournamentEntry.divisionLabel}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Paid via {paymentMethodLabel(entry.tournamentEntry.paymentMethod)} ·{" "}
                      {entry.tournamentEntry.pairId ? "In division" : entry.tournamentEntry.status}
                    </p>
                    {!isEnded && (
                      <div className="mt-3">
                        <HostRegistrationRemoveButton
                          playerName={entry.tournamentEntry.pairName}
                          onRemove={async () => {
                            const ev = await hostRemoveRegistration(
                              eventId,
                              entry.playerId,
                              entry.registrationId
                            );
                            setEvent(ev);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {entry.tournamentEntry.paymentProofDataUrl && (
                    <a
                      href={entry.tournamentEntry.paymentProofDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.tournamentEntry.paymentProofDataUrl}
                        alt="Payment proof"
                        className="h-24 w-24 object-cover rounded-lg border border-slate-700"
                      />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {host && phase === "registration" && !isEnded && !showBracketCalculator && (
        <section className="flex flex-wrap gap-2 items-end">
          <input
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            placeholder="Court name"
            value={courtLabel}
            onChange={(e) => setCourtLabel(e.target.value)}
          />
          <button
            type="button"
            className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm"
            disabled={courtBusy.adding}
            onClick={() => handleAddCourt(courtLabel)}
          >
            {courtBusy.adding ? "Adding…" : "Add court"}
          </button>
          <span className="text-xs text-slate-500">
            {event.courts?.length ?? 0} court(s) — brackets map A→Court 1, B→Court 2…
          </span>
        </section>
      )}

      {host && canRegister && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-1">Register a pair</h2>
          <p className="text-slate-500 text-sm mb-3">
            Host only — manually add walk-in pairs (online registrations join
            their division automatically).
          </p>
          <form onSubmit={handleRegisterPair} className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Division</label>
              <select
                className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
                value={pairForm.divisionId}
                onChange={(e) =>
                  setPairForm({ ...pairForm, divisionId: e.target.value })
                }
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {divisionLabel(d.id, event)}
                    {(() => {
                      const slot = getDivisionSlotStatus(event, d.id);
                      return slot.isFull
                        ? " — Full"
                        : ` — ${slot.remaining} slot${slot.remaining === 1 ? "" : "s"} left`;
                    })()}
                  </option>
                ))}
              </select>
            </div>
            <input
              required
              placeholder="Player 1 name"
              className="p-2 rounded-lg bg-slate-800 border border-slate-700"
              value={pairForm.player1Name}
              onChange={(e) =>
                setPairForm({ ...pairForm, player1Name: e.target.value })
              }
            />
            <input
              required
              placeholder="Player 2 name"
              className="p-2 rounded-lg bg-slate-800 border border-slate-700"
              value={pairForm.player2Name}
              onChange={(e) =>
                setPairForm({ ...pairForm, player2Name: e.target.value })
              }
            />
            <input
              placeholder="Player 1 email (optional)"
              className="p-2 rounded-lg bg-slate-800 border border-slate-700"
              value={pairForm.player1Email}
              onChange={(e) =>
                setPairForm({ ...pairForm, player1Email: e.target.value })
              }
            />
            <input
              placeholder="Player 2 email (optional)"
              className="p-2 rounded-lg bg-slate-800 border border-slate-700"
              value={pairForm.player2Email}
              onChange={(e) =>
                setPairForm({ ...pairForm, player2Email: e.target.value })
              }
            />
            <input
              placeholder="Team name (optional)"
              className="sm:col-span-2 p-2 rounded-lg bg-slate-800 border border-slate-700"
              value={pairForm.teamName}
              onChange={(e) =>
                setPairForm({ ...pairForm, teamName: e.target.value })
              }
            />
            <button
              type="submit"
              disabled={registering}
              className="sm:col-span-2 py-2.5 bg-purple-500 font-semibold rounded-lg disabled:opacity-50"
            >
              {registering ? "Registering…" : "Register pair"}
            </button>
          </form>
        </section>
      )}

      {!host && phase === "registration" && !isEnded && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold mb-1">Registration</h2>
            <RegistrationCountdown event={event} className="text-sm text-slate-400 mt-2" />
          </div>
          {playerRegistered && !canRegisterMore ? (
            <p className="text-green-400 text-sm">
              You are registered ({tournamentEntryCount}/
              {tournamentRegistrationLimitLabel()} entries) and added to your
              division. Good luck!
            </p>
          ) : isRegistrationClosed(event) ? (
            <p className="text-amber-400 text-sm">Registration is closed.</p>
          ) : canRegisterMore ? (
            <>
              {playerRegistered && (
                <p className="text-sm text-cyan-300/90">
                  You have {tournamentEntryCount}/
                  {tournamentRegistrationLimitLabel()} entries. You may register
                  another pair in the same skill category.
                </p>
              )}
              <TournamentRegisterForm
                event={event}
                user={user}
                busy={playerRegisterBusy}
                onSubmit={async (form) => {
                  setPlayerRegisterBusy(true);
                  try {
                    const ev = await registerForEvent(eventId, user, form);
                    setEvent(ev);
                  } finally {
                    setPlayerRegisterBusy(false);
                  }
                }}
              />
            </>
          ) : (
            <p className="text-amber-400 text-sm">
              Registration is not available for your account.
            </p>
          )}
          <TournamentDivisionSlots
            event={event}
            highlightSkill={user?.category}
            compact
          />
        </section>
      )}

      {!host && !showPlayView && !isEnded && phase !== "registration" && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-2">Tournament setup</h2>
          <p className="text-slate-400 text-sm">
            Waiting for the host to finish registration and publish brackets. You
            will see live matches, standings, and the schedule here once play
            begins.
          </p>
        </section>
      )}

      {host && (
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-1">Registered pairs</h2>
        <p className="text-slate-500 text-sm mb-3">
          Click a division to set up brackets or open its schedule.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {divisions.map((d) => {
            const pairs = pairsInDivision(event, d.id);
            const slot = getDivisionSlotStatus(event, d.id);
            const hasSetup = !!event.tournamentDivisions?.[d.id];
            const setup = event.tournamentDivisions?.[d.id];
            const champion = getDivisionChampionPairId(setup);
            const championLabel = champion
              ? pairDisplayName(
                  enrichPair(pairs.find((p) => p.id === champion) ?? {})
                )
              : null;
            const finished = isDivisionComplete(setup);
            const activeInPool = getActiveDivisionForDivision(event, d.id);
            const canBracket =
              pairs.length >= 2 &&
              courtCount >= 1 &&
              (!hasSetup || !divisionHasMatchProgress(setup));
            const isActive =
              hasSetup ? viewDivision === d.id : calcDivision === d.id;
            const clickable = hasSetup || canBracket;
            const usingCourts = activeInPool === d.id;

            return (
              <button
                key={d.id}
                type="button"
                disabled={!clickable}
                onClick={() => handleDivisionCardClick(d.id)}
                className={`text-left rounded-lg border p-3 transition ${
                  isActive
                    ? "border-purple-500 bg-purple-500/15"
                    : clickable
                      ? "border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/60 cursor-pointer"
                      : "border-slate-800 opacity-50 cursor-not-allowed"
                }`}
              >
                <p className="text-sm font-medium text-purple-300/90">
                  {divisionLabel(d.id, event)}
                </p>
                <p className="text-2xl font-bold mt-1">{pairs.length}</p>
                {phase === "registration" && !finished && (
                  <p className="text-xs mt-1">
                    {slot.isFull ? (
                      <span className="text-amber-400">Full ({slot.limit} pairs)</span>
                    ) : (
                      <span className="text-green-400">
                        {slot.remaining} slot{slot.remaining === 1 ? "" : "s"} available
                      </span>
                    )}
                  </p>
                )}
                <p className="text-xs mt-1">
                  {champion ? (
                    <span className="text-amber-400">Champion crowned — view history</span>
                  ) : finished ? (
                    <span className="text-amber-400">Complete — view history</span>
                  ) : usingCourts ? (
                    <span className="text-cyan-400">Using all courts now</span>
                  ) : hasSetup ? (
                    activeInPool === d.id ? (
                      <span className="text-cyan-400">Using courts now</span>
                    ) : (
                      <span className="text-slate-400">Schedule ready — waiting for courts</span>
                    )
                  ) : canBracket ? (
                    <span className="text-cyan-400">Ready — click to set up brackets</span>
                  ) : courtCount < 1 && pairs.length >= 2 ? (
                    <span className="text-amber-400/90">Add courts to bracket</span>
                  ) : pairs.length < 2 ? (
                    <span className="text-slate-500">Need at least 2 pairs</span>
                  ) : null}
                </p>
                {champion && championLabel && (
                  <p className="mt-2 text-base font-bold text-amber-200">
                    🏆 {championLabel}
                  </p>
                )}
                {!hasSetup && pairs.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-500 space-y-0.5 max-h-24 overflow-y-auto">
                    {pairs.slice(0, 6).map((p) => (
                      <li key={p.id}>{pairDisplayName(p)}</li>
                    ))}
                    {pairs.length > 6 && (
                      <li className="text-slate-600">+{pairs.length - 6} more</li>
                    )}
                  </ul>
                )}
                {hasSetup && !champion && (
                  <p className="mt-2 text-xs text-slate-500">
                    {pairs.length} pair{pairs.length === 1 ? "" : "s"} registered
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>
      )}

      <TournamentPairList
        event={event}
        eventId={eventId}
        host={host}
        isEnded={isEnded}
        onEventUpdate={setEvent}
      />

      {showBracketCalculator && (
        <div ref={bracketCalcRef}>
        <BracketCalculator
          event={event}
          selectedDivisionId={calcDivision}
          onSelectDivision={setCalcDivision}
          busy={setupBusy}
          canManageCourts
          onAddCourt={handleAddCourt}
          onRemoveCourt={handleRemoveCourt}
          courtBusy={courtBusy}
          onEventUpdate={setEvent}
          eventId={eventId}
          onApplyDivision={async (divisionId) => {
            if (
              !confirm(
                `Apply brackets for ${divisionLabel(divisionId, event)}? This division uses its skill tier's courts until a champion is crowned.`
              )
            ) {
              return;
            }
            setSetupBusy(true);
            try {
              const ev = await runBracketSetup(eventId, { divisionId });
              setEvent(ev);
              setViewDivision(divisionId);
            } catch (err) {
              alert(err.message ?? "Setup failed");
            } finally {
              setSetupBusy(false);
            }
          }}
          onApplyAll={async () => {
            if (
              !confirm(
                `Generate brackets for all ready divisions?\n\nSchedules are built for every division with at least 2 pairs. Each skill tier uses its own court pool. Use division play order below to choose which category plays first on those courts.\n\nNovice and intermediate tiers can run in parallel.`
              )
            ) {
              return;
            }
            setSetupBusy(true);
            try {
              const ev = await runBracketSetup(eventId, { all: true });
              setEvent(ev);
              if (ev.activeDivisionId) {
                setViewDivision(ev.activeDivisionId);
              }
            } catch (err) {
              alert(err.message ?? "Setup failed");
            } finally {
              setSetupBusy(false);
            }
          }}
          onRegenerateDivision={handleRegenerateBracket}
          onRegenerateAll={handleRegenerateAllBrackets}
        />
        </div>
      )}

      {showPlayView && (
        <section ref={playViewRef} className="space-y-6">
          {bracketedDivisions.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Brackets & schedule</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Standings and round-robin match schedule by division — switch tabs
                  to see every bracketed category.
                </p>
              </div>
              {host &&
                !isEnded &&
                brackets.length > 0 &&
                !divisionFinished && (
                  <button
                    type="button"
                    disabled={setupBusy}
                    onClick={() => handleRegenerateBracket(viewDivision)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/50 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 shrink-0"
                  >
                    {setupBusy ? "Working…" : "Regenerate division"}
                  </button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
              {bracketedDivisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setViewDivision(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    viewDivision === d.id
                      ? "bg-purple-500 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {divisionLabel(d.id, event)}
                </button>
              ))}
            </div>

            {divisionSetup?.plan && !divisionKnockoutActive && !divisionFinished && (
              <p className="text-sm text-slate-500">
                {divisionSetup.plan.formulaText} — round robin per court; top teams
                advance to quarterfinals.
              </p>
            )}

            {activeCourtDivisionId &&
              viewDivision !== activeCourtDivisionId &&
              brackets.length > 0 &&
              !divisionFinished && (
                <p className="text-sm text-cyan-300/90">
                  Full match schedule for this division. Courts open here when earlier
                  divisions in this skill tier finish.
                </p>
              )}

            {divisionFinished && !championPairId && (
              <p className="text-sm text-amber-400/90">
                This division is marked complete. Pool play and finals history are
                preserved — use the tabs to review results.
              </p>
            )}

            {!brackets.length && bracketedDivisions.length > 0 && (
              <p className="text-sm text-slate-400">
                Select a division tab above to view brackets and the match schedule.
              </p>
            )}

            {brackets.length > 0 && (
              <div className="grid xl:grid-cols-2 gap-6">
                {brackets.map((bracket) => (
                  <TournamentRoundRobin
                    key={bracket.id}
                    bracket={bracket}
                    pairById={pairById}
                    divisionAdvancement={divisionSetup?.advancement}
                    scheduleResetAt={divisionSetup?.scheduleResetAt}
                    readOnly={!divisionCanScore || divisionKnockoutActive || divisionFinished}
                    host={divisionCanScore && !divisionKnockoutActive && !divisionFinished}
                    startingMatchId={startingMatchId}
                    forfeitBusyId={forfeitBusyId}
                    onStartMatch={
                      divisionCanScore && !divisionKnockoutActive && !divisionFinished
                        ? (matchId) => handleStartMatch(bracket.id, matchId)
                        : undefined
                    }
                    onForfeitWin={
                      divisionCanScore && !divisionKnockoutActive && !divisionFinished
                        ? (matchId, winnerPairId) =>
                            handleForfeitWin(bracket.id, matchId, winnerPairId)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            <DivisionAdvancementPanel
              advancement={divisionSetup?.advancement}
              knockout={divisionSetup?.knockout}
              pairById={pairById}
              host={host && !isEnded && !divisionFinished}
              startingQuarterfinals={startingQuarterfinals}
              onStartQuarterfinals={handleStartQuarterfinals}
              hideKnockoutRounds={!!divisionSetup?.knockout?.initialized}
            />

            {divisionSetup?.knockout?.initialized && !divisionFinished && (
              <p className="text-sm text-red-400/90">
                Finals — start matches on the courts, then set base players on
                the live court diagram. Only winners advance.
              </p>
            )}

            {divisionSetup?.knockout?.initialized && (
              <EliminationResultsPanel
                knockout={divisionSetup.knockout}
                pairById={pairById}
                host={host && !isEnded}
                divisionId={viewDivision}
                eventId={eventId}
                onReload={reload}
              />
            )}
          </div>
          )}

          {(championName || silverName || bronzeName) && (
            <MedalPodium
              goldName={championName}
              silverName={silverName}
              bronzeName={bronzeName}
              subtitle={divisionLabel(viewDivision, event)}
              compact={!!championName && !silverName && !bronzeName}
            />
          )}

          {event.liveStreamEnabled && embed && (
            <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <h2 className="px-6 py-3 border-b border-slate-800 font-semibold">
                Live video
              </h2>
              <div className="aspect-video w-full">
                <iframe
                  title="Live stream"
                  src={embed}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </section>
          )}

          {host && !isEnded && (
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="font-semibold mb-3">Live video (host)</h2>
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  className="flex-1 min-w-[200px] p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                  placeholder="YouTube or stream URL"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!event.liveStreamEnabled}
                    onChange={async (e) => {
                      await updateEventStream(eventId, {
                        liveStreamUrl: streamUrl,
                        liveStreamEnabled: e.target.checked,
                      });
                      await reload();
                    }}
                  />
                  Show live video
                </label>
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-700 rounded-lg text-sm"
                  onClick={async () => {
                    await updateEventStream(eventId, { liveStreamUrl: streamUrl });
                    await reload();
                  }}
                >
                  Save URL
                </button>
              </div>
            </section>
          )}

          {(event.courts?.length ?? 0) > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-bold">Live courts</h2>
                {courtPools.length > 1 && (
                  <p className="text-slate-500 text-sm mt-1">
                    {courtPools.map((p) => `${p.label}: ${p.courtNames}`).join(" · ")}
                  </p>
                )}
                {activeCourtDivisionLabel ? (
                  <p className="text-cyan-400 text-sm mt-1">
                    This tier is playing {activeCourtDivisionLabel}
                    {viewDivision !== activeCourtDivisionId && (
                      <span className="text-slate-500">
                        {" "}
                        — switch division tabs below to score other divisions
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">
                    {host
                      ? knockoutPhase
                        ? "Finals matches auto-fill courts. Score with +/− — loser is out."
                        : "Start a match, then score with +/− or type scores — same as open play."
                      : knockoutPhase
                        ? "Finals — live scores, read only."
                        : "Live scores for each court — read only."}
                  </p>
                )}
              </div>
              <div className="grid xl:grid-cols-2 gap-6">
                {event.courts.map((court) => (
                  <TournamentLiveCourtCard
                    key={court.id}
                    court={court}
                    event={event}
                    eventId={eventId}
                    pairById={pairById}
                    host={host && !isEnded}
                    onReload={reload}
                    onEventUpdate={(ev) => {
                      pauseAutoRefresh(120000);
                      setEvent(ev);
                    }}
                    onPauseAutoRefresh={pauseAutoRefresh}
                  />
                ))}
              </div>
            </section>
          )}

        </section>
      )}
    </div>
  );
}
