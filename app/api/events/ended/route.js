import { NextResponse } from "next/server";
import { deleteEndedEvents } from "@/lib/store-server";

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { actorId, scope } = body;

    if (!actorId?.trim()) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const hostId = scope === "mine" ? actorId.trim() : undefined;
    const { removed, events } = await deleteEndedEvents({ hostId });

    return NextResponse.json({
      removed: removed.length,
      events,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Clear failed" },
      { status: 400 }
    );
  }
}
