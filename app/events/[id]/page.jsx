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
          <div className="space-y-2 max-w-lg">
            <p className="text-red-400">{loadError}</p>
            {(loadError === "Not found" || loadError === "Event not found") && (
              <p className="text-sm text-slate-400">
                Your tournament file may still be on this computer under{" "}
                <code className="text-slate-300">data/events/{id}.json</code>.
                Run <code className="text-slate-300">npm run dev</code> locally,
                or redeploy to Vercel with that file committed.
              </p>
            )}
            <Link href="/dashboard" className="text-cyan-400 text-sm">
              Back to dashboard
            </Link>
          </div>
        ) : !event ? (
          <div className="space-y-2 max-w-lg">
            <p className="text-slate-400">Event not found.</p>
            <p className="text-sm text-slate-500">
              Check the dashboard for the correct event link, or run{" "}
              <code className="text-slate-300">npm run dev</code> if testing locally.
            </p>
            <Link href="/dashboard" className="text-cyan-400 text-sm">
              Back to dashboard
            </Link>
          </div>
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
