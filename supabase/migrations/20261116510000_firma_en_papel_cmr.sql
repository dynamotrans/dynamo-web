-- =====================================================================================
-- FIRMA EN PAPEL QUE COMPLETA EL CMR DIGITAL — «CMR BIS» (usuario, 2026-11-16)
-- =====================================================================================
-- «Dos recogidas y dos entregas, todos firman en digital y el último dice que solo en
-- papel. En el almacén no hay impresora: se hace a mano un CMR con la misma referencia y
-- su firma… poniendo que se añade al eCMR como adicional, completándolo.»
--
-- Una parada puede quedar firmada EN PAPEL: el conductor rellena a mano un CMR con la
-- misma referencia («CMR bis»), lo firman él y quien entrega o recibe, y su foto se sube
-- al envío. Dynamo lo registra aquí y el CMR digital queda completo, diciendo con todas
-- las letras que esa firma está en el anexo en papel. Las firmas digitales de las demás
-- partes no se tocan: cada una prueba lo suyo.
--
--   · Solo paradas (cargador o destinatario); la firma del transportista no va en papel.
--   · Solo Dynamo, y adjuntando el documento escaneado (un «CMR firmado» o un albarán de
--     ese mismo envío): sin la foto no se registra.
--   · Es una firma más del registro, con sus mismas garantías: no se cambia ni se borra.

alter table firmas_cmr add column en_papel boolean not null default false;
alter table firmas_cmr add column documento_papel_id uuid references documentos (id) on delete restrict;
alter table firmas_cmr add constraint ck_firmas_papel_con_documento check (en_papel = (documento_papel_id is not null));
comment on column firmas_cmr.en_papel is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | true = esta parada se firmó EN PAPEL (CMR bis con la misma referencia) y aquí queda registrada para completar el CMR digital; false = firma digital hecha en la página del CMR.';
comment on column firmas_cmr.documento_papel_id is 'formato: uuid | → documentos.id | rango: no aplica | lista: no aplica | opcional | El documento escaneado del CMR en papel (CMR bis) donde está la firma. Obligatorio en las firmas en papel; vacío en las digitales.';

create or replace function registrar_firma_papel(p_envio uuid, p_parada uuid, p_nombre text, p_documento text,
                                                 p_documento_pais text, p_documento_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tipo text; v_rol text; d record; e record;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo Dynamo registra una firma en papel.' using errcode = '42501';
  end if;
  select es_manual, matricula_camion into e from envios where id = p_envio;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'gestion_directa'); end if;
  select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = p_envio;
  if v_tipo is null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  v_rol := case when v_tipo = 'carga' then 'remitente' else 'destinatario' end;
  if exists (select 1 from firmas_cmr where envio_id = p_envio and parada_id = p_parada and rol = v_rol and not extra) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if nullif(trim(p_nombre), '') is null or nullif(trim(p_documento), '') is null then
    return jsonb_build_object('resultado', 'faltan_datos');
  end if;
  -- Como en la firma digital: nadie firma un CMR sin matrícula del camión.
  if e.matricula_camion is null then return jsonb_build_object('resultado', 'sin_matriculas'); end if;
  select id, storage_ruta, tipo, borrado into d from documentos where id = p_documento_id and envio_id = p_envio;
  if d.id is null or coalesce(d.borrado, false) or d.tipo not in ('cmr_firmado', 'albaran') then
    return jsonb_build_object('resultado', 'falta_documento');
  end if;
  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          firma_storage_ruta, extra, en_papel, documento_papel_id)
  values (p_envio, p_parada, v_rol, trim(p_nombre), upper(regexp_replace(p_documento, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(p_documento_pais, ''), 'XX')),
          upper(coalesce(nullif(p_documento_pais, ''), 'XX')) = 'ES' and documento_es_valido(p_documento),
          d.storage_ruta, false, true, d.id);
  return jsonb_build_object('resultado', 'ok', 'rol', v_rol);
end $$;
revoke execute on function registrar_firma_papel(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function registrar_firma_papel(uuid, uuid, text, text, text, uuid) to authenticated;
comment on function public.registrar_firma_papel(uuid, uuid, text, text, text, uuid) is '[CMR y PIN] Registra que una parada del envío se firmó EN PAPEL (CMR bis con la misma referencia), adjuntando el documento escaneado, para completar el CMR digital. Queda como una firma más del registro, marcada «en papel», sin tocar las digitales. Devuelve {resultado: ok | ya_firmada | faltan_datos | falta_documento | parada_no_valida | sin_matriculas | gestion_directa | no_existe}. Quién: equipo Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_parada: envio_paradas.id · p_nombre: quien firmó · p_documento: su DNI/NIE/pasaporte · p_documento_pais: país del documento (2 letras) · p_documento_id: documentos.id del CMR escaneado (tipo cmr_firmado o albaran, de ese envío).';

-- ---- Que las lecturas digan cuál es en papel -------------------------------------------
-- Las funciones que arman la lista de firmas en JSON (página pública, PDF por enlace).
do $$
declare r record; v_def text; v_nueva text; n int := 0;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%''ruta'', f.firma_storage_ruta,%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := replace(v_def, '''ruta'', f.firma_storage_ruta,', '''ruta'', f.firma_storage_ruta, ''en_papel'', f.en_papel,');
    if v_nueva <> v_def then execute v_nueva; n := n + 1; end if;
  end loop;
  if n = 0 then raise exception 'No encuentro ninguna función que arme la lista de firmas del CMR: revisar antes de aplicar.'; end if;
end $$;

-- La lista de firmas de la ficha de Dynamo, del cliente y del transportista.
drop function firmas_envio(uuid);
create function firmas_envio(p_envio uuid)
returns table (rol text, parada_id uuid, nombre text, documento text, documento_pais text, documento_validado boolean, firmado_en timestamptz, firma_storage_ruta text, extra boolean, lat double precision, lon double precision, gps_precision_m integer, gps_direccion text, sha256 text, en_papel boolean)
language sql stable security definer set search_path = public as $$
  select f.rol::text, f.parada_id, f.nombre::text, f.documento::text,
         f.documento_pais::text, f.documento_validado, f.firmado_en, f.firma_storage_ruta::text, f.extra, f.lat, f.lon, f.gps_precision_m,
         f.gps_direccion::text, f.sha256_documento::text, f.en_papel
    from firmas_cmr f
   where f.envio_id = p_envio and (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio))
   order by f.firmado_en
$$;
revoke execute on function firmas_envio(uuid) from public, anon;
grant execute on function firmas_envio(uuid) to authenticated;
comment on function public.firmas_envio(uuid) is '[CMR y PIN] Las firmas del CMR de un envío, sin IP, navegador ni email; el documento completo (como en el CMR firmado a mano: cliente, transportista y Dynamo son parte del contrato); con `extra` para distinguir las firmas añadidas a mano, `en_papel` para las que se firmaron en un CMR bis en papel y se registraron después, el GPS del dispositivo con su dirección si quien firmó dio permiso, y la huella sha256 de lo que se firmó. Quién: cliente o transportista del envío y Dynamo. Argumentos: p_envio: envios.id.';
