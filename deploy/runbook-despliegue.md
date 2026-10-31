# Runbook: despliegue de ETT Eventos en Contabo

Sistema nuevo en **https://ettgastos.drivenbox.com** (servidor `144.91.106.148`), en paralelo
a lo que ya corre en ese servidor (drivenbox, driven-conteo, etc.). **No toca nada existente**: trae su propio
PostgreSQL en un volumen propio, no usa `drivenbox-db`, no publica puertos y solo se une a la red `web` de Traefik
para recibir su dominio.

Archivos: `docker-compose.yml`, `Dockerfile`, `.env.production.example`, `deploy/generar-env.sh`.

Cómo se ejecuta: desde **PowerShell en tu PC**, conéctate al servidor y pega los bloques `bash` en esa misma
ventana:

```powershell
ssh root@144.91.106.148
```

## 0. Entorno del servidor

- Traefik (`traefik:latest`) en la red `web`, entrypoint `websecure`, certresolver `letsencrypt` (HTTP challenge).
- 8 CPU, 23 GB de RAM, 102 GB libres: las imágenes se construyen en el mismo servidor.
- Repositorio público: se clona sin token.

| Recurso de este stack | Nombre | ¿Choca con algo existente? |
|---|---|---|
| Proyecto de Compose | `ett-eventos` (contenedores `ett-eventos-*`) | No |
| Base de datos | contenedor `ett-eventos-db-1`, volumen `ett-eventos_pgdata`, solo en la red interna del stack | No usa `drivenbox-db` |
| Router de Traefik | `ett-eventos` | No |
| Carpeta | `/opt/ett-eventos` | No |
| Puertos publicados | ninguno | No |

## 1. DNS (antes de levantar, para que Let's Encrypt emita el certificado)

Crear el registro `A` de `ettgastos.drivenbox.com` → `144.91.106.148` en el proveedor DNS y
verificar desde el servidor:

```bash
getent hosts ettgastos.drivenbox.com
```

Debe responder `144.91.106.148`. Si no responde, esperar la propagación antes del paso 5 (con el HTTP challenge,
Let's Encrypt falla si el dominio aún no apunta al servidor).

> Respaldo de bases existentes: **no aplica**. Este sistema no se conecta a `drivenbox-db` ni a ninguna base
> actual. Su propia base se respalda sola a diario (paso 8).

## 2. Comprobar Traefik y que nada se llame igual

```bash
docker network inspect web --format '{{.Name}}: {{len .Containers}} contenedores' && docker ps --format '{{.Names}}' | grep -i ett-eventos || echo 'Sin contenedores ett-eventos previos: OK'
```

## 3. Código en el servidor

```bash
git clone --branch claude/inspiring-lamport-0y4obi https://github.com/moisesdriven/ETT-Eventos.git /opt/ett-eventos
```

Cuando el pull request se fusione en `main`, cambiar de rama con `cd /opt/ett-eventos && git checkout main && git pull`.

## 4. Variables de entorno (secretos generados al azar)

```bash
sh /opt/ett-eventos/deploy/generar-env.sh
```

Propone los valores de este servidor (dominio, red `web`, `websecure`, `letsencrypt`; Enter para aceptar), pide
los dos tokens `pit-` de GHL y el ID de la subcuenta ETT sin mostrarlos, genera la contraseña de PostgreSQL y crea
`/opt/ett-eventos/.env` con permisos 600. No sobrescribe un `.env` existente. Para cambiar algo después:
`nano /opt/ett-eventos/.env`.

## 5. Construir y levantar

```bash
cd /opt/ett-eventos && mkdir -p backups && docker compose up -d --build
```

La primera vez tarda varios minutos. `migrate` crea las tablas (solo crea; nunca borra) y termina; después arrancan
`web`, `worker` y `backup`. Verificar:

```bash
cd /opt/ett-eventos && docker compose ps && docker compose logs --tail 30 web worker
```

Esperado: `db` y `web` en `healthy`, `worker` y `backup` en `running`, `migrate` en `exited (0)`, y en el worker
`"Subcuenta lista","location":"ETT"` seguido de `"Trabajo completado"`.

## 6. Primer administrador

```bash
cd /opt/ett-eventos && docker compose run --rm -e ADMIN_EMAIL=TU_CORREO -e ADMIN_PASSWORD='UNA-CLAVE-DE-12-O-MAS' migrate node_modules/.bin/tsx src/scripts/create-admin.ts
```

Abrir https://ettgastos.drivenbox.com e ingresar. Después, desde **Usuarios**, crear las cuentas
del equipo con su rol (Administrador, Analista o Solo lectura).

> Para que la contraseña no quede en el historial del servidor, ejecuta antes `HISTCONTROL=ignorespace` y empieza
> el comando con un espacio, o bórralo luego con `history -d $(history 1 | awk '{print $1}')`.

## 7. Carga histórica y verificación del cuadre

GHL conserva 6 meses de transacciones. Desde la app (**Sincronización → Carga histórica**) o:

```bash
cd /opt/ett-eventos && docker compose exec -T worker node_modules/.bin/tsx src/cli.ts backfill 2026-05-01 2026-10-31
```

Tarda 15 a 20 minutos (el avance se ve en **Sincronización**). Al terminar, conciliar contra el monedero:

```bash
cd /opt/ett-eventos && docker compose exec -T worker node_modules/.bin/tsx src/cli.ts conciliacion 2026-05-01 2026-10-31
```

En **Sincronización**, el trabajo «Conciliación con el monedero» debe decir **cuadre exacto**. Comparar además el
Dashboard (mes de octubre) con *Facturación → Wallet & Transactions → Por actividad* de GHL filtrado por ETT: deben
coincidir Marketing, Utilidad y Servicio.

Luego marcar las etiquetas de los eventos en **Etiquetas de evento**.

## 8. Respaldos

Automático: un `pg_dump` diario en `/opt/ett-eventos/backups` (14 días, permisos 600). Respaldo inmediato:

```bash
cd /opt/ett-eventos && docker compose exec -T backup sh -c 'umask 077 && pg_dump -Fc -f /backups/ett-$(date -u +%Y%m%d-%H%M)-manual.dump' && ls -lh backups | tail -n 3
```

Copiar los respaldos a tu PC (en PowerShell, no en el servidor):

```powershell
New-Item -ItemType Directory -Force -Path C:\Respaldos\ett-eventos | Out-Null; scp "root@144.91.106.148:/opt/ett-eventos/backups/*.dump" C:\Respaldos\ett-eventos\
```

Guardar también una copia segura de `/opt/ett-eventos/.env` (tiene la contraseña de la base y los tokens).

## Cobros sin cruzar («Sin número»)

La API de exportación de mensajes de GHL a veces responde 0 mensajes sin error. El worker verifica cada día y
reintenta; además, una reparación diaria vuelve a descargar los días con cobros sin cruzar. Para lanzarla a mano
(también desde **Sincronización → Reparar cobros sin cruzar**):

```bash
cd /opt/ett-eventos && docker compose exec -T worker node_modules/.bin/tsx src/cli.ts reparacion
```

## Actualizaciones

```bash
cd /opt/ett-eventos && git pull && docker compose up -d --build && docker image prune -f && docker compose ps
```

`migrate` corre antes que `web` y `worker`, así que las migraciones nuevas se aplican solas.

## Volver atrás

```bash
cd /opt/ett-eventos && docker compose down
```

Detiene ETT Eventos sin afectar nada más del servidor. Los datos quedan en el volumen `ett-eventos_pgdata` y en
`backups/`; `docker compose up -d` lo vuelve a levantar tal cual. Borrar los datos (`docker compose down -v`)
es irreversible: hacerlo solo con un respaldo descargado y aprobación.

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| El navegador muestra certificado inválido | DNS del paso 1; logs de Traefik: `docker logs traefik --tail 50 2>&1 \| grep -i ett-eventos`. |
| `404 page not found` de Traefik | `TRAEFIK_NETWORK=web` en `.env` y que `web` esté en `healthy`. |
| `worker` se reinicia con «Falta GHL_…» | Variable vacía en `.env`; corregir con `nano` y `docker compose up -d worker`. |
| `worker` registra `401` de GHL | Token vencido o sin permisos; reemplazarlo en `.env` y `docker compose up -d worker`. |
| Muchos `Reintento GHL … 429` | Normal en la carga histórica: GHL limita la velocidad y el worker reintenta solo. |
