# Abre el .env del servidor en nano (Ctrl + O, Enter para guardar; Ctrl + X para salir).
# Después ejecuta .\reiniciar.ps1 para aplicar los cambios.
. (Join-Path $PSScriptRoot 'comun.ps1')
Invoke-RemotoInteractivo "nano $Carpeta/.env"
Write-Host 'Si cambiaste algo, ejecuta .\reiniciar.ps1 para aplicarlo.' -ForegroundColor Yellow
