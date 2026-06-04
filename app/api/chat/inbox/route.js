import { NextResponse } from "next/server";
import { getMessageInbox } from "@/lib/store-server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = (searchParams.get("playerId") ?? "").trim().toLowerCase();

  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const threads = await getMessageInbox(playerId);
  return NextResponse.json({ threads });
}
