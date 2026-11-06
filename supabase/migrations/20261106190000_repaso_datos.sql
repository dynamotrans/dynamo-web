-- =====================================================================================
-- Repaso de datos (2026-11-06): cinco huecos que afloraron al montar los datos de prueba
-- a volumen. Ninguno cambia lo que ve el usuario; todos cierran una puerta.
--
-- 1. CIF con prefijo «ES»: «ESB01596360» y «B01596360» son la misma empresa, pero la
--    normalización no quitaba el «ES» y la regla «un CIF solo una vez» no los pillaba.
--    Ahora, si lo que queda tras el «ES» tiene forma de NIF/CIF/NIE español, el prefijo
--    se quita (los demás países se quedan como están: «LT290610717», «FR07107002800»).
-- 2. Al migrar del Sheet (dynamo.migracion = on), los hitos «creado», «confirmado»,
--    que salen solos del disparador del envío llevaban la hora de la migración, no la
--    real de la fila. Ahora cogen la del envío (creado_en, confirmado_en) cuando la fila
--    la trae; los demás hitos los inserta la migración con su hora.
-- 3. El tope de 4 puntos en la ruta solo lo ponían las funciones (crear_envio,
--    cambiar_ruta_envio…); la tabla envio_paradas lo admitía todo. Ahora lo impone la
--    tabla.
-- 4. Una incidencia que Dynamo abre sobre un transportista (con transportista_id y
--    envío) recibía también el cliente del envío, y las reglas de acceso del
--    transportista exigen «sin cliente»: el transportista no la veía. El cliente del
--    envío solo se rellena cuando la incidencia no es de un transportista.
-- 5. El índice GIN sobre auditoria.cambios no lo usa ninguna consulta (el historial lee
--    `cambios -> campo`, que ese índice no acelera) y con volumen pesa más que la tabla
--    (191 MB con 64.000 envíos de prueba). Fuera.
-- =====================================================================================

-- ---- 1. CIF: el «ES» delante de un identificador español no cuenta --------------------
create or replace function public.normalizar_id_fiscal(p text)
returns text language sql immutable strict as $$
  select regexp_replace(upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g')),
                        '^ES(?=([A-Z][0-9]{7}[A-Z0-9]|[0-9]{8}[A-Z])$)', '')
$$;
comment on function public.normalizar_id_fiscal(text) is '[Ayudantes internos] Normaliza un CIF/NIF/VAT para comparar: quita guiones, puntos, espacios y signos, lo pasa a mayúsculas y, si delante de un NIF/CIF/NIE español va el prefijo de IVA «ES», lo quita («ES B-01.596.360» → «B01596360»; los de otros países se quedan igual). Base de la unicidad de CIF. Quién: cualquiera. Argumentos: p: identificador fiscal.';
comment on function public.fn_normalizar_cif() is '[Disparadores] Guarda el CIF/NIF en mayúsculas, sin espacios, puntos ni guiones y sin el prefijo «ES» de los identificadores españoles («ES B-12.345.678» → «B12345678»). Quién: disparador de clientes, transportistas y operadores.';
-- Los guardados con «ES» delante se igualan (el disparador fn_normalizar_cif los reescribe)
-- y los índices únicos, que usan la función, se recalculan.
update clientes       set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
update transportistas set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
update operadores     set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
reindex index ux_clientes_cif;
reindex index ux_transportistas_cif;

-- ---- 2. Hitos al migrar: la hora real de la fila, no la de la migración ----------------
create or replace function fn_hitos_sellar()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    -- «creado» y «confirmado» los dispara el propio envío sin hora (la columna pone
    -- now()): al migrar se toma la fecha real de la fila. El resto los inserta la
    -- migración con su hora.
    if new.hito in ('creado', 'confirmado') then
      select coalesce(case new.hito when 'creado' then e.creado_en else e.confirmado_en end, new.cuando)
        into new.cuando from envios e where e.id = new.envio_id;
    end if;
    new.cuando := coalesce(new.cuando, now());
    new.quien_origen := 'migracion-sheet';
  elsif coalesce(current_setting('dynamo.seguimiento', true), '') in ('auto', 'mano') then
    -- Seguimiento: la hora de la etapa (nunca futura). Automático: sin persona.
    new.cuando := least(coalesce(nullif(current_setting('dynamo.hora_etapa', true), '')::timestamptz, now()), now());
    if current_setting('dynamo.seguimiento', true) = 'auto' then new.quien_origen := 'sistema'; end if;
  else
    new.cuando := now();
  end if;
  new.quien := coalesce(auth.uid(), new.quien);
  return new;
end $$;
comment on function public.fn_hitos_sellar() is '[Disparadores] Sella cada hito: la hora la pone el servidor (al migrar del Sheet, la real de la fila; en el seguimiento, la de la etapa, nunca futura) y quién lo hizo. Quién: disparador de envio_hitos.';

-- ---- 3. Tope de 4 puntos en la ruta, en la propia tabla --------------------------------
create or replace function fn_paradas_tope()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from envio_paradas p where p.envio_id = new.envio_id) > 4 then
    raise exception 'Como maximo 4 puntos en la ruta (2 paradas ademas del origen y el destino).' using errcode = '23514';
  end if;
  return null;
end $$;
comment on function public.fn_paradas_tope() is '[Disparadores] Un envío no puede tener más de 4 puntos en la ruta (origen, destino y hasta 2 paradas): lo impone la tabla, no solo crear_envio y cambiar_ruta_envio. Quién: disparador de envio_paradas.';
revoke execute on function fn_paradas_tope() from public, anon, authenticated;
drop trigger if exists tg_paradas_tope on envio_paradas;
create trigger tg_paradas_tope after insert or update of envio_id on envio_paradas
  for each row execute function fn_paradas_tope();

-- ---- 4. Incidencias de transportista: sin cliente, para que él las vea ------------------
create or replace function fn_incidencias_completar()
returns trigger language plpgsql set search_path = public as $$
declare v_transp uuid := transportista_del_usuario();
begin
  if v_transp is not null and not es_equipo_dynamo() then
    -- La abre un transportista: es suya y no lleva cliente.
    if tg_op = 'INSERT' then new.transportista_id := v_transp; new.cliente_id := null; end if;
  else
    -- Dynamo o un cliente. Si es sobre un transportista, no lleva cliente (sus reglas de
    -- acceso exigen cliente_id nulo); si no, el cliente del envío o el del usuario.
    if new.transportista_id is not null then
      new.cliente_id := null;
    elsif new.cliente_id is null and new.envio_id is not null then
      select cliente_id into new.cliente_id from envios where id = new.envio_id;
    end if;
    if new.cliente_id is null and new.transportista_id is null then new.cliente_id := cliente_del_usuario(); end if;
  end if;
  if new.estado = 'resuelto' and (tg_op = 'INSERT' or old.estado <> 'resuelto') then
    new.resuelto_en := now();
  elsif new.estado <> 'resuelto' then
    new.resuelto_en := null;
  end if;
  return new;
end $$;
comment on function public.fn_incidencias_completar() is '[Disparadores] Completa una incidencia: la de un transportista es suya y sin cliente (también si la abre Dynamo sobre él); si no, el cliente del envío o el del usuario; y la hora de resolución. Quién: disparador de incidencias.';

-- ---- 5. Índice sin uso ---------------------------------------------------------------
drop index if exists idx_auditoria_cambios;
