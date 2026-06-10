"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TournamentDivisionWorkspace from "@/components/TournamentDivisionWorkspace";
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
  isRegistrationClosed,
} from "@/lib/tournament-registration";
import {
  getCourtOccupyingDivisionId,
  getActiveDivisionForDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
} from "@/lib/tournament-division-schedule";
import { describeCourtPools } from "@/lib/tournament-court-pools";
import { applyEventFetch, mergeEventSnapshots } from "@/lib/event-merge";

function embedVideoUrl(url) {
  if (!url?.trim()) return null;
  const raw = url.trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      let id = u.searchParams.get("v");
      if (!id && u.pathname.startsWith("/embed/")) {
        id = u.pathname.split("/")[2];
      }
      if (!id && u.pathname.startsWith("/live/")) {
        id = u.pathname.split("/")[2];
      }
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export default function TournamentEvent({ eventId, initialEvent = null }) {
  const [event, setEvent] = useState(initialEvent);
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [courtBusy, setCourtBusy] = useState({ adding: false, removingId: null });
  const [viewDivision, setViewDivision] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [divisionBusy, setDivisionBusy] = useState(false);
  const [startingMatchId, setStartingMatchId] = useState(null);
  const [lockingMatchId, setLockingMatchId] = useState(null);
  const [forfeitBusyId, setForfeitBusyId] = useState(null);
  const [startingQuarterfinals, setStartingQuarterfinals] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [streamBusy, setStreamBusy] = useState(false);
  const [pairForm, setPairForm] = useState({
    divisionId: "",
    player1Name: "",
    player2Name: "",
    player1Email: "",
    player2Email: "",
    teamName: "",
  });
  const [registering, setRegistering] = useState(false);
  const [pairRegisterError, setPairRegisterError] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [offeredBusy, setOfferedBusy] = useState(false);
  const [offeredIds, setOfferedIds] = useState([]);
  const [playerRegisterBusy, setPlayerRegisterBusy] = useState(false);
  const playViewRef = useRef(null);
  const refreshPausedUntilRef = useRef(0);
  const registeringRef = useRef(false);

  const pauseAutoRefresh = useCallback((ms = 15000) => {
    refreshPausedUntilRef.current = Date.now() + ms;
  }, []);

  const reload = useCallback(async () => {
    if (Date.now() < refreshPausedUntilRef.current || registeringRef.current) {
      return;
    }
    try {
      const ev = await fetchEventById(eventId);
      setEvent((prev) => {
        if (!ev) return ev;
        return applyEventFetch(prev, ev);
      });
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

  useEffect(() => {
    if (!divisions.length || !event?.id) return;
    const first = divisions[0].id;
    setViewDivision((id) => (id && divisions.some((d) => d.id === id) ? id : first));
    setPairForm((f) =>
      divisions.some((d) => d.id === f.divisionId)
        ? f
        : { ...f, divisionId: first }
    );
  }, [event?.id, divisions]);

  useEffect(() => {
    reload();
  }, [eventId, reload]);

  useEffect(() => {
    if (!event) return undefined;
    const isHost = user && isEventHost(event, user);
    if (isHost && (poolPlay || knockoutPhase)) {
      return undefined;
    }
    if (isHost && event.tournamentPhase === "registration") {
      return undefined;
    }
    const ms = poolPlay || knockoutPhase ? 20000 : 8000;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [eventId, reload, poolPlay, knockoutPhase, user, event?.id, event?.tournamentPhase]);

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
          "Loading tournament..."
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
    user?.name ?? user?.email
  );
  const tournamentEntryCount = getTournamentRegistrationCount(event, playerId);
  const pendingEntries = (event.registrations ?? []).filter(
    (r) => r.tournamentEntry?.paymentProofDataUrl
  );
  const hasBrackets = Object.keys(event.tournamentDivisions ?? {}).length > 0;
  const activeCourtDivisionLabel = activeCourtDivisionId
    ? divisionLabel(activeCourtDivisionId, event)
    : null;
  const showPlayView =
    hasBrackets || phase === "pool_play" || phase === "knockout";

  const handleAddCourt = async (label) => {
    setCourtBusy((b) => ({ ...b, adding: true }));
    try {
      const ev = await addCourt(eventId, label);
      setEvent((prev) => mergeEventSnapshots(prev, ev));
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

  const handleSelectDivision = (divisionId) => {
    setViewDivision(divisionId);
    setPairForm((f) => ({ ...f, divisionId }));
  };

  const handleRegisterPair = async (e) => {
    e.preventDefault();
    if (!user || !host) return;
    if (!pairForm.divisionId) {
      setPairRegisterError("Choose a division first.");
      return;
    }
    setRegistering(true);
    registeringRef.current = true;
    setPairRegisterError("");
    pauseAutoRefresh(60000);
    try {
      const payload = { ...pairForm, divisionId: viewDivision || pairForm.divisionId };
      const ev = await registerPair(eventId, payload, getPlayerId(user));
      setEvent((prev) => mergeEventSnapshots(prev, ev));
      setPairForm((f) => ({
        ...f,
        player1Name: "",
        player2Name: "",
        player1Email: "",
        player2Email: "",
        teamName: "",
      }));
    } catch (err) {
      setPairRegisterError(err.message ?? "Registration failed");
    } finally {
      registeringRef.current = false;
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

  const saveLiveStream = async (patch) => {
    setStreamBusy(true);
    try {
      const ev = await updateEventStream(eventId, patch);
      if (ev) setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not save live video settings");
    } finally {
      setStreamBusy(false);
    }
  };

  const liveVideoPanel = (showEmbed = true) => (
    <div className="space-y-4">
      {host && !isEnded && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative z-10">
          <h2 className="font-semibold mb-3">Live video (host)</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="url"
              className="flex-1 min-w-[200px] p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white"
              placeholder="YouTube link (youtube.com/watch?v=â€¦ or youtu.be/â€¦)"
              value={streamUrl}
              disabled={streamBusy}
              onChange={(e) => setStreamUrl(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 cursor-pointer"
                checked={!!event.liveStreamEnabled}
                disabled={streamBusy}
                onChange={(e) => {
                  void saveLiveStream({
                    liveStreamUrl: streamUrl,
                    liveStreamEnabled: e.target.checked,
                  });
                }}
              />
              Show live video
            </label>
            <button
              type="button"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm disabled:opacity-50"
              disabled={streamBusy}
              onClick={() => void saveLiveStream({ liveStreamUrl: streamUrl })}
            >
              {streamBusy ? "Savingâ€¦" : "Save URL"}
            </button>
          </div>
        </section>
      )}
      {showEmbed && event.liveStreamEnabled && embed && (
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
      {showEmbed &&
        event.liveStreamEnabled &&
        !embed &&
        (event.liveStreamUrl || streamUrl) && (
          <p className="text-sm text-amber-400/90 px-1">
            Could not embed this URL. Paste a full YouTube watch or youtu.be link,
            save, then enable Show live video.
          </p>
        )}
    </div>
  );

  const liveCourtsSection = () =>
    (event.courts?.length ?? 0) > 0 ? (
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold">Live courts</h2>
          {courtPools.length > 1 && (
            <p className="text-slate-500 text-sm mt-1">
              {courtPools.map((p) => `${p.label}: ${p.courtNames}`).join(" Â· ")}
            </p>
          )}
          {activeCourtDivisionLabel ? (
            <p className="text-cyan-400 text-sm mt-1">
              This tier is playing {activeCourtDivisionLabel}
              {viewDivision !== activeCourtDivisionId && (
                <span className="text-slate-500">
                  {" "}
                  â€” switch division tabs below to score other divisions
                </span>
              )}
            </p>
          ) : (
            <p className="text-slate-500 text-sm mt-1">
              {host
                ? knockoutPhase
                  ? "Finals matches auto-fill courts. Score with +/âˆ’ â€” loser is out."
                  : "Start a match, then score with +/âˆ’ or type scores â€” same as open play."
                : knockoutPhase
                  ? "Finals â€” live scores, read only."
                  : "Live scores for each court â€” read only."}
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
    ) : null;

  const handleStartMatch = async (bracketId, matchId) => {
    setStartingMatchId(matchId);
    pauseAutoRefresh(120000);
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

  const handleLockMatch = async (bracketId, matchId) => {
    if (
      !window.confirm(
        "Lock this match? The result will be final â€” no rematch and no score changes."
      )
    ) {
      return;
    }
    setLockingMatchId(matchId);
    try {
      const ev = await patchTournamentMatch(eventId, {
        divisionId: viewDivision,
        bracketId,
        matchId,
        resultLocked: true,
      });
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not lock match");
    } finally {
      setLockingMatchId(null);
    }
  };

  const handleForfeitWin = async (bracketId, matchId, forfeitWinnerPairId) => {
    const winner = pairById.get(forfeitWinnerPairId);
    const label =
      winner?.displayName ?? pairDisplayName(winner ?? {});
    if (
      !window.confirm(
        `Default win for ${label}? Records as 11â€“0 (other pair did not show).`
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
        "Regenerate all bracketed divisions that have no scores yet? Divisions with match progress are skipped â€” regenerate those individually with erase scores."
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

  const divisionLiveEmbed =
    event.liveStreamEnabled && embed ? (
      <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <h3 className="px-4 py-3 border-b border-slate-800 font-semibold text-sm">
          Live video
        </h3>
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
    ) : null;

  const divisionSchedulePanel =
    brackets.length > 0 ? (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold">Brackets & schedule</h3>
          <p className="text-slate-500 text-sm mt-1">
            Round-robin standings and match schedule for{" "}
            {divisionLabel(viewDivision, event)}.
          </p>
        </div>

        {divisionSetup?.plan && !divisionKnockoutActive && !divisionFinished && (
          <p className="text-sm text-slate-500">
            {divisionSetup.plan.formulaText} â€” round robin per court; top teams
            advance to quarterfinals.
          </p>
        )}

        {activeCourtDivisionId &&
          viewDivision !== activeCourtDivisionId &&
          !divisionFinished && (
            <p className="text-sm text-cyan-300/90">
              Full match schedule for this division. Courts open here when earlier
              divisions in this skill tier finish.
            </p>
          )}

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
              lockingMatchId={lockingMatchId}
              forfeitBusyId={forfeitBusyId}
              onLockMatch={
                divisionCanScore && !divisionKnockoutActive && !divisionFinished
                  ? (matchId) => handleLockMatch(bracket.id, matchId)
                  : undefined
              }
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
            Finals â€” start matches on the courts, then set base players on the live
            court diagram. Only winners advance.
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

        {(championName || silverName || bronzeName) && (
          <MedalPodium
            goldName={championName}
            silverName={silverName}
            bronzeName={bronzeName}
            subtitle={divisionLabel(viewDivision, event)}
            compact={!!championName && !silverName && !bronzeName}
          />
        )}
      </div>
    ) : null;

  return (
    <div className="min-w-0 max-w-full space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-cyan-400"
          >
            â† Dashboard
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
                    ? " Live court scoring â€” top teams advance to quarterfinals."
                    : phase === "knockout"
                      ? championName
                        ? ` Champion: ${championName} â€” scroll for full finals results.`
                        : " Finals â€” quarterfinals through championship."
                      : " Event finished."}
              </>
            ) : showPlayView ? (
              "Live scores, brackets, and match schedule â€” read only."
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

      {!host && showPlayView && (
        <section className="space-y-6" aria-label="Live action">
          {event.liveStreamEnabled ? liveVideoPanel(true) : null}
          {liveCourtsSection()}
        </section>
      )}

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
            {offeredBusy ? "Savingâ€¦" : "Save offered divisions"}
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
            payment proof below â€” remove if payment is invalid or fraudulent.
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
                      {entry.name} & {entry.tournamentEntry.partnerName} Â·{" "}
                      {entry.tournamentEntry.clubName}
                    </p>
                    <p className="text-sm text-purple-300/90 mt-1">
                      {entry.tournamentEntry.divisionLabel}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Paid via {paymentMethodLabel(entry.tournamentEntry.paymentMethod)} Â·{" "}
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

      {host && !isEnded && divisions.length > 0 && (
        <div ref={playViewRef}>
          <TournamentDivisionWorkspace
            event={event}
            eventId={eventId}
            host={host}
            isEnded={isEnded}
            activeDivisionId={viewDivision}
            onSelectDivision={handleSelectDivision}
            canRegister={canRegister}
            pairForm={pairForm}
            setPairForm={setPairForm}
            onRegisterPair={handleRegisterPair}
            registering={registering}
            pairRegisterError={pairRegisterError}
            onAddCourt={handleAddCourt}
            onRemoveCourt={handleRemoveCourt}
            courtBusy={courtBusy}
            streamUrl={streamUrl}
            onStreamUrlChange={setStreamUrl}
            streamBusy={streamBusy}
            onSaveLiveStream={saveLiveStream}
            setupBusy={setupBusy}
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
                handleSelectDivision(divisionId);
              } catch (err) {
                alert(err.message ?? "Setup failed");
              } finally {
                setSetupBusy(false);
              }
            }}
            onApplyAll={async () => {
              if (
                !confirm(
                  `Generate brackets for all ready divisions?\n\nSchedules are built for every division with at least 2 pairs. Each skill tier uses its own court pool.\n\nNovice and intermediate tiers can run in parallel.`
                )
              ) {
                return;
              }
              setSetupBusy(true);
              try {
                const ev = await runBracketSetup(eventId, { all: true });
                setEvent(ev);
                if (ev.activeDivisionId) {
                  handleSelectDivision(ev.activeDivisionId);
                }
              } catch (err) {
                alert(err.message ?? "Setup failed");
              } finally {
                setSetupBusy(false);
              }
            }}
            onRegenerateDivision={handleRegenerateBracket}
            onRegenerateAll={handleRegenerateAllBrackets}
            onEventUpdate={setEvent}
            liveEmbedPanel={showPlayView ? divisionLiveEmbed : null}
            liveCourtsPanel={showPlayView ? liveCourtsSection() : null}
            schedulePanel={divisionSchedulePanel}
          />
        </div>
      )}

      {!host && showPlayView && (
        <section ref={playViewRef} className="space-y-6">
          {event.liveStreamEnabled && embed ? liveVideoPanel(true) : null}
          {liveCourtsSection()}

          {bracketedDivisions.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Brackets & schedule</h2>
              <p className="text-slate-500 text-sm mt-1">
                Standings and round-robin match schedule by division â€” switch tabs
                to see every bracketed category.
              </p>
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
                {divisionSetup.plan.formulaText} â€” round robin per court; top teams
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
                preserved â€” use the tabs to review results.
              </p>
            )}

            {!brackets.length && bracketedDivisions.length > 0 && (
              <p className="text-sm text-slate-400">
                Select a division tab above to view brackets and the match schedule.
              </p>
            )}

            {divisionSchedulePanel}
          </div>
          )}
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
                  pauseAutoRefresh(60000);
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
              You already have {tournamentEntryCount}/
              {tournamentRegistrationLimitLabel()} entries in this tournament.
              Each player can register at most{" "}
              {tournamentRegistrationLimitLabel()} pairs in the same skill
              category.
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
    </div>
  );
}
