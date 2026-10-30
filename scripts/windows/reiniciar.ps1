# Reinicia un servicio (por ejemplo después de editar el .env).
# Uso: .\reiniciar.ps1                 (worker y web)
#      .\reiniciar.ps1 -Servicio worker
param(
    [ValidateSet('todos', 'worker', 'web')]
    [string]$Servicio = 'todos'
)
. (Join-Path $PSScriptRoot 'comun.ps1')
$servicios = if ($Servicio -eq 'todos') { 'worker web' } else { $Servicio }
Write-Paso "Reiniciando $servicios"
# up -d (no restart) para que tome los cambios del .env.
$script = @'
set -euo pipefail
cd __CARPETA__
docker compose up -d --force-recreate __SERVICIOS__ </dev/null
docker compose ps
'@
Invoke-Remoto $script.Replace('__SERVICIOS__', $servicios)
