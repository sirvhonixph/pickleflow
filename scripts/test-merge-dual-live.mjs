/**
 * Simulates production blob merge: server released match 2 when match 3 started,
 * but client poll still had match 2 live — must not show two LIVE on one court.
 */
import { mergeEventSnapshots } from "../lib/event-merge.js";
import {
  stabilizeBracketMatches,
  roundRobinPairKey,
} from "../lib/tournament-brackets.js";
import { isMatchLive } from "../lib/tournament-live.js";

const p1 = "pair-1";
const p2 = "pair-2";
const p3 = "pair-3";
const p4 = "pair-4";
const p5 = "pair-5";

const bracketBase = {
  id: "bracket-1",
  courtId: "court-1",
  courtName: "Court 1",
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
      lockedAt: 1000,
      playedAt: 1000,
    },
  },
};

const serverBracket = {
  ...bracketBase,
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
    },
    {
      id: "rr-2",
      pairAId: p4,
      pairBId: p5,
      scheduleOrder: 2,
      status: "scheduled",
      scoreA: 0,
      scoreB: 0,
    },
    {
      id: "rr-3",
      pairAId: p2,
      pairBId: p5,
      scheduleOrder: 3,
      status: "live",
      scoreA: 0,
      scoreB: 0,
      startedAt: 3000,
    },
  ],
};

const staleClientBracket = {
  ...bracketBase,
  matches: [
    ...serverBracket.matches.filter((m) => m.scheduleOrder !== 2),
    {
      id: "rr-2",
      pairAId: p4,
      pairBId: p5,
      scheduleOrder: 2,
      status: "live",
      scoreA: 0,
      scoreB: 0,
      startedAt: 2000,
    },
  ],
};

const serverEvent = {
  type: "tournament",
  courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
  tournamentDivisions: {
    div: { brackets: [serverBracket] },
  },
};

const clientEvent = {
  ...serverEvent,
  tournamentDivisions: {
    div: { brackets: [staleClientBracket] },
  },
};

const merged = mergeEventSnapshots(clientEvent, serverEvent);
const bracket = merged.tournamentDivisions.div.brackets[0];
const liveRaw = (bracket.matches ?? []).filter((m) => isMatchLive(m));
const schedule = stabilizeBracketMatches(bracket).matches;
const liveSchedule = schedule.filter((m) => isMatchLive(m));

let failed = 0;
function assert(name, ok, detail = "") {
  if (!ok) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

assert("merge keeps only one raw live row", liveRaw.length === 1, String(liveRaw.length));
assert(
  "newest live match kept",
  liveRaw[0]?.scheduleOrder === 3,
  String(liveRaw[0]?.scheduleOrder)
);
assert("schedule shows one live", liveSchedule.length === 1, String(liveSchedule.length));
assert(
  "released match 2 not live in schedule",
  !schedule.some((m) => m.scheduleOrder === 2 && isMatchLive(m))
);
assert(
  "match 1 still locked",
  schedule.some(
    (m) =>
      m.scheduleOrder === 1 &&
      m.resultLocked === true &&
      m.scoreA === 11 &&
      m.scoreB === 10
  )
);

console.log(failed ? `\n${failed} MERGE DUAL-LIVE TEST(S) FAILED` : "\nALL MERGE DUAL-LIVE TESTS PASSED");
process.exit(failed ? 1 : 0);
