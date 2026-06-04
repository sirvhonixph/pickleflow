import { NextResponse } from "next/server";
import { resolvePlayerDisplayName } from "@/lib/display-name";
import { resolvePlayerCategory } from "@/lib/player-category";
import { getAllEvents, getPlayerByEmail } from "@/lib/store-server";
import {
  collectOpenPlayHistory,
  getPlayerStatsSummary,
} from "@/lib/player-stats";

export async function GET(_request, { params }) {
  try {
    const playerId = decodeURIComponent(params.id).trim().toLowerCase();
    if (!playerId) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const player = await getPlayerByEmail(playerId);
    const events = await getAllEvents();
    const entries = collectOpenPlayHistory(events);
    const summary = getPlayerStatsSummary(entries, playerId);
    const displayName =
      resolvePlayerDisplayName({
        playerId,
        userName: null,
        storeName: player?.name,
        historyEntries: summary.history,
      }) ?? player?.name ?? playerId;

    const category =
      resolvePlayerCategory({
        playerId,
        userCategory: null,
        storeCategory: player?.category,
        events,
      }) ?? "";

    return NextResponse.json({
      player: {
        ...(player ?? {
          email: playerId,
          name: playerId,
          category: "",
          dupr: "",
          avatarDataUrl: "",
        }),
        name: displayName,
        category,
      },
      displayName,
      category,
      stats: summary.stats,
      rank: summary.rank,
      isTopThree: summary.isTopThree,
      history: summary.history.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to load profile" },
      { status: 500 }
    );
  }
}
