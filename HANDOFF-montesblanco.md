# HANDOFF — Montes Blanco Real Estate

> ⚠️ **Aviso a Claude**: este archivo NO es de `dynamo-web`. Vive aquí solo como puente para que el contexto del proyecto **Montes Blanco Real Estate** se sincronice entre los 2 Macs del usuario vía git, hasta que exista repo propio.
>
> El código real del proyecto vive en `/home/user/montesblanco-web` (carpeta local, fuera de `dynamo-web`). Cuando el usuario cree el repo en GitHub, este HANDOFF se mueve allí y se borra de aquí.

## Quién es
Web inmobiliaria del **hermano del usuario**, **Manolo Montes** (Director Comercial), empresa **Montes Blanco Real Estate SL** (B22536601), activa desde **2005**, con oficina física en Dos Hermanas (Sevilla). Distinta y separada de `dynamo-web` (transporte).

## Estado de la web actual
- Dominio: **montesblanco.com** (ya en producción, no inspeccionable por Claude — devuelve 403 a bots)
- Decisión del usuario: **rehacerla mejor** (no es retoque, es reemplazo)
- Construcción nueva en carpeta local `/home/user/montesblanco-web` (git inicializado, sin remoto aún)

## Identidad de marca
- **Nombre comercial**: Montes Blanco Real Estate
- **Logo**: fondo navy oscuro, "MONTES BLANCO" en blanco grande, "REAL ESTATE" en dorado debajo
- **Paleta** (deducida del logo):
  - Navy oscuro: aprox. `#0d2340` / `#102a4c` (fondo logo)
  - Dorado: aprox. `#c8a55b` / `#b8954a` (acento "REAL ESTATE")
  - Blanco: `#ffffff`
- **Tipografía logo**: serif elegante mayúsculas (a confirmar fuente exacta)

## Datos de contacto / negocio
- **Oficina**: C. Canónigo, 49, oficina derecha, 41701 Dos Hermanas (Sevilla)
- **Domicilio social**: Paseo General Martínez Campos 3, piso 3, Madrid
- **Teléfono oficina**: 854 69 14 60
- **Móvil**: +34 635 64 38 27
- **Emails**: montesblancorealestate@gmail.com / info@montesblanco.com
- **Horario**: L-V 10:00-14:00 y 17:00-21:00. Sábado y domingo cerrado.

## Servicios
- Compra, venta y alquiler (sin exclusividad)
- Tipos: viviendas unifamiliares, chalets, propiedades de lujo, naves, locales comerciales, inversiones
- Asesoramiento personalizado y valoración de propiedades

## Listado de inmuebles (importante)
La inmobiliaria publica sus inmuebles en portales externos. La web propia debe **enlazar** a estos, NO duplicar el listado:
- Idealista: https://www.idealista.com/pro/montes-blanco-real-estate/venta-viviendas/
- Fotocasa: https://www.fotocasa.es/es/inmobiliaria-montes-blanco-real-estate/comprar/inmuebles/espana/todas-las-zonas/l?clientId=9202765515624&publisherId=8b878b18-77aa-49e4-9861-717265f5fcc3

## Assets que el usuario ya pasó (en chat, no en disco)
- Logo navy/dorado (PNG)
- 2 fotos del local (fachada con cartel "BUSCAMOS personal/inmuebles" y plaza con palmeras)
- Foto retrato de Manolo Montes
- Textos legales completos (Aviso Legal y Política de Privacidad, ya redactados)
- Texto "Sobre nosotros" / "Nuestro espacio" / "Contacto"

➡️ **Pendiente**: el usuario debe guardar estos assets como archivos en `/home/user/montesblanco-web/images/` (Claude no puede acceder a las imágenes pegadas en chat anterior; el usuario tendrá que readjuntarlas o subirlas como archivos).

## Stack técnico decidido
- HTML estático + CSS + JS vanilla (mismo enfoque que `dynamo-web`)
- Hosting: **Vercel** (proyecto NUEVO, distinto al de Dynamo)
- Dominio: `montesblanco.com` (ya existe, se reapunta a Vercel cuando v1 esté lista)
- Repo GitHub: **PENDIENTE crear por el usuario** (sugerencia: `dynamotrans/montesblanco-web` o cuenta personal)

## Pasos pendientes (alto nivel)
1. [ ] Usuario crea repo en GitHub (vacío) y comparte URL
2. [ ] Conectar `/home/user/montesblanco-web` a ese remoto (`git remote add origin …`)
3. [ ] Usuario re-sube assets (logo, fotos, retrato Manolo) como archivos
4. [ ] Construir v1: home + sobre nosotros + contacto + aviso legal + privacidad + enlaces a Idealista/Fotocasa
5. [ ] Probar localmente con `python3 -m http.server 3000`
6. [ ] Push inicial a GitHub
7. [ ] Conectar repo a Vercel (proyecto nuevo)
8. [ ] Apuntar dominio `montesblanco.com` desde Vercel
9. [ ] Borrar este HANDOFF de `dynamo-web` y moverlo al repo nuevo

## Bitácora del proyecto

### 2026-05-14 — iMac
- Sesión arrancada para web inmobiliaria del hermano (Montes Blanco)
- Confirmado que la conversación anterior del MacBook NO se commiteó → contexto perdido
- Decidido stack: HTML estático + Vercel, repo aparte (NO dentro de dynamo-web)
- Creada carpeta local `/home/user/montesblanco-web` con git init
- Creado este HANDOFF para que el contexto sobreviva entre Macs vía dynamo-web
