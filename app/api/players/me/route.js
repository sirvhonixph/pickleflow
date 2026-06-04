import { NextResponse } from "next/server";
import { upsertPlayer } from "@/lib/store-server";

export async function PATCH(request) {
  try {
    const body = await request.json();
    const playerId = (body.playerId ?? "").trim().toLowerCase();
    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }

    const patch = {
      email: playerId,
    };
    if (body.name !== undefined) patch.name = body.name?.trim();
    if (body.category !== undefined) patch.category = body.category;
    if (body.dupr !== undefined) patch.dupr = body.dupr?.trim?.() ?? body.dupr;

    if (body.avatarDataUrl !== undefined) {
      const url = body.avatarDataUrl;
      if (url && !url.startsWith("data:image/")) {
        return NextResponse.json(
          { error: "Avatar must be an image." },
          { status: 400 }
        );
      }
      if (url && url.length > 2_800_000) {
        return NextResponse.json(
          { error: "Avatar image is too large." },
          { status: 400 }
        );
      }
      patch.avatarDataUrl = url;
    }

    const player = await upsertPlayer(patch);
    return NextResponse.json({ player });
  } catch (e) {
    return NextResponse.json(
      { error: e.message ?? "Failed to update profile" },
      { status: 500 }
    );
  }
}
