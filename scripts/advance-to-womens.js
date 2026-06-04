const fs = require("fs");
const path = require("path");

const storePath = path.join(__dirname, "..", "data", "pickleflow-store.json");
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const eventId = "1780313091377";

const event = store.events.find((e) => e.id === eventId);
if (!event) {
  console.error("Event not found");
  process.exit(1);
}

const mens = event.tournamentDivisions?.novice_mens_doubles;
if (mens) {
  mens.divisionComplete = true;
  // Keep all pool / finals data intact — only mark finished so courts advance.
  if (!mens.championPairId && mens.knockout?.rounds) {
    const final = mens.knockout.rounds.find((r) => r.id === "final")?.matches?.[0];
    if (final?.winnerPairId) mens.championPairId = final.winnerPairId;
  }
}

event.activeDivisionId = "novice_womens_doubles";
event.tournamentPhase = "pool_play";

fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log("Simon Cup updated:");
console.log("  novice_mens_doubles → divisionComplete (history preserved)");
console.log("  activeDivisionId → novice_womens_doubles");
