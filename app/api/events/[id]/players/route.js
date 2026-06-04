import { NextResponse } from "next/server";
import { getEventById, updateEventRecord, upsertPlayer } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import { processEventAutomation } from "@/lib/event-automation";
import {
  addWalkInPlayer,
  removePlayerFromEvent,
} from "@/lib/event-players";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      assertRequestHost(body.hostId, current);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    const updated = await updateEventRecord(params.id, (event) => {
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }
      return addWalkInPlayer(event, body);
    });
    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const reg = updated.registrations[updated.registrations.length - 1];
    if (reg) {
      await upsertPlayer({
        email: reg.email,
        name: reg.name,
        category: reg.category,
        registeredAt: reg.joinedAt,
      });
    }

    const { event, newMatches } = processEventAutomation(updated);
    const saved = await updateEventRecord(params.id, () => event);

    return NextResponse.json({ event: saved, newMatches });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to add player" },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { playerId, hostId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
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

    const updated = await updateEventRecord(params.id, (event) => {
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }
      return removePlayerFromEvent(event, playerId);
    });
    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { event } = processEventAutomation(updated);
    const saved = await updateEventRecord(params.id, () => event);

    return NextResponse.json({ event: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to remove player" },
      { status: 400 }
    );
  }
}
