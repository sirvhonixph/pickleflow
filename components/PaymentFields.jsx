"use client";

import { useState } from "react";
import { readImageAsDataUrl } from "@/lib/image-upload";
import { normalizePaymentConfig } from "@/lib/tournament-payment";

export default function PaymentFields({
  paymentConfig,
  form,
  setForm,
}) {
  const payment = normalizePaymentConfig(paymentConfig);

  return (
    <>
      {payment.entryFee && (
        <p className="text-sm text-slate-300">
          Entry fee:{" "}
          <span className="font-semibold text-cyan-400">{payment.entryFee}</span>
        </p>
      )}

      <div>
        <label className="text-xs text-slate-500 block mb-2">
          Payment method *
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          {payment.gcash.enabled && payment.gcash.number && (
            <label
              className={`rounded-lg border p-3 cursor-pointer ${
                form.paymentMethod === "gcash"
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-700"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                className="sr-only"
                checked={form.paymentMethod === "gcash"}
                onChange={() => setForm({ ...form, paymentMethod: "gcash" })}
              />
              <p className="font-medium">GCash</p>
              <p className="text-sm text-cyan-400 mt-1">{payment.gcash.number}</p>
            </label>
          )}
          {payment.bankQr.enabled && payment.bankQr.imageDataUrl && (
            <label
              className={`rounded-lg border p-3 cursor-pointer ${
                form.paymentMethod === "bank_qr"
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-700"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                className="sr-only"
                checked={form.paymentMethod === "bank_qr"}
                onChange={() => setForm({ ...form, paymentMethod: "bank_qr" })}
              />
              <p className="font-medium">Bank QR</p>
              <p className="text-xs text-slate-500 mt-1">Scan to pay</p>
            </label>
          )}
        </div>
      </div>

      {form.paymentMethod === "bank_qr" && payment.bankQr.imageDataUrl && (
        <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/50">
          <p className="text-xs text-slate-500 mb-2">Scan this QR code to pay</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payment.bankQr.imageDataUrl}
            alt="Bank payment QR code"
            className="max-h-48 mx-auto rounded-lg"
          />
        </div>
      )}
    </>
  );
}

export function PaymentProofField({ form, setForm, proofName, setProofName, setError }) {
  const handleProofChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setForm((f) => ({ ...f, paymentProofDataUrl: dataUrl }));
      setProofName(file.name);
    } catch (err) {
      setError(err.message ?? "Could not read image");
      e.target.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs text-slate-500">Proof of payment *</label>
      <input
        type="file"
        accept="image/*"
        required={!form.paymentProofDataUrl}
        className="w-full mt-1 text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white file:font-semibold"
        onChange={handleProofChange}
      />
      {proofName && (
        <p className="text-xs text-green-400 mt-1">Attached: {proofName}</p>
      )}
      {form.paymentProofDataUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={form.paymentProofDataUrl}
          alt="Payment proof preview"
          className="mt-2 max-h-32 rounded-lg border border-slate-700"
        />
      )}
    </div>
  );
}

export function usePaymentFormDefaults(paymentConfig) {
  const payment = normalizePaymentConfig(paymentConfig);
  return {
    paymentMethod:
      payment.gcash.enabled && payment.gcash.number ? "gcash" : "bank_qr",
    paymentProofDataUrl: "",
  };
}
