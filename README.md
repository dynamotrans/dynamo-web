# Montes Blanco Real Estate

Sitio web oficial de **Montes Blanco Real Estate SL** — inmobiliaria boutique en Dos Hermanas (Sevilla) desde 2005.

🌐 **Producción**: https://www.montesblanco.com (apuntar tras desplegar en Vercel)

## Stack
- HTML5 + CSS3 + Vanilla JS (sin frameworks, sin build)
- Hosting: **Vercel** (despliegue automático desde `main`)
- Tipografías: Cormorant Garamond + Inter (Google Fonts)
- Formulario: FormSubmit (sin backend)
- i18n: 7 idiomas (ES por defecto, EN/FR/DE/PT/RU/AR) vía `js/translations.json`

## Estructura
```
.
├── index.html            Home (single-page con anclas)
├── aviso-legal.html      Página legal
├── privacidad.html       Política de privacidad
├── robots.txt
├── sitemap.xml
├── vercel.json           Cabeceras de seguridad + cache
├── css/
│   └── styles.css
├── js/
│   ├── main.js           Navbar, reveal, i18n, lang switcher
│   └── translations.json 7 idiomas
└── images/
    ├── favicon.svg
    ├── *-placeholder.svg Placeholders mientras llegan las fotos reales
    └── (sustituir por fotos reales con el nombre indicado)
```

## Desarrollo local
```bash
python3 -m http.server 3000
# abrir http://localhost:3000
```
(o `npx serve .` si prefieres Node)

## Imágenes pendientes de subir
Reemplazar los placeholders SVG por archivos con el mismo nombre base:
- `images/hero.jpg` (1920×1080) — foto de fondo del hero
- `images/manolo-montes.jpg` (800×1000 retrato)
- `images/local-fachada.jpg` — fachada de la oficina
- `images/local-zona.jpg` — entorno (plaza palmeras)
- `images/local-interior.jpg` — interior del local
- `images/og-cover.jpg` (1200×630) — preview redes sociales

El HTML usa `onerror` para caer al placeholder si la foto real aún no está, así que se puede desplegar antes de tenerlas todas.

## Despliegue en Vercel
1. Importar este repo desde el dashboard de Vercel
2. Framework Preset: **Other** (estático)
3. Build command: vacío · Output directory: `./`
4. Conectar dominio `montesblanco.com` desde Settings → Domains

## Idiomas y RTL
- El idioma por defecto es **ES**. Si el navegador del visitante está en uno de los 7 soportados, arranca en ese.
- La preferencia se guarda en `localStorage` (`mb_lang`).
- **Árabe** activa automáticamente `dir="rtl"`.

## Redes sociales
Editar `js/main.js` → constante `SOCIAL`:
```js
const SOCIAL = {
  facebook: 'https://facebook.com/...',
  instagram: 'https://instagram.com/...'
};
```
Si están vacías, los iconos se ocultan automáticamente.

## Contacto del negocio
- C. Canónigo 49, oficina derecha · 41701 Dos Hermanas, Sevilla
- 854 69 14 60 · +34 635 64 38 27
- info@montesblanco.com
