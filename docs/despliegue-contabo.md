# Despliegue en Contabo (Docker + Traefik)

El stack es independiente: trae su propio PostgreSQL, no se conecta a ninguna otra base y no expone la base de datos a internet. Solo necesita dos credenciales de GoHighLevel: el token de la agencia y el de la subcuenta ETT.

## Qué se levanta

| Servicio | Qué hace |
|---|---|
| `db` | PostgreSQL 16 con volumen persistente `pgdata`. Sin puertos publicados. |
| `migrate` | Aplica migraciones pendientes y termina. Solo crea; nunca borra datos. |
| `web` | La aplicación (Next.js) detrás de Traefik con HTTPS. |
| `worker` | Sincroniza con GoHighLevel cada 15 min y concilia a diario. |
| `backup` | `pg_dump` diario en `./backups`, conserva 14 días. |

## Requisitos en el servidor

- Docker Engine y Docker Compose v2.
- Traefik funcionando, con una red Docker externa (por defecto `traefik`), un entrypoint HTTPS (por defecto `websecure`) y un certresolver (por defecto `letsencrypt`). Si tus nombres son otros, se cambian en `.env`.
- Un registro DNS `A` del dominio apuntando a la IP del servidor.

## Primera instalación

```bash
git clone https://github.com/moisesdriven/ett-eventos.git ett-eventos
```

```bash
cd ett-eventos
```

```bash
cp .env.production.example .env
```

```bash
chmod 600 .env
```

Edita `.env` y completa:

- `APP_DOMAIN`: el dominio (por ejemplo `eventos.tudominio.com`).
- `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER`: los de tu Traefik.
- `POSTGRES_PASSWORD`: una contraseña larga. Puedes generarla con `openssl rand -base64 32 | tr -d '/+='`.
- `GHL_AGENCY_TOKEN`, `GHL_LOCATION_TOKEN`, `GHL_LOCATION_ID`: los tokens `pit-` y el ID de la subcuenta ETT.

Levanta el stack:

```bash
docker compose up -d --build
```

Crea el primer administrador (la contraseña debe tener al menos 12 caracteres):

```bash
docker compose run --rm -e ADMIN_EMAIL=tu@correo.com -e ADMIN_PASSWORD='una-clave-larga-y-segura' migrate node_modules/.bin/tsx src/scripts/create-admin.ts
```

Carga el histórico disponible en GHL (6 meses). Puedes hacerlo desde *Sincronización → Carga histórica* en la app, o por consola:

```bash
docker compose exec worker node_modules/.bin/tsx src/cli.ts backfill 2026-05-01 2026-10-31
```

Con aproximadamente 40 000 cobros tarda entre 15 y 20 minutos. El avance se ve en *Sincronización*.

## Verificar el cuadre con el monedero de GHL

La conciliación corre sola todos los días (últimos 7 días). Para un rango a pedido, usa *Sincronización → Conciliación* o:

```bash
docker compose exec worker node_modules/.bin/tsx src/cli.ts conciliacion 2026-10-01 2026-10-31
```

El resultado indica cuántos días se compararon y cuántos tenían descuadre. Si faltaban cobros, se agregan y el rango se vuelve a cruzar y atribuir automáticamente.

## Operación diaria

| Tarea | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Logs del worker | `docker compose logs -f --tail=100 worker` |
| Logs de la web | `docker compose logs -f --tail=100 web` |
| Actualizar a una nueva versión | `git pull` y luego `docker compose up -d --build` |
| Reiniciar el worker | `docker compose restart worker` |

Al actualizar, `migrate` corre antes que la web y el worker, así que las migraciones nuevas se aplican solas.

## Respaldos y restauración

Los respaldos quedan en `./backups/ett-AAAAMMDD-HHMM.dump`. Conviene copiarlos fuera del servidor (por ejemplo con `rclone` o el backup de Contabo).

Para restaurar un respaldo en una base nueva y revisarlo sin tocar la productiva:

```bash
docker compose exec backup sh -c 'createdb ett_restaurada && pg_restore -d ett_restaurada /backups/ett-AAAAMMDD-HHMM.dump'
```

Para reemplazar la base productiva hay que detener primero `web` y `worker`. Haz esto solo si estás seguro, porque sobrescribe los datos actuales.

## Seguridad

- La base de datos no publica puertos; solo la ven los contenedores del stack.
- Los tokens de GHL solo están en `.env` del servidor y en el contenedor del worker. Nunca llegan al navegador.
- La web corre como usuario sin privilegios, con cookies `Secure`/`httpOnly`, HSTS y CSP.
- `.env` y `backups/` están en `.gitignore`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `worker` se reinicia con «Falta GHL_…» | Variable vacía en `.env`. |
| `worker` registra `401` de GHL | Token vencido o sin permisos; genera uno nuevo y reinicia el worker. |
| La web no responde por el dominio | Revisa que `TRAEFIK_NETWORK`, el entrypoint y el certresolver coincidan con tu Traefik, y el DNS. |
| Muchos avisos `Reintento GHL … 429` | Normal en cargas históricas: GHL limita la velocidad y el worker reintenta solo. |
