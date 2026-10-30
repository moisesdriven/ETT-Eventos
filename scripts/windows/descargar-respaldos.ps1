# Copia los respaldos del servidor a tu PC (carpeta definida en config.ps1).
. (Join-Path $PSScriptRoot 'comun.ps1')
New-Item -ItemType Directory -Force -Path $CarpetaRespaldosLocal | Out-Null
Write-Paso "Descargando respaldos a $CarpetaRespaldosLocal"
& scp -P $Puerto "${Destino}:$Carpeta/backups/*.dump" $CarpetaRespaldosLocal
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron descargar los respaldos.' }
Get-ChildItem $CarpetaRespaldosLocal -Filter *.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } }, LastWriteTime | Format-Table -AutoSize
