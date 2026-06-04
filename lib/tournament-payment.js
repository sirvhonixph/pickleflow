import { buildDivisionId, getOfferedDivisionById } from "@/lib/tournament-divisions";
import { CATEGORY_ORDER, categoryLabel } from "@/lib/categories";
import { getDivisionSlotStatus, isRegistrationClosed } from "@/lib/tournament-registration";
import {
  assertTournamentNameCategoryRules,
  countAccountPairsInCategory,
  getLockedCategoryForName,
  MAX_ENTRIES_PER_NAME_PER_CATEGORY,
} from "@/lib/tournament-name-rules";
export function normalizePaymentConfig(config = {}) {
  return {
    entryFee: config.entryFee?.trim?.() ?? config.entryFee ?? "",
    gcash: {
      enabled: !!config.gcash?.enabled,
      number: (config.gcash?.number ?? "").trim(),
    },
    bankQr: {
      enabled: !!config.bankQr?.enabled,
      imageDataUrl: config.bankQr?.imageDataUrl ?? "",
    },
  };
}

export function hasPaymentMethod(config) {
  const c = normalizePaymentConfig(config);
  return (
    (c.gcash.enabled && c.gcash.number) ||
    (c.bankQr.enabled && c.bankQr.imageDataUrl)
  );
}

export function validateTournamentRegistration(event, body) {
  if (event.type !== "tournament") {
    throw new Error("Not a tournament.");
  }
  if (isRegistrationClosed(event)) {
    throw new Error("Registration is closed.");
  }
  if (!hasPaymentMethod(event.paymentConfig)) {
    throw new Error("The host has not set up payment details yet.");
  }

  const pairName = body.pairName?.trim();
  const partnerName = body.partnerName?.trim();
  const clubName = body.clubName?.trim();
  const category = body.category?.trim();
  const divisionFormat = body.divisionFormat?.trim();
  const paymentMethod = body.paymentMethod?.trim();
  const paymentProofDataUrl = body.paymentProofDataUrl?.trim();

  if (!pairName) throw new Error("Pair / team name is required.");
  if (!partnerName) throw new Error("Partner name is required.");
  if (!clubName) throw new Error("Club name is required.");
  if (!category || !CATEGORY_ORDER.includes(category)) {
    throw new Error("Choose a valid category.");
  }
  if (!divisionFormat || !["mens", "womens", "mixed"].includes(divisionFormat)) {
    throw new Error("Choose a division format.");
  }
  if (!paymentMethod || !["gcash", "bank_qr"].includes(paymentMethod)) {
    throw new Error("Choose a payment method.");
  }
  if (!paymentProofDataUrl?.startsWith("data:image/")) {
    throw new Error("Upload proof of payment (screenshot or photo).");
  }
  if (paymentProofDataUrl.length > 2_800_000) {
    throw new Error("Payment proof image is too large. Use a smaller file.");
  }

  const config = normalizePaymentConfig(event.paymentConfig);
  if (paymentMethod === "gcash") {
    if (!config.gcash.enabled || !config.gcash.number) {
      throw new Error("GCash payment is not available for this tournament.");
    }
  }
  if (paymentMethod === "bank_qr") {
    if (!config.bankQr.enabled || !config.bankQr.imageDataUrl) {
      throw new Error("Bank QR payment is not available for this tournament.");
    }
  }

  const divisionId = buildDivisionId(category, divisionFormat);
  if (!getOfferedDivisionById(event, divisionId)) {
    throw new Error("This division is not offered in the tournament.");
  }

  const slot = getDivisionSlotStatus(event, divisionId);
  if (slot.isFull) {
    throw new Error(`${categoryLabel(category)} division is full.`);
  }

  const registrantName = body.name?.trim() || body.registrantName?.trim();
  assertTournamentNameCategoryRules(event, {
    registrantName,
    partnerName,
    category,
  });

  const playerId = (body.playerId ?? body.email ?? "").trim();
  if (playerId) {
    const locked = getLockedCategoryForName(event, registrantName);
    if (locked && locked !== category) {
      throw new Error(
        `Your name is already registered in ${categoryLabel(locked)}. Additional entries must use the same category.`
      );
    }
    if (countAccountPairsInCategory(event, playerId, category) >= MAX_ENTRIES_PER_NAME_PER_CATEGORY) {
      throw new Error(
        `You already have ${MAX_ENTRIES_PER_NAME_PER_CATEGORY} entries in ${categoryLabel(category)}.`
      );
    }
  }

  return {
    pairName,
    partnerName,
    clubName,
    category,
    divisionFormat,
    divisionId,
    paymentMethod,
    paymentProofDataUrl,
  };
}

export function paymentMethodLabel(method) {
  if (method === "gcash") return "GCash";
  if (method === "bank_qr") return "Bank QR";
  return method;
}
