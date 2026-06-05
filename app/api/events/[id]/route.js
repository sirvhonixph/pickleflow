import { NextResponse } from "next/server";
import {
  getEventById,
  updateEventRecord,
  deleteEventRecord,
} from "@/lib/store-server";
import {
  assertRequestHost,
  courtsPayloadChanged,
  stripActingHostId,
  streamPayloadChanged,
  tournamentPayloadChanged,
} from "@/lib/event-host";

export async function GET(_request, { params }) {
  const event = await getEventById(params.id);
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ event });
}
export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const { _actingHostId } = body;
    const patch = stripActingHostId(body);

    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const merged = { ...current, ...patch };
    const hostOnlyChange =
      courtsPayloadChanged(current, merged) ||
      tournamentPayloadChanged(current, merged) ||
      streamPayloadChanged(current, merged) ||
      JSON.stringify(current.paymentConfig ?? {}) !==
        JSON.stringify(merged.paymentConfig ?? {}) ||
      JSON.stringify(current.registrations ?? []) !==
        JSON.stringify(merged.registrations ?? []) ||
      JSON.stringify(current.matchHistory ?? []) !==
        JSON.stringify(merged.matchHistory ?? []);

    if (hostOnlyChange) {
      try {
        assertRequestHost(_actingHostId, current);
      } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
    }

    const updated = await updateEventRecord(params.id, () => merged);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ event: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { hostId } = body;

    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    assertRequestHost(hostId, current);

    if (current.status !== "ended") {
      return NextResponse.json(
        { error: "Only ended events can be removed from history." },
        { status: 400 }
      );
    }

    await deleteEventRecord(params.id, { requireEnded: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e.message ?? "Delete failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
