# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->
- _(nada urgente abierto)_

## 📋 Normal
<!-- Cosas que hacer cuando haya tiempo -->
- [ ] **Horarios sincronizados en login pages del portal**: SCHEDULE + phone modal + interceptor `tel:` están en `dashboard.html` pero NO en `portal.html` / `registro.html` / `verificar.html` / `crear-password.html`. Esas 4 páginas tienen el FAB pero sin chips de horario dinámicos ni modal "fuera de horario". Hay que replicar el sistema (~150 líneas SCHEDULE + ~80 modal CSS + modal HTML + interceptor) a cada página. Posible alternativa: extraer a un `.js` compartido si el patrón inline se queda corto
- [ ] **Implementar tabla de coeficientes en el tarifador**: el cliente pasó una tabla escalonada (0,8ml=25%, 1ml=33%, ..., 10,4ml=100%) para mostrar al cliente el % de carga del camión en vivo según `max(coef_ml, coef_tn, coef_palets)`. Tengo la tabla apuntada en bitácora del 2026-06-10 pero NO implementé el cálculo. El tarifador actual solo recoge datos y los pasa al equipo
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

## ✅ Hecho recientemente
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
