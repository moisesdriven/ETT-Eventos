# ETT Eventos

Plataforma interna para medir el costo real de WhatsApp en GoHighLevel por día, número remitente y evento (etiqueta), en hora de Lima.

El análisis y el plan por fases están en [`docs/fase-1-analisis-y-plan.md`](docs/fase-1-analisis-y-plan.md).

## Estructura

```
apps/web        Next.js (App Router): login, roles, paneles
packages/core   Lógica pura: fechas en hora de Lima, etiquetas de evento, montos, teléfonos, cifrado, contraseñas
packages/db     Esquema Drizzle (esquemas `app` y `analytics`), migraciones y scripts
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
