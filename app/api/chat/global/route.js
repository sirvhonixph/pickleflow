import { NextResponse } from "next/server";
import { addGlobalChatMessage, getGlobalChatMessages } from "@/lib/store-server";

export async function GET() {
  const messages = await getGlobalChatMessages();
  return NextResponse.json({ messages });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const message = await addGlobalChatMessage(body);
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Could not send message" },
      { status: 400 }
    );
  }
}
