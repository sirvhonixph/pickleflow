import { updateTournamentMatch } from "../lib/tournament-setup.js";
import { refreshTournamentStandings } from "../lib/tournament-setup.js";
import { isMatchPlayable } from "../lib/tournament-live.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";
import { roundRobinPairKey } from "../lib/tournament-brackets.js";

const pairs = {
  p1: "pair-1",
  p2: "pair-2",
  p3: "pair-3",
  p4: "pair-4",
  p5: "pair-5",
};

function locked(id, pairAId, pairBId, order, scoreA, scoreB, winnerPairId, gen) {
  return {
    id,
    pairAId,
    pairBId,
    scheduleOrder: order,
    status: "completed",
    scoreA,
    scoreB,
    winnerPairId,
    resultLocked: true,
    lockedAt: order * 1000,
    playedAt: order * 1000,
    scheduleGeneration: gen,
  };
}

function makeEvent(resetAt) {
  const { p1, p2, p3, p4, p5 } = pairs;
  const m3 = locked("rr-3", p2, p5, 3, 11, 8, p2, resetAt);
  const m4 = locked("rr-4", p3, p4, 4, 11, 6, p3, resetAt);
  const m5Live = {
    id: "rr-5",
    pairAId: p1,
    pairBId: p5,
    scheduleOrder: 5,
    status: "live",
    scoreA: 10,
    scoreB: 11,
    startedAt: 5000,
    scheduleGeneration: resetAt,
  };
  const confirmed = {
    [roundRobinPairKey(m3)]: m3,
    [roundRobinPairKey(m4)]: m4,
  };
  return {
    type: "tournament",
    tournamentPhase: "pool_play",
    pairRegistrations: Object.values(pairs).map((id) => ({
      id,
      divisionId: "novice-mens",
      player1: { playerId: `${id}-a` },
      player2: { playerId: `${id}-b` },
    })),
    courts: [{ id: "court-1", name: "Court 1", skill: "novice" }],
    tournamentDivisions: {
      "novice-mens": {
        scheduleResetAt: resetAt,
        brackets: [
          {
            id: "bracket-1",
            courtId: "court-1",
            scheduleResetAt: resetAt,
            pairIds: [p1, p2, p3, p4, p5],
            confirmedResults: confirmed,
            matches: [
              locked("rr-1", p1, p2, 1, 11, 7, p1, resetAt),
              locked("rr-2", p2, p4, 2, 8, 11, p4, resetAt),
              m3,
              m4,
              m5Live,
            ],
          },
        ],
      },
    },
  };
}

function findMatch(bracket, order) {
  return (bracket.matches ?? []).find((m) => m.scheduleOrder === order);
}

function assertLocked(label, m) {
  const ok =
    m &&
    isRoundRobinMatchLocked(m) &&
    m.status === "completed" &&
    !isMatchPlayable(m);
  console.log(
    label,
    ok ? "OK" : "FAIL",
    m?.status,
    m?.resultLocked,
    `${m?.scoreA}-${m?.scoreB}`,
    isMatchPlayable(m) ? "PLAYABLE" : ""
  );
  return ok;
}

let pass = true;
const resetAt = 9000;
let event = makeEvent(resetAt);

event = updateTournamentMatch(event, "novice-mens", "bracket-1", "rr-5", {
  status: "completed",
  scoreA: 10,
  scoreB: 11,
});

let bracket = event.tournamentDivisions["novice-mens"].brackets[0];
assertLocked("match3 after m5", findMatch(bracket, 3));
pass = assertLocked("match4 after m5", findMatch(bracket, 4)) && pass;
pass = assertLocked("match5 after m5", findMatch(bracket, 5)) && pass;

event = refreshTournamentStandings(event);
bracket = event.tournamentDivisions["novice-mens"].brackets[0];
pass = assertLocked("match4 after refresh", findMatch(bracket, 4)) && pass;

// Older locked rows missing scheduleGeneration tags (production regression case)
const resetAt2 = 8000;
let event2 = makeEvent(resetAt2);
const b2 = event2.tournamentDivisions["novice-mens"].brackets[0];
for (const row of b2.matches) {
  delete row.scheduleGeneration;
}
for (const row of Object.values(b2.confirmedResults)) {
  delete row.scheduleGeneration;
}

event2 = updateTournamentMatch(event2, "novice-mens", "bracket-1", "rr-5", {
  status: "completed",
  scoreA: 10,
  scoreB: 11,
});
bracket = event2.tournamentDivisions["novice-mens"].brackets[0];
pass = assertLocked("untagged match4 after m5", findMatch(bracket, 4)) && pass;

// Locked in matches only — never synced to confirmedResults (common failure mode)
let event3 = makeEvent(resetAt);
const b3 = event3.tournamentDivisions["novice-mens"].brackets[0];
b3.confirmedResults = {
  [roundRobinPairKey(findMatch(b3, 3))]: findMatch(b3, 3),
};
event3 = updateTournamentMatch(event3, "novice-mens", "bracket-1", "rr-5", {
  status: "completed",
  scoreA: 10,
  scoreB: 11,
});
bracket = event3.tournamentDivisions["novice-mens"].brackets[0];
pass = assertLocked("match4 matches-only confirmed", findMatch(bracket, 4)) && pass;

// Explicit old generation tag on locked row — must not be purged
let event4 = makeEvent(resetAt);
const b4 = event4.tournamentDivisions["novice-mens"].brackets[0];
const m4old = findMatch(b4, 4);
m4old.scheduleGeneration = resetAt - 5000;
b4.confirmedResults[roundRobinPairKey(m4old)] = { ...m4old };
event4 = updateTournamentMatch(event4, "novice-mens", "bracket-1", "rr-5", {
  status: "completed",
  scoreA: 10,
  scoreB: 11,
});
bracket = event4.tournamentDivisions["novice-mens"].brackets[0];
pass = assertLocked("match4 old generation tag", findMatch(bracket, 4)) && pass;

// Live on court with decisive scores — must lock when next match completes, not reopen
let event5 = makeEvent(resetAt);
const b5 = event5.tournamentDivisions["novice-mens"].brackets[0];
const live4 = findMatch(b5, 4);
live4.status = "live";
live4.scoreA = 11;
live4.scoreB = 6;
live4.startedAt = 4000;
delete b5.confirmedResults[roundRobinPairKey(live4)];
event5 = updateTournamentMatch(event5, "novice-mens", "bracket-1", "rr-5", {
  status: "completed",
  scoreA: 10,
  scoreB: 11,
});
bracket = event5.tournamentDivisions["novice-mens"].brackets[0];
pass = assertLocked("live match4 after m5 complete", findMatch(bracket, 4)) && pass;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
