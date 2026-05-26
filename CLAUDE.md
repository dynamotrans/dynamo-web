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

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-05-26 — iPhone Pro Max 17
- **Mensaje predefinido de tarifa — punto 3 ampliado**: añadidas 2 preguntas nuevas en los 23 botones (13 WhatsApp + 10 email): `¿Origen es Almacén, Obra o Finca?:` tras el origen y `¿Destino es Almacén, Obra o Finca?:` tras el destino, con línea en blanco separando ambos bloques. Aplicado vía script Python con las dos variantes de codificación (`%0A` WhatsApp, `%0D%0A` mailto). Resto del mensaje intacto (commit `58feca1`)
- **Chips de la barra de servicios** (GRUPAJES / CARGA COMPLETA / IMPORT & EXPORT / NACIONAL 24H): la caja `.strip-item` pasa de transparente con texto blanco → **fondo blanco con texto morado por defecto**, y **naranja con texto blanco al hover/pulsar** (`:hover, :active`). Añadida variable `--orange: #ff7a00`. El puntito `.si` se mantiene verde parpadeando (commit `9b4da03` cambió primero el punto y `9bdac2e` lo revirtió aplicándolo al chip)
- **Push a la rama de trabajo** `claude/sharp-dirac-E3UIO` (NO a `main`): pendiente merge a `main` para desplegar en producción (dynamotrans.com) vía Vercel

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
