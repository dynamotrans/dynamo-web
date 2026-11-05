# Redes sociales — post semanal automático

- Publicación: **martes 8:00 (Europe/Madrid)** en Instagram @dynamotransportes vía Metricool (blogId 7908179).
- Lo genera una tarea programada de Claude cada lunes por la tarde.
- Imagen: `python3 redes/render.py --variant v1|v2|v3|v4 --title "..." [--body "..."] [--kicker "..."] [--list "a|b|c"] [--photo alt] --out images/redes/AAAA-MM-DD-slug.jpg` (genera JPG 1080×1080 directamente). Rotación de estilos en `TEMAS.md`.
- Las imágenes se sirven públicas en `https://www.dynamotrans.com/images/redes/…` (solo el dominio propio es público; `*.vercel.app` pide login).
- Temas e histórico: `redes/TEMAS.md`.
