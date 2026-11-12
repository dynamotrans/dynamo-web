-- =====================================================================================
-- EL FIRMANTE DE LA CASILLA DEL TRANSPORTISTA PASA A SER EL CONDUCTOR DEL ENVÍO
-- (usuario, 2026-11-12): «si en los datos del envío está puesto un DNI y luego firma
-- otro DNI, el firmante se pone en su lugar, nombre y apellidos incluidos — machacan
-- los del programa, igual que las matrículas».
-- Al firmar la casilla principal del TRANSPORTISTA (las extra no):
--   · Mismo documento que el conductor anotado → no se toca nada.
--   · La ficha del conductor anotado no tenía documento y el nombre coincide → se le
--     guarda el documento (es la misma persona, ahora completa).
--   · Documento DISTINTO → quien firma es quien conduce: el envío pasa a su nombre y
--     se vincula su ficha. Un conductor es UNA persona en toda la base
--     (ux_conductores_documento es global, por normalizar_id_fiscal): si existe con ese
--     documento — aunque sea un autónomo que vino con otra empresa — se vincula ESA
--     ficha; solo si no existe se crea una con el transportista del envío. Así el CMR
--     y el DeCA enseñan al conductor real sin pasos a mano.
-- El teléfono solo cambia si la ficha vinculada trae uno (no se borra un teléfono útil).
-- Un envío cancelado no se toca. El fallo aquí nunca tumba la firma: todo corre en un
-- bloque con manejo de errores.
-- =====================================================================================
create or replace function public.fn_firmas_cmr_conductor()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_doc text; v_doc_ficha text; v_nombre_ficha text; v_cond uuid;
begin
  begin
    select conductor_id, conductor_nombre, transportista_id, estado into e from envios where id = new.envio_id;
    if e.estado = 'cancelado' then return null; end if;
    v_doc := normalizar_id_fiscal(new.documento);
    if coalesce(v_doc, '') = '' then return null; end if;
    -- Un DNI/NIE español con la letra mal NO pisa la ficha (un documento que no pasa la
    -- validación no debe ensuciar el programa); los documentos de otros países no se
    -- validan y sí pisan.
    if coalesce(new.documento_pais, 'XX') = 'ES' and not coalesce(new.documento_validado, false) then return null; end if;
    select normalizar_id_fiscal(c.documento), c.nombre
      into v_doc_ficha, v_nombre_ficha from conductores c where c.id = e.conductor_id;
    -- Mismo documento que el conductor anotado: nada que pisar.
    if v_doc_ficha = v_doc then return null; end if;
    -- La ficha anotada no tenía documento y el nombre coincide: se completa y listo.
    if e.conductor_id is not null and coalesce(v_doc_ficha, '') = ''
       and lower(trim(coalesce(v_nombre_ficha, ''))) = lower(trim(new.nombre)) then
      update conductores set documento = v_doc, documento_pais = coalesce(documento_pais, nullif(new.documento_pais, 'XX')),
                             modificado_en = now()
       where id = e.conductor_id
         -- El único global manda: si OTRA ficha activa ya lleva ese documento, no se completa.
         and not exists (select 1 from conductores c2 where c2.documento is not null and c2.activo
                          and normalizar_id_fiscal(c2.documento) = v_doc);
      if found then return null; end if;
    end if;
    -- Documento distinto: el firmante pasa a ser el conductor del envío. Su ficha se
    -- busca por documento en TODA la base (un conductor es una persona), con preferencia
    -- por la del transportista del envío.
    select c.id into v_cond from conductores c
     where c.documento is not null and c.activo and normalizar_id_fiscal(c.documento) = v_doc
     order by (c.transportista_id is not distinct from e.transportista_id) desc, c.creado_en limit 1;
    if v_cond is null and e.transportista_id is not null then
      insert into conductores (transportista_id, nombre, documento, documento_pais)
      values (e.transportista_id, trim(new.nombre), v_doc, nullif(new.documento_pais, 'XX'))
      returning id into v_cond;
    end if;
    update envios set conductor_id = v_cond, conductor_nombre = trim(new.nombre),
                      conductor_telefono = coalesce((select telefono from conductores where id = v_cond), conductor_telefono)
     where id = new.envio_id;
  exception when others then null;   -- actualizar al conductor nunca puede tumbar la firma
  end;
  return null;
end $$;
revoke execute on function public.fn_firmas_cmr_conductor() from public, anon, authenticated;
comment on function public.fn_firmas_cmr_conductor() is '[Clientes y equipo] Disparador interno: al firmar la casilla principal del transportista en el CMR, quien firma pasa a ser el conductor del envío si su documento no es el anotado — se actualizan el nombre y la ficha vinculada (la ficha con ese documento de toda la base, porque un conductor es una persona; o una nueva del transportista del envío), igual que las matrículas pisan a las del programa. Con el mismo documento no se toca nada; si la ficha anotada no tenía documento y el nombre coincide, solo se le completa. Un DNI/NIE español con la letra mal no pisa nada; un envío cancelado no se toca y un fallo aquí nunca tumba la firma. Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';

drop trigger if exists tg_firmas_cmr_conductor on firmas_cmr;
create trigger tg_firmas_cmr_conductor after insert on firmas_cmr
  for each row when (not new.extra and new.rol = 'transportista')
  execute function fn_firmas_cmr_conductor();
