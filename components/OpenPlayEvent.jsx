"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EventPlayersSidebar from "@/components/EventPlayersSidebar";
import LiveCourtCard from "@/components/LiveCourtCard";
import MatchHistory from "@/components/MatchHistory";
import OpenPlayLeaderboard from "@/components/OpenPlayLeaderboard";
import PendingMatchModal from "@/components/PendingMatchModal";
import {
  addCourt,
  removeCourt,
  updateEventStream,
  reloadEvent,
  fetchEventById,
  endEvent,
  resolvePendingMatch,
  seedSamplePlayers,
  hostAddWalkInPlayer,
  hostRemovePlayer,
  registerForEvent,
  updateEventPaymentConfig,
  hostRemoveRegistration,
} from "@/lib/events";
import { applyEventFetch } from "@/lib/event-merge";
import { getCurrentUser, isEventHost, getPlayerId } from "@/lib/session";
import { isPlayerRegistered } from "@/lib/registration-status";
import OpenPlayRegisterForm from "@/components/OpenPlayRegisterForm";
import TournamentPaymentSettings from "@/components/TournamentPaymentSettings";
import HostRegistrationRemoveButton from "@/components/HostRegistrationRemoveButton";
import { paymentMethodLabel } from "@/lib/tournament-payment";

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

export default function OpenPlayEvent({ eventId }) {
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [courtLabel, setCourtLabel] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [dismissedProposalKey, setDismissedProposalKey] = useState(null);
  const [reviewCourtId, setReviewCourtId] = useState(null);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);

  const reloadInFlight = useRef(false);
  const refreshPausedUntilRef = useRef(0);

  const pauseAutoRefresh = useCallback((ms = 15000) => {
    refreshPausedUntilRef.current = Date.now() + ms;
  }, []);

  const applyEvent = useCallback((ev) => {
    if (ev) setEvent(ev);
  }, []);

  const reload = useCallback(async () => {
    if (Date.now() < refreshPausedUntilRef.current) return;
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    try {
      const currentUser = getCurrentUser();
      let ev = await fetchEventById(eventId);
      if (
        ev &&
        ev.status !== "ended" &&
        ev.type === "open_play" &&
        isEventHost(ev, currentUser)
      ) {
        ev = await reloadEvent(eventId, { runAutomation: true });
      }
      setEvent(ev);
      setUser(currentUser);
    } catch {
      /* keep last good state */
    } finally {
      reloadInFlight.current = false;
    }
  }, [eventId]);

  const hasLiveCourt = event?.courts?.some((c) => c.status === "live");

  useEffect(() => {
    reload();
  }, [eventId, reload]);

  useEffect(() => {
    if (!event) return undefined;
    const isHost = user && isEventHost(event, user);
    if (isHost && hasLiveCourt) {
      return undefined;
    }
    const t = setInterval(() => reload(), 12000);
    return () => clearInterval(t);
  }, [eventId, reload, user, event?.id, hasLiveCourt]);

  useEffect(() => {
    if (event?.liveStreamUrl) setStreamUrl(event.liveStreamUrl);
  }, [event?.liveStreamUrl]);

  const host = event ? isEventHost(event, user) : false;
  const playerId = getPlayerId(user);
  const registered = event ? isPlayerRegistered(event, playerId) : false;
  const paidRegistrations = (event?.registrations ?? []).filter(
    (r) => r.paymentEntry?.paymentProofDataUrl
  );

  const pendingCourt = useMemo(() => {
    if (!event?.courts) return null;
    return (
      [...event.courts]
        .filter((c) => c.status === "pending" && c.pendingMatch)
        .sort(
          (a, b) =>
            (a.pendingMatch?.proposedAt ?? 0) -
            (b.pendingMatch?.proposedAt ?? 0)
        )[0] ?? null
    );
  }, [event]);

  const modalCourt =
    event?.courts?.find((c) => c.id === reviewCourtId) ?? pendingCourt;

  const pendingProposalKey = modalCourt
    ? `${modalCourt.id}-${modalCourt.pendingMatch?.proposedAt}`
    : null;

  useEffect(() => {
    if (!host || !pendingProposalKey || event?.status === "ended") return;
    if (dismissedProposalKey !== pendingProposalKey) {
      setPendingModalOpen(true);
    }
  }, [host, pendingProposalKey, dismissedProposalKey, event?.status]);

  if (!event) {
    return (
      <p className="text-slate-400">
        Event not found.{" "}
        <Link href="/dashboard" className="text-cyan-400">
          Back to dashboard
        </Link>
      </p>
    );
  }

  const isEnded = event.status === "ended";
  const embed = embedVideoUrl(event.liveStreamUrl);

  const handleEndEvent = async () => {
    if (
      !confirm(
        "End this entire event? Live matches will be saved to history, pending matches cancelled, and no new games will start."
      )
    ) {
      return;
    }
    try {
      const ev = await endEvent(eventId);
      setEvent(ev);
      setPendingModalOpen(false);
    } catch (err) {
      alert(err.message ?? "Could not end event");
    }
  };

  const handleAddCourt = async () => {
    try {
      const ev = await addCourt(eventId, courtLabel);
      setCourtLabel("");
      setEvent((prev) => applyEventFetch(prev, ev));
    } catch (err) {
      alert(err.message ?? "Could not add court");
    }
  };

  const handleRemoveCourt = async (courtId) => {
    if (!confirm("Remove this court? Players in its queue will be reassigned.")) {
      return;
    }
    try {
      const ev = await removeCourt(eventId, courtId);
      setEvent(ev);
    } catch (err) {
      alert(err.message ?? "Could not remove court");
    }
  };

  const mainContent = (
    <div className="flex-1 min-w-0 space-y-8 lg:pt-0 pt-6">
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
          <h2 className="font-semibold mb-1">Payment settings</h2>
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

      {host && paidRegistrations.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="font-semibold mb-1">Registration submissions</h2>
          <p className="text-slate-500 text-sm mb-4">
            Players who submitted payment proof for this session. Remove
            registrations if payment is invalid or fraudulent.
          </p>
          <ul className="space-y-4">
            {paidRegistrations.map((entry) => (
              <li
                key={entry.playerId}
                className="rounded-lg border border-slate-800 p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{entry.name}</p>
                    <p className="text-sm text-slate-400">
                      {entry.paymentEntry.clubName} · {entry.paymentEntry.category}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Paid via {paymentMethodLabel(entry.paymentEntry.paymentMethod)}
                    </p>
                    {!isEnded && (
                      <div className="mt-3">
                        <HostRegistrationRemoveButton
                          playerName={entry.name}
                          onRemove={async () => {
                            const ev = await hostRemoveRegistration(
                              eventId,
                              entry.playerId
                            );
                            setEvent(ev);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {entry.paymentEntry.paymentProofDataUrl && (
                    <a
                      href={entry.paymentEntry.paymentProofDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.paymentEntry.paymentProofDataUrl}
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

      {!host && !isEnded && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="font-semibold mb-1">Registration</h2>
          {registered ? (
            <p className="text-green-400 text-sm">
              You are registered with payment submitted. The host can add you to courts.
            </p>
          ) : (
            <>
              <p className="text-slate-500 text-sm mb-4">
                Pay via GCash or bank QR, then attach proof to complete registration.
              </p>
              <OpenPlayRegisterForm
                event={event}
                user={user}
                busy={registerBusy}
                onSubmit={async (form) => {
                  setRegisterBusy(true);
                  try {
                    const ev = await registerForEvent(eventId, user, form);
                    setEvent(ev);
                  } finally {
                    setRegisterBusy(false);
                  }
                }}
              />
            </>
          )}
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
              Show live video to players
            </label>
            <button
              type="button"
              className="px-4 py-2 bg-slate-700 rounded-lg text-sm"
              onClick={async () => {
                await updateEventStream(eventId, {
                  liveStreamUrl: streamUrl,
                });
                await reload();
              }}
            >
              Save URL
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold">Courts</h2>
            <p className="text-slate-500 text-sm mt-1">
              {host
                ? "Each open court proposes the next 4 by wait time. You confirm and score before the match ends."
                : "Live scores and player positions — read only."}
            </p>
          </div>
          {host && !isEnded && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <input
                className="flex-1 min-w-[140px] p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                placeholder="Court name (optional)"
                value={courtLabel}
                onChange={(e) => setCourtLabel(e.target.value)}
              />
              <button
                type="button"
                onClick={handleAddCourt}
                className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm"
              >
                Add court
              </button>
            </div>
          )}
        </div>

        {event.courts.length === 0 ? (
          <p className="text-slate-500 text-sm">
            {host
              ? "Add a court — add players from the sidebar, then confirm matches."
              : "Waiting for the host to start courts."}
          </p>
        ) : (
          <div className="grid xl:grid-cols-2 gap-6">
            {event.courts.map((court) => (
              <LiveCourtCard
                key={court.id}
                court={court}
                eventId={eventId}
                host={host && !isEnded}
                onReload={reload}
                onEventUpdate={(ev) => {
                  pauseAutoRefresh(120000);
                  applyEvent(ev);
                }}
                onPauseAutoRefresh={pauseAutoRefresh}
                onReviewPending={
                  host && !isEnded && court.status === "pending"
                    ? () => {
                        setReviewCourtId(court.id);
                        setDismissedProposalKey(null);
                        setPendingModalOpen(true);
                      }
                    : undefined
                }
                onRemoveCourt={
                  host && !isEnded && event.courts.length > 1
                    ? handleRemoveCourt
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <OpenPlayLeaderboard
        eventId={eventId}
        currentPlayerId={null}
        title="Open play leaders (this event)"
      />

      <MatchHistory history={event.matchHistory} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-cyan-400"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mt-2 break-words">{event.name}</h1>
          <p className="text-slate-400 mt-1">
            Open play · Host: {event.hostName ?? "—"}
            {host && (
              <span className="ml-2 text-cyan-400 text-sm">(You are the host)</span>
            )}
          </p>
          {host ? (
            <p className="text-xs text-slate-500 mt-2">
              You manage players, scoring, and court changes. Same level vs same
              level when possible; FIFO within each bracket.
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-2">
              Watch live matches, scores, and leaderboard. The host manages
              players and scoring — positions update when the host scores or
              switches ends.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isEnded && (
            <span className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300">
              Event ended
            </span>
          )}
          {!host && !isEnded && (
            <span className="text-sm px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400">
              Spectator
            </span>
          )}
          {host && !isEnded && (
            <button
              type="button"
              onClick={handleEndEvent}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-sm"
            >
              End event
            </button>
          )}
        </div>
      </div>

      {isEnded && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-4 text-sm text-slate-300">
          This open play session has ended
          {event.endedAt
            ? ` · ${new Date(event.endedAt).toLocaleString()}`
            : ""}
          . You can still view results, leaderboard, and history.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 min-w-0 max-w-full">
        {host && (
          <EventPlayersSidebar
            event={event}
            currentPlayerId={user?.email ?? ""}
            host={host}
            onSeedSamplePlayers={
              !isEnded
                ? async () => {
                    const { event: ev } = await seedSamplePlayers(eventId);
                    setEvent(ev);
                  }
                : undefined
            }
            onAddPlayer={
              !isEnded
                ? async (player) => {
                    pauseAutoRefresh(60000);
                    const ev = await hostAddWalkInPlayer(eventId, player);
                    setEvent(ev);
                  }
                : undefined
            }
            onRemovePlayer={
              !isEnded
                ? async (id) => {
                    const ev = await hostRemovePlayer(eventId, id);
                    setEvent(ev);
                  }
                : undefined
            }
          />
        )}
        {mainContent}
      </div>

      {host && !isEnded && modalCourt?.pendingMatch && (
        <PendingMatchModal
          event={event}
          court={modalCourt}
          open={pendingModalOpen}
          onClose={() => {
            setDismissedProposalKey(pendingProposalKey);
            setPendingModalOpen(false);
            setReviewCourtId(null);
          }}
          onConfirm={async ({ teamA, teamB, callPlayers }) => {
            const ev = await resolvePendingMatch(eventId, {
              courtId: modalCourt.id,
              action: "confirm",
              teamA,
              teamB,
              callPlayers,
            });
            setEvent(ev);
            setPendingModalOpen(false);
            setDismissedProposalKey(null);
            setReviewCourtId(null);
          }}
          onCancel={async () => {
            const ev = await resolvePendingMatch(eventId, {
              courtId: modalCourt.id,
              action: "cancel",
            });
            setEvent(ev);
            setPendingModalOpen(false);
            setDismissedProposalKey(null);
            setReviewCourtId(null);
          }}
        />
      )}
    </div>
  );
}
