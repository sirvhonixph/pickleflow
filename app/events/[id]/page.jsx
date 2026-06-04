"use client";

import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import OpenPlayEvent from "@/components/OpenPlayEvent";
import TournamentEvent from "@/components/TournamentEvent";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import { fetchEventById, migrateLocalStorageEvents } from "@/lib/events";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function EventPage() {
  const params = useParams();
  const id = params?.id;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        await migrateLocalStorageEvents();
        const ev = await fetchEventById(id);
        if (!cancelled) {
          setEvent(ev);
          setLoadError(ev ? null : "Event not found");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message ?? "Failed to load event");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOpenPlay = event?.type === "open_play";

  return (
    <AppShell>
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : loadError ? (
          <p className="text-red-400">
            {loadError}.{" "}
            <Link href="/dashboard" className="text-cyan-400">
              Back to dashboard
            </Link>
          </p>
        ) : !event ? (
          <p className="text-slate-400">
            Event not found.{" "}
            <Link href="/dashboard" className="text-cyan-400">
              Back to dashboard
            </Link>
          </p>
        ) : isOpenPlay ? (
          <ClientErrorBoundary>
            <OpenPlayEvent eventId={event.id} />
          </ClientErrorBoundary>
        ) : (
          <ClientErrorBoundary>
            <TournamentEvent eventId={event.id} initialEvent={event} />
          </ClientErrorBoundary>
        )}
    </AppShell>
  );
}
