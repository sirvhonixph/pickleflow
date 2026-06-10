"use client";

import { useMemo, useState, useEffect } from "react";
import { SKILL_CATEGORIES, categoryLabel } from "@/lib/categories";
import { getOfferedDivisions } from "@/lib/tournament-divisions";
import { hasPaymentMethod } from "@/lib/tournament-payment";
import {
  buildRegistrationDivisionId,
  getDivisionSlotStatus,
  getOfferedFormatOptions,
  getOfferedSkillCategories,
  resolveRegistrationCategory,
  resolveRegistrationFormat,
} from "@/lib/tournament-registration";
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
    () => getOfferedSkillCategories(event),
    [event]
  );
  const lockedCategory = useMemo(
    () => getLockedCategoryForName(event, user?.name ?? user?.email ?? ""),
    [event, user]
  );
  const defaultCategory = useMemo(
    () =>
      resolveRegistrationCategory(event, {
        lockedCategory,
        userCategory: user?.category,
      }),
    [event, lockedCategory, user?.category]
  );

  const [form, setForm] = useState({
    pairName: "",
    partnerName: "",
    clubName: "",
    category: defaultCategory ?? "novice",
    divisionFormat: "mixed",
    ...paymentDefaults,
  });
  const [proofName, setProofName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!defaultCategory) return;
    setForm((f) => {
      const category = lockedCategory ?? defaultCategory;
      const divisionFormat =
        resolveRegistrationFormat(event, category, f.divisionFormat) ?? "mixed";
      if (f.category === category && f.divisionFormat === divisionFormat) {
        return f;
      }
      return { ...f, category, divisionFormat };
    });
  }, [event?.id, lockedCategory, defaultCategory, event]);

  const divisionId = useMemo(
    () => buildRegistrationDivisionId(form.category, form.divisionFormat),
    [form.category, form.divisionFormat]
  );

  const slot = divisionId ? getDivisionSlotStatus(event, divisionId) : null;

  const formatOptions = useMemo(
    () => getOfferedFormatOptions(event, form.category),
    [event, form.category]
  );

  const categoryOptions = useMemo(
    () =>
      SKILL_CATEGORIES.filter((c) => offeredCategories.includes(c.value)),
    [offeredCategories]
  );

  const profileSkillMismatch =
    user?.category &&
    !offeredCategories.includes(user.category) &&
    !lockedCategory;

  const handleSelectDivision = (division) => {
    setForm((f) => ({
      ...f,
      category: division.skill,
      divisionFormat: division.format,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!divisionId) {
      setError("Choose a division to register for.");
      return;
    }
    if (formatOptions.length === 0) {
      setError("No division format is available for this category.");
      return;
    }
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

  if (!offered.length) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        The host has not opened any divisions for registration yet.
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
          Choose your division
        </h3>
        <p className="text-xs text-slate-500 mb-2">
          Tap a division below, or use the category and format dropdowns.
        </p>
        <OfferedDivisionsList
          event={event}
          selectedDivisionId={divisionId}
          onSelectDivision={handleSelectDivision}
        />
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
        {profileSkillMismatch && (
          <p className="text-xs text-amber-300/90 mt-1">
            Your profile skill is {categoryLabel(user.category)}. This
            tournament offers{" "}
            {offeredCategories.map((c) => categoryLabel(c)).join(", ")} only —
            pick one of those divisions below.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
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
            disabled={!!lockedCategory || categoryOptions.length <= 1}
            className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-60"
            value={form.category}
            onChange={(e) => {
              const category = e.target.value;
              const divisionFormat =
                resolveRegistrationFormat(event, category, form.divisionFormat) ??
                "mixed";
              setForm({ ...form, category, divisionFormat });
            }}
          >
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Division *</label>
          {formatOptions.length === 0 ? (
            <p className="mt-1 text-sm text-amber-400">
              No format available for this category. Pick another category.
            </p>
          ) : (
            <select
              required
              disabled={formatOptions.length <= 1}
              className="w-full mt-1 p-2 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-60"
              value={form.divisionFormat}
              onChange={(e) =>
                setForm({ ...form, divisionFormat: e.target.value })
              }
            >
              {formatOptions.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
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

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={busy || slot?.isFull || !divisionId || formatOptions.length === 0}
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
