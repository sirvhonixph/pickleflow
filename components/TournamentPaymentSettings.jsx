"use client";

import { useState } from "react";
import { readImageAsDataUrl } from "@/lib/image-upload";
import { normalizePaymentConfig } from "@/lib/tournament-payment";

export default function TournamentPaymentSettings({ event, onSave, busy = false }) {
  const initial = normalizePaymentConfig(event.paymentConfig);
  const [form, setForm] = useState({
    entryFee: initial.entryFee,
    gcashEnabled: initial.gcash.enabled,
    gcashNumber: initial.gcash.number,
    bankQrEnabled: initial.bankQr.enabled,
    bankQrImage: initial.bankQr.imageDataUrl,
  });
  const [error, setError] = useState("");

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setForm((f) => ({ ...f, bankQrImage: dataUrl, bankQrEnabled: true }));
    } catch (err) {
      setError(err.message ?? "Could not read QR image");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (form.gcashEnabled && !form.gcashNumber.trim()) {
      setError("Enter your GCash number or turn GCash off.");
      return;
    }
    if (form.bankQrEnabled && !form.bankQrImage) {
      setError("Upload a bank QR code or turn Bank QR off.");
      return;
    }
    try {
      await onSave({
        entryFee: form.entryFee.trim(),
        gcash: {
          enabled: form.gcashEnabled,
          number: form.gcashNumber.trim(),
        },
        bankQr: {
          enabled: form.bankQrEnabled,
          imageDataUrl: form.bankQrImage,
        },
      });
    } catch (err) {
      setError(err.message ?? "Could not save payment settings");
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div>
        <label className="text-xs text-slate-500">Entry fee (optional)</label>
        <input
          className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
          placeholder="e.g. ₱500 per pair"
          value={form.entryFee}
          onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
        />
      </div>

      <div className="rounded-lg border border-slate-700 p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.gcashEnabled}
            onChange={(e) =>
              setForm({ ...form, gcashEnabled: e.target.checked })
            }
          />
          Accept GCash
        </label>
        {form.gcashEnabled && (
          <input
            className="w-full p-2 rounded-lg bg-slate-800 border border-slate-700"
            placeholder="GCash mobile number (09XX XXX XXXX)"
            value={form.gcashNumber}
            onChange={(e) =>
              setForm({ ...form, gcashNumber: e.target.value })
            }
          />
        )}
      </div>

      <div className="rounded-lg border border-slate-700 p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.bankQrEnabled}
            onChange={(e) =>
              setForm({ ...form, bankQrEnabled: e.target.checked })
            }
          />
          Accept Bank QR
        </label>
        {form.bankQrEnabled && (
          <>
            <input
              type="file"
              accept="image/*"
              className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-black file:font-semibold"
              onChange={handleQrUpload}
            />
            {form.bankQrImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.bankQrImage}
                alt="Bank QR preview"
                className="max-h-40 rounded-lg border border-slate-700"
              />
            )}
          </>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save payment settings"}
      </button>
    </form>
  );
}
