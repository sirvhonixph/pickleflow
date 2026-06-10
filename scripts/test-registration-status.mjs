import {
  canRegisterAnotherTournamentEntry,
  getTournamentPairCountForPlayer,
} from "../lib/tournament-name-rules.js";

const event = {
  type: "tournament",
  pairRegistrations: [
    {
      id: "pair-1",
      divisionId: "novice_mens_doubles",
      player1: { playerId: "user@test.com", name: "" },
      player2: { playerId: "p2-x", name: "Partner" },
    },
  ],
  registrations: [],
};

const playerId = "user@test.com";
let failed = 0;

function assert(name, condition) {
  if (!condition) {
    console.error("FAIL:", name);
    failed++;
    return;
  }
  console.log("OK:", name);
}

assert("counts account pair", getTournamentPairCountForPlayer(event, playerId) === 1);

assert(
  "allows second entry when display name empty (old logic blocked this)",
  canRegisterAnotherTournamentEntry(event, playerId, "") === true
);

assert(
  "blocks third entry",
  canRegisterAnotherTournamentEntry(
    {
      ...event,
      pairRegistrations: [
        event.pairRegistrations[0],
        {
          id: "pair-2",
          divisionId: "novice_mixed_doubles",
          player1: { playerId: "user@test.com", name: "" },
          player2: { playerId: "p2-y", name: "Partner 2" },
        },
      ],
    },
    playerId,
    ""
  ) === false
);

assert(
  "new player can register",
  canRegisterAnotherTournamentEntry({ type: "tournament", pairRegistrations: [] }, "new@test.com", "New") ===
    true
);

assert(
  "no player id cannot register",
  canRegisterAnotherTournamentEntry({ type: "tournament", pairRegistrations: [] }, "", "New") === false
);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll registration status tests passed");
process.exit(failed ? 1 : 0);
