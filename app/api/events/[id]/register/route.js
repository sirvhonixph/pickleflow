import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { processEventAutomation } from "@/lib/event-automation";
import { applyTournamentPlayerRegistration } from "@/lib/tournament-pairs";
import { applyOpenPlayRegistration } from "@/lib/open-play-registration";
import { assertRequestHost } from "@/lib/event-host";
import { removeHostRegistration } from "@/lib/event-registration-remove";

export async function POST(request, { params }) {  try {
    const player = await request.json();
    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const playerId = (player.playerId ?? player.email ?? "").trim();
    if (!playerId) {
      return NextResponse.json({ error: "Player id required" }, { status: 400 });
    }

    const isTournament = current.type === "tournament";

    const updated = await updateEventRecord(params.id, (event) => {
      if (event.status === "ended") {
        throw new Error("This event has ended. Registration is closed.");
      }

      if (isTournament) {
        return applyTournamentPlayerRegistration(event, player);
      }

      return applyOpenPlayRegistration(event, player);
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isTournament) {
      return NextResponse.json({ event: updated, newMatches: [] });
    }

    const { event, newMatches } = processEventAutomation(updated);
    const saved = await updateEventRecord(params.id, () => event);

    return NextResponse.json({ event: saved, newMatches });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Registration failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { playerId, hostId, registrationId } = await request.json();
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

    const updated = await updateEventRecord(params.id, (event) =>
      removeHostRegistration(event, playerId, { registrationId })
    );

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (updated.type === "tournament") {
      return NextResponse.json({ event: updated, newMatches: [] });
    }

    const { event, newMatches } = processEventAutomation(updated);
    const saved = await updateEventRecord(params.id, () => event);

    return NextResponse.json({ event: saved, newMatches });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Could not remove registration" },
      { status: 400 }
    );
  }
}
