import {
  buildPermanentPairingIndex,
  stabilizeBracketMatches,
  syncBracketConfirmedResults,
} from "../lib/tournament-brackets.js";
import {
  releaseCourtForNewLive,
  updateTournamentMatch,
} from "../lib/tournament-setup.js";

const pairA = "pair-a";
const pairB = "pair-b";
const pairC = "pair-c";
const pairD = "pair-d";

function makeEvent(matches) {
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
        scheduleResetAt: null,
        brackets: [
          {
            id: "bracket-1",
            courtId: "court-1",
            pairIds: [pairA, pairB, pairC, pairD],
            matches,
          },
        ],
      },
    },
  };
}

const match1Locked = {
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
};
const match1LiveGhost = {
  id: "rr-1-ghost",
  pairAId: pairA,
  pairBId: pairB,
  scheduleOrder: 1,
  status: "live",
  scoreA: 0,
  scoreB: 0,
  startedAt: 2000,
};
const match2Scheduled = {
  id: "rr-2",
  pairAId: pairC,
  pairBId: pairD,
  scheduleOrder: 2,
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
};

let event = makeEvent([match1Locked, match1LiveGhost, match2Scheduled]);
event = updateTournamentMatch(event, "div1", "bracket-1", "rr-2", {
  status: "live",
  scoreA: 0,
  scoreB: 0,
});

const bracket = event.tournamentDivisions.div1.brackets[0];
const m1 = bracket.matches.find(
  (m) => m.pairAId === pairA && m.pairBId === pairB
);
const m2 = bracket.matches.find(
  (m) => m.pairAId === pairC && m.pairBId === pairD
);

console.log("after start match 2:");
console.log("match1", m1?.status, m1?.resultLocked, `${m1?.scoreA}-${m1?.scoreB}`);
console.log("match2", m2?.status);
console.log(
  "confirmed",
  Object.keys(bracket.confirmedResults ?? {}).length
);

const stale = updateTournamentMatch(event, "div1", "bracket-1", "rr-1", {
  status: "live",
  scoreA: 5,
  scoreB: 3,
});
const staleM1 = stale.tournamentDivisions.div1.brackets[0].matches.find(
  (m) => m.pairAId === pairA && m.pairBId === pairB
);
console.log("after stale autosave match1:");
console.log(
  "match1",
  staleM1?.status,
  staleM1?.resultLocked,
  `${staleM1?.scoreA}-${staleM1?.scoreB}`
);

const ok =
  m1?.resultLocked === true &&
  m1?.status === "completed" &&
  m2?.status === "live" &&
  staleM1?.resultLocked === true &&
  staleM1?.status === "completed";

let pass = ok;

if (pass) {
  const completed = updateTournamentMatch(event, "div1", "bracket-1", "rr-2", {
    status: "completed",
    scoreA: 11,
    scoreB: 9,
  });
  const doneM2 = completed.tournamentDivisions.div1.brackets[0].matches.find(
    (m) => m.pairAId === pairC && m.pairBId === pairD
  );
  pass =
    doneM2?.status === "completed" &&
    doneM2?.resultLocked === true &&
    doneM2?.scoreA === 11 &&
    doneM2?.scoreB === 9;
  console.log("after complete match 2:", doneM2?.status, `${doneM2?.scoreA}-${doneM2?.scoreB}`);
}

if (pass) {
  const liveOnCourt = {
    id: "rr-1",
    pairAId: pairA,
    pairBId: pairB,
    scheduleOrder: 1,
    status: "live",
    scoreA: 11,
    scoreB: 7,
    startedAt: 4000,
  };
  let prematureEvent = makeEvent([liveOnCourt, match2Scheduled]);
  prematureEvent.tournamentDivisions.div1.brackets[0].confirmedResults = {
    [`${[pairA, pairB].sort().join("|")}`]: match1Locked,
  };
  prematureEvent = updateTournamentMatch(
    prematureEvent,
    "div1",
    "bracket-1",
    "rr-1",
    { status: "completed", scoreA: 11, scoreB: 7 }
  );
  const sealed = prematureEvent.tournamentDivisions.div1.brackets[0].matches.find(
    (m) => m.pairAId === pairA && m.pairBId === pairB
  );
  pass =
    sealed?.status === "completed" &&
    sealed?.resultLocked === true &&
    sealed?.scoreA === 11 &&
    sealed?.scoreB === 7;
  console.log(
    "after complete live row with locked canonical:",
    sealed?.status,
    sealed?.resultLocked,
    `${sealed?.scoreA}-${sealed?.scoreB}`
  );
}

if (pass) {
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
  const match3LiveGhost = {
    id: "rr-bracket-1-pair-a-pair-c",
    pairAId: pairA,
    pairBId: pairC,
    scheduleOrder: 3,
    status: "live",
    scoreA: 11,
    scoreB: 10,
    startedAt: 4000,
  };
  let endLive = makeEvent([
    match1Locked,
    {
      id: "rr-2",
      pairAId: pairB,
      pairBId: pairC,
      scheduleOrder: 2,
      status: "scheduled",
      scoreA: 0,
      scoreB: 0,
    },
    match3Locked,
    match3LiveGhost,
    {
      id: "rr-4",
      pairAId: pairB,
      pairBId: pairD,
      scheduleOrder: 4,
      status: "scheduled",
      scoreA: 0,
      scoreB: 0,
    },
  ]);
  endLive = updateTournamentMatch(endLive, "div1", "bracket-1", "rr-3", {
    status: "completed",
    scoreA: 11,
    scoreB: 10,
  });
  const ended = endLive.tournamentDivisions.div1.brackets[0].matches.find(
    (m) => m.pairAId === pairA && m.pairBId === pairC && m.resultLocked
  );
  pass =
    ended?.status === "completed" &&
    ended?.resultLocked === true &&
    ended?.scoreA === 11 &&
    ended?.scoreB === 10;
  console.log(
    "after end live ghost with locked canonical:",
    ended?.status,
    ended?.resultLocked,
    `${ended?.scoreA}-${ended?.scoreB}`
  );
}

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
