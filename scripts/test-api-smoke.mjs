/**
 * Smoke test against local dev server (must be running: npm run dev).
 * Usage: node scripts/test-api-smoke.mjs [baseUrl] [eventId]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const eventId = process.argv[3];

async function get(path) {
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

let failed = 0;
function assert(name, condition, detail = "") {
  if (!condition) {
    console.error("FAIL:", name, detail);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const eventsRes = await get("/api/events");
assert("GET /api/events", eventsRes.ok, String(eventsRes.status));

const events = eventsRes.data.events ?? [];
const target =
  eventId != null
    ? events.find((e) => String(e.id) === String(eventId))
    : events.find((e) => e.type === "tournament" && e.status !== "ended");

if (!target) {
  console.log("SKIP: no tournament event in local store for API pair test");
} else {
  const id = target.id;
  const hostId = target.hostId;
  const before = (target.pairRegistrations ?? []).length;

  const pairRes = await post(`/api/events/${id}/pairs`, {
    hostId,
    divisionId: "novice_mens_doubles",
    player1Name: `SmokeA-${Date.now()}`,
    player2Name: `SmokeB-${Date.now()}`,
  });

  if (pairRes.ok) {
    const after = (pairRes.data.event?.pairRegistrations ?? []).length;
    assert("POST /api/events/:id/pairs adds pair", after === before + 1, `before=${before} after=${after}`);
  } else {
    assert(
      "POST /api/events/:id/pairs responds",
      pairRes.status === 400 && pairRes.data.error,
      pairRes.data.error ?? String(pairRes.status)
    );
  }

  const oneRes = await get(`/api/events/${id}`);
  assert("GET /api/events/:id", oneRes.ok, String(oneRes.status));
}

const profileRes = await fetch(`${base}/api/players/me`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    playerId: "smoke-test@example.com",
    category: "not-valid",
  }),
});
const profileData = await profileRes.json().catch(() => ({}));
assert(
  "PATCH profile rejects invalid category",
  profileRes.status === 400,
  profileData.error ?? String(profileRes.status)
);

console.log(failed ? `\n${failed} smoke test(s) failed` : "\nAll API smoke tests passed");
process.exit(failed ? 1 : 0);
