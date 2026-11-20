#!/usr/bin/env bash
# =====================================================================================
# Copia de seguridad PROPIA, fuera de Supabase (usuario, 2026-11-20: «¿estamos preparados?»).
# Saca la base de datos (esquema public entero + usuarios de acceso) y los archivos subidos
# (albaranes, DNI, fotos…), los mete en un solo fichero y lo CIFRA con COPIA_CLAVE (AES-256).
# Sin la clave, el fichero no sirve a nadie: guarda la clave también en papel.
#
# Variables (secretos de GitHub, nunca en el repo):
#   COPIA_DB_URL               cadena de conexión de Supabase (Session pooler, puerto 5432)
#   COPIA_CLAVE                frase para cifrar la copia
#   SUPABASE_URL               (opcional) para copiar los archivos subidos
#   SUPABASE_SERVICE_ROLE_KEY  (opcional) ídem
# Uso: tools/copia/hacer-copia.sh <carpeta_de_salida>
# =====================================================================================
set -euo pipefail
: "${COPIA_DB_URL:?Falta COPIA_DB_URL}"; : "${COPIA_CLAVE:?Falta COPIA_CLAVE}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="${1:-copia}"; DATOS="$SALIDA/datos"
PGDUMP="${PGDUMP:-pg_dump}"; PSQL="${PSQL:-psql}"
fecha="$(date -u +%Y-%m-%d)"
rm -rf "$DATOS"; mkdir -p "$DATOS"

# 1. Recuento de filas por tabla, justo antes: la restauración de prueba lo compara.
$PSQL "$COPIA_DB_URL" -X -A -t -F ' ' -v ON_ERROR_STOP=1 -c "
  select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" > "$DATOS/recuento.txt"

# 2. La base de datos: todo el esquema public (estructura y datos) y los usuarios de acceso.
$PGDUMP "$COPIA_DB_URL" --schema=public --format=custom --no-owner --no-privileges > "$DATOS/public.dump"
$PGDUMP "$COPIA_DB_URL" --data-only --format=custom --table=auth.users --table=auth.identities --table=auth.mfa_factors > "$DATOS/auth.dump"

# 3. Los archivos subidos (la copia diaria de Supabase NO los incluye).
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  node "$AQUI/archivos.mjs" "$DATOS/archivos"
else
  echo "Sin SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: la copia va sin los archivos subidos."
fi

# 4. Un solo fichero, cifrado.
{ echo "Copia de Dynamo · $fecha UTC"; echo "tablas: $(wc -l < "$DATOS/recuento.txt")"; du -sh "$DATOS" | cut -f1 | sed 's/^/tamaño: /'; } > "$DATOS/LEEME.txt"
tar -C "$SALIDA" -czf - datos | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --pinentry-mode loopback \
  --passphrase-fd 3 -o "$SALIDA/copia-dynamo-$fecha.tar.gz.gpg" 3<<<"$COPIA_CLAVE"
echo "Copia cifrada: $SALIDA/copia-dynamo-$fecha.tar.gz.gpg ($(du -h "$SALIDA/copia-dynamo-$fecha.tar.gz.gpg" | cut -f1))"
