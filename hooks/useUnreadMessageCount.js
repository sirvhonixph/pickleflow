"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMessageInbox } from "@/lib/chat";
import { INBOX_UPDATE_EVENT } from "@/lib/inbox-events";
import { isThreadUnread } from "@/lib/inbox-read";
import { getCurrentUser, getPlayerId } from "@/lib/session";

const POLL_MS = 4000;

export function useUnreadMessageCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const user = getCurrentUser();
    const myId = getPlayerId(user);
    if (!myId) {
      setCount(0);
      return;
    }

    try {
      const data = await fetchMessageInbox(myId);
      const unread = (data.threads ?? []).filter((thread) =>
        isThreadUnread(thread, myId)
      ).length;
      setCount(unread);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onUpdate = () => refresh();
    window.addEventListener(INBOX_UPDATE_EVENT, onUpdate);
    return () => {
      clearInterval(timer);
      window.removeEventListener(INBOX_UPDATE_EVENT, onUpdate);
    };
  }, [refresh]);

  return count;
}
