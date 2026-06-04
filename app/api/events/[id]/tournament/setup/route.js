import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import {
  applyDivisionSetup,
  applyAllDivisionSetups,
  regenerateDivisionSetup,
} from "@/lib/tournament-setup";
import { assertRequestHost } from "@/lib/event-host";

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { divisionId, all, regenerate, force, hostId } = body;

    const current = await getEventById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (current.type !== "tournament") {
      return NextResponse.json({ error: "Not a tournament" }, { status: 400 });
    }
    assertRequestHost(hostId, current);
    if ((current.courts?.length ?? 0) < 1) {
      return NextResponse.json(
        { error: "Add courts before running the bracket calculator." },
        { status: 400 }
      );
    }

    const updated = await updateEventRecord(params.id, (event) => {
      if (all) {
        return applyAllDivisionSetups(event, { regenerate: !!regenerate, force: !!force });
      }
      if (!divisionId) {
        throw new Error("divisionId required (or set all: true).");
      }
      if (regenerate) {
        return regenerateDivisionSetup(event, divisionId, { force: !!force });
      }
      return applyDivisionSetup(event, divisionId);
    });

    return NextResponse.json({ event: updated });
  } catch (e) {
    const message = e.message ?? "Bracket setup failed";
    const status = message.includes("host") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
