-- =====================================================================================
-- EL ENLACE DEL CMR VALE INDEFINIDAMENTE (usuario, 2026-11-09)
-- =====================================================================================
-- Fuera la caducidad de 60 días y el botón «Retirar enlace» de la ficha: el enlace nace
-- con el envío (20261109160000) y vale para siempre — el CMR se consulta y se firma
-- cuando toque, también meses después (reclamaciones, albaranes tardíos). La columna
-- `caduca_en` se queda (las funciones la comparan con now()): pasa a `infinity` por
-- defecto y en los enlaces vivos. `revocado` también se queda, como freno de emergencia
-- desde la base de datos, aunque la ficha ya no lo ofrezca.
-- =====================================================================================

alter table cmr_enlaces alter column caduca_en set default 'infinity';
update cmr_enlaces set caduca_en = 'infinity' where not revocado;

comment on column public.cmr_enlaces.caduca_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Hasta cuándo vale el enlace (instante). Desde 2026-11-09, infinity: el enlace del CMR no caduca (decisión del usuario). El valor se conserva por si algún enlace concreto necesitara un tope.';
