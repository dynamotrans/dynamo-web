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
