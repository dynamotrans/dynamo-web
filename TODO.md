# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->

## 📋 Normal
<!-- Cosas que hacer cuando haya tiempo -->

## 💡 Ideas / Futuro
<!-- Mejoras a considerar -->
- [ ] **Portal de usuarios** — Cuando se construya, implementar seguridad completa desde el principio:
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
<!-- Claude mueve aquí las tareas completadas. Se limpia cada ~2 semanas -->
- [x] 2026-04-14 — Configurar GitHub Codespaces (.devcontainer)
- [x] 2026-04-14 — Crear CLAUDE.md con reglas de push y bitácora
