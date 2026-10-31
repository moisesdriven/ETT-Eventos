import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./app";

/** Datos de GHL cacheados, eventos y hechos de costo. */
export const analytics = pgSchema("analytics");

const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Montos en USD con 6 decimales; se redondean solo al mostrarlos. */
const usd = (name: string) => numeric(name, { precision: 14, scale: 6 });

// ---------------------------------------------------------------------------
// Subcuenta y credenciales
// ---------------------------------------------------------------------------

export const locations = analytics.table("locations", {
  id: text("id").primaryKey(), // locationId de GHL
  name: text("name").notNull(),
  companyId: text("company_id"),
  timezone: text("timezone"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const credentialKind = analytics.enum("credential_kind", ["agency_pit", "location_pit", "agency_oauth", "location_oauth"]);

/** Tokens cifrados con AES-256-GCM (APP_ENCRYPTION_KEY). Opcional: hoy los tokens vienen de variables de entorno. */
export const ghlCredentials = analytics.table(
  "ghl_credentials",
  {
    id: serial("id").primaryKey(),
    kind: credentialKind("kind").notNull(),
    locationId: text("location_id").references(() => locations.id, { onDelete: "cascade" }),
    companyId: text("company_id"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: ts("expires_at"),
    scopes: text("scopes").array(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ghl_credentials_kind_location_uq").on(t.kind, sql`coalesce(${t.locationId}, '')`)],
);

// ---------------------------------------------------------------------------
// Números de WhatsApp
// ---------------------------------------------------------------------------

export const phoneNumbers = analytics.table(
  "phone_numbers",
  {
    id: serial("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    label: text("label"),
    active: boolean("active").notNull().default(true),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("phone_numbers_location_phone_uq").on(t.locationId, t.phoneE164)],
);

// ---------------------------------------------------------------------------
// Etiquetas y eventos
// ---------------------------------------------------------------------------

/** Catálogo de etiquetas existentes en GHL (sincronizado). */
export const tags = analytics.table(
  "tags",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    ghlTagId: text("ghl_tag_id").notNull(),
    name: text("name").notNull(),
    /** Nombre en minúsculas, usado para cruzar con los tags del contacto. */
    nameNormalized: text("name_normalized").notNull(),
    contactsCount: integer("contacts_count"),
    existsInGhl: boolean("exists_in_ghl").notNull().default(true),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.ghlTagId] }),
    uniqueIndex("tags_location_name_uq").on(t.locationId, t.nameNormalized),
  ],
);

export const eventStatus = analytics.enum("event_status", ["activo", "archivado"]);

/** Un evento existe solo cuando un usuario marca una o más etiquetas como evento. */
export const events = analytics.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Ventana semiabierta [startsAt, endsAt) en UTC; se captura en días de Lima. */
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    budgetUsd: usd("budget_usd"),
    notes: text("notes"),
    status: eventStatus("status").notNull().default("activo"),
    lastCalculatedAt: ts("last_calculated_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("events_window_chk", sql`${t.endsAt} > ${t.startsAt}`),
    index("events_location_window_idx").on(t.locationId, t.startsAt, t.endsAt),
  ],
);

/** Una etiqueta pertenece como máximo a un evento. */
export const eventTags = analytics.table(
  "event_tags",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull(),
    tagNameNormalized: text("tag_name_normalized").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.tagNameNormalized] }),
    uniqueIndex("event_tags_location_tag_uq").on(t.locationId, t.tagNameNormalized),
  ],
);

export const eventPhones = analytics.table(
  "event_phones",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    phoneNumberId: integer("phone_number_id")
      .notNull()
      .references(() => phoneNumbers.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.phoneNumberId] })],
);

// ---------------------------------------------------------------------------
// Caché de contactos, conversaciones y mensajes
// ---------------------------------------------------------------------------

export const contactsCache = analytics.table(
  "contacts_cache",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull(),
    name: text("name"),
    phoneE164: text("phone_e164"),
    /** Tags actuales normalizados (minúsculas). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    ghlDateAdded: ts("ghl_date_added"),
    ghlDateUpdated: ts("ghl_date_updated"),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.contactId] }),
    index("contacts_cache_tags_gin").using("gin", t.tags),
  ],
);

export const tagEvidenceSource = analytics.enum("tag_evidence_source", ["webhook", "snapshot", "primer_mensaje", "alta_contacto"]);

/** Historial de cuándo un contacto tuvo una etiqueta (GHL no lo expone por API). */
export const contactTagHistory = analytics.table(
  "contact_tag_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: text("location_id").notNull(),
    contactId: text("contact_id").notNull(),
    tagNameNormalized: text("tag_name_normalized").notNull(),
    /** Primer momento en que se vio la etiqueta (exacto si viene de webhook). */
    addedAt: ts("added_at"),
    /** Último momento en que se sabe que NO la tenía (cota inferior del alta). */
    addedAfter: ts("added_after"),
    /** Primer momento en que se vio sin la etiqueta tras haberla tenido. */
    removedAt: ts("removed_at"),
    /** Último momento en que se sabe que SÍ la tenía (cota inferior de la baja). */
    removedAfter: ts("removed_after"),
    source: tagEvidenceSource("source").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("contact_tag_history_lookup_idx").on(t.locationId, t.contactId, t.tagNameNormalized)],
);

export const conversationsCache = analytics.table(
  "conversations_cache",
  {
    conversationId: text("conversation_id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    contactId: text("contact_id"),
    senderPhoneId: integer("sender_phone_id").references(() => phoneNumbers.id),
    lastMessageAt: ts("last_message_at"),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [index("conversations_cache_contact_idx").on(t.locationId, t.contactId)],
);

export const messageDirection = analytics.enum("message_direction", ["inbound", "outbound"]);

export const messagesCache = analytics.table(
  "messages_cache",
  {
    messageId: text("message_id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** wamid de Meta. */
    altId: text("alt_id"),
    conversationId: text("conversation_id"),
    contactId: text("contact_id"),
    senderPhoneId: integer("sender_phone_id").references(() => phoneNumbers.id),
    direction: messageDirection("direction").notNull(),
    source: text("source"),
    status: text("status"),
    sentAt: ts("sent_at").notNull(),
    dayLima: date("day_lima").generatedAlwaysAs(sql`((sent_at AT TIME ZONE 'America/Lima')::date)`),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_cache_alt_id_idx").on(t.altId),
    index("messages_cache_conversation_idx").on(t.conversationId, t.sentAt),
    index("messages_cache_contact_idx").on(t.locationId, t.contactId, t.sentAt),
    index("messages_cache_day_idx").on(t.locationId, t.dayLima),
  ],
);

// ---------------------------------------------------------------------------
// Cobros de mensajería (fuente de verdad del dinero)
// ---------------------------------------------------------------------------

export const MESSAGE_CATEGORIES = ["marketing", "utility", "service", "authentication", "other", "inbound", "free_entry_point"] as const;
export const messageCategory = analytics.enum("message_category", MESSAGE_CATEGORIES);
/** Origen del cobro: monedero de GHL o facturación de Meta (pendiente de confirmar). */
export const chargeSource = analytics.enum("charge_source", ["ghl_wallet", "meta"]);
export const resolutionStatus = analytics.enum("resolution_status", ["pendiente", "resuelto", "sin_resolver"]);

export const messageCharges = analytics.table(
  "message_charges",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    source: chargeSource("source").notNull(),
    /** Id del cobro en el origen; garantiza idempotencia de la ingesta. */
    externalId: text("external_id").notNull(),
    settledAt: ts("settled_at").notNull(),
    dayLima: date("day_lima").generatedAlwaysAs(sql`((settled_at AT TIME ZONE 'America/Lima')::date)`),
    category: messageCategory("category").notNull(),
    /** Tipo tal como viene en la descripción (p. ej. whatsapp_service_message). */
    chargeType: text("charge_type").notNull(),
    amountUsd: usd("amount_usd").notNull(),
    messageRef: text("message_ref"),
    messageId: text("message_id"),
    conversationId: text("conversation_id"),
    contactId: text("contact_id"),
    senderPhoneId: integer("sender_phone_id").references(() => phoneNumbers.id),
    resolution: resolutionStatus("resolution").notNull().default("pendiente"),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_charges_source_external_uq").on(t.source, t.externalId),
    index("message_charges_day_idx").on(t.locationId, t.dayLima),
    index("message_charges_contact_idx").on(t.locationId, t.contactId, t.settledAt),
    index("message_charges_resolution_idx").on(t.resolution),
  ],
);

export const attributionBasis = analytics.enum("attribution_basis", ["historial_etiqueta", "primer_mensaje", "ventana"]);

/**
 * Reparto de cada cobro entre eventos. Un cobro sin filas aquí es "Orgánico / Sin campaña".
 * La suma de `amountUsd` por cobro nunca supera el monto del cobro.
 */
export const chargeAttributions = analytics.table(
  "charge_attributions",
  {
    chargeId: bigint("charge_id", { mode: "number" })
      .notNull()
      .references(() => messageCharges.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    share: numeric("share", { precision: 7, scale: 6 }).notNull(),
    amountUsd: usd("amount_usd").notNull(),
    basis: attributionBasis("basis").notNull(),
    calculatedAt: ts("calculated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.chargeId, t.eventId] }),
    index("charge_attributions_event_idx").on(t.eventId),
    check("charge_attributions_share_chk", sql`${t.share} > 0 AND ${t.share} <= 1`),
  ],
);

// ---------------------------------------------------------------------------
// Sincronización
// ---------------------------------------------------------------------------

export const syncStatus = analytics.enum("sync_status", ["en_cola", "en_proceso", "ok", "error"]);

export const syncRuns = analytics.table(
  "sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: text("location_id").references(() => locations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: syncStatus("status").notNull().default("en_cola"),
    params: jsonb("params").$type<Record<string, unknown>>(),
    rangeFrom: ts("range_from"),
    rangeTo: ts("range_to"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    stats: jsonb("stats").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sync_runs_kind_created_idx").on(t.kind, t.createdAt), index("sync_runs_status_idx").on(t.status, t.id)],
);

// ---------------------------------------------------------------------------
// Avisos de GHL (webhooks de workflows)
// ---------------------------------------------------------------------------

/** Avisos recibidos; el worker los procesa en orden y registra el historial de etiquetas. */
export const webhookEvents = analytics.table(
  "webhook_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    contactId: text("contact_id"),
    payload: jsonb("payload").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
    error: text("error"),
  },
  (t) => [
    index("webhook_events_pending_idx").on(t.id).where(sql`${t.processedAt} IS NULL`),
    index("webhook_events_received_idx").on(t.receivedAt),
  ],
);
