#!/bin/sh
# Crea /opt/ett-eventos/.env (permisos 600) con la contraseña de PostgreSQL generada al azar
# y pide los tokens de GoHighLevel sin mostrarlos. No sobrescribe un .env existente.
# Uso (en el servidor): sh /opt/ett-eventos/deploy/generar-env.sh
set -eu

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV="$RAIZ/.env"

if [ -f "$ENV" ]; then
  echo "Ya existe $ENV: no se modifica. Para editarlo: nano $ENV"
  exit 0
fi

leer_secreto() {
  # $1 = mensaje. Lee sin eco y quita espacios y \r pegados al valor.
  printf '%s: ' "$1" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r valor
  stty echo 2>/dev/null || true
  printf '\n' >&2
  printf '%s' "$valor" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

leer() {
  printf '%s [%s]: ' "$1" "$2" >&2
  IFS= read -r valor
  [ -n "$valor" ] || valor=$2
  printf '%s' "$valor" | tr -d '\r'
}

echo 'Datos del despliegue (Enter acepta el valor entre corchetes).'
DOMINIO=$(leer 'Dominio' 'ettgastos.drivenbox.com')
RED=$(leer 'Red Docker de Traefik' 'web')
ENTRYPOINT=$(leer 'Entrypoint HTTPS' 'websecure')
RESOLVER=$(leer 'Certresolver' 'letsencrypt')

if ! docker network inspect "$RED" >/dev/null 2>&1; then
  echo "ERROR: no existe la red Docker '$RED'. Redes disponibles:"
  docker network ls --format '  {{.Name}}'
  exit 1
fi

echo
echo 'Credenciales de GoHighLevel (no se muestran al escribir; pega con clic derecho).'
GHL_AGENCIA=$(leer_secreto 'Token pit- de la AGENCIA')
GHL_SUBCUENTA=$(leer_secreto 'Token pit- de la SUBCUENTA ETT')
GHL_LOCATION=$(leer 'ID de la subcuenta ETT (locationId)' '')

for par in "GHL_AGENCIA:$GHL_AGENCIA" "GHL_SUBCUENTA:$GHL_SUBCUENTA" "GHL_LOCATION:$GHL_LOCATION"; do
  [ -n "${par#*:}" ] || { echo "ERROR: ${par%%:*} no puede quedar vacío."; exit 1; }
done

# 40 caracteres alfanuméricos aleatorios.
PG_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40)

umask 077
cat > "$ENV" <<FIN
# Generado por deploy/generar-env.sh el $(date -u +%Y-%m-%dT%H:%MZ)
APP_DOMAIN=$DOMINIO
TRAEFIK_NETWORK=$RED
TRAEFIK_ENTRYPOINT=$ENTRYPOINT
TRAEFIK_CERTRESOLVER=$RESOLVER
POSTGRES_USER=ett
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=ett
BACKUP_KEEP_DAYS=14
GHL_AGENCY_TOKEN=$GHL_AGENCIA
GHL_LOCATION_TOKEN=$GHL_SUBCUENTA
GHL_LOCATION_ID=$GHL_LOCATION
GHL_COMPANY_ID=
SYNC_INTERVAL_MINUTES=15
DAILY_JOBS_HOUR_LIMA=3
FIN
chmod 600 "$ENV"
echo
echo "Creado $ENV (permisos 600)."
echo 'La contraseña de PostgreSQL vive solo en ese archivo y en el volumen de la base; respáldalo junto con los dumps.'
