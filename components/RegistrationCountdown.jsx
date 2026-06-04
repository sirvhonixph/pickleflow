"use client";

import { useEffect, useState } from "react";
import {
  formatRegistrationCountdown,
  isRegistrationClosed,
  resolveRegistrationClosesMs,
} from "@/lib/tournament-registration";

export default function RegistrationCountdown({ event, className = "" }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const closesMs = resolveRegistrationClosesMs(event);
  if (!closesMs || event?.type !== "tournament") return null;

  const closed = isRegistrationClosed(event, now);
  const remaining = closesMs - now;
  const closesLabel = new Date(closesMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <p className={className}>
      {closed ? (
        <span className="text-amber-400">Registration closed</span>
      ) : (
        <>
          Registration closes in{" "}
          <span className="text-cyan-400 font-medium">
            {formatRegistrationCountdown(remaining)}
          </span>
          <span className="text-slate-600"> · {closesLabel}</span>
        </>
      )}
    </p>
  );
}
