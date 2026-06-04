import { NextResponse } from "next/server";
import { getPlayerByEmail } from "@/lib/store-server";

/** Check whether an email has completed PickleFlow registration (players store). */
export async function GET(request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const player = await getPlayerByEmail(email);
  if (!player) {
    return NextResponse.json(
      { registered: false, error: "No account found. Register first." },
      { status: 404 }
    );
  }

  return NextResponse.json({ registered: true, player });
}
