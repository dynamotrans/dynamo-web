# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->

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
<!-- Claude mueve aquí las tareas completadas. Se limpia cada ~2 semanas -->
- [x] 2026-04-14 — Configurar GitHub Codespaces (.devcontainer)
- [x] 2026-04-14 — Crear CLAUDE.md con reglas de push y bitácora

---

# 🆕 Proyecto agenciadetransporte-web (rebrand)

> ⚠️ **Proyecto SEPARADO de dynamo-web.** Repo nuevo, dominio nuevo, marca nueva.
> Nada de aquí debe modificar el código ni los deploys de dynamo-web.

## 🎯 Estado actual (2026-04-27)
- ✅ Creado proyecto en Vercel: `agenciadetransporte-web` (org `dynamotrans`)
- ✅ Vercel conectado a un repo nuevo de GitHub (clon inicial de dynamo-web)
- ✅ Primer deploy ok: `agenciadetransporte-web.vercel.app` — pero muestra la web de Dynamo tal cual (logo, colores, dominio, teléfono…)
- ❌ El repo nuevo NO está clonado todavía en este Codespace (solo está `dynamo-web`)

## ❓ Información que falta del usuario
Antes de poder rebrand-ear necesitamos:
- [ ] **Nombre exacto del repo en GitHub** (org/nombre, p.ej. `dynamotrans/agenciadetransporte-web`)
- [ ] **Logo / favicon** de la nueva marca (¿hay archivo o texto plano de momento?)
- [ ] **Paleta de colores** nueva (Dynamo es morado #??? + verde lima)
- [ ] **Teléfono / WhatsApp** — ¿mismo `+34 955 225 945` o número distinto?
- [ ] **Email de contacto** y dominio en textos (dynamotrans.com → agenciadetransporte.es)
- [ ] **Dominio** `agenciadetransporte.es` — ¿registrado ya? ¿apuntando a Vercel?
- [ ] **Imagen del hero** — ¿se mantiene la de los camiones de Dynamo o cambia?
- [ ] **Logos de clientes** (Jardí Pond, Ferticenter, Talsa, etc.) — ¿se quitan? ¿son los mismos?
- [ ] **Reseñas Google "+480 clientes / 5,0 ⭐"** — ¿se mantiene el dato o se quita?
- [ ] **Footer / razón social / NIF / dirección legal** de la nueva marca
- [ ] **Redes sociales** (Instagram, etc.) — ¿cuentas distintas?
- [ ] **Chat bot** — ¿mismo comportamiento o adaptado a la nueva marca?

## 📋 Checklist de rebrand (cuando tengamos los datos)
- [ ] Clonar repo nuevo en el Codespace al lado de `dynamo-web` (`../agenciadetransporte-web`)
- [ ] Crear rama `rebrand/agenciadetransporte` (NO trabajar en `main` directo)
- [ ] Buscar/reemplazar textos: "dynamo" → "Agencia de Transporte", dominios, teléfonos, emails
- [ ] Sustituir logo + favicon
- [ ] Cambiar paleta de colores (idealmente extrayendo a variables CSS si no lo están)
- [ ] Cambiar imagen del hero (si procede)
- [ ] Actualizar/quitar logos de clientes y reseñas
- [ ] Actualizar footer (razón social, NIF, dirección, redes)
- [ ] Adaptar chat bot
- [ ] Copiar `vercel.json` (cabeceras de seguridad + rewrites) tal cual
- [ ] Probar local con `python3 -m http.server 3000` antes de merge
- [ ] Merge a `main` → Vercel despliega
- [ ] Conectar dominio `agenciadetransporte.es` en Vercel (si ya está registrado)

## 💡 Decisión arquitectónica pendiente
- ¿Mantener los dos repos totalmente independientes y aceptar que algunos cambios habrá que portarlos a mano de uno a otro?
- O ¿extraer un "tema configurable" (variables de marca) para poder compartir mejoras entre ambas webs?
- **Recomendación inicial**: empezar con repos independientes (más simple, más rápido). Si en 2-3 meses se ve que se duplica trabajo, plantear refactor.
