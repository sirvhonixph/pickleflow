import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { addPairRegistration, updatePairRegistration, updatePairBasePlayer } from "@/lib/tournament-pairs";
import { isRegistrationClosed } from "@/lib/tournament-registration";
import { assertRequestHost } from "@/lib/event-host";

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const { pairId, hostId, player1Name, player2Name, teamName, basePlayerId } = body;

    if (!pairId) {
      return NextResponse.json({ error: "pairId required" }, { status: 400 });
    }

    const saved = await updateEventRecord(params.id, (event) => {
      assertRequestHost(hostId, event);
      if (event.type !== "tournament") {
        throw new Error("Not a tournament event.");
      }

      let next = event;
      if (basePlayerId != null && basePlayerId !== "") {
        next = updatePairBasePlayer(next, pairId, basePlayerId);
      }
      if (player1Name != null || player2Name != null || teamName != null) {
        if (!player1Name?.trim() || !player2Name?.trim()) {
          if (basePlayerId == null || basePlayerId === "") {
            throw new Error("Both player names are required.");
          }
        } else {
          next = updatePairRegistration(next, pairId, {
            player1Name,
            player2Name,
            teamName,
          });
        }
      }
      if (basePlayerId == null && player1Name == null && player2Name == null && teamName == null) {
        throw new Error("Nothing to update.");
      }
      return next;
    });

    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ event: saved });
  } catch (e) {
    const message = e.message ?? "Update failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (body.hostId !== current.hostId) {
      return NextResponse.json(
        { error: "Only the host can register pairs." },
        { status: 403 }
      );
    }
    if (current.type !== "tournament") {
      return NextResponse.json({ error: "Not a tournament" }, { status: 400 });
    }
    if (current.status === "ended") {
      return NextResponse.json(
        { error: "Tournament has ended." },
        { status: 400 }
      );
    }
    if (current.tournamentPhase === "pool_play") {
      return NextResponse.json(
        { error: "Registration closed — tournament in progress." },
        { status: 400 }
      );
    }
    if (current.tournamentPhase === "knockout") {
      return NextResponse.json(
        { error: "Registration closed — tournament in progress." },
        { status: 400 }
      );
    }
    if (isRegistrationClosed(current)) {
      return NextResponse.json(
        { error: "Registration is closed." },
        { status: 400 }
      );
    }
    if (current.tournamentDivisions?.[body.divisionId]) {
      return NextResponse.json(
        { error: "Brackets already set for this division." },
        { status: 400 }
      );
    }

    const updated = await updateEventRecord(params.id, (event) =>
      addPairRegistration(event, body)
    );

    return NextResponse.json({ event: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Pair registration failed" },
      { status: 400 }
    );
  }
}
