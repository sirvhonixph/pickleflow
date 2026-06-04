import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { endEntireEvent } from "@/lib/end-event";

export async function POST(_request, { params }) {
  try {
    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (current.status === "ended") {
      return NextResponse.json({ event: current });
    }

    let ended = endEntireEvent(current);
    if (current.type === "tournament") {
      ended = {
        ...ended,
        tournamentPhase: "ended",
      };
    }
    const saved = await updateEventRecord(params.id, () => ended);

    return NextResponse.json({ event: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Could not end event" },
      { status: 500 }
    );
  }
}
