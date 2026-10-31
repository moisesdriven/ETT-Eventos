# Logs de un servicio. Uso:
#   .\logs.ps1                          (últimas 100 líneas del worker)
#   .\logs.ps1 -Servicio web -Lineas 300
#   .\logs.ps1 -EnVivo                  (Ctrl + C para salir)
param(
    [ValidateSet('worker', 'web', 'db', 'backup', 'migrate')]
    [string]$Servicio = 'worker',
    [ValidateRange(1, 10000)]
    [int]$Lineas = 100,
    [switch]$EnVivo
)
. (Join-Path $PSScriptRoot 'comun.ps1')
$seguir = if ($EnVivo) { ' -f' } else { '' }
Invoke-RemotoInteractivo "cd $Carpeta && docker compose logs --tail=$Lineas$seguir $Servicio"
