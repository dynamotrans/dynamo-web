-- CONTACTO QUE HACE LAS DOS COSAS (usuario, 2026-11-27): «opción de poner que el contacto sea las 2
-- opciones… por si una empresa es pequeña y solo tiene uno que hace todo; marcado por defecto al
-- crear: Logística y Contabilidad». En los contactos de un CLIENTE, el rol «general» pasa a
-- llamarse «Logística y Contabilidad» y recibe lo de los dos roles (los avisos de los envíos y los
-- de la empresa: crédito, facturas, penalizaciones). Es el rol por defecto de un contacto nuevo.
create or replace function emails_contactos_cliente(p_cliente uuid, p_funcion funcion_contacto)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(distinct lower(btrim(c.email)), ',')
    from contactos c
   where c.cliente_id = p_cliente and c.recibe_avisos and c.funcion in (p_funcion, 'general')
     and nullif(btrim(c.email), '') is not null
$$;
revoke execute on function emails_contactos_cliente(uuid, funcion_contacto) from public, anon, authenticated;
comment on function public.emails_contactos_cliente(uuid, funcion_contacto) is '[Gestión interna] Emails de las personas de contacto de un cliente que tienen puesto «Recibe los avisos» y ese rol (trafico = Logística · contabilidad) o el rol de las dos cosas (general = «Logística y Contabilidad»), separados por comas. Vacío (null) si no hay ninguna. Quién: nadie la llama desde fuera; la usan las funciones que preparan emails. Argumentos: p_cliente: el cliente · p_funcion: el rol del contacto.';
