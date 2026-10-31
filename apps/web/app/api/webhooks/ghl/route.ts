import { timingSafeEqual } from "node:crypto";
import { parseTagWebhook } from "@ett/core";
import { webhookEvents } from "@ett/db";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getLocation } from "@/lib/location";

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024;

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Recibe los avisos de cambio de etiquetas de un workflow de GHL (acción «Webhook»).
 * Solo valida y guarda; el worker los procesa. Clave en `?token=` o en el header `x-ett-token`.
 */
export async function POST(request: Request) {
  const secret = getEnv().WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, error: "Avisos no configurados" }, { status: 503 });

  const token = new URL(request.url).searchParams.get("token") ?? request.headers.get("x-ett-token");
  if (!sameSecret(token, secret)) return Response.json({ ok: false }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ ok: false, error: "Aviso demasiado grande" }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parseTagWebhook(payload);
  if (!parsed) return Response.json({ ok: false, error: "Falta contact_id" }, { status: 400 });

  const location = await getLocation();
  if (location && parsed.locationId && parsed.locationId !== location.id) {
    return Response.json({ ok: false, error: "Subcuenta distinta" }, { status: 400 });
  }

  await db.insert(webhookEvents).values({ kind: "etiquetas", contactId: parsed.contactId, payload });
  return Response.json({ ok: true });
}
