-- =====================================================================================
-- ORDEN DE CARGA POR EL ENLACE DEL e-CMR, SIN CLAVE DE SERVICIO (2026-11-11)
-- =====================================================================================
-- La descarga pública de la orden (/cmr/<token>/orden, el enlace que Dynamo comparte
-- por email o WhatsApp desde la ficha) leía la base de datos con la CLAVE DE SERVICIO
-- del servidor, y donde esa clave no está configurada (p. ej. la preview de Vercel) el
-- enlace moría con «La plataforma no está conectada». Como el resto de páginas
-- públicas, los datos pasan a salir de una función SECURITY DEFINER con la clave
-- pública: la llave es el token vivo de cmr_enlaces, y la función aplica las mismas
-- reglas que aplicaba la ruta (ni enlaces revocados o caducados, ni envíos cancelados,
-- ni manuales, ni envíos sin transportista). Devuelve el JSON de orden_carga_json más
-- el transportista_id, con el que la ruta comprueba la clave de las copias con precio.
-- =====================================================================================

create or replace function public.datos_orden_por_cmr(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v cmr_enlaces%rowtype; e envios%rowtype;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then
    raise exception 'Este enlace no es válido: ha caducado o se ha retirado.' using errcode = '42501';
  end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.estado = 'cancelado' then
    raise exception 'Este envío está cancelado: ya no hace falta su orden de carga.' using errcode = '42501';
  end if;
  if e.operador_id is not null then
    raise exception 'Los envíos manuales no tienen orden de carga de Dynamo.' using errcode = '42501';
  end if;
  if e.transportista_id is null then
    raise exception 'Este envío aún no tiene transportista asignado.' using errcode = '42501';
  end if;
  return orden_carga_json(v.envio_id) || jsonb_build_object('transportista_id', e.transportista_id);
end $$;
revoke execute on function public.datos_orden_por_cmr(uuid) from public;
grant execute on function public.datos_orden_por_cmr(uuid) to anon, authenticated;
comment on function public.datos_orden_por_cmr(uuid) is '[Envíos] Devuelve el JSON de la orden de carga de un envío (orden_carga_json más transportista_id) a partir del enlace público de su e-CMR, para la descarga /cmr/<token>/orden que Dynamo comparte con el transportista. Rechaza enlaces revocados o caducados, envíos cancelados o manuales y envíos sin transportista. Quién: cualquiera con el enlace (anon). Argumentos: p_token: cmr_enlaces.token.';
