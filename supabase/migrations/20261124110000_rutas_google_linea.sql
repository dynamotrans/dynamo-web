-- RUTAS DE GOOGLE (usuario, 2026-11-24: «distancias, rutas pintadas…»). Los kilómetros por
-- carretera ya tenían dónde guardarse (distancias_sitios y distancias_cp). Se añade la LÍNEA de
-- la ruta, tal como la da Google (codificada), para pintarla en el mapa sin volver a pedirla.
alter table public.distancias_sitios add column if not exists linea text check (linea is null or length(linea) <= 60000);
alter table public.distancias_cp add column if not exists linea text check (linea is null or length(linea) <= 60000);
comment on column public.distancias_sitios.linea is 'formato: texto (línea codificada de Google) | rango: hasta 60.000 caracteres | lista: no aplica | automático | El trazado de la ruta por carretera entre los dos sitios, como lo devuelve Google Routes, para pintarlo en el mapa. Vacío si la distancia no vino de Google.';
comment on column public.distancias_cp.linea is 'formato: texto (línea codificada de Google) | rango: hasta 60.000 caracteres | lista: no aplica | automático | El trazado de la ruta por carretera entre los dos códigos postales, como lo devuelve Google Routes, para pintarlo en el mapa. Vacío si la distancia no vino de Google.';
