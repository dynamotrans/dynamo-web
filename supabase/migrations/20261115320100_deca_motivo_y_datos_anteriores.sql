-- DeCA: MOTIVO DE CADA CAMBIO Y DATOS ANTERIORES «NO VÁLIDOS» (usuario, 2026-11-15).
-- Resolución de 5 de junio de 2026 (BOE-A-2026-12784), apartado quinto.1: «Se añadirán
-- los nuevos datos en el PDF existente, así como el motivo del cambio, y se conservarán
-- los datos antiguos indicando claramente que ya no son válidos.» El panel de
-- modificaciones pasa a dar, en cada cambio: el dato nuevo, el ANTERIOR (que el PDF marca
-- «NO VÁLIDO») y el MOTIVO.
--   · Solo cuenta lo posterior a la EMISIÓN (el enlace vivo del DeCA): lo cambiado antes
--     ya forma parte del documento original y no es una modificación (antes salían en el
--     panel con fechas anteriores a la emisión, incoherente ante una inspección).
--   · El motivo lo escribe quien hace el cambio (pantallas de Dynamo) y queda en la tabla
--     nueva deca_motivos — envio_hitos es inmutable y no se toca —. El panel lo empareja
--     con el último cambio de ese envío anterior al motivo (hasta 2 min antes). Sin motivo escrito, el
--     PDF pone uno genérico según el tipo de cambio (en el idioma del documento).
--   · Se devuelve también 'en' (fecha y hora ISO) para los metadatos del PDF (apartado
--     segundo.1: la fecha y hora de modificación es un metadato del fichero).

-- ---- 1. Los motivos (solo se añaden; trazabilidad) ------------------------------------
create table deca_motivos (
  id         uuid primary key default gen_random_uuid(),
  envio_id   uuid not null references envios (id) on delete cascade,
  motivo     text not null check (length(trim(motivo)) between 3 and 300),
  creado_por uuid references usuarios (id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index deca_motivos_envio_idx on deca_motivos (envio_id, creado_en);
comment on table deca_motivos is 'Motivo de cada modificación del documento de control (DeCA) tras su emisión, escrito por quien hace el cambio (Resolución de 5-jun-2026, apdo. quinto.1). Solo se añaden (ni update ni delete): el panel del PDF lo empareja con el último cambio anterior a él (hasta 2 min).';
comment on column deca_motivos.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del motivo.';
comment on column deca_motivos.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | obligatorio | Envío cuyo DeCA se modifica.';
comment on column deca_motivos.motivo is 'formato: texto | rango: 3 a 300 caracteres | lista: no aplica | obligatorio | Causa del cambio tal como la escribe Dynamo. Ej. OK: Avería de la tractora';
comment on column deca_motivos.creado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Usuario que escribió el motivo (vacío si se borró el usuario).';
comment on column deca_motivos.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Fecha y hora en que se anotó el motivo.';
create trigger tg_mantenimiento before insert or update or delete on deca_motivos
  for each row execute function fn_bloqueo_mantenimiento();
alter table deca_motivos enable row level security;
create policy deca_motivos_ver on deca_motivos for select using (ve_todo());
-- Sin políticas de escritura: solo entra por anotar_motivo_deca.

-- ---- 2. Anotar el motivo (lo llama la pantalla justo después del cambio) --------------
create or replace function anotar_motivo_deca(p_envio uuid, p_motivo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v text := left(trim(coalesce(p_motivo, '')), 300);
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo anota el motivo de un cambio.' using errcode = '42501'; end if;
  if length(v) < 3 then return false; end if;
  if not exists (select 1 from envios where id = p_envio) then return false; end if;
  insert into deca_motivos (envio_id, motivo, creado_por) values (p_envio, v, auth.uid());
  return true;
end $$;
revoke execute on function anotar_motivo_deca(uuid, text) from public, anon;
grant execute on function anotar_motivo_deca(uuid, text) to authenticated;
comment on function public.anotar_motivo_deca(uuid, text) is '[Envíos] Anota el motivo de una modificación del documento de control (DeCA) recién hecha en un envío: el panel de modificaciones del PDF lo pone junto al último cambio anterior a él (hasta 2 min antes). Vacío o de menos de 3 caracteres no anota nada (el PDF pone un motivo genérico). Devuelve true si lo anotó. Quién: equipo Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_motivo: texto libre (máx. 300).';

-- ---- 3. Textos de apoyo del panel ----------------------------------------------------
create or replace function deca_ruta_texto(p jsonb)
returns text language sql immutable set search_path = public as $$
  select string_agg(nullif(trim(coalesce(x ->> 'codigo_postal', '') || ' ' || coalesce(x ->> 'poblacion', '')), ''), ' → ')
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
$$;
comment on function public.deca_ruta_texto(jsonb) is '[Envíos] Una ruta del historial (lista JSON de paradas con codigo_postal y poblacion) en una línea «CP población → CP población» para el panel del DeCA. Quién: fn_modificaciones_deca. Argumentos: p: jsonb [{codigo_postal, poblacion}].';

create or replace function deca_fechas_texto(p_desde text, p_hasta text)
returns text language sql immutable set search_path = public as $$
  select nullif(concat_ws(' – ', to_char(nullif(p_desde, '')::date, 'DD/MM/YYYY'),
                case when nullif(p_hasta, '') is distinct from nullif(p_desde, '') then to_char(nullif(p_hasta, '')::date, 'DD/MM/YYYY') end), '')
$$;
comment on function public.deca_fechas_texto(text, text) is '[Envíos] Un día o una ventana de carga del historial como texto «dd/mm/aaaa» o «dd/mm/aaaa – dd/mm/aaaa» para el panel del DeCA. Quién: fn_modificaciones_deca. Argumentos: p_desde, p_hasta: fechas ISO (texto, pueden venir vacías).';

-- ---- 4. El panel: dato nuevo, dato anterior y motivo, solo tras la emisión -------------
create or replace function fn_modificaciones_deca(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with emision as (
    select max(c.creado_en) as en from cmr_enlaces c where c.envio_id = p_envio and not c.revocado
  ), h as (
    select id, hito, cuando, datos,
           row_number() over (partition by hito order by cuando) as n,
           lag(datos) over (partition by hito order by cuando) as previo
      from envio_hitos
     where envio_id = p_envio
       and hito in ('ruta_cambiada', 'fecha_carga_movida', 'fecha_carga_cambiada', 'mercancia_cambiada',
                    'transportista_quitado', 'transportista_asignado', 'matricula_asignada')
  ), sel as (
    select h.* from h cross join emision
     where case when emision.en is not null then h.cuando > emision.en
                else h.hito in ('ruta_cambiada', 'fecha_carga_movida', 'fecha_carga_cambiada', 'mercancia_cambiada', 'transportista_quitado') or h.n > 1 end
       -- Un relevo de transportista es UN cambio: la retirada que va con su nueva asignación
       -- (misma transacción) no sale aparte; el anterior figura como dato no válido.
       and not (h.hito = 'transportista_quitado'
                and exists (select 1 from h h2 where h2.hito = 'transportista_asignado' and h2.cuando = h.cuando))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuando', to_char(s.cuando at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
           'en', s.cuando,
           'hito', s.hito,
           -- Primera asignación sin dato previo: rellena lo que faltaba al emitir.
           'primera', s.n = 1 and s.hito in ('transportista_asignado', 'matricula_asignada'),
           'detalle', case s.hito
             when 'ruta_cambiada' then deca_ruta_texto(s.datos -> 'despues')
             when 'fecha_carga_movida' then deca_fechas_texto(s.datos ->> 'desde', s.datos ->> 'hasta')
             when 'fecha_carga_cambiada' then deca_fechas_texto(s.datos ->> 'desde', s.datos ->> 'hasta')
             when 'mercancia_cambiada' then s.datos ->> 'despues'
             when 'matricula_asignada' then nullif(concat_ws(' + ', coalesce(s.datos ->> 'camion', s.datos ->> 'tractora'), s.datos ->> 'remolque'), '')
             when 'transportista_asignado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                  where t.id = (nullif(s.datos ->> 'transportista_id', ''))::uuid)
             else null end,
           'antes', case s.hito
             when 'ruta_cambiada' then deca_ruta_texto(s.datos -> 'antes')
             when 'fecha_carga_movida' then deca_fechas_texto(s.datos ->> 'antes_desde', s.datos ->> 'antes_hasta')
             when 'fecha_carga_cambiada' then deca_fechas_texto(s.datos ->> 'antes_desde', s.datos ->> 'antes_hasta')
             when 'mercancia_cambiada' then s.datos ->> 'antes'
             when 'matricula_asignada' then nullif(concat_ws(' + ', coalesce(s.previo ->> 'camion', s.previo ->> 'tractora'), s.previo ->> 'remolque'), '')
             when 'transportista_asignado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                  where t.id = (nullif(s.previo ->> 'transportista_id', ''))::uuid)
             when 'transportista_quitado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                 where t.id = (nullif(s.datos ->> 'transportista_id', ''))::uuid)
             end,
           -- El motivo escrito por Dynamo (justo después del cambio, hasta 2 min) o el que traiga el propio
           -- registro (p. ej. «Pago recibido cuando ya no daba tiempo»); si no, el PDF pone uno genérico.
           'motivo', coalesce(
             (select m.motivo from deca_motivos m
               where m.envio_id = p_envio and m.creado_en between s.cuando and s.cuando + interval '2 minutes'
                 -- del ÚLTIMO cambio anterior al motivo: si entre medias hubo otro, es de ese otro
                 and not exists (select 1 from h h3 where h3.cuando > s.cuando and h3.cuando <= m.creado_en)
               order by m.creado_en limit 1),
             nullif(s.datos ->> 'motivo', ''))
         ) order by s.cuando), '[]'::jsonb)
    from sel s
$$;
revoke execute on function fn_modificaciones_deca(uuid) from public, anon, authenticated;
comment on function public.fn_modificaciones_deca(uuid) is '[Envíos] Las modificaciones del documento de control (DeCA) de un envío, para el panel del PDF (Resolución 5-jun-2026, apdo. quinto.1: datos nuevos, motivo y datos antiguos marcados como no válidos). Cambios de ruta, fecha de carga (al pagar tarde o desde «Modificar»), mercancía, transportista y matrículas. Solo los posteriores a la emisión (enlace vivo del DeCA); sin emisión, como antes (ruta, fecha, retirada y desde la 2.ª asignación). Por cambio: cuando (dd/mm/aaaa hh:mm España), en (fecha y hora ISO, para los metadatos del PDF), hito, primera (1.ª asignación de transportista o matrículas), detalle (dato nuevo), antes (dato anterior, ya no válido) y motivo (de deca_motivos o del propio registro; vacío = el PDF pone uno genérico). Sin datos económicos. Quién: funciones internas (orden_carga_json, datos_cmr_por_token) y el envoltorio modificaciones_deca. Argumentos: p_envio: envios.id.';

-- ---- 5. Fecha de carga y mercancía cambiadas desde «Modificar», tras la emisión --------
-- Solo con el DeCA ya emitido (enlace vivo): antes, el cambio forma parte del original y
-- no ensucia la línea de tiempo. El movimiento automático al pagar tarde ya apunta su
-- propio 'fecha_carga_movida' (con su motivo): no se duplica.
create or replace function deca_mercancia_texto(p_descripcion text, p_toneladas numeric, p_metros numeric)
returns text language sql immutable set search_path = public as $$
  select nullif(concat_ws(' · ', nullif(trim(coalesce(p_descripcion, '')), ''),
                case when p_toneladas is not null then replace(trim_scale(p_toneladas)::text, '.', ',') || ' Tn' end,
                case when p_metros is not null then replace(trim_scale(p_metros)::text, '.', ',') || ' m' end), '')
$$;
comment on function public.deca_mercancia_texto(text, numeric, numeric) is '[Envíos] La mercancía de un envío en una línea «descripción · toneladas Tn · metros m» para el historial y el panel del DeCA. Quién: fn_envios_hitos_deca. Argumentos: p_descripcion: descripcion_mercancia · p_toneladas: toneladas · p_metros: metros_lineales.';

create or replace function fn_envios_hitos_deca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cmr_enlaces c where c.envio_id = new.id and not c.revocado) then return null; end if;
  if (new.fecha_carga_desde, new.fecha_carga_hasta) is distinct from (old.fecha_carga_desde, old.fecha_carga_hasta)
     and not exists (select 1 from envio_hitos h where h.envio_id = new.id and h.hito = 'fecha_carga_movida' and h.cuando = now()) then
    perform registrar_hito(new.id, 'fecha_carga_cambiada', null, null,
      jsonb_build_object('antes_desde', old.fecha_carga_desde, 'antes_hasta', old.fecha_carga_hasta,
                         'desde', new.fecha_carga_desde, 'hasta', new.fecha_carga_hasta),
      case when es_servidor() then 'servidor' else 'app' end);
  end if;
  if (new.descripcion_mercancia, new.toneladas, new.metros_lineales) is distinct from (old.descripcion_mercancia, old.toneladas, old.metros_lineales) then
    perform registrar_hito(new.id, 'mercancia_cambiada', null, null,
      jsonb_build_object('antes', deca_mercancia_texto(old.descripcion_mercancia, old.toneladas, old.metros_lineales),
                         'despues', deca_mercancia_texto(new.descripcion_mercancia, new.toneladas, new.metros_lineales)),
      case when es_servidor() then 'servidor' else 'app' end);
  end if;
  return null;
end $$;
revoke execute on function fn_envios_hitos_deca() from public, anon, authenticated;
comment on function public.fn_envios_hitos_deca() is '[Envíos] Disparador de envios: con el DeCA ya emitido (enlace vivo), apunta en el historial los cambios de fecha de carga (fecha_carga_cambiada, salvo el movimiento automático al pagar tarde, que ya tiene el suyo) y de mercancía (mercancia_cambiada: descripción, toneladas y metros, antes y después), para el panel de modificaciones del PDF. Quién: el disparador tg_envios_hitos_deca. Argumentos: ninguno (disparador).';
drop trigger if exists tg_envios_hitos_deca on envios;
create trigger tg_envios_hitos_deca after update of fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales on envios
  for each row execute function fn_envios_hitos_deca();
