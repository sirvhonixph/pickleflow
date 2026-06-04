"use client";

import { useState } from "react";

export default function HostRegistrationRemoveButton({
  onRemove,
  playerName,
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const label = playerName ? `"${playerName}"` : "this registration";
    if (
      !confirm(
        `Remove ${label}? They will be removed from the event and must register again if payment was invalid or fraudulent.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await onRemove();
    } catch (err) {
      alert(err.message ?? "Could not remove registration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handleClick}
      className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600/90 hover:bg-red-500 text-white disabled:opacity-50"
    >
      {busy ? "Removing…" : "Remove registration"}
    </button>
  );
}
