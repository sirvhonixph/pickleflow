import { NextResponse } from "next/server";
import { messageMentionsPlayer } from "@/lib/chat-mentions";
import {
  getDirectMessagesForPlayer,
  getGlobalChatMessages,
} from "@/lib/store-server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = (searchParams.get("playerId") ?? "").trim().toLowerCase();
  const displayName = (searchParams.get("displayName") ?? "").trim();
  const since = Number(searchParams.get("since") ?? 0);

  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const [incomingDms, globalMessages] = await Promise.all([
    getDirectMessagesForPlayer(playerId),
    getGlobalChatMessages(80),
  ]);

  const newDms = incomingDms.filter(
    (m) => m.toId === playerId && m.fromId !== playerId && m.createdAt > since
  );

  const mentions = globalMessages.filter(
    (m) =>
      m.playerId !== playerId &&
      m.createdAt > since &&
      messageMentionsPlayer(m.text, { playerId, displayName })
  );

  return NextResponse.json({ incomingDms: newDms, mentions });
}
