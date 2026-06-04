"use client";

import { useEffect, useState } from "react";
import { categoryLabel } from "@/lib/categories";
import { divisionLabel } from "@/lib/tournament-divisions";
import { getSkillsWithOfferedDivisions } from "@/lib/tournament-court-pools";
import { getTierDivisionOrder } from "@/lib/tournament-division-schedule";
import { updateTierDivisionOrder } from "@/lib/events";

export default function TierDivisionOrderEditor({
  event,
  eventId,
  disabled,
  onEventUpdate,
}) {
  const [busySkill, setBusySkill] = useState(null);
  const [localOrder, setLocalOrder] = useState(() => event?.tierDivisionOrder ?? {});
  const skills = getSkillsWithOfferedDivisions(event);

  useEffect(() => {
    setLocalOrder(event?.tierDivisionOrder ?? {});
  }, [event?.tierDivisionOrder, event?.id]);

  if (skills.length === 0) return null;

  const orderForSkill = (skill) =>
    getTierDivisionOrder({ ...event, tierDivisionOrder: localOrder }, skill);

  const move = async (skill, index, delta) => {
    const order = [...orderForSkill(skill)];
    const next = index + delta;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];

    setLocalOrder((prev) => ({ ...prev, [skill]: order }));
    setBusySkill(skill);
    try {
      const ev = await updateTierDivisionOrder(eventId, skill, order);
      onEventUpdate(ev);
    } catch (err) {
      setLocalOrder(event?.tierDivisionOrder ?? {});
      alert(err.message ?? "Could not save order");
    } finally {
      setBusySkill(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">
          Division play order (per skill tier)
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          The top division in each list occupies that tier&apos;s courts first.
          Lower divisions play when earlier ones finish.
        </p>
      </div>
      {skills.map((skill) => {
        const order = orderForSkill(skill);
        if (order.length < 2) return null;
        const busy = busySkill === skill || disabled;
        return (
          <div key={skill}>
            <p className="text-xs font-medium text-cyan-400/90 mb-2">
              {categoryLabel(skill)}
            </p>
            <ol className="space-y-1.5">
              {order.map((divisionId, index) => (
                <li
                  key={divisionId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="text-slate-500 mr-2">{index + 1}.</span>
                    {divisionLabel(divisionId, event)}
                    {index === 0 && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-400/90">
                        courts first
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => move(skill, index, -1)}
                      className="px-2 py-0.5 text-xs rounded bg-slate-800 border border-slate-700 disabled:opacity-40 hover:border-purple-500/50"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === order.length - 1}
                      onClick={() => move(skill, index, 1)}
                      className="px-2 py-0.5 text-xs rounded bg-slate-800 border border-slate-700 disabled:opacity-40 hover:border-purple-500/50"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
