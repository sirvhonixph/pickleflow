import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import { syncActiveDivision } from "@/lib/tournament-division-schedule";

export async function PATCH(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { skill, order, hostId } = body;

    if (!skill || !Array.isArray(order) || order.length === 0) {
      return NextResponse.json(
        { error: "skill and order array are required." },
        { status: 400 }
      );
    }

    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (current.type !== "tournament") {
      return NextResponse.json({ error: "Not a tournament" }, { status: 400 });
    }
    assertRequestHost(hostId, current);

    const updated = await updateEventRecord(params.id, (event) =>
      syncActiveDivision({
        ...event,
        tierDivisionOrder: {
          ...(event.tierDivisionOrder ?? {}),
          [skill]: order,
        },
      })
    );

    return NextResponse.json({ event: updated });
  } catch (e) {
    const message = e.message ?? "Could not save division order";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status: status });
  }
}
