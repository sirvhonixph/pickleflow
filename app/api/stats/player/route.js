import { NextResponse } from "next/server";
import { getAllEvents } from "@/lib/store-server";
import {
  collectOpenPlayHistory,
  getPlayerStatsSummary,
} from "@/lib/player-stats";
import { resolvePlayerDisplayName } from "@/lib/display-name";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = (searchParams.get("playerId") ?? "").trim();
    const eventId = searchParams.get("eventId") || null;

    if (!playerId) {
      return NextResponse.json(
        { error: "playerId required" },
        { status: 400 }
      );
    }

    const events = await getAllEvents();
    const entries = collectOpenPlayHistory(events, eventId);
    const summary = getPlayerStatsSummary(entries, playerId);
    const displayName =
      resolvePlayerDisplayName({
        playerId,
        userName: null,
        storeName: null,
        historyEntries: summary.history,
      }) ?? playerId;

    return NextResponse.json({
      playerId,
      eventId,
      displayName,
      stats: summary.stats,
      rank: summary.rank,
      isTopThree: summary.isTopThree,
      history: summary.history,
      leaderboardTop: summary.leaderboard.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Player stats failed" },
      { status: 500 }
    );
  }
}
