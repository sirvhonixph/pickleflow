import { updateTournamentMatch } from "../lib/tournament-setup.js";

const pairA = "pair-a";
const pairB = "pair-b";
const pairC = "pair-c";
const pairD = "pair-d";
const resetAt = 9000;

function makeEvent(matches, confirmedResults = {}) {
  return {
    type: "tournament",
    tournamentPhase: "pool_play",
    pairRegistrations: [
      { id: pairA, player1: { playerId: "p1" }, player2: { playerId: "p2" } },
      { id: pairB, player1: { playerId: "p3" }, player2: { playerId: "p4" } },
      { id: pairC, player1: { playerId: "p5" }, player2: { playerId: "p6" } },
      { id: pairD, player1: { playerId: "p7" }, player2: { playerId: "p8" } },
    ],
    tournamentDivisions: {
      div1: {
        scheduleResetAt: resetAt,
        brackets: [
          {
            id: "bracket-1",
            courtId: "court-1",
            scheduleResetAt: resetAt,
            pairIds: [pairA, pairB, pairC, pairD],
            matches,
            confirmedResults,
          },
        ],
      },
    },
  };
}

const match3Locked = {
  id: "rr-3",
  pairAId: pairA,
  pairBId: pairC,
  scheduleOrder: 3,
  status: "completed",
  scoreA: 11,
  scoreB: 8,
  winnerPairId: pairA,
  resultLocked: true,
  lockedAt: 3000,
  playedAt: 3000,
};
const match4Scheduled = {
  id: "rr-4",
  pairAId: pairB,
  pairBId: pairD,
  scheduleOrder: 4,
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
  scheduleGeneration: resetAt,
};

const key3 = [pairA, pairC].sort().join("|");
let event = makeEvent(
  [
    {
      id: "rr-1",
      pairAId: pairA,
      pairBId: pairB,
      scheduleOrder: 1,
      status: "completed",
      scoreA: 11,
      scoreB: 7,
      winnerPairId: pairA,
      resultLocked: true,
      lockedAt: 1000,
      playedAt: 1000,
      scheduleGeneration: resetAt,
    },
    {
      id: "rr-2",
      pairAId: pairB,
      pairBId: pairC,
      scheduleOrder: 2,
      status: "completed",
      scoreA: 8,
      scoreB: 11,
      winnerPairId: pairC,
      resultLocked: true,
      lockedAt: 2000,
      playedAt: 2000,
      scheduleGeneration: resetAt,
    },
    match3Locked,
    match4Scheduled,
  ],
  { [key3]: match3Locked }
);

event = updateTournamentMatch(event, "div1", "bracket-1", "rr-4", {
  status: "live",
  scoreA: 0,
  scoreB: 0,
});
event = updateTournamentMatch(event, "div1", "bracket-1", "rr-4", {
  status: "completed",
  scoreA: 11,
  scoreB: 5,
});

const bracket = event.tournamentDivisions.div1.brackets[0];
const m3 = bracket.matches.find(
  (m) => m.pairAId === pairA && m.pairBId === pairC
);
const m4 = bracket.matches.find(
  (m) => m.pairAId === pairB && m.pairBId === pairD
);
const confirmed3 = bracket.confirmedResults?.[key3];

console.log(
  "match3",
  m3?.status,
  m3?.resultLocked,
  `${m3?.scoreA}-${m3?.scoreB}`,
  "gen",
  m3?.scheduleGeneration
);
console.log(
  "match4",
  m4?.status,
  m4?.resultLocked,
  `${m4?.scoreA}-${m4?.scoreB}`
);
console.log("confirmed3 locked", confirmed3?.resultLocked, confirmed3?.scoreA);

const pass =
  m3?.status === "completed" &&
  m3?.resultLocked === true &&
  m3?.scoreA === 11 &&
  m3?.scoreB === 8 &&
  confirmed3?.resultLocked === true &&
  m4?.resultLocked === true;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
