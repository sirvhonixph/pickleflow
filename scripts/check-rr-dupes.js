const fs = require("fs");
const store = JSON.parse(
  fs.readFileSync("data/pickleflow-store.json", "utf8")
);

let found = 0;
for (const ev of store.events || []) {
  if (ev.type !== "tournament") continue;
  for (const [divId, div] of Object.entries(ev.tournamentDivisions || {})) {
    for (const b of div.brackets || []) {
      const pairIdSet = new Set();
      const dupPairIds = [];
      for (const id of b.pairIds || []) {
        if (pairIdSet.has(id)) dupPairIds.push(id);
        pairIdSet.add(id);
      }

      const keys = new Map();
      const dupes = [];
      for (const m of b.matches || []) {
        const k = [m.pairAId, m.pairBId].sort().join("|");
        if (keys.has(k)) dupes.push({ k, ids: [keys.get(k), m.id] });
        else keys.set(k, m.id);
      }

      const n = b.pairIds?.length || 0;
      const expected = (n * (n - 1)) / 2;
      if (
        dupes.length ||
        dupPairIds.length ||
        (b.matches || []).length > expected
      ) {
        found++;
        console.log(
          JSON.stringify({
            event: ev.name,
            eventId: ev.id,
            div: divId,
            bracket: b.label,
            pairs: n,
            dupPairIds,
            matches: (b.matches || []).length,
            expected,
            dupes,
          })
        );
      }
    }
  }
}
console.log("issues found:", found);
