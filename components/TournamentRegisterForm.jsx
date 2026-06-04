"use client";

import { useMemo, useState, useEffect } from "react";
import { SKILL_CATEGORIES, categoryLabel } from "@/lib/categories";
import { DIVISION_FORMATS, getOfferedDivisions } from "@/lib/tournament-divisions";
import { hasPaymentMethod } from "@/lib/tournament-payment";
import { getDivisionSlotStatus } from "@/lib/tournament-registration";
import {
  getLockedCategoryForName,
  MAX_ENTRIES_PER_NAME_PER_CATEGORY,
} from "@/lib/tournament-name-rules";
import PaymentFields, {
  PaymentProofField,
  usePaymentFormDefaults,
} from "@/components/PaymentFields";
import { OfferedDivisionsList } from "@/components/OfferedDivisionsPicker";
import CategoryBadge from "@/components/CategoryBadge";
export default function TournamentRegisterForm({
  event,
  user,
  onSubmit,
  onCancel,
  busy = false,
}) {
  const paymentDefaults = usePaymentFormDefaults(event.paymentConfig);
  const offered = getOfferedDivisions(event);
  const offeredCategories = useMemo(
    () => [...new Set(offered.map((d) => d.skill))],
    [offered]
  );
  const lockedCategory = useMemo(
    () => getLockedCategoryForName(event, user?.name ?? user?.email ?? ""),
    [event, user]
  );

  const [form, setForm] = useState({
    pairName: "",
    partnerName: "",
    clubName: "",
    category:
      lockedCategory ?? user?.category ?? offeredCategories[0] ?? "novice",
    divisionFormat: "mixed",
    ...paymentDefaults,
  });
  const [proofName, setProofName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (lockedCategory) {
      setForm((f) => ({ ...f, category: lockedCategory }));
    }
  }, [lockedCategory]);

  const divisionId = useMemo(() => {
    if (!form.category || !form.divisionFormat) return null;
    return `${form.category}_${form.divisionFormat}_doubles`;
  }, [form.category, form.divisionFormat]);

  const slot = divisionId ? getDivisionSlotStatus(event, divisionId) : null;

  const formatOptions = DIVISION_FORMATS.filter((f) =>
    offered.some(
      (d) => d.skill === form.category && d.format === f.value
    )
  );

  const handleSubmit = async (e) => {    e.preventDefault();
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
        <h3 className="text-sm font-semibold text-slate-300 mb-2">
          Available divisions
        </h3>
        <OfferedDivisionsList event={event} />
        <p className="text-xs text-slate-500 mt-2">
          Up to {MAX_ENTRIES_PER_NAME_PER_CATEGORY} entries per player in the
          same skill category. Names are locked to one category for the whole
          tournament.
        </p>
        {lockedCategory && (
          <p className="text-xs text-purple-300/90 mt-1">
            Your name is locked to {categoryLabel(lockedCategory)} — both
            entries must use this category.
          </p>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">        <div>
          <label className="text-xs text-slate-500">Your name</label>
          <input
            readOnly
            className="w-full mt-1 p-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400"
            value={user?.name ?? user?.email ?? ""}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Partner name *</label>
          <input
            required
            className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
            value={form.partnerName}
            onChange={(e) =>
              setForm({ ...form, partnerName: e.target.value })
            }
            placeholder="Partner's full name"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500">Pair / team name *</label>
        <input
          required
          className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
          value={form.pairName}
          onChange={(e) => setForm({ ...form, pairName: e.target.value })}
          placeholder="e.g. Smash Bros"
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

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500">Category *</label>
          <select
            required
            disabled={!!lockedCategory}
            className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-60"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >            {SKILL_CATEGORIES.filter((c) =>
              offeredCategories.includes(c.value)
            ).map((c) => (              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Division *</label>
          <select
            required
            className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700"
            value={form.divisionFormat}
            onChange={(e) =>
              setForm({ ...form, divisionFormat: e.target.value })
            }
          >
            {formatOptions.map((f) => (              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {slot && (
        <p className="text-sm flex flex-wrap items-center gap-2">
          <CategoryBadge category={form.category} />
          {slot.isFull ? (
            <span className="text-amber-400">This division is full.</span>
          ) : (
            <span className="text-green-400">
              {slot.remaining} slot{slot.remaining === 1 ? "" : "s"} left (
              {slot.registered}/{slot.limit})
            </span>
          )}
        </p>
      )}

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

      <div className="flex flex-wrap gap-3 pt-2">        <button
          type="submit"
          disabled={busy || slot?.isFull}
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
