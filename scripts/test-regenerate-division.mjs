import { regenerateDivisionSetup } from "../lib/tournament-setup.js";
import { divisionHasMatchProgress } from "../lib/tournament-division-schedule.js";

const pairA = "pair-a";
const pairB = "pair-b";
const pairC = "pair-c";
const pairD = "pair-d";

const event = {
  type: "tournament",
  tournamentPhase: "pool_play",
  courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
  pairRegistrations: [
    { id: pairA, divisionId: "novice-mens", player1: { playerId: "p1" }, player2: { playerId: "p2" } },
    { id: pairB, divisionId: "novice-mens", player1: { playerId: "p3" }, player2: { playerId: "p4" } },
    { id: pairC, divisionId: "novice-mens", player1: { playerId: "p5" }, player2: { playerId: "p6" } },
    { id: pairD, divisionId: "novice-mens", player1: { playerId: "p7" }, player2: { playerId: "p8" } },
  ],
  tournamentDivisions: {
    "novice-mens": {
      plan: { formulaText: "test" },
      brackets: [
        {
          id: "bracket-1",
          courtId: "court-1",
          pairIds: [pairA, pairB, pairC, pairD],
          confirmedResults: {
            [`${[pairA, pairB].sort().join("|")}`]: {
              pairAId: pairA,
              pairBId: pairB,
              status: "completed",
              scoreA: 11,
              scoreB: 7,
              winnerPairId: pairA,
              resultLocked: true,
            },
          },
          matches: [
            {
              id: "rr-1",
              pairAId: pairA,
              pairBId: pairB,
              status: "completed",
              scoreA: 11,
              scoreB: 7,
              winnerPairId: pairA,
              resultLocked: true,
            },
            {
              id: "rr-2",
              pairAId: pairA,
              pairBId: pairC,
              status: "live",
              scoreA: 8,
              scoreB: 5,
            },
          ],
          standings: [{ pairId: pairA, wins: 1 }],
          poolComplete: false,
        },
      ],
    },
  },
};

const before = event.tournamentDivisions["novice-mens"];
console.log("before progress", divisionHasMatchProgress(before));

const next = regenerateDivisionSetup(event, "novice-mens", { force: true });
const div = next.tournamentDivisions["novice-mens"];
const bracket = div.brackets[0];

console.log("after progress", divisionHasMatchProgress(div));
console.log(
  "matches",
  bracket.matches.map((m) => `${m.id}:${m.status}:${m.scoreA}-${m.scoreB}`)
);
console.log("confirmed", Object.keys(bracket.confirmedResults ?? {}).length);
console.log("knockout", div.knockout);
console.log("standings", bracket.standings?.length ?? 0);

const pass =
  !divisionHasMatchProgress(div) &&
  bracket.matches.every(
    (m) =>
      m.status === "scheduled" &&
      (m.scoreA ?? 0) === 0 &&
      (m.scoreB ?? 0) === 0
  ) &&
  Object.keys(bracket.confirmedResults ?? {}).length === 0 &&
  !div.knockout &&
  (bracket.standings?.length ?? 0) === 0;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
