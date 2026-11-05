# Redes sociales — post semanal automático

- Publicación: **martes 8:00 (Europe/Madrid)** en Instagram @dynamotransportes vía Metricool (blogId 7908179).
- Lo genera una tarea programada de Claude cada lunes por la tarde.
- Imagen: `python3 redes/render.py "<titular con <em>palabra</em>>" "<texto>" images/redes/AAAA-MM-DD-slug.jpg`
  (render.py genera PNG; convertir a JPG calidad ~82 con Pillow antes de subir).
- Las imágenes se sirven públicas en `https://www.dynamotrans.com/images/redes/…` (solo el dominio propio es público; `*.vercel.app` pide login).
- Temas e histórico: `redes/TEMAS.md`.
