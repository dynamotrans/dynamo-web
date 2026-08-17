# Emails de Dynamo (Brevo)

Plantillas HTML diseñadas fuera del editor drag & drop de Brevo, para poder
iterarlas con Claude y tenerlas versionadas en git.

| Archivo | Qué es |
|---|---|
| `prospeccion-brevo.html` | Email de prospección (A/A. responsable de transporte). Listo para pegar en Brevo. |
| `build-assets.py` | Genera las imágenes del email en `images/email/` a partir de los originales de la web. |

---

## 1. Cómo subirlo a Brevo

**Importante**: no lo pegues en un *bloque HTML* dentro del editor drag & drop
(eso es lo que tienes ahora). Un bloque HTML no admite `<style>` ni media
queries, así que perderías el diseño responsive. Crea la plantilla como HTML
completo:

1. Brevo → **Campañas → Plantillas → Nueva plantilla**
2. Elegir **"Codifica tu propio diseño"** (o *Importar HTML* / *Pegar tu código*)
3. Pegar **todo** el contenido de `prospeccion-brevo.html`
4. Rellenar **Asunto** y **Vista previa** (ver punto 4)
5. **Vista previa y prueba → Enviar email de prueba** a una dirección tuya
6. Guardar. Ya se puede seleccionar en **Automatizaciones** igual que ahora.

Una vez importada, la plantilla se edita solo por código (no por drag & drop).
Es justo lo que buscamos: los cambios se hacen aquí y se vuelven a pegar.

---

## 2. Etiquetas de Brevo que usa

| Etiqueta | Dónde aparece | Si el contacto no la tiene |
|---|---|---|
| `{{ contact.NOMBRE }}` | Línea "A/A. de responsable transporte/logística de …" | Muestra "tu empresa" (filtro `default`) |
| `{{ contact.PROVINCIA }}` | "desde tu almacén de …" | La frase se acorta sola (bloque `{% if %}`) |
| `{{ unsubscribe }}` | Enlace de baja (×2) | Lo genera Brevo, obligatorio por RGPD |
| `{{ mirror }}` | "Ver en el navegador" (pie) | Lo genera Brevo |

**Campos personalizados que deberías tener creados en Brevo** (Contactos →
Atributos): `NOMBRE` (texto) y `PROVINCIA` (texto). Son los dos únicos
imprescindibles.

Si en algún momento quieres afinar más, estos merecen la pena:

- `CONTACTO` — nombre de la persona, para poder decir "Buenos días, Marta"
  en vez de un genérico. Es lo que más sube la tasa de respuesta.
- `SECTOR` — para variar la frase de mercancía (palets / maquinaria / obra).

Si añades `CONTACTO`, cambia el saludo por:
`Buenos días{% if contact.CONTACTO %} {{ contact.CONTACTO }}{% endif %},`

> **Si los bloques `{% if %}` te dieran problemas** en tu cuenta, cámbialos por
> el filtro `default`, que es el que ya usas en el asunto:
> `desde tu almacén de {{ contact.PROVINCIA | default : "tu zona" }}.`

---

## 3. Imágenes

Todas apuntan a `https://www.dynamotrans.com/images/email/…`. Los archivos ya
están en el repo (`images/email/`), pero **esa carpeta tiene que estar en `main`
para que las URLs respondan** — mientras solo esté en la rama de trabajo, las
imágenes darán 404 en el email.

Dos opciones:

- **A — Subirlas a la galería de Brevo** (recomendada, no toca producción).
  Brevo → Imágenes → subir los 4 archivos de `images/email/`, copiar la URL de
  cada una y sustituirla en el HTML. Ventaja: no dependes de un deploy.
- **B — Publicar `images/email/` en `main`.** Son solo assets estáticos, no
  cambian nada visible de la web. Una vez en producción, las URLs del HTML
  funcionan tal cual.

**Falta una imagen**: el banner `dynamo + AGENCIA DE TRANSPORTE.es` no está en
este repo. Busca `BANNER-AT` en el HTML y pega ahí la URL de la que ya usas en
Brevo (clic derecho sobre la imagen en el editor → copiar dirección de imagen).
Si no la quieres, borra esa fila `<tr>` entera.

### Regenerar las imágenes

```bash
pip install pillow
python3 emails/build-assets.py
```

Genera en `images/email/`: `hero.jpg`, `clientes.png`, `logo-dynamo.png` y
`alvaro.png`. Todo en JPG/PNG a propósito: **Outlook de Windows no pinta WebP**,
así que los `.webp` de la web no sirven en email.

---

## 4. Asunto y vista previa

El asunto que tienes ahora (`{{ contact.NOMBRE | default : "" }}, transportes
esta semana?`) tiene un fallo: si el contacto no trae NOMBRE, al destinatario le
llega un asunto que **empieza por coma**. Cambia el `default` a algo con
contenido.

Opciones (de más a menos personalizada):

| Asunto | Notas |
|---|---|
| `{{ contact.NOMBRE \| default : "Hola" }}, ¿transportes esta semana?` | El tuyo, con el fallback arreglado |
| `¿Algún transporte desde {{ contact.PROVINCIA \| default : "tu almacén" }} esta semana?` | Usa la provincia, muy concreto |
| `Grupaje o carga completa desde {{ contact.PROVINCIA \| default : "tu zona" }}` | Sin pregunta, más informativo |
| `Te paso precio de transporte hoy mismo` | Genérico, sirve si la base viene sucia |

**Vista previa (preheader)**: el HTML ya trae uno propio oculto
("Grupajes o carga completa, nacional y Europa. Dime qué mueves y te paso precio
hoy mismo."). Si rellenas también el campo *Vista previa* de Brevo, ese gana.
Deja uno de los dos, no repitas el asunto.

Para no caer en spam: sin MAYÚSCULAS en el asunto, sin "gratis" ni "oferta",
sin exclamaciones, y menos de ~50 caracteres.

---

## 5. Comprobado

- Renderizado en Chromium a 700px (escritorio) y 380px (móvil): las columnas
  (botones, reseñas, camiones) se apilan bien en móvil y las cifras pasan a 2×2.
- Sin errores de JS ni desbordes horizontales.
- Tablas + CSS inline + ghost tables de Outlook (`<!--[if mso]-->`), que es lo
  que necesita el motor Word de Outlook Windows.
- Falta la prueba real en clientes de correo: **manda un email de prueba desde
  Brevo** a Gmail, Outlook y el móvil antes de la primera campaña.

---

## 6. Detalle del texto

En el original se mezclaba usted y tú en la misma frase ("Le escribo por si
puedo ayudar**le** … desde **tu** almacén"). Lo he dejado tal cual para no
cambiarte el copy, pero conviene unificar a tú, que es lo que usa el resto del
email. Si quieres, se cambia en un minuto.

---

## 7. Enviar sin pasar por el editor (opcional, futuro)

Con la API de Brevo se puede crear/actualizar la plantilla y enviar desde
script, sin abrir el editor nunca:

- `POST https://api.brevo.com/v3/smtp/templates` — crear (campo `htmlContent`)
- `PUT  https://api.brevo.com/v3/smtp/templates/{id}` — actualizar
- `POST https://api.brevo.com/v3/smtp/email` — enviar con `templateId` + `params`

Requiere una API key en `BREVO_API_KEY` (variable de entorno, nunca en el repo).
Cuando lo quieras, se monta el script.
