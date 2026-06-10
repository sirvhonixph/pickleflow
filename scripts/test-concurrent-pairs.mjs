import { mergeConcurrentEventWrites } from "../lib/event-merge.js";
import { addPairRegistration } from "../lib/tournament-pairs.js";

const baseEvent = {
  type: "tournament",
  status: "active",
  tournamentPhase: "registration",
  pairRegistrations: [],
  registrations: [],
  tournamentDivisions: {},
  divisionPairLimit: 20,
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

function addPair(event, n) {
  return addPairRegistration(event, {
    divisionId: "novice_mens_doubles",
    player1Name: `${n}A`,
    player2Name: `${n}B`,
  });
}

let event = baseEvent;
for (let i = 1; i <= 10; i++) {
  event = addPair(event, i);
}

const staleRead = event;
const concurrentAdd11 = addPair({ ...staleRead, pairRegistrations: [...staleRead.pairRegistrations] }, 11);
const concurrentAdd12 = addPair({ ...staleRead, pairRegistrations: [...staleRead.pairRegistrations] }, 12);

const merged11Then12 = mergeConcurrentEventWrites(concurrentAdd11, concurrentAdd12);
assert(
  "merge keeps pair 11 when pair 12 saved from stale read",
  merged11Then12.pairRegistrations.some((p) => p.player1?.name === "11A") &&
    merged11Then12.pairRegistrations.some((p) => p.player1?.name === "12A"),
  `count=${merged11Then12.pairRegistrations.length}`
);
assert(
  "merge has 12 pairs total",
  merged11Then12.pairRegistrations.length === 12,
  String(merged11Then12.pairRegistrations.length)
);

const merged12Then11 = mergeConcurrentEventWrites(concurrentAdd12, concurrentAdd11);
assert(
  "merge order independent",
  merged12Then11.pairRegistrations.length === 12
);

console.log(
  failed ? `\n${failed} concurrent merge test(s) failed` : "\nAll concurrent pair merge tests passed"
);
process.exit(failed ? 1 : 0);
