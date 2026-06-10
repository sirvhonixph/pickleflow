import { addPairRegistration } from "../lib/tournament-pairs.js";
import { applyTournamentPlayerRegistration } from "../lib/tournament-pairs.js";
import { applyAllDivisionSetups } from "../lib/tournament-setup.js";
import {
  generateRoundRobinMatches,
  roundRobinPairKey,
  mergeRoundRobinSchedule,
} from "../lib/tournament-brackets.js";
import { getEventDivisions } from "../lib/tournament-divisions.js";

const paymentConfig = {
  entryFee: "500",
  gcash: { enabled: true, number: "09123456789" },
  bankQr: { enabled: false, imageDataUrl: "" },
};

let event = {
  type: "tournament",
  status: "active",
  tournamentPhase: "registration",
  pairRegistrations: [],
  registrations: [],
  tournamentDivisions: {},
  divisionPairLimit: 20,
  offeredDivisionIds: [],
  paymentConfig,
  courts: [
    { id: "c1", name: "Court 1" },
    { id: "c2", name: "Court 2" },
    { id: "c3", name: "Court 3" },
    { id: "c4", name: "Court 4" },
    { id: "c5", name: "Court 5" },
    { id: "c6", name: "Court 6" },
  ],
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

function addHostPair(divisionId, p1, p2) {
  event = addPairRegistration(event, {
    divisionId,
    player1Name: p1,
    player2Name: p2,
  });
}

const divisions = getEventDivisions(event);
for (const d of divisions) {
  addHostPair(d.id, `${d.id}-A`, `${d.id}-B`);
  addHostPair(d.id, `${d.id}-C`, `${d.id}-D`);
}

assert(
  "host walk-ins add 12 pairs (2 per division)",
  event.pairRegistrations.length === 12,
  String(event.pairRegistrations.length)
);

const beforeIds = event.pairRegistrations.map((p) => p.id).sort().join(",");
event = {
  ...event,
  pairRegistrations: [...event.pairRegistrations],
};
const afterIds = event.pairRegistrations.map((p) => p.id).sort().join(",");
assert("pair list retains all names after copy", beforeIds === afterIds);

const appPlayer = {
  playerId: "online@test.com",
  email: "online@test.com",
  name: "Online Player",
  pairName: "Online Team",
  partnerName: "Online Partner",
  clubName: "Online Club",
  category: "novice",
  divisionFormat: "mixed",
  paymentMethod: "gcash",
  paymentProofDataUrl: "data:image/png;base64,xyz",
};

event = applyTournamentPlayerRegistration(event, appPlayer);
assert(
  "app registration adds pair",
  event.pairRegistrations.some((p) => p.player1?.name === "Online Player")
);
assert(
  "app registration adds registration row",
  event.registrations.some((r) => r.playerId === "online@test.com")
);

try {
  event = applyAllDivisionSetups(event);
} catch (err) {
  console.error("FAIL: applyAllDivisionSetups", err.message);
  failed++;
}

const bracketedDivisions = Object.keys(event.tournamentDivisions ?? {});
assert(
  "brackets generated for all divisions with 2+ pairs",
  bracketedDivisions.length === divisions.length,
  `got ${bracketedDivisions.length} of ${divisions.length}`
);

for (const divId of bracketedDivisions) {
  const setup = event.tournamentDivisions[divId];
  const allMatches = (setup.brackets ?? []).flatMap((b) => b.matches ?? []);
  const keys = new Set();
  let dupes = 0;
  for (const m of allMatches) {
    const key = roundRobinPairKey(m);
    if (keys.has(key)) dupes++;
    keys.add(key);
  }
  assert(`no duplicate pairings in ${divId}`, dupes === 0, `${dupes} dupes`);
}

const fivePairs = ["a", "b", "c", "d", "e"];
const rr = generateRoundRobinMatches(fivePairs, "bracket-a");
assert("5 pairs produce 10 RR matches", rr.length === 10);
const rrKeys = new Set(rr.map(roundRobinPairKey));
assert("10 unique pairings for 5 pairs", rrKeys.size === 10);

const merged = mergeRoundRobinSchedule(rr, fivePairs);
assert("merge preserves unique pairings", merged.length === 10);

console.log(
  failed ? `\n${failed} tournament e2e test(s) failed` : "\nAll tournament e2e tests passed"
);
process.exit(failed ? 1 : 0);
