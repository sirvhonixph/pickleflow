import { NextResponse } from "next/server";
import { updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const { courtId, patch, hostId } = body;

    if (!courtId || !patch || typeof patch !== "object") {
      return NextResponse.json(
        { error: "courtId and patch required" },
        { status: 400 }
      );
    }

    const saved = await updateEventRecord(
      params.id,
      (event) => {
      assertRequestHost(hostId, event);
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }

      return {
        ...event,
        courts: event.courts.map((c) => {
          if (c.id !== courtId || !c.currentMatch) return c;
          return {
            ...c,
            currentMatch: { ...c.currentMatch, ...patch },
          };
        }),
      };
    },
      { refreshTournament: false }
    );

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
