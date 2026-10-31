# Verifica que el último respaldo se puede restaurar: lo carga en una base
# temporal, cuenta registros y la borra. No toca la base productiva.
. (Join-Path $PSScriptRoot 'comun.ps1')
Write-Paso 'Probando el último respaldo'
Invoke-Remoto @'
set -euo pipefail
cd __CARPETA__
ultimo=$(ls -1t backups/*.dump 2>/dev/null | head -n 1 || true)
if [ -z "$ultimo" ]; then echo 'No hay respaldos todavía.'; exit 1; fi
echo "Respaldo: $ultimo"
docker compose exec -T backup sh -s "/backups/$(basename "$ultimo")" <<'SH'
set -e
dropdb --if-exists ett_prueba_respaldo
createdb ett_prueba_respaldo
pg_restore -d ett_prueba_respaldo "$1"
psql -d ett_prueba_respaldo -P pager=off -c "SELECT (SELECT count(*) FROM app.users) AS usuarios, (SELECT count(*) FROM analytics.message_charges) AS cobros, (SELECT count(*) FROM analytics.events) AS eventos"
dropdb ett_prueba_respaldo
echo 'El respaldo se restauró correctamente (base temporal eliminada).'
SH
'@
