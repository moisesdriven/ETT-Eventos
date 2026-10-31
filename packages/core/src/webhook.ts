import { normalizeTag } from "./tags";

/**
 * Aviso de cambio de etiquetas enviado por un workflow de GHL (acción «Webhook» o
 * «Custom Webhook»). El formato estándar de GHL trae `contact_id`, `tags` como texto
 * separado por comas, `location.id` y `date_created`; también se aceptan las variantes
 * camelCase y `contact.{id,tags}` por si el workflow usa un cuerpo personalizado.
 */
export interface TagWebhook {
  contactId: string;
  /** Etiquetas actuales del contacto (normalizadas) o null si el aviso no las trae. */
  tags: string[] | null;
  locationId: string | null;
  contactCreatedAt: Date | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function readTags(v: unknown): string[] | null {
  if (Array.isArray(v)) return [...new Set(v.filter((t): t is string => typeof t === "string" && !!t.trim()).map(normalizeTag))].sort();
  if (typeof v === "string") {
    return [...new Set(v.split(",").map((t) => t.trim()).filter(Boolean).map(normalizeTag))].sort();
  }
  return null;
}

function readDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTagWebhook(body: unknown): TagWebhook | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const contact = (b.contact && typeof b.contact === "object" ? b.contact : {}) as Record<string, unknown>;
  const location = (b.location && typeof b.location === "object" ? b.location : {}) as Record<string, unknown>;

  const contactId = str(b.contact_id) ?? str(b.contactId) ?? str(contact.id);
  if (!contactId || !/^[A-Za-z0-9_-]{5,64}$/.test(contactId)) return null;

  const tagsRaw = "tags" in b ? b.tags : contact.tags;
  return {
    contactId,
    tags: readTags(tagsRaw),
    locationId: str(location.id) ?? str(b.locationId) ?? str(b.location_id),
    contactCreatedAt: readDate(b.date_created) ?? readDate(b.dateAdded) ?? readDate(contact.dateAdded),
  };
}
