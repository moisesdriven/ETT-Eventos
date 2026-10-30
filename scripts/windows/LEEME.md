# Scripts de PowerShell para el servidor (Contabo)

Se ejecutan **en tu PC con Windows**, desde PowerShell. Cada script se conecta al servidor por SSH y hace el trabajo allí. Funcionan con Windows PowerShell 5.1 (el que trae Windows) y con PowerShell 7.

## Antes de empezar

1. Fusiona el pull request en `main` (los scripts despliegan esa rama; se cambia en `config.ps1`).
2. Descarga el repositorio en tu PC (con `git clone` o el botón «Download ZIP» de GitHub) y abre PowerShell en esta carpeta, `scripts\windows`.
3. Si descargaste el ZIP, desbloquea los scripts una vez:

```powershell
Get-ChildItem *.ps1 | Unblock-File
```

4. Permite ejecutar scripts en esta ventana de PowerShell (solo dura mientras esté abierta):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

5. Crea tu configuración y completa la IP del servidor:

```powershell
Copy-Item config.ejemplo.ps1 config.ps1
```

```powershell
notepad config.ps1
```

## Instalación (una sola vez, en este orden)

| Script | Qué hace |
|---|---|
| `.\01-configurar-llave-ssh.ps1` | Crea una llave SSH y la autoriza en el servidor. Pide la contraseña del VPS por última vez. |
| `.\02-instalar.ps1` | Instala Docker si falta, descarga el proyecto, crea el `.env` (te pide dominio, Traefik, tokens de GitHub y de GHL; genera la contraseña de la base) y levanta todo. Si el `.env` ya existe, no lo toca. |
| `.\03-crear-admin.ps1` | Crea tu usuario administrador de la app. |
| `.\04-carga-historica.ps1` | Carga los últimos 6 meses de GHL. También acepta `-Desde 2026-05-01 -Hasta 2026-10-31`. |

Los tokens y contraseñas se escriben ocultos y viajan al servidor por la conexión SSH; no quedan en el historial de PowerShell ni en tu PC.

## Uso diario

| Script | Qué hace |
|---|---|
| `.\estado.ps1` | Servicios, últimos trabajos de sincronización y datos cargados. |
| `.\logs.ps1` | Últimos logs del worker. Opciones: `-Servicio web`, `-Lineas 300`, `-EnVivo` (salir con `Ctrl + C`). |
| `.\conciliar.ps1` | Compara con el monedero de GHL (por defecto, últimos 30 días). Acepta `-Desde` y `-Hasta`. |
| `.\actualizar.ps1` | Descarga la última versión y la despliega (las migraciones se aplican solas). |
| `.\reiniciar.ps1` | Reinicia web y worker. Opción: `-Servicio worker` o `-Servicio web`. |
| `.\editar-env.ps1` | Abre el `.env` del servidor en `nano`. Luego ejecuta `.\reiniciar.ps1`. |

## Respaldos

| Script | Qué hace |
|---|---|
| `.\respaldo-ahora.ps1` | Genera un respaldo inmediato (además del diario automático). |
| `.\descargar-respaldos.ps1` | Copia los respaldos a tu PC (carpeta `$CarpetaRespaldosLocal` de `config.ps1`). |
| `.\probar-respaldo.ps1` | Restaura el último respaldo en una base temporal, cuenta registros y la borra. No toca la base real. |

## Si algo falla

- «No se puede cargar el archivo … porque la ejecución de scripts está deshabilitada»: ejecuta el paso 4 de «Antes de empezar».
- «Falta config.ps1»: ejecuta el paso 5.
- Cualquier otro error: copia lo que muestra PowerShell y compártelo.
