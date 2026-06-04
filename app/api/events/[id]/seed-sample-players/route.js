import { NextResponse } from "next/server";
import { addSamplePlayersToEvent } from "@/lib/seed-sample-players";

export async function POST(_request, { params }) {
  try {
    const result = await addSamplePlayersToEvent(params.id);
    if (!result) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({
      event: result.event,
      added: result.added,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to add sample players" },
      { status: 500 }
    );
  }
}
