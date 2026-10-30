import { normalizePhone } from "@ett/core";
import { conversationsCache, messagesCache, phoneNumbers } from "@ett/db";
import type { GhlMessage } from "@ett/ghl";
import { and, eq, sql } from "drizzle-orm";
import type { Ctx } from "../context";

/** Número de la subcuenta en el mensaje: `from` si es saliente, `to` si es entrante. */
export function businessPhone(m: Pick<GhlMessage, "direction" | "from" | "to">): string | null {
  return normalizePhone(m.direction === "outbound" ? m.from : m.to);
}

async function phoneIds(ctx: Ctx, phones: Set<string>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const phone of phones) {
    await ctx.db.insert(phoneNumbers).values({ locationId: ctx.locationId, phoneE164: phone }).onConflictDoNothing();
    const [row] = await ctx.db
      .select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(and(eq(phoneNumbers.locationId, ctx.locationId), eq(phoneNumbers.phoneE164, phone)));
    if (row) map.set(phone, row.id);
  }
  return map;
}

/** Guarda en caché los mensajes de WhatsApp del rango (para cruzar cobros por wamid). */
export async function syncMessages(ctx: Ctx, from: Date, to: Date) {
  let total = 0;
  const phonesSeen = new Set<string>();
  const knownPhones = new Map<string, number>();

  for await (const page of ctx.ghl.whatsappMessages(from, to)) {
    const valid = page.filter((m) => m.direction === "inbound" || m.direction === "outbound");
    const pagePhones = new Set(valid.map(businessPhone).filter((p): p is string => !!p && !knownPhones.has(p)));
    for (const [p, id] of await phoneIds(ctx, pagePhones)) knownPhones.set(p, id);

    const rows = valid.map((m) => {
      const phone = businessPhone(m);
      if (phone) phonesSeen.add(phone);
      return {
        messageId: m.id,
        locationId: ctx.locationId,
        altId: m.altId || null,
        conversationId: m.conversationId ?? null,
        contactId: m.contactId ?? null,
        senderPhoneId: phone ? (knownPhones.get(phone) ?? null) : null,
        direction: m.direction as "inbound" | "outbound",
        source: m.source ?? null,
        status: m.status ?? null,
        sentAt: new Date(m.dateAdded),
      };
    });
    if (rows.length) {
      await ctx.db
        .insert(messagesCache)
        .values(rows)
        .onConflictDoUpdate({
          target: messagesCache.messageId,
          set: {
            altId: sql`excluded.alt_id`,
            conversationId: sql`excluded.conversation_id`,
            contactId: sql`excluded.contact_id`,
            senderPhoneId: sql`excluded.sender_phone_id`,
            status: sql`excluded.status`,
            syncedAt: sql`now()`,
          },
        });

      // Caché conversación → contacto y número.
      const convs = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        if (!r.conversationId) continue;
        const prev = convs.get(r.conversationId);
        if (!prev || prev.sentAt < r.sentAt) convs.set(r.conversationId, r);
      }
      if (convs.size) {
        await ctx.db
          .insert(conversationsCache)
          .values(
            [...convs.values()].map((r) => ({
              conversationId: r.conversationId!,
              locationId: ctx.locationId,
              contactId: r.contactId,
              senderPhoneId: r.senderPhoneId,
              lastMessageAt: r.sentAt,
            })),
          )
          .onConflictDoUpdate({
            target: conversationsCache.conversationId,
            set: {
              contactId: sql`coalesce(excluded.contact_id, ${conversationsCache.contactId})`,
              senderPhoneId: sql`coalesce(excluded.sender_phone_id, ${conversationsCache.senderPhoneId})`,
              lastMessageAt: sql`greatest(excluded.last_message_at, ${conversationsCache.lastMessageAt})`,
              syncedAt: sql`now()`,
            },
          });
      }
    }
    total += rows.length;
  }
  return { mensajes: total, numeros: [...phonesSeen] };
}
