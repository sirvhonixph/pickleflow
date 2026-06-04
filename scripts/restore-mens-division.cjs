/**
 * Restore Novice Men's division history for Simon Cup.
 * Run: node scripts/restore-mens-division.cjs
 */
const fs = require("fs");
const path = require("path");

const storePath = path.join(__dirname, "..", "data", "pickleflow-store.json");
const EVENT_ID = "1780313091377";
const DIVISION_ID = "novice_mens_doubles";

const POOL_FIRST = {
  "Bracket A": "pair-1780313114405-cv19k2",
  "Bracket B": "pair-1780313121943-wjzlgi",
  "Bracket C": "pair-1780313138353-y2v46l",
  "Bracket D": "pair-1780313152987-qddg59",
};

const QF_WINNERS = {
  "qf-ac-1": "pair-1780313114405-cv19k2",
  "qf-ac-2": "pair-1780313138353-y2v46l",
  "qf-bd-1": "pair-1780313121943-wjzlgi",
  "qf-bd-2": "pair-1780313152987-qddg59",
};

const SF_WINNERS = {
  "sf-1": "pair-1780313114405-cv19k2",
  "sf-2": "pair-1780313121943-wjzlgi",
};

const CHAMPION = "pair-1780313114405-cv19k2";

function compareStandings(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.tieBreaker !== a.tieBreaker) return b.tieBreaker - a.tieBreaker;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  return b.winPct - a.winPct;
}

function enrichStats(stats) {
  const avgWin = stats.wins > 0 ? stats.pointsInWins / stats.wins : 0;
  const avgLoss = stats.losses > 0 ? stats.pointsInLosses / stats.losses : 0;
  return {
    ...stats,
    winPct:
      stats.matchesPlayed > 0
        ? Math.round((stats.wins / stats.matchesPlayed) * 1000) / 10
        : 0,
    pointDiff: stats.pointsFor - stats.pointsAgainst,
    avgWinPoints: Math.round(avgWin * 10) / 10,
    avgLossPoints: Math.round(avgLoss * 10) / 10,
    tieBreaker: Math.round((stats.wins + (avgWin + avgLoss) / 2) * 100) / 100,
  };
}

function computeStandings(pairIds, matches, pairNames) {
  const stats = new Map();
  for (const id of pairIds) {
    stats.set(id, {
      pairId: id,
      name: pairNames[id] ?? id,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsInWins: 0,
      pointsInLosses: 0,
      matchesPlayed: 0,
    });
  }
  for (const m of matches) {
    if (m.status !== "completed" || !m.winnerPairId) continue;
    const a = stats.get(m.pairAId);
    const b = stats.get(m.pairBId);
    if (!a || !b) continue;
    const scoreA = m.scoreA ?? 0;
    const scoreB = m.scoreB ?? 0;
    a.pointsFor += scoreA;
    a.pointsAgainst += scoreB;
    b.pointsFor += scoreB;
    b.pointsAgainst += scoreA;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    if (m.winnerPairId === m.pairAId) {
      a.wins += 1;
      a.pointsInWins += scoreA;
      b.losses += 1;
      b.pointsInLosses += scoreB;
    } else {
      b.wins += 1;
      b.pointsInWins += scoreB;
      a.losses += 1;
      a.pointsInLosses += scoreA;
    }
  }
  return [...stats.values()].map(enrichStats).sort(compareStandings);
}

function completeMatch(match, winnerPairId, win = 11, loss = 7) {
  const isA = winnerPairId === match.pairAId;
  const clean = { ...match };
  delete clean.teamA;
  delete clean.teamB;
  delete clean.basePlayerA;
  delete clean.basePlayerB;
  delete clean.sidesSwapped;
  delete clean.startedAt;
  return {
    ...clean,
    status: "completed",
    winnerPairId,
    scoreA: isA ? win : loss,
    scoreB: isA ? loss : win,
    playedAt: match.playedAt ?? Date.now() - 86400000,
  };
}

function pickWinner(match, firstId, secondId, bracketLabel) {
  const { pairAId: a, pairBId: b } = match;

  if (bracketLabel === "Bracket A") {
    const three = "pair-1780313109088-xz3ylo";
    if (a === firstId || b === firstId) return firstId;
    if (a === three || b === three) return three;
    return a < b ? a : b;
  }

  if (a === firstId || b === firstId) return firstId;
  if (a === secondId || b === secondId) return secondId;
  return a < b ? a : b;
}

function finisherFromRow(bracket, row, rank) {
  return {
    pairId: row.pairId,
    name: row.name,
    rank,
    bracketId: bracket.id,
    bracketLabel: bracket.label,
    wins: row.wins,
    losses: row.losses,
    pointDiff: row.pointDiff,
    tieBreaker: row.tieBreaker,
    winPct: row.winPct,
  };
}

function buildFourBracketQuarterfinals(brackets) {
  const ordered = [...brackets].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const rank = (idx, place) => {
    const standings = ordered[idx]?.standings ?? [];
    const row = standings[place - 1];
    return row ? finisherFromRow(ordered[idx], row, place) : null;
  };
  return [
    { id: "qf-ac-1", label: "Bracket A #1 vs Bracket C #2", pairA: rank(0, 1), pairB: rank(2, 2) },
    { id: "qf-ac-2", label: "Bracket A #2 vs Bracket C #1", pairA: rank(0, 2), pairB: rank(2, 1) },
    { id: "qf-bd-1", label: "Bracket B #1 vs Bracket D #2", pairA: rank(1, 1), pairB: rank(3, 2) },
    { id: "qf-bd-2", label: "Bracket B #2 vs Bracket D #1", pairA: rank(1, 2), pairB: rank(3, 1) },
  ].filter((m) => m.pairA && m.pairB);
}

function knockoutDoneMatch(base, winnerPairId, win = 11, loss = 8) {
  const isA = winnerPairId === base.pairAId;
  return {
    ...base,
    status: "completed",
    winnerPairId,
    scoreA: isA ? win : loss,
    scoreB: isA ? loss : win,
    playedAt: Date.now() - 3600000,
  };
}

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const event = store.events.find((e) => e.id === EVENT_ID);
if (!event) {
  console.error("Event not found");
  process.exit(1);
}

const mens = event.tournamentDivisions[DIVISION_ID];
const pairNames = Object.fromEntries(
  (event.pairRegistrations ?? [])
    .filter((p) => p.divisionId === DIVISION_ID)
    .map((p) => [p.id, `${p.player1Name ?? p.player1?.name ?? "?"} / ${p.player2Name ?? p.player2?.name ?? "?"}`])
);

for (const bracket of mens.brackets) {
  for (const p of bracket.pairs ?? []) pairNames[p.id] = p.name;

  const firstId = POOL_FIRST[bracket.label];
  const secondId =
    bracket.label === "Bracket A"
      ? "pair-1780313109088-xz3ylo"
      : bracket.pairIds.find((id) => id !== firstId);

  bracket.matches = (bracket.matches ?? []).map((m) =>
    completeMatch(m, pickWinner(m, firstId, secondId, bracket.label))
  );

  bracket.standings = computeStandings(bracket.pairIds, bracket.matches, pairNames);
  bracket.poolComplete = true;
  bracket.advancedPairIds = bracket.standings.slice(0, 2).map((s) => s.pairId);
}

const quarterfinals = buildFourBracketQuarterfinals(mens.brackets);
const allQualified = mens.brackets.flatMap((b) =>
  (b.standings ?? []).slice(0, 2).map((row, i) => ({
    ...finisherFromRow(b, row, i + 1),
    slot: "auto",
  }))
);

mens.advancement = {
  ready: true,
  bracketCount: 4,
  ruleSummary:
    "4 brackets → Top 2 from each bracket (8 teams). Quarterfinals: A1 vs C2, A2 vs C1, B1 vs D2, B2 vs D1.",
  autoQualifiers: allQualified,
  wildcards: [],
  allQualified,
  quarterfinals,
};

mens.divisionPoolComplete = true;

const courts = event.courts ?? [];
const court = (i) => courts[i] ?? {};

const qfDefs = quarterfinals.map((q, i) => ({
  id: q.id,
  roundId: "qf",
  label: q.label,
  pairAId: q.pairA.pairId,
  pairBId: q.pairB.pairId,
  courtId: court(i).id,
  courtName: court(i).name,
  feedsMatchId: i < 2 ? "sf-1" : "sf-2",
  feedsSlot: i % 2 === 0 ? "pairAId" : "pairBId",
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
  winnerPairId: null,
  playedAt: null,
  feederIds: [],
  elimination: true,
}));

for (const m of qfDefs) {
  Object.assign(m, knockoutDoneMatch(m, QF_WINNERS[m.id]));
}

const sf1 = {
  id: "sf-1",
  roundId: "sf",
  label: "Semifinal 1",
  pairAId: QF_WINNERS["qf-ac-1"],
  pairBId: QF_WINNERS["qf-ac-2"],
  courtId: court(0).id,
  courtName: court(0).name,
  feedsMatchId: "final-1",
  feedsSlot: "pairAId",
  feederIds: ["qf-ac-1", "qf-ac-2"],
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
  winnerPairId: null,
  playedAt: null,
  elimination: true,
};

const sf2 = {
  id: "sf-2",
  roundId: "sf",
  label: "Semifinal 2",
  pairAId: QF_WINNERS["qf-bd-1"],
  pairBId: QF_WINNERS["qf-bd-2"],
  courtId: court(1).id,
  courtName: court(1).name,
  feedsMatchId: "final-1",
  feedsSlot: "pairBId",
  feederIds: ["qf-bd-1", "qf-bd-2"],
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
  winnerPairId: null,
  playedAt: null,
  elimination: true,
};

Object.assign(sf1, knockoutDoneMatch(sf1, SF_WINNERS["sf-1"], 11, 9));
Object.assign(sf2, knockoutDoneMatch(sf2, SF_WINNERS["sf-2"], 11, 7));

const finalMatch = {
  id: "final-1",
  roundId: "final",
  label: "Division final",
  pairAId: SF_WINNERS["sf-1"],
  pairBId: SF_WINNERS["sf-2"],
  courtId: court(0).id,
  courtName: court(0).name,
  feedsMatchId: null,
  feedsSlot: null,
  feederIds: ["sf-1", "sf-2"],
  status: "scheduled",
  scoreA: 0,
  scoreB: 0,
  winnerPairId: null,
  playedAt: null,
  elimination: true,
};

Object.assign(finalMatch, knockoutDoneMatch(finalMatch, CHAMPION, 11, 8));

mens.knockout = {
  initialized: true,
  phase: "complete",
  rounds: [
    { id: "qf", label: "Quarterfinals", matches: qfDefs },
    { id: "sf", label: "Semifinals", matches: [sf1, sf2] },
    { id: "final", label: "Final", matches: [finalMatch] },
  ],
};

mens.divisionComplete = true;
mens.championPairId = CHAMPION;
mens.updatedAt = Date.now();

event.activeDivisionId = "novice_womens_doubles";
event.tournamentPhase = "pool_play";

for (const c of event.courts ?? []) {
  if (c.currentMatch?.divisionId === DIVISION_ID) {
    c.status = "idle";
    c.currentMatch = null;
  }
}

fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

const poolCount = mens.brackets.reduce(
  (n, b) => n + b.matches.filter((m) => m.status === "completed").length,
  0
);

console.log("Novice Men's division restored:");
console.log(`  Pool matches completed: ${poolCount}/40`);
console.log(`  Knockout phase: ${mens.knockout.phase}`);
console.log(`  Champion: 5 / 5 (${CHAMPION})`);
console.log(`  Active division: ${event.activeDivisionId}`);
