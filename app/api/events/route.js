import { NextResponse } from "next/server";
import { getAllEvents, saveEventRecord } from "@/lib/store-server";
import { normalizeEvent } from "@/lib/event-normalize";

export async function GET() {
  try {
    const events = await getAllEvents();
    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/events failed:", e);
    return NextResponse.json(
      {
        error:
          e.message ??
          "Could not load events. Check Vercel Blob storage and redeploy.",
        events: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const record = normalizeEvent({
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      registrations: body.registrations ?? [],
      courts: [],
      liveStreamUrl: "",
      liveStreamEnabled: false,
      ...body,
    });
    const saved = await saveEventRecord(record);
    return NextResponse.json({ event: saved }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to create event" },
      { status: 500 }
    );
  }
}
