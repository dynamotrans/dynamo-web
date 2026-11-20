#!/usr/bin/env bash
# =====================================================================================
# «Un backup que nunca has restaurado no es un backup» (PRODUCCION.md, punto 11).
# Descifra la copia, la RESTAURA en un PostgreSQL vacío (que imita a Supabase) y comprueba
# que están todas las tablas con sus filas. Si algo no cuadra, falla (y GitHub avisa).
# Uso (como root): COPIA_CLAVE=… tools/copia/restaurar-prueba.sh <copia.tar.gz.gpg>
#   (o con una carpeta ya descifrada que contenga datos/, sin COPIA_CLAVE)
# =====================================================================================
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
COPIA="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
TMP="$(mktemp -d /var/tmp/restaurar.XXXXXX)"; chown postgres "$TMP"
PUERTO=5498
limpiar() { su postgres -c "$PGBIN/pg_ctl -D $TMP/db -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

if [ -d "$COPIA" ]; then cp -r "$COPIA/datos" "$TMP/"
else
  : "${COPIA_CLAVE:?Falta COPIA_CLAVE}"
  gpg --batch --quiet --decrypt --pinentry-mode loopback --passphrase-fd 3 "$COPIA" 3<<<"$COPIA_CLAVE" | tar -C "$TMP" -xzf -
fi
chown -R postgres "$TMP"
su postgres -c "$PGBIN/initdb -D $TMP/db -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $TMP/db -o '-p $PUERTO -k $TMP' -l $TMP/servidor.log start -w" >/dev/null
psqlr() { su postgres -c "$PGBIN/psql -X -q -h $TMP -p $PUERTO -d postgres -v ON_ERROR_STOP=1 $*"; }
psqlr "-f $AQUI/../probar-migraciones/emular_supabase.sql" >/dev/null
# Lo que la base de datos de Supabase trae de serie y nuestras funciones nombran.
psqlr "-c \"create schema if not exists extensions; create schema if not exists cron; create schema if not exists net; create schema if not exists vault; create extension if not exists pg_trgm with schema extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists unaccent with schema extensions;\"" >/dev/null

# Primero los usuarios de acceso (las tablas los referencian): auth.users con las mismas
# columnas que la copia (el id como uuid; lo demás como texto, basta para comprobar).
su postgres -c "$PGBIN/pg_restore -f - --table=users $TMP/datos/auth.dump" > "$TMP/auth_users.sql"
cols="$(grep -m1 '^COPY auth.users ' "$TMP/auth_users.sql" | sed -E 's/^COPY auth\.users \((.*)\) FROM stdin;$/\1/')"
[ -n "$cols" ] || { echo "RESTAURACIÓN: la copia no trae los usuarios de acceso"; exit 1; }
ddl="$(echo "$cols" | tr ',' '\n' | sed -E 's/^ *//' | awk '{ print ($0 == "id" ? "id uuid primary key" : $0 " text") }' | paste -sd, -)"
echo "drop table if exists auth.users cascade; create table auth.users ($ddl);" > "$TMP/auth_tabla.sql"
chown postgres "$TMP"/*.sql
psqlr "-f $TMP/auth_tabla.sql" >/dev/null
psqlr "-f $TMP/auth_users.sql" >/dev/null
usuarios="$(su postgres -c "$PGBIN/psql -X -A -t -h $TMP -p $PUERTO -d postgres -c 'select count(*) from auth.users'")"

su postgres -c "$PGBIN/pg_restore -h $TMP -p $PUERTO -d postgres --no-owner --no-privileges --exit-on-error --clean --if-exists $TMP/datos/public.dump"

# Comparar con el recuento que se hizo al sacar la copia.
fallos=0; tablas=0; filas=0
while read -r tabla n; do
  [ -z "$tabla" ] && continue
  r="$(su postgres -c "$PGBIN/psql -X -A -t -h $TMP -p $PUERTO -d postgres -c 'select count(*) from public.\"$tabla\"'" 2>/dev/null || echo FALTA)"
  tablas=$((tablas+1))
  if [ "$r" = "FALTA" ]; then echo "  ✗ $tabla: no está en la copia restaurada"; fallos=$((fallos+1)); continue; fi
  filas=$((filas+r))
  # Entre el recuento y la copia pueden entrar filas nuevas (emails, auditoría…): se admite un 2 %.
  if [ "$n" -gt 0 ] && { [ "$r" -eq 0 ] || [ $((r * 100)) -lt $((n * 98)) ]; }; then
    echo "  ✗ $tabla: tenía $n filas y la copia restaurada tiene $r"; fallos=$((fallos+1))
  fi
done < "$TMP/datos/recuento.txt"
archivos=0; [ -d "$TMP/datos/archivos" ] && archivos="$(find "$TMP/datos/archivos" -type f | wc -l)"
echo "Restauradas $tablas tablas y $filas filas, $usuarios usuarios de acceso; $archivos archivos subidos en la copia."
[ "$fallos" -eq 0 ] || { echo "RESTAURACIÓN: HAY FALLOS ($fallos)"; exit 1; }
echo "RESTAURACIÓN: correcta"
