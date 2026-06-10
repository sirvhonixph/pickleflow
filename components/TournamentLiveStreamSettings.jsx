"use client";

export default function TournamentLiveStreamSettings({
  streamUrl,
  onStreamUrlChange,
  liveStreamEnabled,
  streamBusy,
  onSave,
  onToggleEnabled,
  compact = false,
}) {
  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-800/40 ${
        compact ? "p-4 space-y-3" : "p-6 space-y-4"
      }`}
    >
      <div>
        <h3 className={`font-semibold ${compact ? "text-sm" : ""}`}>
          Live video
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Paste a YouTube link for spectators. Same stream for the whole event.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="url"
          className="flex-1 min-w-[200px] p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white"
          placeholder="YouTube link (youtube.com/watch?v=… or youtu.be/…)"
          value={streamUrl}
          disabled={streamBusy}
          onChange={(e) => onStreamUrlChange(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 cursor-pointer"
            checked={!!liveStreamEnabled}
            disabled={streamBusy}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          Show live video
        </label>
        <button
          type="button"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm disabled:opacity-50"
          disabled={streamBusy}
          onClick={() => onSave({ liveStreamUrl: streamUrl })}
        >
          {streamBusy ? "Saving…" : "Save URL"}
        </button>
      </div>
    </div>
  );
}
