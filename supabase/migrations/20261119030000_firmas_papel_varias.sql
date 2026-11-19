-- =====================================================================================
-- «FIRMÓ EN PAPEL»: VARIAS CASILLAS A LA VEZ, TAMBIÉN EL TRANSPORTISTA, Y SIN TECLEAR
-- NOMBRE NI DOCUMENTO (usuario, 2026-11-19)
-- =====================================================================================
-- «En papel, el selector de partes: hay que meter también al transportista, con un check
-- para cada uno, y por defecto todos marcados. Y quitamos nombre, país y documento: más
-- simple, esos datos ya vendrán en el papel.»
-- registrar_firmas_papel() apunta de una vez las casillas elegidas (remitente de cada
-- carga, transportista, destinatario de cada entrega) con la MISMA foto del CMR en papel.
-- Quién firmó no se teclea: consta en el papel anexo. En la firma queda el nombre de la
-- parte (la empresa del sitio o el transportista) y, como documento, «EN PAPEL».
-- La función de una sola casilla (registrar_firma_papel) sigue igual.
-- =====================================================================================

create or replace function public.registrar_firmas_papel(p_envio uuid, p_paradas uuid[], p_transportista boolean, p_documento_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; d record; p record; v_rol text; v_nombre text; n int := 0;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo Dynamo registra una firma en papel.' using errcode = '42501';
  end if;
  select es_manual, matricula_camion, transportista_id into e from envios where id = p_envio;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'gestion_directa'); end if;
  if cardinality(coalesce(p_paradas, '{}')) = 0 and not coalesce(p_transportista, false) then
    return jsonb_build_object('resultado', 'nada_elegido');
  end if;
  if exists (select 1 from unnest(coalesce(p_paradas, '{}')) x
              where not exists (select 1 from envio_paradas ep where ep.id = x and ep.envio_id = p_envio)) then
    return jsonb_build_object('resultado', 'parada_no_valida');
  end if;
  -- Como en la firma digital: nadie firma un CMR sin matrícula del camión.
  if e.matricula_camion is null then return jsonb_build_object('resultado', 'sin_matriculas'); end if;
  select id, storage_ruta, tipo, borrado into d from documentos where id = p_documento_id and envio_id = p_envio;
  if d.id is null or coalesce(d.borrado, false) or d.tipo not in ('cmr_firmado', 'albaran') then
    return jsonb_build_object('resultado', 'falta_documento');
  end if;

  -- Las casillas de sitio elegidas que aún no tienen firma (las ya firmadas no se tocan).
  for p in select ep.id, ep.tipo, ep.nombre_empresa, ep.poblacion from envio_paradas ep
            where ep.envio_id = p_envio and ep.id = any (coalesce(p_paradas, '{}')) order by ep.orden loop
    v_rol := case when p.tipo = 'carga' then 'remitente' else 'destinatario' end;
    if exists (select 1 from firmas_cmr where envio_id = p_envio and parada_id = p.id and rol = v_rol and not extra) then continue; end if;
    v_nombre := coalesce(nullif(trim(p.nombre_empresa), ''), nullif(trim(p.poblacion), ''),
                         case when v_rol = 'remitente' then 'Remitente' else 'Destinatario' end);
    insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                            firma_storage_ruta, extra, en_papel, documento_papel_id)
    values (p_envio, p.id, v_rol, left(v_nombre, 120), 'EN PAPEL', 'XX', false, d.storage_ruta, false, true, d.id);
    n := n + 1;
  end loop;
  -- La del transportista (casilla 23): una por envío, sin parada.
  if coalesce(p_transportista, false)
     and not exists (select 1 from firmas_cmr where envio_id = p_envio and rol = 'transportista' and not extra) then
    select coalesce(nullif(trim(t.nombre_visible), ''), nullif(trim(t.razon_social), '')) into v_nombre
      from transportistas t where t.id = e.transportista_id;
    insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                            firma_storage_ruta, extra, en_papel, documento_papel_id)
    values (p_envio, null, 'transportista', left(coalesce(v_nombre, 'Transportista'), 120), 'EN PAPEL', 'XX', false, d.storage_ruta, false, true, d.id);
    n := n + 1;
  end if;
  if n = 0 then return jsonb_build_object('resultado', 'ya_firmada'); end if;
  return jsonb_build_object('resultado', 'ok', 'firmas', n);
end $function$;
revoke all on function public.registrar_firmas_papel(uuid, uuid[], boolean, uuid) from public, anon;
grant execute on function public.registrar_firmas_papel(uuid, uuid[], boolean, uuid) to authenticated, service_role;
comment on function public.registrar_firmas_papel(uuid, uuid[], boolean, uuid) is '[CMR] Apunta de una vez las casillas del CMR que se firmaron EN PAPEL (CMR bis): el remitente o destinatario de las paradas dadas y, si se pide, el transportista, todas con la misma foto del papel. Quién firmó consta en el papel: en la firma queda el nombre de la parte y «EN PAPEL» como documento. Las casillas ya firmadas no se tocan. Quién: equipo de Dynamo. Argumentos: p_envio: el envío; p_paradas: paradas cuya casilla se firmó en papel; p_transportista: si también firmó el transportista; p_documento_id: la foto o PDF del CMR en papel (documento del envío).';

-- La hoja pública de firma enseña el documento de cada firmante tapado («•••678Z»). La
-- marca «EN PAPEL» no es un documento: se deja a la vista para que la hoja pueda decir
-- «firmada en papel» sin inventar un documento tapado.
do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.cmr_publico(uuid)'::regprocedure) into v_def;
  if position($q$case when f.documento = 'EN PAPEL'$q$ in v_def) > 0 then return; end if;   -- ya está
  v_nueva := replace(v_def,
    $q$'documento', '•••' || right(f.documento, 4),$q$,
    $q$'documento', case when f.documento = 'EN PAPEL' then f.documento else '•••' || right(f.documento, 4) end,$q$);
  if v_nueva = v_def then raise exception 'cmr_publico() ya no tapa el documento como se esperaba: revisar la migración'; end if;
  execute v_nueva;
end $$;
