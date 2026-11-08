-- =====================================================================================
-- NIMA POR DEFECTO EN LA FICHA DEL CLIENTE (usuario, 2026-11-09)
-- =====================================================================================
-- Clientes de residuos: Dynamo marca en su ficha «NIMA por defecto» y, al crear envíos
-- de ese cliente (él mismo o Dynamo en su vista), el conmutador «Requiere NIMA» nace
-- ACTIVADO (se puede apagar en el propio envío). Solo lo edita Dynamo, como el resto de
-- preferencias por defecto (discreción comercial, plataforma, camión…).
--   · Columna clientes.nima_por_defecto (false por defecto).
--   · mi_empresa() la devuelve (el cliente no lee la tabla clientes directamente).
--   · buscar_clientes() la devuelve (para que el combo de cliente de Nuevo envío
--     active el NIMA al elegir al cliente).
-- =====================================================================================

alter table public.clientes add column nima_por_defecto boolean not null default false;
comment on column public.clientes.nima_por_defecto is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | NIMA por defecto (residuos), solo lo edita Dynamo: al crear envíos de este cliente, el conmutador «Requiere NIMA» nace activado; se puede apagar en cada envío.';

-- ---- mi_empresa(): la ficha del propio cliente gana la preferencia ------------------------
drop function public.mi_empresa();
create function public.mi_empresa()
 returns table(id uuid, codigo text, razon_social text, nombre_comercial text, cif text, direccion text, poblacion text, codigo_postal text, provincia text, pais_codigo_iso character, plazo_pago_dias integer, discrecion_comercial boolean, tipo_camion_defecto tipo_camion, forma_carga_defecto forma_carga, requiere_plataforma_elevadora_defecto boolean, estado estado_cuenta, iva_pct numeric, nima_por_defecto boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.id, c.codigo, c.razon_social, c.nombre_comercial, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.requiere_plataforma_elevadora_defecto, c.estado, c.iva_pct,
         c.nima_por_defecto
    from clientes c where c.id = cliente_del_usuario()
$function$;
revoke all on function public.mi_empresa() from public, anon, authenticated, service_role;
grant execute on function public.mi_empresa() to authenticated;
grant execute on function public.mi_empresa() to service_role;
comment on function public.mi_empresa() is '[Clientes y cuentas] Ficha de la empresa del cliente que llama: código, razón social, nombre comercial, CIF, dirección, plazo de pago, preferencias por defecto (camión, forma de carga, plataforma, discreción comercial, NIMA), estado de la cuenta y su % de IVA. Quién: cliente. Argumentos: sin argumentos.';

-- ---- buscar_clientes(): el combo de Nuevo envío necesita la preferencia -------------------
drop function public.buscar_clientes(text, integer, uuid);
create function public.buscar_clientes(p_q text, p_limite integer default 12, p_incluir uuid default null)
returns table (id uuid, nombre text, cif text, principal_id uuid, iva_pct numeric, estado text, nima_por_defecto boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q); v_lim int := least(greatest(coalesce(p_limite, 12), 1), 50);
  v_txt text := lower(unaccent_simple(trim(coalesce(p_q, ''))));
begin
  if not ve_todo() then return; end if;
  -- Mismo orden que buscar_transportistas: incluido, empieza por lo escrito, lo contiene, activos, nombre.
  return query
  select k.id, k.nombre_visible, k.cif, k.sitio_principal_id, k.iva_pct, k.estado::text, k.nima_por_defecto
    from clientes k
   where k.id = p_incluir or cardinality(v_pal) = 0 or (k.texto_busqueda like v_pal[1] and k.texto_busqueda like all (v_pal))
   order by (k.id = p_incluir) desc,
            (v_txt <> '' and lower(unaccent_simple(k.nombre_visible)) like v_txt || '%') desc,
            (v_txt <> '' and lower(unaccent_simple(k.nombre_visible)) like '%' || v_txt || '%') desc,
            (k.estado = 'activa') desc, k.nombre_visible
   limit v_lim;
end $$;
revoke all on function public.buscar_clientes(text, integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.buscar_clientes(text, integer, uuid) to authenticated;
grant execute on function public.buscar_clientes(text, integer, uuid) to service_role;
comment on function public.buscar_clientes(text, integer, uuid) is '[Clientes y cuentas] Buscador de clientes para los desplegables de Dynamo: los que mejor casan con lo escrito (nombre, CIF…), más el ya elegido (p_incluir). Devuelve nombre visible, CIF, almacén principal, % de IVA, estado y la preferencia NIMA por defecto. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_limite: máximo (1-50, 12 por defecto) · p_incluir: clientes.id a incluir siempre.';
