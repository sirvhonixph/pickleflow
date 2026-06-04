import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { addDivisionToEvent, buildDivisionId } from "@/lib/tournament-divisions";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (current.type !== "tournament") {
      return NextResponse.json({ error: "Not a tournament" }, { status: 400 });
    }
    if (body.hostId !== current.hostId) {
      return NextResponse.json(
        { error: "Only the host can add divisions." },
        { status: 403 }
      );
    }
    if (current.status === "ended") {
      return NextResponse.json({ error: "Tournament ended." }, { status: 400 });
    }
    if (current.tournamentPhase === "pool_play") {
      return NextResponse.json(
        { error: "Cannot add divisions after tournament has started." },
        { status: 400 }
      );
    }

    const updated = await updateEventRecord(params.id, (event) => {
      const next = addDivisionToEvent(event, body);
      const newId = buildDivisionId(body.skill, body.format);
      const offered = next.offeredDivisionIds;
      if (
        Array.isArray(offered) &&
        offered.length > 0 &&
        !offered.includes(newId)
      ) {
        return { ...next, offeredDivisionIds: [...offered, newId] };
      }
      return next;
    });

    return NextResponse.json({ event: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to add division" },
      { status: 400 }
    );
  }
}
