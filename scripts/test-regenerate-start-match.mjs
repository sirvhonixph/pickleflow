/**
 * After regenerate, stale pre-reset rows must not return when starting match 1.
 */
import { mergeEventSnapshots } from "../lib/event-merge.js";
import {
  regenerateDivisionSetup,
  updateTournamentMatch,
} from "../lib/tournament-setup.js";
import {
  stabilizeBracketMatches,
  roundRobinPairKey,
} from "../lib/tournament-brackets.js";
import { isMatchLive } from "../lib/tournament-live.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";

const p1 = "pair-1";
const p2 = "pair-2";
const p3 = "pair-3";
const p4 = "pair-4";
const p5 = "pair-5";
const divId = "novice_mens_doubles";

const dirtyEvent = {
  type: "tournament",
  tournamentPhase: "pool_play",
  hostId: "host@test.com",
  courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
  pairRegistrations: [p1, p2, p3, p4, p5].map((id) => ({
    id,
    divisionId: divId,
    player1: { playerId: `${id}-a` },
    player2: { playerId: `${id}-b` },
  })),
  tournamentDivisions: {
    [divId]: {
      scheduleResetAt: 1000,
      brackets: [
        {
          id: "bracket-1",
          courtId: "court-1",
          pairIds: [p1, p2, p3, p4, p5],
          confirmedResults: {
            [roundRobinPairKey({ pairAId: p1, pairBId: p2 })]: {
              id: "rr-1",
              pairAId: p1,
              pairBId: p2,
              scheduleOrder: 1,
              status: "completed",
              scoreA: 11,
              scoreB: 10,
              winnerPairId: p1,
              resultLocked: true,
              lockedAt: 5000,
              playedAt: 5000,
            },
          },
          matches: [
            {
              id: "rr-1",
              pairAId: p1,
              pairBId: p2,
              scheduleOrder: 1,
              status: "completed",
              scoreA: 11,
              scoreB: 10,
              winnerPairId: p1,
              resultLocked: true,
              scheduleGeneration: 1000,
            },
            {
              id: "rr-3",
              pairAId: p2,
              pairBId: p5,
              scheduleOrder: 3,
              status: "live",
              scoreA: 0,
              scoreB: 0,
              startedAt: 6000,
              scheduleGeneration: 1000,
            },
          ],
        },
      ],
    },
  },
};

let regenerated = regenerateDivisionSetup(dirtyEvent, divId, { force: true });
const resetAt = regenerated.tournamentDivisions[divId].scheduleResetAt;

const staleClient = {
  ...dirtyEvent,
  tournamentDivisions: {
    [divId]: {
      ...dirtyEvent.tournamentDivisions[divId],
      scheduleResetAt: resetAt,
    },
  },
};

regenerated = mergeEventSnapshots(staleClient, regenerated);

const bracket = regenerated.tournamentDivisions[divId].brackets[0];
const match1 = bracket.matches.find((m) => m.scheduleOrder === 1);

let event = updateTournamentMatch(
  regenerated,
  divId,
  "bracket-1",
  match1.id,
  { status: "live", scoreA: 0, scoreB: 0 }
);

event = mergeEventSnapshots(staleClient, event);

const view = stabilizeBracketMatches(
  event.tournamentDivisions[divId].brackets[0],
  { scheduleResetAt: resetAt }
).matches;

const m1 = view.find((m) => m.scheduleOrder === 1);
const m3 = view.find((m) => m.scheduleOrder === 3);
const liveCount = view.filter((m) => isMatchLive(m)).length;

let failed = 0;
function assert(name, ok, detail = "") {
  if (!ok) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

assert("regenerate clears confirmed", Object.keys(bracket.confirmedResults ?? {}).length === 0);
assert("match 1 not locked after start", !isRoundRobinMatchLocked(m1), m1?.status);
assert("match 1 is live after start", isMatchLive(m1), m1?.status);
assert("match 1 score still zero", (m1?.scoreA ?? 0) === 0 && (m1?.scoreB ?? 0) === 0);
assert("match 3 not live", !isMatchLive(m3), m3?.status);
assert("only one live match", liveCount === 1, String(liveCount));

console.log(
  failed ? `\n${failed} REGENERATE START TEST(S) FAILED` : "\nALL REGENERATE START TESTS PASSED"
);
process.exit(failed ? 1 : 0);
