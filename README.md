# ETT Eventos

Plataforma interna para medir el costo real de WhatsApp en GoHighLevel por día, número remitente y evento (etiqueta), en hora de Lima.

El análisis y el plan por fases están en [`docs/fase-1-analisis-y-plan.md`](docs/fase-1-analisis-y-plan.md). Para producción, ver [`docs/despliegue-contabo.md`](docs/despliegue-contabo.md).

## Estructura

```
apps/web        Next.js (App Router): login, roles, paneles
packages/core   Lógica pura: fechas en hora de Lima, etiquetas de evento, montos, teléfonos, cifrado, contraseñas
packages/db     Esquema Drizzle (esquemas `app` y `analytics`), migraciones, scripts y cola de trabajos
packages/ghl    Cliente de GoHighLevel: límite de 80 llamadas / 10 s, reintentos con backoff ante 429/5xx
apps/worker     Sincronización: monedero de agencia, mensajes de WhatsApp, contactos, etiquetas y atribución
```

## Cómo se calcula el gasto

1. **Cobros**: monedero de la agencia (`POST /saas/companies/{companyId}/wallet-transactions`, `Version: v3`) filtrado por la subcuenta. Solo se guardan los de WhatsApp.
2. **Cruce**: cada cobro trae `ref: wamid…`, que coincide con el `altId` del mensaje (export de mensajes de WhatsApp). Del mensaje salen conversación, contacto y número remitente.
3. **Eventos**: en *Etiquetas de evento* se marca una etiqueta existente como evento (inicio = fecha de la etiqueta, máximo 14 días). El cobro se atribuye al evento si ocurrió en esas fechas y el contacto tenía la etiqueta. Si varios eventos aplican, se reparte en partes iguales cuadrando al micro-dólar. El resto es «Orgánico / Sin campaña».
4. **Conciliación**: todos los días se compara, por día de Lima, el total de la BD con el monedero de GHL.

## Pantallas

| Ruta | Para qué | Rol mínimo |
|---|---|---|
| `/` | Dashboard: gasto total y por categoría, contactos y conversaciones únicos, costo por contacto/conversación, gasto promedio por día, evolución diaria/mensual, gasto por número, top 10 eventos | lectura |
| `/eventos` | Marcar etiquetas como evento, tabla de rendimiento por evento, detalle con gráfico diario y transacciones | lectura (editar: analista) |
| `/numeros` | Comparativo por línea de WhatsApp: categorías, contactos, eventos, costo por contacto, gasto mensual | lectura |
| `/sincronizacion` | Estado, carga histórica, conciliación y registro de trabajos | admin |
| `/admin/usuarios`, `/admin/auditoria` | Usuarios, roles y auditoría | admin |

Los filtros (periodo rápido, mes y año, rango libre, número, evento, categorías, vista por día o mes) viajan en la URL y se recuerdan en el navegador. Las exportaciones CSV (analista o admin) usan los mismos filtros y quedan registradas en auditoría.

## Worker

La cola de trabajos es la tabla `analytics.sync_runs` (también es el registro visible en *Sincronización*). El worker:

- cada 15 min sincroniza las últimas 48 h;
- cada día (03:00 Lima) actualiza el catálogo de etiquetas y contactos con etiqueta de evento, y concilia los últimos 7 días;
- atiende los trabajos pedidos desde la app (carga histórica, conciliación, cálculo de evento).

```bash
pnpm --filter @ett/worker start                                   # requiere GHL_* y DATABASE_URL
pnpm --filter @ett/worker enqueue backfill 2026-05-01 2026-10-31   # carga histórica (días de Lima)
pnpm --filter @ett/worker enqueue conciliacion 2026-10-01 2026-10-31
```

## Desarrollo local

Requisitos: Node 22, pnpm 10 y PostgreSQL 16 (o Docker).

```bash
cp .env.example .env            # completa DATABASE_URL y APP_ENCRYPTION_KEY
docker compose -f docker-compose.dev.yml up -d   # opcional: PostgreSQL local
pnpm install
pnpm db:migrate                  # aplica migraciones (solo crea; no borra nada)
ADMIN_EMAIL=tu@correo ADMIN_PASSWORD='una-clave-larga' pnpm db:create-admin
pnpm dev                         # http://localhost:3000
```

Los scripts leen las variables del entorno; para usar el archivo `.env`, cárgalo antes (por ejemplo `set -a; . ./.env; set +a`).

### En Windows con PowerShell

```powershell
Copy-Item .env.example .env
```

```powershell
docker compose -f docker-compose.dev.yml up -d
```

```powershell
pnpm install
```

```powershell
$env:DATABASE_URL = "postgres://ett:ett@localhost:5432/ett"
```

```powershell
pnpm db:migrate
```

```powershell
$env:ADMIN_EMAIL = "tu@correo.com"; $env:ADMIN_PASSWORD = "una-clave-larga"; pnpm db:create-admin
```

```powershell
pnpm dev
```

Las variables definidas con `$env:` duran mientras la ventana de PowerShell esté abierta. Para producción, la guía [`docs/despliegue-contabo.md`](docs/despliegue-contabo.md) está escrita para PowerShell.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm test` | Pruebas unitarias (Vitest) |
| `pnpm typecheck` | Verificación de tipos de todo el monorepo |
| `pnpm build` | Compila la app web |
| `pnpm db:generate` | Genera una migración nueva a partir del esquema |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:create-admin` | Crea o reactiva un administrador (usa `ADMIN_EMAIL`, `ADMIN_PASSWORD`) |

## Seguridad

- Contraseñas con Argon2id; mínimo 12 caracteres.
- Sesión en cookie `httpOnly`, `SameSite=Lax`, `Secure` y prefijo `__Host-` en producción. En la base solo se guarda el SHA-256 del token. Vence a las 12 horas.
- Bloqueo tras 5 intentos fallidos por correo (o 20 por IP) en 15 minutos.
- Las acciones de servidor de Next.js validan el origen de la petición (CSRF) y todas las entradas se validan con Zod.
- Roles: `admin` (usuarios, sincronización, configuración), `analista` (eventos y exportaciones), `lectura` (solo paneles). Los permisos se verifican en el servidor en cada página y acción.
- Cabeceras CSP, `X-Frame-Options: DENY`, HSTS en producción.
- Auditoría de inicios de sesión, intentos fallidos y cambios de usuarios.
- Los tokens de GoHighLevel solo existen en el servidor (variables de entorno o cifrados con AES-256-GCM).
