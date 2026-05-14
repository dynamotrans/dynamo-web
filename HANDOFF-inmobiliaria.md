# HANDOFF — Proyecto `montesblanco-web` (inmobiliaria)

> ⚠️ **ESTE ARCHIVO NO ES DE DYNAMO.**
> Es un traspaso temporal para arrancar una web NUEVA de una agencia inmobiliaria
> (negocio del hermano del usuario). No tiene nada que ver con Dynamo ni con
> `agenciadetransporte-web`.
>
> Vive aquí solo porque el repo nuevo todavía no existe / no está clonado en este Codespace.
>
> **Cuando el repo nuevo esté creado y clonado:**
> 1. Mover el contenido útil de este archivo a `CLAUDE.md` + `TODO.md` del repo nuevo.
> 2. Borrar este archivo de `dynamo-web` en un commit aparte.
> 3. Dejar `dynamo-web/CLAUDE.md` y `dynamo-web/TODO.md` 100% sobre Dynamo.

---

## 🎯 Marca y datos básicos (lo que sabemos hoy, 2026-05-14)

- **Nombre comercial**: **Montes Blanco Real Estate**.
- **Sector**: Agencia inmobiliaria (real estate).
- **Dominio previsto**: `www.montesblanco.com` *(confirmar si ya está registrado y a nombre de quién).*
- **Servicios a listar en la web**:
  - Venta de viviendas (pisos, casas, chalets).
  - Alquiler de viviendas.
  - Naves industriales / locales comerciales (venta y/o alquiler).
  - Suelo / terrenos (urbano, rústico, parcelas).
- **Stack elegido**: HTML estático tipo Dynamo (mismo enfoque que `dynamo-web`), servido en Vercel.
- **Punto de partida del código**: copiar estructura/estética de `dynamo-web` y hacer rebrand (hero, secciones, footer, formulario, `vercel.json`…).

---

## 🧭 Estado actual

- ❌ **Repo en GitHub**: NO existe todavía. Se creará en la **cuenta personal** del usuario (no en la org `dynamotrans`).
- ❌ **Proyecto en Vercel**: NO creado.
- ❌ **Dominio**: pendiente de confirmar registro y apuntado DNS.
- ❌ **Logo / favicon / paleta**: pendiente.
- ❌ **Fotos de propiedades / hero**: pendiente.

---

## ❓ Información que falta del usuario

Antes de empezar a maquetar hace falta concretar:

- [ ] **Nombre exacto del repo en GitHub** (sugerencia: `montesblanco-web`).
- [ ] **Cuenta de GitHub** donde se crea el repo (la personal del usuario — confirmar usuario).
- [ ] **Logo / favicon** de Montes Blanco (¿hay archivo? ¿hay que diseñar uno provisional?).
- [ ] **Paleta de colores** (¿algo ya pensado? ¿se inspira en algún competidor? ¿colores neutros tipo blanco/gris/dorado típicos de inmobiliaria premium?).
- [ ] **Tipografías** preferidas.
- [ ] **Teléfono / WhatsApp** de contacto del negocio.
- [ ] **Email de contacto** y dirección física (oficina) si la hay.
- [ ] **Dominio `montesblanco.com`** — ¿registrado ya? ¿en qué registrador? ¿se apunta a Vercel?
- [ ] **Imagen del hero** — ¿foto propia de la zona, foto stock, o un render?
- [ ] **Zona de actuación** (¿provincia, comarca, ciudad concreta?). Importante para SEO local.
- [ ] **Catálogo inicial de propiedades** — ¿hay ya un listado o se empieza sin propiedades publicadas?
- [ ] **¿Necesita panel para subir propiedades?** O al principio se actualizan a mano editando HTML. (Esto define si el stack estático sigue valiendo o hay que pasarse a Next.js + CMS más adelante).
- [ ] **Redes sociales** (Instagram inmobiliario es casi obligatorio, ¿hay cuenta?).
- [ ] **Razón social / NIF / dirección legal** para el footer (aviso legal, política de privacidad, cookies — obligatorio en España).
- [ ] **¿Está dado de alta como agente inmobiliario / colegiado?** (Algunas CCAA exigen número de registro de agente inmobiliario visible en la web).

---

## 📋 Checklist de arranque (cuando tengamos los datos mínimos)

### Fase 0 — Preparativos (fuera de Claude, 5 min de usuario)
- [ ] Usuario crea repo vacío en `github.com/<su-usuario>/montesblanco-web` (privado o público, como prefiera).
- [ ] Usuario abre un Codespace en ese repo nuevo (o lo clona en local).
- [ ] Usuario arranca **una nueva sesión de Claude Code apuntada a ESE repo**.

### Fase 1 — Arranque del proyecto
- [ ] Crear `CLAUDE.md` propio en el repo nuevo, basado en el de Dynamo pero adaptado:
  - Reglas de push manual.
  - Catch-up automático.
  - Bitácora.
  - Regla 5 (confirmar proyecto + rama).
- [ ] Crear `TODO.md` propio.
- [ ] Copiar `vercel.json` de Dynamo (cabeceras de seguridad + rewrites) y revisarlo.
- [ ] Copiar estructura HTML/CSS de Dynamo como esqueleto.
- [ ] Crear rama `feature/setup-inicial` para no tocar `main` directamente.

### Fase 2 — Rebrand
- [ ] Buscar/reemplazar: `Dynamo` → `Montes Blanco`, `dynamotrans.com` → `montesblanco.com`, teléfono, email.
- [ ] Sustituir logo + favicon.
- [ ] Cambiar paleta de colores (extraer a variables CSS desde el principio).
- [ ] Cambiar tipografías.
- [ ] Sustituir hero (imagen + textos).
- [ ] Reescribir secciones: hero, servicios, "sobre nosotros", contacto.
- [ ] Quitar logos de clientes y reseñas de Dynamo (poner placeholders o quitarlos).
- [ ] Quitar/adaptar chat bot (decidir si se mantiene para inmobiliaria).
- [ ] Quitar referencias a transporte/logística.

### Fase 3 — Contenido inmobiliario específico
- [ ] Sección **listado de propiedades** (4 tipos: viviendas venta, viviendas alquiler, naves/locales, suelo).
- [ ] Plantilla de **ficha de propiedad** (galería de fotos, características, mapa, formulario de contacto).
- [ ] Formulario "Vende tu propiedad con nosotros".
- [ ] Sección **zona de actuación** (mapa o lista de municipios).
- [ ] Aviso legal + política de privacidad + política de cookies (obligatorio LSSI/RGPD).
- [ ] Número de colegiado/agente (si aplica).

### Fase 4 — Despliegue
- [ ] Crear proyecto en Vercel conectado al repo nuevo.
- [ ] Configurar dominio `montesblanco.com` en Vercel (cuando esté registrado).
- [ ] Probar local con `python3 -m http.server 3000` antes del merge.
- [ ] Merge a `main` → Vercel despliega.

---

## 💡 Decisión arquitectónica pendiente

- **Listado de propiedades estático vs dinámico**:
  - **Opción A (estático)**: Cada propiedad es un HTML escrito a mano + JSON con los datos. Súper rápido y SEO bueno, pero pesado de mantener si hay >20 propiedades activas.
  - **Opción B (CMS headless)**: Mantener HTML estático pero meter un CMS tipo Sanity / Decap / Strapi para que el hermano pueda subir propiedades desde un panel. Más trabajo inicial pero escala.
  - **Opción C (Next.js)**: Pasarse a Next.js desde el principio con generación estática + revalidación. Lo más profesional pero rompe la simplicidad de "HTML como Dynamo".
- **Recomendación inicial**: empezar Opción A con 5-10 propiedades de muestra. Si el negocio crece y el catálogo supera ~20 propiedades activas, migrar a Opción B.

---

## 🚦 Reglas obligatorias al arrancar sesión en el repo nuevo

**ANTES de tocar nada**, Claude debe decir explícitamente y pedir OK:
> "Vamos a trabajar en el proyecto **montesblanco-web** (inmobiliaria), en la rama **[nombre-rama]**. ¿Correcto?"

Solo tras confirmación del usuario se puede empezar a editar/commitear. Esta regla debe replicarse en el `CLAUDE.md` del repo nuevo (regla nº 5 estilo Dynamo).

---

## 🗂️ Cómo retomarlo en la próxima sesión

1. Crear repo `montesblanco-web` en GitHub (cuenta personal del usuario).
2. Abrir Codespace o clonar localmente.
3. Arrancar Claude Code apuntando a ese repo.
4. Leer este archivo entero (está en `dynamo-web/HANDOFF-inmobiliaria.md` en GitHub).
5. Pedir al usuario los datos del bloque "Información que falta".
6. Crear `CLAUDE.md` + `TODO.md` propios a partir del contenido de este archivo.
7. Trabajar en rama `feature/setup-inicial` y avanzar la checklist (Fase 1 → 2 → 3 → 4).
8. Borrar este `HANDOFF-inmobiliaria.md` de `dynamo-web` en un commit aparte una vez migrado.
