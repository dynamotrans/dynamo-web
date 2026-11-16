-- =====================================================================================
-- EMAILS DEL ENVÍO AL CLIENTE: ORDEN Y AIRE DEL BLOQUE DE DATOS (usuario, 2026-11-16)
-- =====================================================================================
-- El usuario lo quiere así:
--   · Más aire entre la ruta y los datos, y entre los datos y «Lo sigues en vivo…».
--   · El transporte ANTES del precio (el precio, lo último).
--   · Sin transportista: «Asignando transporte.» (antes «buscando camión»).
-- (copiada de 20261116570000_emails_al_cliente_del_envio; cambian el orden, el margen del
-- párrafo y los textos del transporte, que ahora empiezan en mayúscula)
create or replace function envio_detalle_html(p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record; v_ruta text; v_transporte text;
begin
  select * into e from envios where id = p_envio;
  if e.id is null then return ''; end if;
  select string_agg(format('<li><strong>%s</strong> · %s</li>',
           case when p.tipo = 'carga' then 'Recogida' else 'Entrega' end,
           escapar_html(concat_ws(' — ', nullif(btrim(p.nombre_empresa), ''),
             concat_ws(', ', nullif(btrim(p.direccion), ''), nullif(btrim(concat_ws(' ', p.codigo_postal, p.poblacion)), ''),
                       case when p.provincia is distinct from p.poblacion then nullif(btrim(p.provincia), '') end)))), '' order by p.orden)
    into v_ruta from envio_paradas p where p.envio_id = p_envio;
  v_transporte := case
    when e.transportista_id is null then 'Asignando transporte.'
    when e.matricula_camion is null then 'Transportista asignado · matrículas pendientes'
    else concat_ws(' · ', 'Camión ' || e.matricula_camion,
           case when e.matricula_remolque is not null then 'remolque ' || e.matricula_remolque end,
           case when nullif(btrim(e.conductor_nombre), '') is not null
                then 'conductor ' || btrim(e.conductor_nombre) || coalesce(' (' || nullif(btrim(e.conductor_telefono), '') || ')', '') end) end;
  return format('<p><strong>Datos del envío #%s</strong></p><ol>%s</ol><p style="margin:24px 0"><strong>Fecha de carga:</strong> %s%s%s%s<br><strong>Transporte:</strong> %s%s</p>',
    escapar_html(e.referencia_gx), coalesce(v_ruta, ''),
    envio_fecha_carga_texto(e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_prevista),
    case when e.fecha_entrega_estimada is not null then '<br><strong>Entrega estimada:</strong> ' || fecha_texto(e.fecha_entrega_estimada) else '' end,
    '<br><strong>Mercancía:</strong> ' || escapar_html(coalesce(nullif(envio_mercancia_texto(e.metros_lineales, e.toneladas, e.tipo_carga::text,
       e.requiere_plataforma_elevadora, e.descripcion_mercancia, e.adr, e.requiere_nima), ''), '—')),
    case when nullif(btrim(e.referencia_cliente), '') is not null then '<br><strong>Tu referencia:</strong> ' || escapar_html(e.referencia_cliente) else '' end,
    escapar_html(v_transporte),
    case when e.importe_cliente is not null then '<br><strong>Precio:</strong> ' || euros_texto(e.importe_cliente) || ' + IVA' else '' end);
end $$;
comment on function public.envio_detalle_html(uuid) is '[Gestión interna] Bloque de detalle de un envío para los emails al cliente, con aire por arriba y por abajo: la ruta parada a parada, la fecha de carga, la entrega estimada, la mercancía, su referencia, el transporte («Asignando transporte.», o matrículas y conductor cuando los hay; nunca el nombre del transportista) y, lo último, el precio. Quién: nadie la llama desde fuera; la usan los avisos por email. Argumentos: p_envio: el envío.';
