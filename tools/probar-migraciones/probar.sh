#!/usr/bin/env bash
# =====================================================================================
# Prueba las migraciones de supabase/migrations contra un PostgreSQL de usar y
# tirar que imita a Supabase. Uso:
#     tools/probar-migraciones/probar.sh [carpeta_de_migraciones]
# Requiere PostgreSQL 15+ instalado (security_invoker en vistas) y ejecutarse
# como root (arranca el servidor con el usuario del sistema `postgres`).
# No toca nada fuera de un directorio temporal, que borra al terminar.
# =====================================================================================
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
MIG="$(cd "${1:-$AQUI/../../supabase/migrations}" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DATOS="$(mktemp -d /var/tmp/pgprueba.XXXXXX)"; chown postgres "$DATOS"
PUERTO=5499
LOG="$DATOS/servidor.log"

limpiar() { su postgres -c "$PGBIN/pg_ctl -D $DATOS/db -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DATOS"; }
trap limpiar EXIT

su postgres -c "$PGBIN/initdb -D $DATOS/db -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $DATOS/db -o '-p $PUERTO -k $DATOS' -l $LOG start -w" >/dev/null
correr() { su postgres -c "$PGBIN/psql -X -q -h $DATOS -p $PUERTO -d postgres -v ON_ERROR_STOP=1 $*"; }

echo "PostgreSQL $($PGBIN/postgres --version | awk '{print $3}') · emulando Supabase"
correr "-f $AQUI/emular_supabase.sql"

n=0
for f in $(ls "$MIG"/*.sql | sort); do
  # Igual que Supabase: cada migración en UNA transacción; si falla, no queda a medias.
  # Silenciados los NOTICE inofensivos ("trigger ... does not exist, skipping"):
  # los errores de verdad siguen saliendo y paran la prueba.
  su postgres -c "PGOPTIONS='-c client_min_messages=warning' $PGBIN/psql -X -q -h $DATOS -p $PUERTO -d postgres -v ON_ERROR_STOP=1 -1 -f $f" >/dev/null
  n=$((n+1)); echo "  aplicada  $(basename "$f")"
done
echo "$n migraciones aplicadas sin error"
# Con GENERAR_TIPOS=<fichero>: escribe ahí los tipos de TypeScript de la base de datos recién
# montada (tools/tipos/generar.py). El CI los compara con lib/supabase/tipos.ts.
if [ -n "${GENERAR_TIPOS:-}" ]; then
  python3 "$AQUI/../tipos/generar.py" "su postgres -c '$PGBIN/psql -X -A -t -q -h $DATOS -p $PUERTO -d postgres'" > "$GENERAR_TIPOS"
  echo "tipos de TypeScript escritos en $GENERAR_TIPOS"
fi
echo
# Las comprobaciones corren TODAS aunque alguna falle, para ver el cuadro completo.
SALIDA="$(su postgres -c "$PGBIN/psql -X -q -h $DATOS -p $PUERTO -d postgres -v ON_ERROR_STOP=0 -f $AQUI/comprobar_seguridad.sql" 2>&1 || true)"
echo "$SALIDA" | sed -n 's/^.*NOTICE:  /  ✓ /p; s/^.*ERROR:  /  ✗ /p'
echo
if echo "$SALIDA" | grep -q "ERROR:"; then
  echo "RESULTADO: HAY FALLOS — no desplegar"; exit 1
fi
echo "RESULTADO: todo correcto"
