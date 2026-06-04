import { NextResponse } from "next/server";
import { readStore, upsertPlayer, searchPlayers } from "@/lib/store-server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const players = await searchPlayers(q);
  return NextResponse.json({ players });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const player = await upsertPlayer(body);
    return NextResponse.json({ player });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to save player" },
      { status: 500 }
    );
  }
}
