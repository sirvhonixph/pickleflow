/**
 * Full round-robin trial: 5 pairs, 1 court, play all 10 matches in order.
 * Verifies locked results, standings, and no reopen when completing later matches.
 */
import { addPairRegistration } from "../lib/tournament-pairs.js";
import { applyDivisionSetup, regenerateDivisionSetup, updateTournamentMatch } from "../lib/tournament-setup.js";
import { refreshTournamentStandings } from "../lib/tournament-setup.js";
import { getCourtTournamentState } from "../lib/tournament-live.js";
import { mergeTournamentDivisions } from "../lib/event-merge.js";
import {
  stabilizeBracketMatches,
  roundRobinPairKey,
} from "../lib/tournament-brackets.js";
import { isRoundRobinMatchLocked } from "../lib/tournament-match-outcome.js";
import { isMatchPlayable } from "../lib/tournament-live.js";
import { matchCountsForStandings } from "../lib/tournament-standings.js";

const divId = "novice_mens_doubles";
const courtId = "court-1";

let event = {
  type: "tournament",
  status: "active",
  tournamentPhase: "registration",
  hostId: "host@test.com",
  pairRegistrations: [],
  registrations: [],
  tournamentDivisions: {},
  offeredDivisionIds: [divId],
  courts: [{ id: courtId, name: "Court 1", skill: "novice" }],
};

const pairNames = ["1A", "2A", "3A", "4A", "5A"];
for (let i = 0; i < 5; i++) {
  event = addPairRegistration(event, {
    divisionId: divId,
    player1Name: pairNames[i],
    player2Name: `${pairNames[i]}-B`,
  });
}

event = applyDivisionSetup(event, divId);
const bracket = event.tournamentDivisions[divId].brackets[0];
const schedule = stabilizeBracketMatches(bracket, {
  scheduleResetAt: event.tournamentDivisions[divId].scheduleResetAt,
}).matches.sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0));

let failed = 0;
function assert(name, ok, detail = "") {
  if (!ok) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

assert("10 matches scheduled", schedule.length === 10, String(schedule.length));

const results = [];
for (let i = 0; i < schedule.length; i++) {
  const m = schedule[i];
  const scoreA = 11;
  const scoreB = 8 + (i % 3);

  event = updateTournamentMatch(event, divId, bracket.id, m.id, {
    status: "live",
    scoreA: 0,
    scoreB: 0,
  });

  let { live } = getCourtTournamentState(event, courtId);
  assert(`match ${i + 1} live on court after start`, live?.match?.id === m.id);

  event = updateTournamentMatch(event, divId, bracket.id, m.id, {
    status: "live",
    scoreA: 5,
    scoreB: 3,
  });

  ({ live } = getCourtTournamentState(event, courtId));
  assert(
    `match ${i + 1} stays live with decisive autosave`,
    live?.match?.id === m.id,
    live ? `${live.match.scoreA}-${live.match.scoreB}` : "no live"
  );

  event = updateTournamentMatch(event, divId, bracket.id, m.id, {
    status: "completed",
    scoreA,
    scoreB,
  });

  event = refreshTournamentStandings(event);
  results.push({ order: m.scheduleOrder, scoreA, scoreB, key: roundRobinPairKey(m) });

  const div = event.tournamentDivisions[divId];
  const view = stabilizeBracketMatches(div.brackets[0], {
    scheduleResetAt: div.scheduleResetAt,
  }).matches;

  for (let j = 0; j < i; j++) {
    const prev = results[j];
    const row = view.find((r) => roundRobinPairKey(r) === prev.key);
    if (!row || !isRoundRobinMatchLocked(row)) {
      assert(
        `match ${j + 1} stays locked after completing match ${i + 1}`,
        false,
        row ? `${row.status} locked=${row.resultLocked}` : "missing"
      );
      break;
    }
  }
  if (i === schedule.length - 1) {
    assert(
      `match ${i + 1} locked after end`,
      view.some(
        (r) =>
          roundRobinPairKey(r) === roundRobinPairKey(m) &&
          isRoundRobinMatchLocked(r)
      )
    );
  }

  const finished = view.filter((r) => matchCountsForStandings(r)).length;
  assert(`standings count after match ${i + 1}`, finished === i + 1, String(finished));
}

const standings = event.tournamentDivisions[divId].brackets[0].standings ?? [];
assert("standings has 5 pairs", standings.length === 5, String(standings.length));
assert("pool complete", event.tournamentDivisions[divId].brackets[0].poolComplete === true);

const beforeRegen = event;
event = regenerateDivisionSetup(event, divId, { force: true });
const merged = {
  ...event,
  tournamentDivisions: mergeTournamentDivisions(beforeRegen, event),
};
const regDiv = merged.tournamentDivisions[divId];
const regSchedule = stabilizeBracketMatches(regDiv.brackets[0], {
  scheduleResetAt: regDiv.scheduleResetAt,
}).matches;
assert(
  "regenerate clears all results",
  regSchedule.every((m) => m.status === "scheduled" && !isRoundRobinMatchLocked(m))
);
assert(
  "regenerate clears confirmed",
  Object.keys(regDiv.brackets[0].confirmedResults ?? {}).length === 0
);

console.log(failed === 0 ? "\nALL FULL RR TRIAL TESTS PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
