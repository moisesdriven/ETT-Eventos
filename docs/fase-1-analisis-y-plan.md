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

---

## 7. Actualización tras la respuesta del 2026-10-30

### 7.1 Alcance simplificado
- **Despliegue aislado en Contabo**: stack propio en `docker-compose` (PostgreSQL propio + web + worker detrás de Traefik). No se conecta a ninguna base existente, así que no hay riesgo sobre datos previos.
- **Una sola subcuenta.** La configuración se reduce a variables de entorno en el servidor:
  - `GHL_AGENCY_TOKEN` (pit- o OAuth de agencia) → solo para `wallet-transactions` (endpoint SaaS de agencia).
  - `GHL_LOCATION_TOKEN` (pit- de la subcuenta) y `GHL_LOCATION_ID` → mensajes, contactos, tags.
  - Los tokens nunca se guardan en el repositorio ni se pegan en el chat; si se cargan en BD, van cifrados con AES‑256‑GCM.
- El módulo de OAuth completo (flujo de autorización de Marketplace) pasa a ser opcional; el cliente GHL abstrae el origen del token para poder activarlo después.

### 7.2 Nomenclatura de las etiquetas de evento
Las 28 etiquetas entregadas cumplen todas un mismo patrón (validado):

```
<PROGRAMA><EDICIÓN>[-EV<N>]-<FORMATO>-<DD>.<MM>.<AA>
AEC03-EV01-WSI-07.01.26  → programa AEC, edición 03, evento 01, formato WSI, fecha 2026-01-07
IATT01-WSI-24.01.26      → programa IATT, edición 01, sin nº de evento, formato WSI, fecha 2026-01-24
```

Regex: `^([A-Z]+)(\d+)(?:-EV(\d+))?-([A-Z]{3})-(\d{2})\.(\d{2})\.(\d{2})$`

- Formatos encontrados: `LCI` (14), `WSI` (6), `WCI` (6), `PCI` (2).
- 18 programas distintos (AEC, IATT, MGI, DEE, ITT, MEN, …).
- Fecha del evento embebida en la etiqueta (formato día.mes.año; `31.08.26` confirma que el día va primero).

Implicancias:
1. **Alta automática de eventos**: al sincronizar tags, toda etiqueta que cumpla el patrón se propone como Evento con nombre, programa, formato y fecha ya llenos. El usuario solo confirma o ajusta la ventana.
2. **Nuevas dimensiones de análisis**: gasto por programa (familia de eventos) y por formato.
3. **Los eventos están muy juntos** (entre 1 y 39 días de separación; mediana ≈ 9). Una ventana fija se solapa a menudo, así que la regla de desempate es clave.

### 7.3 Regla de atribución propuesta para estos eventos
Para cada cargo de un contacto con una o más etiquetas de evento:
1. Ventana de cada evento: desde `fecha_evento − 30 días` (o desde que se vio la etiqueta, si se conoce) hasta `fecha_evento + 7 días`. Ambos valores configurables por evento.
2. Si varias ventanas cubren el cargo, gana **el próximo evento** (fecha ≥ día del cargo, hora Lima) más cercano; si ninguno es futuro, el **último evento pasado** dentro de su ventana posterior.
3. Sin evento aplicable → `Orgánico / Sin campaña`.

Es equivalente a "último tag aplicado" en la práctica (el contacto se inscribe al siguiente evento) y funciona también con el histórico, donde GHL no da la fecha de cada etiqueta.

### 7.4 Decisiones del usuario (2026-10-30)
- **Ventana por defecto: −15 / +3 días** respecto a la fecha del evento (ajustable por evento). Reemplaza la propuesta −30 / +7 del punto 7.3.
- **Atribución por evidencia, no por regla fija**: el gasto se asigna al evento cuya etiqueta tenía el contacto *en el momento del cobro*, usando el historial real. Fuentes, en orden de prioridad:
  1. Webhook `ContactTagUpdate` (exacto, desde que se active).
  2. Evidencia histórica en GHL (por verificar en la subcuenta real): mensajes de actividad de la conversación, `source`/workflow del mensaje saliente que generó el cobro y contenido o plantilla del mensaje que identifique al evento.
  3. Solo si no hay evidencia: la ventana −15 / +3 días.
  - Si aun así el cargo es elegible para varios eventos, se reparte entre ellos cuadrando al centavo (el residuo se asigna de forma determinista) y queda marcado como "atribución compartida" para auditoría.
- La subcuenta real no está entre las 4 accesibles desde el conector actual (ninguna tiene contactos con estas etiquetas); hace falta acceso para verificar el punto 2.

### 7.5 Pendiente
- Muestra real de `wallet-transactions` para confirmar el formato de `ref:`.
- Significado de los formatos `WSI`, `LCI`, `WCI`, `PCI` (solo para mostrar etiquetas legibles; no bloquea).

---

## 8. Muestras reales de la subcuenta ETT (2026-10-30, solo lectura)

Subcuenta `ETT` (zona horaria configurada en GHL: `America/Bogota`, mismo desfase UTC‑5 que Lima). Tokens leídos desde variables de entorno; nunca se imprimieron.

### 8.1 Regla de ventana confirmada por el usuario
- El inicio del evento es la fecha de la etiqueta; duración máxima **14 días incluyendo seguimiento** → ventana `[fecha 00:00 Lima, fecha + 14 días 00:00 Lima)`. Reemplaza la ventana −15 / +3.

### 8.2 Monedero (`wallet-transactions`) — sigue sin datos ⚠️
- Endpoint correcto según la [documentación oficial](https://marketplace.gohighlevel.com/docs/ghl/saas-api/list-location-wallet-transactions): `POST /saas/locations/{id}/wallet-transactions`, header `Version: v3`, cuerpo `{skip, limit, filters:{locationId, settlementTime:{from,to}, chargeType}, timezone}`.
- Con el token de agencia (y también con el de la subcuenta) responde `201` pero **`transactions: []`** en todos los rangos probados (día, mes, semestre; 2025 y 2026) y también en otras subcuentas de la agencia. Rangos muy amplios devuelven `500`.
- Hipótesis: (a) los cargos de WhatsApp de ETT no pasan por el monedero de GHL (WABA pagada directamente a Meta), o (b) el endpoint necesita otro permiso o rebilling activo. **Hay que confirmarlo en la interfaz de GHL.**

### 8.3 Mensajes de WhatsApp
- `GET /conversations/messages/export?channel=WhatsApp` funciona con el token de la subcuenta: **150 237 mensajes**.
- Línea observada: `+51 922 744 815` (formato con espacios → normalizar).
- `source`: `workflow` (automatizaciones), `app` (asesor), vacío (entrantes). Los mensajes de workflow traen en `attachments` una URL con el `workflowId`.
- `GET /conversations/messages/{id}` devuelve `401 Token source/channel mismatch` con token `pit-`; no se usará (el export cubre lo necesario).

### 8.4 Historial de etiquetas
- GHL **no** registra en la conversación cuándo se aplica una etiqueta (solo actividades de oportunidad: `opportunity_created`, `opportunity_stage_updated`, pipeline `ETT`).
- Evidencia útil encontrada: el **primer mensaje entrante** suele ser el texto prellenado del anuncio, que nombra el evento (p. ej. "Quiero inscribirme en Mentores 100K GP"), y la creación del contacto y de la oportunidad ocurren en el mismo segundo. Esto permite fechar la inscripción a un evento.
- Las etiquetas en GHL están en **minúsculas**.

### 8.5 Etiquetas reales vs tabla de eventos
67 etiquetas en la subcuenta. Solo 16 de los 28 códigos de la tabla existen tal cual; otros tienen variantes:

| Evento (tabla) | Código tabla | Etiqueta(s) reales en GHL | Contactos |
|---|---|---|---|
| Aceleradora Ecommerce | AEC03-EV01-WSI-07.01.26 | `aec03-ev01-wsi-07.01.26`, ¿`aec-ev01-wsi-07.01.26`? | 2 |
| Aceleradora Ecommerce | AEC03-EV02-WSI-10.01.26 | `aec03-ev02-wsi-10.01.26` | 1 |
| Alquiler Venta Vehículos | AVV02-EV01-LCI-15.01.26 | igual | 528 |
| Aceleradora Ecommerce | AEC03-EV03-WSI-17.01.26 | **no existe** | — |
| IATT | IATT01-WSI-24.01.26 | **no existe**; ¿`lan02-ev02-wsi-24.01.26`? | — |
| IATT | IATT02-WSI-29.01.26 | **no existe**; ¿`lan02-ev02-wsi-29.01.26`? | — |
| Mentoría Grupal Inmobiliaria | MGI04-WCI-07.02.26 | ¿`min04-ev01-wp-07.02.26`? | — |
| Desafío Ecommerce | DEE14-EV01-LCI-19.02.26 | igual; ¿también `dee14-ev01-wsi-26.02.26`? | 676 |
| IATT | IATT03-WCI-21.02.26 | ¿`iatt-ev03-wci-21.02.26`? | — |
| IATT | IATT04-WSI-01.03.26 | ¿`iatt-ev04-wsi-01.03.26`? | — |
| Importaciones Todo Terreno | ITT03-EV03-LCI-13.03.26 | igual; ¿también `itt03-ev03-wsi-17.03.26`? | 207 |
| Plano 360 | PES02-EV02-LCI-20.03.26 | igual | 231 |
| Mentores 100k | MEN02-EV012-LCI-27.03.26 | igual; ¿también `men-ev013-lci-27.03.26`, `men03-lci-27.03.26`? | 356 |
| Método Driven | MED02-LCI-17.04.26 | ¿`mcd02-ev02-lci-17.04.26`? | — |
| Remates Judiciales | REJ04-EV01-LCI-30.04.26 | igual | 438 |
| Cerrador Inmobiliario | CEI05-EV01-LCI-21.05.26 | igual | 957 |
| Aceleradora Ecommerce | AEC04-EV01-WCI-12.06.26 | igual | 166 |
| Creando con Cuerdas | CRC01-EV01-WCI-13.06.26 | igual | 351 |
| CURSO IA | CIA02-EV01-WCI-14.06.26 | igual | 147 |
| Desafío Ecommerce | DEE15-EV01-LCI-23.07.26 | igual | 937 |
| Presencial – Remates Judiciales | PRJ05-LCI-01.08.26 | ¿`rej05-ev01-lci-01.08.26`? | — |
| Importaciones Todo Terreno | ITT04-EV01-LCI-13.08.26 | igual | 219 |
| Mentoría Grupal Remates | MGR01-PCI-22.08.26 | **no existe** | — |
| Ventas 360 | CVS01-EV01-LCI-27.08.26 | igual | 590 |
| Presencial – Cerrador Inmobiliario | PCI01-WCI-31.08.26 | ¿`cip-ev01-wci-31.08.26`? | — |
| Plataforma – Remates Judiciales | PLRJ01-LCI-12.09.26 | ¿`rej06-ev01-lci-12.09.26`? | — |
| Mentoría Grupal Inmobiliaria | MGI05-PCI-26.09.26 | **no existe** | — |
| Mentores 100k | MEN03-LCI-08.10.26 | igual | 220 |

Además hay etiquetas de eventos de 2025 (`avv01-ev03-wci-04.10.25`, `cia01-ev02-wci-24.09.25`, `cei05-ev01-lci-13.11.25`, `dee13`, `eam04`, `itt02`, `pes01`, `rej03`…).

Implicancias de diseño:
- El patrón real es más flexible: programa sin edición (`aec-`, `iatt-`, `men-`), formato de 2 letras (`wp`). Parser tolerante + **mapeo manual etiqueta(s) → evento** en el catálogo, con sugerencia automática por fecha.
- Un evento puede tener varias etiquetas (ya contemplado en `campaign_tags`).

### 8.6 Ventana de 14 días vs datos
Contactos *creados* más de 14 días después del inicio: CRC01 27 %, CIA02 43 %, DEE15 3 %, el resto ≤ 2 %. Entre 5 % y 52 % de los contactos de cada etiqueta ya existían antes del inicio (contactos reutilizados). Con la regla estricta, el gasto de esos contactos fuera de la ventana irá a "Orgánico / Sin campaña".

---

## 9. Ajuste: módulo "Etiquetas de evento" (decisión del usuario, 2026-10-30)

Se descarta el mapeo automático entre la tabla de eventos y las etiquetas. En su lugar:

1. **Catálogo de etiquetas**: el worker sincroniza todas las etiquetas existentes en la subcuenta (`GET /locations/{id}/tags`) con su cantidad de contactos. Ninguna se considera evento por defecto.
2. **Marcar como evento**: el usuario (rol `admin` o `analista`) elige una etiqueta existente y la marca como evento. El formulario precarga:
   - nombre comercial (editable, vacío o sugerido);
   - fecha de inicio = fecha leída de la etiqueta si cumple el patrón `dd.mm.aa`, editable;
   - fecha de fin = inicio + 14 días (máximo, editable hacia abajo);
   - opcionalmente, agrupar más de una etiqueta en el mismo evento.
3. **Cálculo bajo demanda**: solo al marcar (o editar) un evento se encola el cálculo de su gasto: contactos con esa etiqueta × cobros de WhatsApp dentro de `[inicio, fin)` en hora de Lima. Se vuelve a calcular si cambian las fechas, las etiquetas o llegan cobros nuevos del periodo.
4. **Desmarcar** una etiqueta elimina su atribución; ese gasto vuelve a "Orgánico / Sin campaña". El total del monedero nunca cambia.
5. Las etiquetas no marcadas no participan en ningún cálculo.

Efecto en el plan: el "Módulo 2 — Campañas y Eventos" se implementa así; la tabla de la sección 8.5 queda solo como referencia.
