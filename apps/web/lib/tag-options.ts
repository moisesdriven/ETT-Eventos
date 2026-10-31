import "server-only";
import { eventTags, events, tags } from "@ett/db";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";

export async function getTagOptions(locationId: string, exceptEventId?: string) {
  const rows = await db
    .select({ name: tags.nameNormalized, contactsCount: tags.contactsCount, eventId: eventTags.eventId, eventName: events.name })
    .from(tags)
    .leftJoin(eventTags, and(eq(eventTags.locationId, tags.locationId), eq(eventTags.tagNameNormalized, tags.nameNormalized)))
    .leftJoin(events, eq(events.id, eventTags.eventId))
    .where(and(eq(tags.locationId, locationId), eq(tags.existsInGhl, true)))
    .orderBy(asc(tags.nameNormalized));
  return rows.map((r) => ({
    name: r.name,
    contactsCount: r.contactsCount,
    takenBy: r.eventId && r.eventId !== exceptEventId ? r.eventName : null,
  }));
}
