import { releaseCourtForNewLive, updateTournamentMatch } from "../lib/tournament-setup.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";
import { isMatchPlayable, isMatchLive } from "../lib/tournament-live.js";

const p1 = "pair-1";
const p2 = "pair-2";
const p3 = "pair-3";
const p4 = "pair-4";
const p5 = "pair-5";
const resetAt = 7000;

let event = {
  type: "tournament",
  tournamentPhase: "pool_play",
  courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
  pairRegistrations: [p1, p2, p3, p4, p5].map((id) => ({
    id,
    divisionId: "novice-mens",
    player1: { playerId: `${id}-a` },
    player2: { playerId: `${id}-b` },
  })),
  tournamentDivisions: {
    "novice-mens": {
      scheduleResetAt: resetAt,
      brackets: [
        {
          id: "bracket-1",
          courtId: "court-1",
          scheduleResetAt: resetAt,
          pairIds: [p1, p2, p3, p4, p5],
          confirmedResults: {},
          matches: [
            {
              id: "rr-4",
              pairAId: p3,
              pairBId: p4,
              scheduleOrder: 4,
              status: "live",
              scoreA: 11,
              scoreB: 6,
              startedAt: 4000,
              scheduleGeneration: resetAt,
            },
            {
              id: "rr-5",
              pairAId: p1,
              pairBId: p5,
              scheduleOrder: 5,
              status: "scheduled",
              scoreA: 0,
              scoreB: 0,
              scheduleGeneration: resetAt,
            },
          ],
        },
      ],
    },
  },
};

event = releaseCourtForNewLive(
  event,
  "court-1",
  "novice-mens",
  "bracket-1",
  "rr-5"
);

const m4 = event.tournamentDivisions["novice-mens"].brackets[0].matches.find(
  (m) => m.scheduleOrder === 4
);

console.log(
  "after start match5",
  m4?.status,
  m4?.resultLocked,
  `${m4?.scoreA}-${m4?.scoreB}`,
  isMatchLive(m4) ? "LIVE" : "",
  isMatchPlayable(m4) ? "PLAYABLE" : ""
);

const pass =
  isRoundRobinMatchLocked(m4) &&
  m4?.status === "completed" &&
  m4?.scoreA === 11 &&
  m4?.scoreB === 6 &&
  !isMatchPlayable(m4);

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
