import { NextResponse } from "next/server";
import { getEventById, updateEventRecord } from "@/lib/store-server";
import { assertRequestHost } from "@/lib/event-host";
import { updateTournamentMatch } from "@/lib/tournament-setup";

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const {
      divisionId,
      bracketId,
      matchId,
      roundId,
      scoreA,
      scoreB,
      status,
      hostId,
      teamA,
      teamB,
      basePlayerA,
      basePlayerB,
      sidesSwapped,
      winnerPairId,
      forfeitWinnerPairId,
    } = body;
    if (!divisionId || !bracketId || !matchId) {
      return NextResponse.json(
        { error: "divisionId, bracketId, and matchId required" },
        { status: 400 }
      );
    }

    const current = await getEventById(params.id, { refresh: false });
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      assertRequestHost(hostId, current);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    const fastLiveSave = status === "live";
    const updated = await updateEventRecord(
      params.id,
      (event) =>
        updateTournamentMatch(event, divisionId, bracketId, matchId, {
          scoreA,
          scoreB,
          status,
          teamA,
          teamB,
          basePlayerA,
          basePlayerB,
          sidesSwapped,
          winnerPairId,
          forfeitWinnerPairId,
        }, { roundId }),
      { refreshTournament: !fastLiveSave }
    );
    return NextResponse.json({ event: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Match update failed" },
      { status: 400 }
    );
  }
}
