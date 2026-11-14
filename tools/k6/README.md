# Pruebas de carga (k6) — tarea 67

¿Aguanta la plataforma mucha gente a la vez? `carga.js` lo mide con
[k6](https://k6.io) (un binario suelto, sin instalación): pide las páginas públicas
(entrar, aceptar carga, CMR) — cada una atraviesa Next **y** la base de datos — y,
si se le dan las señas, también la puerta pública de la base de datos directamente.

## Los tres perfiles

| Perfil | Qué hace | Para qué |
|---|---|---|
| `humo` (defecto) | 5 usuarios, 30 s | Canario del CI: una regresión gorda de rendimiento tira la build |
| `carga` | sube a 40 usuarios en 4 min | El día a día esperado, multiplicado |
| `estres` | sube a 120 usuarios en 6 min | Buscar el límite **antes** de producción |

## Cómo correrlo a mano (contra la preview)

```bash
# binario de k6 (Linux; en Mac: brew install k6)
curl -fsSL https://github.com/grafana/k6/releases/download/v1.3.0/k6-v1.3.0-linux-amd64.tar.gz | tar xz --strip-components=1
BASE_URL=https://<url-de-la-preview>.vercel.app ./k6 run tools/k6/carga.js --env PERFIL=carga
```

Añadiendo `SUPABASE_URL` y `SUPABASE_ANON_KEY` (las públicas de la preview) también
machaca la RPC `oferta_publica` como lo haría una avalancha de transportistas.

**Qué mirar del resumen**: `http_req_duration` (p95 — lo que espera el usuario lento),
`http_req_failed` (errores) y, en el panel de Supabase, las conexiones y el CPU de la
base de datos durante la pasada.

## Reglas

- `estres` **nunca contra producción con clientes dentro**: solo preview, y mirando el
  panel de Supabase (el plan tiene topes de conexiones).
- Antes de pasar a producción (PRODUCCION.md): una pasada `carga` y una `estres`
  contra la preview, y guardar el resumen en esta carpeta como `resultado-<fecha>.txt`.
- En el CI corre `humo` contra la pila local tras las pruebas de navegador, con
  umbrales holgados a propósito (máquina compartida): es un canario, no el examen fino.
