import { NextResponse } from "next/server";
import { updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import {
  addCourtToEvent,
  assertCanRemoveOpenPlayCourt,
  assertCanRemoveTournamentCourt,
} from "@/lib/tournament-courts";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const { label, hostId } = body;

    const saved = await updateEventRecord(params.id, (event) => {
      assertRequestHost(hostId, event);
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }
      return addCourtToEvent(event, label);
    });

    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ event: saved });
  } catch (e) {
    const message = e.message ?? "Add court failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const body = await request.json();
    const { courtId, hostId } = body;

    if (!courtId) {
      return NextResponse.json({ error: "courtId required" }, { status: 400 });
    }

    const saved = await updateEventRecord(params.id, (event) => {
      assertRequestHost(hostId, event);
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }
      if (event.type === "tournament") {
        assertCanRemoveTournamentCourt(event, courtId);
      } else {
        assertCanRemoveOpenPlayCourt(event, courtId);
      }
      return {
        ...event,
        courts: (event.courts ?? []).filter((c) => c.id !== courtId),
      };
    });

    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ event: saved });
  } catch (e) {
    const message = e.message ?? "Remove court failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

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

    const saved = await updateEventRecord(params.id, (event) => {
      assertRequestHost(hostId, event);
      if (event.status === "ended") {
        throw new Error("This event has ended.");
      }

      return {
        ...event,
        courts: (event.courts ?? []).map((c) =>
          c.id === courtId ? { ...c, ...patch } : c
        ),
      };
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
