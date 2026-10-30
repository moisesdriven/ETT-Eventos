# Paso 3: crea (o reactiva) un usuario administrador de la app.
. (Join-Path $PSScriptRoot 'comun.ps1')

$correo = Read-Valor 'Correo del administrador'
Assert-UnaLinea 'Correo' $correo
if ($correo -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'El correo no es válido.' }

$clave = Read-Secreto 'Contraseña (mínimo 12 caracteres)'
$repetir = Read-Secreto 'Repite la contraseña'
if ($clave -ne $repetir) { throw 'Las contraseñas no coinciden.' }
if ($clave.Length -lt 12) { throw 'La contraseña debe tener al menos 12 caracteres.' }
if ($clave -match "[\r\n]") { throw 'La contraseña no puede tener saltos de línea.' }

$script = @'
set -euo pipefail
cd __CARPETA__
ADMIN_EMAIL=$(cat <<'ETT_CORREO'
__CORREO__
ETT_CORREO
)
ADMIN_PASSWORD=$(cat <<'ETT_CLAVE'
__CLAVE__
ETT_CLAVE
)
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose run --rm -T -e ADMIN_EMAIL -e ADMIN_PASSWORD migrate node_modules/.bin/tsx src/scripts/create-admin.ts </dev/null
'@

Write-Paso 'Creando administrador'
Invoke-Remoto $script.Replace('__CORREO__', $correo).Replace('__CLAVE__', $clave)
Write-Host 'Listo. Ya puedes ingresar a la app con ese correo.' -ForegroundColor Green
