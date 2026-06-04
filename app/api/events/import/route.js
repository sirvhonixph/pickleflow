import { NextResponse } from "next/server";
import { importEvents } from "@/lib/store-server";

export async function POST(request) {
  try {
    const { events } = await request.json();
    const list = await importEvents(Array.isArray(events) ? events : []);
    return NextResponse.json({ events: list });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Import failed" },
      { status: 500 }
    );
  }
}
