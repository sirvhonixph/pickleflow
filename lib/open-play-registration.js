import { CATEGORY_ORDER } from "@/lib/categories";
import {
  hasPaymentMethod,
  normalizePaymentConfig,
} from "@/lib/tournament-payment";

export function validateOpenPlayRegistration(event, body) {
  if (event.type !== "open_play") {
    throw new Error("Not an open play event.");
  }
  if (event.status === "ended") {
    throw new Error("This event has ended.");
  }
  if (!hasPaymentMethod(event.paymentConfig)) {
    throw new Error("The host has not set up payment details yet.");
  }

  const clubName = body.clubName?.trim();
  const category = body.category?.trim();
  const paymentMethod = body.paymentMethod?.trim();
  const paymentProofDataUrl = body.paymentProofDataUrl?.trim();

  if (!clubName) throw new Error("Club name is required.");
  if (!category || !CATEGORY_ORDER.includes(category)) {
    throw new Error("Choose a valid category.");
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
      throw new Error("GCash payment is not available for this event.");
    }
  }
  if (paymentMethod === "bank_qr") {
    if (!config.bankQr.enabled || !config.bankQr.imageDataUrl) {
      throw new Error("Bank QR payment is not available for this event.");
    }
  }

  return { clubName, category, paymentMethod, paymentProofDataUrl };
}

export function applyOpenPlayRegistration(event, player) {
  const playerId = (player.playerId ?? player.email ?? "").trim();
  const existing = event.registrations.find((r) => r.playerId === playerId);

  if (existing?.paymentEntry?.paymentProofDataUrl) {
    return event;
  }

  const reg = validateOpenPlayRegistration(event, player);

  const registrationRecord = {
    playerId,
    name: player.name ?? player.email ?? "Player",
    email: player.email ?? playerId,
    category: reg.category,
    joinedAt: existing?.joinedAt ?? Date.now(),
    paymentEntry: {
      clubName: reg.clubName,
      category: reg.category,
      paymentMethod: reg.paymentMethod,
      paymentProofDataUrl: reg.paymentProofDataUrl,
      status: "paid",
      submittedAt: Date.now(),
    },
  };

  const registrations = existing
    ? event.registrations.map((r) =>
        r.playerId === playerId ? registrationRecord : r
      )
    : [...event.registrations, registrationRecord];

  return { ...event, registrations };
}
