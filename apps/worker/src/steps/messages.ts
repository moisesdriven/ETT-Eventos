import { addDays, limaDayStart, normalizePhone, toLimaDay } from "@ett/core";
import { conversationsCache, messagesCache, phoneNumbers } from "@ett/db";
import { GhlError, type GhlMessage } from "@ett/ghl";
import { and, eq, sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { log } from "../log";
import { tsParam } from "../sql";

const MAX_INTENTOS = 4;

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

/** Ventanas de un día de Lima dentro de [from, to). */
function dayWindows(from: Date, to: Date): [Date, Date][] {
  const out: [Date, Date][] = [];
  let start = from;
  while (start < to) {
    const next = limaDayStart(addDays(toLimaDay(start), 1));
    const end = next < to ? next : to;
    out.push([start, end]);
    start = end;
  }
  return out;
}

/** Cobros con referencia del rango: si hay cobros, debe haber mensajes. */
async function chargesWithRef(ctx: Ctx, from: Date, to: Date): Promise<number> {
  const [row] = await ctx.db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM analytics.message_charges
     WHERE location_id = ${ctx.locationId} AND message_ref IS NOT NULL
       AND settled_at >= ${tsParam(from)} AND settled_at < ${tsParam(to)}`);
  return row?.n ?? 0;
}

/**
 * Descarga una ventana completa y verifica el resultado. GHL a veces responde 0 mensajes
 * sin error, o el cursor vence (2 min) tras esperas por límite de velocidad: en ambos casos
 * se reintenta la ventana desde el principio.
 */
async function exportWindow(ctx: Ctx, from: Date, to: Date, expectSome: boolean) {
  let last: GhlMessage[] = [];
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const messages: GhlMessage[] = [];
    let total: number | null = null;
    let motivo = "";
    try {
      for await (const page of ctx.ghl.whatsappMessages(from, to)) {
        total ??= page.total;
        messages.push(...page.messages);
      }
      if (total !== null && messages.length < total) motivo = `llegaron ${messages.length} de ${total}`;
      else if (expectSome && messages.length === 0) motivo = "GHL respondió 0 mensajes en un día con cobros";
    } catch (err) {
      if (!(err instanceof GhlError && err.status === 400)) throw err;
      motivo = "cursor vencido";
    }
    if (messages.length > last.length) last = messages;
    if (!motivo) return { messages, completo: true };
    log("warn", "Export de mensajes incompleto, reintentando", { desde: from.toISOString(), hasta: to.toISOString(), intento, motivo });
    if (intento < MAX_INTENTOS) await new Promise((r) => setTimeout(r, 5_000 * 2 ** (intento - 1)));
  }
  return { messages: last, completo: false };
}

async function saveMessages(ctx: Ctx, page: GhlMessage[], knownPhones: Map<string, number>, phonesSeen: Set<string>) {
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

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await ctx.db
      .insert(messagesCache)
      .values(chunk)
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
    const convs = new Map<string, (typeof chunk)[number]>();
    for (const r of chunk) {
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
  return rows.length;
}

/** Guarda en caché los mensajes de WhatsApp del rango (para cruzar cobros por wamid), día por día. */
export async function syncMessages(ctx: Ctx, from: Date, to: Date) {
  let total = 0;
  const phonesSeen = new Set<string>();
  const knownPhones = new Map<string, number>();
  const diasIncompletos: string[] = [];

  for (const [a, b] of dayWindows(from, to)) {
    const expectSome = (await chargesWithRef(ctx, a, b)) > 0;
    const { messages, completo } = await exportWindow(ctx, a, b, expectSome);
    total += await saveMessages(ctx, messages, knownPhones, phonesSeen);
    if (!completo) diasIncompletos.push(toLimaDay(a));
  }
  if (diasIncompletos.length) log("error", "Días con export de mensajes incompleto", { dias: diasIncompletos });
  return { mensajes: total, numeros: [...phonesSeen], diasIncompletos };
}
