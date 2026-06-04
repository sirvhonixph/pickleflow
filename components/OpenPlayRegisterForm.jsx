"use client";

import { useState } from "react";
import { SKILL_CATEGORIES } from "@/lib/categories";
import { hasPaymentMethod, normalizePaymentConfig } from "@/lib/tournament-payment";
import PaymentFields, {
  PaymentProofField,
  usePaymentFormDefaults,
} from "@/components/PaymentFields";

export default function OpenPlayRegisterForm({
  event,
  user,
  onSubmit,
  onCancel,
  busy = false,
}) {
  const paymentDefaults = usePaymentFormDefaults(event.paymentConfig);
  const [form, setForm] = useState({
    clubName: "",
    category: user?.category ?? "novice",
    ...paymentDefaults,
  });
  const [proofName, setProofName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message ?? "Registration failed");
    }
  };

  if (!hasPaymentMethod(event.paymentConfig)) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        The host has not set up GCash or bank QR payment yet. Check back later
        or contact the organizer.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div>
        <label className="text-xs text-slate-500">Your name</label>
        <input
          readOnly
          className="w-full mt-1 p-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400"
          value={user?.name ?? user?.email ?? ""}
        />
      </div>

      <div>
        <label className="text-xs text-slate-500">Club name *</label>
        <input
          required
          className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
          value={form.clubName}
          onChange={(e) => setForm({ ...form, clubName: e.target.value })}
          placeholder="Your club or team"
        />
      </div>

      <div>
        <label className="text-xs text-slate-500">Category *</label>
        <select
          required
          className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {SKILL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <PaymentFields
        paymentConfig={event.paymentConfig}
        form={form}
        setForm={setForm}
      />

      <PaymentProofField
        form={form}
        setForm={setForm}
        proofName={proofName}
        setProofName={setProofName}
        setError={setError}
      />

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2.5 bg-purple-500 rounded-lg font-semibold disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit registration"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-slate-700 rounded-lg font-semibold"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
