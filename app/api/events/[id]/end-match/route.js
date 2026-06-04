import { NextResponse } from "next/server";
import { updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import { buildHistoryEntry } from "@/lib/match-history";
import { processEventAutomation } from "@/lib/event-automation";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const courtId = body.courtId;
    const hostId = body.hostId;

    if (!courtId) {
      return NextResponse.json({ error: "courtId required" }, { status: 400 });
    }

    const saved = await updateEventRecord(params.id, (event) => {
      assertRequestHost(hostId, event);
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }

      const court = event.courts?.find((c) => c.id === courtId);
      if (!court?.currentMatch || court.status !== "live") {
        const { event: processed } = processEventAutomation(event);
        return processed;
      }

      const historyEntry = buildHistoryEntry(court, court.currentMatch);
      const ended = {
        ...event,
        matchHistory: [historyEntry, ...(event.matchHistory ?? [])],
        courts: event.courts.map((c) =>
          c.id === courtId
            ? { ...c, status: "idle", currentMatch: null }
            : c
        ),
      };

      const { event: processed } = processEventAutomation(ended);
      return processed;
    });

    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ event: saved });
  } catch (e) {
    const message = e.message ?? "End match failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
