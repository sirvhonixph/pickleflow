import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import { startDivisionQuarterfinals } from "@/lib/tournament-setup";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const { divisionId, hostId } = body;
    if (!divisionId) {
      return NextResponse.json({ error: "divisionId required" }, { status: 400 });
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
      startDivisionQuarterfinals(event, divisionId)
    );
    return NextResponse.json({ event: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Could not start quarterfinals" },
      { status: 400 }
    );
  }
}
