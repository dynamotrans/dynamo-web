-- =====================================================================================
-- EMAILS DE AVISOS DEL SITIO, EN SU SITIO (2026-11-03)
-- =====================================================================================
-- El usuario pide poder poner VARIAS personas de contacto en clientes, transportistas y
-- sitios (la tabla `contactos` ya lo permite: 1-N). Hasta hoy los "emails de avisos" de
-- un sitio se guardaban como contactos falsos (nombre 'Avisos', sin persona), que se
-- mezclarían con las personas de verdad en la lista. Pasan a una lista propia del sitio,
-- como ya preveía el mockup ("en Supabase se guardarán como text[]").
-- =====================================================================================

create function emails_validos(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(bool_and(e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'), true)
    from unnest(p) e
$$;

alter table lugares add column emails_avisos text[] not null default '{}'
  check (cardinality(emails_avisos) <= 10 and emails_validos(emails_avisos));
comment on column lugares.emails_avisos is
  'Emails a los que se avisa de las recogidas y entregas en este sitio (máx. 10), con '
  'total discrecion: sin precios ni otros clientes. No son personas: las personas van en contactos.';

-- Se pasan los que hubiera y se quitan los contactos falsos.
update lugares l set emails_avisos = x.lista
  from (select lugar_id, array_agg(distinct lower(email)) as lista
          from contactos
         where lugar_id is not null and recibe_avisos and not es_principal and email is not null
         group by lugar_id) x
 where x.lugar_id = l.id;
delete from contactos where lugar_id is not null and recibe_avisos and not es_principal and nombre = 'Avisos';
