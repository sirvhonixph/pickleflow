import { applyTournamentPlayerRegistration } from "../lib/tournament-pairs.js";
import { validateTournamentRegistration } from "../lib/tournament-payment.js";
import { canRegisterAnotherTournamentEntry } from "../lib/tournament-name-rules.js";

const paymentConfig = {
  entryFee: "500",
  gcash: { enabled: true, number: "09123456789" },
  bankQr: { enabled: false, imageDataUrl: "" },
};

const baseEvent = {
  type: "tournament",
  status: "active",
  tournamentPhase: "registration",
  pairRegistrations: [],
  registrations: [],
  tournamentDivisions: {},
  divisionPairLimit: 20,
  offeredDivisionIds: [],
  paymentConfig,
};

const player = {
  playerId: "player@test.com",
  email: "player@test.com",
  name: "Test Player",
  pairName: "Team Alpha",
  partnerName: "Partner One",
  clubName: "Test Club",
  category: "novice",
  divisionFormat: "mens",
  paymentMethod: "gcash",
  paymentProofDataUrl: "data:image/png;base64,abc",
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

const validated = validateTournamentRegistration(baseEvent, {
  ...player,
  registrantName: player.name,
});
assert("validates novice mens registration", validated.divisionId === "novice_mens_doubles");

const afterFirst = applyTournamentPlayerRegistration(baseEvent, player);
assert("adds pair on player registration", afterFirst.pairRegistrations.length === 1);
assert("adds registration row", afterFirst.registrations.length === 1);
assert(
  "pair linked to registration",
  afterFirst.registrations[0].tournamentEntry?.pairId === afterFirst.pairRegistrations[0].id
);

assert(
  "can register second entry after first",
  canRegisterAnotherTournamentEntry(afterFirst, player.playerId, player.name) === true
);

const afterSecond = applyTournamentPlayerRegistration(afterFirst, {
  ...player,
  partnerName: "Partner Two",
  pairName: "Team Beta",
});
assert("adds second pair", afterSecond.pairRegistrations.length === 2);

assert(
  "blocks third entry",
  canRegisterAnotherTournamentEntry(afterSecond, player.playerId, player.name) === false
);

let beginnerFormBlocked = false;
try {
  validateTournamentRegistration(baseEvent, {
    ...player,
    category: "beginner",
    divisionFormat: "mens",
    registrantName: player.name,
  });
} catch (err) {
  beginnerFormBlocked = /not offered|valid category/i.test(err.message);
}
assert("rejects beginner category division (no beginner divisions)", beginnerFormBlocked);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll player registration tests passed");
process.exit(failed ? 1 : 0);
