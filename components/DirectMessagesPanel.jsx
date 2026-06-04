"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchDirectMessages, postDirectMessage } from "@/lib/chat";
import { getCurrentUser, getDisplayName, getPlayerId } from "@/lib/session";
import PlayerAvatar from "@/components/PlayerAvatar";
import { playerProfilePath } from "@/lib/players";

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DirectMessagesPanel({
  withPlayerId,
  withPlayerName,
  withAvatar,
  onMessageActivity,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const user = getCurrentUser();
  const playerId = getPlayerId(user);

  const load = useCallback(async () => {
    if (!playerId || !withPlayerId) return;
    try {
      const data = await fetchDirectMessages(withPlayerId, playerId);
      setMessages(data.messages ?? []);
      onMessageActivity?.();
    } catch {
      /* ignore */
    }
  }, [playerId, withPlayerId, onMessageActivity]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!playerId || !withPlayerId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      await postDirectMessage({
        fromId: playerId,
        fromName: getDisplayName(user),
        toId: withPlayerId,
        toName: withPlayerName ?? withPlayerId,
        text: trimmed,
      });
      setText("");
      await load();
    } catch (err) {
      setError(err.message ?? "Could not send");
    } finally {
      setBusy(false);
    }
  };

  if (!withPlayerId) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm h-full flex items-center justify-center">
        Select a player to start a private conversation.
      </div>
    );
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full min-h-[360px]">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
        <PlayerAvatar
          player={{ name: withPlayerName, avatarDataUrl: withAvatar }}
          size="sm"
        />
        <div className="min-w-0">
          <Link
            href={playerProfilePath(withPlayerId)}
            className="font-semibold text-sm hover:text-cyan-400 truncate block"
          >
            {withPlayerName ?? withPlayerId}
          </Link>
          <p className="text-xs text-slate-500">Private message</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No messages yet. Send the first one.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.fromId === playerId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-purple-500/20 border border-purple-500/30"
                      : "bg-slate-800 border border-slate-700"
                  }`}
                >
                  <p className="text-xs text-slate-500 mb-0.5">
                    {formatTime(m.createdAt)}
                  </p>
                  <p className="text-slate-200 whitespace-pre-wrap break-words">
                    {m.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="p-3 border-t border-slate-800 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a private message…"
          maxLength={500}
          disabled={!playerId}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !text.trim() || !playerId}
          className="px-4 py-2 bg-purple-500 font-semibold rounded-lg text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}
