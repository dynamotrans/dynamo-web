# dynamo-web — Instrucciones para Claude

## Proyecto
Sitio estático HTML servido con `python3 -m http.server 3000`.

## Flujo de trabajo con 2 Macs + GitHub Codespaces
El usuario trabaja desde 2 Macs diferentes usando GitHub Codespaces para mantener un único entorno sincronizado en la nube.

**Máquinas del usuario:**
- 🏢 **iMac Despacho** — ordenador fijo en la oficina
- 💻 **MacBook Pro Movilidad** — portátil para casa / viajes / fuera

Al empezar cada sesión, si no se sabe, preguntar "¿Desde qué Mac estás trabajando, iMac Despacho o MacBook Pro?".

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

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-04-14 — iMac Despacho (vía Codespace)
Sesión larga y productiva. Lo que se hizo:

**Infraestructura (nuevo):**
- Configurado GitHub Codespaces (`.devcontainer/devcontainer.json`)
- Creado `CLAUDE.md` con reglas de push-confirmation, catch-up y cierre automático
- Creado `TODO.md` para pendientes manuales
- Añadida sección de Bitácora
- Anotadas las 2 Macs del usuario (iMac Despacho + MacBook Pro Movilidad)

**Cambios visuales en web (ya en producción www.dynamotrans.com):**
- Logo nav: reemplazado PNG base64 inline (29k chars) por `images/2.png` (dynamo azul + arco verde) → ahorra 28 KB
- Logo hero: recuadro con gradiente sólido morado, borde blanco, sombra inset (antes era glass translúcido)
- Reorden de secciones: Servicios → Vehículos → Mercancía → Por qué nosotros → ...
- Títulos de tarjetas de servicios más grandes (1.45rem, peso 900, color morado, subrayado gradiente morado→verde que se expande en hover)
- Stats strip (+480 clientes / 5★ / +15 años / 24/7) movido justo debajo del banner Cotiza
- Cliente count actualizado: +230 → **+480** en 8 sitios (barras, meta SEO, footer, stats, etc.)
- Vehículos specs: ancho 2,40 → 2,45m (interior), Rígido añade Carga máx. 14 Tn., ambos añaden "Apertura: Lateral, trasero y techo", orden de filas alineado
- Chat assistant actualizado con los nuevos datos de vehículos
- Carrusel de clientes: añadidas **25 empresas nuevas** con letra inicial como icono discreto (SOLBAU ya existía, omitida). Pendiente recibir logos reales para sustituir iniciales

**Tarifador (SOLO EN PREVIEW, NO en producción aún — se lanza en ~1 mes):**
- Nueva sección completa "Calcula tu tarifa" justo bajo el hero
- Campos: origen/destino (texto), tipo mercancía (select), tipo palé (botones EU/US), nº palés (stepper), peso (slider con valor en vivo), toggles urgente / sin muelle
- Botón con gradiente + flecha
- Resultado con spinner animado + mensajes rotativos (Verificando ruta... / Calculando peso... / etc.) → ~3-6s
- Precio con gradiente tipográfico, ref code, CTAs WhatsApp + email pre-rellenados
- Cálculo placeholder en JS (el real irá vía Apps Script → Google Sheet)
- **Pendiente del usuario**: crear API key Google Places (autocompletado) y sheet con fórmulas
