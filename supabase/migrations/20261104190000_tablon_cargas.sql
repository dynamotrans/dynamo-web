-- =====================================================================================
-- TABLÓN «OTRAS CARGAS DISPONIBLES» en la página pública de una carga (2026-11-04)
-- =====================================================================================
-- El transportista que entra por un enlace de bolsa ve, además, otras cargas de Dynamo
-- que siguen libres, con su enlace general (el mismo que ya va publicado en la bolsa).
--
-- · Solo con un enlace válido en la mano (el de la carga que está viendo): así la lista
--   no se puede pedir a ciegas desde fuera.
-- · Solo cargas PUBLICADAS en bolsa, programadas, sin transportista, sin reserva en
--   curso y con la fecha de carga por llegar. Máximo 12, las más próximas primero.
-- · Los mismos datos que la propia página pública: CP, población y provincia (ni
--   empresa, ni calle, ni cliente: anti-desintermediación), fechas, medidas y precio.
-- =====================================================================================
create or replace function otras_cargas_publicas(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha_carga_desde', x->>'referencia')
      from (
        select jsonb_build_object(
          'token', e.token_publico, 'referencia', e.referencia_gx,
          'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
          'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
          'precio', e.importe_transportista,
          'origen',  (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden limit 1),
          'destino', (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden desc limit 1)) as x
          from envios e
         where e.id <> t.envio_id
           and e.publicado_en_bolsa_en is not null
           and e.estado = 'programado' and e.estado_asignacion is distinct from 'confirmada' and e.transportista_id is null
           and e.importe_transportista is not null
           and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) >= (now() at time zone 'Europe/Madrid')::date
           and not exists (select 1 from envio_reservas r where r.envio_id = e.id
                            and r.estado in ('viva', 'pendiente_revision') and r.hasta > now())
         order by e.fecha_carga_desde, e.referencia_gx
         limit 12) s), '[]'::jsonb);
end $$;
revoke execute on function otras_cargas_publicas(uuid) from public;
grant execute on function otras_cargas_publicas(uuid) to anon, authenticated;
