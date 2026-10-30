# Compara día a día con el monedero de GHL y completa lo que falte.
# Uso: .\conciliar.ps1                               (últimos 30 días hasta ayer)
#      .\conciliar.ps1 -Desde 2026-10-01 -Hasta 2026-10-31
param(
    [string]$Desde = (Get-Date).AddDays(-30).ToString('yyyy-MM-dd'),
    [string]$Hasta = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')
)
. (Join-Path $PSScriptRoot 'comun.ps1')
Assert-Fecha 'Desde' $Desde
Assert-Fecha 'Hasta' $Hasta
Write-Paso "Encolando conciliación del $Desde al $Hasta"
$script = @'
set -euo pipefail
cd __CARPETA__
docker compose exec -T worker node_modules/.bin/tsx src/cli.ts conciliacion __DESDE__ __HASTA__ </dev/null
'@
Invoke-Remoto $script.Replace('__DESDE__', $Desde).Replace('__HASTA__', $Hasta)
Write-Host 'El resultado aparece en .\estado.ps1 o en la página Sincronización.' -ForegroundColor Green
