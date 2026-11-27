-- SITIOS: UN SOLO TELÉFONO POR CONTACTO (usuario, 2026-11-27). «En sitios quítalo de teléfono fijo.
-- Vamos a poner móviles para todos los sitios y punto. Si alguien quiere poner un teléfono fijo,
-- que añada un contacto nuevo y ponga en el nombre "Teléfono fijo de oficina" o algo así. No vamos
-- a tener dos campos de teléfono.» Deshace el reparto móvil/fijo del 2026-11-26:
--   · Los contactos de un SITIO usan solo «telefono» (el móvil, para WhatsApp). Si alguien escribe
--     ahí un fijo, se queda donde lo escribió: ya no se mueve a ningún otro campo.
--   · Los fijos que ya había no se pierden: si el contacto no tenía móvil, el fijo pasa a su
--     teléfono; si tenía los dos, el fijo pasa a un contacto nuevo del mismo sitio, «Teléfono fijo».
--   · Desde ahora, un contacto de sitio no puede llevar telefono_fijo (la columna queda sin uso).

drop trigger if exists tg_a_telefonos_sitio on public.contactos;
drop function if exists public.fn_contacto_sitio_telefonos();

-- Con móvil y fijo: el fijo, a un contacto nuevo del mismo sitio.
insert into public.contactos (sitio_id, nombre, funcion, telefono, recibe_avisos, es_principal)
select c.sitio_id, left('Teléfono fijo' || coalesce(' · ' || nullif(btrim(c.nombre), ''), ''), 200), c.funcion, c.telefono_fijo, false, false
  from public.contactos c
 where c.sitio_id is not null and c.telefono_fijo is not null and c.telefono is not null;
update public.contactos set telefono_fijo = null
 where sitio_id is not null and telefono_fijo is not null and telefono is not null;
-- Solo con fijo: pasa a su teléfono.
update public.contactos set telefono = telefono_fijo, telefono_fijo = null
 where sitio_id is not null and telefono_fijo is not null;

alter table public.contactos drop constraint if exists ck_contactos_sitio_un_telefono;
alter table public.contactos add constraint ck_contactos_sitio_un_telefono check (sitio_id is null or telefono_fijo is null);

comment on column public.contactos.telefono_fijo is 'formato: texto, + y solo cifras | rango: 6 a 15 cifras | lista: no aplica | opcional | SIN USO desde el 2026-11-27: los contactos de un sitio llevan un solo teléfono (telefono) y no pueden usar esta columna; si alguien quiere un fijo, añade otro contacto. Ej. OK: vacío · Ej. MAL: +34954123456 en un contacto de sitio';
comment on column public.contactos.telefono is 'formato: texto, + y solo cifras | rango: 6 a 15 cifras | lista: no aplica | opcional | Teléfono de la persona de contacto. En los contactos de un SITIO es el único teléfono (se pide móvil, para WhatsApp; si es un fijo, se queda tal cual). Ej. OK: +34600123123 · Ej. MAL: 600 12 31 23';

-- El texto de búsqueda de los sitios afectados se rehace (el número cambia de campo o de contacto).
update public.sitios s set texto_busqueda = sitio_texto_busqueda(s)
 where exists (select 1 from contactos c where c.sitio_id = s.id and c.nombre like 'Teléfono fijo%');
