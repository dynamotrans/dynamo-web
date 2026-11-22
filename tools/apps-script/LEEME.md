# Subir los albaranes de Drive a la plataforma

Proceso **nuevo y separado** del que ya funciona (la tarea de Claude que clasifica los emails y
el Apps Script del clasificador). No los toca: solo **lee** la carpeta `02-ALBARANES` y sube los
archivos nuevos a la plataforma, donde esperan en **Verificación albaranes** (menú de Dynamo)
sin que el cliente los vea hasta que se aceptan. Los dos procesos conviven; cuando el nuevo vaya
bien, se puede parar lo que sobre del viejo.

## Pasos (una vez)

1. **Clave de la entrada.** Inventa una clave larga (40 caracteres o más, letras y números; un
   gestor de contraseñas la genera). Ponla en **Vercel → Settings → Environment Variables** como
   `ENTRADA_DOCUMENTOS_TOKEN` (Sensitive, en Preview y, cuando toque, en Production). No la
   mandes por el chat ni la guardes en el repositorio. Tras guardarla, vuelve a desplegar.
2. **Proyecto nuevo de Apps Script** con la cuenta de Dynamo: script.google.com → Nuevo proyecto
   → pega `SubirAlbaranesPlataforma.gs`.
3. **Propiedades del script** (⚙ Configuración del proyecto → Propiedades del script):
   - `URL_PLATAFORMA`: la dirección de la plataforma (la de pruebas mientras se prueba).
   - `TOKEN`: la misma clave del paso 1.
   - `CARPETA_ID`: el id de la carpeta `02-ALBARANES` (lo que va tras `/folders/` en su dirección).
   - `DESDE` (opcional): `AAAA-MM-DD` para subir también los de antes; sin ella, los de los últimos 7 días.
   - `BYPASS_VERCEL` (solo mientras se usa la dirección de **pruebas** de Vercel, que pide iniciar
     sesión): en Vercel → Settings → Deployment Protection → *Protection Bypass for Automation*,
     crea el secreto y pégalo aquí. Con el dominio de producción no hace falta.
4. Ejecuta **`instalar`** una vez: pide permisos (Drive y conexión externa) y deja programada la
   subida cada 15 minutos.

## Cómo funciona

- Pide a la plataforma dónde subir cada archivo; si ya entró antes (mismo archivo de Drive, o el
  mismo contenido), no lo vuelve a subir.
- La plataforma comprueba que es un PDF o una imagen **de verdad**, lee la referencia GX del
  nombre (`GX66081_ALB_…`) y lo asigna a su envío. Si no casa con ningún envío, sale marcado
  «Sin GX ⚠» y se puede escribir la referencia buena al revisarlo.
- Tope de 300 archivos al día (más es un error).
