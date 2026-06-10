import { upsertPlayer } from "../lib/store-server.js";
import { isValidCategory } from "../lib/player-category.js";

let failed = 0;

function assert(name, condition) {
  if (!condition) {
    console.error("FAIL:", name);
    failed++;
    return;
  }
  console.log("OK:", name);
}

const email = `test-profile-${Date.now()}@example.com`;

const created = await upsertPlayer({
  email,
  name: "Profile Test",
  category: "intermediate",
});
assert("creates player with valid category", created.category === "intermediate");

const updated = await upsertPlayer({
  email,
  category: "novice",
});
assert("updates category", updated.category === "novice");

const invalidKept = await upsertPlayer({
  email,
  category: "not-a-real-category",
});
assert(
  "invalid category keeps previous value",
  invalidKept.category === "novice" && isValidCategory(invalidKept.category)
);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll profile category tests passed");
process.exit(failed ? 1 : 0);
