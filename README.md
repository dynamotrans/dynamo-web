# dynamo-web

Sitio web de **Dynamo Operador Logístico, S.L.** — [dynamotrans.com](https://dynamotrans.com).

Contiene dos cosas en el mismo repositorio:

1. **Web pública** (marketing) — en producción, `dynamotrans.com`.
2. **Portal de cliente** (panel privado) — todavía **mockup HTML estático**, aún no en producción. Está previsto convertirlo en app real (Next.js + backend) más adelante.

> **Lectura obligatoria antes de tocar nada:** este README da la foto general, pero el **contexto real, las decisiones y el historial** viven en:
> - **`CLAUDE.md`** → registro de decisiones + **bitácora** de cada sesión (por qué se hizo cada cosa, reglas de trabajo, modelo de ramas).
> - **`TODO.md`** → pendientes, deuda técnica conocida y el **stack/plan del backend** ya decidido (Supabase, Postmark, WhatsApp, naming, fases).

---

## 1. Stack

Deliberadamente simple. **No hay build, ni framework, ni dependencias npm.**

- **HTML + CSS + JavaScript** planos (ES5, `var`). Cada página es un `.html` autocontenido con su `<style>` y `<script>` inline.
- **Hosting: Vercel**, conectado a GitHub. Cada push a `main` se despliega solo a producción.
- **i18n:** Google Translate (cookie `googtrans` compartida entre páginas). El registro de **festivos** (`js/festivos.js`) sí es un módulo propio compartido.
- **Autocomplete de direcciones:** OpenStreetMap **Nominatim** (gratis, sin API key).
- **Calendario:** Flatpickr (vía CDN).
- **Monitorización:** GitHub Action (`.github/workflows/uptime.yml`) que comprueba el sitio cada 2 h.

---

## 2. Arrancar en local

No hace falta instalar nada. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 3000
# abre http://localhost:3000
```

(o `npx serve`, la extensión Live Server de VS Code, etc.)

> El portal usa autodetección de idioma, autocomplete OSM y Flatpickr, que necesitan salida a internet. En local funcionan igual mientras haya red.

---

## 3. Desplegar

- **Producción (`dynamotrans.com`):** merge a `main` → push. Vercel construye y publica en 1-2 min.
- **Preview privada:** cualquier rama que empujes obtiene su propia URL de preview de Vercel automáticamente (nadie más la ve). La del portal es `dynamo-web-git-<rama>-dynamotrans-projects.vercel.app`.

Plan de Vercel: **Hobby** (gratis). Límite relevante = **100 deploys/día** (no usuarios; se sirve desde CDN). Si en una sesión larga se satura la cola, cancelar los deploys en cola desde el dashboard dejando solo el último.

---

## 4. Modelo de ramas

Dos ramas vivas (simplificado el 2026-07-04; ver regla 9 de `CLAUDE.md`):

| Rama | Rol |
|---|---|
| `main` | **Producción** (`dynamotrans.com`). Solo web pública + el portal en su estado "bloqueado". |
| `claude/sharp-dirac-E3UIO` | **Preview** = `main` + código avanzado del portal. Rama de trabajo por defecto del portal. |

**Reglas clave:**
- **El portal NUNCA se publica a `main`/producción** hasta que el dueño lo diga explícitamente (previsto para dentro de unos meses).
- **Cambios de web pública** → arrancan en una **rama corta `fix/<algo>` desde `main`**, se mergean a `main`, y después se hace `git merge main` en preview para que no haya drift.
- **Experimentos** que no van a producción → rama corta `lab/<algo>` desde preview (Vercel la previsualiza igual), se borra o mergea a demanda.

---

## 5. Mapa de archivos

```
index.html            → WEB PÚBLICA (home + tarifador del hero). En producción.
dashboard.html        → PORTAL: panel del cliente (envíos, presupuestos, incidencias, tarifador). Mockup.
portal.html           → PORTAL: login.
registro.html         → PORTAL: alta (flujo passwordless: enlace + código).
verificar.html        → PORTAL: verificación OTP de 6 dígitos.
crear-password.html   → PORTAL: crear contraseña.

js/festivos.js        → Registro ÚNICO de festivos de 12 países EU (compartido por todas las páginas).
images/               → Imágenes, logos, vídeos del hero (webm).
vercel.json           → Cabeceras de seguridad + redirects SEO + rewrite catch-all.
robots.txt / sitemap.xml
.github/workflows/uptime.yml → Alerta por email si el sitio cae.

CLAUDE.md             → Decisiones + bitácora de sesiones (LEER).
TODO.md               → Pendientes + stack/plan del backend (LEER).
```

Cada `.html` grande (`index.html` ~5.500 líneas, `dashboard.html` ~7.000) sigue el mismo orden interno: `<head>` → bloque `<style>` gigante → HTML → bloque `<script>` gigante. Los comentarios en el código explican el *por qué* de cada decisión no obvia.

---

## 6. Qué es real y qué es mock

- **Web pública (`index.html`)**: real y en producción. El **tarifador del hero** genera un mensaje pre-rellenado para email/WhatsApp; **no muestra precio** (decisión: no enseñar precios inventados en público).
- **Portal (`dashboard.html` y páginas de login)**: **100% mockup de frontend**. Los datos (28 envíos, 19 presupuestos, 38 facturas) son **arrays en JS**. El login acepta cualquier credencial. El tarifador del panel calcula un **precio orientativo MOCK** (falta la tarifa real del cliente). No hay backend todavía.
- El plan de backend (Supabase + Postmark + WhatsApp Cloud API, naming `snake_case`, fases) está detallado en **`TODO.md`**.

---

## 7. Deuda técnica conocida (para quien continúe)

Es código pragmático de mockup, no arquitectura de producción. Lo relevante antes de escalar:

1. **Duplicación de código** (lo más importante):
   - El **tarifador** (formulario: `applyCamion`, `bindAutocomplete`, `syncGrupajeVentana`, ventana/paradas…) está **copiado** en `index.html` y `dashboard.html`. Un cambio hay que hacerlo en los dos sitios.
   - El **"chrome" del portal** (FAB del avatar `contact-fab`, sistema de horarios `SCHED_VOCAB`/`buildLabels`/`isPhoneHoursNow`) está **repetido en las 5 páginas del portal**.
   - **Solución recomendada:** extraer a módulos compartidos (`js/tarifador.js`, `js/portal-ui.js`) como ya se hizo con `js/festivos.js`. Idealmente se resuelve solo al migrar a Next.js. Ver Paso A/B en `TODO.md`.
2. **Archivos monolíticos**: CSS y JS inline en HTML de miles de líneas. Sacarlos a `.css`/`.js` externos = HTML cacheable, diffs limpios, menos conflictos.
3. **Sin tooling**: no hay linter/formatter/tests. La verificación se hace a mano (ver abajo).
4. **Restos de mockup a limpiar antes de producción**: defaults de prueba SEV→MAD en el tarifador (marcados en el código con `=== DEFAULTS DE PRUEBA (BORRAR EN PRODUCCIÓN) ===`), tarifa MOCK.

---

## 8. Verificación (mientras no haya tests)

Antes de commitear cambios no triviales:

- **Sintaxis JS de los scripts inline:**
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('dashboard.html','utf8');\
  const m=[...h.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];let ok=true;\
  m.forEach(x=>{const a=x[1]||'';if(/src=/.test(a)||/ld\+json/.test(a))return;\
  try{new Function(x[2])}catch(e){ok=false;console.log('ERR',e.message)}});\
  console.log(ok?'OK':'FALLO')"
  ```
- **Comportamiento**: se prueba en un navegador headless (Chromium/Playwright) sirviendo con `python3 -m http.server` — abrir la página, ejercitar el flujo y comprobar que no hay errores de consola.

---

## 9. Futuro: migración a Next.js

Decisión (2026-06-10): cuando el portal pase de mockup a app real, **se refactoriza ESTE MISMO repo a Next.js** (no se separa en subdominio). Marketing (`/`, `/servicios`…) sigue estático; el portal (`/portal/*`) pasa a server components + auth + DB. Un único proyecto Vercel, un único deploy a `dynamotrans.com`. Detalle completo y stack en `TODO.md`.

---

## Contacto

Proyecto de Dynamo Operador Logístico, S.L. — `info@dynamotrans.com`.
