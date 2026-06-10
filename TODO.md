# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->
- [ ] **Texto del botón COTIZAR del hero**: decidir si dejarlo como `Cotizar` o cambiar a `TARIFAR` / `PEDIR TARIFA` / `SOLICITAR TARIFA` (este último encaja mejor con el mensaje prerellenado SOLICITUD DE TARIFA). Sin decisión todavía

## 📋 Normal
<!-- Cosas que hacer cuando haya tiempo -->
- [ ] **Tarifador público en dynamotrans.com** — Calculadora de tarifas integrada en la web:
  - Formulario: origen (CP/ciudad), destino (CP/ciudad), peso, nº palés, tipo servicio (grupaje/completa)
  - Calcula precio con lógica definida (tablas por zonas, km, peso)
  - Muestra tarifa en pantalla al instante, sin registro ni login
  - No guarda datos, no necesita backend/base de datos
  - Opción A: lógica en JavaScript (más simple, pero fórmula visible)
  - Opción B: API sencilla (fórmula oculta, más profesional)
  - Botón "Solicitar este transporte" → abre WhatsApp/email con datos pre-rellenados

## 💡 Ideas / Futuro
<!-- Mejoras a considerar -->
- [ ] **Portal de clientes (app.dynamotrans.com)** — Proyecto SEPARADO del sitio web:
  - Zona privada con login para clientes registrados
  - Ver estado de sus cargas en tiempo real
  - Solicitar camiones / nuevos envíos
  - Consultar facturas e histórico
  - Seguridad completa desde el principio:
    - Autenticación (login, 2FA, sesiones seguras)
    - Autorización por roles (admin, cliente, transportista)
    - Validación server-side de todos los inputs
    - Cifrado de datos sensibles (NIF, direcciones, facturas)
    - Protección CSRF, SQL injection, XSS
    - Rate limiting y WAF
    - Cumplimiento RGPD
    - Pasarela de pago PCI-DSS (Stripe/Redsys) si hay pagos
    - Logs de auditoría y alertas de actividad sospechosa
    - Pen-testing antes del lanzamiento

## ✅ Hecho recientemente
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
