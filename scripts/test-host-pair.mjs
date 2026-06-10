import { addPairRegistration } from "../lib/tournament-pairs.js";

const baseEvent = {
  type: "tournament",
  status: "active",
  tournamentPhase: "registration",
  pairRegistrations: [],
  tournamentDivisions: {},
  divisionPairLimit: 20,
};

let failed = 0;

function assert(name, condition) {
  if (!condition) {
    console.error("FAIL:", name);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const first = addPairRegistration(baseEvent, {
  divisionId: "novice_mens_doubles",
  player1Name: "1A",
  player2Name: "1B",
});

assert("adds first host pair", first.pairRegistrations.length === 1);
assert(
  "pair in correct division",
  first.pairRegistrations[0].divisionId === "novice_mens_doubles"
);

const second = addPairRegistration(first, {
  divisionId: "novice_mens_doubles",
  player1Name: "2A",
  player2Name: "2B",
});

assert("adds second host pair", second.pairRegistrations.length === 2);

let duplicateBlocked = false;
try {
  addPairRegistration(
    addPairRegistration(second, {
      divisionId: "novice_mens_doubles",
      player1Name: "1A",
      player2Name: "3B",
    }),
    {
      divisionId: "novice_mens_doubles",
      player1Name: "1A",
      player2Name: "4B",
    }
  );
} catch (err) {
  duplicateBlocked = /maximum of 2 entries/i.test(err.message);
}
assert("blocks third entry for same player name in category", duplicateBlocked);

let missingNames = false;
try {
  addPairRegistration(baseEvent, {
    divisionId: "novice_mens_doubles",
    player1Name: "",
    player2Name: "X",
  });
} catch (err) {
  missingNames = /required/i.test(err.message);
}
assert("requires both player names", missingNames);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll host pair tests passed");
process.exit(failed ? 1 : 0);
