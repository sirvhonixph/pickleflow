/**
 * Concurrent blob read during regenerate must not reattach locked/live rows.
 */
import { regenerateDivisionSetup } from "../lib/tournament-setup.js";
import {
  applyRegeneratedDivisionSnapshots,
  mergeConcurrentEventWrites,
} from "../lib/event-merge.js";
import { divisionHasMatchProgress } from "../lib/tournament-division-schedule.js";
import { isMatchLive } from "../lib/tournament-live.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";

const p1 = "pair-1";
const p2 = "pair-2";
const p3 = "pair-3";
const p4 = "pair-4";
const p5 = "pair-5";
const divId = "novice_mens_doubles";

const dirtyBlob = {
  type: "tournament",
  tournamentPhase: "pool_play",
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
            "pair-1|pair-2": {
              pairAId: p1,
              pairBId: p2,
              status: "completed",
              scoreA: 11,
              scoreB: 10,
              winnerPairId: p1,
              resultLocked: true,
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
              scheduleGeneration: 1000,
            },
          ],
        },
      ],
    },
  },
};

const before = dirtyBlob;
const regenerated = regenerateDivisionSetup(dirtyBlob, divId, { force: true });
const merged = applyRegeneratedDivisionSnapshots(
  before,
  mergeConcurrentEventWrites(dirtyBlob, regenerated),
  regenerated
);

const div = merged.tournamentDivisions[divId];
const bracket = div.brackets[0];
const m1 = bracket.matches.find((m) => m.scheduleOrder === 1);
const m3 = bracket.matches.find((m) => m.scheduleOrder === 3);
const liveCount = bracket.matches.filter((m) => isMatchLive(m)).length;

let failed = 0;
function assert(name, ok, detail = "") {
  if (!ok) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

assert("no division progress", !divisionHasMatchProgress(div));
assert("confirmed cleared", Object.keys(bracket.confirmedResults ?? {}).length === 0);
assert("match 1 not locked", !isRoundRobinMatchLocked(m1), m1?.status);
assert("match 3 not live", !isMatchLive(m3), m3?.status);
assert("no live matches", liveCount === 0, String(liveCount));
assert("reset timestamp bumped", (div.scheduleResetAt ?? 0) > 1000);

console.log(
  failed
    ? `\n${failed} REGENERATE BLOB MERGE TEST(S) FAILED`
    : "\nALL REGENERATE BLOB MERGE TESTS PASSED"
);
process.exit(failed ? 1 : 0);
