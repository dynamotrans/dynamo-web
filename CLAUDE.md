# dynamo-web — Instrucciones para Claude

> 📌 **Aviso a Claude**: este archivo y `TODO.md` son SOLO para `dynamo-web`.
> Si la sesión va sobre el otro proyecto del usuario (`agenciadetransporte-web`), trabajar contra `HANDOFF-agenciadetransporte.md` en la raíz, **sin mezclar** ambos contextos.

## Proyecto
Sitio estático HTML servido con `python3 -m http.server 3000`.

## Hosting / Despliegue
- **Vercel** conectado a GitHub (rama `main`).
- Cada push a `main` se publica automáticamente en producción.
- Tener en cuenta posibles errores de build en Vercel al hacer cambios.

## Flujo de trabajo con 2 Macs + GitHub Codespaces
El usuario trabaja desde 2 Macs diferentes usando GitHub Codespaces para mantener un único entorno sincronizado en la nube.

## REGLAS IMPORTANTES

### 1. Nunca hacer push automático
**SIEMPRE preguntar antes de hacer `git push`.** El usuario quiere revisar los cambios y dar el OK explícitamente antes de subir nada a GitHub.

Flujo esperado:
1. Hacer los cambios solicitados
2. Mostrar un resumen de lo modificado
3. Hacer `git add` y `git commit` localmente si procede
4. **Preguntar al usuario**: "¿Subo los cambios a GitHub? (push)"
5. Esperar confirmación explícita antes de `git push`

### 2. Antes de empezar a trabajar (catch-up automático)
Al iniciar cualquier sesión nueva, **Claude DEBE automáticamente**:

1. **Sugerir `git pull`** si el repo puede estar desactualizado (por trabajar desde otro Mac).
2. **Leer la sección "Bitácora"** de este archivo (más abajo) y resumir las últimas 2-3 entradas al usuario.
3. **Leer `TODO.md`** (si existe) y mostrar los pendientes abiertos.
4. Dar un saludo tipo:
   > "👋 Bienvenido de vuelta. Última sesión el [fecha] en [Mac]: [resumen]. Pendientes: [lista de TODO.md]. ¿Por dónde seguimos?"

### 3. Al terminar la sesión (bitácora automática)
Antes de cerrar o cuando el usuario diga "hemos acabado" / "ya está" / "gracias" / similar, **Claude DEBE**:

1. **Añadir una entrada a la sección "Bitácora"** de este archivo con:
   - Fecha (YYYY-MM-DD)
   - Mac usado (si se sabe, preguntar si no: "¿Desde qué Mac estás trabajando, casa u oficina?")
   - Resumen en 2-4 bullets de lo que se hizo
   - Pendientes detectados (que también se añaden a `TODO.md`)
2. Hacer commit con mensaje tipo `chore: update bitácora [fecha]`.
3. **Preguntar antes de push** (regla 1).

### 4. Rama de trabajo
Respetar la rama indicada en las instrucciones de sesión. No cambiar de rama sin permiso.

### 5. Confirmar proyecto + rama ANTES de tocar nada
**ANTES de hacer cualquier cambio (editar archivos, ejecutar comandos que modifiquen estado, etc.) Claude DEBE indicar claramente y pedir confirmación:**

> "Vamos a trabajar en el proyecto **[dynamo-web | agenciadetransporte-web]**, en la rama **[nombre-rama]**. ¿Correcto?"

Solo después de un OK explícito del usuario se puede empezar a editar/commitear.

Esto evita:
- Mezclar código entre las dos webs hermanas.
- Hacer cambios en `main` cuando tocaba una rama de feature.
- Empezar a tocar Dynamo cuando la sesión era para `agenciadetransporte-web` o viceversa.

Lectura para preguntas de tipo "¿qué tocamos?":
- Si `pwd` = `dynamo-web/` → por defecto Dynamo, pero confirmar.
- Si existe `HANDOFF-agenciadetransporte.md` → preguntar explícitamente cuál de las dos.
- Si `pwd` = `agenciadetransporte-web/` → ese proyecto, pero confirmar la rama.

### 6. Nivel de publicación: SIEMPRE preguntar antes

Antes de subir cualquier cambio, preguntar al usuario qué nivel de publicación quiere:

- **A) Solo preview** (push a la rama de feature → URL privada de Vercel tipo `dynamo-web-git-<rama>-dynamotrans-projects.vercel.app`, nadie más la ve, no afecta `dynamotrans.com`)
- **B) Producción** (merge a `main` + push a `main` → publica en `dynamotrans.com` tras 1-2 min de build de Vercel)

Por defecto, asumir A (preview) cuando el cambio es del **portal** o de páginas en desarrollo. Promover a B solo con OK explícito del usuario.

Razón: el portal está aún en mockup mientras la web pública debe verse pulida en producción. Hay que poder iterar el portal sin que se vea fuera, y publicar pequeños fixes de la web sin arrastrar el portal a producción.

### 7. Estrategia de ramas (web pública vs portal mockup)

**⚠️ Regla dura del portal:** el portal **NUNCA se mergea a `main` ni se publica en `dynamotrans.com`** hasta que el usuario lo diga literalmente con una frase explícita tipo *"publica el portal"* / *"sube el portal a producción"* / *"mergea el portal a main"*. Está previsto que esa autorización llegue **dentro de unos meses**, no antes. Si hay dudas → preguntar. **NUNCA asumir.**

Mientras el portal sea mockup HTML estático en este mismo repo:
- **Web pública** (`index.html`, hojas de servicios, etc.): cambios pequeños → branch corto desde `main` (`fix/<algo>`) → preview → OK → merge a `main` inmediatamente
- **Portal mockup** (`portal.html`, `registro.html`, `verificar.html`, `crear-password.html` y futuras páginas): se queda en `claude/sharp-dirac-E3UIO` (rama feature). Solo preview Vercel. Nunca producción salvo orden explícita
- Si hay que hacer un fix público mientras la rama del portal está viva: trabajar desde `main` en una rama corta, mergear, y opcionalmente rebasear la rama del portal sobre el nuevo `main` para no acumular drift

**Estado actual de `main` (producción) respecto al portal:** solo `portal.html` con login básico bloqueado y badge "Próximamente". Los archivos avanzados (`registro.html`, `verificar.html`, `crear-password.html`) NO están en `main`, solo en la rama feature.

Cuando el portal pase de mockup a app real (backend, auth, dashboard con datos):
- **Refactorizamos ESTE MISMO repo a Next.js** (decisión 2026-06-10): se queda en `dynamotrans.com`, no se separa en subdominio
- Páginas de marketing (`/`, `/servicios`, `/vehiculos`, etc.) siguen como están (estáticas, rápidas)
- Portal (`/portal/*`) pasa a app real con server components, auth (Auth.js/Clerk/Supabase), conexión a DB (Postgres) y APIs
- Un único proyecto Vercel, un único deploy a `dynamotrans.com`
- Razón: 1 dev (usuario + Claude) → mantener 2 repos sería overhead inútil. Patrón válido (Notion, Linear hacen esto). Cookies, cache y seguridad se gestionan por ruta dentro de Next.js

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-06-10 (sesión 3) — MacBook Pro
- **Selector de prefijo telefónico buscable** en registro.html: combobox a la izquierda del input de número con botón compacto (icono teléfono + prefijo actual + chevron). Popup 300px (92vw en móvil) con buscador que filtra por **nombre de país O por código** (puedes escribir `34` o `espa` y encuentra España). 2 grupos: "Más habituales" (6 prefijos prioritarios mismo orden que selector país) + "Todos los países" (~175 con E.164). Borde unificado entre prefijo y número, foco en cualquiera resalta todo el contenedor
- **CIF/NIF orden alternado**: label "NIF / CIF" → "CIF / NIF", placeholder `B12345678` → `B12345678 / 12345678Z` (2 ejemplos en mismo orden: CIF empresas, NIF personas físicas). También campo Nombre+Empresa label invertido: "Nombre y apellidos / Empresa o razón social" → "Empresa o razón social / Nombre y apellidos"
- **Flujo passwordless con enlace + código**: tras discutir (¿enviar contraseña por email? no, inseguro), decisión final: estilo Notion/Slack — enviar **enlace + código** al email. El enlace lleva directo, el código es fallback para cuando el enlace no funciona (dispositivo distinto, filtro corporativo). Eliminados ambos campos de contraseña del registro. Botón "Crear cuenta" → **"Continuar"** activo (navega a verificar.html). Texto helper bajo el botón explicando el flujo
- **`verificar.html` (nueva)**: icono email con halo pulsante, email mostrado (leído de sessionStorage que setea registro.html al submit), copy "Te hemos enviado un enlace y un código a tu@empresa.com. Pulsa el enlace o escribe los 6 dígitos aquí". **6 cajitas OTP funcionales** con auto-avance, backspace retrocede, flechas navegan, paste distribuye en serie. Caja con dato pasa a estilo `.filled` (borde+texto morado). Botón "Verificar y continuar" → si los 6 dígitos están, navega a crear-password.html; si no, muestra hint y enfoca primera caja vacía. "Reenviar código" con countdown 60s real (botón disabled mientras espera)
- **`crear-password.html` (nueva)**: medidor de fortaleza con 5 barras (rojo → naranja → amarillo → lima → verde) y etiqueta "Muy débil/Débil/Aceptable/Buena/Fuerte". Lista de 5 reglas con check verde que se rellenan en vivo (mínimo 8 chars, mayúscula, minúscula, número, símbolo). Campo único de contraseña (sin repetir — UX moderna) con botón ojo show/hide. Checkbox **"Recordarme 90 días"** marcado por defecto (si no, sesión dura 30 días → estándar B2B logístico XPO/DSV/Maersk). Botón se activa solo con mínimo 8 chars Y ≥3 reglas. Al submit: oculta form y muestra pantalla success con icono verde grande "¡Bienvenido a Dynamo Portal!"
- **Inputs del registro editables**: quitado `disabled` de Email, Empresa/Nombre, CIF, Teléfono y del checkbox de términos. CSS `.portal-input` actualizado con buen aspecto editable (bg blanco, texto navy, hover/focus morado con ring). El badge "Próximamente · En desarrollo" se mantiene pero el flujo completo se puede probar end-to-end en preview
- **Discusión de URLs**: explicado que Vercel crea automáticamente preview deployments por rama (URL `dynamo-web-git-claude-sharp-dirac-e3uio-dynamotrans-projects.vercel.app`) que solo el usuario ve. El branch alias es estable: siempre apunta al último commit de la rama. La usaremos siempre para iterar el portal sin afectar `dynamotrans.com`
- **Reglas 6 y 7 añadidas a CLAUDE.md** + cherry-pick a main:
  - **Regla 6**: SIEMPRE preguntar nivel de publicación antes de subir cambios — A) Solo preview Vercel (push a rama feature) o B) Producción (merge+push a main). Por defecto asumir A cuando el cambio es del portal o páginas en desarrollo
  - **Regla 7**: estrategia de ramas + **hard rule**: el portal NUNCA se mergea a main ni se publica en `dynamotrans.com` hasta que el usuario lo diga literalmente con frase explícita (*"publica el portal"*). Está previsto en unos meses, no antes
- **Rollback de producción al estado básico**: al estar el flujo avanzado solo en preview, se hizo limpieza en main para que `dynamotrans.com/portal` muestre solo el login básico bloqueado original. Cambios en main (`dba559c`): eliminado divisor "¿No tienes cuenta?" + botón "Crear cuenta" + CSS `.portal-create` muerto de portal.html, **borrados `registro.html` y `verificar.html` de main** (siguen vivos en la rama feature). En producción ahora solo: nav con ACCESO → login básico con campos disabled + badge "Próximamente"
- **Decisión arquitectónica: Opción A — mismo repo, mismo dominio**: tras discutir si el portal real debería ir en `app.dynamotrans.com` (subdominio + repo separado) o en `dynamotrans.com/portal` (mismo repo refactorizado a Next.js), elegida **Opción A**. Razón: 1 dev (usuario + Claude) → mantener 2 repos sería overhead inútil (sincronizar imágenes, 2 dashboards Vercel, mismo logo cambiado dos veces, riesgo de desincronización). Cookies, cache y seguridad se gestionan por ruta dentro de Next.js. Patrón válido y usado por Notion, Linear. CLAUDE.md regla 7 + TODO.md actualizados con la decisión y cherry-pick a main
- **Commits del día (sesión 3)**: `5f51376` (passwordless flow + verificar.html), `100ac65` (inputs editables), `8de1835` (crear-password.html + flow), `df60ade` (rules 6+7 + author fix → `291e04a`), `46a6e37` (hard rule portal nunca a main), `483821b` (decisión Opción A docs). **A producción solo:** `dba559c` (rollback portal básico) + cherry-picks `8609a28`, `33a2136`, `b09e38c` (docs CLAUDE.md/TODO.md). Todo el flujo passwordless + crear-password vive en preview en `dynamo-web-git-claude-sharp-dirac-e3uio-dynamotrans-projects.vercel.app`
- **Pendientes anotados para el backend** (en TODO.md): duración sesión 30/90 días con "Recordarme", flujo enlace+código, roles de usuario (cliente por defecto, transportista a futuro), portal en `dynamotrans.com/portal` con Next.js
- **Pendiente arrastrado**: sigue sin decisión el texto del botón `Cotizar` del hero

### 2026-06-10 (sesión 2) — MacBook Pro
- **Fix favicon en portal.html**: apuntaba a `images/favicon.png` (que no existía en el repo, llevaba meses fallando). Cambiado al mismo PNG que usa index.html (`images/DYNAMO-NEW-LOGO.png`) + `apple-touch-icon` para iOS. Ahora la pestaña muestra el logo de Dynamo en cualquier página del sitio
- **Botón "Crear cuenta"** añadido al login (`portal.html`): divisor "¿No tienes cuenta?" + botón outline morado (`href="registro.html"`) con hover invertido. Es el único enlace activo del mockup junto a "Volver al inicio"
- **Nueva página `registro.html`** (mockup): formulario con badge "Próximamente · En desarrollo", botón "Crear cuenta" deshabilitado, mismo estilo de marca, favicon, `noindex,nofollow`. Selector de idiomas fijo arriba-derecha con cookie `googtrans` compartida + watchdog (igual que portal.html). Enlaces de salida: "¿Ya tienes cuenta? Iniciar sesión" → portal.html, "Volver al inicio" → index.html
- **Decisión: portal solo para clientes en primera fase**. Eliminadas TODAS las referencias a "transportistas" en portal.html y registro.html (subtítulos, bloque info, selector tipo de cuenta Cliente/Transportista del registro y su CSS muerto). El form de registro incluye `<input type="hidden" name="tipo_usuario" value="cliente">` + comentario HTML explicando que cuando se habilite el alta de transportistas/proveedores, este campo debe convertirse en selector visible con rol persistido en backend
- **Campos del registro reordenados**: email es ahora el **primer campo** (full-width). Login también pasa a "Correo electrónico" (era "Usuario o correo") con `type=email`, icono sobre y placeholder `tu@empresa.com` — porque el usuario siempre será un email
- **Texto del bloque info del portal** actualizado: *"Estamos desarrollando el portal privado para clientes: programación y estado de cargas e histórico de envíos. Mientras tanto, contáctanos por los canales habituales."* (quitada mención a facturas)
- **Campos Nombre + Empresa unificados** en un solo campo full-width: *"Nombre y apellidos / Empresa o razón social"* (placeholder *"Nombre completo o empresa"*). Reduce 1 fila del form
- **NIF/CIF placeholder** sin guion: `B12345678` (era `B-12345678`)
- **Selector de país buscable** (combobox custom, SÍ funcional aunque el resto del form esté disabled): botón con icono globo + España preseleccionado por defecto, al pulsar despliega popup con input de búsqueda arriba y dos grupos:
  - **"Más habituales"** (6): España, Portugal, Francia, Países Bajos, Alemania, Italia (en ese orden)
  - **"Todos los países"** (~175 en orden alfabético, excluyendo los 6 prioritarios)
  - Buscador filtra en vivo normalizando acentos y mayúsculas; si un grupo queda sin items se oculta; "Sin resultados" si no hay coincidencias. Se cierra al pulsar fuera o seleccionar
- **Orden final del form de registro**: Email → Nombre/Empresa → NIF | País → Teléfono → Contraseña | Repetir → checkbox legal → botón Crear cuenta
- **Commits del día (sesión 2)**: `83947df` (fix favicon portal), `33a66cd` (boton Crear cuenta + registro.html mockup), `4ec0c8b` (quitar transportistas), `f5032bc` (email primer campo + login solo email), `4ac72ff` (selector país buscable + nombre/empresa unificado + NIF sin guion). Merges a `main`: `7f87db4` → `3d54f34` → `2ab85e4` → `23da639` → `d33af9e`. Todo desplegado en producción vía Vercel
- **Pendiente arrastrado**: sigue sin decisión el texto del botón `Cotizar` del hero
- **Pendiente futuro**: cuando se habiliten transportistas/proveedores, convertir el hidden `tipo_usuario` del registro en selector visible

### 2026-06-10 — MacBook Pro
- **Portal de acceso (mockup login)** — nuevo archivo `portal.html` con login bloqueado: badge "Próximamente · En desarrollo", campos usuario+contraseña `disabled` con iconos SVG, checkbox "Recordarme", "¿Olvidaste tu contraseña?" (pointer-events:none), botón "Iniciar sesión" con opacity 0.55, bloque info y botón "Volver al inicio". Logo Dynamo arriba, footer con dynamotrans.com. Estilo de marca (purple/green) con grid de fondo difuminado por máscara radial. Confirmado con el usuario: 1 solo login genérico (no separa cliente/transportista), página aparte `/portal`, campos disabled con aviso, accesos en nav + footer + mobile
- **Limpieza nav desktop**: botón **ATENCIÓN AL CLIENTE** sustituido por botón **ACCESO** (con icono candado SVG, `href="portal.html"`). Eliminados los iconos Instagram + WhatsApp que iban junto al selector de idiomas (`.nav-social` y su CSS muerto, –10 líneas)
- **Mobile menu + footer**: añadido enlace **🔒 Acceso** (mobile en morado bold, footer en columna Empresa)
- **Caja Cotización Inmediata eliminada** del grid de servicios (6ª card) — el usuario decidió quitarla porque "estorba"
- **Grid de servicios reestructurado** a 4 columnas fijas (era `auto-fit minmax(285px, 1fr)`) + **Almacenamiento `.svc-almacen` ocupa fila completa abajo** con layout horizontal: imagen izquierda (`minmax(260px, 0.9fr)`) + cuerpo derecha (`1.4fr`) con la calculadora. Stripe degradado morado→verde más marcado (4px), h3 1.7rem
- **Movil**: 2 cards por fila (no 4 como pidió el usuario inicialmente — se rectificó porque "4 en una fila" era inviable en 360px), imagen 110px, descripción y tag visibles. Almacenamiento full-width abajo, vertical (imagen arriba, cuerpo abajo)
- **Transición portal "wormhole" estilo agujero negro** desde el botón ACCESO al `portal.html`:
  - Overlay con clip-path `circle(0 → 160%)` anclado a la posición exacta del click (`clientX/Y`), gradiente radial morado claro → morado → navy
  - 3 anillos blancos expandiéndose escalonados (480px desktop / 320px móvil)
  - Capa de 12 estrellas titilantes con rotación + scale
  - Núcleo central con backdrop-blur, candado SVG, texto "Acceso Portal" y barra loader infinita
  - Tras 850ms (250ms si `prefers-reduced-motion`), navega a portal.html
- **Llegada suave al portal**: `sessionStorage('portalTransition')` marca la transición → portal.html (script inline en `<head>` antes del primer paint) lee la flag y agrega `.from-transition` al `<html>`. CSS aplica overlay `.portal-arrival` con el mismo gradiente + candado, que se disuelve con zoom out (`scale 1 → 1.3`) + fade 0.85s mientras la tarjeta entra retrasada a 0.45s. Sin "flash" entre páginas
- **Transición de vuelta** (portal → index): el botón "Volver al inicio", el logo del portal y `dynamotrans.com` del pie disparan el mismo wormhole pero con **icono casa + "Inicio"**. `sessionStorage('homeTransition')` + script inline en `<head>` de index.html monta `.home-arrival` con la misma disolución
- **Fix bfcache** (botón atrás del navegador): `pageshow` event en ambas páginas quita `.active` del overlay y limpia sessionStorage. En portal.html, si `e.persisted` quita también `.from-transition` para no replay incorrecto
- **Selector de idiomas en portal.html**: faltaba completamente. Añadido fixed top-right con sombra, 11 opciones idénticas a index, motor Google Translate completo (carga, init, doTranslate, changeLang, limpieza `?lang=es`). Lee la cookie `googtrans` compartida con index al cargar y aplica el idioma automáticamente
- **Fiabilidad del cambio de idioma** (ambas páginas): añadido watchdog que detecta si Google Translate cargó pero NO auto-aplicó la cookie (causa del "a veces no cambia"). Si tras 600ms el `<html>` no tiene clase `translated-ltr`, fuerza `doTranslate()` (máx. 20 intentos). Fallback manual reducido de 10s → 4s antes del reload
- **Chips y botón Cotizar en minúsculas**: quitado `text-transform: uppercase` de `.strip-item` (Grupajes / Carga Completa / Import & Export / Nacional 24h) y `.hero-cotizar-btn` (Cotizar). Letter-spacing reajustado y font-size de chips 0.85 → 0.9rem
- **Nota de flota exclusiva en Servicios**: copiada la nota que ya existía al pie de Vehículos también a la sección Servicios, **antes** de las cajas (entre `section-desc` y `svc-grid`): *"Trabajamos exclusivamente con trailer tauliner (lona corredera) y rígido con plataforma. No disponemos de pisos móviles, bañeras basculantes, frigoríficos ni servicio de granel o temperatura controlada."*
- **Commits del día (rama feature → main)**: `00dce23` (tipo camión en veh-cards), `a120b0c` (portal mockup + limpieza nav), `c906870` (grid 4-en-fila + Almacenamiento full), `10fb9ad` (transición wormhole), `29517e4` (ACCESO + móvil 2 por fila), `b155f40` (llegada suave), `6142333` (fix bfcache), `d00c5df` (transición vuelta), `bc00ce6` (idiomas en portal + fiabilidad), `18cbf48` (chips lowercase), `21a52cd` (nota servicios), `25835eb` (nota antes de las cajas). Merges a `main`: `a799f7d` → `068fe76`/`5553108`/`ff20869`/`502e6ae`/`2fd34c0`/`cd25592`/`a4d1b8e`. Todo desplegado en producción vía Vercel
- **Pendiente arrastrado**: sigue sin decisión el texto del botón `Cotizar` del hero (`Cotizar` vs `TARIFAR` / `PEDIR TARIFA` / `SOLICITAR TARIFA`)

### 2026-06-09 — MacBook Pro
- **Tipo de camión en mensaje preformateado de cajas de vehículos** (rama `claude/sharp-dirac-E3UIO`, mergeada en `main` `a799f7d`): los 4 enlaces que aparecen al pulsar `CONTRATAR` en las 2 cajas de tipos de camión (Trailer Tauliner y Rígido con Plataforma) — 2 email + 2 WhatsApp — incluyen ahora una línea **`TIPO DE CAMION SOLICITADO:`** con modelo y specs clave:
  - `Trailer Tauliner — Cortina / Lona Corredera (13,60 m · 33 palets europeo · 24 Tn)`
  - `Rígido con Plataforma y Transpaleta (8 m · 20 palets europeo · 14 Tn · plataforma + transpaleta)`
- **Asunto del email diferenciado** para sortear bandeja: `Solicitud TARIFA — Trailer Tauliner` y `Solicitud TARIFA — Rígido con Plataforma`. Antes los 4 botones llevaban exactamente el mismo asunto genérico `Solicitud de TARIFA para transporte`
- **Implementación**: script Python con `urllib.parse.quote` para regenerar los 4 URLs con encoding correcto (CRLF `%0D%0A` en mailto para Gmail mobile, LF `%0A` en WhatsApp con negrita `*`). Reemplazo por bloque scoped al `h3` de cada veh-card para no contaminar el otro
- **Commit del día**: `00dce23` (feat) → merge `a799f7d` a `main`. Desplegado en producción vía Vercel
- **Pendiente abierto del día anterior**: sigue sin decisión el texto del botón `COTIZAR` del hero (`Cotizar` vs `TARIFAR` / `PEDIR TARIFA` / `SOLICITAR TARIFA`)

### 2026-06-08 (sesión 2) — MacBook Pro
- **Calculadora de precio en la card "Almacenamiento corta estancia"** (rama `claude/sharp-dirac-E3UIO`, mergeada en `main` por partes): nuevo bloque debajo del `<span class="svc-tag">` que despliega un desglose interactivo al seleccionar provincia
- **Dropdown de provincias**: 47 provincias peninsulares (excluye Baleares, Canarias, Ceuta, Melilla) en `<select id="alm-prov-select">`. Hasta que no se elige una, la caja de precio queda `hidden`
- **2 selectores de cantidad** con recálculo en vivo:
  - **Nº trailers** (1-10) × **240 € + IVA** → almacenamiento 1-7 días, 33 palets europeo máx. por trailer y tarifa
  - **Nº envíos** (`0 (recogida cliente)`, 1-10, 12, 15, 20) × **180 € + IVA** → entrega zona urbana con camión 2 ejes 4 m largo. **Default `0`** (asume que el cliente recoge con su propio camión/trailer)
- **Total dinámico** con formato es-ES (`240 €`, `1.020 €`, etc.) y **nota descriptiva** debajo que se reescribe sola con singular/plural (`1 trailer completo (33 palets europeo máx.) y sin entrega — recogida por el cliente con su propio camión/trailer` / `2 trailers completos (66 palets...) y 3 entregas en zona urbana...`)
- **2 CTAs en la propia caja**: botón morado `Email` + botón verde `WhatsApp`. JS rellena `href` dinámicamente con un mensaje preformateado que incluye provincia, cantidades, desglose, total orientativo y 4 preguntas estructuradas (tipo mercancía, palets, fecha llegada, dirección/destino). Email con CRLF (Gmail mobile), WhatsApp con LF y negrita `*`
- **Bug detectado y corregido**: `parseInt(value) || 1` convertía silenciosamente el `0` (falsy en JS) en `1`, por lo que seleccionar "0 envíos" mostraba 180 € en vez de 0 €. Fix: validar con `isNaN()` (commit `3e9305d`)
- **Commits del día (rama feature → main)**: `5289837` (calculadora + 47 provincias), `1aa3761` (botones Email/WhatsApp con mensaje), `c24b7b2` (selectores cantidad), `ebcfc76` (opción 0 envíos), `f0932a4` (nota dinámica), `23d2e35` (default Nº envíos = 0), `3e9305d` (fix parseInt). Merges a `main`: `068fe76` → `d264c25` → `b70c598` → `9e4036d` → `30a53dd`. Todo desplegado en producción vía Vercel
- **Pendiente abierto del día anterior**: sigue sin decisión el texto del botón `COTIZAR` del hero (`Cotizar` vs `TARIFAR` / `PEDIR TARIFA` / `SOLICITAR TARIFA`)

### 2026-06-08 — MacBook Pro
- **Workflow de uptime / GitHub Actions**: añadido `.github/workflows/uptime.yml` que comprueba `dynamotrans.com` cada 2 h y manda email automático si cae (commit `ad005f5`). Primer run dio falso positivo por un `307` (redirect de Vercel a www) → fixed añadiendo `curl -L` para seguir redirects (commit `77fc22c`). Verificado en producción: workflow runs en verde
- **Barra superior — border-radius unificado**:
  - Primera iteración: `.lang-btn` (selector ES), `.nav-social a` (iconos IG/WA) y `.btn-nav-cta` (botón ATENCIÓN AL CLIENTE) pasaron de píldora (`50px` / `50%`) → **`18px`** para igualar al resto de botones de la web (commit `54586d9`)
  - Problema detectado: en botones de ~38-39px de alto, `18px` queda casi como píldora completa (clamp visual). El usuario notó que "se veía igual"
  - Segunda iteración: `.lang-btn` y `.btn-nav-cta` bajados a **`10px`** (proporcional al 18/55 de los botones grandes del hero) para que se vea claramente como rectángulo con esquinas suaves (commit `ac1cc42`). Los iconos IG/WA (30×30) quedan en 18px pero el clamp CSS los mantiene visualmente circulares
- **Cajas de servicios — quitar botones WhatsApp/Email**: eliminados los 6 bloques `.svc-btns` (con sus enlaces `wa.me` y `mailto` URL-encoded) de las 6 svc-cards (Grupajes, Carga Completa, Importación, Exportación, Gestión Logística, Cotización Inmediata) y limpiado el CSS muerto asociado (`.svc-btns`, `.svc-btn`, `.svc-btn:hover`, `.svc-btn-wa`, `.svc-btn-email`). Las cajas conservan imagen + título + descripción + tag. −29 líneas (commit `da51ed6`)
- **Chips de la barra de servicios — esquinas**: `.strip-item` (GRUPAJES / CARGA COMPLETA / IMPORT & EXPORT / NACIONAL 24H) de píldora `99px` → `10px` para igualar al resto de botones de la nav (commit `f226f19`, merge `f839ed3`)
- **Botón CONTRATAR en cajas de vehículos**: añadido al final de cada `.veh-card` (Trailer Tauliner y Rígido con Plataforma). Estilo morado, radius 10px, mismo lenguaje visual que `.btn-nav-cta`. Al pulsar despliega 2 iconos circulares (📧 email morado + 💬 WhatsApp verde) con animación de rebote escalonado (cubic-bezier 0.34, 1.56, 0.64, 1), inspirado en el FAB del avatar. Cierre por click fuera o tecla Escape. URLs reutilizan el mensaje SOLICITUD DE TARIFA preformateado de los demás botones. A11y con `aria-expanded`/`aria-hidden`, soporte `prefers-reduced-motion`. +63 líneas (commit `34a0b92`, merge `9ddb964`)
- **Hero — botón COTIZAR único que despliega los 2 botones**: los 2 botones grandes del hero (Enviar un eMail morado + Enviar WhatsApp verde) ahora están **ocultos por defecto**. Se añade un único botón `COTIZAR` (`.hero-cotizar-btn`) que al pulsar **se oculta** y aparecen los 2 botones con animación `fadeUp` 0.45s. Cierre por click fuera del `.hero-cta-wrap` o tecla Escape → vuelve a aparecer COTIZAR. Se conservan las URLs largas con SOLICITUD DE TARIFA preformateada. Color: primero amarillo (`var(--yellow)` con texto `var(--purple-nav)`, commit `f96f2e9`) → el usuario lo rechazó → cambiado a **verde de marca** (`var(--green)` #22a55a con texto blanco) tipo botón de acción/contacto, commit `4d9715e`, merge `b86e5e9`
- **Caja de servicios — "Gestión Logística" → "Almacenamiento corta estancia"**: cambiado el título `<h3>` y el `alt` de la imagen (`images/PLT.jpg`) en la 5ª svc-card. Nueva descripción: *"Almacenamiento de corta estancia (1 a 7 días) en cualquier provincia de España. Para entregas posteriores disponemos de camiones carrozados o de 2 ejes para zonas urbanas, o recogida por el cliente según prefiera."* Sustituye al texto anterior sobre gestión de incidencias. El tag `Servicio integral` se mantiene (commits `449fe0b` descripción + `8ba8cd4` título/alt, merges `0247de2` → `bb2577b`)
- **Pendiente abierto**: el texto del botón (`Cotizar`) — el usuario planteó si dejarlo o cambiar a `TARIFAR`/`PEDIR TARIFA`/`SOLICITAR TARIFA`. Sin decisión todavía
- **Todo mergeado a `main` y desplegado en producción** vía Vercel (commits del día en `main`: `1654bc5` → `f839ed3` → `9ddb964` → `9bfffc1` → `b86e5e9` → `4d84c36` → `0247de2` → `bb2577b`). El workflow de uptime queda activo en background. Verificación visual del usuario en `dynamotrans.com` con hard-refresh si la caché muestra versión vieja

### 2026-06-04 — iPhone Pro Max 17
- **Mensaje predefinido de tarifa — punto 3 ampliado** (primera iteración del día): añadidas 2 preguntas en los 23 botones (13 WhatsApp + 10 email): `¿Origen es Almacén, Obra o Finca?:` tras el origen y `¿Destino es Almacén, Obra o Finca?:` tras el destino, con línea en blanco separando origen y destino. Script Python con doble codificación (`%0A` WhatsApp, `%0D%0A` mailto) (commit `58feca1`)
- **Chips de la barra de servicios** (GRUPAJES / CARGA COMPLETA / IMPORT & EXPORT / NACIONAL 24H): la caja `.strip-item` pasa de transparente con texto blanco → **fondo blanco con texto morado por defecto**, y **naranja con texto blanco al hover/pulsar** (`:hover, :active`). Añadida variable `--orange: #ff7a00`. El puntito `.si` se mantiene verde parpadeando (commit `9b4da03` cambió primero el punto y `9bdac2e` lo revirtió aplicándolo al chip)
- **Hero — botones reordenados y recoloreados**: ahora **eMail azul (morado de marca `--purple` #3300cc) a la izquierda** y **WhatsApp verde (#25D366) con letras blancas a la derecha**. Reordenado vía `order` CSS (1 vs 2) para no tocar las URLs largas. Hover y sombra ajustados al color de cada botón (commit `66e3cda`)
- **Negrita en WhatsApp** para el mensaje de tarifa: rodeado con `*` (codificado `%2A`) los títulos `1.`/`2.`/`3.`/`4.`, `METROS LINEALES:`, `PESO APROX:` e `IMPORTANTE:`. Solo en los 13 enlaces `wa.me`; los 10 `mailto` quedan en texto plano porque el body de mailto no admite formato. Regex acotado a `wa.me/...?text=` para no contaminar los emails (commit `bc4aee2`)
- **Mensaje predefinido NUEVO más corto** (sustituye al anterior, en los 23 botones): pasa de la versión larga (punto 1 con RESPUESTA, punto 2 con METROS/PESO, punto 3 con Almacén/Obra/Finca, punto 4 COMENTARIOS) → versión con 3 preguntas y placeholder `—` para la respuesta. Bloque IMPORTANTE actualizado: "naves o almacenes" y "En caso de ser obras debe avisarse". WhatsApp con negrita en `SOLICITUD DE TARIFA:`, títulos 1/2/3 e `IMPORTANTE:`; email en texto plano (commit `b820634`)
- **Hero oscuro tipo XPO/Transaher**: `.hero-overlay` pasa de degradado morado (rgba(10,2,48,0.80) / rgba(51,0,204,0.50) / rgba(10,2,48,0.75)) → **velo negro vertical** (rgba(0,0,0,0.65) → rgba(0,0,0,0.85)). Título `H1` todo blanco: quitados los acentos `var(--green)` y `var(--yellow)` de `.hl` y `.hl2` (commit `5b3f350`)
- **Botones con esquinas — varias iteraciones**: primero pasaron de píldora `border-radius: 50px` → **rectas `0`** en hero `.btn-wa`/`.btn-email` (commit `290ba81`) y en los CTA grandes `.btn-cta-wa`/`.btn-cta-out` de la barra "Cotiza Online" y "¿Listo para empezar?" (commit `af3a9f1`). Después se decidió igualar al **redondeo medio `18px`** de las cajas de tipos de camión (`.veh-card`) — aplicado a los 4 botones (commit `f1b08c4`)
- **Todo mergeado a `main` y desplegado** en producción (dynamotrans.com) vía Vercel. Verificación visual del hero oscuro y los botones redondeados pendiente del usuario (producción bloquea peticiones automáticas de Claude). Nota recurrente: hard-refresh en móvil si la caché muestra la versión antigua

### 2026-05-21 — iMac oficina
- **Punto de la barra de servicios** (`.si` en los botones Grupajes / Carga Completa / Import & Export / Nacional 24h): de cuadradito `■` verde con parpadeo → **círculo CSS** de 11px, **blanco fijo manteniendo el parpadeo** (`pulse-dot`) y **verde** (`var(--green)`) al hacer hover. Glyph oculto con `font-size:0` (commit `dd4d147`)
- **Fondo final del hero** = nueva imagen `images/HERO-DYNAMO.webp` (en vez del degradado morado/azul). Se mantiene el vídeo `mp_dynamo.mp4` (se reproduce primero) y el degradado de marca queda como **fallback** detrás de la imagen si no carga. Conserva el zoom suave `heroZoom` (commit `08bd385`)
- **Imagen del hero**: el usuario la subió por GitHub web a `main`; se trajo a la rama de trabajo vía `git checkout origin/main -- images/HERO-DYNAMO.webp` (commit `d6a4324`)
- **Merge a `main` y push** (merge `aa8f045`): todo desplegado en producción (dynamotrans.com) vía Vercel. Verificación visual pendiente del usuario (producción bloquea peticiones automáticas de Claude)

### 2026-05-20 — MacBook Pro
- **Chip con nombre en el FAB**: añadido `<span class="contact-fab-name">Álvaro Blanco de Dynamo</span>` dentro del botón de la foto; chip blanco con texto morado, aparece a la izquierda al abrir el FAB con la misma animación de rebote que los iconos del abanico; respeta `prefers-reduced-motion` (commits `8f40885`)
- **FAB foto +35%**: 96→130px desktop, 81→109px móvil. Recalculado `right` y `bottom` del botón ↑ para mantener centros alineados y separación cómoda (commit `b2e415e`)
- **Hero**: botón "Llamar al +34 955 225 945" → "Enviar un eMail" (icono sobre, `mailto:info@dynamotrans.com`); clase CSS renombrada `.btn-tel` → `.btn-email` (sólo se usaba aquí, refactor limpio) (commit `9164e18`)
- **Banderas del menú móvil eliminadas**: borrado el bloque entero (caja + título "Idioma / Language" + grid 6col con 11 banderas). El selector de idiomas del nav (dropdown) sigue intacto con sus 11 opciones (commit `9164e18`)
- **Barra "Cotiza Online" sustituida** por copia exacta de la sección CTA "¿Listo para empezar?" de abajo (sin `id="contacto"` para no duplicar IDs; el original conserva el id). Limpiado CSS muerto de `.cotiza-bar/.cotiza-title/.cotiza-btns/.btn-cotiza-main/.btn-cotiza-out` (commit `b327f75`)
- **Sección stats con fondo gris**: morado degradado → `--gray-100` → finalmente `--gray-200` (#e8eaed). Texto blanco → navy, etiquetas → gris-500. Números y estrellas siguen en verde de marca. Contenido HTML intacto (commits `b582d6e`, `e54abcc`)
- **Mensaje predefinido universal** en los 23 botones (13 WA + 10 email): "Buenos días, solicito TARIFA para transporte..." con preguntas estructuradas. Aplicado vía script Python con URL-encoding limpio. Los 10 enlaces email en textos legales (RGPD, política privacidad) intactos. Iteración 2 añadió METROS LINEALES, PESO APROX, pregunta 4 COMENTARIOS y separadores `****` en IMPORTANTE (commits `261f90d`, `6099ce5`)
- **Chip nombre +30%**: desktop 0.78→1.01rem, móvil 0.7→0.91rem (commit `7cfe357`)
- **Mailto saltos CRLF para Gmail mobile**: en `mailto:` se cambió `%0A` (LF) → `%0D%0A` (CRLF) en el body, porque la app Gmail iOS/Android colapsaba los saltos. WhatsApp mantiene `%0A` (ya funcionaba). RFC 6068 especifica CRLF (commit `17d9053`)
- **FAB "online presence"**: añadido `.contact-fab::after` = punto verde con halo pulsante (`@keyframes onlineDotPulse`) en la esquina inferior derecha de la foto (siempre visible, también con FAB cerrado). El chip al abrir muestra ahora 2 líneas: nombre + "En línea · Respondo enseguida" con puntito verde parpadeando (`@keyframes statusBlink`). Padding del chip ajustado a 0.55/0.95rem y border-radius 18px para 2 líneas. `prefers-reduced-motion` cubre las dos animaciones nuevas (commit `734e910`)
- **Transición vídeo hero → degradado más suave**: el `transition: opacity` pasa de 1.4s ease a **2.4s ease-in-out**, y el fade arranca 1,5s ANTES de que termine el vídeo vía `timeupdate` (el listener `ended` queda como fallback). Así el vídeo se desvanece mientras todavía se reproduce, sin el "tirón" del último frame congelado (commit `734e910`)
- **FAB Llamar solo en horario de oficina**: nuevo IIFE en el script del FAB que comprueba la hora en zona `Europe/Madrid` (manejo automático de DST). Visible **L-V 8:00-19:00**; fuera de horario se oculta solo el botón Llamar (Email y WhatsApp siempre disponibles). Recheck cada 60s. Otros botones de teléfono en la web (nav, CTA, menú móvil) no se condicionan. Lógica testada con 7 casos sintéticos (commit `b78e42f`)
- Todo pusheado a `main` → desplegado en producción (dynamotrans.com); verificaciones visuales pendientes del usuario

### 2026-05-18 — MacBook Pro
- **Verificado vía API de Vercel** que el proyecto duplicado `dynamo-web-muoi` ya NO existe (lo borró el usuario desde el dashboard). Quedan 3 proyectos: dynamo-web (el bueno), montesblanco-web, agenciadetransporte-web
- **FAB de contacto verificado en producción**: el usuario confirmó visualmente las 4 comprobaciones (foto círculo, aro verde pulsante, abanico con rebote, cierre fuera/Escape, móvil OK). NOTA: producción bloquea peticiones automáticas (403 anti-bot) → Claude no puede hacer verificación visual remota, solo estructural vía API + código local
- **Hero sin loop + transición a degradado**: quitado el atributo `loop` del `<video>` (se reproduce una vez); nueva capa `.hero-gradient` con el degradado morado/azul de marca y zoom suave (`heroZoom` scale 1→1.07, 18s); al terminar el vídeo, JS añade clase `.ended` → fundido `opacity 1.4s` y queda el degradado animado debajo; añadido bloque `prefers-reduced-motion`. Commit `56c526f` → producción
- **Barra "Cotiza Online"**: cambiado el fondo de amarillo (`--yellow`) a gris claro suave (`--gray-100`, #f7f8fa); título y botones siguen morados (buen contraste). Commit `b7a4ed9`. Luego cambiado el texto a "Cotizamos en 2 minutos." (commit `b296d13`) → producción
- **Botón "subir arriba" (`.back-top`) — varias iteraciones**:
  - Recolocado pegado encima del FAB de la foto (de `bottom:15.5rem` a `8.5/10.5rem` desktop, `7/9rem` móvil) y se oculta al abrir el FAB (clase `.fab-hidden` desde el JS open/close) — commits `1a61106`, `64434f1`
  - Centros alineados verticalmente con el FAB vía `calc()` (`right: calc(1.8rem + 27px)` desktop con FAB 96px; `calc(1.2rem + 19.5px)` móvil con FAB 81px) — commit `a85ffcd`
  - **Bug de orden CSS**: el override móvil estaba ANTES de la regla base → la base (valor desktop) lo pisaba en móvil. Movido el `@media (max-width:600px)` DESPUÉS de la regla base — commit `7d775cf`
  - **Bug de clic**: la caja invisible del `.contact-fab-wrap` (z-index 998, alta) capturaba el tap del botón ↑. Solución: `pointer-events:none` en el wrap, `auto` en la foto y en los iconos al abrir — commit `64434f1`
  - **Doble toque en móvil**: `:hover` envuelto en `@media (hover:hover)` (commit `b3bf2bd`) y, como no bastó, quitado el `onclick` inline y añadido handler `touchend` con `preventDefault()` para actuar al primer toque y matar el click fantasma de iOS — commit `79e35f3`
- **Deploy de `79e35f3` (resuelto)**: Vercel no autodesplegó ese commit en su momento, pero al pushear la bitácora `2e61f36` (que va encima) Vercel sí desplegó → el fix del botón ↑ entró en producción igualmente (deploy `dpl_9TW8Nk3u`, commit `2e61f36`). No requirió acción manual
- NOTA recurrente: producción bloquea peticiones automáticas (403) → Claude solo verifica vía API de Vercel + código local; la confirmación visual la hace el usuario
- Commits del día pusheados a `main`: `e09eb9d`, `ee52663`, `56c526f`, `b7a4ed9`, `b296d13`, `1a61106`, `a85ffcd`, `7d775cf`, `64434f1`, `b3bf2bd`, `79e35f3` (este último pendiente de que Vercel lo despliegue)

### 2026-05-17 — MacBook Pro
- **Eliminada la música de fondo** por completo: borrado CSS `.float-music` + comentario de sección, `<audio id="bgMusic">`, botón flotante con sus 2 iconos SVG y la función JS `toggleMusic()` (–38 líneas en `index.html`)
- Borrado `audio/dynamo-bg.mp3` (7 MB) y la carpeta `audio/` vacía → repo ~7 MB más ligero
- No se tocaron el FAB de contacto ni el botón "subir arriba" (independientes)
- Verificado: 0 restos, HTML balanceado, sirve 200, MP3 da 404; commit `64b03e7` pusheado a `main` → desplegado en producción (dynamotrans.com)
- **Foto real en el FAB de contacto**: el usuario subió `images/ALVARO_circular_v5.png` (800×800, ya circular con borde) por GitHub web; cambiado el `src` del FAB de `mi-foto.jpg` a esa foto (commit `775f076`). NOTA: Claude no puede guardar imágenes pegadas en el chat como archivo; el usuario debe subirlas (URL pública / Codespace / GitHub web)
- **Eliminada la ventana emergente de salida** (exit-intent popup) por completo: CSS + HTML + JS (triggers mouseout desktop, scroll-up móvil y timer 25s) — ~139 líneas menos
- **Foto del FAB a 1,5x**: círculo 64→96px (desktop) y 54→81px (móvil); commit `43c0096` pusheado a `main` → producción
- **Iteración de foto del FAB**: el usuario subió por GitHub web `ALVARO_circular_OFICINA.png` y luego `ALVARO_circular_ZOOM.png`; quedó como definitiva la **ZOOM** (commit `bff1011`). Todas 800×800, ya circulares con borde
- **Limpieza**: borradas las 4 imágenes sin usar (`mi-foto.jpg`, `ALVARO.jpeg`, `ALVARO_circular_v5.png`, `ALVARO_circular_OFICINA.png`) — verificadas 0 referencias antes; –1,3 MB peso muerto (commit `5dd4bc4`). Única foto del FAB en uso: `images/ALVARO_circular_ZOOM.png`
- Todo pusheado a `main` → desplegado en producción (dynamotrans.com)

### 2026-05-16 — MacBook Pro
- **Selector de idiomas**: quitado árabe 🇲🇦, añadido chino 🇨🇳 中文 (`zh-CN`) y reordenadas las 11 opciones (ES, PT, EN, ZH, FR, DE, IT, UK, RO, PL, NL); regex de cookie `googtrans` ampliada a `[\w-]+` para detectar `zh-CN` al recargar; eliminado código RTL muerto del árabe
- **Nuevo FAB de contacto** abajo-derecha: foto redonda (`images/mi-foto.jpg`) + aro verde pulsante + abanico Email/WhatsApp/Llamar con rebote escalonado; cierre por click fuera, Escape o selección; responsive y respeta `prefers-reduced-motion`
- **Eliminados** el botón flotante de WhatsApp y el asistente de chat IA completo (overlay, bot, ~226 líneas JS, CSS); conservado `@keyframes chatPop` porque lo usa el dropdown de idiomas
- Añadido `.gitignore` (excluye `.claude/settings.local.json`); todo mergeado/pusheado a `main` → desplegado en producción (dynamotrans.com)
- Detectado: **2 proyectos Vercel** sobre el mismo repo. El bueno es `dynamo-web` (tiene `dynamotrans.com`); `dynamo-web-muoi` es un duplicado huérfano sin dominio
- **Pendiente**: el usuario debe borrar el proyecto duplicado `dynamo-web-muoi` desde el dashboard de Vercel (Settings > Advanced > Delete Project). Verificar antes que NO tiene `dynamotrans.com`
- **Pendiente**: verificar visualmente el FAB en producción (foto redonda, pulso, abanico, Escape) — no se pudo probar en navegador real esta sesión

### 2026-05-04 — iMac oficina
- Añadida **música de fondo** opcional en la web (`audio/dynamo-bg.mp3`, ~6.9 MB, Pixabay royalty-free, sin atribución)
- **Botón flotante** redondo navy con icono SVG altavoz on/off, esquina inferior derecha
- Stack vertical limpio sin solapes: WhatsApp (1.8rem) → chat-fab (6.25rem) → música (11rem) → back-top (15.5rem)
- `preload="none"`: el MP3 NO se descarga al cargar la web, solo cuando el usuario pulsa el botón
- **Sin auto-resume**: cada visita arranca en silencio (estándar B2B, respeta políticas de autoplay móvil)
- Merge a `main` y push → desplegado en producción (dynamotrans.com)
- Borrada manualmente la rama huérfana `audio/dynamotrans-patch-1` (creada al subir el MP3 desde GitHub web por error)

### 2026-04-28 — MacBook Pro
- Sustituida la imagen estática del hero por un **vídeo de fondo en bucle** (`images/mp_dynamo.mp4`, 3.6 MB)
- `<video>` con `autoplay muted loop playsinline` y `poster="hero-camiones-dynamo.jpg"` como fallback si el vídeo no carga
- Mantenido el **zoom suave** (animación `heroZoom` 18s) y añadido `.hero-overlay` con velo oscuro para legibilidad del texto
- Reordenados z-index del hero: video (0) < overlay (1) < road (2) < content/scroll (3)
- Merge a `main` y push → Vercel desplegando a producción (dynamotrans.com)

### 2026-04-27 — MacBook oficina
- Sesión NO dedicada a Dynamo: el usuario está arrancando otro proyecto (web hermana con marca distinta). NO se tocó código de dynamo-web.
- Todo el contexto de ese otro proyecto se guardó en `HANDOFF-agenciadetransporte.md` (archivo aparte, NO mezclado con CLAUDE.md/TODO.md de Dynamo).
- Próxima vez que la sesión sea sobre Dynamo: ignorar ese handoff y seguir con `TODO.md` normal.

### 2026-04-25 — MacBook portátil
- Sustituida imagen del hero: nueva foto de dos camiones dynamo en autopista al atardecer con nave logística al fondo
- Optimizada de PNG 8,1 MB a JPG 341 KB (2000×1332, calidad 76, progresivo) → mejora notable de LCP
- Renombrada a `images/hero-camiones-dynamo.jpg` y eliminado el PNG original del repo
- Merge a `main` y push → Vercel desplegando a producción
- Aclarado al usuario que el error 400 `cache_control cannot be set for empty text blocks` viene de la API de Claude Code, no de la web

### 2026-04-20 — iPhone
- Ajustada ventana emergente de salida: timer 25s, scroll móvil 25+, cada mecanismo se desactiva independientemente al cerrar
- Auditoría de seguridad: añadido `vercel.json` con cabeceras de seguridad + sanitización XSS en chat bot
- Añadida info de hosting Vercel en CLAUDE.md
- Fix 404 Google Search Console: rewrite en vercel.json + arreglados 9 enlaces del footer con href="#"
- Renombrado heading "Tauliner" a "Trailer Tauliner"

### 2026-04-14 — Codespace
- Configurado GitHub Codespaces (`.devcontainer/devcontainer.json`)
- Creado `CLAUDE.md` con reglas de push-confirmation y catch-up automático
- Creado `TODO.md` para pendientes manuales
- Añadida sección de Bitácora (esta misma)
