# Genera un respaldo inmediato de la base (además del diario automático).
. (Join-Path $PSScriptRoot 'comun.ps1')
Write-Paso 'Generando respaldo'
Invoke-Remoto @'
set -euo pipefail
cd __CARPETA__
f=/backups/ett-$(date -u +%Y%m%d-%H%M)-manual.dump
docker compose exec -T backup sh -c "umask 077 && pg_dump -Fc -f $f.tmp && mv $f.tmp $f" </dev/null
ls -lh backups | tail -n 5
'@
