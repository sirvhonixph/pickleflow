import { applyOpenPlayRegistration } from "../lib/open-play-registration.js";
import { addWalkInPlayer } from "../lib/event-players.js";
import { processEventAutomation, buildGlobalWaitQueue } from "../lib/event-automation.js";
import { pickNextFour } from "../lib/matchmaking.js";
import { buildHistoryEntry } from "../lib/match-history.js";

const paymentConfig = {
  entryFee: "200",
  gcash: { enabled: true, number: "09123456789" },
  bankQr: { enabled: false, imageDataUrl: "" },
};

const baseEvent = {
  type: "open_play",
  status: "active",
  registrations: [],
  courts: [
    {
      id: "court-1",
      name: "Court 1",
      status: "idle",
      queue: [],
      autoMatch: true,
      currentMatch: null,
      pendingMatch: null,
    },
  ],
  matchHistory: [],
  paymentConfig,
};

let failed = 0;
function assert(name, condition, detail = "") {
  if (!condition) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const player = {
  playerId: "player1@test.com",
  email: "player1@test.com",
  name: "Player One",
  clubName: "Test Club",
  category: "novice",
  paymentMethod: "gcash",
  paymentProofDataUrl: "data:image/png;base64,abc",
};

const afterReg = applyOpenPlayRegistration(baseEvent, player);
assert("app registration adds player row", afterReg.registrations.length === 1);
assert(
  "registration has payment proof",
  !!afterReg.registrations[0].paymentEntry?.paymentProofDataUrl
);

const { event: afterAuto } = processEventAutomation(afterReg);
const queue = buildGlobalWaitQueue(afterAuto);
assert("registered player appears in wait queue", queue.some((q) => q.playerId === player.playerId));

const walkIn = addWalkInPlayer(afterAuto, {
  name: "Walk In Alpha",
  category: "novice",
});
assert("walk-in adds second player", walkIn.registrations.length === 2);

const { event: afterWalkAuto } = processEventAutomation(walkIn);
const queue2 = buildGlobalWaitQueue(afterWalkAuto);
assert(
  "walk-in appears in wait queue",
  queue2.some((q) => q.name === "Walk In Alpha")
);

const fifoEvent = {
  ...baseEvent,
  registrations: [
    { playerId: "p1", name: "P1", category: "novice", joinedAt: 1000 },
    { playerId: "p2", name: "P2", category: "novice", joinedAt: 2000 },
    { playerId: "p3", name: "P3", category: "novice", joinedAt: 3000 },
    { playerId: "p4", name: "P4", category: "novice", joinedAt: 4000 },
  ],
};
const { event: fifoProcessed } = processEventAutomation(fifoEvent);
const court = fifoProcessed.courts[0];
const pending = court.pendingMatch;
assert("auto-match proposes when 4 novice players", !!pending);
assert(
  "FIFO picks earliest joiners",
  pending?.fifoOrder?.[0] === "p1" && pending?.fifoOrder?.[3] === "p4",
  JSON.stringify(pending?.fifoOrder)
);

const playedEvent = {
  ...fifoProcessed,
  courts: [
    {
      ...court,
      status: "live",
      pendingMatch: null,
      currentMatch: pending
        ? {
            teamA: pending.teamA,
            teamB: pending.teamB,
            scoreA: 11,
            scoreB: 5,
            startedAt: 5000,
          }
        : null,
    },
  ],
  matchHistory: [],
};
const historyEntry = buildHistoryEntry(playedEvent.courts[0], playedEvent.courts[0].currentMatch);
const afterMatch = {
  ...playedEvent,
  matchHistory: [historyEntry],
  courts: [
    {
      ...playedEvent.courts[0],
      status: "idle",
      currentMatch: null,
      pendingMatch: null,
      queue: [],
    },
  ],
};
const { event: requeued } = processEventAutomation(afterMatch);
const backQueue = buildGlobalWaitQueue(requeued);
const pendingAgain = requeued.courts[0]?.pendingMatch;
assert(
  "after match, players are re-queued for next round (pending or wait list)",
  backQueue.length === 4 || !!pendingAgain,
  `queue=${backQueue.length} pending=${!!pendingAgain}`
);
if (pendingAgain) {
  assert(
    "post-match FIFO order preserved in next proposal",
    pendingAgain.fifoOrder?.[0] === "p1",
    JSON.stringify(pendingAgain.fifoOrder)
  );
} else {
  assert(
    "post-match wait list uses match end time for FIFO",
    backQueue.every((q) => q.queuedAt >= historyEntry.endedAt)
  );
}

const pool =
  pendingAgain?.players ??
  backQueue.map((q) => ({ ...q, category: "novice" }));
const picked = pickNextFour(pool);
assert("can pick next four after round", picked?.length === 4);

console.log(failed ? `\n${failed} open play test(s) failed` : "\nAll open play flow tests passed");
process.exit(failed ? 1 : 0);
