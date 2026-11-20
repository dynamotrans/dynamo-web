# Copia de seguridad propia (fuera de Supabase)

Cada domingo a las 3:17 (hora UTC) la tarea **«Copia de seguridad (fuera de Supabase)»** de GitHub
(`.github/workflows/copia.yml`):

1. saca de Supabase la base de datos (todo el esquema `public` y los usuarios de acceso) y los
   archivos subidos (albaranes, DNI, fotos…: la copia diaria de Supabase **no** los incluye);
2. lo mete todo en un fichero **cifrado** con tu clave (`COPIA_CLAVE`, AES-256);
3. lo guarda en GitHub 90 días (unas 13 copias, una por semana);
4. **lo restaura** en una base de datos vacía y comprueba que están todas las tablas con sus
   filas. Si algo falla, GitHub te manda un email.

También se puede lanzar a mano: GitHub → Actions → «Copia de seguridad…» → *Run workflow*.

## Configurarla (una vez)

En GitHub → el repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Qué poner |
|---|---|
| `COPIA_DB_URL` | Supabase → **Connect** → *Session pooler* (puerto 5432), con la contraseña de la base de datos puesta |
| `COPIA_CLAVE` | Una frase larga que te inventes. **Apúntala también en papel**: sin ella la copia no se puede abrir |
| `SUPABASE_URL` | `https://<proyecto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave de servicio (Supabase → Project Settings → API) |

Nunca en el repositorio ni en el chat.

## Abrir una copia

Descarga el fichero de la ejecución (Actions → la ejecución → *Artifacts*) y:

```
gpg --decrypt copia-dynamo-AAAA-MM-DD.tar.gz.gpg | tar -xz
```

Dentro, `datos/` con `public.dump` (base de datos), `auth.dump` (usuarios de acceso),
`archivos/` (los archivos subidos, por bucket) y `recuento.txt` (filas de cada tabla).

## Recuperarse de un desastre

1. Crear un proyecto nuevo de Supabase (misma región).
2. Usuarios de acceso: `pg_restore --data-only -d "<conexión del proyecto nuevo>" datos/auth.dump`.
3. Base de datos: `pg_restore --no-owner --no-privileges --clean --if-exists -d "<conexión>" datos/public.dump`.
4. Archivos: subir `archivos/<bucket>/…` a los mismos buckets (Claude lo hace con un script).
5. Cambiar en Vercel las claves de Supabase por las del proyecto nuevo.

Hazlo con Claude: es una vez en la vida, pero mejor con alguien que lo revise paso a paso.
