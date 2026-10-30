# Funciones compartidas. No se ejecuta solo: lo cargan los demás scripts.
# Compatible con Windows PowerShell 5.1 y PowerShell 7.

$ErrorActionPreference = 'Stop'

# Tildes y eñes correctas al enviar y al mostrar texto del servidor.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

$configPath = Join-Path $PSScriptRoot 'config.ps1'
if (-not (Test-Path $configPath)) {
    Write-Host 'Falta config.ps1. Copia config.ejemplo.ps1 como config.ps1 y completa la IP del servidor.' -ForegroundColor Red
    exit 1
}
. $configPath
if ($Servidor -eq 'IP_DEL_SERVIDOR') {
    Write-Host 'Completa $Servidor en config.ps1 con la IP de tu VPS.' -ForegroundColor Red
    exit 1
}
$Destino = "$Usuario@$Servidor"

function Write-Paso([string]$Texto) {
    Write-Host ''
    Write-Host "==> $Texto" -ForegroundColor Cyan
}

# Ejecuta un script de bash en el servidor enviándolo por la entrada estándar.
# Así no hay problemas de comillas entre PowerShell y bash, y los secretos
# no aparecen en la línea de comandos del servidor.
function Invoke-Remoto([string]$Script) {
    $limpio = ($Script -replace "`r", '').Replace('__CARPETA__', $Carpeta)
    $limpio | & ssh -p $Puerto -o ServerAliveInterval=30 $Destino 'bash -s'
    if ($LASTEXITCODE -ne 0) { throw "El servidor respondió con error (código $LASTEXITCODE)." }
}

# Comando interactivo (nano, logs en vivo): necesita terminal.
function Invoke-RemotoInteractivo([string]$Comando) {
    & ssh -t -p $Puerto $Destino $Comando
}

function Read-Secreto([string]$Mensaje) {
    $seguro = Read-Host -Prompt $Mensaje -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Read-Valor([string]$Mensaje, [string]$PorDefecto = '') {
    $texto = if ($PorDefecto) { "$Mensaje [$PorDefecto]" } else { $Mensaje }
    $valor = Read-Host -Prompt $texto
    if ([string]::IsNullOrWhiteSpace($valor)) { $valor = $PorDefecto }
    return $valor.Trim()
}

function Assert-UnaLinea([string]$Nombre, [string]$Valor, [switch]$Opcional) {
    if (-not $Opcional -and [string]::IsNullOrWhiteSpace($Valor)) { throw "$Nombre no puede quedar vacío." }
    if ($Valor -match "[\r\n']") { throw "$Nombre no puede tener saltos de línea ni comillas simples." }
}

# Contraseña aleatoria criptográficamente segura (sin caracteres ambiguos).
function New-Contrasena([int]$Largo = 40) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] $Largo
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Assert-Fecha([string]$Nombre, [string]$Valor) {
    $fecha = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($Valor, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$fecha)) {
        throw "$Nombre debe tener formato AAAA-MM-DD (por ejemplo 2026-10-01)."
    }
}
