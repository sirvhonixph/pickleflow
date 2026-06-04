import { NextResponse } from "next/server";
import { getAllEvents } from "@/lib/store-server";
import {
  collectOpenPlayHistory,
  computePlayerStats,
  buildLeaderboard,
} from "@/lib/player-stats";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || null;

    const events = await getAllEvents();
    const entries = collectOpenPlayHistory(events, eventId);
    const stats = computePlayerStats(entries);
    const leaderboard = buildLeaderboard(stats);

    return NextResponse.json({
      eventId,
      leaderboard,
      totalMatches: entries.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Leaderboard failed" },
      { status: 500 }
    );
  }
}
