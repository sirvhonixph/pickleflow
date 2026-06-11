/**
 * Full tournament trial through HTTP API (dev server must be running).
 * Usage: node scripts/test-api-full-trial.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3001";
const hostId = "api-trial-host@test.com";
const divId = "novice_mens_doubles";

async function json(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} ${res.status}: ${data.error ?? JSON.stringify(data)}`);
  }
  return data;
}

let failed = 0;
function assert(name, ok, detail = "") {
  if (!ok) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const stamp = Date.now();
const { event: created } = await json("POST", "/api/events", {
  hostId,
  hostName: "API Trial Host",
  type: "tournament",
  status: "active",
  name: `API Trial ${stamp}`,
  tournamentPhase: "registration",
  offeredDivisionIds: [divId],
  registrations: [
    {
      playerId: hostId,
      name: "API Trial Host",
      email: hostId,
      category: "novice",
      joinedAt: stamp,
    },
  ],
});

const eventId = created.id;
assert("create tournament event", !!eventId, String(eventId));

let event = (await json("POST", `/api/events/${eventId}/court`, { hostId, label: "Court 1" })).event;
assert("add court", (event.courts?.length ?? 0) === 1);

for (let i = 1; i <= 5; i++) {
  event = (
    await json("POST", `/api/events/${eventId}/pairs`, {
      hostId,
      divisionId: divId,
      player1Name: `Pair${i}A`,
      player2Name: `Pair${i}B`,
    })
  ).event;
}
assert("5 pairs registered", (event.pairRegistrations ?? []).length === 5);

event = (
  await json("POST", `/api/events/${eventId}/tournament/setup`, {
    hostId,
    divisionId: divId,
  })
).event;

const bracket = event.tournamentDivisions?.[divId]?.brackets?.[0];
const matches = [...(bracket?.matches ?? [])].sort(
  (a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0)
);
assert("10 RR matches generated", matches.length === 10, String(matches.length));

for (let i = 0; i < matches.length; i++) {
  const m = matches[i];
  const scoreA = 11;
  const scoreB = 8 + (i % 3);

  event = (
    await json("PATCH", `/api/events/${eventId}/tournament/match`, {
      hostId,
      divisionId: divId,
      bracketId: bracket.id,
      matchId: m.id,
      status: "live",
      scoreA: 0,
      scoreB: 0,
    })
  ).event;

  event = (
    await json("PATCH", `/api/events/${eventId}/tournament/match`, {
      hostId,
      divisionId: divId,
      bracketId: bracket.id,
      matchId: m.id,
      status: "live",
      scoreA: 5,
      scoreB: 3,
    })
  ).event;

  const liveCourt = event.courts?.[0]?.id;
  const liveMatch = event.tournamentDivisions?.[divId]?.brackets?.[0]?.matches?.find(
    (row) => row.status === "live"
  );
  assert(`match ${i + 1} live after autosave`, liveMatch?.status === "live");

  event = (
    await json("PATCH", `/api/events/${eventId}/tournament/match`, {
      hostId,
      divisionId: divId,
      bracketId: bracket.id,
      matchId: m.id,
      status: "completed",
      scoreA,
      scoreB,
    })
  ).event;

  const div = event.tournamentDivisions?.[divId];
  const lockedCount = (div?.brackets?.[0]?.matches ?? []).filter(
    (row) => row.resultLocked === true
  ).length;
  assert(`locked count after match ${i + 1}`, lockedCount === i + 1, String(lockedCount));
}

event = (await json("GET", `/api/events/${eventId}`)).event;
const finalDiv = event.tournamentDivisions?.[divId];
const finalBracket = finalDiv?.brackets?.[0];
const standings = finalBracket?.standings ?? [];
assert("standings has 5 pairs", standings.length === 5, String(standings.length));
assert(
  "pool marked complete",
  finalBracket?.poolComplete === true
);

console.log(failed ? `\n${failed} API TRIAL CHECK(S) FAILED` : "\nALL API TRIAL CHECKS PASSED");
console.log(`Event: ${base}/events/${eventId}`);
process.exit(failed ? 1 : 0);
