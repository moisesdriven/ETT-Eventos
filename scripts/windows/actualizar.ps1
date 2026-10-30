# Descarga la última versión de la rama configurada y la despliega.
# Las migraciones se aplican solas antes de arrancar la web y el worker.
. (Join-Path $PSScriptRoot 'comun.ps1')
Write-Paso "Actualizando $Destino a la última versión de '$Rama'"
$script = @'
set -euo pipefail
cd __CARPETA__
git fetch origin
git checkout '__RAMA__'
git pull --ff-only origin '__RAMA__'
echo "Versión: $(git log -1 --format='%h %s')"
docker compose up -d --build </dev/null
docker image prune -f >/dev/null
docker compose ps
'@
Invoke-Remoto $script.Replace('__RAMA__', $Rama)
Write-Host 'Actualización completa.' -ForegroundColor Green
