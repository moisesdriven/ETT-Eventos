# Estado de los servicios, últimos trabajos de sincronización y datos cargados.
. (Join-Path $PSScriptRoot 'comun.ps1')
Write-Paso "Estado en $Destino"
Invoke-Remoto @'
set -euo pipefail
cd ~/__CARPETA__
docker compose ps
echo
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off' <<'SQL'
\echo 'Últimos trabajos de sincronización (hora de Lima):'
SELECT id, kind AS tipo, status AS estado,
       to_char(created_at AT TIME ZONE 'America/Lima', 'DD/MM HH24:MI') AS creado,
       coalesce((stats->>'tramosCompletados') || '/' || (stats->>'tramos'), '') AS avance,
       left(coalesce(error, ''), 80) AS error
  FROM analytics.sync_runs ORDER BY id DESC LIMIT 10;
\echo 'Datos cargados:'
SELECT min(day_lima) AS desde, max(day_lima) AS hasta, count(*) AS cobros,
       sum(amount_usd)::numeric(12,2) AS usd,
       count(*) FILTER (WHERE resolution <> 'resuelto') AS sin_cruzar
  FROM analytics.message_charges;
SQL
'@
