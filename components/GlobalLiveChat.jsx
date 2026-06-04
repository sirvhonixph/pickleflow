"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchGlobalChat, postGlobalChat } from "@/lib/chat";
import { getCurrentUser, getDisplayName, getPlayerId } from "@/lib/session";
import PlayerAvatar from "@/components/PlayerAvatar";

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function GlobalLiveChat({ compact = false }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const user = getCurrentUser();
  const playerId = getPlayerId(user);

  const load = useCallback(async () => {
    try {
      const data = await fetchGlobalChat();
      setMessages(data.messages ?? []);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!playerId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      await postGlobalChat({
        playerId,
        playerName: getDisplayName(user),
        avatarDataUrl: user?.avatarDataUrl ?? "",
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

  return (
    <section
      className={`bg-slate-900 border border-slate-800 rounded-xl flex flex-col ${
        compact ? "h-[320px]" : "h-[420px]"
      }`}
    >
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm">Community live chat</h2>
          <p className="text-xs text-slate-500">
            All players · use @name to mention someone
          </p>
        </div>
        <Link
          href="/players"
          className="text-xs text-cyan-400 hover:underline shrink-0"
        >
          Find players
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.playerId === playerId;
            return (
              <div
                key={m.id}
                className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}
              >
                <PlayerAvatar
                  player={{
                    name: m.playerName,
                    avatarDataUrl: m.avatarDataUrl,
                  }}
                  size="sm"
                />
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-cyan-500/20 border border-cyan-500/30"
                      : "bg-slate-800 border border-slate-700"
                  }`}
                >
                  <p className="text-xs text-slate-400 mb-0.5">
                    <Link
                      href={`/players/${encodeURIComponent(m.playerId)}`}
                      className="hover:text-cyan-400"
                    >
                      {m.playerName}
                    </Link>
                    <span className="ml-2 text-slate-600">
                      {formatTime(m.createdAt)}
                    </span>
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
        {!playerId ? (
          <p className="text-sm text-slate-500 w-full text-center py-1">
            <Link href="/login" className="text-cyan-400 hover:underline">
              Log in
            </Link>{" "}
            to chat
          </p>
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message everyone…"
              maxLength={500}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              Send
            </button>
          </>
        )}
      </form>
      {error && (
        <p className="px-3 pb-2 text-xs text-red-400">{error}</p>
      )}
    </section>
  );
}
