"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { saveEvent } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { readImageAsDataUrl } from "@/lib/image-upload";
import { addDivisionToEvent, buildDivisionId } from "@/lib/tournament-divisions";
import OfferedDivisionsPicker from "@/components/OfferedDivisionsPicker";

export default function CreateEventPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    date: "",
    type: "open_play",
    location: "",
    description: "",
    registrationClosesAt: "",
    divisionPairLimit: "20",
    entryFee: "",
    gcashEnabled: true,
    gcashNumber: "",
    bankQrEnabled: false,
    bankQrImage: "",
    offeredDivisionIds: [],
    extraTournamentDivisions: [],
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const user = getCurrentUser();
    if (!user?.email) {
      setError("Please log in before creating an event.");
      setLoading(false);
      return;
    }

    if (!form.name.trim() || !form.date) {
      setError("Event name and date are required.");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        type: form.type,
        location: form.location.trim(),
        description: form.description.trim(),
      };

      if (form.type === "tournament") {
        const limit = Number(form.divisionPairLimit);
        payload.divisionPairLimit =
          Number.isFinite(limit) && limit >= 2 ? Math.floor(limit) : 20;

        if (form.registrationClosesAt) {
          payload.registrationClosesAt = new Date(
            form.registrationClosesAt
          ).toISOString();
        }

        payload.paymentConfig = {
          entryFee: form.entryFee.trim(),
          gcash: {
            enabled: form.gcashEnabled,
            number: form.gcashNumber.trim(),
          },
          bankQr: {
            enabled: form.bankQrEnabled,
            imageDataUrl: form.bankQrImage,
          },
        };

        if (form.offeredDivisionIds.length > 0) {
          payload.offeredDivisionIds = form.offeredDivisionIds;
        }

        if (form.extraTournamentDivisions.length > 0) {
          payload.extraTournamentDivisions = form.extraTournamentDivisions;
        }
      }

      if (form.type === "open_play") {
        payload.paymentConfig = {
          entryFee: form.entryFee.trim(),
          gcash: {
            enabled: form.gcashEnabled,
            number: form.gcashNumber.trim(),
          },
          bankQr: {
            enabled: form.bankQrEnabled,
            imageDataUrl: form.bankQrImage,
          },
        };
      }

      const created = await saveEvent(payload, user);
      router.push(`/events/${created.id}`);
    } catch (err) {
      setError(err.message ?? "Could not create event");
      setLoading(false);
    }
  };

  return (
    <AppShell>
        <h1 className="text-4xl font-bold mb-2">Create Event</h1>
        <p className="text-slate-400 mb-8">
          Choose open play or tournament for your session.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 p-8 rounded-xl border border-slate-800 space-y-5"
        >
          {error && (
            <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Event type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "open_play" })}
                className={`p-4 rounded-xl border font-semibold transition ${
                  form.type === "open_play"
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                OPEN PLAY
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "tournament" })}
                className={`p-4 rounded-xl border font-semibold transition ${
                  form.type === "tournament"
                    ? "border-purple-500 bg-purple-500/20 text-purple-300"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                TOURNAMENT
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Event name
            </label>
            <input
              required
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Friday Night Open Play"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.date}
              onChange={(e) => {
                const date = e.target.value;
                setForm((f) => {
                  const next = { ...f, date };
                  if (
                    f.type === "tournament" &&
                    date &&
                    !f.registrationClosesAt
                  ) {
                    const d = new Date(`${date}T12:00:00`);
                    d.setDate(d.getDate() - 1);
                    d.setHours(23, 59, 0, 0);
                    const pad = (n) => String(n).padStart(2, "0");
                    next.registrationClosesAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
                  }
                  return next;
                });
              }}
            />
          </div>

          {form.type === "tournament" && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Registration closes
                </label>
                <input
                  type="datetime-local"
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                  value={form.registrationClosesAt}
                  onChange={(e) =>
                    setForm({ ...form, registrationClosesAt: e.target.value })
                  }
                />
                <p className="text-xs text-slate-500 mt-1">
                  Defaults to 11:59 PM the day before the tournament if left
                  unchanged.
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Max pairs per division
                </label>
                <input
                  type="number"
                  min={2}
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                  value={form.divisionPairLimit}
                  onChange={(e) =>
                    setForm({ ...form, divisionPairLimit: e.target.value })
                  }
                />
              </div>

              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h3 className="font-semibold text-purple-300">Divisions offered</h3>
                <OfferedDivisionsPicker
                  value={form.offeredDivisionIds}
                  onChange={(ids) =>
                    setForm({ ...form, offeredDivisionIds: ids })
                  }
                  event={{ extraTournamentDivisions: form.extraTournamentDivisions }}
                  onAddDivision={({ skill, format }) => {
                    try {
                      const mock = {
                        extraTournamentDivisions: form.extraTournamentDivisions,
                      };
                      const result = addDivisionToEvent(mock, { skill, format });
                      const newId = buildDivisionId(skill, format);
                      setForm((f) => ({
                        ...f,
                        extraTournamentDivisions: result.extraTournamentDivisions,
                        offeredDivisionIds:
                          f.offeredDivisionIds.length === 0 ||
                          f.offeredDivisionIds.includes(newId)
                            ? f.offeredDivisionIds
                            : [...f.offeredDivisionIds, newId],
                      }));
                    } catch (err) {
                      setError(err.message ?? "Could not add division");
                    }
                  }}
                />
              </div>

              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h3 className="font-semibold text-purple-300">Payment setup</h3>
                <p className="text-xs text-slate-500">
                  Players pay via GCash and/or bank QR and upload proof when
                  registering.
                </p>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Entry fee (optional)
                  </label>
                  <input
                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                    placeholder="e.g. ₱500 per pair"
                    value={form.entryFee}
                    onChange={(e) =>
                      setForm({ ...form, entryFee: e.target.value })
                    }
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
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
                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                    placeholder="GCash mobile number"
                    value={form.gcashNumber}
                    onChange={(e) =>
                      setForm({ ...form, gcashNumber: e.target.value })
                    }
                  />
                )}

                <label className="flex items-center gap-2 text-sm">
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
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-black file:font-semibold"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await readImageAsDataUrl(file);
                        setForm((f) => ({ ...f, bankQrImage: dataUrl }));
                      } catch (err) {
                        setError(err.message ?? "Could not read QR image");
                      }
                    }}
                  />
                )}
              </div>
            </>
          )}

          {form.type === "open_play" && (
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <h3 className="font-semibold text-cyan-300">Payment setup</h3>
              <p className="text-xs text-slate-500">
                Players pay via GCash and/or bank QR and upload proof when
                registering.
              </p>

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Entry fee (optional)
                </label>
                <input
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                  placeholder="e.g. ₱200 per player"
                  value={form.entryFee}
                  onChange={(e) =>
                    setForm({ ...form, entryFee: e.target.value })
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
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
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
                  placeholder="GCash mobile number"
                  value={form.gcashNumber}
                  onChange={(e) =>
                    setForm({ ...form, gcashNumber: e.target.value })
                  }
                />
              )}

              <label className="flex items-center gap-2 text-sm">
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
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-black file:font-semibold"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await readImageAsDataUrl(file);
                      setForm((f) => ({ ...f, bankQrImage: dataUrl }));
                    } catch (err) {
                      setError(err.message ?? "Could not read QR image");
                    }
                  }}
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Location (optional)
            </label>
            <input
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Club or venue"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Description (optional)
            </label>
            <textarea
              rows={3}
              className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 bg-cyan-500 text-black font-bold rounded-lg disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Event"}
          </button>
        </form>
    </AppShell>
  );
}
