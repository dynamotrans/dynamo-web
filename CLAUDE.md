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

### 0. Precios SIEMPRE con 2 decimales
**Todo precio/importe en TODA la plataforma se muestra con 2 decimales, aunque sean ceros** (`450,00 €`, `544,50 €`, `1.020,00 €`). Formato es-ES (coma decimal, punto de miles). **Nunca redondear a euro entero** para mostrar. En JS: `n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Aplica a tarifador, cajas de precio, pago por adelantado, proforma, tablas (envíos/almacenamientos/facturas/penalizaciones), detalles y mini-listas.

### 1. Push: automático a PREVIEW, con confirmación a PRODUCCIÓN
**(Actualizado 2026-07-12 a petición del usuario: "sube directo sin preguntarme".)**

- **Rama preview (`claude/sharp-dirac-E3UIO`)**: cuando el usuario pide un cambio, Claude hace commit y **push directo, sin pedir confirmación**. Siempre anunciando qué se subió y con qué hash.
- **`main` (producción, `dynamotrans.com`)**: **SIEMPRE preguntar antes de push**. Nada llega a producción sin OK explícito del usuario (y el portal, además, nunca — regla 7).

Flujo esperado para preview:
1. Hacer los cambios solicitados y **verificarlos** (Chromium headless + syntax-check)
2. `git add` + `git commit` + `git push` a preview directamente
3. Informar: qué se cambió, hash del commit y que está subido

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

### 9. Dos ramas: main / preview — quién contiene qué y cómo se propaga

Estructura del proyecto (simplificada el **2026-07-04**; antes existía además una rama `lab` permanente que se **eliminó por redundante** para 1 dev — sus contenidos eran idénticos a preview y solo generaba cascadas y conflictos de merge):

```
main                        → dynamotrans.com (producción pública)
claude/sharp-dirac-E3UIO    → preview (portal + web pública validada, URL preview Vercel)
```

**Inheritance**: `preview` = `main` + código del portal/panel encima.

**Default working branch para Claude**: `preview` (claude/sharp-dirac-E3UIO).

**Experimentos / features que NO van a producción todavía** (facturación con Holded, multi-rol con transportistas/proveedores, etc.): **NO** se usa una rama permanente. Se crea una **rama corta** desde `preview` con prefijo `lab/<algo>` (p.ej. `lab/facturacion-holded`). Vercel le da su propia URL de preview automáticamente. Vive lo que haga falta y luego se mergea a `preview` (solo con orden explícita) o se borra. Sin sandbox permanente.

**Confirmación visible obligatoria**: cada commit y cambio de rama Claude lo anuncia ("Subido a preview (`abc`)", "Creo rama `lab/x`", etc.). Si hay duda sobre qué rama tocar, preguntar antes de editar.

**Propagación tras merges** (ya solo 2 destinos vivos, sin cascada a lab):

| Acción | Pasos |
|---|---|
| Cambio público | rama corta `fix/<x>` desde `origin/main` → merge a `main` + push → luego `git merge main` en preview + push (para que preview no acumule drift) |
| Promoción de un experimento | `git merge lab/<x>` en preview (**solo con orden explícita**) + push. Después preguntar si algo va también a `main` |

**Reglas duras**:
- El portal NUNCA se mergea a `main` sin frase explícita (regla 7).
- Una rama de experimento `lab/<x>` NUNCA se mergea a `preview` sin orden EXPLÍCITA del usuario.
- Los cambios públicos SIEMPRE arrancan desde `main` (regla 8), nunca desde preview.

**Drift**: como `preview = main + portal`, tras cada cambio público hay que `git merge main` en preview para que no se acumule drift entre las dos copias de la web pública.

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-07-12 — Claude Code web (nube)

> **Sesión maratoniana del panel** (`dashboard.html`), todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Push automático activado por el usuario ("sube directo sin preguntar"). Estado final: preview `33bdf2f` (~20 commits del día).

**DECISIÓN GRANDE — mockup DETERMINISTA, sin datos en el navegador**: fuera TODA la persistencia en `localStorage` (sitios custom/borrados, overrides de almacenes, rol, mantenimiento, perPage). El estado de prueba vive en el CÓDIGO → idéntico en cualquier dispositivo; las ediciones duran solo la sesión (hasta recargar). Motivo: el usuario probaba en iPad/iPhone y cada aparato mostraba datos distintos. Solo quedan idioma (cookie googtrans/dashLang) y caches técnicos (Nager, geo IP). ⚠️ Contrapartida explicada: iOS recarga pestañas solo → las ediciones se pierden; la persistencia real llegará con el backend.

**ICONOS DE TIPO DE SITIO**: Finca = **rama de trigo** (antes hoja); todo lo que NO es Almacén/Nave va **resaltado en ROJO** (obra/urbana/evento/finca) en todas las superficies; **los 64 sitios del catálogo llevan `tipoLugar` de serie** (Almacén/Nave salvo GRUPAL ART=Zona urbana, WELDINOX=Finca, TJL=Obra) → al elegir cualquier sitio en crear envío el icono del campo pasa del pin al de su ficha. **Fix**: editar un sitio ahora repinta también la tabla de envíos y la mini-lista (antes solo Sitios → icono viejo hasta recargar).

**MODIFICAR ENVÍO = CREAR ENVÍO**: el prefill geocodifica origen/destino/paradas en 2º plano (fetch propio: el AbortController compartido de osmSearch abortaba la 1ª petición) → precio EN VIVO con desglose; restaura tipo de lugar, referencia, paradas y discreción. **BLOQUEO ANTI-PRECIO-0**: mientras el precio se calcula (skeleton), los botones guardar/confirmar quedan deshabilitados con **spinner**; guardia en validación ("Estamos calculando el precio…") y `beforeunload` avisa si se cierra con un guardado en curso. TODO: notas backend (POST antes del overlay, idempotencia, precio validado server-side).

**CATÁLOGOS ADMIN NUEVOS — Clientes y Transportistas** (botones 7 y 8 del panel admin): tabla homogénea + ficha editable al pulsar fila, con **fecha/hora de creación y modificación**. Cliente: fiscales + plazo de pago (0/30/60) + **importes de crédito CESCE y Dynamo** (sin checkbox; lo determina el importe). Transportista: fiscales, Empresa/Autónomo, **código de bolsa de carga**, flota, seguro CMR y **documentos adjuntos (máx. 5)**. Sin IBAN. **Sin botón Borrar** en clientes/transportistas/almacenes (solo backend).

**ADJUNTOS UNIFICADOS en toda la plataforma**: pulsar un documento lo abre en el **visor (pestaña nueva)**; la × pide **confirmación** antes de borrar (mini-diálogo propio que no pisa el modal). Incidencias pasan de contador a lista con nombres.

**OTROS**: precio con desglose (base grande morada + IVA/Total discretos) en el **detalle de envío**; **deshacer cancelación** desde Canceladas (vuelve a Programadas, aviso si la fecha pasó); modal cancelar envío con **triángulo rojo** (no la X) y **botón Llamar** (+34 955 225 945, L-V 8:30-15:30 verano) sobre "Sí, cancelar"; textos de **discreción comercial** en confirmación (check + aviso; se guarda y se ve en el detalle); tarjeta **Recomiéndanos** en el dashboard con 2 botones en fila (Recomendar Dynamo → WhatsApp/email/copiar · ★ Puntúanos en Google → ficha de Maps, pendiente place ID para enlace directo de reseña); muro de clientes ENCIMA de Nuestros servicios; tarjeta "Mis últimos envíos" **clicable entera**; claim **"Logistics"** junto al logo de la topbar (notranslate).

**TARDE (2ª tanda, hasta `162d372`)**: **regla 1 de CLAUDE.md reescrita** (push automático a preview, confirmación solo para `main`) · **CORTE DE FECHAS REAL**: el corte es la hora límite para pedir el SIGUIENTE día hábil y corre TODOS los días (antes se saltaba en findes: un domingo a las 15:19 seguía ofreciendo el lunes); probado con reloj simulado (page.clock) en 5 escenarios; hora final del corte: **17:10 ambos modos** (iteró 11:00→12:00→17:10, el usuario probaba en vivo) · **Reportar incidencia en CUALQUIER estado** del envío (también sin transportista, previsión o cancelado) · **"Logistics" movido de la topbar al sidebar** (logo + Logistics / Portal · Cliente) · **FORMATO DE FECHA ÚNICO `Vie 10/07/26`** en toda la plataforma (desplegable, tablas, mini-listas, caja ETA, nota del corte, almacenamiento, incidencias/facturas/penalizaciones; fuera el formateador largo "Viernes 10 julio 2026"; `fechaConDia` acepta DD/MM y DD/MM/YYYY; quedan aparte timestamps de fichas, proforma y textos de horarios) · explicado el criterio del detector de sitios duplicados (1ª palabra fuerte del nombre o mismo CP + nombre contenido; en backend: puntuación con nombre difuso, CP, calle, coordenadas y teléfono).

**NOCHE (3ª tanda, hasta `aa1fd7b`)**:
- **PRECIOS EN TABLAS (envíos + penalizaciones)**: columnas **P. cliente · P. transportista · Margen** (todo BASE sin IVA, nunca el desglose en la celda; margen verde/rojo). Celdas clicables → **mini-editor** con los conceptos del precio editables a mano, total en vivo y **Guardar que FIJA el precio** (etiqueta "fijado a mano"). **Modificar envío NO recalcula un precio fijado a mano** si no cambia nada que afecte al precio (firma del formulario capturada al abrir + "foto" de los tipos de lugar del paso de confirmación — los selects se autoseleccionan de la ficha del sitio y eso contaba como cambio: bug cazado y arreglado). P. transportista mock determinista (~72-85% del cliente).
- **FICHA DE CONTEXTO DEL ENVÍO** (`envioContextHTML`) al elegir el #GX en **penalización e incidencia** (crear y editar) y en "Reportar incidencia" desde un envío: estado, cliente, transportista, matrícula+conductor, camión, fecha/ventana, **fecha de carga real**, ETA, mercancía, recogida/entrega (empresa+dirección+horario), paradas y precios con margen. Penalizaciones mock re-apuntadas a envíos reales.
- **CATÁLOGO USUARIOS** (solo admin, botón 9): email asociado a Admin/Empleado/Cliente/Transportista. Tabla con métricas: última conexión, conexión diaria/semanal, consultas de precio, envíos creados, ratios consultas/envíos y cancelaciones/envíos (rojo ≥30%), cancelados en últ. 10. Transportistas con métricas de envíos en blanco. Filtro por tipo + buscador. **Ficha = "Mi cuenta"**: personales (nombre, DNI, tfno) + fiscales (razón social, CIF, dirección fiscal…) + **estado de cuenta** (Activa/Suspendida/Pendiente de verificación). La contraseña NO se gestiona desde admin (enlace de invitación).
- **CAMBIO DE ROL PROTEGIDO**: el rol ya no es un campo editable de la ficha — acción aparte "Cambiar rol…" con modal que describe qué puede hacer cada rol. **CUALQUIER cambio de rol exige teclear el email del usuario** (también cliente→transportista o empleado→cliente — pedido explícito del usuario); conceder Admin además va en aviso ROJO; **no se puede degradar al ÚNICO Admin activo**. Reglas backend anotadas en TODO (solo admin concede admin, nunca a sí mismo, re-auth, auditoría + email).
- **PENALIZACIÓN AUTOMÁTICA al cancelar fuera de plazo**: cancelar tras las 9:00 del día hábil anterior genera sola la penalización de Cancelación por el **coste completo** (base sin IVA), marcada "Generada automáticamente"; admin la puede renegociar. Dentro de plazo: gratis, sin penalización. **Deshacer la cancelación la retira** (si admin no la editó). Cancelar ahora sí marca el envío como Cancelada de verdad.
- **ORDENACIÓN POR COLUMNAS en las 11 tablas**: clic en cabecera = ascendente → descendente → orden original, flechas ▲/▼, ordena el conjunto COMPLETO antes de paginar, vacíos al final, locale es. Tooltips con el siguiente paso del ciclo (el 3er clic descolocaba al usuario). En producción el orden se pasará a la consulta del servidor.
- **TELÉFONOS DE LA OPERATIVA** (sitios/transportistas/conductores — NO Dynamo): ventana propia al pulsarlos. Móvil en horario → elegir Llamar/WhatsApp; fijo en horario → llama directo; fuera de **L-V 7:30-18:30**, findes y festivos nacionales → aviso "No son horas de llamar" con motivo + WhatsApp/Llamar igualmente. Los números de Dynamo conservan su modal de horario.
- **ESTADOS DE CUENTA en login** (vista de prueba): `?cuenta=suspendida` (pantalla roja con contacto para reactivar) y `?cuenta=pendiente` ("Estamos verificando tu alta", ámbar). Mismo estilo que el overlay de mantenimiento; en producción lo impondrá el backend.

**Método**: cada cambio verificado en Chromium headless (Nominatim/Nager mockeados por el proxy) con screenshots antes de commitear. Sin errores JS en ningún commit. Ojo aprendido: `page.clock` congela las animaciones CSS (los modales salen "fantasma" en screenshots con reloj simulado — no es un bug real).

**Pendientes**: place ID de la ficha de Google (para el enlace directo de reseña) · confirmar hora definitiva del corte (17:10 puesta probando en vivo) · verificar filtro de festivos autonómicos en el preview real · sync `festivos.js` a `main` cuando el usuario dé el OK · al montar el gating de roles, **ocultar P. transportista y Margen al rol cliente** (info interna) · backend del cambio de rol y de la penalización automática (ver TODO).

### 2026-07-11 — Claude Code web (nube)

> **Sesión centrada en el tarifador del panel (`dashboard.html`) + `festivos.js`.** Todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `5a2046a`.

**FILTRADO DE AVISOS DE FESTIVO POR COMUNIDAD (arregla el sobre-aviso)**:
- **Problema reportado**: en una ruta con recogida en **Murcia** y entrega en **Salamanca** salía un aviso de festivo **autonómico de la Comunidad Valenciana**. El aviso de la caja ETA era a nivel de **país** → avisaba de festivos de OTRAS comunidades.
- **`js/festivos.js`** (aditivo, no cambia la web pública): la caché de la API (Nager) ahora guarda `{name, global, counties}` en vez de solo el nombre (clave subida a `festivos_api_v2_`); nuevo método **`FESTIVOS.regionsOf(cc, fecha)`** → `null` = nacional · `[]` = regional de comunidad desconocida · `['ES-VC'…]` = regional de esas comunidades ISO. `get()`/`getLocal()` intactos.
- **`dashboard.html`**: nuevo helper **`stateToRegion(address)`** que mapea el `address.state` de Nominatim (con/sin acentos, lengua cooficial) → código ISO 3166-2 (`Comunidad Valenciana`→`ES-VC`, `Región de Murcia`→`ES-MC`, `Castilla y León`→`ES-CL`, las 17+2). Al elegir sitio se guarda su comunidad en **`wrap.dataset.region`** (se limpia al borrar, en los 4 puntos de reset). **`holsInRange(cc, region, a, b)`** ahora filtra: **nacional → siempre avisa**; **autonómico/local → solo si la comunidad del sitio coincide** con las del festivo; si no se conoce (sitio o festivo) → no avisa el autonómico (evita el sobre-aviso).
- **Verificado** en Chromium headless (Nager mockeado porque el proxy del entorno lo bloquea con 403): Murcia+festivo de Valencia → NO sale ✓ · Valencia+festivo de Valencia → SÍ sale como "FESTIVO AUTONÓMICO" ✓ · comunidad desconocida → NO sale ✓ · festivo NACIONAL con cualquier región → SÍ sale ✓. Syntax-check JS OK.
- ⚠️ **El filtro autonómico solo se activa de verdad en el preview REAL de Vercel** (donde la API de Nager responde). En este entorno el proxy la bloquea → solo se valida con datos mockeados; los festivos nacionales (registro local) sí funcionan siempre.
- ⚠️ `festivos.js` es archivo **compartido** con producción, pero este cambio es **aditivo**: `index.html` no llama a `ensure`/`regionsOf` → no cambia nada en `dynamotrans.com`. Sync a `main` pendiente cuando el usuario quiera (no urge).

**Pendiente** (ver TODO.md): verificar el filtro en el preview real de Vercel; el dataset completo de festivos (nacional+autonómico+local con datos oficiales) sigue siendo tarea de **backend**.

### 2026-07-08 (cont.) — Claude Code web (nube)

> **Continuación de la sesión del panel.** Todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `10b95c2` (2 commits: `553fd31` borrado suave + `10b95c2` Almacenes = Sitios + disponibilidad).

**ALMACENES = SITIOS (tabla y ficha idénticas)**:
- La sección **Almacenes** (catálogo interno admin) usa ahora las **mismas columnas que Sitios**: Empresa · Dirección · Horario · Contacto · Notas (`renderAlmacenesCatTable` sobre `almToSite(a)`). Son sitios de uso interno.
- La ventana **Editar almacén** usa el MISMO formulario que Sitios (`sitioFormHTML`, ids `sitio-f-*`): Empresa, Tipo de lugar, Horario, Dirección (calle+número), CP/localidad/provincia/país, Teléfono, Contacto, Notas, enlace de Maps. `almacenCatGuardar` lee esos ids, escribe al objeto del almacén y re-deriva prov/ciudad/cp del CP line.
- **Modelo de datos reconciliado**: el almacenamiento usa `dir`=calle + `almIdx`; los sitios usan `calle`+`dir`=línea CP. Se añadió `calle`/`dirCP` + campos de sitio al objeto almacén vía `enrichAlmacenes()` (una vez), con `almToSite(a)` como vista. **Borrado suave** (`_deleted`) para no descuadrar los `almIdx` de almacenamientos ya registrados (commit `553fd31`).
- **Almacenes en el buscador de recogida/entrega del ENVÍO**: `renderLocales(q)` añade `almSitesBuscar(q)` con chip morado **«Almacén»** (`.sug-chip-dynamo`); al elegir uno se aplica como `siteKey` `dynamo-*` y **`siteDe` resuelve esas claves** (`almToSite`) para consolidar la ficha en el resumen. Por si hay que recoger/entregar en un almacén Dynamo.

**CHECK DE DISPONIBILIDAD (Disponible / Completo)**:
- Toggle **«Almacén disponible»** arriba de la ficha de edición del almacén (`almc-f-disp`), guarda `a.disponible`.
- Al marcarlo **completo** (`disponible:false`): sigue apareciendo en los desplegables con **badge rojo «Completo»** (`.alm-combo-full`) tanto en la tabla del catálogo como en el combo de nuevo almacenamiento; al elegirlo en **nuevo almacenamiento** salta el aviso *«Este almacén está COMPLETO y no admite entradas»* y **`almSolicitar` bloquea** (no crea el registro).
- En el **envío** (recogida/entrega) el almacén completo SÍ aparece y se puede elegir — «completo» solo bloquea **almacenar**, no recoger/entregar. (Si se quiere bloquear también en envío, es un cambio pequeño.)

**Método**: verificado en Chromium headless (`?role=admin`): columnas de la tabla, ficha idéntica a Sitios, toggle guarda `disponible:false`, badge en tabla y combo, aviso + bloqueo al elegir completo en almacenamiento, almacenes visibles en el buscador del envío, `siteDe` resuelve `dynamo-*`, sin errores JS. Screenshots antes de commitear.

---

### 2026-07-08 — Claude Code web (nube)

> **Sesión muy larga en el PANEL (`dashboard.html`).** Todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `f1b4e36` (18 commits del día, todos pusheados a preview).

**SEGUIMIENTO DE ENVÍOS — ELIMINADO**: fuera el botón "Seguimiento" del detalle de envío y del menú de fila (en-ruta), la función `cargaSeguimiento` (modal timeline Recogida/En tránsito/Última posición/Entrega) y su CSS.

**TABLA DE ALMACENAMIENTOS** (`renderAlmacenesTable`): col 1 solo el código (sin descripción); Reparto urbano "Sí · N camiones" + resumen de dirección; **Total (sin IVA)** (base imponible, no IVA incl.); el desglose con IVA se queda en el detalle/desplegable. **Códigos → `#AX######`** (AX + 6 dígitos, paralelo al `#GX######` de envíos; decisión del usuario vía "Other").

**NUEVO APARTADO PENALIZACIONES** (sección `#sec-penalizaciones`): link en sidebar + buscador + filtro por tipo + tabla (código #PEN- · envío #GX · tipo · transportista+cliente · importe **sin IVA** · fecha). Mock `PENALIZACIONES_DATA`. Botón **Crear penalización** → modal con **Envío referenciado** autocompletado (últimos 4 #GX; filtra por GX/ref/ruta/transportista) + resumen del envío (cliente + transportista + ruta), tipo (cancelación/paralización/compensación/parada adicional/otro), descripción e importe sin IVA, con validación en rojo.

**SPINNER DE CREACIÓN**: texto por acción ("Creando envío/almacenamiento/penalización/incidencia…"). **Fix del flash**: se navega al listado DENTRO del callback del overlay (mismo tick), no con setTimeout posterior → al desaparecer el spinner ya se ve el listado, no el formulario. Penalización e incidencia también muestran overlay.

**ALMACENAMIENTO — paridad con envío**:
- **Modal IMPORTANTE** de pago por adelantado (como el del envío, adaptado) cuando es prepago (sin crédito CESCE); con crédito confirma directo.
- **Nota de pago** adaptada ("no se asigna **espacio**… se puede **almacenar** al día siguiente"), no el texto de camión/ventana del envío.
- **Botón Cancelar** bajo "Crear almacenamiento" (paso 1).
- **Ficha de entrega = acordeón** plegable idéntico al envío.
- **Chip del almacén clicable**: pulsar el chip elegido reabre el desplegable (como el selector de sitios).

**PROFORMA PDF revisada** (profesional/formal): importes con **2 decimales** (240,00 · 50,40 · 290,40 en vez de redondeados), **fechas DD/MM/YYYY**, concepto "Nº de almacenamiento", nota de condiciones adaptada a almacenamiento. Mejora también la de envío (decimales). *(El "recorte" que veía el usuario no era bug: la franja gris de nº/fecha/ref es intencional.)*

**PRECIO UNIFICADO** (de la sesión anterior, consolidado): Base imponible / IVA (21%) / Total con contador **de 10 en 10** en las 4 pantallas. **Facturas**: columna "Nº" → "**Nº factura**".

**NUEVA SECCIÓN ALMACENES** (catálogo interno, **SOLO ADMIN**): estilo Sitios, sobre `DYNAMO_ALMACENES` (1 por provincia). Link con badge "Admin" + `data-roles="admin"` (se ocultará al montar el gating). Buscador + tabla (Provincia·Ciudad·CP·Dirección) + alta/editar/borrar con modal. Los cambios se reflejan en el desplegable de nuevo almacenamiento.

**FORMULARIOS A 2 COLUMNAS EN ESCRITORIO** (envío y almacenamiento, paso 1 y confirmación): campos/resumen a la izquierda (ancho **fijo 660px**) y precio (+ pago CESCE + condiciones en la confirmación) + botones a la derecha en **columna sticky que rellena** todo el ancho del panel. Clases `.form-2col/-main/-side`, media query ≥1200px; en móvil se apila. **Bug corregido**: la override `max-width:none` la pisaba la regla base `.ptar-card{max-width:760}` (posterior en el CSS, misma especificidad) → la 2ª col del envío salía de ~50px con el texto partido; resuelto con scope por sección (`#sec-nueva-carga`/`#sec-nuevo-almacen`).

**PENDIENTE URGENTE anotado en TODO.md** (🔥): **scaffold de ROLES** (admin/cliente/transportista/proveedor) — superconjunto admin y restar por rol vía `?role=`, gating por sección/columna/acción, matriz de permisos, y recordatorio de que el frontend NO es seguridad (RBAC + row-level security en backend).

**Método**: cada cambio verificado en Chromium headless (desktop 1500-1600px + estados) con screenshots antes de commitear. Proforma verificada generando el PDF real.

### 2026-07-07 — Claude Code web (nube)

> **Sesión de pulido de ALMACENAMIENTO + unificación de precio/estilos + fixes de UI.** Todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `17a5912` (8 commits del día, todos pusheados a preview).

**PRECIO UNIFICADO en las 4 pantallas** (crear/confirmar envío + nuevo/confirmar almacenamiento):
- Nuevo componente global `__priceBoxHtml` / `__animateEur` / `__renderPriceBox` que pinta **Base imponible + IVA (21%) desglosado + Total (IVA incl.)** con el mismo diseño (`.alm-price`) en todas. Antes envío mostraba solo "500 € IVA no incluido" y almacenamiento un desglose distinto.
- **Efecto contador** (rolling) ahora también en almacenamiento, en las 4 pantallas. **Salta de 10 en 10** (los pasos intermedios redondean a decena; el valor final es exacto) — antes con los decimales iba de 1 en 1.
- Almacenamiento sin reparto muestra solo Base/IVA/Total (no duplica la línea "Almacenamiento" con la base); con reparto salen las filas de concepto.

**ALMACENAMIENTO — confirmar = igual que confirmar envío**:
- **Checkbox de condiciones generales** ("He leído y acepto…") con enlace al mismo texto legal y el mismo bloqueo/aviso rojo: no se confirma hasta marcarlo.
- **Ficha del sitio de entrega → acordeón plegable** idéntico a las fichas del envío: cabecera (① Entrega + empresa + fecha de salida + horario + dirección + "⚠ Faltan datos obligatorios") con chevron que despliega el cuerpo editable. Aviso que se oculta al completar empresa/horario/teléfono (`req-ok`); al confirmar sin completar, abre la ficha y hace scroll al campo.
- **Botón Cancelar** bajo "Crear almacenamiento" (paso 1), como en crear envío.
- **Proforma** se abre en el **visor del navegador** (`window.open`) en vez de descargarse.

**FECHAS en las fichas de recogida/entrega (confirmar envío)**: cada ficha muestra su fecha en línea propia sobre el horario, con el MISMO formato que la caja ETA/resumen (fija → `viernes 10 jul`; ventana → `del viernes 10 jul al miércoles 15 jul`). Recogida = fecha de carga; entrega = ETA recalculada por tramos.

**FIXES de UI**:
- **Sangría unificada de las cajas de aviso de pago** (Seguridad morada + validación roja): mismo gutter de icono de ancho fijo → el texto arranca en la misma X en ambas.
- **Popovers de filtro ya no se cortan por abajo**: `.content` usaba `overflow-x:hidden` (que obliga al eje Y a `auto` y recortaba); cambiado a `overflow-x:clip` (patrón de html/body). Afecta a TODOS los popovers de filtro del panel (p. ej. el rango de fechas de Facturas).
- **Avisos que se ocultan al elegir**: "⚠ Elige un almacén Dynamo" (al elegir almacén) y "⚠ Elige la dirección de entrega del reparto" (al elegir dirección) — antes solo se quitaba el borde rojo, la caja del mensaje se quedaba.

**Método**: cada cambio verificado en Chromium headless (desktop + móvil) con screenshots antes de commitear. Sin nuevos pendientes (todo cerrado). TODO.md sin cambios.

### 2026-07-05 (cont.) — Claude Code web (nube)

> **Continuación de la sesión del panel (tarde/noche).** Todo en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `d8210d1`.

**BUSCADOR DE SITIOS — más pulido**:
- **Solo ubicaciones elegidas de la lista** (agenda/Google/dirección): teclear texto suelto ya no cuela. Si sales del campo sin elegir, **el texto se borra solo** (vuelve a vacío) — el aviso de "texto a mano" casi nunca aparece. Al pulsar Crear también limpia lo no elegido.
- **Pista** no clicable bajo los recientes ("✎ Escribe para buscar en toda tu agenda o en Google Maps…"); al pulsarla, enfoca el campo.
- **Pulsar un chip ya elegido** lo borra y reabre los recientes (como la ×).
- **"Crear nuevo sitio"** solo con 3+ caracteres.
- **Formulario Nuevo sitio**: al elegir dirección de Google/Nominatim, "Dirección (calle y número)" recibe SOLO calle+número; el CP/localidad/provincia/país va en su campo (sin duplicar; dedupe ciudad=provincia en ciudades-estado).

**AL SALIR DE CREAR ENVÍO** → el formulario se resetea (campos, paradas, tipo, camión, fecha, ref, notas, vuelve al paso 1).

**CONFIRMACIÓN DE ENVÍO — rehecha**:
- **Tipo de lugar EDITABLE aquí** (en envío se quitó del paso 1; los sitios ya lo traen): select por punto, autoseleccionado; al cambiarlo **recalcula el precio en vivo** y se consolida en la ficha al confirmar. En **presupuesto** seguía en el paso 1 (irrelevante ya, ver abajo).
- **Fichas de lugares PLEGADAS por defecto** (acordeón): cabecera = nº + Recogida/Entrega + empresa + CP/localidad/provincia/país + flecha circular; se despliega para editar.
- **Referencia y anotaciones** pasan al **resumen** (solo lectura, con lo del paso 1; en blanco se omiten) — ya no se editan en confirmación.
- **Precio** solo en la **caja destacada** justo antes del botón (fuera del resumen). Fuera "Fecha de carga" (redundante con "Fecha de envío"); "Medidas" → "Ocupación".
- **Botones apilados**: caja de precio → **Confirmar envío** grande (64px, a lo ancho) → **← Editar datos** debajo. Texto del checkbox de condiciones acortado.

**PRESUPUESTOS ELIMINADOS del portal** (decisión del usuario: precios dinámicos → no tiene sentido guardar presupuestos): fuera el enlace del sidebar, la sección `#sec-presupuestos` entera, el CTA verde "Nuevo presupuesto" del dashboard (fila a 2: Nuevo envío + Mis últimos envíos), el botón "Guardar presupuesto" del formulario y el modo de entrada `presupuesto` (`openNuevaCarga` fuerza envío). El código de datos/render de presupuestos queda **inerte** (guards por null); sin errores JS. Usuario demo de Marbex Industrial.

### 2026-07-05 — Claude Code web (nube)

> **Sesión maratoniana del PANEL: buscador de sitios completo + agenda + confirmación de envío + dashboard rediseñado.** TODO en **preview** (`claude/sharp-dirac-E3UIO`), `main` sin tocar. Estado final: preview `3efd0d3` + 2 commits de cierre pendientes de push (≈25 commits del día).

**BUSCADOR DE RECOGIDAS/ENTREGAS — completado el plan de 3 niveles** (`dashboard.html`):
- **Recientes**: al pulsar un campo VACÍO de recogida/entrega salen los **últimos 5 sitios usados en ese rol** (chip morado "Reciente", calculados de los envíos por fecha de creación). Al escribir toma el relevo el buscador normal; al vaciar (tecla o ×) vuelven.
- **Chip bloqueado**: al elegir sitio/dirección el campo queda `readonly` con estilo chip (fondo morado suave). **Arregla el bug** de que editar a trozos el texto rompía la selección y el resumen perdía la ficha. Se cambia solo con la ×.
- **"+ Crear nuevo sitio"** como última opción del desplegable — SOLO tras escribir **3+ caracteres** (junto a los recientes invitaba a crear duplicados sin buscar). Abre el MISMO formulario de la sección Sitios (unificación pedida por el usuario) con el texto prefijado; al guardar, el sitio nuevo rellena el campo (`_sitioOnSave`).
- **Duplicados en UN solo modal**: aviso ("se duplicaría el registro…") + tabla comparativa + decisión, sin paso intermedio. Los campos de "Tu registro" son **editables** y cada dato de Google lleva botón **←** que lo copia al propio (destello verde). "Usar mi registro" guarda las ediciones en la agenda.
- Fix: la lista de recientes ya no se cierra sola tras pulsar × (el blur-timeout respeta el foco devuelto al input).
- **Solo ubicaciones elegidas de la lista** (no texto a mano): origen/destino/paradas deben seleccionarse del desplegable (chip bloqueado `ptar-picked`); teclear "SDAa" y darle a Crear ya no cuela como dirección suelta — avisa y no avanza. Prefill (Repetir/Generar) marca los campos como elegidos. Bajo los recientes, **pista** no clicable "✎ Escribe para buscar en toda tu agenda o en Google Maps…" (que no parezca que solo hay 5).

**SITIOS (agenda)**:
- **Borrar** cualquier sitio (catálogo o propio) desde su detalle, con confirmación. El borrado solo lo quita de agenda+buscador (`localStorage dynamoSitesDeleted`); **los envíos/presupuestos consolidados conservan todos sus datos** (siteDe sigue resolviendo la clave). Re-guardar el sitio lo revive.
- **Tipo de lugar** (`tipoLugar`) en la ficha: desplegable en el formulario (Almacén/Nave · Obra · Zona urbana · Evento · Finca/Agrícola). Al elegir un sitio en el tarifador se **autoselecciona** su tipo; si el usuario lo cambia, al confirmar **se consolida en la ficha**.
- **Recargos de precio por tipo** (mock, pendiente validar): Almacén 0 · **Obra +5% · Evento +15% · Zona urbana +20% · Finca/Agrícola +25%**, sumando origen + destino + paradas; cambiar un tipo recalcula el precio en vivo.

**CONFIRMACIÓN DE ENVÍO** (paso 2):
- Resumen SIN origen/destino/paradas (no duplica las fichas). Añadida fila **Precio … € (IVA 21% no incluido)**.
- Fichas de lugares **numeradas en orden de ruta** con el circulito naranja/verde del formulario (① Recogida / ① Entrega; el destino es la última entrega). Los puntos sin ficha (dirección suelta) también salen.
- Cada ficha con TODOS los datos: dirección (solo calle) y CP/localidad/provincia/país en **campos grises bloqueados**, "Ver en Maps", **Tipo de lugar** no editable, y editables empresa/horario/tfno/contacto/notas.
- **Referencia interna y anotaciones editables ahí mismo** (sincronizadas con el paso 1 y el pedido).
- **Cancelar envío**: aviso legal completo (después de las **9:00 del día hábil anterior** puede conllevar el **coste del servicio completo**, es por ley, arbitrajes fallan a favor del transportista, no pedir transportes sin seguridad).

**PRESUPUESTOS**: caducados con **retención de 30 días** tras caducar (después se borran; purga simulada al cargar + mock re-escalonado 2-28 días) + aviso en la pestaña Caducados. Fuera el desplegable de fecha (no filtraba); queda solo el buscador.

**TABLAS**: Ruta y fechas a **línea completa sin saltos** (nowrap, scroll horizontal interno) con **dirección en negrita** (envíos y presupuestos). **(Creado: dd/mm/yy · hh:mm)** en la 1ª columna de envíos. Fix **font boosting de Safari iOS** (`text-size-adjust:100%` — inflaba texto de unas filas sí y otras no).

**DASHBOARD rediseñado**:
- Fila única: **Nuevo envío · Mis últimos envíos (1 fila de muestra) · Nuevo presupuesto** (móvil: botones arriba, muestra debajo). Eliminada la tarjeta Últimos presupuestos.
- **Muro de clientes** (carrusel TRIPLE de la web pública, 32 logos de `index.html`) + **carrusel de servicios** (las 4 tarjetas de la web) — con fade lateral y **bucle sin brincos** (margen por tarjeta en vez de `gap`: con gap, translateX(-50%) no cae exacto y saltaba ~8px/vuelta; la web pública AÚN tiene ese gap → TODO con OK pendiente).
- Sección **NUESTRA FLOTA / Tipos de Vehículo** al final, portada de la web (2 veh-cards con specs + nota de flota exclusiva).
- Chips de la topbar **unificados** (logo, campana, CESCE, Álvaro, JG: 40px escritorio / 36px móvil, píldora, mismo borde/fondo).

**OTROS**: usuario demo → **Marbex Industrial S.L.** (inventada, fuera Talsa). "Ver todos" en Mis últimos envíos. Etiqueta "CP, localidad, provincia y país". Revertido `overscroll-behavior-y:none` (bloqueaba pull-to-refresh y amortiguación en iOS; el "espacio fantasma" era caché). **Preview compartible**: para que externos prueben el mockup sin cuenta, desactivar **Vercel Authentication** en Settings → Deployment Protection del proyecto `dynamo-web` y compartir el enlace del preview (los previews no se indexan).

**Pendientes** (en TODO.md): aplicar el fix del micro-brinco al muro de clientes de la web pública (`main`, con OK); validar recargos por tipo de lugar y tarifa real con el cliente.

### 2026-07-04 — Claude Code web (nube)

> **Sesión de flujo del tarifador/panel + simplificación del modelo de ramas.** Trabajo de portal en **preview** (`claude/sharp-dirac-E3UIO`); un cambio público a **producción** (`main`): aviso de fecha fija en el tarifador del hero.

**FLUJO NUEVO ENVÍO / PRESUPUESTO (`dashboard.html`, preview)**:
- Botón **"Nuevo presupuesto"** de vuelta en el listado de Presupuestos y en el panel general. Ambos abren el MISMO formulario unificado vía `openNuevaCarga(mode)`.
- **Modo de entrada** ('envio' | 'presupuesto'): desde presupuesto → Guardar presupuesto a la izquierda (destacado) y Crear envío a la derecha (discreto, con aviso "¿generar un envío?"); desde envío → Guardar presupuesto discreto en gris, con aviso "solo guarda el precio, no genera envío".
- **Pantalla de confirmación**: aviso legal ámbar ("la recogida nunca está garantizada al 100%…") + **un solo check** de condiciones generales (el texto de la recogida se incorporó al apartado 14 de las condiciones). "Confirmar envío" bloqueado hasta marcarlo. "Limpiar" oculto en el paso de confirmación.
- **Aviso de fecha fija** (1 solo día futuro) en la caja ETA del panel Y en el tarifador público (`index.html` → **main**): recomienda ventana de 1 a 2 días. Si es hoy, se mantiene "carga hoy para hoy".

**DASHBOARD — layout y filtros (`dashboard.html`, preview)**:
- Stat cards simplificadas: **Envíos · Presupuestos · Incidencias** (sin subtítulos). **CESCE** baja a esa fila → **fila de 4**. Botones Nuevo envío/presupuesto en su **fila de 2**.
- Barra de filtros de Envíos: desplegable de mes con título **"Fecha"** (reaparece al restablecer) y más corto; desplegable **"Estado"** unificado (envío + vehículo) **solo en la pestaña Programadas** y sin Entregado/Cancelada; **buscador ensanchado** (ya no enano).

**SIMPLIFICACIÓN DEL MODELO DE RAMAS (decisión del usuario)**:
- **Eliminada la rama permanente `lab`** (contenido idéntico a preview; solo generaba cascadas de 3 pasos y conflictos de merge). Ahora **2 ramas vivas**: `main` (producción) + `preview` (portal). Experimentos → ramas cortas `lab/<algo>` desde preview, previsualizadas por Vercel y borradas/mergeadas a demanda. **Regla 9 reescrita** a este modelo.
- **Limpieza de ~20 ramas muertas** en GitHub (las borró el usuario; el entorno da 403 al borrar remotas): todas las `fix/*` y `chore/*` ya mergeadas a main, las `claude/*` de sesiones antiguas, `lab`, y dos ajenas a la web (`claude/email-template-web-style-gyb3js` = plantilla de email Brevo; `staging/montesblanco-export` = otro proyecto). **Repo final: solo `main` + `claude/sharp-dirac-E3UIO`.** `main` sigue sin proteger (si se activa "Protect this branch": solo bloquear force-push/borrado, NO exigir PR — rompería el push directo a main).
- Repaso de calidad del código (a petición): sólido y pragmático para un mockup estático, pero con deuda técnica real — sobre todo **duplicación** (tarifador copiado en `index.html` y `dashboard.html` → causó el conflicto de merge del día; chrome del portal repetido en 6 páginas). **Pendiente propuesto**: extraer el tarifador a `js/tarifador.js` compartido (Paso A), como ya se hizo con `festivos.js`. No iniciado.

### 2026-07-02 — Claude Code web (nube)

> **Sesión larguísima de rediseño de las TABLAS del panel + flujo unificado de creación + pulido del tarifador.** Casi todo **preview** (`claude/sharp-dirac-E3UIO`) con cascada a **lab**. **A producción (`main`)**: fix de tooltips del tarifador público, equivalencia de palets en el selector de metros (web pública) y alineación/separación de paradas en el tarifador público. Estado final: `main 4fc957c` · `preview a3c04c3` · `lab f6e2ae4`.

**REDISEÑO TABLA DE ENVÍOS (`dashboard.html`, preview/lab)** — `renderCargasTable`, columnas nuevas:
- Columnas finales: **Envío · Fecha · Ventana · Ruta · Mercancía · Vehículo** (se quitó la columna Estado; todo el estado vive en Envío).
- **Envío** (col 1): nº + ref. cliente (línea gris) + **badge de fase** (Programado/Hacia la carga/Cargando/En ruta/Entregado) + **línea de asignación de transportista** (Confirmado/Asignándose/En espera) debajo + icono 📄 albarán en entregadas.
- **Fecha · Ventana**: fecha confirmada, o **rango inicio–fin de ventana** (`ventanaRango`); debajo horario del almacén origen + hora estimada de carga. **Sin chips** HOY/MAÑANA (los quitó el usuario). Añadida línea **"(Faltan N días)" / "(Excedido N días)"** hasta la fecha más tardía de la ventana (solo programadas vivas, no entregadas/canceladas).
- **Ruta**: dirección completa `CP, población, provincia, país` con **punto naranja (origen) / verde (destino)**. Mock: mapa `CITY_ADDR` por ciudad + `ciudadDir()` con fallback país (PT/FR/DE/IT/NL/BE/LU/AT/PL/CZ/CH/UK). En producción vendrá del backend.
- **Mercancía**: tipo + medidas en **toneladas** (`medidasTn`, `m · Tn`, no kg) + **Completo/Grupaje** (`cargaCorta`/`cargaFromMedidas`: 13,2 m→Completo, menos→Grupaje; derivado si falta el dato). Sin el detalle de mercancía (queda en el modal).
- **Vehículo** (nueva): **matrícula** + tipo camión; ancho ajustado a la matrícula más larga (`td.vehiculo` nowrap).
- **Badges de fase con punto parpadeante** (col Envío): Programado gris oscuro · **Hacia la carga blanco + punto azul** · Cargando naranja flúor · En ruta azul oscuro/letras blancas + verde flúor · Pendiente Asignar rojo. Entregado/Cancelada sin punto. Anim `badgeDotBlink`, respeta `prefers-reduced-motion`.
- Quitadas las subpestañas **Programadas pendientes/confirmadas** (quedan Programadas · Entregadas · Canceladas · Todas).

**TABLA DE PRESUPUESTOS (`dashboard.html`)** — unificada con envíos:
- Col **Presupuesto** (nº + ref cliente + badge Vigente/Caducado) · **Fecha solic.** (solicitud / caduca / "En N días caduca" o "Caducado", `presupVigencia`) · **Ruta** con puntos · **Mercancía** (tipo + m·Tn + Completo/Grupaje) · **Precio**. Quitada la columna "Vigente hasta".

**FECHAS MOCK DINÁMICAS (`CARGAS_DATA`)** — helpers `mockHoy/mockFuturo/mockPasado` para que **siempre** se vean todos los estados relativos a hoy (2 pasadas pendientes de asignar, 3 hoy en fases Hacia la carga/Cargando/En ruta vía inyección existente 1299/1304/1305, resto futuras Programado). Ya no se quedan obsoletas.

**FLUJO UNIFICADO DE CREACIÓN (`dashboard.html`)**:
- El formulario de **crear envío** es el único punto de entrada. Dos botones abajo **en 2 columnas** (Crear envío | Guardar presupuesto) más altos (60px) + Cancelar a lo ancho (52px). `finalizeSave(d, saveMode)` + `readAndValidate(skipFecha)` → Guardar presupuesto no exige fecha ni flujo legal.
- **Eliminada la sección `sec-nuevo-presupuesto`** y el botón "+ Nuevo presupuesto" del listado.
- **"Repetir envío"** (cualquier carga) y **"Generar carga"** (cualquier presupuesto) abren ese MISMO formulario **auto-rellenado** (`window.prefillTarifador`) con origen/destino/ml/peso/mercancía/ventana/camión + **precio heredado** en la caja ETA.

**BUGS ARREGLADOS (raíz: el rediseño de columnas rompió lecturas del DOM)**:
- `cargaRowData`/`presupuestoRowData` leían con selectores antiguos (`.route`, `.amount`, `cells[4]`) → ahora leen del **objeto por ref** (`rowRef` + `shallowCopy`). Arreglaba "Ver detalle", "Reportar incidencia", etc.
- **`findRowByRef`** comparaba el `textContent` completo de la celda `.ref` (que ahora lleva nº + ref cliente + badge) → nunca casaba → **los botones del modal (Generar carga/Repetir) no hacían nada**. Ahora compara solo con `.ref strong`. (Era el "no acciona nada" reportado.)

**TARIFADOR (panel + web pública)**:
- **Tooltips ℹ (Trampilla/NIMA)**: ya no se quedan fijos al clicar con ratón (`:hover` solo con `@media (hover:hover)` + `:focus-visible` + clase `.tip-open` para táctil; tap fuera cierra). Colocación arreglada: la animación `secFadeIn` de `.section` con `fill:both` dejaba un transform residual que rompía el `position:fixed` → cambiado a `backwards`. **→ web pública a producción.**
- **Equivalencia de metros lineales en palets** en el selector (`paletsEquiv`): "N europalets · M americanos" (2,5 europ/ml, 2 amer/ml, **enteros redondeando hacia abajo**; 13,2 m = 33 europalets · 26 americanos). Panel + web pública. **→ producción.**
- **Paradas (recogidas/entregas)**: alineadas con origen/destino (reservado el hueco del botón "−" con `padding-right`) y **separadas entre sí** (gap interno = row-gap del grid). Panel + web pública. **→ producción.**
- Etiquetas caja ETA: "Carga (ventana)" → **"Fecha de envío"**; "Entrega estimada" → **"Fecha entrega estimada"**.

**OTROS**:
- `.dash-top-row`: **Nuevo envío 2/3 + CESCE 1/3**, grid de 3 col alineado con las stat cards.
- Mini-listas "Últimos envíos/presupuestos" con filas detalladas (fecha / direcciones con puntos / estado+metros+peso+mercancía).
- **Árabe** añadido al selector de idiomas (web pública + panel + páginas del portal) tras Francés — la web pública fue a producción.
- Banner de cookies reducido al mínimo legal.
- **iOS data detectors**: las direcciones de la tabla se convertían en enlaces al mapa → `<meta format-detection>` + neutralizado `a[x-apple-data-detectors]` con `pointer-events:none` (al tocar la fila se abre el detalle, no Google Maps).
- **Botones**: `justify-content:center` en la regla base `.btn-*` (criterio unificado; antes unos a la izquierda).

**Pendientes**:
- **Tarifa real del cliente** para sustituir el precio MOCK del tarifador (y la equivalencia exacta de palets si difiere de 2,5/2 por ml).
- **Direcciones reales** de cargas/presupuestos (hoy `CITY_ADDR` es mock por ciudad).
- Contradicción visible en algunos envíos: badge de fase "Pendiente Asignar" (retrasada) junto a "Confirmado transportista" — revisar semántica cuando haya datos reales.
- Vercel: muchos pushes hoy → posible cola del plan Hobby; si la preview/producción no refresca, cancelar deploys en cola dejando el último.

### 2026-07-01 — Claude Code web (nube)

> **Sesión larga de pulido del PANEL + port del tarifador a la web pública.** Casi todo en **preview** (`claude/sharp-dirac-E3UIO`) con cascada a **lab**. **Única cosa a producción (`main`)**: ocultar el spinner colgado de Google Translate en `index.html`. El tarifador público replicado está SOLO en preview, pendiente del OK del usuario para promocionar.

**TARIFADOR DEL PANEL (`dashboard.html`, preview/lab) — muchos ajustes**:
- **Efecto contador del precio**: corregido para que anime en **todas** las opciones que mueven el precio (no solo la trampilla) y recupere su **tamaño** (el span de "(IVA 21%…)" ahora tiene clase `.ptar-iva`, ya no encoge el número). La animación arranca del número visible en el DOM (`fromPrice`).
- **Aviso rojo correcto al faltar fecha**: antes mostraba "Introduce el origen y el destino" aunque estuvieran puestos; ahora el caso sin fecha dice "Selecciona la fecha de envío…" y el aviso se oculta al elegir fecha válida.
- **Carga HOY para HOY a cualquier hora**: `firstLoadDate` ofrece HOY como primer día en todos los modos (fuera el corte de las 14:00; solo salta findes/festivos). Nuevo **aviso ámbar** en la caja ETA (y en el modal de confirmación, junto a lo de cancelar): "no se garantiza cargar en el día… cancelación <24 h conlleva cargos una vez asignado transportista". El aviso solo sale si es **hoy + fecha fija (1 día)**; con ventana 1-2/1-4 no.
- **Caja ETA a una sola columna** (etiqueta encima del valor), y el aviso hoy-para-hoy **arriba** a ancho completo (el `.ptar-eta-box` pasó a `flex-direction:column`).
- **Paradas** (recogidas/entregas): límite final **máx 2 en total** en cualquier reparto (2+0, 0+2, 1+1). Al llegar a 2 se ocultan los "+", reaparecen al borrar con "−".
- **Toggle "Requiere NIMA"** (residuos) junto a la trampilla, mismo estilo No/Sí, **+50 €**, tooltip, se refleja en resumen. **Trampilla y NIMA colocados después de metros/toneladas**.
- **Al desactivar la trampilla** (vuelve a Tauliner) → metros/toneladas al **máximo de trailer completo (13,2 m / 24 Tn)**, no al valor previo del rígido.
- **Tipo de mercancía**: quitado solo el **título** (el selector se queda, con `aria-label`). **Nuevo envío y Nuevo presupuesto igualados** (mismos campos y orden: mercancía → ml/peso → trampilla/NIMA; NIMA añadido también a presupuesto).

**REDISEÑO CLARO DEL PANEL (`dashboard.html`, preview/lab)**:
- **Tipografía**: fuera `text-transform:uppercase` en labels/encabezados/tablas/stats/modales; todo **sentence case**, `letter-spacing:0`, escala de texto pequeño unificada a 2 niveles (etiqueta 0,78rem/600 gris · encabezado sección 0,82rem/700 navy). Solo quedan en mayúscula el acrónimo **CESCE** y los chips de urgencia (HOY/MAÑANA/RETRASADA).
- **Barra superior (topbar) blanca** con acentos morado/verde (antes gradiente morado). Logo a color, píldoras Álvaro/JG sobre gris claro con texto navy, halos verde/morado al hover.
- **Tarjeta CESCE a clara** (era negra) — blanca con borde gris, verde "Cobertura" y ámbar/rojo del estado como acentos.
- **Tamaño mínimo de texto** subido (badges 0,65→0,72rem, sub sidebar, etc.); en móvil las stats ya no bajan de ~0,7rem (antes 0,52–0,6rem, casi ilegible).
- **Sidebar clara estilo Cabify**: blanca con borde gris, enlaces gris oscuro, **activo en morado suave** (fondo rgba morado + texto/icono morado), badge naranja, logo a color. El panel queda **todo claro y coherente** (topbar + sidebar + CESCE).

**TARIFADOR EN LA WEB PÚBLICA (`index.html`, SOLO preview/lab — pendiente OK para producción)**:
- **Replicado el formulario del panel** en el hero público (sustituye al antiguo `.tar-*` por `.ptar-*`): ruta con **paradas** (recogidas/entregas máx 2), tipo origen/destino, mercancía (3), metros/toneladas reactivos a la trampilla, toggles **Trampilla + NIMA**, fecha (hoy permitido) y ventana. Reutiliza autocomplete OSM, Flatpickr y `festivos.js`.
- **Sin precio/ETA/festivos/guardado** (decisión acordada: no enseñar precio inventado en público). El botón "**Solicitar tarifa**" sigue generando el **mensaje** para email (`info@dynamotrans.com`) y WhatsApp (`34628995709`) con TODOS los campos nuevos.
- **Compactado en 2 pasadas** (controles 44→38px, gaps y título menores): la caja bajó de ~ tamaño pantalla completa a **~510px**.
- Portado por subagente y **verificado en Chromium headless** (se abre, campos OK, paradas OK, CTA revela email/WhatsApp con URL correcta, sin overflow, sin errores JS nuevos).

**A PRODUCCIÓN (`main`)** — **único cambio público del día**:
- **Ocultar el spinner colgado de Google Translate** (bug conocido de GT que se quedaba en la esquina). Reglas CSS (`.goog-te-spinner-pos`, iframe de carga) en `index.html` (main `6ec8cda`) + las 5 páginas del portal (preview/lab). Flujo main-first respetado (rama corta `fix/gt-spinner-public` → merge a main → cascada preview/lab).

**Pendientes**:
- **Promocionar el tarifador público a producción** cuando el usuario lo revise en preview y dé el OK ("publica el tarifador").
- **Tarifa real** del cliente para sustituir el precio MOCK del tarifador del panel.
- Opcional: mostrar "entrega estimada" (sin precio) también en el tarifador público, si el usuario lo quiere.
- Opcional: separadores de sección tipo Cabify ("GESTIÓN/CUENTA") en la sidebar si crecen los enlaces.
- Single source real del tarifador (módulo compartido panel/público) para no acumular drift — hoy son copias independientes.

### 2026-06-28 (sesión 2) — Claude Code web (nube)

> **Sesión larguísima de rediseño del tarifador del panel** (`dashboard.html`, solo preview/lab). Todo commiteado y pusheado a `preview` (`fc307ca`) y `lab` (`c6c5bd5`). `main` sin tocar hoy. Al final saltó el **límite de Vercel Hobby (100 deploys/día)** por la cantidad de pushes — no se pierde nada, los previews vuelven a construir solos en ~24h.

**TARIFADOR / FORMULARIO "NUEVO ENVÍO" (antes "Nueva carga") — reescritura grande**:
- **Terminología**: "carga(s)" → **"envío(s)"** en textos de entidad (menú, sección, botones: *Crear envío*, *Confirmar envío*, *Guardar presupuesto*, *Nº envío*, *Envíos activos*, etc.). Se mantienen términos del **acto de cargar** (*Fecha de carga/envío*, *Ventana de carga*, sección **Carga**, texto legal). CTA del dashboard "Nuevo envío"; **quitado el CTA "Nuevo presupuesto"** (fila a 2 columnas).
- **Bloques** del formulario: **Ruta / Carga / Fecha de envío** (cabeceras de sección dentro del grid).
- **Ruta apilada con paradas**: origen y destino a ancho completo; **+** al final de la fila de origen (añade **recogida** = origen adicional) y de destino (añade **entrega** = destino adicional), con **−** para quitar. Hasta **4** en total. Se insertan en su sitio (recogidas tras origen, entregas tras destino). **Nº de orden del recorrido** en badge (1 origen → 2.. → último destino), **naranja** recogidas/origen y **verde** entregas/destino. Mismo esquema que origen/destino (autocomplete OSM + selector de tipo Almacén/Obra/Urbana/Evento/Finca). ETA suma los tramos en orden.
- **Tipo de camión quitado** (fijo Tauliner; con **trampilla elevadora** ON pasa a rígido → máx 8 m / 14 Tn; OFF → 13,2 m / 24 Tn). Toggle "Trampilla elevadora" (No/Sí con precio, traducible). Label de camión en resumen: *Trailer Tauliner Lona* / *Camión Rígido con trampilla elevadora*.
- **Tipo de mercancía** reducido a 3: Paletizado (por lateral) · No paletizada lateral · No paletizada por TECHO.
- **Tipo origen/destino**: Almacén / Nave · Obra · Zona urbana · Evento · Finca / Agrícola (por defecto Almacén/Nave). Pequeño a la derecha del input (75/25).
- **Metros/Toneladas**: opciones "N metros"/"N toneladas"; **por defecto carga completa (13,2 m) y 24 Tn**. Sin labels (placeholder/aria).
- **Caja ETA**: sin título; sin Distancia/Tracción ni % carga del camión; solo **Carga (ventana)** (naranja) y **Entrega estimada** (verde), mismo tamaño. **Precio orientativo (MOCK)** con **efecto contador** (rolling, de 10 en 10, easeOutCubic ~480ms) que varía con distancia/ventana/mercancía/trampilla/paradas. ⚠ Falta la **tarifa real** del cliente.
- **Avisos**: el de festivo y el de "no se asigna camión hasta confirmar" van a **ancho completo** bajo el par fecha+ventana; el de **precios dinámicos (>7 días)** pasó al **resumen del paso 2** (fuera del formulario). Tooltips ℹ posicionados por JS **pegados al icono y clampeados** a pantalla (no se recortan en móvil).
- **Alturas uniformes 44px** en todos los controles (inputs, selects, tipo, toggle). **Compactado** para móvil. Botón **Limpiar** en la cabecera (sustituye a "Volver"); resetea todo incluido paradas y tipos.
- **Quitado**: "Sin fecha definida/Previsión" del selector y la pestaña "Previsión sin fecha" de la tabla; botón **Exportar** de la tabla de envíos; intro de "tarifa cerrada/25 min"; explicación del camión.
- **CESCE**: aviso de proforma en icono ℹ con tooltip (no agranda la tarjeta). **Modo oscuro eliminado**.
- **Condiciones generales**: añadidos apdos **13 (Disponibilidad y ajustes de tarifa)** y **14 (Garantías y confirmación)**; quitados de la pantalla de confirmación (siguen en el enlace).

**Pendientes**:
- **Tarifa real** del cliente para sustituir el precio MOCK del tarifador.
- Vercel: agrupar pushes para no volver a tocar el límite de 100/día (o pasar a Pro cuando el portal vaya en serio).
- Festivos **regionales por subdivisión exacta** (Nominatim `address.state`) si se quiere afinar el sobre-aviso.
- Decidir si quitar también el "+ Nuevo presupuesto" del listado de Presupuestos / deprecar presupuestos.

### 2026-06-28 — Claude Code web (nube)

> **Festivos unificados en un registro único** (`/js/festivos.js`) compartido por web pública + portal, **promovido a producción**. Después, **capa regional opcional vía Nager.Date** (API en el front, sin clave) con dedupe. Las 3 ramas con `festivos.js` byte-idéntico.

**REGISTRO ÚNICO DE FESTIVOS (`/js/festivos.js`) — a producción (`main`)**:
- Nuevo archivo `js/festivos.js`: `window.FESTIVOS` con `get(cc,date)`, `getLocal`, `countryName`, `supported`, `easterSunday` (Computus de Gauss). Festivos **nacionales de los 12 países** de servicio (España, Portugal, Francia, Alemania, Italia, Suiza, Países Bajos, Bélgica, Luxemburgo, Austria, Polonia, Rep. Checa), con fijos + móviles por offset de Pascua.
- **`index.html`** (producción `main` `7fb99fc`): `easterSunday`/`getHolidayName` ahora **delegan** en `FESTIVOS` (antes lista inline propia). Añadido `<script src="/js/festivos.js">`. Mismo comportamiento exacto (se añadió Jueves Santo al registro `es` para conservarlo). Cascada preview (`99d72b8`) + lab (`10c8b55`).
- **Portal** (5 páginas, ya estaba en preview/lab): mismo patrón de delegación.
- **Verificación sin tocar fechas futuras**: generada la lista completa 2026 de los 12 países por consola (node) para cotejar a ojo con un calendario público. Móviles tipo Pascua se recalculan solos cada año (Pascua 2026 = 05/04).

**CAPA REGIONAL OPCIONAL — Nager.Date (API en el front)** (preview/lab, e `festivos.js` también a `main`):
- `FESTIVOS.ensure(cc, year)` llama a `https://date.nager.at/api/v3/PublicHolidays/{año}/{PAÍS}` (**gratis, sin API key, sin backend, CORS abierto**). Cachea 30 días en `localStorage` (1 petición por país+año).
- **Dedupe**: el local nacional **manda**; la API solo añade fechas que el local NO tiene (los regionales). Navidad/Año Nuevo nunca se duplican. Regionales etiquetados **"(regional)"** porque solo conocemos el país, no la provincia exacta (sobre-aviso prudente; el aviso solo informa, no bloquea).
- **Degradación limpia**: si la API falla / no hay red / CORS → se ignora y queda el local. La web pública **no llama** a `ensure` (capa inerte en producción).
- **Dashboard** (`dashboard.html`, preview/lab `f7bf518`): el aviso de festivo en origen/destino del tarifador pide los regionales y **se re-pinta** al llegar (flag `etaEnsured` evita bucle). Cascada lab `5c21cee`.
- Probado con mock de respuesta Nager (nacional + 2 regionales): dedupe correcto, etiqueta "(regional)" OK, caché escrita.

**Single source en las 3 ramas**: `festivos.js` byte-idéntico en main/preview/lab (hash `c9ab038`). Cambiar un festivo se hace **en un solo sitio**. Commits: main `76492a2` (capa regional inerte), preview `101c13b`, lab `327190f`.
- ⚠️ No pude probar la llamada real a Nager desde el entorno (proxy bloquea ese dominio, 403). En navegador/preview Vercel debería ir; si no, el nacional sale igual.

**Detectado (no tocado)**: **drift previo** en CSS de `index.html` entre main y preview (bloque `.why-brand-logo` duplicado + regla `.navbar-right .btn-nav-cta`), ajeno a los festivos. Pendiente de limpiar en otra pasada si el usuario quiere.

**Pendiente opcional**: festivos **regionales con subdivisión exacta** (mapear provincia del origen/destino vía Nominatim `address.state` a código ISO para no sobre-avisar); locales/municipales (Feria de Sevilla) NO los cubre ni Nager.

**CESCE — aviso de proforma en icono ℹ con tooltip** (dashboard, preview `748604e` / lab `0af4c96`):
- Problema: el aviso "sin crédito → pago previo con proforma" era un **párrafo inline** que agrandaba la `cesce-card`; como las 3 cajas de la fila superior comparten altura (`dash-top-row`, `align-items:stretch`), **deformaba los botones** Nueva carga / Nuevo presupuesto (se hacían enormes).
- Solución: el texto pasa a un **icono ℹ** junto al estado de cobertura, con el mensaje en **tooltip** al hover/focus (tarjeta ámbar flotante, `position:absolute`, sin ocupar layout). El icono **solo aparece sin crédito** (`?cesce=warn|none`); con `ok` oculto. JS togglea `.cesce-info` en vez del antiguo `.cesce-note`.
- Solo portal (preview/lab). No toca producción.

### 2026-06-27 (sesión 2) — Claude Code web (nube)

> **Lema de marca "Dynamo. Always Moving."** + banner que alterna + refinos del popup de horarios. Todo web pública → `main` + cascada lab.

**LEMA "Dynamo. Always Moving."** (sustituye a "Pick. Drop. Done." / "Operador de Transportes · Cumplimos!"):
- **Pie del menú móvil** (`mm-claim`), **footer** (`f-tagline`, sustituye "Operador de Transportes · Cumplimos!"), ambos con **Dynamo** en negrita y sin uppercase.
- **Junto al logo en el navbar**: solo **"Always Moving."** (opción B elegida por el usuario, sin repetir "Dynamo" que ya está en el logo), en **2 líneas** y más grande, con separador. Visible en móvil y escritorio; oculto solo en tablet 769-1024 (ahí el menú de 7 enlaces apretaría). Primer intento estaba oculto ≤1024 (no se veía en móvil) → corregido.
- **Banner morado superior**: ahora **alterna cada 3s** con cross-fade entre "Soluciones de Transporte. España y Europa." (traducible) y "Dynamo. Always Moving." (lema). Rehecho a **2 capas** que conviven en el DOM (no swap de innerHTML) para que GT traduzca el claim sin perderse.
- **El lema SIEMPRE en inglés**: marcado `notranslate`/`translate="no"` en las 4 ubicaciones (navbar, footer, menú móvil, capa del banner). Google Translate no lo toca.
- **Commits** (cherry-pick a main, los SHA finales fueron variando): el navbar tuvo un lío de cherry-pick (el slogan solo vivía en preview) resuelto aplicando el cambio aislado a main/lab.

**FIX menú móvil en francés** (`mm-item`): el número "04" de "Couverture" (Cobertura traducida) saltaba a la derecha porque GT **reordena** el `<span>` del número al traducir el enlace. Solución: número via **CSS** (`data-num` + `::before` con `attr()`, que GT no puede reordenar); subrayado animado movido a `::after`.

**POPUP HORARIOS — refinos**:
- Fila de agosto: "Cerrado · solo email y WhatsApp" → **"Solo email y WhatsApp"**.
- Grupo **Email y WhatsApp reordenado ANTES que Teléfono**.
- "Feria de Sevilla" → **"Semana festiva local"** + **fechas dinámicas** (martes-viernes de Feria calculados desde la Pascua, con día/fecha/mes/año, p.ej. "Del martes 21 al viernes 24 de abril de 2026"); se actualiza cada año y si ya pasó muestra la del año siguiente. **No** se nombra "Feria". JS self-contained (Computus de Gauss propio).
- **Bug de alineación**: "Semana festiva local" salía centrada. Causa real: la tarjeta heredaba `text-align:center` de `.phone-modal-card` (ganaba a `.hor-modal-card` por orden). Fix: selector doble clase `.phone-modal-card.hor-modal-card { text-align:left }`, título y subtítulo re-centrados.
- **Nota**: las fechas del popup se generan en español por JS; al traducir podrían quedarse en español (pendiente opcional: diccionario multilingüe).
- Después: **agrupados** todos los periodos de 9:00-14:00 bajo una sola fila **"Jornada intensiva · 9:00–14:00"** con lista debajo (Verano, Navidad, Semana Santa, Semana festiva local con sus fechas), para no repetir la hora. "Horario habitual" y "Agosto" se mantienen aparte. **Quitada** la frase de "festivos locales de Sevilla" (no referenciar Sevilla).

### 2026-06-27 — Claude Code web (nube)

> **Agosto 6-27 sin atención telefónica** (solo email/WhatsApp). Web pública → `main` + portal preview/lab.

**AGOSTO 6-27 → TELÉFONO CERRADO (solo email y WhatsApp)**:
- Contexto: el 24-jun pusimos agosto 6-27 como horario reducido L-V 10:30-13:30. El usuario lo cambia: del **6 al 27 de agosto NO hay atención telefónica**, solo email y WhatsApp.
- `index.html` (producción `main` `abc477d`): quitada `SCHEDULE.august`; `isPhoneHoursNow` devuelve `false` en esa ventana; etiqueta `reduced` → **"Cerrado · email y WhatsApp"** (13 idiomas); `labelAug` ya no muestra horas; modal específico **"Teléfono cerrado (6-27 agosto)"**.
- **Bug detectado y arreglado de paso**: el modal "Fuera de horario" NO contemplaba agosto (mostraba el de verano). Ahora sí.
- Online (email/WhatsApp) sigue **L-S 8:00-20:00**. Festivo 15-ago y fines de semana siguen cerrados igual.
- **Portal** (5 páginas, preview/lab `df870a4`/`46f0e14`): mismo cambio vía script (`august: {}` = teléfono cerrado, etiqueta cerrado 13 idiomas, modal agosto). No va a `main` (regla portal).
- Probado con casos límite (6 y 27 ago cerrado, 5 y 28 ago = verano 9-14, octubre 14:23 = pausa mediodía cerrado).

**POPUP "Horarios de todo el año" en la sección Contacto** (`index.html`, producción `main` `8113299`):
- Enlace **"Ver todos los horarios del año"** bajo los botones de contacto → abre popup (reusa `.phone-modal`).
- Lista: teléfono (habitual L-J 9-14 y 15-17 · V 9-14; verano; Navidad; Feria; Semana Santa; **agosto 6-27 cerrado** en rojo), email/WhatsApp todo el año L-S 8-20, y festivos nacionales + Jueves/Viernes Santo. Cierra con backdrop, ✕ o Escape. Texto traducible por Google Translate.
- Es **lista estática** (no marca el horario activo "hoy"). Pendiente opcional: badge "(actual)" dinámico si el usuario lo pide. Cascada lab `f7dd290`.
- Ajustes posteriores (a petición): fila de agosto pasa de "Cerrado · solo email y WhatsApp" → **"Solo email y WhatsApp"** (`b24f13a`); grupo **Email y WhatsApp reordenado ANTES que Teléfono** (`e05fc1d`). Ambos en producción + cascada.

### 2026-06-25 — Claude Code web (nube)

> **Autodetección de idioma**: fallback a inglés para idiomas no soportados. Web pública → `main` + cascada lab.

**FALLBACK A INGLÉS (autodetección de idioma del navegador, `index.html`)**:
- Pregunta del usuario: "¿si me conecto desde Portugal saldrá en portugués?" → aclarado que la web **no detecta por país/IP**, sino por **idioma del navegador** (`navigator.language`), solo en la 1ª visita (cookie `dynamo_lang_detected`, 1 año). Geo no influye.
- Petición: si el idioma del navegador **no está en la lista** (croata, ruso, árabe, griego…), poner **inglés** por defecto (antes se quedaba en español).
- Implementado `useLang`: español→base (null), idioma soportado→ese, no soportado→`en`. Probado con es/pt/fr/hr/ru/en/ar (los no soportados → inglés). Commit `2e63897`(preview)/`a756800`(main), cascada lab `5ea4af7`.
- **Nota**: las páginas del **portal NO tienen** este bloque de autodetección (solo `index.html`); heredan la cookie `googtrans`, así que no hubo nada que replicar.

### 2026-06-24 (sesión 3) — Claude Code web (nube)

> Bug del **muro de Clientes** (carrusel triple de logos). Web pública → `main` + cascada lab.

**FIX — tarjeta del muro de Clientes se recortaba al pulsarla**:
- Síntoma (reportado con capturas): al pulsar/hover una tarjeta de logo (`.logo-pill`) aparecía el borde morado pero la tarjeta **se cortaba por arriba** (no salía entera).
- Causa: `.logo-pill:hover` eleva la tarjeta `translateY(-3px)` + sombra, pero `.clientes-row` tenía `overflow:hidden` pegado a la altura de la tarjeta → recortaba la parte elevada y la sombra. (El `overflow:hidden` es necesario para clipar el bucle horizontal.)
- Solución: `padding: 8px 0` en `.clientes-row` (deja sitio vertical para la elevación + sombra; el clip horizontal se mantiene) y ajustado el `gap` del `.clientes-wall` (1.1rem → 0.45rem desktop, 0.7rem → 0.3rem móvil) para que la separación entre las 3 filas quede igual.
- Commit `463b439`(preview)/`71e2e17`(main), cascada lab `d8e7f33`. Producción `dynamotrans.com`.

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
