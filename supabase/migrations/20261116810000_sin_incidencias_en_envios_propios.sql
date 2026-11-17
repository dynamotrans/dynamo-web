-- =====================================================================================
-- SIN INCIDENCIAS EN LOS ENVÍOS CON TRANSPORTISTA PROPIO (usuario, 2026-11-17)
-- =====================================================================================
-- «Envío con transportista propio no puede reportar incidencias.» Las incidencias son
-- para que Dynamo resuelva algo de un transporte que lleva Dynamo. En un envío que el
-- cliente hace con SU transportista, Dynamo no interviene: no hay nada que reportarle.
-- La ficha ya no enseña el botón; aquí queda cerrado también en la base de datos, porque
-- la pantalla no manda.

create or replace function envio_es_manual(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select e.es_manual from envios e where e.id = p_envio), false)
$$;
revoke execute on function envio_es_manual(uuid) from public, anon;
grant execute on function envio_es_manual(uuid) to authenticated;
comment on function public.envio_es_manual(uuid) is '[Ayudantes internos] ¿El envío es de los que un cliente hace con su propio transportista (sin Dynamo)? Solo devuelve sí o no: la usan las reglas de permisos, porque el cliente no puede leer la tabla de envíos. Quién: las reglas de permisos (cualquier usuario con sesión). Argumentos: p_envio: el envío.';

create policy incidencias_no_en_envio_propio on incidencias as restrictive for insert to authenticated
  with check ((select es_equipo_dynamo()) or envio_id is null or not envio_es_manual(envio_id));
