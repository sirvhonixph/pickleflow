import fs from "fs";

const path =
  process.argv[2] ??
  "C:/Users/ADMIN/.cursor/projects/c-Users-ADMIN-Pickleflow/agent-tools/6444734d-8432-4021-a99b-e50ee987fe6f.txt";
const raw = fs.readFileSync(path, "utf8");
const data = JSON.parse(raw);
const ev = data.event ?? data;
const pr = ev.pairRegistrations ?? [];

console.log("event:", ev.id, ev.title);
console.log("status:", ev.status, "phase:", ev.tournamentPhase);
console.log("total pairs:", pr.length);

const byDiv = {};
for (const p of pr) {
  byDiv[p.divisionId] = (byDiv[p.divisionId] ?? 0) + 1;
}
console.log("by division:", byDiv);

const nm = pr.filter((p) => p.divisionId === "novice_mens_doubles");
console.log("\nnovice_mens_doubles:", nm.length);
for (const p of nm) {
  console.log(
    `  ${p.player1?.name} / ${p.player2?.name} | p1=${p.player1?.playerId} p2=${p.player2?.playerId} | ${p.id}`
  );
}
