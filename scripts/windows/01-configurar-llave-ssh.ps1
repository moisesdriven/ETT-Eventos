# Paso 1 (una sola vez): crea una llave SSH en tu PC y la autoriza en el servidor.
# Después, los demás scripts se conectan sin pedir la contraseña del VPS cada vez.
. (Join-Path $PSScriptRoot 'comun.ps1')

$llave = Join-Path $HOME '.ssh\id_ed25519'

if (Test-Path "$llave.pub") {
    Write-Paso "Ya tienes una llave SSH ($llave.pub); se usará esa."
} else {
    Write-Paso 'Creando una llave SSH nueva'
    Write-Host 'Te pedirá una frase de contraseña: puedes dejarla vacía (Enter dos veces) o escribir una.'
    New-Item -ItemType Directory -Force -Path (Split-Path $llave) | Out-Null
    & ssh-keygen -t ed25519 -f $llave -C 'ett-eventos'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la llave SSH.' }
}

Write-Paso "Autorizando la llave en $Destino (pedirá la contraseña del VPS una última vez)"
$publica = (Get-Content "$llave.pub" -Raw).Trim()
$script = @'
set -e
umask 077
mkdir -p ~/.ssh
touch ~/.ssh/authorized_keys
llave=$(cat <<'ETT_LLAVE'
__LLAVE__
ETT_LLAVE
)
grep -qxF -- "$llave" ~/.ssh/authorized_keys || echo "$llave" >> ~/.ssh/authorized_keys
echo 'Llave autorizada.'
'@
Invoke-Remoto $script.Replace('__LLAVE__', $publica)

Write-Paso 'Probando la conexión sin contraseña'
$nombre = & ssh -p $Puerto -o BatchMode=yes $Destino 'hostname'
if ($LASTEXITCODE -ne 0) { throw 'La conexión con llave no funcionó. Revisa el usuario y la IP en config.ps1.' }
Write-Host "Conexión correcta con el servidor $nombre. Ya no se pedirá la contraseña del VPS." -ForegroundColor Green
