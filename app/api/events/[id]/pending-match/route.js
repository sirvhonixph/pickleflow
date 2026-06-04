import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import {
  confirmPendingMatch,
  cancelPendingMatch,
} from "@/lib/court-pending";
import { processEventAutomation } from "@/lib/event-automation";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const { courtId, action, teamA, teamB, callPlayers, hostId } = body;

    if (!courtId) {
      return NextResponse.json({ error: "courtId required" }, { status: 400 });
    }

    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      assertRequestHost(hostId, current);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (current.status === "ended") {
      return NextResponse.json(
        { error: "This event has ended." },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      const { event } = cancelPendingMatch(current, courtId);
      const { event: processed } = processEventAutomation(event);
      const saved = await updateEventRecord(params.id, () => processed);
      return NextResponse.json({ event: saved, newMatches: [] });
    }

    if (action !== "confirm") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { event, newMatches } = confirmPendingMatch(
      current,
      courtId,
      teamA,
      teamB
    );
    let saved = await updateEventRecord(params.id, () => event);

    const { event: processed, newMatches: more } = processEventAutomation(saved);
    saved = await updateEventRecord(params.id, () => processed);

    const announce = newMatches.map((m) => ({
      ...m,
      aiAnnounce: callPlayers !== false && m.aiAnnounce,
    }));

    return NextResponse.json({
      event: saved,
      newMatches: [...announce, ...(more ?? [])],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Pending match action failed" },
      { status: 400 }
    );
  }
}
