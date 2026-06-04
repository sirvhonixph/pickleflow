import { isMatchComplete, isMatchLive } from "@/lib/tournament-live";

export function quarterfinalsHaveStarted(knockout) {
  const qf = knockout?.rounds?.find((r) => r.id === "qf");
  return (qf?.matches ?? []).some(
    (m) => m.status === "live" || m.status === "completed"
  );
}

export function getActiveKnockoutRoundLabel(knockout) {
  if (hasPendingBronzeMatch(knockout)) {
    return "Bronze medal match pending";
  }
  switch (knockout?.phase) {
    case "semifinals":
      return "Semifinals";
    case "final":
      return "Gold & bronze medal matches";
    case "complete":
      return "Champion crowned";
    default:
      return "Quarterfinals";
  }
}

export function getSilverMedalistPairId(knockout) {
  const goldMatch = knockout?.rounds
    ?.find((r) => r.id === "final")
    ?.matches?.[0];
  if (!goldMatch || !isMatchComplete(goldMatch) || !goldMatch.winnerPairId) {
    return null;
  }
  return goldMatch.pairAId === goldMatch.winnerPairId
    ? goldMatch.pairBId
    : goldMatch.pairAId;
}

export function getKnockoutMedalists(knockout) {
  return {
    goldId: getKnockoutChampionPairId(knockout),
    silverId: getSilverMedalistPairId(knockout),
    bronzeId: getBronzeMedalistPairId(knockout),
  };
}

export function getBronzeMatch(knockout) {
  return knockout?.rounds?.find((r) => r.id === "bronze")?.matches?.[0] ?? null;
}

export function hasPendingBronzeMatch(knockout) {
  const bronzeMatch = getBronzeMatch(knockout);
  if (!bronzeMatch) return false;
  if (isMatchComplete(bronzeMatch)) return false;
  return !!(bronzeMatch.pairAId && bronzeMatch.pairBId);
}

export function isKnockoutFullyComplete(knockout) {
  const finalMatch = knockout?.rounds
    ?.find((r) => r.id === "final")
    ?.matches?.[0];
  if (!finalMatch || !isMatchComplete(finalMatch)) return false;
  return !hasPendingBronzeMatch(knockout);
}

export function getBronzeMedalistPairId(knockout) {
  const bronzeMatch = getBronzeMatch(knockout);
  if (!bronzeMatch || !isMatchComplete(bronzeMatch)) return null;
  return bronzeMatch.winnerPairId ?? null;
}

export function getKnockoutChampionPairId(knockout) {
  const finalMatch = knockout?.rounds
    ?.find((r) => r.id === "final")
    ?.matches?.[0];
  if (!finalMatch || !isMatchComplete(finalMatch)) return null;
  return finalMatch.winnerPairId ?? null;
}

export function getDivisionChampionPairId(divSetup) {
  if (!divSetup) return null;
  if (divSetup.championPairId) return divSetup.championPairId;
  return getKnockoutChampionPairId(divSetup.knockout);
}

export { isMatchComplete, isMatchLive };
