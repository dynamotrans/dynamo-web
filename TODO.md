# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
- [ ] **Merge rama `claude/check-iphone-compatibility-idEnO` → `main`** para desplegar fixes de seguridad (CSP, cookies Secure) en producción
- [ ] **Seguridad anti-scraping y protección de datos** — Aplicar en web y portal:
  - **Tarifador**: lógica de precios NUNCA en JavaScript del navegador → siempre en API privada de servidor (nadie puede ver las fórmulas ni las tablas de tarifas)
  - **Google Sheet de precios**: clave de API solo accesible desde el servidor, nunca expuesta al navegador del visitante
  - **Portal de clientes**: proteger contra scraping de datos de empresas, rutas, precios y facturas
  - **Rate limiting** en todos los endpoints (limitar peticiones por IP para dificultar extracción masiva de datos)
  - **Autenticación robusta**: 2FA obligatorio para acceso al portal, bloqueo tras N intentos fallidos
  - **Cifrado en tránsito y en reposo** de datos sensibles (NIF, direcciones, precios pactados, facturas)
  - **Cabeceras HTTP de seguridad** ya presentes en vercel.json — revisar y mantener actualizadas
  - **Logs de acceso y alertas** ante comportamiento sospechoso (muchas peticiones seguidas, accesos desde IPs inusuales)

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
  - **Caducidad de clave por inactividad** — Si un usuario (empresa cliente o transportista) no accede al portal en 9 meses, su contraseña caduca automáticamente y se le obliga a restablecerla al intentar entrar
  - **Desactivación automática de empresas inactivas** — Una empresa se marca como inactiva (o se elimina) si cumple AMBAS condiciones:
    - No ha iniciado sesión en los últimos 9 meses, Y
    - No tiene ningún transporte solicitado ni finalizado en los últimos 9 meses
    - Flujo sugerido: aviso por email a los 8 meses → desactivación a los 9 → borrado definitivo tras X días adicionales (pendiente decidir)

## ✅ Hecho recientemente
<!-- Claude mueve aquí las tareas completadas. Se limpia cada ~2 semanas -->
- [x] 2026-05-04 — Música de fondo opcional + botón flotante mute/unmute en dynamotrans.com
- [x] 2026-04-14 — Configurar GitHub Codespaces (.devcontainer)
- [x] 2026-04-14 — Crear CLAUDE.md con reglas de push y bitácora

---

> 📌 **Otros proyectos del usuario (NO mezclar con Dynamo):**
> Para tareas del proyecto **agenciadetransporte-web** ver `HANDOFF-agenciadetransporte.md` en la raíz de este repo (es un archivo de traspaso temporal hasta que se clone el repo nuevo).
