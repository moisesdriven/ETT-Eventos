# Paso 4: carga el histórico de cobros y mensajes (GHL conserva 6 meses).
# Uso: .\04-carga-historica.ps1                         (últimos 6 meses)
#      .\04-carga-historica.ps1 -Desde 2026-05-01 -Hasta 2026-10-31
param(
    [string]$Desde = (Get-Date).AddMonths(-6).ToString('yyyy-MM-dd'),
    [string]$Hasta = (Get-Date).ToString('yyyy-MM-dd')
)
. (Join-Path $PSScriptRoot 'comun.ps1')
Assert-Fecha 'Desde' $Desde
Assert-Fecha 'Hasta' $Hasta

Write-Paso "Encolando carga histórica del $Desde al $Hasta (días de Lima)"
$script = @'
set -euo pipefail
cd __CARPETA__
docker compose exec -T worker node_modules/.bin/tsx src/cli.ts backfill __DESDE__ __HASTA__ </dev/null
'@
Invoke-Remoto $script.Replace('__DESDE__', $Desde).Replace('__HASTA__', $Hasta)
Write-Host 'La carga corre en segundo plano (15 a 20 min para 6 meses). Avance: .\estado.ps1 o la página Sincronización.' -ForegroundColor Green
