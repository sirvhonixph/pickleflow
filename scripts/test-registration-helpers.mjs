import {
  buildRegistrationDivisionId,
  getOfferedFormatOptions,
  getOfferedSkillCategories,
  resolveRegistrationCategory,
  resolveRegistrationFormat,
} from "../lib/tournament-registration.js";

const event = {
  type: "tournament",
  offeredDivisionIds: [],
  pairRegistrations: [],
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

const offered = getOfferedSkillCategories(event);
assert("default offers novice+intermediate", offered.includes("novice") && offered.includes("intermediate"));

assert(
  "beginner profile maps to offered skill",
  resolveRegistrationCategory(event, { userCategory: "beginner" }) === "novice"
);

assert(
  "locked category respected when offered",
  resolveRegistrationCategory(event, { lockedCategory: "intermediate", userCategory: "beginner" }) ===
    "intermediate"
);

const formats = getOfferedFormatOptions(event, "novice");
assert("novice has 3 formats by default", formats.length === 3);

assert(
  "resolve format falls back when invalid",
  resolveRegistrationFormat(event, "novice", "invalid") === "mens"
);

assert(
  "division id builds correctly",
  buildRegistrationDivisionId("novice", "mens") === "novice_mens_doubles"
);

const restricted = {
  ...event,
  offeredDivisionIds: ["novice_mens_doubles", "novice_womens_doubles"],
};
assert(
  "restricted event only offers novice",
  getOfferedSkillCategories(restricted).join(",") === "novice"
);
assert(
  "restricted formats exclude mixed",
  getOfferedFormatOptions(restricted, "novice").map((f) => f.value).join(",") ===
    "mens,womens"
);

console.log(failed ? `\n${failed} test(s) failed` : "\nAll registration helper tests passed");
process.exit(failed ? 1 : 0);
