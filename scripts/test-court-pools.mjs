import { buildSkillCourtPools, courtsForDivision } from "../lib/tournament-court-pools.js";

let failed = 0;
function assert(name, condition, detail = "") {
  if (!condition) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const event = {
  courts: [
    { id: "c1", name: "Court 1" },
    { id: "c2", name: "Court 2" },
    { id: "c3", name: "Court 3" },
    { id: "c4", name: "Court 4" },
  ],
  offeredDivisionIds: [
    "novice_mens_doubles",
    "novice_womens_doubles",
    "novice_mixed_doubles",
    "intermediate_mens_doubles",
    "intermediate_womens_doubles",
    "intermediate_mixed_doubles",
  ],
  pairRegistrations: Array.from({ length: 20 }, (_, i) => ({
    id: `pair-${i}`,
    divisionId: "novice_mens_doubles",
    player1: { name: `${i + 1}A` },
    player2: { name: `${i + 1}B` },
  })),
};

const pools = buildSkillCourtPools(event);
assert(
  "novice-only pairs get all 4 courts",
  (pools.novice?.length ?? 0) === 4,
  `novice=${pools.novice?.length}`
);
assert(
  "intermediate gets none when no pairs",
  (pools.intermediate?.length ?? 0) === 0
);

const noviceCourts = courtsForDivision(event, "novice_mens_doubles");
assert("division sees 4 courts", noviceCourts.length === 4);

const mixedEvent = {
  ...event,
  pairRegistrations: [
    ...event.pairRegistrations,
    {
      id: "pair-i1",
      divisionId: "intermediate_mens_doubles",
      player1: { name: "IA" },
      player2: { name: "IB" },
    },
    {
      id: "pair-i2",
      divisionId: "intermediate_mens_doubles",
      player1: { name: "IC" },
      player2: { name: "ID" },
    },
  ],
};

const splitPools = buildSkillCourtPools(mixedEvent);
assert(
  "both tiers with pairs split courts",
  splitPools.novice?.length === 2 && splitPools.intermediate?.length === 2,
  `novice=${splitPools.novice?.length} intermediate=${splitPools.intermediate?.length}`
);

console.log(
  failed ? `\n${failed} court pool test(s) failed` : "\nAll court pool tests passed"
);
process.exit(failed ? 1 : 0);
