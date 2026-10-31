# Despliegue en Contabo desde PowerShell (Docker + Traefik)

El stack es independiente: trae su propio PostgreSQL, no se conecta a ninguna otra base y no expone la base de datos a internet. Solo necesita dos credenciales de GoHighLevel: el token de la agencia y el de la subcuenta ETT.

## Cómo leer esta guía

Todo se hace desde **PowerShell en tu PC con Windows**. Hay dos tipos de bloques:

- **`powershell` — en tu PC.** Se escriben en PowerShell tal cual.
- **`bash` — dentro del servidor.** Primero te conectas con `ssh` (paso 1). Desde ese momento, la misma ventana de PowerShell muestra la terminal del servidor (Linux), y ahí se escriben estos comandos. Para volver a tu PC, escribe `exit`.

En los ejemplos, reemplaza `IP_DEL_SERVIDOR` por la IP de tu VPS de Contabo y `root` por tu usuario si usas otro.

> **Servidor de producción (144.91.106.148, `ettgastos.drivenbox.com`):** sigue el runbook
> [`deploy/runbook-despliegue.md`](../deploy/runbook-despliegue.md), que ya trae los valores de ese servidor
> (red `web` de Traefik, carpeta `/opt/ett-eventos`). Esta guía es la referencia general.

## Opción recomendada: scripts de PowerShell

En `scripts/windows` hay scripts que hacen toda la instalación y la operación desde tu PC sin escribir comandos en el servidor: `01-configurar-llave-ssh.ps1`, `02-instalar.ps1`, `03-crear-admin.ps1`, `04-carga-historica.ps1`, y para el día a día `estado.ps1`, `logs.ps1`, `actualizar.ps1`, `conciliar.ps1`, `descargar-respaldos.ps1`, entre otros. Las instrucciones están en [`scripts/windows/LEEME.md`](../scripts/windows/LEEME.md).

El resto de esta guía explica los mismos pasos a mano, por si prefieres hacerlos uno por uno.

## Qué se levanta

| Servicio | Qué hace |
|---|---|
| `db` | PostgreSQL 16 con volumen persistente `pgdata`. Sin puertos publicados. |
| `migrate` | Aplica migraciones pendientes y termina. Solo crea; nunca borra datos. |
| `web` | La aplicación (Next.js) detrás de Traefik con HTTPS. |
| `worker` | Sincroniza con GoHighLevel cada 15 min y concilia a diario. |
| `backup` | `pg_dump` diario en `./backups`, conserva 14 días. |

## Requisitos

- En tu PC: Windows 10 u 11. `ssh` y `scp` ya vienen incluidos en PowerShell.
- En el servidor: Docker con Docker Compose v2, y Traefik funcionando con una red Docker externa (por defecto `traefik`), un entrypoint HTTPS (por defecto `websecure`) y un certresolver (por defecto `letsencrypt`). Si tus nombres son otros, se cambian en `.env`.
- Un registro DNS `A` del dominio apuntando a la IP del servidor.
- Un token de GitHub con permiso de lectura del repositorio, porque el repositorio es privado (GitHub → Settings → Developer settings → Fine-grained tokens → acceso de solo lectura a «Contents» de `ett-eventos`).

## 1. Conectarte al servidor

```powershell
ssh root@IP_DEL_SERVIDOR
```

La primera vez pregunta si confías en el servidor: escribe `yes`. Luego pide la contraseña del VPS (al escribirla no se ve nada; es normal).

Comprueba que Docker esté instalado:

```bash
docker compose version
```

Si responde «command not found», instálalo:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Descargar el proyecto

```bash
git clone https://github.com/moisesdriven/ett-eventos.git ett-eventos
```

Cuando pida usuario escribe tu usuario de GitHub, y como contraseña pega el token de GitHub (no tu contraseña de GitHub).

```bash
cd ett-eventos
```

## 3. Generar la contraseña de la base de datos

Abre **otra** ventana de PowerShell en tu PC (deja la del servidor abierta) y genera una contraseña de 40 caracteres:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Cópiala; la usarás en el siguiente paso.

## 4. Crear el archivo `.env` en el servidor

De vuelta en la ventana conectada al servidor:

```bash
cp .env.production.example .env
```

```bash
chmod 600 .env
```

```bash
nano .env
```

Completa:

- `APP_DOMAIN`: el dominio (por ejemplo `eventos.tudominio.com`).
- `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER`: los de tu Traefik.
- `POSTGRES_PASSWORD`: la contraseña del paso 3.
- `GHL_AGENCY_TOKEN`, `GHL_LOCATION_TOKEN`, `GHL_LOCATION_ID`: los tokens `pit-` y el ID de la subcuenta ETT.

En `nano`, para pegar usa clic derecho en la ventana de PowerShell. Para guardar: `Ctrl + O`, `Enter`. Para salir: `Ctrl + X`.

> Edita el `.env` directamente en el servidor con `nano`. Si lo preparas en el Bloc de notas de Windows y lo subes, Windows agrega saltos de línea `CRLF` que pueden pegar un carácter invisible al final de los tokens y hacer que GHL los rechace.

Si no sabes el nombre de la red de tu Traefik, lístalas:

```bash
docker network ls
```

## 5. Levantar el stack

```bash
docker compose up -d --build
```

La primera vez tarda varios minutos porque compila las imágenes. Luego revisa que todo esté arriba:

```bash
docker compose ps
```

Debes ver `db` y `web` como `healthy`, `worker` y `backup` como `running`, y `migrate` como `exited (0)`.

## 6. Crear el primer administrador

La contraseña debe tener al menos 12 caracteres. Escríbela entre comillas simples:

```bash
docker compose run --rm -e ADMIN_EMAIL=tu@correo.com -e ADMIN_PASSWORD='una-clave-larga-y-segura' migrate node_modules/.bin/tsx src/scripts/create-admin.ts
```

Ya puedes entrar en `https://TU_DOMINIO` con ese correo y contraseña.

## 7. Cargar el histórico

GHL conserva 6 meses de transacciones. Desde la app: *Sincronización → Carga histórica*. O desde el servidor:

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

## Operación diaria desde PowerShell

No hace falta entrar al servidor para lo habitual: `ssh` puede ejecutar un comando y volver. Escribe estos en **tu PowerShell**:

| Tarea | Comando en PowerShell |
|---|---|
| Ver estado | `ssh root@IP_DEL_SERVIDOR "cd ett-eventos && docker compose ps"` |
| Últimos logs del worker | `ssh root@IP_DEL_SERVIDOR "cd ett-eventos && docker compose logs --tail=100 worker"` |
| Últimos logs de la web | `ssh root@IP_DEL_SERVIDOR "cd ett-eventos && docker compose logs --tail=100 web"` |
| Reiniciar el worker | `ssh root@IP_DEL_SERVIDOR "cd ett-eventos && docker compose restart worker"` |
| Actualizar a una nueva versión | `ssh root@IP_DEL_SERVIDOR "cd ett-eventos && git pull && docker compose up -d --build"` |

Al actualizar, `migrate` corre antes que la web y el worker, así que las migraciones nuevas se aplican solas. Si `git pull` pide credenciales, entra con `ssh` y hazlo dentro del servidor.

Para ver los logs en vivo, entra al servidor (`ssh root@IP_DEL_SERVIDOR`, luego `cd ett-eventos`) y usa:

```bash
docker compose logs -f --tail=100 worker
```

Para salir de los logs en vivo: `Ctrl + C`.

## Respaldos

Los respaldos quedan en el servidor en `ett-eventos/backups/ett-AAAAMMDD-HHMM.dump`. Conviene tener una copia en tu PC. Crea la carpeta una vez:

```powershell
New-Item -ItemType Directory -Force -Path C:\Respaldos\ett-eventos
```

Y descarga los respaldos cuando quieras:

```powershell
scp "root@IP_DEL_SERVIDOR:ett-eventos/backups/*.dump" C:\Respaldos\ett-eventos\
```

Para restaurar un respaldo en una base nueva y revisarlo sin tocar la productiva (dentro del servidor, en `ett-eventos`):

```bash
docker compose exec backup sh -c 'createdb ett_restaurada && pg_restore -d ett_restaurada /backups/ett-AAAAMMDD-HHMM.dump'
```

Reemplazar la base productiva con un respaldo sobrescribe los datos actuales: hazlo solo si estás seguro y deteniendo antes `web` y `worker`.

## Seguridad

- La base de datos no publica puertos; solo la ven los contenedores del stack.
- Los tokens de GHL solo están en `.env` del servidor y en el contenedor del worker. Nunca llegan al navegador.
- La web corre como usuario sin privilegios, con cookies `Secure`/`httpOnly`, HSTS y CSP.
- `.env` y `backups/` están en `.gitignore`; no se suben a GitHub.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `ssh` responde «Connection timed out» | IP equivocada o el puerto 22 cerrado en el firewall de Contabo. |
| `git clone` responde «Authentication failed» | Usaste la contraseña de GitHub en vez del token, o el token no tiene acceso al repositorio. |
| `worker` se reinicia con «Falta GHL_…» | Variable vacía en `.env`. |
| `worker` registra `401` de GHL | Token vencido o sin permisos, o el `.env` tiene saltos de línea de Windows; corrige con `nano` y reinicia el worker. |
| La web no responde por el dominio | Revisa que `TRAEFIK_NETWORK`, el entrypoint y el certresolver coincidan con tu Traefik, y el DNS. |
| Muchos avisos `Reintento GHL … 429` | Normal en cargas históricas: GHL limita la velocidad y el worker reintenta solo. |
