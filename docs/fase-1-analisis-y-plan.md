# Fase 1 — Análisis técnico y plan de trabajo

Plataforma interna de costos de WhatsApp en GoHighLevel (GHL) por día, número remitente y campaña/evento.

Fecha del análisis: 2026-10-30.

---

## 1. Estado del entorno

| Elemento | Hallazgo |
|---|---|
| Repositorio | Vacío (sin commits ni código previo). El proyecto se construye desde cero. |
| `.env` / `DATABASE_URL` | No existe. **No pude inspeccionar el esquema `ghl` de PostgreSQL.** |
| Herramientas | Node 22, pnpm, Docker y `psql` disponibles en el entorno de desarrollo. |
| Acceso a GHL | Conector de lectura con 4 subcuentas: `ECOM - Bria Import`, `Driven IA 1`, `Ecommerce`, `Driven Automations`. |

Mientras no tenga la conexión a la base existente, el diseño asume que **no se toca nada** del esquema `ghl`: todo lo nuevo vive en los esquemas `app` (seguridad) y `analytics` (caché y hechos), con migraciones versionadas y solo aditivas.

---

## 2. Verificación con datos reales de GHL (solo lectura)

### 2.1 Mensajes de WhatsApp — confirmado

`GET /conversations/messages/export?channel=WhatsApp` (paginación por `cursor`, `limit` mínimo 10, cursor válido 2 min) devuelve por mensaje:

```json
{
  "id": "tfK5aARBiGxPLlSTU3sU",            // messageId de GHL
  "altId": "wamid.HBgLNTE5OTUy...",        // id de Meta (wamid)
  "conversationId": "7CzoV6WT8jna5C4vsB8p",
  "contactId": "ErRmjAIaejhI9PovRoum",
  "direction": "outbound",                  // inbound | outbound
  "from": "+51 976 232 041",                // en outbound = línea de la subcuenta
  "to": "+51995229525",                     // en inbound  = línea de la subcuenta
  "messageType": "TYPE_WHATSAPP",
  "dateAdded": "2026-10-26T21:14:01.006Z",
  "source": "app", "userId": "...", "status": "read"
}
```

Conclusiones:

1. **El número remitente sale directo del mensaje**: `from` si es `outbound`, `to` si es `inbound`. No hace falta consultar la conversación para saberlo.
2. **Los teléfonos vienen en formatos mixtos** (`+51 976 232 041` vs `+51995229525`). Hay que normalizar a E.164 (`+51976232041`) antes de guardar o comparar.
3. Este endpoint permite **cargar en bloque** (≈4 000 mensajes WhatsApp en una subcuenta) la tabla local `messages → {conversationId, contactId, senderPhone, wamid}` con muy pocas llamadas, en lugar de ir conversación por conversación. Es la base de la caché que pide el requerimiento.

### 2.2 Contactos y tags — confirmado, con una limitación importante

`GET /contacts/{id}` devuelve `tags` como **arreglo de strings sin fecha** por tag:

```json
"tags": ["ticket_abierto", "fuera de horario", "wa: +51918891333", "another-device-replied-whatsapp"]
```

Consecuencia directa para la regla de atribución:

- **La API no informa cuándo se aplicó cada tag.** La condición "después de la fecha en que el contacto recibió el tag" solo se puede cumplir si nosotros registramos esa fecha:
  - en tiempo casi real con el webhook `ContactTagUpdate` (fuente principal), y
  - con un *snapshot* diario que compara tags y guarda `first_seen_at` (respaldo si se pierde un webhook).
- **Para el histórico (backfill) esa fecha no existe.** Ahí la atribución solo puede usar la ventana de la campaña (inicio/fin). Lo marcaremos como `attribution_basis = 'window'` vs `'tag_timestamp'` para que sea auditable.
- Observación: existen tags tipo `wa: +519xxxxxxxx`; podrían servir como pista de la línea, pero la fuente oficial del número será el mensaje.

### 2.3 Monedero (`wallet-transactions`) — NO verificado ⚠️

`POST /saas/locations/{locationId}/wallet-transactions` es un endpoint de **agencia (SaaS)** y no está disponible en el conector de lectura que tengo. **No pude ver un cargo real de WhatsApp ni el formato del `ref:`.** Es el punto más crítico del proyecto, porque de él depende el cruce exacto.

Hipótesis que el diseño soporta (se valida con una muestra real):

| Si `ref:` contiene… | Cruce |
|---|---|
| `messageId` de GHL (20 caracteres) | `messages.id` en caché local → conversación, contacto y línea. |
| `wamid.…` de Meta | `messages.alt_id` en caché local. |
| `conversationId` | `conversations_cache` → contacto; la línea se toma del mensaje más cercano en tiempo. |
| `contactId` o nada | Contacto directo; o queda como **"Sin resolver"** (nunca se descarta). |

El parser vivirá en `packages/core` con tests por cada formato real que encontremos.

---

## 3. Decisiones de diseño propuestas

### 3.1 Cuadre financiero al 100 %
- `wallet_message_tx` es la **fuente de verdad del dinero**: se guarda cada cargo de WhatsApp tal cual viene del monedero (con `raw_payload`), idempotente por `tx_id_ghl`.
- La resolución (contacto, línea, campaña) **enriquece** la fila; nunca la filtra. Lo que no se resuelve cae en buckets explícitos: `Sin resolver` (sin contacto/línea) y `Orgánico / Sin campaña` (contacto sin tag de campaña vigente).
- Montos en `numeric(14,6)`; redondeo solo en presentación (2 decimales totales, 4 unitarios).
- Job de verificación: suma por día Lima en BD vs suma directa del monedero; alerta si la diferencia ≠ 0.

### 3.2 Zona horaria
- Se guarda `settled_at timestamptz` (UTC) y una columna generada `day_lima date` = `(settled_at AT TIME ZONE 'America/Lima')::date`. Todos los cortes día/mes se hacen sobre esa columna.

### 3.3 Atribución de campañas
- Tabla `contact_tag_events (account_id, contact_id, tag, added_at, removed_at, source)` alimentada por webhook + snapshot.
- Regla por defecto **"último toque"**: entre las campañas cuyo tag tiene el contacto y cuya ventana cubre el cargo, gana la del tag aplicado más recientemente antes del cargo (desempate: campaña con inicio más reciente, luego id).
- El resultado se persiste en `wallet_message_tx.attributed_campaign_id` → el total general nunca se duplica.
- Vista **multi‑touch** separada (`tx_campaign_touches`) que reparte o lista todas las campañas candidatas, sin afectar el total.
- Recalcular atribución es idempotente (por rango de fechas), así un cambio de campaña se refleja sin re-sincronizar GHL.

### 3.4 Sincronización y rate limit
- Cola sobre **pg-boss** (mismo PostgreSQL, sin Redis), un *token bucket* por subcuenta (≤ 100 req / 10 s, objetivo 80 para margen) y backoff exponencial con *jitter* ante `429`/`5xx`.
- Orden por subcuenta: 1) monedero incremental (por `settlementTime`), 2) export de mensajes WhatsApp del mismo rango, 3) contactos faltantes, 4) atribución, 5) refresco de agregados.
- Caché: `messages_cache` y `conversations_cache` solo se consultan a GHL si el id no existe localmente.

### 3.5 OAuth
- OAuth 2.0 de agencia: `POST /oauth/token` (rotación de `refresh_token` con `SELECT … FOR UPDATE` / *advisory lock* para evitar carreras) y `POST /oauth/locationToken` por subcuenta.
- Fallback `pit-` por subcuenta, cifrado igual que los demás tokens (AES‑256‑GCM, clave en variable de entorno).

### 3.6 Stack (según lo pedido)
- pnpm workspaces + Turborepo, TypeScript estricto.
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, Recharts, TanStack Table.
- `apps/worker`: Node + pg-boss.
- `packages/db`: **Drizzle ORM** (SQL explícito, buen soporte de esquemas múltiples y vistas materializadas).
- `packages/core`: parser del monedero, atribución, KPIs, fechas Lima — con Vitest.
- `packages/ghl`: cliente GHL tipado (OAuth, rate limit, reintentos).

---

## 4. Modelo de datos (resumen)

Esquema `app`: `users`, `roles`, `sessions`, `audit_logs`.
Esquema `analytics` (o `ghl` solo si confirmas que se puede añadir ahí):

- `accounts` (o referencia a `ghl.accounts` existente) · `oauth_tokens` (cifrados)
- `phone_numbers` (E.164, label, activo)
- `contacts_cache` · `contact_tag_events`
- `conversations_cache` · `messages_cache` (id, alt_id, conversation_id, contact_id, sender_phone_id, direction, sent_at)
- `campaigns` · `campaign_tags` · `campaign_phones`
- `wallet_message_tx` (+ `day_lima`, `category`, `resolution_status`, `attributed_campaign_id`, `attribution_basis`)
- `tx_campaign_touches` (multi‑touch)
- `campaign_stats_daily` (vista materializada, refresco concurrente)
- `sync_runs` / `sync_logs`

---

## 5. Plan por fases

| Fase | Entregable | Commits aprox. |
|---|---|---|
| **1** | Este análisis + validación del formato real del monedero | — |
| **2** | Monorepo, Drizzle, migraciones `app`/`analytics`, login (Argon2id, cookies httpOnly/SameSite, CSRF), roles `admin`/`analista`/`lectura`, auditoría | 4–6 |
| **3** | `packages/ghl` (OAuth + `pit-` + rate limit), worker pg-boss, ingesta de monedero, export de mensajes, contactos/tags, webhooks, motor de atribución con tests | 6–8 |
| **4** | UI de subcuentas/conector/backfill/logs, catálogo de tags, CRUD de campañas, listado de números | 4–5 |
| **5** | Dashboard (KPIs, barras apiladas día/mes, gasto por número, top 10), tabla de campañas, drill‑down, análisis por número, exportación CSV/Excel | 5–7 |
| **6** | Dockerfiles, `docker-compose` con Traefik, CI (lint, typecheck, tests), script de cuadre contra el monedero real | 3–4 |

---

## 6. Lo que necesito para continuar

1. **Muestra real del monedero** (bloqueante para el cruce): 3–5 transacciones de WhatsApp en JSON de `wallet-transactions`, una de cada categoría si es posible. Basta con pegar la respuesta (se pueden enmascarar montos).
2. **Base de datos existente**: `DATABASE_URL` de solo lectura (o un `pg_dump --schema-only` del esquema `ghl`) para revisar `ghl.accounts` y evitar duplicar tablas.
3. **App de Marketplace de GHL**: confirmar que existe (client_id/secret) y con qué *scopes*. Mínimos: `saas/location.read`, `conversations.readonly`, `conversations/message.readonly`, `contacts.readonly`, `locations.readonly`, `locations/tags.readonly`, `oauth.readonly`/`oauth.write`.
4. **Dominio público** para los webhooks de GHL detrás de Traefik.
5. Confirmar defaults: pg-boss (en vez de Redis/BullMQ), Drizzle, esquema `analytics` para lo nuevo, atribución "último toque".
