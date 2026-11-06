# Redes sociales — post semanal automático

- Publicación: **martes 8:00 (Europe/Madrid)** en Instagram @dynamotransportes vía Metricool (blogId 7908179).
- Lo genera una tarea programada de Claude cada lunes por la tarde.
- Imagen: `python3 redes/render.py --variant v1|v2|v3|v4 --title "..." [--body "..."] [--kicker "..."] [--list "a|b|c"] [--photo alt] --out images/redes/AAAA-MM-DD-slug.jpg` (genera JPG 1080×1080 directamente). Rotación de estilos en `TEMAS.md`.
- Las imágenes se sirven públicas en `https://www.dynamotrans.com/images/redes/…` (solo el dominio propio es público; `*.vercel.app` pide login).
- Temas e histórico: `redes/TEMAS.md`.

## Historias (tarea aparte)
- `render.py --format story` genera 1080×1920 con botón de CTA; `video.py` la convierte en MP4 de 12 s con zoom suave y **música original generada con `musica.py`** (moods upbeat/chill/minimal, distinta por seed; sin derechos de terceros).
- Se publican como STORY en Instagram y Facebook vía Metricool (sin caption; el mensaje va en la imagen).
- Histórico de historias: `redes/HISTORIAS.md`.
