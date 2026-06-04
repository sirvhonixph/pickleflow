"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  fetchEvents,
  migrateLocalStorageEvents,
  registerForEvent,
  clearEndedEvents,
  deleteEndedEvent,
} from "@/lib/events";
import { getCurrentUser, getPlayerId, saveCurrentUser, clearCurrentUser } from "@/lib/session";
import { fetchRegisteredPlayer } from "@/lib/players";
import { categoryLabel } from "@/lib/categories";
import { isValidCategory } from "@/lib/player-category";
import { fetchPlayerStats } from "@/lib/stats";
import { fetchPlayerProfile, updateMyProfile } from "@/lib/players";
import MessagesNavLink from "@/components/MessagesNavLink";
import TrophyBadge from "@/components/TrophyBadge";
import RegistrationCountdown from "@/components/RegistrationCountdown";
import TournamentRegisterModal from "@/components/TournamentRegisterModal";
import OpenPlayRegisterModal from "@/components/OpenPlayRegisterModal";
import { isRegistrationClosed } from "@/lib/tournament-registration";
import { isPlayerRegistered, canPlayerRegisterForTournament, getTournamentRegistrationCount, tournamentRegistrationLimitLabel } from "@/lib/registration-status";
import GlobalLiveChat from "@/components/GlobalLiveChat";

function formatEventDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function eventTypeLabel(type) {
  return type === "tournament" ? "Tournament" : "Open play";
}

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState(null);
  const [registerError, setRegisterError] = useState(null);
  const [registerModalEvent, setRegisterModalEvent] = useState(null);
  const [openPlayModalEvent, setOpenPlayModalEvent] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [skillLevel, setSkillLevel] = useState("");
  const [clearingHistory, setClearingHistory] = useState(false);
  const [removingEventId, setRemovingEventId] = useState(null);
  const categoryBackfilled = useRef(false);

  const load = useCallback(async () => {
    try {
      await migrateLocalStorageEvents();
      const list = await fetchEvents();
      setEvents(list);
      const current = getCurrentUser();
      const pid = getPlayerId(current);
      if (pid) {
        try {
          await fetchRegisteredPlayer(pid);
        } catch {
          clearCurrentUser();
          router.replace("/login");
          return;
        }
      }
      setUser(current);
      if (pid) {
        try {
          const [s, profile] = await Promise.all([
            fetchPlayerStats(pid),
            fetchPlayerProfile(pid).catch(() => null),
          ]);
          setPlayerStats(s);
          const resolved =
            profile?.category ??
            profile?.player?.category ??
            (isValidCategory(current?.category) ? current.category : "");
          setSkillLevel(resolved);

          if (resolved) {
            const storeEmpty =
              profile?.player && !isValidCategory(profile.player.category);
            const sessionStale = current?.category !== resolved;
            if (sessionStale && current) {
              const next = { ...current, category: resolved };
              saveCurrentUser(next);
              setUser(next);
            }
            if (storeEmpty && !categoryBackfilled.current) {
              categoryBackfilled.current = true;
              updateMyProfile({ category: resolved }).catch(() => {
                categoryBackfilled.current = false;
              });
            }
          }
        } catch {
          setPlayerStats(null);
          setSkillLevel(isValidCategory(current?.category) ? current.category : "");
        }
      } else {
        setPlayerStats(null);
        setSkillLevel("");
      }
    } catch (err) {
      setEvents([]);
      setRegisterError(err.message ?? "Could not load events");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const activeEvents = events
    .filter((e) => e.status !== "ended")
    .sort((a, b) => a.date.localeCompare(b.date));
  const endedEvents = events
    .filter((e) => e.status === "ended")
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

  const handleOpenPlayRegister = async (form) => {
    const current = getCurrentUser();
    if (!current?.email) {
      router.push("/login");
      return;
    }
    setRegisterError(null);
    setRegisteringId(openPlayModalEvent.id);
    try {
      await registerForEvent(openPlayModalEvent.id, current, form);
      setOpenPlayModalEvent(null);
      await load();
    } catch (err) {
      throw err;
    } finally {
      setRegisteringId(null);
    }
  };

  const isRegistered = (event) => {
    return isPlayerRegistered(event, getPlayerId(user));
  };

  const handleTournamentRegister = async (form) => {
    const current = getCurrentUser();
    if (!current?.email) {
      router.push("/login");
      return;
    }
    setRegisterError(null);
    setRegisteringId(registerModalEvent.id);
    try {
      await registerForEvent(registerModalEvent.id, current, form);
      setRegisterModalEvent(null);
      await load();
    } catch (err) {
      throw err;
    } finally {
      setRegisteringId(null);
    }
  };

  return (
    <AppShell>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">Welcome to PickleFlow</h1>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/players"
              className="px-4 py-2.5 bg-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-700"
            >
              Find players
            </Link>
            <MessagesNavLink className="px-4 py-2.5 bg-purple-500 rounded-lg text-sm font-semibold" />
            <Link
              href="/create-event"
              className="px-5 py-2.5 bg-cyan-500 text-black font-semibold rounded-lg hover:opacity-90 transition"
            >
              Create Event
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h2 className="text-slate-400 text-sm font-medium">Active events</h2>
            <p className="text-3xl font-bold mt-2">{activeEvents.length}</p>
            <p className="text-xs text-slate-500 mt-1">
              Shared for all players on this server
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h2 className="text-slate-400 text-sm font-medium">Skill level</h2>
            <p className="text-2xl font-bold mt-2">
              {skillLevel ? categoryLabel(skillLevel) : "—"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h2 className="text-slate-400 text-sm font-medium">Open play win %</h2>
            <p className="text-3xl font-bold mt-2 text-cyan-400">
              {playerStats?.stats &&
              playerStats.stats.wins + playerStats.stats.losses > 0
                ? `${playerStats.stats.winPct}%`
                : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {playerStats?.stats &&
              playerStats.stats.wins + playerStats.stats.losses > 0
                ? `${playerStats.stats.wins}W · ${playerStats.stats.losses}L · of decided games`
                : "Play matches to track stats"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col">
            <h2 className="text-slate-400 text-sm font-medium">Leaderboard</h2>
            <div className="mt-2 flex items-center gap-3">
              {playerStats?.isTopThree ? (
                <TrophyBadge rank={playerStats.rank} />
              ) : (
                <p className="text-3xl font-bold">
                  {playerStats?.rank ? `#${playerStats.rank}` : "—"}
                </p>
              )}
            </div>
            <Link
              href="/profile"
              className="text-xs text-cyan-400 mt-auto pt-2 hover:underline"
            >
              Profile & full history →
            </Link>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-bold mb-5">Upcoming Events</h2>

          {registerError && (
            <p className="mb-4 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm text-red-300">
              {registerError}
            </p>
          )}

          {loading ? (
            <p className="text-slate-500">Loading events…</p>
          ) : activeEvents.length === 0 && endedEvents.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-xl text-center">
              <p className="text-slate-400">
                No upcoming events yet. When someone creates an event, it will
                appear here for every player.
              </p>
              <Link
                href="/create-event"
                className="inline-block mt-6 px-5 py-2.5 bg-cyan-500 text-black font-semibold rounded-lg hover:opacity-90 transition"
              >
                Create Event
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {activeEvents.map((event) => {
                const registered = isRegistered(event);
                const isHost = event.hostId === getPlayerId(user);
                const playerId = getPlayerId(user);
                const registrationClosed =
                  event.type === "tournament" && isRegistrationClosed(event);
                const pairCount = event.pairRegistrations?.length ?? 0;
                const tournamentEntryCount =
                  event.type === "tournament"
                    ? getTournamentRegistrationCount(event, playerId)
                    : 0;
                const tournamentCanRegister =
                  event.type === "tournament" &&
                  canPlayerRegisterForTournament(event, playerId, user?.name);

                return (
                  <li
                    key={event.id}
                    className="bg-slate-900 border border-slate-800 p-6 rounded-xl"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-xl font-semibold">{event.name}</h3>
                      <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-slate-800 text-cyan-400">
                        {eventTypeLabel(event.type)}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-2">
                      {formatEventDate(event.date)}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      {event.type === "tournament" ? (
                        <>
                          {pairCount} pair{pairCount === 1 ? "" : "s"} registered
                        </>
                      ) : (
                        <>
                          Host: {event.hostName ?? "—"} ·{" "}
                          {event.registrations?.length ?? 0} registered
                        </>
                      )}
                    </p>
                    {event.type === "tournament" && (
                      <RegistrationCountdown
                        event={event}
                        className="text-slate-500 text-sm mt-1"
                      />
                    )}
                    {event.description ? (
                      <p className="text-slate-500 text-sm mt-2">
                        {event.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-3 mt-4">
                      {(event.type === "open_play" ||
                        event.type === "tournament") && (
                        <Link
                          href={`/events/${event.id}`}
                          className="px-4 py-2 bg-cyan-500 text-black rounded-lg text-sm font-semibold hover:opacity-90"
                        >
                          {event.type === "tournament"
                            ? "View tournament"
                            : registered || isHost
                              ? "Open event"
                              : "Watch live"}
                        </Link>
                      )}
                      {!registered && !isHost && event.type === "open_play" && (
                        <button
                          type="button"
                          disabled={registeringId === event.id}
                          onClick={() => {
                            setRegisterError(null);
                            setOpenPlayModalEvent(event);
                          }}
                          className="px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                          {registeringId === event.id
                            ? "Registering…"
                            : "Register to play"}
                        </button>
                      )}
                      {!isHost &&
                        event.type === "tournament" &&
                        tournamentCanRegister && (
                        <button
                          type="button"
                          disabled={
                            registeringId === event.id || registrationClosed
                          }
                          onClick={() => {
                            setRegisterError(null);
                            setRegisterModalEvent(event);
                          }}
                          className="px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                          {registeringId === event.id
                            ? "Registering…"
                            : registrationClosed
                              ? "Registration closed"
                              : registered
                                ? "Register another entry"
                                : "Register"}
                        </button>
                      )}
                      {isHost && (
                        <span className="px-3 py-2 text-sm text-green-400 border border-green-500/30 rounded-lg">
                          You are the host
                        </span>
                      )}
                      {!isHost && registered && event.type === "tournament" && (
                        <span className="px-3 py-2 text-sm text-green-400 border border-green-500/30 rounded-lg">
                          Registered ({tournamentEntryCount}/
                          {tournamentRegistrationLimitLabel()})
                        </span>
                      )}
                      {!isHost && registered && event.type === "open_play" && (
                        <span className="px-3 py-2 text-sm text-green-400 border border-green-500/30 rounded-lg">
                          Registered to play
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className={`mt-10 grid gap-6 ${
            endedEvents.length > 0 ? "lg:grid-cols-2" : ""
          }`}
        >
          {endedEvents.length > 0 && (
            <div className="flex flex-col min-h-[320px]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold text-slate-500">
                  Ended events
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    ({endedEvents.length})
                  </span>
                </h2>
                {user && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={clearingHistory}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Remove all ${endedEvents.length} ended event${endedEvents.length === 1 ? "" : "s"} from history? This cannot be undone.`
                          )
                        ) {
                          return;
                        }
                        setClearingHistory(true);
                        try {
                          const list = await clearEndedEvents({ scope: "all" });
                          setEvents(list);
                        } catch (err) {
                          alert(err.message ?? "Could not clear history");
                        } finally {
                          setClearingHistory(false);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50"
                    >
                      {clearingHistory ? "Clearing…" : "Clear history"}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-800/80 bg-slate-950/30 pr-1">
                <ul className="divide-y divide-slate-800/80">
                  {endedEvents.map((event) => {
                    const registered = isRegistered(event);
                    const isHost = event.hostId === getPlayerId(user);

                    return (
                      <li
                        key={event.id}
                        className="px-4 py-3 hover:bg-slate-900/40 transition"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-300 truncate">
                                {event.name}
                              </h3>
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                                {event.type === "tournament"
                                  ? "Tournament"
                                  : "Open play"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {formatEventDate(event.date)}
                              {event.endedAt
                                ? ` · Ended ${new Date(event.endedAt).toLocaleDateString()}`
                                : ""}
                              {event.type === "tournament"
                                ? ` · ${event.pairRegistrations?.length ?? 0} pairs`
                                : ` · ${event.registrations?.length ?? 0} players`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {(registered || isHost) && (
                              <span className="px-2 py-1 text-xs text-slate-500 border border-slate-700 rounded-md">
                                {isHost ? "Hosted" : "Played"}
                              </span>
                            )}
                            <Link
                              href={`/events/${event.id}`}
                              className="px-2.5 py-1 bg-slate-800 rounded-md text-xs font-semibold hover:bg-slate-700"
                            >
                              Results
                            </Link>
                            {isHost && (
                              <button
                                type="button"
                                disabled={removingEventId === event.id}
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Remove "${event.name}" from ended history? This cannot be undone.`
                                    )
                                  ) {
                                    return;
                                  }
                                  setRemovingEventId(event.id);
                                  try {
                                    await deleteEndedEvent(event.id);
                                    setEvents((prev) =>
                                      prev.filter((e) => e.id !== event.id)
                                    );
                                  } catch (err) {
                                    alert(err.message ?? "Could not remove event");
                                  } finally {
                                    setRemovingEventId(null);
                                  }
                                }}
                                className="px-2.5 py-1 text-xs rounded-md border border-slate-700 text-slate-500 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50"
                              >
                                {removingEventId === event.id ? "…" : "Remove"}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          <GlobalLiveChat compact />
        </section>

        <TournamentRegisterModal
          event={registerModalEvent}
          user={user}
          open={!!registerModalEvent}
          onClose={() => setRegisterModalEvent(null)}
          onSubmit={handleTournamentRegister}
          busy={!!registeringId}
        />
        <OpenPlayRegisterModal
          event={openPlayModalEvent}
          user={user}
          open={!!openPlayModalEvent}
          onClose={() => setOpenPlayModalEvent(null)}
          onSubmit={handleOpenPlayRegister}
          busy={!!registeringId}
        />
    </AppShell>
  );
}
