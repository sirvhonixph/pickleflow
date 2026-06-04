import { SAMPLE_PLAYERS } from "@/lib/sample-players";
import { processEventAutomation } from "@/lib/event-automation";
import { updateEventRecord, upsertPlayer } from "@/lib/store-server";

const WAIT_STAGGER_MS = 4 * 60 * 1000;

export async function addSamplePlayersToEvent(eventId) {
  const now = Date.now();
  let added = 0;

  for (let i = 0; i < SAMPLE_PLAYERS.length; i++) {
    const sample = SAMPLE_PLAYERS[i];
    await upsertPlayer({
      email: sample.email,
      name: sample.name,
      category: sample.category,
      registeredAt: now - (i + 2) * WAIT_STAGGER_MS,
    });
  }

  const updated = await updateEventRecord(eventId, (event) => {
    if (event.status === "ended") {
      throw new Error("This event has ended.");
    }
    const registrations = [...(event.registrations ?? [])];
    const existing = new Set(registrations.map((r) => r.playerId));

    for (let i = 0; i < SAMPLE_PLAYERS.length; i++) {
      const sample = SAMPLE_PLAYERS[i];
      if (existing.has(sample.email)) continue;
      registrations.push({
        playerId: sample.email,
        name: sample.name,
        email: sample.email,
        category: sample.category,
        joinedAt: now - (i + 2) * WAIT_STAGGER_MS,
      });
      existing.add(sample.email);
      added += 1;
    }

    return { ...event, registrations };
  });

  if (!updated) return null;

  const { event: processed } = processEventAutomation(updated);
  const saved = await updateEventRecord(eventId, () => processed);
  return { event: saved, added };
}
