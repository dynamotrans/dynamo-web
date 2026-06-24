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

### 8. Cambios públicos: SIEMPRE empezar desde `main`

Para evitar que cambios de la web pública se queden "atascados" solo en preview (como pasó con "Pick. Drop. Done." → logo Dynamo, que estuvo días solo en preview):

- **Cualquier cambio de web pública** (`index.html`, `vercel.json`, imágenes, SEO, copy, etc.) → **arrancar en `main`** vía rama corta `fix/<algo>` desde `origin/main`
- Mergear a `main` → push → desplegado en `dynamotrans.com`
- Después, **rebasear/mergear la rama del portal sobre el nuevo `main`** para que preview tenga también el cambio. Así nunca hay drift entre las dos webs públicas
- **NUNCA hacer cambios de web pública directamente en la rama del portal** (`claude/sharp-dirac-E3UIO`). Si se nos cuela uno por error, cherry-pick a `main` el mismo día

Razón: la rama del portal es `main + código del portal`. `git merge preview → main` arrastraría el portal a producción (prohibido). Pero `main → preview` es seguro. Por tanto el sentido del flujo siempre es **main primero, preview después**.

### 9. Tres ramas: main / preview / lab — quién contiene qué y cómo se propaga

Estructura del proyecto desde 2026-06-20 (decisión del usuario):

```
main                        → dynamotrans.com (producción pública)
claude/sharp-dirac-E3UIO    → preview (lo "estable validado", URL preview Vercel)
lab                         → sandbox experimental (URL preview Vercel propia)
```

**Inheritance**:
- `preview` ramificó de `main` con código del portal/panel encima.
- `lab` ramificó de `preview`. Contiene **TODO lo que preview tiene** + experimentos extras del usuario.

**Default working branch para Claude**: `preview` (claude/sharp-dirac-E3UIO).

**Triggers para entrar en MODO LAB** (usuario lo dice explícito; Claude hace `git checkout lab` y se queda ahí hasta que el usuario diga lo contrario):
- "vamos a lab" / "modo lab" / "entramos en laboratorio"
- "esto va en lab"
- "probamos en lab"
- Mención de feature experimental que se sabe que NO va a producción todavía (facturación con Holded, multi-rol con transportistas/proveedores, etc.)

**Triggers para SALIR DE MODO LAB** (volver a preview):
- "volvemos a preview"
- "salimos de lab"
- "modo preview"
- "esto va en preview"

**Confirmación visible obligatoria**: cada commit y cambio de rama Claude lo anuncia ("Subido a lab (`abc`)", "Modo lab activado", "Vuelvo a preview"). Si hay duda sobre qué rama tocar, preguntar antes de editar.

**Cascadas obligatorias tras merges**:

| Acción | Pasos en cascada |
|---|---|
| Cambio público merge a main | 1. main → 2. `git merge main` en preview + push → 3. `git merge preview` en lab + push |
| Promoción preview → main | 1. main → 2. `git merge preview` en lab + push (para que lab no se quede atrás) |
| Promoción lab → preview | 1. `git merge lab` en preview + push. **Después preguntar** si también va a main |
| Lab queda atrás de preview | Periódicamente `git merge preview` desde lab para que no acumule drift |

**Regla dura de lab**:
- Lab NUNCA se mergea a main directamente (siempre pasa por preview primero)
- Lab NUNCA se mergea a preview sin orden EXPLÍCITA del usuario (no asumir aunque parezca "listo")
- Cambios en lab pueden vivir indefinidamente sin promocionar — no presionar al usuario para moverlos

**Cosas que SOLO ocurren con orden explícita**:
- Promover lab → preview
- Promover preview → main
- Borrar la rama lab (nunca sin orden)

**Drift entre ramas**: si pasan >1 semana sin sincronizar, antes de cualquier operación Claude propone primero "sincronizar las tres ramas" para evitar conflictos acumulados.

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-06-24 (sesión 2) — Claude Code web (nube)

> Sesión de **estilo de las tarjetas de Servicios** (home pública). Todo web pública → `main` + cascada preview/lab.

**TARJETAS DE SERVICIOS (`index.html`, sección Servicios — Grupajes / Carga Completa / Importación / Exportación)**:
- **Chips sobre la foto** (Nacional 24h · Tráfico directo · Toda Europa · Import & Export): probado pasarlos a "negativo morado" (fondo morado translúcido + texto blanco) → **el usuario pidió revertir** → quedan como estaban (**fondo blanco glass + texto morado**). Commits `e02be9f` (morado) y `33cd392` (revert).
- **Cuerpo de texto de las 4 tarjetas → negativo morado** (a petición): fondo `var(--purple)`, título blanco, subtítulo blanco 82%, descripción blanco 88%. **Acotado con `.svc-grid > .svc-card:not(.svc-almacen)`** para NO tocar la tarjeta de Almacenamiento (que tiene su calculadora). Commit `3ec3bb1`.
- **Resaltado de títulos** — varias iteraciones hasta dar con lo bueno:
  1. Marcador verde (banda tipo rotulador) `5db2b48` →
  2. Subrayado raya verde pegado al texto `8e2c91a` → **el usuario reportó que la raya pisaba/se pegaba al subtítulo** →
  3. **SOLUCIÓN FINAL**: **barra de acento corta** (`.svc-title-hl::after`, 38×3px, degradado `var(--green)`→`#6fe6b0`, redondeada) **separada** del subtítulo (`margin-top:0.6rem`) y **animada**: se dibuja creciendo de izq→der al revelar la tarjeta (enganchada a `.reveal.active`, `cubic-bezier(.22,1,.36,1)`). Se ve también en móvil (no depende de hover). Commit `0c96a10`.
- Los 4 títulos van envueltos en `<span class="svc-title-hl">…</span>` (solo el título, no el subtítulo) para acotar el acento.

**Despliegue**: 6 commits a `main` (producción `dynamotrans.com`), cada uno con cascada `main → preview → lab`. Hubo un conflicto puntual de merge en `index.html` (el chip) al cascadear a preview, resuelto tomando la versión de main. Estado final `main 0c96a10` · `preview 38b3bb2` · `lab ca7fd9a`.

**Pendiente menor**: afinar a gusto del usuario el ancho/grosor/velocidad/color de la barra de acento si lo pide.

### 2026-06-24 — Claude Code web (nube)

> **Horario reducido de agosto** en web pública + portal.

**HORARIO REDUCIDO DE AGOSTO (6-27 de cada año): L-V 10:30-13:30** — "horario reducido · urgencias transportes":
- Nueva tabla `SCHEDULE.august` (L-V `[[10.5,13.5]]`) con **prioridad sobre el verano** (que también cubre esas fechas).
- `isAugustReduced(date)` = mes agosto y día 6-27. Automático "de por vida". Festivo 15 ago sigue cerrado; fuera de la ventana vuelve a verano 9-14.
- Etiqueta **"horario reducido"** traducida a los **13 idiomas** (`reduced` en `SCHED_VOCAB`) + `labelAug`. Aplica a chips FAB, popover, footer y modal "fuera de horario".
- Probada la lógica con casos límite (10:30 abre, 13:30 cierra, días 6 y 27 incluidos, 5/28 ago = verano). Syntax-check JS OK en los 6 archivos.
- **Web pública** (`index.html`) → producción `main` (`cec2f35`). **Portal** (las 5 páginas: dashboard/portal/registro/verificar/crear-password) replicado vía script Python → solo preview/lab (`53ea465`, merge lab `2b77c45`).

### 2026-06-23 — Claude Code web (nube)

> Continuación de la sesión de home. **Imagen de compartir (Open Graph)**.

**OG IMAGE para compartir enlace (WhatsApp, Facebook, etc.)** — web pública, a producción:
- Antes la `og:image`/`twitter:image` era el **logo cuadrado 500×500** (`DYNAMO-NEW-LOGO.png`) → WhatsApp mostraba miniatura pequeña, no preview grande.
- Generada **`images/og-dynamo.jpg`** (1200×630, JPG progresivo 196 KB) recortando la foto del hero `HERO-DYNAMO.webp` centrada en el **trailer dynamo blanco** en autopista (Pillow, crop a ratio 1.905 favoreciendo el trailer).
- Actualizadas `og:image` + `twitter:image` y añadidas `og:image:width/height/type/alt` para preview grande (`summary_large_image`). Commit `310b8df`(preview)/`44f72eb`(main), cascada lab `19fa2a1`.
- **Nota caché**: WhatsApp/Facebook cachean el preview. Refrescar vía Facebook Sharing Debugger ("Scrape Again") y/o compartir con `?v=2`. WhatsApp puede tardar días.
- **Cómo cambiarla a futuro**: sustituir `/images/og-dynamo.jpg` por otra 1200×630 JPG/PNG (no WebP) o editar las 2 metas en el `<head>`.

### 2026-06-22 (sesión 3) — Claude Code web (nube)

> Sesión de **rediseño de la home pública**. Trabajo en `preview` (claude/sharp-dirac-E3UIO) y, tras OK del usuario ("Ok todo"), **promoción a producción** por cherry-pick de los 5 commits + cascada a lab. Todo web pública, sin tocar portal.

**SERVICIOS — rediseño limpio de tarjetas (estilo carrusel)**:
- Tarjetas más finas: borde 1px, sombra suave, radio 16px. Título más ligero (peso 800 en vez de 900) con *"Nacionales e Internacional"* como **subtítulo gris en línea aparte** (antes iba pegado en el título gigante a 2 líneas, que se veía "raro").
- **Etiqueta convertida en chip flotante** (glass) sobre la imagen + velo inferior; zoom sutil de la foto al hover. Descripciones un pelín más cortas para igualar alturas. Ajustes móvil acordes. Commit `8dac181`(preview)/`cf6bdb9`(main)

**SERVICIOS — intercambio de fotos** (pedido del usuario):
- **Grupajes** → foto de carga de palets en tauliner (la que tenía Carga Completa, `FOTO 1`).
- **Carga Completa** → foto del hero con el trailer Dynamo (`HERO-DYNAMO.webp`), encuadrada con `object-position:34%` para que el trailer se vea completo en la tarjeta. La vieja `transporte-tauliner.jpg` queda sin usar. Commit `fc90776`/`970bb37`

**REESTRUCTURA DE LA HOME**:
- **Cobertura** (sección "Nuestra cobertura · España y Europa" CON su mapa interactivo) **movida a justo después de Servicios** (antes estaba antes del CTA). Una sola sección, sin duplicar.
- **Almacenamiento corta estancia** sacado del grid de Servicios a su **propia sección** (`.almacen-sec`, fondo blanco), colocada al final **antes de "Por qué elegirnos"**. Servicios queda con 4 tarjetas limpias. Commits `1fae8bb`/`21b5d51` y `cc4a42a`/`73151c2`
- La sección de Almacenamiento lleva **encabezado propio** (eyebrow "Servicio adicional" + título "Almacenamiento corta estancia" + descripción), estilo "Nuestra flota / Tipos de Vehículo". Se quitaron el título y la descripción que estaban DENTRO de la tarjeta para no duplicar.

**MENÚ (nav desktop + móvil)** — reescrito a 7 enlaces en este orden: **Clientes · Testimonios · Servicios · Cobertura · Vehículos · Almacenamiento · Contacto**. Añadidos retardos de animación para ítems 6-7 del menú móvil. **Quitado "Nosotros"** del menú (la sección *Por qué elegirnos* sigue existiendo, solo que ya no se enlaza). Commit `2b86c28`/`5fd739d`

**Orden final de la home**: Hero → franja chips → carrusel logos → cifras → Clientes (muro) → Testimonios → **Servicios** → **Cobertura (mapa)** → Tipos de Mercancía → Seguridad → Vehículos → **Almacenamiento** → Por qué elegirnos → CTA.

**Despliegue**: los 5 commits cherry-pickeados a `main` (`cf6bdb9`→`5fd739d`) → producción `dynamotrans.com`. Cascada `preview → lab` (merge `41aad6b`). Las 3 ramas sincronizadas.

**Pendiente menor**: si el usuario quiere "Nosotros" de vuelta en el menú, reañadir. El eyebrow "Servicio adicional" de Almacenamiento es provisional (se puede cambiar a "Servicio de almacenaje" u otro).

### 2026-06-22 (sesión 2) — MacBook Pro

> Sesión de pulido de la **web pública** (home) + arreglo de fondo de los **horarios multilingües** en web y portal. Todo lo público a `main` por cherry-pick + cascada a preview/lab; el portal solo en preview/lab.

**WEB PÚBLICA (`index.html`, a `main`)**:
- **"Nacionales e Internacional" sin negrita** en las tarjetas de Grupajes y Carga Completa (la primera palabra del título sigue en negrita; el resto normal). Commits `d42b779`→`1ec4043`
- **Reordenado de secciones de la home** (en 2 peticiones): orden final → Servicios → **Tipos de Mercancía → Seguridad y Confianza → Tipos de Vehículo → Por qué elegirnos → Cobertura (España y Europa)** → CTA. Commits `dd51ee3` y `508b335`
- **Rediseño de la sección de cifras (stats)**: primero se probó banda morada con tarjetas glass (`3ea939c`), pero "pesaba mucho / todo muy morado" → versión final **clara y fina**: fondo gris suave, tarjetas blancas con borde finísimo, números en morado solo como acento, estrellas doradas, hover sutil, compacto en móvil (2×2). Commit `45f12fe`

**HORARIOS MULTILINGÜES — arreglo de raíz (web pública `main` + portal preview/lab)**:
- **Problema (reportado por el usuario)**: con la web en catalán/portugués/etc., los horarios del FAB del avatar y del modal "Fuera de horario" salían en español o mal traducidos (Google traducía "L-S" → "Monday to Friday" en vez de Saturday, o dejaba "LS 8-20" sin traducir).
- **Causa real**: (1) los chips del FAB usan `content: attr(data-hours)` en CSS → Google Translate **nunca** traduce contenido CSS; (2) el texto inyectado por JS tampoco se retraduce fiable; (3) abreviaturas de día (L-S, L-J, y "Mar"=sea) confunden al traductor.
- **Solución**: generamos las etiquetas **nosotros** en el idioma activo (cookie `googtrans`) con diccionario de **13 idiomas** (`SCHED_VOCAB` + `buildLabels`) marcadas `.notranslate`. Días en **palabra completa** (decisión del usuario). Salen siempre correctas (Lunes a Sábado / Monday to Saturday / Dilluns a Dissabte…). Commits `0018991`→`93e9a66`
- **Cambio de idioma en caliente**: Google traduce sin recargar → las etiquetas se quedaban en el idioma anterior. Refactorizado a función global `applyScheduleLabels(lang)` que se **re-ejecuta desde `doTranslate`** en cada cambio (actualiza FAB, chips y modal). Commit `8e7da54`
- **Semana Santa**: nuevo horario reducido **Lunes a Miércoles Santo 9:00–14:00** (calculado solo cada año desde la Pascua). Jueves y Viernes Santo siguen festivo (cerrado). Web + portal
- **Bonus — bug corregido**: un `perl` anterior corrupió "Sábado" → "SÃ¡bado" (mojibake UTF-8) en los 5 archivos del portal. Arreglado con `perl -Mutf8`
- **Portal (preview/lab)**: mismo arreglo en las 5 páginas (`dashboard`/`portal`/`registro`/`verificar`/`crear-password`) vía script Node. Syntax-check JS de los 6 archivos sin errores

**Aclarado al usuario**: en portugués el sábado es **"Sábado"** igual que en español (coincidencia), así que "Segunda a Sábado" es correcto.

**Confirmado que los horarios son automáticos "de por vida"**: temporadas (verano, Navidad, Feria y Semana Santa por Pascua) + festivos nacionales se recalculan en cada carga con hora real `Europe/Madrid` (DST). **Pendiente opcional**: faltan festivos **autonómicos (Andalucía) y locales de Sevilla** (solo están los nacionales).

### 2026-06-22 — (sesión web / Claude Code en la nube)

> Sesión larga. Cambio de criterio de ramas (lo pide el usuario): **trabajar SIEMPRE en `preview`** por defecto; los cambios públicos se llevan a `main` por **cherry-pick** del/los commits (nunca merge de preview entero, para no arrastrar el portal). El portal (`dashboard.html` etc.) **no va a `main`** (regla 7 reconfirmada en vivo).

**Arranque**:
- Reconstruidas las entradas **20 y 21 de junio** desde git (el chat anterior se colgó sin escribir bitácora). Aclarado al usuario que solo persiste lo commiteado + lo escrito en CLAUDE.md/TODO; no puedo leer otros chats salvo que los pegue.

**WEB PÚBLICA (`index.html`, a `main` por cherry-pick + cascada a preview/lab)**:
- **Carrusel de reseñas en bucle continuo** — varias iteraciones hasta dejarlo perfecto: (1) las cards `.reveal` (opacity:0) duplicadas quedaban invisibles → blanco; (2) duplicación insuficiente en pantallas anchas; (3) velocidad por px/s; (4) salto al hacer scroll en móvil (resize por barra de URL → ignorar cambios de alto); (5) parpadeo del reinicio. **Solución final**: reescrito con `requestAnimationFrame` + **reciclado de cards** (la que sale por la izq. se recoloca al final) → sin reinicio, sin salto, sin blanco. Velocidad 140 px/s, pausa al hover, respeta reduced-motion. Commits a main `c68c1e5`
- **Países unificados con el mapa de cobertura**: Exportación, tarjeta "Cobertura" y structured data (areaServed) → fuera Irlanda y Dinamarca, dentro República Checa. Mismo criterio que el mapa. Commit a main `82669ce`
- **Emojis → iconos SVG profesionales** (línea, color de marca) en Tipos de Mercancía, Por qué elegirnos, Seguridad/Confianza y mini "España y Europa". Banderas del selector de idioma y glifos ★/⚠/✕ se mantienen (no son emoticonos). Commit a main `d06ae09`

**PANEL / PORTAL (`dashboard.html` + páginas portal, SOLO preview + lab)**:
- **Pestaña "Programadas"** (total = pendientes + confirmadas) como primera y activa por defecto
- **Copys**: caja Nueva carga → "Solicita un transporte" (sin "tarifa cerrada"); quitado "precio cerrado" del flujo Generar carga; quitada la frase "El equipo confirma… 25 minutos / lee primero avisos" del paso de confirmación
- **Anti-zoom iOS**: `maximum-scale=1.0` en viewport de portal.html, dashboard.html, registro/verificar/crear-password → al tocar campos ya no hace zoom ni descuadra. (No se tocó index.html)
- **Tamaños móvil** del dashboard subidos (buscador, selector de mes, tablas) para legibilidad, manteniendo buscador+mes en una fila
- **Cargas con fecha a >7 días → fila en gris claro** (atenuada, menos urgente). Escala: RETRASADA/HOY/MAÑANA/PASADO MAÑANA resaltadas · 3-7 días normal · >7 días gris

**Aclarado sobre presupuestos**: no llevan fecha de carga, solo fecha de generación (ya era así en datos/tabla/detalle). El campo "Ventana de carga" se queda (sirve para calcular precio)

**Limpieza**: rama suelta `fix/carrusel-resenas` borrada en local; el remoto **no se pudo borrar** (el entorno devuelve 403 al borrar ramas) → el usuario puede borrarla desde GitHub si quiere

**Pendiente**: el usuario decidió **no** publicar el portal a `main` (filas gris se quedan en preview+lab). Sigue en pie publicar el portal "dentro de unos meses" con frase explícita

---

### 2026-06-21 — (reconstruida desde git — chat original se quedó pillado)

> ⚠️ Esta entrada se reconstruyó el 2026-06-21 a partir del historial de commits porque el chat de esos días se colgó antes de escribir bitácora. Refleja lo que dicen los commits; si hubo decisiones habladas no commiteadas, no quedaron registradas.

**MODELO DE 3 RAMAS (decisión grande del día)** — `regla 9` añadida a `CLAUDE.md`:
- `main` → producción (`dynamotrans.com`) · `claude/sharp-dirac-E3UIO` → **preview** (estable validado) · `lab` → sandbox experimental
- `preview` es la rama de trabajo por defecto de Claude. `lab` ramificó de preview (todo preview + experimentos). Cascadas de merge documentadas (main→preview→lab) (commit `2408bab`)

**WEB PÚBLICA (a `main`)**:
- **Orden de contacto unificado a Email · WhatsApp · Teléfono** en toda la web pública (`eb91f89` → `4904e04` → merge `d6d63da` a main, luego `5ab231b` sync main→preview)

**PANEL — Dashboard de Cargas (preview)**:
- **Pestañas reorganizadas en pendientes / confirmadas** (`53bc9ac`)
- **Cargas RETRASADAS destacadas**: Programadas con fecha pasada se marcan como retrasadas (`4a67bb0`); chip muestra "Hace X días (queda Y días)" (`189255a`); en-ruta con ETA pasada se marca y label "Pendiente Asignar" (`c66f6e5`)
- **Modal Ver detalle**: acciones colocadas arriba + scroll reseteado al abrir (`8f30eec`); fix acciones por estado que volvían a aparecer (`e3599af`)
- **Cobertura**: quitado duplicado del mapa de Europa antes de "Por qué elegirnos" (`7da1a14`)

**LAB**: sincronizada con preview vía commits "Sync: preview → lab" (tabs, chip retrasada, Pendiente Asignar, RETRASADA, acciones modal, duplicado cobertura, orden contacto)

---

### 2026-06-20 — (reconstruida desde git — chat original se quedó pillado)

> ⚠️ Reconstruida desde commits el 2026-06-21 (chat colgado). Día muy intenso en el **dashboard de Cargas** del panel.

**PANEL — Dashboard (preview)**:
- **Stat cards**: "Cargas activas" calculada en vivo (`b7ab12a`); las 3 stat cards se mantienen en una fila en todos los tamaños (`d29e419`)
- **Facturas retiradas del panel de momento** → se reactivarán en fase 2 con Holded (`5b132e2`)
- **Filtros simplificados** a buscador + selector de mes/año, en la misma fila siempre (`3719ed5`, `725eda8`); selector "Mostrar 10/20/50/100" ya existía
- **Cargas — sistema de estados y asignación de transportista (pieza grande del día)**:
  - Detalle completo en tabla y modal: precio, fecha asignada, ETA, conductor… (`3f793ca`)
  - Estado de asignación de transportista en cada fila (`d43b32d`); tabla muestra fecha asignada + tipo carga/camión/matrícula (`006ada0`); "Transportista asignado" separado de la matrícula del camión (`c2a2670`)
  - **Estado dinámico por hora** el día de carga + ejemplos en mock (`732ef2c`); ejemplos mock para cubrir todos los estados de asignación, incluido Programada >4 días sin transportista = "En espera" (`8f758d0`, `4c35b33`)
  - **Paleta progresiva de estados** (slate → cyan → amber → blue → green) (`7f81af5`); color (business) desacoplado de etiqueta (calendario literal) (`58fbef1`); quitada la leyenda de progresión bajo las pestañas (`895a779`)
  - **Orden de pestañas** por fecha de carga efectiva ASC; Entregadas en DESC (más reciente arriba) (`2beb228`, `4cc0e09`)
  - Semilla "hoy" salta a próximo lunes si cae en fin de semana (`fb2371f`)
  - Filas clicables → abren "Ver detalle" (`267f872`); botón ⋯ eliminado de las filas (acciones viven en el modal) (`b4d5a5e`); acciones contextuales en el footer del modal (`c009afd`)
- **Tarifador en el panel principal + "PASADO MAÑANA"** → **probado y REVERTIDO** el mismo día (`fed065f` → revert `43d37af`). Quedó solo el rename de chip "PASADO" → "PASADO MAÑANA" (`ae3fb51`) y placeholder en fecha + tooltip en Previsión (`0522177`)
- **CESCE**: simplificado a sólo estado de cobertura sin importes (`8837b57`); se puede alternar estado vía `?cesce=ok|warn|none` para pruebas (`2fde2d3`)
- **Limpieza visual**: emojis → iconos SVG planos en modal/timeline/menús (`c6eee6a`, `405852b`); igualado ancho de las 3 cajas Nueva carga/Nuevo presupuesto/CESCE (`26b8c8f`); quitado el cartel de temporada del dashboard (`6c7d576`); fix espacio vacío al final en móvil (`f9386ac`)

**WEB PÚBLICA (a `main`)**:
- **Selector de provincia de "Almacenamiento corta estancia" bloqueado** (`b993efb` → merge `7f5ca8f` a main, mergeado a preview `dc64e4f`)

**DOCS**: stack del backend registrado en `TODO.md` — **Supabase + Postmark + WhatsApp + naming** (`49efe64`)

**Pendiente arrastrado**: afinar tabla de coeficientes del tarifador con valores exactos del cliente; quitar defaults SEV→MAD antes de producción.

---

### 2026-06-19 — iPhone (TARIFADOR INTERNO DEL PANEL)

> Día completo dedicado al **tarifador / generador de cargas del panel cliente**. Todo en preview (`claude/sharp-dirac-E3UIO`). En `main` solo entran un par de fixes públicos al principio del día.

**WEB PÚBLICA (`index.html`, en `main`)** — sync con preview:
- **Sector "Industria y Construcción"** — texto extendido: "Textil, manufacturera, muebles, automoción, farmacéutica, estructuras, áridos, fertilizantes, abonos. Materias primas: plástico, madera, aluminio, acero…" (commit `ddade90` → merge a `main`)
- **Selector de idiomas unificado** entre web pública, panel y 4 páginas del portal. Producción tenía 11 idiomas en orden distinto; panel tenía 13 (incluyendo Català + Euskara) en otro orden. Ahora los 6 HTML (index + portal + registro + verificar + crear-password + dashboard) comparten la misma lista en el mismo orden: ES, CA, EU, PT, EN, FR, DE, IT, NL, PL, RO, UK, ZH (commit `accf1b4` → merge `c361aa4` a `main`)
- **"Pick. Drop. Done." → logo Dynamo** en "Por qué elegirnos": el cambio llevaba días solo en preview, ahora también en producción (commit `a2fa156` → merge `4d7b3cb` a `main`)
- **Regla 8 en CLAUDE.md**: cambios públicos siempre arrancan en `main` vía rama corta para evitar drift entre web pública en preview/main. Codificado tras el incidente del logo (`17679cf` a `main`, mergeado a preview)

**PANEL CLIENTE (`dashboard.html`)** — sesión grande, todo en preview:

- **Fila superior unificada** `dash-top-row` (3 cols): Nueva carga + Nuevo presupuesto + **CESCE** en la misma horizontal, también en móvil (3 cols con CTAs verticales en pantallas pequeñas). CESCE quedaba más bajo por padding/radio distintos → unificados a 1.3/1.5rem y 14px para casar visualmente (commits `51a6f18` + `c7f2efc`)
- **Avatares JG unificados**: sidebar/topbar/dropdown tenían 3 gradientes distintos. Todos a `linear-gradient(purple → green)`. Tamaños sí siguen distintos por contexto (32/34/42px) (`34ef702`)
- **TARIFADOR / GENERADOR DE CARGAS** — pieza enorme. Reemplaza placeholders de "Nueva carga" y "Nuevo presupuesto" con un formulario completo:
  - **Campos**: origen + destino con autocomplete OSM Nominatim, tipo camión (Tauliner / Rígido) con tooltip de especificaciones, tipo mercancía (10 opciones), metros lineales y peso reactivos al camión elegido, fecha de carga (próximos 7 laborables + Flatpickr para "Otro día"), ventana de carga, tu referencia interna (opcional), anotaciones libres con contador 1000 chars
  - **Flatpickr** cargado desde CDN (esquinas redondas, fines de semana en gris tachados, locale español)
  - **Validación**: origen + destino obligatorios con bordes rojos + aviso bajo el formulario
  - **Botón Reiniciar** (↻) en esquina sup-derecha que vuelve a defaults
  - **Defaults de prueba** (BORRAR EN PRODUCCIÓN): origen Sevilla 41001 + destino Madrid 28001 pre-rellenados con lat/lon hardcoded. Marcado en código con `=== DEFAULTS DE PRUEBA ===` para encontrarlo
- **"Programado sin fecha definida"**: opción del select de fecha (solo en Nueva carga) que guarda la carga como previsión sin compromiso. Cartel amarillo bajo el campo cuando está seleccionada: "Previsión, no se tramita: la carga queda en estado Programado sin fecha y no se asignará camión hasta que confirmes una fecha. Si la fecha definitiva es posterior a 7 días, el precio se revisará a precios de mercado actuales cuando se asigne fecha."
- **Nuevo presupuesto sin campo de fecha**: solo "Ventana de carga". Un presupuesto es cotización, no programación
- **Etiquetas de ventana actualizadas**: `±2 días` → `1 a 2 días`, `±4 días` → `1 a 4 días`, label "Ventana" → "Ventana de carga". Hint debajo: "Días laborables consecutivos a partir del día indicado. Sábados, domingos y festivos quedan excluidos automáticamente." Default sigue siendo "1 a 2 días"
- **Flujo de 2 pasos para Nueva carga (con fecha)**:
  - **Paso 1**: formulario completo. Submit → validación
  - **Paso 2**: panel de confirmación con: aviso azul condicional de GRUPAJE (solo si ml < máx camión, en carga completa se omite); párrafos legales "Disponibilidad y ajustes de tarifa" + "Garantías y confirmación"; resumen del transporte (incluyendo % carga del camión); enlace a "Condiciones generales de transporte"; botones "← Editar datos" / "Confirmar carga"
  - **Confirmar carga** → modal con aviso de cancelación (después de las 9:00 AM del día hábil anterior se factura el servicio completo). Solo entonces se inserta en CARGAS_DATA
  - **Excepción**: si la carga es "Sin fecha" (Previsión), se salta TODO el paso 2 → guarda directo en Previsión. No tiene sentido enseñar avisos legales si no hay compromiso. Cuando luego se edite una Previsión para asignar fecha, ahí sí disparará el flujo legal (TODO al cablear el editor)
- **Condiciones generales** consolidadas en un `<template>` que se inyecta en el modal. Texto largo del cliente venía duplicado (8h aceptación ×2, Medios comunicación ×2, etc.) → unificado en 12 apartados numerados sin perder cláusulas
- **Pestañas de "Cargas" reorganizadas** + bugfix:
  - Antes: Todas / Programadas / En ruta / Entregadas / Sin albarán / Canceladas
  - Ahora: **Programadas / Previsión / Cargando hoy / Entregadas / Canceladas / Todas**
  - Previsión = kind 'programada' AND fecha='Sin fecha'
  - Cargando hoy = renombrado de "En ruta"
  - "Sin albarán" eliminada (el chip 📄 al lado del estado sigue)
  - Default activo: Programadas (antes Todas)
  - **Bug fixed**: el código ponía `filter='programadas'` (con s) al crear una carga → no coincidía con ningún tab → tabla vacía. Ahora 'programada' o 'prevision' según fecha
- **ETA de entrega (estimación)** — campo nuevo debajo de Ventana de carga:
  - Captura lat/lon de Nominatim al pickear del autocompletado (data-lat/data-lon en el wrap)
  - Distancia = Haversine × 1.25 (factor de carretera vs línea recta)
  - Tracción = ceil(km / 600). Configurado a 600 km/día (horario 7-18h, ~9h conducción real)
  - addBusinessDays() suma días saltando sábados y domingos
  - Si ventana > 1 día → rango "del jueves 2 jul al martes 7 jul" (no "X — Y" porque inducía a leer como 2 fechas alternativas en vez de rango continuo, fix `2289b30`)
  - Caja con borde gris claro + hint con la metodología
  - En presupuesto sin fecha, ETA muestra solo duración tránsito ("2 días tras la carga")
- **Tabla de coeficientes de % carga del camión** (cierra TODO del 2026-06-10):
  - Función `coefMl(ml, camion)` con tabla escalonada (aproximación basada en lo que pasó el cliente: 0.8ml=25%, 1ml=33%, ..., 10.4ml=100%) — los valores intermedios son una interpolación razonable, AFINAR cuando llegue la tabla exacta del cliente
  - `coefTn = tn/maxTn` y `coefPalets = palets/maxPalets` (estimado 2.5 europalets por ml)
  - **% mostrado = max(ml, tn, palets)** — refleja el factor que MÁS limita, no la suma
  - UI: barra horizontal animada con gradient (verde <70%, amarillo 70-99%, morado 100%) + texto "65% ocupación · limitado por palets · 6 m · 15 europalets · 18 Tn"
  - También aparece en el paso 2 (resumen de confirmación)

**Lecciones del día**:
- Cuando un rango temporal incluye fin de semana, **siempre escribirlo como "del X al Y"** y no "X — Y". El segundo se interpreta como 2 fechas alternativas en lugar de rango continuo
- La rama del portal (`claude/sharp-dirac-E3UIO`) tiene su propia versión avanzada de `portal.html`. Al cambiar de rama (ej. crear `fix/lang-selector-sync` desde main), git muestra portal.html como "modificado" — es normal, son archivos distintos en cada rama, NO revertir

**Commits del día (preview)**: `d45e66a` materias primas · `6871cc9` lang sync · `49e32e5` merge main · `51a6f18` dash-top-row · `c7f2efc` CESCE altura · `34ef702` avatares · `1f6aca6` Programado sin fecha + Presupuesto sin fecha · `8828ae9` flujo 2 pasos + condiciones · `9ce3628` pestañas Programadas/Previsión/etc + grupaje condicional · `df90c88` skip avisos en previsión · `caa05ba` 1 a 2 / 1 a 4 días + hint · `7b9b25e` ETA + defaults SEV→MAD · `073a51f` coeficientes % carga · `2289b30` ETA wording "del X al Y"

**Commits a `main`**: `accf1b4`/`c361aa4` lang selector · `a2fa156`/`4d7b3cb` logo Dynamo en "Por qué elegirnos" · `17679cf` regla 8 CLAUDE.md

**Pendientes detectados** (van a TODO.md):
- **Editor de cargas con flujo legal al asignar fecha a una Previsión** — sesión dedicada cuando el usuario lo pida. Es muchos estados (ver detalle, editar, asignar fecha, validar fecha, disparar paso 2 del flujo legal, etc.) y prefiere ir verificando estado por estado
- **Quitar defaults SEV→MAD del tarifador** — antes de producción. Marcados con `=== DEFAULTS DE PRUEBA (BORRAR EN PRODUCCIÓN) ===` en código
- **Afinar tabla de coeficientes** con los valores intermedios exactos del cliente (entre 25% y 100%). Lo que está ahora es una aproximación funcional

### 2026-06-15 a 2026-06-18 — iPhone (sesión maratoniana de PANEL CLIENTE)

> Cuatro días de iteración intensa centrada en el **dashboard del cliente** + cleanup de la web pública. Documentado en bloque por la cantidad de trabajo.

**DASHBOARD CLIENTE (`dashboard.html`)** — pieza más grande, todo en preview:

- **Layout y navegación**:
  - Topbar **morada** (gradiente `purple → purple-light`) con **logo Dynamo blanco** (`images/4.png`) + **🏠 casita** unificados a la **izquierda** como UN solo botón → vuelve al Dashboard al pulsar
  - Quitado el nombre de sección del topbar (ya está como `<h2>` dentro de cada página)
  - Avatar JG a la derecha como `<button>` con flecha ▾ y menú desplegable: **Mi cuenta · Datos de empresa · Soporte · Idioma · Modo oscuro · Cerrar sesión**. Cabecera con email + badge "Cliente"
  - Sidebar navy con Dashboard/Cargas/Presupuestos/Facturas/Incidencias. Mobile: oculta detrás de hamburguesa
  - 4 stat cards del top **clickables** → llevan a su sección. CTAs grandes **Nueva carga / Nuevo presupuesto** movidos al inicio del panel
  - Card CESCE compactada (padding 1.4 → 0.9, total 2 → 1.5rem, barra 8 → 6px)
  - Botón **⬆ volver arriba** abajo-derecha con margen generoso (2rem desktop / 1.6rem móvil + `env(safe-area-inset-*)`) y se oculta cuando el FAB del avatar está abierto

- **Sistema de modales + acciones por fila** (cargas, presupuestos, facturas):
  - Modal genérico (`openDashModal({icon,title,sub,body,footer})` + `closeDashModal()`) con backdrop blur, card animada, header con icono, body + footer
  - **`downloadFakePDF(filename)`** genera un PDF mínimo válido con título → albaranes, presupuestos y facturas se descargan de verdad
  - **Cargas** (según `kind`):
    - 📋 Ver detalle (info grid completa + botón Editar → form de contactos + anotaciones + Guardar)
    - 🔁 Repetir: warn-box + datos prefilados + selector fecha y ventana; texto explícito de que el precio se recalcula (tarifador)
    - ⚠️ Reportar incidencia: info + textarea + drop de ficheros (JPG/PNG/PDF) con contador
    - 📍 Seguimiento (en-ruta): timeline con 4 eventos mock
    - ✕ Cancelar carga (programadas): confirmación con warn-box + textarea motivo + botón rojo
  - **Presupuestos**:
    - 📋 Ver detalle (incluyendo el precio)
    - 🚚 Generar carga (Vigentes): warn-box "precio del presupuesto", selector fecha
    - 🔁 Revisar precio (Caducados): warn-box "precio se recalcula", fecha estimada
    - 📥 Descargar PDF: archivo `Presupuesto-PXXXX.pdf`
  - **Facturas**: Ver detalle + botón Descargar PDF en el footer del modal
  - `actionFromText()` reconoce el texto del item y `dispatchRowAction(action, row, sectionId)` ejecuta el handler correcto

- **Dropdown ⋯ por fila — portal pattern**:
  - El popup se trasladaba al `<body>` con `position: fixed` al abrirse para escapar del `overflow:hidden` de la tabla (clipping en las últimas filas)
  - Posición calculada por JS via `getBoundingClientRect()`, debajo del botón o encima si no cabe
  - Reposición en scroll/resize (capture: true) con rAF. Cierra al click fuera, click en item, Escape, o si el botón se sale del viewport

- **Listas paginadas con datos ficticios** (gran refactor):
  - **28 cargas**, **19 presupuestos** y **38 facturas** definidas en arrays JS (refs reales `#C-2026-1XXX`, `#P-2026-0XXX`, `F-2026/0XXX` + ref clientes `PED-XXXX` / `COT-XXX`)
  - **TABLE_STATE** `{ page, filter, perPage: 10 }` por sección
  - **Tabs como filtros**: `data-table` + `data-filter` cablean al render. Contadores dinámicos `data-count="X"` por tab
  - **Paginación**: renderer dinámico con máximo 6 botones visibles + saltos `…` cuando hay muchas. Prev/Next funcionando
  - **Albarán** — flujo completo: campo `hasAlbaran` en cada carga. Etiqueta 📄 al lado del estado si tiene PDF. Tab "**Sin albarán (N)**". Acciones según fecha:
    - Con albarán → "📥 Descargar albarán"
    - Sin albarán + **<14 días**: "⏳ Albarán procesándose…" (disabled, tooltip "Disponible al cabo de 14 días")
    - Sin albarán + **≥14 días**: "📩 Reclamar albarán" → modal que reclama al transportista (umbral subido de 1 día → 14 días para no agobiar a transportistas)
  - 2 entregas dinámicas añadidas (hoy + ayer) para que se vea el estado "Procesándose" independientemente de cuándo se mire

- **Horarios sincronizados con web pública**:
  - **SCHEDULE** completo copiado de `index.html` (winter/summer/feria/xmas + festivos nacionales + Semana Santa via Computus de Gauss). Zona Europe/Madrid con DST
  - **Chips data-hours** en el FAB del avatar con `data-sched-attr` (phone-short / online-short) — texto cambia por temporada activa
  - **Interceptor global de `tel:`** — en horario llama directo, fuera de horario abre modal "Fuera de horario" con WhatsApp + email + "Llamar igualmente"
  - **Cartel de temporada** (`.season-banner`) en lo alto del contenido: ☀️ verano (amarillo) / 🌹 feria (naranja) / 🎄 navidad (verde) / 🏛️ festivo (rojo). Solo visible cuando aplica
  - "Horario de atención" del menú **Soporte** conectado al SCHEDULE via `data-sched` (se actualiza con la temporada)

- **Selector de idiomas funcional** (estaba solo persistiendo en localStorage):
  - Mismo motor de Google Translate que portal/index, cookie `googtrans` compartida en `path=/`
  - Si eliges inglés en `dynamotrans.com` y entras al panel, el panel ya viene en inglés (sync vía cookie)
  - **Catalán + Euskera** añadidos al panel, `portal.html`, `index.html` (códigos GT `ca` / `eu`). Como no hay emoji flag oficial para CCAA, placeholders 🟡 / 🟢
  - Menú se cierra automáticamente al elegir idioma

- **Avatar FAB** (foto de Álvaro circular + abanico email/WA/llamar) **añadido a TODAS las páginas del portal**:
  - `portal.html`, `registro.html`, `verificar.html`, `crear-password.html`, `dashboard.html`
  - Mismo patrón visual que la web pública (halo verde pulsante, chip con nombre al abrir, rebote escalonado)
  - En el dashboard el botón ⬆ back-top se reposiciona **encima del avatar** y se oculta con `.fab-hidden` cuando el FAB se abre

- **Modo oscuro** del panel: toggle pill switch con `localStorage.dashTheme`. Cubre topbar, sidebar, stat cards, tablas, menús. Topbar mantiene su gradiente morado en dark (un poco más oscuro) para no perder identidad

- **Mockup login bypass**: `portal.html` ahora acepta cualquier email + contraseña y navega a `dashboard.html`. Texto del badge: "Modo demo · acceso libre para probar". Inputs editables, submit clickable. `crear-password.html` al terminar el flujo passwordless redirige también a `dashboard.html` (antes mostraba "Tu cuenta está casi lista")

- **Responsive y estabilidad**:
  - **Pestañas (Programadas / En ruta / Entregadas…)**: `touch-action: pan-x` + `overscroll-behavior-x: contain` + `scroll-snap-type: x proximity`. Antes temblaban verticalmente al hacer swipe horizontal en móvil
  - **Tablas no se diluyen**: `.content { max-width: 1400px; margin: 0 auto }` en pantallas anchas; `table.data { min-width: 720px desktop / 680px tablet / 620px móvil }` (era 900px)
  - **Cinturón anti-overflow horizontal**: `html { overflow-x: hidden }` (no body), `* { min-width: 0 }`, `.tabs` y `.table-wrap` con scroll interno con `overscroll-behavior-x: contain`
  - **Mobile fixes** en `portal.html` / `registro.html` / `verificar.html` / `crear-password.html`: `viewport-fit=cover` + `theme-color` + `min-height: 100svh` + `padding-bottom: env(safe-area-inset-bottom)` + `overscroll-behavior-y: contain` para evitar la "franja morada" al final del scroll en iOS Chrome con barra inferior (causa: el theme-color de index.html quedaba cacheado en la barra inferior)

- **Decisión Holded para facturas** (sin nombrarlo en UI):
  - El portal NO permite emitir/modificar/anular facturas. Solo lectura + descarga PDF. Toda acción editable ocurre en Holded
  - **IMPORTANTE — nunca mencionar "Holded" en la UI del cliente** (ni notas, ni tooltips, ni meta). Quitado el cartel "Sincronizado desde Holded" que había puesto inicialmente. El cliente no debe saber qué herramientas internas usamos
  - Quitados de las acciones de cada factura los botones "Marcar como pagada" y "Pagar ahora" — solo quedan "Ver detalle" y "Descargar PDF"

**WEB PÚBLICA (`index.html`, en `main` → producción)** — cleanup y fix:

- **Quitado todo rastro del portal de la web pública** (decisión definitiva):
  - 315 líneas eliminadas: botón ACCESO del nav desktop, botón Acceso del menú móvil, 🔒 Acceso del footer, prefetch `portal.html`, HOME ARRIVAL OVERLAY HTML+CSS, PORTAL TRANSITION OVERLAY HTML+CSS, script `<head>` de detección de regreso, función `goToPortal()`, handlers pagehide/pageshow del wormhole, todas las clases CSS `.portal-*`, `.home-arrival*`, `.from-transition`, `.btn-nav-cta`, `.mm-cta-access` y 5 animaciones
  - `portal.html` sigue accesible escribiendo la URL directamente (en producción es el mockup bloqueado original). El preview mantiene TODO intacto para seguir desarrollando privado
  - Cuando el usuario diga literalmente "publica el portal", se promueve a producción
- **Cobertura España y Europa** movida **después de "Tipos de mercancía"** (antes estaba entre Testimonios y Servicios). Flujo: qué transportamos → dónde llegamos
- **"Pick. Drop. Done."** en "Por qué elegirnos" sustituido por el **logo Dynamo color** (`images/2.png`) con tamaño clamp 46-70px
- **Franja blanca al final del scroll en móvil** arreglada: `overflow-x: hidden` movido de `body` a `html` (así el scroll vertical sigue en window y no se desborda) + `overscroll-behavior-y: none`
- **Catalán + Euskera** añadidos al selector de idiomas también en producción

**Commits del día en `main`** (vía ramas cortas):
- `12cc22d` (merge `fix/white-space-mobile` con `d244aef`): fix franja blanca móvil
- `be08ff2` (merge `chore/hide-portal-from-public` con `98a0516`): quitar todo rastro del portal de la web pública

**Cantidad total**: ~25 commits en preview (`claude/sharp-dirac-E3UIO`) + 2 merges a `main`. Todos los commits con author/committer `Claude <noreply@anthropic.com>` (firma SSH no disponible en el entorno → GitHub los marca Unverified, no afecta la validez)

**Pendientes detectados** (van a TODO.md):
- **Horarios sincronizados en páginas de login** (portal/registro/verificar/crear-password): solo está en dashboard.html. Las login pages tienen FAB pero sin chips de horario ni phone modal. Falta replicar el SCHEDULE + interceptor + modal a esas 4 páginas
- **Reclamar albarán backend**: cuando exista Supabase + n8n, el endpoint debe disparar un email/WhatsApp automático al transportista
- **Filtros backend para listas**: los filtros actuales del panel son frontend (mockup). Cuando exista Supabase los listados se filtran server-side con paginación real
- **Holded API integration**: token API en backend, endpoints listado + GET PDF, refresco periódico (cron o webhook si Holded lo soporta). NUNCA mencionar Holded en la UI
- **Roles en el portal**: el `registro.html` actual fuerza `tipo_usuario=cliente` (hidden). Convertir a selector cuando se habilite transportista/proveedor
- **Tabla de coeficientes en tarifador** (arrastrado de bitácora anterior): cálculo de % carga del camión en vivo según `max(coef_ml, coef_tn, coef_palets)`

### 2026-06-12 y 2026-06-13 — iPhone (sesión maratoniana)

> Dos días seguidos de iteración intensa. Documentado en bloque por la cantidad.

**TARIFADOR EN EL HERO (lo grande de estas sesiones)**:
- Tarifador completo en el hero (preview + producción) con: autocomplete OSM/Nominatim para origen/destino (gratis sin API key, debounce 350ms, 11 países EU), selector de camión, selector de mercancía (10 categorías operativas), selectores de metros lineales y peso DEPENDIENTES del camión (Tauliner 1..10+13,2 ml / 1..24 Tn; Rígido 1..8 ml / 1..14 Tn), conversión palets en vivo (2,5 europalets/ml, 2 americanos/ml — correcto según el cliente), Flatpickr para calendario con esquinas redondeadas + fines de semana en gris tachados + rango hoy..+3 meses
- **Flujo de UX iterado MUCHAS veces**: paso de "Calcular precio + 2 botones desplegando" a probar bottom sheet con position:fixed y overlay (FALLÓ — daba trompicones, bugs de display:none, opacity heredada de animations) → vuelta al esquema simple: tarifador en su sitio, botón "Calcular tarifa" en móvil que lo despliega con fade+slide-up 0.4s, hero crece de altura para acomodarlo
- **Validación**: si origen o destino vacíos → bordes rojos + cartel "⚠ Introduce el origen y el destino antes de calcular el precio"
- **Anotaciones libres**: botón colapsable "+ Añadir anotaciones" antes del CTA, textarea con maxlength 1000 y contador en vivo (rojo al pasar 950). En móvil hace `scrollIntoView({block:'center'})` al hacer focus (300ms tras abrir teclado) para que no quede tapado por el teclado
- **Botón refresh (↻)** en la esquina del tarifador que resetea TODO a valores por defecto (camión Tauliner, ml/peso al máximo, "Sin fecha definida", anotaciones vacías, etc.)
- **Mensaje preformateado** con encabezado `*** ENVIANOS ESTE MENSAJE Y TE PASAMOS TU TARIFA ANTES DE 25 MINUTOS ***` y línea libre para "INDICA AQUÍ OTRAS ANOTACIONES…". Bug fixeado: el href de Email/WhatsApp se regeneraba SOLO al pulsar "Calcular precio" → si el usuario cambiaba un dato después y pulsaba Email/WA directamente, iba el mensaje viejo. Ahora `buildMessage()` se llama también al click de cada botón
- **Selector de día**: opción "Sin fecha definida" como default, próximos 7 días LABORABLES (salta sábados/domingos), opción "Otro día..." abre el calendario. Bug fix: al cerrar el calendario sin elegir fecha, el select se quedaba en "otro" y la próxima pulsación no disparaba `change` → ahora `onClose` de Flatpickr restaura el select al valor previo si no se eligió fecha
- **Textos iterados**: "Calcula tu tarifa" → "Pick. Drop. Done." → "Transporte de mercancías." (con punto final morado). CTA: "Solicitar tarifa" → "Calcular precio". Selector camión añadidos "(más económico)" y "(más caro)". Fecha de carga: "Día concreto" → "Fecha fija (un día en concreto, más cara)", "Estándar" → "Ventana de 2 días (Estándar)" default, "Flexible" → "Ventana de 4 días (Flexible, más económica)"
- **Diseño**: tarjeta blanca semi-transparente (~93%) sin backdrop-filter (penalizaba GPU), borde sutil. Iteración del tooltip del camión: pastilla fija → tooltip al hover en desktop (en móvil no hay hover). Selector de info de los 2 camiones modal → popover compacto → solo tooltip discreto. Borde morado al **hover** de campos (no solo focus), JS hace `blur()` al cambiar select para que el borde vuelva a gris

**MÓVIL — UX iterado mucho**:
- En móvil el tarifador está OCULTO por defecto. Botón "Calcular tarifa" centrado al pie del hero (morado simple sin efectos cutres). Al pulsar: botón se oculta, tarifador aparece con fade+slide-up
- Hero con `min-height: calc(100svh - 220px)` — usamos `svh` (no `dvh`) porque `dvh` recalcula al hacer scroll en Chrome iOS y daba "zoom raro" del tarifador
- Compactación móvil del tarifador (padding 0.6rem, título 1.15rem, gaps 0.4rem) para que entre todo lo más posible en el viewport
- Probamos position:fixed bottom-sheet con drag handle y overlay → demasiados bugs (opacity:0 heredada, click handlers que se cerraban al instante, body bloqueado) → revertido al esquema simple

**VÍDEOS DEL HERO**:
- Sustituido el mp4 único (3,6 MB) por DOS webm en secuencia (`hero-1.webm` 2,4 MB + `hero-2.webm` 2,7 MB) con crossfade suave. Iteramos la duración: 1,2s (brusco) → 3s (demasiado, comía vídeo limpio) → **2s** (punto medio, sine in-out)
- Velo del hero aclarado: rgba 0,65→0,85 → rgba 0,18→0,42 (ahora el vídeo se ve con colores naturales)
- Fallback al mp4 para navegadores sin soporte webm

**MENÚ MÓVIL** — rediseño cinematográfico (era texto morado sobre blanco, muy básico):
- Apertura con clip-path circular desde el icono hamburguesa
- Fondo morado/navy con **doble aurora animada** (2 gradientes radiales orbitando), estrellas tenues parpadeando
- Header con **logo Dynamo** (`images/4.png` — el que pidió el usuario) + botón X circular glass que rota 90°
- Items numerados 01..05 con entrada **escalonada** (fade+slide-from-left) y subrayado morado→verde al active
- Footer con 2 CTAs (Acceso + teléfono verde) + lema "Pick. Drop. Done." con Done en verde
- **Cierre simple**: opacity 0 en 0.28s (probamos clip-path inverso + items saliendo escalonados, pero daba trompicones)
- **Bug fixeado**: pulsar Acceso desde el menú hacía `closeMobileMenu(); goToPortal(event)`. El cierre del menú (280ms) revelaba la web brevemente antes de que el wormhole (850ms) la cubriera. Solución: quitar el `closeMobileMenu()` — el wormhole tapa el menú al expandirse

**CARDS DE VEHÍCULOS Y SERVICIOS**:
- Quitados los botones "Contratar" de las 2 cards de tipos de camión (Tauliner + Rígido) en producción y preview. El tarifador del hero los hace innecesarios
- Títulos de las cards de servicios igualados al de "Almacenamiento corta estancia": 1,7rem desktop / 1,25rem móvil (antes 1,45rem / 0,88rem)
- "Servicio aún no disponible para contratar online. Estamos terminando…" → "Servicio aún no está disponible para contratar." (más conciso, sin dar pistas del estado interno)
- Ancho interior unificado a **2,40 m** (era 2,45) en cards y tooltip del tarifador
- Peso máx. Tauliner unificado a **24 Tn** (era 24,5) — coincide con la spec de la card de vehículos
- Quitado **Perfiles Miranda** del carrousel (las 2 ocurrencias del bucle infinito)

**WEB PÚBLICA Y SEO**:
- Banner "Soluciones de Transporte. España y Europa." con efecto neón sutil (gradiente shimmer 8s + halo box-shadow alternando morado/verde 4,5s) — iteramos intensidad varias veces
- Top-bar Google (+480 Clientes · 5,0 ★) con spinner conic-gradient verde que se VACÍA en 5s (usando @property --tb-progress que SÍ permite animar gradientes) y autocolapso suave de la barra
- **Quitado el cartel blanco del hero** "Soluciones de Transporte a medida" — el vídeo se ve sin texto encima
- **Línea blanca vertical** del hero (`hero-road::before` con keyframes roadLines) eliminada — se veía rara sobre el vídeo real. También quitado el "Scroll ↓" de la parte inferior
- **Strip reducido a 2 chips**: Grupajes + Carga Completa (antes 4) — caben en 1 línea en móvil
- **Hero alto** con cálculo para que el carrousel quede al pie del viewport. Iteramos mucho los valores (240 → 320 → 360 → 220 con `svh`)
- **SEO grave fixeado**: `dynamotrans.com/es/` salía indexado en Google con TODO roto (logos como texto, vídeo no carga). Causa: catch-all rewrite de Vercel servía index.html en cualquier URL + las imágenes con rutas relativas (`images/foo.png`) se buscaban en `/es/images/foo.png` → 404. Solución: redirect 301 en vercel.json de `/:lang(es|en|pt|...|fi)/...` → `/`, redirect `/index.html` → `/`, Y convertir 53 rutas de imágenes a absolutas (`/images/...`)
- **Producción no construía 1 vez**: Vercel no creó deploy para `f9e10a3` por algo. Forzado con commit vacío `51f5af4`

**PORTAL** (sigue solo en preview, no en producción):
- Texto del portal acotado a "Espacio privado para clientes. Mientras tanto, contáctanos por los canales habituales." (eliminado el detalle de "programación y estado de cargas e histórico" para no dar pistas a la competencia)
- En producción: portal sigue con el botón "Crear cuenta" disabled y los campos de login disabled
- En preview: flujo completo (registro.html → verificar.html → crear-password.html) y portal.html con botón activo. Todo funcional

**INFRAESTRUCTURA**:
- 7 MB de imágenes basura eliminadas del repo (AdobeStock_270241303.jpeg 3,8MB, AdobeStock_212968647.jpeg 2,2MB, etc.) — no se usaban en ningún HTML, solo engordaban el build de Vercel
- Lección aprendida del fast-forward: el merge `main → preview` con fast-forward borró del preview los archivos del flujo del portal (registro/verificar/crear-password) que solo existían en preview. Recuperados del histórico (`764f8a8`). Para futuras sync: **siempre `merge --no-ff` con commit explícito**, nunca fast-forward
- Webm originales con nombres feos (`mp_dynamo-ezgif.com-gif-maker.webm`) borrados — el contenido se sirve desde `hero-1.webm`/`hero-2.webm` con el mismo peso

**Pendientes detectados** (van a TODO.md):
- Mensaje preformateado con TABLA de coeficientes del cliente (escala por bandas, 25% en 0,8ml hasta 100% en 10,4ml) para mostrar % de carga del camión al cliente en vivo. Tengo la tabla apuntada pero no implementé el cálculo
- Cuando el portal pase a producción, evaluar integrar Google Places API (con clave del cliente) en lugar de Nominatim — mejor calidad de autocomplete pero requiere billing en Google Cloud (~200$/mes gratis cubren el tráfico esperado)

### 2026-06-11 — iPhone
- **Producción mostraba portal "incompleto"**: tras el rollback del día anterior (`dba559c`), `dynamotrans.com/portal` quedó sin el botón "Crear cuenta" → daba imagen de mockup a medio terminar. Decisión: mejor que el botón **se vea pero esté disabled** (mismo patrón que el de "Iniciar sesión") para que el cliente perciba el diseño completo sin que pueda navegar a nada
- **Fix `54c723e` en main**: añadido `<button class="portal-btn portal-create" disabled>Crear cuenta</button>` debajo del divisor "¿No tienes cuenta?" en `portal.html` de main. CSS `.portal-create` añadido con `cursor: not-allowed`, `opacity 0.55` y sin transition hover (no tiene sentido en un disabled). NO navega a ningún sitio → evita 404 porque `registro.html` no existe en main
- **Cola de Vercel colapsada**: a media tarde nos dimos cuenta de que TODOS los deploys recientes estaban atascados. `dba559c` llevaba 35+ min en `INITIALIZING` (normal: 30-60s), 7 deploys detrás en `QUEUED`, logs de build **vacíos** (ni siquiera había empezado a construir). Causa probable: soft-cap anti-abuso del plan Hobby tras hacer ~15-20 deploys en una hora (sesión 3 hizo muchos pushes seguidos). Vercel no avisa, solo pone los nuevos en pausa hasta enfriarse
- **Diagnóstico vía API de Vercel** (MCP): comprobada la lista de deploys, el flag `live: false` del proyecto y los logs vacíos. Confirmado que NO era una cola normal, era atasco real
- **Cancelación selectiva desde el dashboard de Vercel** (lo hizo el usuario): canceló los 7 deploys atascados/queued, dejó solo el último (`54c723e`, fix botón disabled). Al cancelar el bloqueo, el último deploy pasó automáticamente a `INITIALIZING` → `BUILDING` → `READY` en pocos minutos
- **Resultado**: producción quedó con `54c723e` desplegado correctamente (botón visible+disabled). Los commits intermedios cuyos deploys se cancelaron (rollback `dba559c`, cherry-picks `8609a28`/`33a2136`/`b09e38c`, bitácora `281a515`) **están todos en `main` igualmente** porque git es acumulativo → el último deploy (HEAD de main) incluye todos los cambios anteriores. No hay nada perdido, simplemente no se hizo un build intermedio por cada commit
- **Discusión planes Vercel**: explicado el usuario que Hobby (gratis, 1 build concurrente) vs Pro (~18€/mes, 12 builds concurrentes) vs Enterprise. **Para tráfico** (10-20 usuarios simultáneos en web estática) Hobby aguanta perfectamente porque sirve desde CDN — el límite es **builds concurrentes**, no usuarios. Pro tendrá sentido **cuando el portal pase a app real con Next.js + backend** (Hobby tiene solo 100k function invocations/mes vs 1M en Pro). Mientras seamos solo HTML estático, Hobby gratis sobra
- **Lección aprendida — anti-cola**: cuando hagamos sesiones largas con muchos pushes seguidos, agrupar más cambios en menos commits para no saturar la cola de Vercel. Si se atasca de nuevo: cancelar la cola desde el dashboard dejando solo el último → es lo más rápido
- **Estado final verificado**:
  - **Producción (`dynamotrans.com/portal`)**: portal con login bloqueado + badge Próximamente + botón "Crear cuenta" gris/disabled (no navega). Solo `portal.html`, **NO** existen `registro.html`/`verificar.html`/`crear-password.html` en `main`
  - **Preview (`dynamo-web-git-claude-sharp-dirac-e3uio-dynamotrans-projects.vercel.app`)**: flujo passwordless completo funcional end-to-end (registro → verificar OTP → crear contraseña)
- **Commits del día**: `54c723e` (fix botón Crear cuenta disabled en main, único que entró a producción). No hay nuevos commits en la rama feature, solo este de bitácora
- **Pendiente arrastrado**: sigue sin decisión el texto del botón `Cotizar` del hero

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
