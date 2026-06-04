import { NextResponse } from "next/server";
import { updateEventRecord } from "@/lib/store-server";
import { processEventAutomation } from "@/lib/event-automation";

export async function POST(_request, { params }) {
  try {
    const saved = await updateEventRecord(params.id, (current) => {
      if (!current) return current;
      const { event } = processEventAutomation(current);
      return event;
    });

    if (!saved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ event: saved, newMatches: [] });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Process failed" },
      { status: 500 }
    );
  }
}
