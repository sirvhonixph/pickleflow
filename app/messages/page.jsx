"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import DirectMessagesPanel from "@/components/DirectMessagesPanel";
import PlayerAvatar from "@/components/PlayerAvatar";
import { fetchMessageInbox } from "@/lib/chat";
import {
  formatInboxTime,
  isThreadUnread,
  markInboxRead,
} from "@/lib/inbox-read";
import { getCurrentUser, getPlayerId } from "@/lib/session";

function MessagesContent() {
  const searchParams = useSearchParams();
  const withParam = searchParams.get("with") ?? "";
  const [inbox, setInbox] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const user = getCurrentUser();
  const myId = getPlayerId(user);

  const activeId = withParam
    ? decodeURIComponent(withParam).trim().toLowerCase()
    : "";

  const activeThread = inbox.find((t) => t.playerId === activeId) ?? null;
  const withPlayer = activeId
    ? activeThread ?? {
        playerId: activeId,
        playerName: activeId,
        avatarDataUrl: "",
      }
    : null;

  const loadInbox = useCallback(async () => {
    if (!myId) {
      setInbox([]);
      setInboxLoading(false);
      return;
    }
    try {
      const data = await fetchMessageInbox(myId);
      setInbox(data.threads ?? []);
    } catch {
      setInbox([]);
    } finally {
      setInboxLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 4000);
    return () => clearInterval(t);
  }, [loadInbox]);

  useEffect(() => {
    if (!activeId) return;
    markInboxRead(activeId);
    loadInbox();
  }, [activeId, loadInbox]);

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6 min-h-[480px]">
      <aside className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col min-h-[480px]">
        <h2 className="text-sm font-semibold mb-1">Inbox</h2>
        <p className="text-xs text-slate-500 mb-3">Latest messages on top</p>
        <Link
          href="/players"
          className="block text-xs text-cyan-400 mb-3 hover:underline shrink-0"
        >
          Find players →
        </Link>

        <ul className="space-y-1 flex-1 overflow-y-auto min-h-0">
          {inboxLoading ? (
            <li className="text-sm text-slate-500 px-2 py-4">Loading inbox…</li>
          ) : inbox.length === 0 ? (
            <li className="text-sm text-slate-500 px-2 py-4">
              No messages yet.{" "}
              <Link href="/players" className="text-cyan-400 hover:underline">
                Message a player
              </Link>
            </li>
          ) : (
            inbox.map((thread) => {
              const unread = isThreadUnread(thread, myId);
              const selected = activeId === thread.playerId;
              return (
                <li key={thread.playerId}>
                  <Link
                    href={`/messages?with=${encodeURIComponent(thread.playerId)}`}
                    className={`flex items-start gap-2 px-2 py-2.5 rounded-lg text-sm hover:bg-slate-800 ${
                      selected ? "bg-slate-800" : ""
                    } ${unread ? "bg-slate-800/40" : ""}`}
                  >
                    <PlayerAvatar
                      player={{
                        email: thread.playerId,
                        name: thread.playerName,
                        avatarDataUrl: thread.avatarDataUrl,
                      }}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate ${
                            unread
                              ? "font-bold text-white"
                              : "font-medium text-slate-200"
                          }`}
                        >
                          {thread.playerName}
                        </span>
                        <span
                          className={`text-[10px] shrink-0 ${
                            unread ? "text-cyan-400 font-semibold" : "text-slate-600"
                          }`}
                        >
                          {formatInboxTime(thread.lastAt)}
                        </span>
                      </div>
                      <p
                        className={`truncate text-xs mt-0.5 ${
                          unread
                            ? "font-semibold text-slate-200"
                            : "text-slate-500"
                        }`}
                      >
                        {thread.fromMe
                          ? `You: ${thread.lastMessage}`
                          : thread.lastMessage}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <DirectMessagesPanel
        withPlayerId={withPlayer?.playerId ?? ""}
        withPlayerName={withPlayer?.playerName}
        withAvatar={withPlayer?.avatarDataUrl}
        onMessageActivity={loadInbox}
      />
    </div>
  );
}

export default function MessagesPage() {
  const user = getCurrentUser();

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-2">Messages</h1>
      <p className="text-slate-400 text-sm mb-6">
        Private conversations with other players.
      </p>

      {!user ? (
        <p className="text-slate-500">
          <Link href="/login" className="text-cyan-400 hover:underline">
            Log in
          </Link>{" "}
          to send messages.
        </p>
      ) : (
        <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
          <MessagesContent />
        </Suspense>
      )}
    </AppShell>
  );
}
