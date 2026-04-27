# HANDOFF — Proyecto `agenciadetransporte-web`

> ⚠️ **ESTE ARCHIVO NO ES DE DYNAMO.**
> Es un traspaso temporal para arrancar la web hermana `agenciadetransporte.es`.
> Vive aquí solo porque el repo nuevo todavía no está clonado en el Codespace.
>
> **Cuando el repo nuevo `agenciadetransporte-web` esté clonado:**
> 1. Mover el contenido útil de este archivo a `CLAUDE.md` + `TODO.md` del repo nuevo.
> 2. Borrar este archivo de `dynamo-web`.
> 3. Dejar `dynamo-web/CLAUDE.md` y `dynamo-web/TODO.md` 100% sobre Dynamo.

---

## 🎯 Estado actual (2026-04-27)
- ✅ Creado proyecto en Vercel: `agenciadetransporte-web` (org `dynamotrans`).
- ✅ Vercel conectado a un repo NUEVO de GitHub (clon inicial de `dynamo-web`).
- ✅ Primer deploy ok en `agenciadetransporte-web.vercel.app` y URL larga `agenciadetransporte-3po3tnmgy-dynamotrans-projects.vercel.app`.
- ⚠️ El deploy muestra hoy la web de Dynamo tal cual (logo, colores, dominio, teléfono…). Falta todo el rebrand.
- ❌ El repo nuevo NO está clonado todavía en este Codespace (solo está `dynamo-web`).
- ❌ Falta confirmar el nombre exacto del repo en GitHub (probablemente `dynamotrans/agenciadetransporte-web`).

## ❓ Información que falta del usuario
Antes de poder rebrand-ear hace falta:
- [ ] **Nombre exacto del repo en GitHub** (org/nombre).
- [ ] **Logo / favicon** de la nueva marca (¿hay archivo o uso texto plano de momento?).
- [ ] **Paleta de colores** nueva (Dynamo es morado oscuro + verde lima).
- [ ] **Teléfono / WhatsApp** — ¿mismo `+34 955 225 945` o número distinto?
- [ ] **Email de contacto** y dominio en textos (`dynamotrans.com` → `agenciadetransporte.es`).
- [ ] **Dominio `agenciadetransporte.es`** — ¿registrado ya? ¿apuntando a Vercel?
- [ ] **Imagen del hero** — ¿se mantiene la de los camiones de Dynamo o cambia?
- [ ] **Logos de clientes** (Jardí Pond, Ferticenter, Talsa, Aceitunas Cazorla, Solbau, Poolback, Rosport): ¿se quitan? ¿son los mismos? ¿hay nuevos?
- [ ] **Reseñas Google "+480 clientes / 5,0 ⭐"** — ¿se mantiene el dato o se quita hasta tener reseñas propias?
- [ ] **Footer / razón social / NIF / dirección legal** de la nueva marca.
- [ ] **Redes sociales** (Instagram, etc.) — ¿cuentas distintas?
- [ ] **Chat bot** — ¿mismo comportamiento o adaptado a la nueva marca?

## 📋 Checklist de rebrand (cuando tengamos los datos)
- [ ] Clonar el repo nuevo en el Codespace al lado de `dynamo-web` (`../agenciadetransporte-web`).
- [ ] Crear rama `rebrand/agenciadetransporte` (NO trabajar en `main` directo).
- [ ] Buscar/reemplazar textos: `dynamo` → `Agencia de Transporte`, dominios, teléfonos, emails.
- [ ] Sustituir logo + favicon.
- [ ] Cambiar paleta de colores (idealmente extrayendo a variables CSS si no lo están).
- [ ] Cambiar imagen del hero (si procede).
- [ ] Actualizar/quitar logos de clientes y reseñas.
- [ ] Actualizar footer (razón social, NIF, dirección, redes).
- [ ] Adaptar chat bot.
- [ ] Copiar `vercel.json` (cabeceras de seguridad + rewrites) tal cual.
- [ ] Probar local con `python3 -m http.server 3000` antes del merge.
- [ ] Merge a `main` → Vercel despliega.
- [ ] Conectar dominio `agenciadetransporte.es` en Vercel (si ya está registrado).

## 💡 Decisión arquitectónica pendiente
- ¿Mantener los dos repos totalmente independientes y aceptar que algunos cambios habrá que portarlos a mano de uno a otro?
- O ¿extraer un "tema configurable" (variables de marca CSS + textos en JSON) para poder compartir mejoras entre ambas webs?
- **Recomendación inicial**: empezar con repos independientes (más simple, más rápido). Si en 2-3 meses se ve que se duplica trabajo, plantear refactor a tema compartido.

## 🚦 Regla obligatoria al arrancar sesión
**ANTES de tocar nada**, Claude debe decir explícitamente y pedir OK:
> "Vamos a trabajar en el proyecto **agenciadetransporte-web**, en la rama **[nombre-rama]**. ¿Correcto?"

Solo tras confirmación del usuario se puede empezar a editar/commitear. Esta regla también está en `CLAUDE.md` de Dynamo (regla nº 5) y debe mantenerse en el `CLAUDE.md` del repo nuevo cuando se cree.

## 🗂️ Cómo retomarlo en la próxima sesión
1. Leer este archivo entero.
2. Pedir al usuario los datos del bloque "Información que falta".
3. Una vez se sepa el nombre del repo en GitHub:
   - Clonar: `git clone <url> ../agenciadetransporte-web`
   - Crear `CLAUDE.md` + `TODO.md` propios en ese repo a partir del contenido de este archivo.
   - Borrar este `HANDOFF-agenciadetransporte.md` de `dynamo-web` en una commit aparte.
4. Trabajar en rama `rebrand/agenciadetransporte` y avanzar la checklist.
