# Paso 2 (una sola vez): instala Docker si falta, descarga el proyecto, crea el .env
# en el servidor y levanta todo el stack. Si el .env ya existe, NO lo modifica.
. (Join-Path $PSScriptRoot 'comun.ps1')

Write-Paso 'Datos del despliegue'
$dominio = Read-Valor 'Dominio de la app' 'ett-eventos.drivenbox.drivenautomations.com'
Assert-UnaLinea 'Dominio' $dominio
$redTraefik = Read-Valor 'Red Docker de Traefik' 'web'
$entrypoint = Read-Valor 'Entrypoint HTTPS de Traefik' 'websecure'
$certresolver = Read-Valor 'Certresolver de Traefik' 'letsencrypt'
Assert-UnaLinea 'Red de Traefik' $redTraefik
Assert-UnaLinea 'Entrypoint' $entrypoint
Assert-UnaLinea 'Certresolver' $certresolver

Write-Host ''
Write-Host 'El repositorio es público: deja el usuario de GitHub vacío (Enter). Solo hace falta si pasa a privado.'
$ghUsuario = Read-Valor 'Usuario de GitHub'
$ghToken = ''
if ($ghUsuario) { $ghToken = Read-Secreto 'Token de GitHub (no se muestra)' }
Assert-UnaLinea 'Usuario de GitHub' $ghUsuario -Opcional
Assert-UnaLinea 'Token de GitHub' $ghToken -Opcional

Write-Host ''
Write-Host 'Credenciales de GoHighLevel (no se muestran al escribir; pega con clic derecho).'
$ghlAgencia = (Read-Secreto 'Token pit- de la AGENCIA').Trim()
$ghlSubcuenta = (Read-Secreto 'Token pit- de la SUBCUENTA ETT').Trim()
$ghlLocation = Read-Valor 'ID de la subcuenta ETT (locationId)'
Assert-UnaLinea 'Token de agencia' $ghlAgencia
Assert-UnaLinea 'Token de subcuenta' $ghlSubcuenta
Assert-UnaLinea 'ID de la subcuenta' $ghlLocation

$pgPassword = New-Contrasena 40

$script = @'
set -euo pipefail

echo '--> Docker'
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker no está instalado; instalando con el instalador oficial...'
  curl -fsSL https://get.docker.com | sh
fi
docker compose version

echo '--> Red de Traefik'
if ! docker network inspect '__RED__' >/dev/null 2>&1; then
  echo "ERROR: no existe la red Docker '__RED__'. Redes disponibles:"
  docker network ls --format '  {{.Name}}'
  echo 'Corrige el nombre y vuelve a ejecutar 02-instalar.ps1.'
  exit 1
fi

echo '--> Credenciales de GitHub'
if [ -n '__GHUSER__' ]; then
  git config --global credential.helper store
  umask 077
  touch ~/.git-credentials
  grep -v '@github.com' ~/.git-credentials > ~/.git-credentials.tmp || true
  echo 'https://__GHUSER__:__GHTOKEN__@github.com' >> ~/.git-credentials.tmp
  mv ~/.git-credentials.tmp ~/.git-credentials
  umask 022
fi

echo '--> Código'
if [ -d __CARPETA__/.git ]; then
  cd __CARPETA__
  git fetch origin
  git checkout '__RAMA__'
  git pull --ff-only origin '__RAMA__'
else
  git clone --branch '__RAMA__' '__REPO__' __CARPETA__
  cd __CARPETA__
fi
if [ ! -f docker-compose.yml ]; then
  echo "ERROR: la rama '__RAMA__' no contiene el proyecto (falta docker-compose.yml)."
  echo 'Fusiona el pull request en main o cambia $Rama en config.ps1.'
  exit 1
fi

echo '--> Archivo .env'
if [ -f .env ]; then
  echo 'Ya existe .env: no se modifica (para cambiarlo usa editar-env.ps1).'
else
  umask 077
  cat > .env <<'ETT_ENV'
APP_DOMAIN=__DOMINIO__
TRAEFIK_NETWORK=__RED__
TRAEFIK_ENTRYPOINT=__ENTRYPOINT__
TRAEFIK_CERTRESOLVER=__CERTRESOLVER__
POSTGRES_USER=ett
POSTGRES_PASSWORD=__PGPASSWORD__
POSTGRES_DB=ett
BACKUP_KEEP_DAYS=14
GHL_AGENCY_TOKEN=__GHLAGENCIA__
GHL_LOCATION_TOKEN=__GHLSUBCUENTA__
GHL_LOCATION_ID=__GHLLOCATION__
GHL_COMPANY_ID=
SYNC_INTERVAL_MINUTES=15
DAILY_JOBS_HOUR_LIMA=3
ETT_ENV
  umask 022
  echo '.env creado (permisos 600).'
fi

echo '--> Construyendo y levantando (la primera vez tarda varios minutos)'
mkdir -p backups
docker compose up -d --build </dev/null

echo '--> Esperando a que la web esté lista'
for i in $(seq 1 60); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null || true)
  [ "$estado" = healthy ] && break
  sleep 5
done
docker compose ps
if [ "${estado:-}" != healthy ]; then
  echo 'La web todavía no está lista. Revisa con logs.ps1 -Servicio web'
  exit 1
fi
echo 'Listo.'
'@

$valores = [ordered]@{
    '__RED__'          = $redTraefik
    '__ENTRYPOINT__'   = $entrypoint
    '__CERTRESOLVER__' = $certresolver
    '__GHUSER__'       = $ghUsuario
    '__GHTOKEN__'      = $ghToken
    '__RAMA__'         = $Rama
    '__REPO__'         = $RepoUrl
    '__DOMINIO__'      = $dominio
    '__PGPASSWORD__'   = $pgPassword
    '__GHLAGENCIA__'   = $ghlAgencia
    '__GHLSUBCUENTA__' = $ghlSubcuenta
    '__GHLLOCATION__'  = $ghlLocation
}
foreach ($clave in $valores.Keys) { $script = $script.Replace($clave, [string]$valores[$clave]) }

Write-Paso "Instalando en $Destino"
Invoke-Remoto $script

Write-Host ''
Write-Host "Instalación completa. Siguiente paso: .\03-crear-admin.ps1 y luego abre https://$dominio" -ForegroundColor Green
