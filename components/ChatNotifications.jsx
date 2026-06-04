"use client";

import { useEffect, useRef } from "react";
import {
  fetchChatNotifications,
  getActiveDmPartnerId,
} from "@/lib/chat-notifications-client";
import { notifyInboxUpdate, showAppToast } from "@/lib/inbox-events";
import { playNotificationBeep } from "@/lib/notification-sound";
import { getCurrentUser, getDisplayName, getPlayerId } from "@/lib/session";

const POLL_MS = 4000;

export default function ChatNotifications() {
  const initializedRef = useRef(false);
  const lastPollRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function poll() {
      const user = getCurrentUser();
      const playerId = getPlayerId(user);
      if (!playerId || cancelled) return;

      const now = Date.now();
      const since = initializedRef.current ? lastPollRef.current : now;

      try {
        const data = await fetchChatNotifications({
          playerId,
          displayName: getDisplayName(user),
          since,
        });

        if (cancelled) return;

        if (!initializedRef.current) {
          initializedRef.current = true;
          lastPollRef.current = now;
          return;
        }

        const activePartner = getActiveDmPartnerId();
        const newDms = (data.incomingDms ?? []).filter(
          (m) => m.fromId !== activePartner
        );
        const newMentions = data.mentions ?? [];

        if (newDms.length > 0) {
          playNotificationBeep("message");
          notifyInboxUpdate();
          const latest = newDms[newDms.length - 1];
          const fromName = latest.fromName || latest.fromId;
          showAppToast(
            `New private message from ${fromName}`,
            `/messages?with=${encodeURIComponent(latest.fromId)}`
          );
        }

        if (newMentions.length > 0) {
          playNotificationBeep("mention");
          const latest = newMentions[newMentions.length - 1];
          const who = latest.playerName || latest.playerId;
          showAppToast(
            `${who} mentioned you in live chat`,
            "/dashboard"
          );
        }

        lastPollRef.current = now;
      } catch {
        /* ignore poll errors */
      }
    }

    poll();
    timer = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
