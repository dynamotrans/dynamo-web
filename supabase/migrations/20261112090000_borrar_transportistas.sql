-- =====================================================================================
-- BORRAR TRANSPORTISTAS (borrado lógico) — usuario, 2026-11-12: «no me sale botón»
-- =====================================================================================
-- La ficha del transportista solo tenía el estado (activo / no ofertar / suspendido) y
-- no había forma de quitarlo de en medio. Como sus envíos, ofertas, conductores y
-- documentos cuelgan de él (datos legales que hay que conservar), el borrado es
-- LÓGICO, como el de los sitios: la fila se marca `borrado` y desaparece de la lista,
-- del buscador de asignación y de cualquier oferta futura; lo ya hecho conserva todos
-- sus datos. No se puede borrar con envíos EN MARCHA asignados a él.

alter table transportistas
  add column borrado boolean not null default false,
  add column borrado_en timestamptz,
  -- Y de paso (usuario, 2026-11-12): si hace repartos a zona urbana con camión pequeño.
  add column reparto_urbano boolean not null default false;
comment on column transportistas.borrado is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | true = borrado lógico: fuera de la lista, del buscador y de las ofertas; sus envíos pasados conservan los datos. Lo marca borrar_transportista().';
comment on column transportistas.reparto_urbano is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Hace repartos a zona urbana con camión pequeño. Lo marca Dynamo en su ficha, junto a «Tiene almacén logístico».';
comment on column transportistas.borrado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Cuándo se borró (instante). Vacío = no borrado.';

-- ---- Borrar (solo el equipo gestor de Dynamo) ----------------------------------------
create or replace function borrar_transportista(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_vivos int;
begin
  if not (es_admin_master() or es_servidor()) then
    raise exception 'Solo el Admin Master borra transportistas.' using errcode = '42501';
  end if;
  if not exists (select 1 from transportistas where id = p_id) then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  select count(*) into v_vivos from envios e
   where e.transportista_id = p_id and e.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta');
  if v_vivos > 0 then
    return jsonb_build_object('resultado', 'con_envios_vivos', 'envios', v_vivos);
  end if;
  update transportistas
     set borrado = true, borrado_en = now(), estado_operativo = 'suspendido'
   where id = p_id and not borrado;
  if not found then return jsonb_build_object('resultado', 'ya_borrado'); end if;
  -- Sus ofertas aún vivas se caducan ya: que no acepte una carga un transportista borrado.
  update envio_ofertas set caduca_en = now()
   where transportista_id = p_id and estado = 'activa' and caduca_en > now();
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function borrar_transportista(uuid) from public, anon;
grant execute on function borrar_transportista(uuid) to authenticated, service_role;
comment on function public.borrar_transportista(uuid) is '[Transportistas] Borrado lógico de un transportista: se marca borrado (y suspendido), desaparece de la lista, del buscador de asignación y de las ofertas, y sus ofertas vivas se caducan al momento; los envíos y documentos ya hechos conservan todos sus datos. Con envíos en marcha asignados a él devuelve con_envios_vivos y no borra. Quién: solo el Admin Master. Argumentos: p_id: transportistas.id.';

-- ---- La lista y el buscador dejan de enseñarlos --------------------------------------
create or replace function transportistas_pagina(p_q text default null, p_estado text default null, p_adr text default null,
  p_pagina integer default 1, p_por_pagina integer default 20)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q);
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  if not ve_todo() then return; end if;
  return query
  select t.id, count(*) over ()
    from transportistas t
   where not t.borrado
     and (cardinality(v_pal) = 0 or (t.texto_busqueda like v_pal[1] and t.texto_busqueda like all (v_pal)))
     and (p_estado is null or p_estado = '' or t.estado_operativo::text = p_estado)
     and (p_adr is null or p_adr = ''
          or (p_adr = 'si') = exists (select 1 from vehiculos v where v.transportista_id = t.id and v.activo and v.adr))
   order by t.nombre_visible, t.id
   offset v_off limit v_por;
end $$;
comment on function public.transportistas_pagina(text, text, text, integer, integer) is '[Transportistas] Lista por páginas: ids de la página y total, buscando en nombre, CIF, código de bolsa, población, NIMA, contactos y matrículas (todas las palabras, sin tildes), con filtros de estado y ADR; los borrados no salen. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_estado: activo | no_ofertar | suspendido · p_adr: si | no · p_pagina, p_por_pagina (máx. 200).';

create or replace function buscar_transportistas(p_q text, p_limite integer default 12, p_incluir uuid default null)
returns table (id uuid, nombre text, cif text, estado text, nima text, telefono text, email text)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q); v_lim int := least(greatest(coalesce(p_limite, 12), 1), 50);
  v_txt text := lower(unaccent_simple(trim(coalesce(p_q, ''))));
begin
  if not ve_todo() then return; end if;
  return query
  with elegidos as (
    select t.id, t.nombre_visible, t.cif, t.estado_operativo, t.nima,
           (t.id = p_incluir) as inc,
           (v_txt <> '' and lower(unaccent_simple(t.nombre_visible)) like v_txt || '%') as empieza,
           (v_txt <> '' and lower(unaccent_simple(t.nombre_visible)) like '%' || v_txt || '%') as contiene
      from transportistas t
     where (not t.borrado or t.id = p_incluir)   -- el ya asignado se sigue viendo
       and (t.id = p_incluir or cardinality(v_pal) = 0 or (t.texto_busqueda like v_pal[1] and t.texto_busqueda like all (v_pal)))
     order by 6 desc, 7 desc, 8 desc, (t.estado_operativo = 'activo') desc, t.nombre_visible
     limit v_lim)
  select e.id, e.nombre_visible, e.cif, e.estado_operativo::text, e.nima, c.telefono, c.email
    from elegidos e
    left join lateral (select x.telefono, x.email from contactos x where x.transportista_id = e.id and x.funcion = 'trafico' and x.es_principal limit 1) c on true
   order by e.inc desc, e.empieza desc, e.contiene desc, (e.estado_operativo = 'activo') desc, e.nombre_visible;
end $$;
comment on function public.buscar_transportistas(text, integer, uuid) is '[Transportistas] Buscador para elegir un transportista (asignar u ofertar un envío): hasta 50 que casen con el texto (nombre, CIF, bolsa, población, matrículas…), los activos primero y sin los borrados; p_incluir sale siempre (el ya asignado). Quién: Dynamo. Argumentos: p_q: texto · p_limite (máx. 50) · p_incluir: transportistas.id.';

-- Y ofertar a un borrado se corta de raíz, venga de donde venga la llamada.
create or replace function fn_envio_ofertas_sin_borrados()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.transportista_id is not null
     and exists (select 1 from transportistas t where t.id = new.transportista_id and t.borrado) then
    raise exception 'Ese transportista está borrado: no se le puede ofertar.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envio_ofertas_sin_borrados() from public, anon, authenticated;
comment on function public.fn_envio_ofertas_sin_borrados() is '[Transportistas] Disparador interno: una oferta nueva a un transportista borrado se rechaza, venga de la pantalla, de la API o de una tarea. Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
drop trigger if exists tg_envio_ofertas_sin_borrados on envio_ofertas;
create trigger tg_envio_ofertas_sin_borrados before insert on envio_ofertas
  for each row execute function fn_envio_ofertas_sin_borrados();
