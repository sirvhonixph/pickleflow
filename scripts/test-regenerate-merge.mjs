import { regenerateDivisionSetup } from "../lib/tournament-setup.js";
import { mergeTournamentDivisions } from "../lib/event-merge.js";
import { divisionHasMatchProgress } from "../lib/tournament-division-schedule.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";

const pairA = "pair-a";
const pairB = "pair-b";
const pairC = "pair-c";
const pairD = "pair-d";
const divId = "novice-mens";

const oldEvent = {
  type: "tournament",
  tournamentPhase: "knockout",
  tournamentDivisions: {
    [divId]: {
      scheduleResetAt: 1000,
      divisionComplete: false,
      knockout: { initialized: true, rounds: [] },
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
          ],
        },
      ],
    },
  },
};

const baseEvent = {
  ...oldEvent,
  courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
  pairRegistrations: [
    { id: pairA, divisionId: divId, player1: { playerId: "p1" }, player2: { playerId: "p2" } },
    { id: pairB, divisionId: divId, player1: { playerId: "p3" }, player2: { playerId: "p4" } },
    { id: pairC, divisionId: divId, player1: { playerId: "p5" }, player2: { playerId: "p6" } },
    { id: pairD, divisionId: divId, player1: { playerId: "p7" }, player2: { playerId: "p8" } },
  ],
};

const regenerated = regenerateDivisionSetup(baseEvent, divId, { force: true });
const regDiv = regenerated.tournamentDivisions[divId];
const regBracket = regDiv.brackets[0];

const merged = mergeTournamentDivisions(baseEvent, regenerated);
const mergedDiv = merged[divId];
const mergedBracket = mergedDiv.brackets[0];

console.log("regenerated resetAt", regDiv.scheduleResetAt);
console.log(
  "regenerated matches",
  regBracket.matches.every(
    (m) =>
      m.status === "scheduled" &&
      (m.scoreA ?? 0) === 0 &&
      !isRoundRobinMatchLocked(m)
  )
);
console.log("regenerated confirmed", Object.keys(regBracket.confirmedResults ?? {}).length);
console.log("regenerated knockout", regDiv.knockout);

console.log(
  "merged matches clean",
  mergedBracket.matches.every(
    (m) =>
      m.status === "scheduled" &&
      (m.scoreA ?? 0) === 0 &&
      !isRoundRobinMatchLocked(m)
  )
);
console.log("merged confirmed", Object.keys(mergedBracket.confirmedResults ?? {}).length);
console.log("merged knockout", mergedDiv.knockout);

const pass =
  !divisionHasMatchProgress(regDiv) &&
  Object.keys(regBracket.confirmedResults ?? {}).length === 0 &&
  regDiv.knockout == null &&
  regDiv.scheduleResetAt > 1000 &&
  mergedDiv.scheduleResetAt === regDiv.scheduleResetAt &&
  Object.keys(mergedBracket.confirmedResults ?? {}).length === 0 &&
  !divisionHasMatchProgress(mergedDiv) &&
  mergedDiv.knockout == null;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
