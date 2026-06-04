import { NextResponse } from "next/server";
import { addDirectMessage, getDirectMessages } from "@/lib/store-server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = (searchParams.get("playerId") ?? "").trim().toLowerCase();
  const withPlayer = (searchParams.get("with") ?? "").trim().toLowerCase();

  if (!playerId || !withPlayer) {
    return NextResponse.json(
      { error: "playerId and with required" },
      { status: 400 }
    );
  }

  const messages = await getDirectMessages(playerId, withPlayer);
  return NextResponse.json({ messages });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const message = await addDirectMessage(body);
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Could not send message" },
      { status: 400 }
    );
  }
}
