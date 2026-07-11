# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->
- [ ] **ROLES en el panel — gating + filtrado (matriz de permisos)**. **Andamiaje YA montado (2026-07-08)**: switcher de rol en el menú de usuario (Admin/Cliente/Transportista) + lector `?role=` + `localStorage dynamoRole` + `applyRole(role)` con el hueco de gating comentado + sección **Dashboard admin** (vista interna, stats globales) + `data-roles` en lo admin-only (Almacenes, Dashboard admin). **De momento TODOS ven TODO** (sin filtros, a petición del usuario mientras diseña). **Pendiente**: (1) definir la **matriz de permisos** (rol × sección × acción × filas); (2) cablear el gating real dentro de `applyRole` (ocultar `[data-roles]` que no incluyan el rol + filtrar tablas por dueño). Enfoque acordado: montar la plataforma **completa como admin** (lo ve TODO) y **restar por rol** (nunca un dashboard por rol → duplicación/drift). El panel actual ya es prácticamente el superconjunto admin.
  - **Qué montar ahora en el mockup (solo visual, para validar UX barata)**:
    - **Selector de rol de prueba** vía `?role=admin|cliente|transportista|proveedor` (y quizá un chip en la topbar para cambiarlo en caliente). Default en prod será `cliente`; `admin` lo ve todo.
    - **Gating por sección/columna/acción**: marcar cada `.sidebar-link` (data-section), cada sección, cada columna de tabla y cada botón de acción con los roles que la pueden ver (p. ej. `data-roles="admin,cliente"`). Una función `applyRole(role)` oculta lo no permitido al cargar/cambiar de rol.
    - **Matriz de permisos (rol × módulo × acción)** escrita aquí y/o en CLAUDE.md ANTES de cablear backend. Borrador inicial a validar:
      - **Admin**: todo (todos los envíos/almacenes/facturas/penalizaciones/incidencias de todos los clientes, crear penalizaciones, asignar transportista, config de tarifas).
      - **Cliente** (Marbex): SOLO sus envíos/almacenamientos/facturas/albaranes/incidencias; ve penalizaciones que le afectan (no las crea); crea envíos/almacenamientos/incidencias.
      - **Transportista**: solo viajes asignados a él; ve penalizaciones que le afectan; no ve clientes ni tarifas; no crea envíos.
      - **Proveedor**: por definir.
  - **⚠️ Recordatorio de seguridad (no olvidar al migrar)**: ocultar en el frontend **NO es seguridad**. En la app real (Next.js + Supabase) la autorización se impone **server-side**: cada endpoint valida el rol + **row-level security** en Postgres filtra las filas por usuario. El gating del mockup es solo previsualización de UX. "Limitar" son **2 dimensiones**: (a) qué módulos/columnas/acciones y (b) qué **filas** (data scope por usuario) — ambas obligatorias en backend.
- [ ] **Modo mantenimiento — control admin + logout de sesiones (backend)**. **Mockup YA montado (2026-07-09)**: interruptor **kill-switch** en el **Dashboard admin** (movido desde el menú de usuario) que activa un **overlay a pantalla completa** bloqueando el portal para TODOS tras el login (solo queda el contacto: email / WhatsApp / teléfono, con selector de idioma). On/off por `?maint=1|0` + `localStorage dynamoMaintenance`; el overlay lleva enlace de salida siempre visible. **Pendiente backend (NO olvidar)**: al marcar mantenimiento se debe **(1) invalidar / cerrar las sesiones activas** — deslogar de verdad a quien esté dentro (no basta con ocultar la UI en el front); **(2) impedir nuevos logins** mientras esté activo; **(3)** guardar el flag **server-side** (no en localStorage) para que sea global y no por navegador. El front del mockup solo bloquea la UI; la invalidación de tokens/sesiones es obligatoria en producción.

## 📋 Normal
- [~] **Aviso de festivo AUTONÓMICO específico de la comunidad de origen/destino** (decidido 2026-07-08: **solo avisar, NO bloquear**). **MOCKUP HECHO 2026-07-11** (preview `5a2046a`): el aviso de la caja ETA ya filtra por la **comunidad del punto** de recogida/entrega — nacional siempre avisa, autonómico solo si coincide con la comunidad del sitio.
  - **Ya implementado**: `festivos.js` conserva los `counties` de Nager y expone `regionsOf(cc, fecha)`; `dashboard.html` mapea `address.state` de Nominatim → ISO (`stateToRegion`), guarda la comunidad en `wrap.dataset.region`, y `holsInRange` filtra por región. Verificado con Nager mockeado (Murcia no ve festivo de Valencia, etc.).
  - **PENDIENTE**: (1) **verificar en el preview REAL de Vercel** — en el entorno de Claude el proxy bloquea la API de Nager (403), así que el filtro autonómico solo se probó con datos mock; los nacionales sí van siempre. (2) **Sync de `festivos.js` a `main`** cuando el usuario quiera (cambio aditivo, no altera `dynamotrans.com`).
  - ⚠ Solo llega a nivel **autonómico**, no municipal (la Feria de Sevilla u otros locales NO los cubre Nager) → ver el ítem del dataset de backend.
  - ⚠ `festivos.js` es archivo **compartido** (web pública + portal): al sincronizar a `main` verificar que queda byte-idéntico.
- [ ] **Dataset completo de festivos ES (nacional + autonómico + local) en el BACKEND** (idea del usuario 2026-07-08). Objetivo: cubrir los 3 niveles con **datos reales**, consultables por ubicación exacta.
  - **NO se hace a mano** (riesgo de fechas erróneas → bloqueos/avisos falsos). Los **locales** son ~8.100 municipios × 2 festivos/año (~16.000 entradas) publicados en 50 boletines provinciales; imposible de teclear con garantías.
  - **Estructura**: tabla `festivos { fecha, ambito ('nacional'|'autonomico'|'local'), codigo (ES / ES-AN / código INE municipio), nombre }`. NO una cuadrícula día×municipio (serían ~3M celdas/año) — se guarda solo el día que ES festivo.
  - **Fuentes oficiales / open data**: nacional+autonómico del BOE o datos.gob.es; municipales de los portales open-data de cada CCAA (los publican Andalucía, Cataluña, etc.). **Se puebla 1 vez al año**.
  - **Consulta**: por código **INE del municipio** de origen/destino (derivado de la geolocalización Nominatim → INE). Bloqueo = nacional; aviso = autonómico/local del punto.
  - Mientras tanto (mockup): nacional en `festivos.js` (bloquea) + autonómico vía Nager (solo aviso). No inventar municipales.
  - **DECIDIDO 2026-07-08**: se hace en el **backend** (montar la tabla + ingesta anual). **El usuario recopila las bases de datos oficiales / open data** (nacional+autonómico del BOE/datos.gob.es; municipales por CCAA) y las pasa; Claude las carga/parsea a la tabla. No se teclea a mano ni se hace en el mockup.
- [ ] **Aplicar a la web pública el fix del micro-brinco del carrusel de clientes** (`index.html` → `main`): el track usa `gap` de flex y `translateX(-50%)` no cae exacto (salta ~8px por vuelta). En el panel ya está arreglado (2026-07-05) con `margin-right` por tarjeta en vez de `gap` — son 3 líneas de CSS. Pendiente de OK del usuario (es cambio público → rama corta desde main, regla 8).
- [ ] **Validar con el cliente los recargos por tipo de lugar** del tarifador (2026-07-05, mock): Almacén 0 · Obra +5% · Evento +15% · Zona urbana +20% · Finca/Agrícola +25%, sumando origen + destino + paradas. Ajustar cuando llegue la tarifa real.
<!-- Cosas que hacer cuando haya tiempo -->
- [ ] **Refactor anti-duplicación del tarifador (Paso A)** — _decidido 2026-07-04: NO se hace sobre el mockup HTML (código que se reescribe en Next.js); se hace al migrar, con este plano._
  - **Problema**: el tarifador está **copiado** en `index.html` (público) y `dashboard.html` (panel). (Ojo: dentro del panel, "Nuevo envío" vs "Nuevo presupuesto" NO son copias — ya es el mismo form con flag `entryMode`/`data-ptar-mode`. La duplicación real es solo público ↔ panel.) Se desincronizan → bugs (p.ej. el aviso de fecha fija estuvo primero solo en el panel).
  - **Diseño objetivo** (patrón "genérico + opciones", como ya se hizo con `js/festivos.js`): un único `initTarifador(contenedor, opciones)` con el **núcleo compartido** (autocomplete OSM origen/destino, camión/trampilla, mercancía, metros/toneladas, paradas, ventana, y toda la lógica reactiva: grupaje, equivalencia de palets, avisos de fecha fija). Las **diferencias van en `opciones`, no en copias**:
    - `mode: 'public' | 'envio' | 'presupuesto'`
    - `showPrice` / `showEta`: `false` en público, `true` en panel
    - `onSubmit(datos)`: público → construir mensaje email/WhatsApp; panel → precio + ETA + paso de confirmación + guardar en `CARGAS_DATA`
  - En **Next.js** esto es literalmente **un componente** `<Tarifador mode="public|envio|presupuesto" />`. Ahí sale gratis y natural.
  - **Paso B** análogo: el "chrome" del portal (FAB avatar `contact-fab`, horarios `SCHED_VOCAB`/`buildLabels`/`isPhoneHoursNow`) repetido en las 5 páginas del portal → módulo compartido / componente al migrar.
  - Si excepcionalmente hubiera que hacerlo **antes** de Next.js (porque la duplicación duela demasiado): extraer a `js/tarifador.js`, cargar con `<script src>` en ambas páginas, y **verificar en headless que público y panel se comportan idénticos** antes/después.
- [ ] **Festivos autonómicos y locales en el SCHEDULE** (opcional): ahora `getHolidayName()` solo tiene los **festivos nacionales** + Semana Santa (calculada). Faltan los de **Andalucía** (ej. 28 feb Día de Andalucía) y los **locales de Sevilla** (feria, Corpus, etc.). Si se añaden, el teléfono se marcará cerrado también esos días. Está en los 6 HTML (index + 5 portal) — al tocar, replicar en todos o (mejor a futuro) centralizar cuando pase a Next.js
- [ ] **Editor de cargas con flujo legal al asignar fecha a una Previsión** (`dashboard.html`, sesión dedicada): cuando el cliente edita una carga en estado "Programado sin fecha" y le asigna fecha real, debe dispararse el mismo flujo legal que en Nueva carga (paso 2: aviso de grupaje condicional + disponibilidad + garantías + condiciones generales → modal IMPORTANTE de cancelación → guardar). En el código está documentado como `// TODO en el editor de cargas` dentro del submit del tarifador. Implica también cablear "✏️ Modificar" (ahora abre modal con campos hardcoded sin lógica real) — Ver detalle, edición parcial vs completa, validación de fecha, etc.
- [ ] **Afinar tabla de coeficientes** del tarifador con los valores exactos del cliente entre 25% y 100%. La función `coefMl(ml, camion)` en `dashboard.html` usa ahora una interpolación razonable por bandas (0.06 → 25%, 0.08 → 33%, 0.125 → 40%, …). Cuando el cliente pase la tabla completa, ajustar los breakpoints reales. El motor (`max(coef_ml, coef_tn, coef_palets)`) y la UI ya están funcionales
- [ ] **Google Places API** para autocomplete origen/destino: ahora uso OpenStreetMap Nominatim (gratis, sin API key, pero servicio público compartido → respuestas en ~0,5-1s). Migrar a Google Places cuando se valide que vale la pena. Requiere clave del cliente en Google Cloud (~200$/mes gratis cubren el tráfico esperado, son ~70k autocompletados/mes)

## 💡 Ideas / Futuro
<!-- Mejoras a considerar -->
- [ ] **Backend del panel cliente** (Supabase + n8n) — diseñado en mockup, pendiente de implementar:
  - **Cargas / presupuestos / facturas**: las listas del panel son mockup con datos en JS (28 + 19 + 38 entries). Cuando exista backend, sustituir los arrays por `fetch()` a endpoints REST/GraphQL con paginación server-side. Refactorizar `renderTable()` a async
  - **Filtros**: los actuales son frontend (filtrado en cliente sobre el array). En backend: query params en el GET (`?estado=programada&desde=...&q=...&page=2`). Debounce 300ms en el search input
  - **Reclamar albarán** (botón "📩 Reclamar albarán" tras 14 días sin doc): endpoint backend que dispare email/WhatsApp automático al transportista pidiendo la doc. Mockup actual solo muestra un success
  - **Acciones editables** (Editar carga, Modificar, Cancelar): endpoints PUT/PATCH con validación server-side. Confirmación con audit log
  - **Subir albarán** (cuando un transportista nos lo envía por email): probable flujo n8n que detecte adjuntos en `info@dynamotrans.com` y los asocie a la carga por matching de #C-2026-XXXX en el subject/body. Cuando exista, el panel debe mostrar el chip 📄 automáticamente
  - **Notificaciones del cliente**: cuando una carga cambia de estado (programada → en ruta → entregada), email al cliente. Cuando se sube albarán, email "Ya tienes el albarán de #C-XXXX disponible en tu panel"
- [ ] **Flujo de alta passwordless (decidido en mockup)**: registro → verificación con **enlace + código de 6 dígitos** enviados al email (el enlace lleva directo a crear-password.html; el código es fallback cuando el enlace no funciona / dispositivo distinto) → pantalla "Crea tu contraseña" con medidor de fortaleza y checkbox "Recordarme 90 días". Ya hay vista previa en `registro.html` → `verificar.html` → `crear-password.html`. Backend pendiente
- [ ] **Duración de sesión del portal**: decidido en mockup → **30 días** por defecto, **90 días** si marca "Recordarme en este dispositivo". Forzar logout solo al cambiar contraseña. Estándar B2B logístico (XPO Connect, DSV, Maersk)
- [ ] **Roles de usuario en el portal**: el `registro.html` actual envía siempre `tipo_usuario=cliente` (hidden input). Cuando se habilite el alta de transportistas/proveedores, convertir ese hidden en un selector visible (radio Cliente / Transportista / Proveedor) y persistir el rol en backend para diferenciar permisos, vistas del dashboard y notificaciones. Migración futura: usuarios ya creados como `cliente` mantienen el rol; no se permite cambiar rol via UI (solo admin)
- [ ] **Facturas en el dashboard = solo lectura vía API de Holded** (decisión 2026-06-17): el panel cliente NO permite emitir, modificar ni anular facturas. Solo lectura del listado y descarga de PDF generado por Holded. Toda acción editable (emitir, abonar, anular, marcar pagada) sigue ocurriendo en Holded. **IMPORTANTE — nunca mencionar "Holded" en la UI del cliente**: ni en notas, ni en tooltips, ni en mensajes de error, ni en metadatos. El cliente/transportista no debe saber qué herramientas usamos internamente (evitar dar pistas a competencia o atacantes). Implementación futura: token de API de Holded en backend (server-side only), endpoints de listado + GET de PDF, refresco periódico (cron o webhook si Holded lo soporta), filtros y búsqueda en el cliente. Quitados ya del mockup los botones "Marcar como pagada" y "Pagar ahora"
- [ ] **Portal de clientes (`dynamotrans.com/portal`)** — En ESTE MISMO repo refactorizado a Next.js (decisión 2026-06-10, no se separa en subdominio `app.`):
  - Zona privada con login para clientes registrados
  - Ver estado de sus cargas en tiempo real (programación + histórico)
  - Solicitar camiones / nuevos envíos
  - Consultar histórico de envíos
  - Facturas: solo lectura vía API de Holded + descarga de PDF (sin edición). La UI no menciona Holded
  - Seguridad completa desde el principio:
    - Autenticación (login, 2FA opcional, sesiones seguras 30/90 días)
    - Autorización por roles (admin, cliente; transportista/proveedor a futuro)
    - Validación server-side de todos los inputs
    - Cifrado de datos sensibles (NIF, direcciones)
    - Protección CSRF, SQL injection, XSS
    - Rate limiting y WAF
    - Cumplimiento RGPD
    - Pasarela de pago PCI-DSS (Stripe/Redsys) solo si hay pagos en el futuro
    - Logs de auditoría y alertas de actividad sospechosa
    - Pen-testing antes del lanzamiento

## 🏗️ Stack y decisiones para el backend (sesión 2026-06-20)

Bloque consolidado para tener todo en un sitio cuando arranquemos la implementación. Plan estimado: **3-4 semanas concentradas para MVP** sin Holded ni n8n; **5-7 semanas** si añadimos los dos.

### Plataforma
- **Supabase** (Postgres gestionado + Auth + Storage + Edge Functions + Realtime + RLS). Cuenta y proyecto pendientes de crear.
- **Vercel** ya conectado al repo. Se mantiene para hosting del front (web pública + futuro panel Next.js). Cuando el panel pase a producción real, activar Deployment Protection para previews.
- **Dominio panel**: `panel.dynamotrans.com` (subdominio dedicado para el portal). Apuntar al deploy de Vercel cuando el back esté listo.

### Email transaccional → **Postmark** (decidido 2026-06-20)
- Razón: deliverability líder del mercado, separa estricto transaccional vs marketing. En B2B logístico con facturas y albaranes legales no se puede permitir que un email "se pierda" en spam.
- Coste: **$15/mes hasta 10k emails** (asumible desde el día 1).
- Se descartó Resend aunque tiene free tier 3k/mes — la diferencia anual con Postmark es marginal y el upside en deliverability + soporte vale la pena.
- Free tier de Postmark (100/mes) basta para fase de pruebas, luego se pasa al plan de pago.
- Setup: cuenta en `postmarkapp.com`, añadir dominio `dynamotrans.com` con 3 registros DNS (SPF / DKIM / Return-Path), generar API token, guardarlo en `POSTMARK_API_KEY` de Supabase Edge Functions. Llamadas desde Edge Functions con SDK npm.
- Casos de uso: confirmación de carga creada, cambio de estado de carga (programada → en ruta → entregada), albarán disponible, recuperación de contraseña, alertas de incidencia al equipo, recordatorios.

### WhatsApp transaccional → **WhatsApp Cloud API (Meta/Facebook)** (ya provisionado por el cliente)
- El cliente confirmó que **ya tiene la API de WhatsApp dada de alta con Facebook + número de teléfono verificado**. Pendiente solo de cablear cuando entre el backend.
- Casos de uso: avisos al cliente cuando se confirma transportista, recordatorio de carga el día anterior, alerta de incidencia, recuperar contraseña si email no llega.
- Cliente puede optar por canal preferido (email / whatsapp / ambos) por tipo de evento.
- Coste de Meta: gratis hasta 1.000 conversaciones iniciadas por usuario/mes; ~0,03-0,06 € por conversación adicional según país (España es barato).
- Implementación: Edge Function que hace POST a `graph.facebook.com/v18.0/{phone-number-id}/messages` con token de Meta en `META_WA_TOKEN`. Plantillas aprobadas en Meta Business Manager.

### Naming convention de columnas/campos
- **`snake_case` en español** (confirmado 2026-06-20 leyendo la base del cliente en Google Sheets `IA-DYNAMO-2030`, ID `11hUKWFHu0cirk-IAGIiVPETFxwt5_Lo4QAHmYlUtO8o`, propietario `info@dynamotrans.com`).
- Los nombres usados en el Sheets (`referencia_continua_carga`, `fecha_hora_asignacion_camion`, `transportista_concatenar`, etc.) son la **fuente de verdad** para el schema de Supabase y para los campos del JSON en frontend.
- TODO pendiente: refactor del mockup actual para renombrar `fechaAsignada` → `fecha_hora_asignacion_camion`, `transportistaNombre` → `transportista_concatenar`, `matricula` → `matriculas_autorizadas`, etc. Sale gratis con un find&replace masivo cuando se haga la primera sincronización.

### Migración AppScript → Edge Functions
- La lógica de negocio que el cliente ya tiene en AppScript del Sheets (tarifador, validaciones, cálculos de margen, etc.) se porta a Supabase Edge Functions.
- Esfuerzo estimado: 1-2 semanas para alguien que ya maneja JS (el cliente lo maneja). La lógica se reaprovecha en un 95%, solo cambia el plumbing de I/O (SpreadsheetApp.getRange → supabase.from().select()).
- Triggers temporales de AppScript (`onEdit`, `onChange`, `time-based`) → Postgres triggers o `pg_cron`.

### Plan por fases (3-4 semanas MVP sin Holded ni n8n)
- **Semana 1** — Schema + RLS + Auth + conectar dashboard: cliente entra y ve sus cargas reales de Supabase.
- **Semana 2** — Tarifador en Edge Function + POST de cargas/presupuestos + estados dinámicos.
- **Semana 3** — Editor de cargas con flujo legal + incidencias + Storage para fotos + pulido del frontend.
- **Semana 4** — Deploy producción + cliente piloto + bugfix.
- **Fase 2 (1-2 semanas más)**: integración Holded (facturas read-only) + n8n para automatizaciones (albarán recibido en `info@`, recordatorios, etc.).

### Lo que NO entra en MVP
- Holded (facturas): fase 2.
- n8n (automatizaciones de email/whatsapp al detectar eventos): fase 2. Mientras tanto el código manda emails directamente desde Edge Functions usando Postmark + WhatsApp Cloud API.
- Pasarela de pago: fase 3 (solo si llegamos a aceptar pagos en el panel).
- Roles transportista / proveedor: fase 4 (cuando se valide la operativa con clientes).

## ✅ Hecho recientemente
- [x] 2026-07-08 — **Andamiaje de ROLES (portal general de Dynamo)**: switcher de rol (Admin/Cliente/Transportista) en el menú de usuario + `?role=` + `localStorage` + `applyRole()` (con el bloque de gating comentado, listo para cablear) + nueva sección **Dashboard admin** (vista interna con stats globales de todos los clientes y últimos envíos) + menú reordenado con «Dashboard cliente» y «Dashboard admin». De momento **todos ven todo**; los filtros por rol se cablearán con la matriz de permisos
- [x] 2026-07-08 — **Almacenes = Sitios** (tabla y ficha de edición idénticas: Empresa · Dirección · Horario · Contacto · Notas, mismo `sitioFormHTML`). Los almacenes son sitios de uso interno y aparecen también en el **buscador de recogida/entrega del envío** (chip morado «Almacén»; `siteDe` resuelve claves `dynamo-*`). Borrado suave (`_deleted`) para no descuadrar los `almIdx` de almacenamientos registrados
- [x] 2026-07-08 — **Check de disponibilidad del almacén** (toggle «Almacén disponible»): al marcarlo completo sigue en los desplegables con badge rojo «Completo» pero al elegirlo en nuevo almacenamiento avisa y bloquea (`almSolicitar`). En el envío el almacén completo sí se puede elegir (solo bloquea almacenar, no recoger/entregar)
- [x] 2026-07-05 — **Buscador de recogidas/entregas de 3 niveles COMPLETO** (cierra el plan del día): Guardado/Google(mock)/Dirección desde el 1er carácter + **Recientes** (últimos 5 sitios por rol al enfocar vacío) + **chip bloqueado** al seleccionar (editar a trozos rompía la ficha) + **"+ Crear nuevo sitio"** al final del desplegable (solo con 3+ chars; abre el formulario de la sección Sitios y al guardar rellena el campo) + **duplicados en un solo modal** con comparación editable y botones ← para copiar datos de Google al registro propio
- [x] 2026-07-05 — **Sección Sitios**: borrar cualquier sitio con confirmación (se oculta de agenda/buscador; los envíos/presupuestos consolidados conservan sus datos; re-guardar lo revive). **Tipo de lugar** en la ficha (desplegable) con autoselección en el tarifador y **recargos de precio** (Obra +5% · Evento +15% · Urbana +20% · Finca +25%)
- [x] 2026-07-05 — **Confirmación de envío**: resumen sin repetir ruta; fichas de lugares numeradas con circulito naranja/verde (Recogida/Entrega 1..N) y TODOS los datos (dirección bloqueada en gris, Ver en Maps, tipo de lugar); fila de Precio (IVA no incl.); referencia interna y anotaciones editables ahí mismo. Aviso legal completo en Cancelar envío (9:00 del día hábil anterior, coste completo, por ley)
- [x] 2026-07-05 — **Dashboard rediseñado**: fila única Nuevo envío · Mis últimos envíos (1 muestra) · Nuevo presupuesto; fuera Últimos presupuestos; muro de clientes triple + carrusel de servicios (de la web pública, con fade lateral y bucle sin brincos); sección NUESTRA FLOTA / Tipos de Vehículo portada de la web
- [x] 2026-07-05 — **Presupuestos caducados**: retención de 30 días tras caducar (luego se borran) + aviso en la pestaña Caducados; fuera el filtro de fecha (solo buscador)
- [x] 2026-07-05 — **Tablas**: Ruta y fechas a línea completa sin saltos con dirección en negrita; fix font boosting de Safari iOS (tamaños dispares); chips de la topbar unificados; usuario demo → Marbex Industrial S.L.; (Creado: dd/mm/yy · hh:mm) en la 1ª columna de envíos
- [x] 2026-07-05 — **Preview compartible**: explicado cómo desactivar Vercel Authentication (Deployment Protection del proyecto) para que externos prueben el mockup por enlace sin cuenta
- [x] 2026-07-05 — **Defaults SEV→MAD del tarifador retirados**: los campos de recogida/entrega arrancan vacíos (también tras Limpiar). Cierra el TODO de producción
- [x] 2026-07-04 — **Modelo de ramas simplificado a `main` + `preview`** (regla 9 reescrita): eliminada la rama permanente `lab` + limpieza de ~20 ramas muertas en GitHub. Experimentos futuros → ramas cortas `lab/<algo>` desde preview
- [x] 2026-07-04 — **Flujo Nuevo envío/presupuesto** (preview): botón "Nuevo presupuesto" de vuelta (listado + panel), modo de entrada envío/presupuesto con reordenado y avisos de botones, pantalla de confirmación con aviso legal ámbar + un solo check de condiciones (texto de recogida integrado en apdo. 14), "Limpiar" oculto en confirmación
- [x] 2026-07-04 — **Aviso de fecha fija** (1 día futuro → recomendar ventana 1-2 días): panel (preview) y **tarifador público (`main`, producción)**
- [x] 2026-07-04 — **Dashboard**: stat cards simplificadas (Envíos/Presupuestos/Incidencias), CESCE baja a fila de 4, botones en fila de 2; barra de filtros de Envíos (título "Fecha"/"Estado", buscador ancho, reset a "Fecha", filtro de estado solo en Programadas sin Entregado/Cancelada)
- [x] 2026-06-22 — **Horarios multilingües arreglados de raíz** (web `main` + portal preview/lab): generación propia de etiquetas en el idioma activo (13 idiomas, `SCHED_VOCAB`+`buildLabels`, `.notranslate`) porque Google no traduce el CSS del FAB (`content: attr`) ni el texto inyectado por JS. Días en palabra completa. Re-render en caliente al cambiar idioma (`applyScheduleLabels` desde `doTranslate`)
- [x] 2026-06-22 — **Semana Santa**: horario reducido Lunes a Miércoles Santo 9:00–14:00 (auto desde Pascua). Jue/Vie Santo siguen festivo
- [x] 2026-06-22 — **Bug mojibake "SÃ¡bado" → "Sábado"** corregido en los 5 archivos del portal (lo había metido un `perl` sin `-Mutf8`)
- [x] 2026-06-22 — **Home reordenada**: Tipos de Mercancía → Seguridad y Confianza → Tipos de Vehículo → Por qué elegirnos → Cobertura → CTA
- [x] 2026-06-22 — **Sección de cifras (stats) rediseñada** a versión clara y fina (fondo gris suave, tarjetas blancas borde fino, números morados como acento)
- [x] 2026-06-22 — **"Nacionales e Internacional" sin negrita** en tarjetas Grupajes y Carga Completa
- [x] 2026-06-19 — **TARIFADOR INTERNO DEL PANEL** (preview): formulario completo en Nueva carga y Nuevo presupuesto con OSM autocomplete, Flatpickr, selectores reactivos al camión, anotaciones libres con contador
- [x] 2026-06-19 — **Flujo de 2 pasos para Nueva carga** (con fecha): paso 1 formulario, paso 2 confirmación con aviso de grupaje condicional (solo si ml < máx camión) + Disponibilidad/Garantías + resumen + condiciones generales → modal IMPORTANTE de cancelación → guarda. Si la carga es "Sin fecha" (Previsión) salta el paso 2 y guarda directo en Previsión
- [x] 2026-06-19 — **Condiciones generales depuradas**: el cliente pasó un texto largo con cláusulas duplicadas (8h aceptación ×2, Medios de comunicación ×2, etc.). Consolidadas en 12 apartados numerados sin perder cláusulas, dentro de un `<template>` inyectado en el modal del panel
- [x] 2026-06-19 — **Pestañas de Cargas reorganizadas**: Programadas / Previsión / Cargando hoy / Entregadas / Canceladas / Todas. Previsión = kind 'programada' AND fecha='Sin fecha'. "Sin albarán" eliminada (chip 📄 sigue al lado del estado). Default activo cambiado de "Todas" a "Programadas". Bugfix: filter 'programadas' (con s) ya no rompe la tabla
- [x] 2026-06-19 — **"Ventana" → "Ventana de carga"** + opciones `±2 días` → `1 a 2 días` y `±4 días` → `1 a 4 días` en TODOS los sitios (Nueva carga, Nuevo presupuesto, modales Editar/Repetir, datos mock). Hint debajo: "Días laborables consecutivos. Sábados, domingos y festivos quedan excluidos automáticamente"
- [x] 2026-06-19 — **"Programado sin fecha definida"** como opción del select de fecha en Nueva carga + cartel amarillo de aviso ("Previsión, no se tramita; si la fecha es posterior a 7 días, el precio se revisará a precios de mercado"). En presupuesto el campo de fecha se eliminó (solo cotización, sin programación)
- [x] 2026-06-19 — **ETA de entrega estimada** en el tarifador: distancia Haversine × 1.25, tracción ceil(km/600) a 600 km/día, addBusinessDays (saltando Sáb y Dom), rango "del jueves X al martes Y" para evitar lectura como 2 fechas alternativas. Captura lat/lon del autocomplete OSM
- [x] 2026-06-19 — **Tabla de coeficientes de % carga del camión** (cierra TODO del 2026-06-10): coefMl con tabla escalonada (aproximación basada en lo que pasó el cliente: 0.8ml=25%, 1ml=33%, …, 10.4ml=100%; valores intermedios = interpolación a afinar con datos reales). % visible = max(coef_ml, coef_tn, coef_palets). Barra animada con gradient + texto descriptivo. Aparece también en el resumen del paso 2
- [x] 2026-06-19 — **Fila superior unificada del dashboard**: Nueva carga + Nuevo presupuesto + CESCE en una sola horizontal (3 cols), también en móvil. CESCE alineada en altura con las CTAs (padding/radio igualados). Avatares JG sincronizados con gradient(purple→green) en sidebar/topbar/dropdown (eran 3 distintos)
- [x] 2026-06-19 — **Selector de idiomas unificado** entre las 6 páginas (index + 4 portal + dashboard): 13 idiomas con CA + EU en el mismo orden. Producción tenía 11 → ahora coincide con el panel
- [x] 2026-06-19 — **"Pick. Drop. Done." → logo Dynamo** sincronizado a producción (estaba solo en preview desde el 2026-06-15). "Materias primas: plástico, madera, aluminio, acero…" añadido al sector Industria
- [x] 2026-06-19 — **Regla 8 en CLAUDE.md**: cambios públicos siempre arrancan en `main` vía rama corta `fix/<algo>` para evitar drift entre web pública en preview y producción
- [x] 2026-06-18 — **Horarios sincronizados en las 4 login pages del portal** (`portal/registro/verificar/crear-password`): SCHEDULE + chips data-hours en el FAB + modal "Fuera de horario telefónico" + interceptor `tel:` (en horario llama directo, fuera de horario muestra el modal). Mismo motor que `dashboard.html` y `index.html`. ~165 líneas por página (refactor pendiente cuando llegue Next.js)
- [x] 2026-06-18 — **PANEL CLIENTE — bloque grande** (todo en preview `claude/sharp-dirac-E3UIO`):
  - `dashboard.html` (~3.000 líneas): sidebar + topbar morada con logo Dynamo blanco + casita unificados a la izquierda, avatar JG con menú (Mi cuenta · Datos empresa · Soporte · Idioma · Modo oscuro · Cerrar sesión), 4 stat cards clickables, CTAs Nueva carga/presupuesto arriba, CESCE compacta, mini listas
  - **Modal genérico** (`openDashModal`/`closeDashModal`) + **`downloadFakePDF`** (PDF mínimo válido). Acciones funcionales por fila en cargas/presupuestos/facturas: 📋 Ver detalle (+ Editar form), 🔁 Repetir / Generar carga / Revisar precio, ⚠️ Reportar incidencia (con drop de archivos), 📍 Seguimiento (timeline), ✕ Cancelar carga, 📥 Descargar albarán/PDF, 📩 Reclamar albarán
  - **Dropdown ⋯ portal pattern**: el popup se mueve al `<body>` con `position:fixed` para escapar del `overflow:hidden` de la tabla; reposición en scroll/resize
  - **Listas paginadas con 28 cargas / 19 presupuestos / 38 facturas** ficticias (refs reales `#C-/#P-/F-`). `TABLE_STATE { page, filter, perPage:10 }`, tabs con `data-filter`, contadores dinámicos, paginación con saltos `…` cuando hay muchas páginas
  - **Albarán** — flujo completo: campo `hasAlbaran` por carga, chip 📄 al lado del estado si tiene PDF, tab "Sin albarán (N)", acciones según fecha (descargar / procesándose <14 días / reclamar ≥14 días) — umbral subido de 1→14 días para no agobiar a transportistas
  - **Horarios sincronizados** con web pública: SCHEDULE copiado tal cual + chips `data-hours` en FAB + interceptor `tel:` + modal "Fuera de horario" + cartel de temporada (☀️ verano / 🌹 feria / 🎄 navidad / 🏛️ festivo). Soporte usa `data-sched` también
  - **Selector idiomas funcional** (Google Translate, cookie `googtrans` compartida → sync con web pública). **Catalán + Euskera** añadidos a panel, portal, index.html. Menú se cierra al elegir
  - **Modo oscuro** con toggle pill (localStorage). Topbar mantiene su morado en dark
  - **Mockup login bypass**: portal.html acepta cualquier credencial → dashboard.html. crear-password.html redirige al dashboard tras success
  - **Responsive y estabilidad**: pestañas con `touch-action: pan-x` + `scroll-snap`, `.content { max-width: 1400px; margin: 0 auto }`, tablas `min-width: 720/680/620px` por viewport, cinturón anti-overflow horizontal (`html { overflow-x: hidden }` no en body), back-to-top con safe-area y se oculta al abrir el FAB del avatar
  - **Avatar FAB** (foto Álvaro + abanico email/WA/llamar) añadido a las **5 páginas del portal** (portal/registro/verificar/crear-password/dashboard) con halo verde pulsante
- [x] 2026-06-17 — **Decisión Holded para facturas**: solo lectura, sin nombrar Holded en la UI. Quitados botones "Marcar como pagada" / "Pagar ahora". Quitado el cartel "Sincronizado desde Holded" que había puesto inicialmente — el cliente no debe saber qué herramientas usamos internamente
- [x] 2026-06-15 — **Quitar todo rastro del portal de la web pública** (`main`): 315 líneas eliminadas (botón ACCESO de nav/mobile/footer, prefetch, HOME ARRIVAL + PORTAL TRANSITION OVERLAY HTML+CSS+JS, función `goToPortal`, handlers pagehide/pageshow). El portal sigue accesible vía URL directa (mockup bloqueado en producción). Preview mantiene TODO para seguir desarrollando privado
- [x] 2026-06-15 — **Cobertura España y Europa** movida después de "Tipos de mercancía" (antes estaba entre Testimonios y Servicios)
- [x] 2026-06-15 — **"Pick. Drop. Done."** en "Por qué elegirnos" sustituido por logo Dynamo color
- [x] 2026-06-15 — Fix franja blanca al final del scroll en móvil: `overflow-x: hidden` movido de body a html + `overscroll-behavior-y: none` (causa: body con overflow-x hidden hacía que iOS lo tratara como contenedor de scroll propio)
- [x] 2026-06-15 — Fix franja morada inferior en móvil de las páginas del portal: `viewport-fit=cover` + meta `theme-color` con id + JS que la refresca al pageshow + body con `min-height: 100svh` (el theme-color morado de index.html quedaba cacheado en la barra inferior de iOS Chrome)
- [x] 2026-06-13 — **TARIFADOR EN EL HERO**: completo, producción + preview. Autocomplete OSM, Flatpickr, validación, anotaciones libres (1000 chars), botón refresh, mensaje preformateado con SLA "antes de 25 minutos", regeneración del href Email/WA en cada click
- [x] 2026-06-13 — Menú móvil cinematográfico (aurora animada, estrellas, entrada escalonada de items, logo `images/4.png`, footer con CTAs)
- [x] 2026-06-13 — 2 vídeos webm en secuencia con crossfade 2s (sine in-out). Velo del hero suavizado (rgba 0.65→0.85 a 0.18→0.42)
- [x] 2026-06-13 — Botón "Cotizar" del hero eliminado. Sustituido por el flujo del tarifador
- [x] 2026-06-13 — Cards de vehículos sin botones "Contratar". Títulos de cards de servicios igualados al de Almacenamiento. Ancho interior 2,40m. Peso máx Tauliner 24Tn. Perfiles Miranda fuera del carrousel
- [x] 2026-06-13 — Banner "Soluciones de Transporte. España y Europa." con efecto neón sutil. Top-bar Google con spinner descontando 5s y autocolapso
- [x] 2026-06-13 — SEO: redirect 301 de `/es/`, `/en/`, etc. + `/index.html` → `/`. 53 rutas de imágenes a absolutas (`/images/...`)
- [x] 2026-06-13 — Eliminadas 7 MB de imágenes basura del repo
- [x] 2026-06-10 — Nota de flota exclusiva ("Trabajamos exclusivamente con trailer tauliner...") añadida también al pie y luego ANTES de las cajas en sección Servicios
- [x] 2026-06-10 — Chips de servicios (Grupajes / Carga Completa / Import & Export / Nacional 24h) y botón Cotizar del hero en minúsculas (quitado text-transform:uppercase)
- [x] 2026-06-10 — Selector de idiomas añadido a portal.html (fijo arriba-derecha) + Google Translate completo. Comparte cookie googtrans con index. Watchdog que fuerza traducción si GT no auto-aplica la cookie (solución al "a veces no cambia"). Persistencia entre páginas
- [x] 2026-06-10 — Transición wormhole también de vuelta portal→index con icono casa + "Inicio", misma disolución suave
- [x] 2026-06-10 — Fix bfcache: al pulsar atrás del navegador desde portal.html, index.html ya no se queda con el overlay morado pegado (pageshow event quita .active)
- [x] 2026-06-10 — Llegada suave al portal: sessionStorage + script en head antes del paint monta overlay con mismo gradiente que se disuelve con zoom out + fade, sin "flash" blanco entre páginas
- [x] 2026-06-10 — Transición "wormhole" estilo agujero negro al pulsar ACCESO: clip-path circle desde el click, 3 anillos blancos, 12 estrellas titilantes, candado central con backdrop-blur y loader. 850ms total, prefers-reduced-motion respetado
- [x] 2026-06-10 — Texto del botón "ACCESO PORTAL" acortado a solo "ACCESO" (nav, mobile, footer)
- [x] 2026-06-10 — Mobile servicios: cambiado de 4 cards por fila (inviable en 360px) a 2 por fila con imagen + título + descripción + tag legibles. Almacenamiento full-width abajo
- [x] 2026-06-10 — Grid de servicios reestructurado a 4 columnas fijas + Almacenamiento ocupa fila completa con layout horizontal (imagen izq + calculadora der), título 1.7rem, stripe degradado morado→verde 4px
- [x] 2026-06-10 — Eliminada 6ª svc-card "Cotización Inmediata"
- [x] 2026-06-10 — Mobile menu y footer (columna Empresa): añadido enlace 🔒 Acceso al portal
- [x] 2026-06-10 — Nav desktop: botón "ATENCIÓN AL CLIENTE +34 955..." sustituido por botón "ACCESO" con icono candado (→ portal.html). Eliminados iconos Instagram + WhatsApp del nav y su CSS .nav-social
- [x] 2026-06-10 — Nuevo `portal.html`: mockup login bloqueado (1 solo login genérico, página aparte /portal, campos disabled con badge "Próximamente"). Logo + 2 campos + checkbox + botón + info + volver al inicio, todo con estilo de marca
- [x] 2026-06-09 — Tipo de camión seleccionado incluido en mensaje preformateado de las 2 cajas de vehículos (Trailer Tauliner / Rígido con Plataforma); asunto email diferenciado por modelo
<!-- Claude mueve aquí las tareas completadas. Se limpia cada ~2 semanas -->
- [x] 2026-06-08 — Caja "Gestión Logística" renombrada a "Almacenamiento corta estancia" (título + alt) y nueva descripción: 1-7 días en cualquier provincia + camiones carrozados/2 ejes para entrega urbana o recogida por el cliente
- [x] 2026-06-08 — Hero: botón COTIZAR único (verde de marca) que despliega los 2 botones email/WhatsApp con fadeUp; cierre por click fuera o Escape
- [x] 2026-06-08 — Cajas de vehículos: botón CONTRATAR morado con popup de 2 iconos circulares (email + WhatsApp) con rebote tipo FAB
- [x] 2026-06-08 — Chips de la barra de servicios (.strip-item): border-radius de píldora 99px → 10px
- [x] 2026-06-08 — Cajas de servicios: eliminados los 6 botones WhatsApp/Email (.svc-btns) y CSS muerto (−29 líneas)
- [x] 2026-06-08 — Barra superior: border-radius unificado en .lang-btn / .nav-social a / .btn-nav-cta (50px/50% → 18px → 10px en botones bajos para que se note)
- [x] 2026-06-08 — Workflow GitHub Actions de uptime cada 2h con email automático si dynamotrans.com cae (fix `curl -L` para evitar falsos 307 por redirect Vercel→www)
- [x] 2026-05-21 — Hero: fondo final = imagen HERO-DYNAMO.webp (mantiene vídeo; degradado como fallback) — en producción
- [x] 2026-05-21 — Punto de la barra de servicios: círculo blanco fijo con parpadeo, verde al hover — en producción
- [x] 2026-05-20 — FAB Llamar visible solo L-V 8:00-19:00 hora de Madrid (Europe/Madrid, gestiona DST)
- [x] 2026-05-20 — Transición vídeo hero→degradado suavizada (timeupdate, 2.4s ease-in-out)
- [x] 2026-05-20 — FAB con indicador "online" + estado "En línea · Respondo enseguida" en el chip
- [x] 2026-05-20 — Mailto saltos CRLF (%0D%0A) para compatibilidad con app Gmail
- [x] 2026-05-20 — Mensaje predefinido (Buenos días, solicito TARIFA...) en los 23 botones WhatsApp/email — iteración 2 con METROS LINEALES, COMENTARIOS y separadores ****
- [x] 2026-05-20 — Chip con nombre "Álvaro Blanco de Dynamo" en el FAB; tamaño texto +30%
- [x] 2026-05-20 — FAB foto +35% (96→130 desktop, 81→109 móvil) y reposicionado botón ↑
- [x] 2026-05-20 — Hero: botón "Llamar" → "Enviar un eMail"
- [x] 2026-05-20 — Banderas del menú móvil eliminadas (selector del nav sigue)
- [x] 2026-05-20 — Barra Cotiza sustituida por copia de la sección CTA "¿Listo para empezar?"
- [x] 2026-05-20 — Sección stats con fondo gris claro (--gray-200)
- [x] 2026-05-18 — Deploy de `79e35f3` resuelto: el push de bitácora (`2e61f36`, encima) lo arrastró → fix botón ↑ en producción
- [x] 2026-05-18 — Barra "Cotiza Online": texto "Cotizamos en 2 minutos." (commit b296d13)
- [x] 2026-05-18 — Botón ↑ recolocado junto al FAB, alineado vertical (calc), oculto al abrir FAB, clicable (pointer-events) y a un toque en móvil (touchend) — commits 1a61106→79e35f3
- [x] 2026-05-18 — Barra "Cotiza Online": fondo amarillo → gris claro suave (commit b7a4ed9)
- [x] 2026-05-18 — Hero: vídeo sin loop + transición suave al degradado de marca con zoom (commit 56c526f)
- [x] 2026-05-18 — Verificado el FAB de contacto en producción (usuario confirmó: foto círculo, aro pulsante, abanico con rebote, cierre fuera/Escape, móvil OK)
- [x] 2026-05-18 — Borrado el proyecto Vercel duplicado `dynamo-web-muoi` (lo hizo el usuario; verificado vía API: ya no existe)
- [x] 2026-05-17 — Eliminada música de fondo + botón flotante de música (borrado MP3 7 MB y carpeta audio/)
- [x] 2026-05-17 — Foto real (Álvaro) en el FAB de contacto
- [x] 2026-05-17 — Eliminada ventana emergente de salida (exit-intent popup)
- [x] 2026-05-17 — Foto del FAB ampliada a 1,5x (web y móvil)
- [x] 2026-05-17 — Foto definitiva del FAB: ALVARO_circular_ZOOM.png
- [x] 2026-05-17 — Limpieza: borradas 4 imágenes sin usar (–1,3 MB)
- [x] 2026-05-16 — Selector de idiomas: árabe → chino + reordenado (11 idiomas)
- [x] 2026-05-16 — Nuevo FAB de contacto (foto + abanico Email/WhatsApp/Llamar); retirado chat IA y WhatsApp flotante
- [x] 2026-05-04 — Música de fondo opcional + botón flotante mute/unmute en dynamotrans.com
- [x] 2026-04-14 — Configurar GitHub Codespaces (.devcontainer)
- [x] 2026-04-14 — Crear CLAUDE.md con reglas de push y bitácora

---

> 📌 **Otros proyectos del usuario (NO mezclar con Dynamo):**
> Para tareas del proyecto **agenciadetransporte-web** ver `HANDOFF-agenciadetransporte.md` en la raíz de este repo (es un archivo de traspaso temporal hasta que se clone el repo nuevo).
