-- =====================================================================================
-- Usuarios por páginas desde la base de datos (2026-11-07, preparado para volumen).
--
-- Antes: la pantalla traía todos los usuarios + todos los clientes + todos los
-- transportistas (para los desplegables de empresa) al navegador: ~700 KB. Ahora
-- usuarios_pagina(texto, rol, estado, página, por_página) devuelve solo la página ya
-- buscada y filtrada, con el nombre de su empresa y el total; usuarios_conteos() da los
-- contadores de los filtros de estado; y el selector de empresa de la ficha pasa a ser un
-- buscador (buscar_clientes / buscar_transportistas), así ya no hacen falta las listas
-- enteras.
-- =====================================================================================

-- La «empresa» de un usuario para mostrar: Dynamo si es del equipo, si no el nombre de su
-- cliente o transportista. El texto de búsqueda junta email, nombre, DNI, teléfono, cargo y
-- empresa, sin acentos, igual que buscaba el navegador.
create or replace function public.usuarios_pagina(
  p_q text default null, p_rol text default null, p_estado text default null,
  p_pagina int default 1, p_por_pagina int default 50)
returns table(id uuid, empresa text, total bigint)
language sql stable security definer set search_path = public, auth as $$
  with base as (
    select u.id, u.email, u.rol, u.estado, u.suspension_motivo,
           (au.email_confirmed_at is not null) as email_confirmado,
           case when u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then 'Dynamo'
                else coalesce(c.nombre_visible, t.nombre_visible) end as empresa
      from usuarios u
      left join auth.users au on au.id = u.id
      left join clientes c on c.id = u.cliente_id
      left join transportistas t on t.id = u.transportista_id
     where ve_todo()
  ),
  filt as (
    select b.*,
           unaccent_simple(coalesce(b.email, '') || ' ' || coalesce(b.empresa, '')) as busca_fija
      from base b
     where (p_rol is null or b.rol::text = p_rol)
       and (p_estado is null or case p_estado
              when 'suspendida_auto' then b.estado = 'suspendida' and coalesce(b.suspension_motivo, '') like 'Automática%'
              when 'invitacion'      then not b.email_confirmado
              else b.estado::text = p_estado end)
  ),
  conq as (
    -- El texto busca también en nombre, DNI, teléfono y cargo (columnas de usuarios).
    select f.id, f.empresa,
           unaccent_simple(f.busca_fija || ' ' || coalesce(u.nombre, '') || ' ' || coalesce(u.documento, '') || ' ' ||
                           coalesce(u.telefono, '') || ' ' || coalesce(u.cargo, '')) as busca, f.email
      from filt f join usuarios u on u.id = f.id
  ),
  encontrados as (
    select * from conq where p_q is null or busca ilike '%' || unaccent_simple(p_q) || '%'
  ),
  cont as (select count(*) as t from encontrados)
  select e.id, e.empresa, cont.t
    from encontrados e, cont
   order by e.email
   limit greatest(1, least(p_por_pagina, 200)) offset greatest(0, (p_pagina - 1) * p_por_pagina);
$$;
revoke all on function public.usuarios_pagina(text, text, text, int, int) from public, anon;
grant execute on function public.usuarios_pagina(text, text, text, int, int) to authenticated;
comment on function public.usuarios_pagina(text, text, text, int, int) is '[Clientes y cuentas] Una página de Usuarios: busca por email, nombre, DNI, teléfono, cargo o empresa, filtra por rol y por estado (activa, pendiente_verificacion, suspendida, suspendida_auto, invitacion), ordena por email y pagina, con el nombre de la empresa de cada uno y el total. A quien no es de Dynamo no le devuelve nada. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_rol: rol o null · p_estado: estado o null · p_pagina, p_por_pagina.';

create or replace function public.usuarios_conteos()
returns table(total int, activa int, pendiente int, suspendida int, suspendida_auto int, invitacion int)
language sql stable security definer set search_path = public, auth as $$
  select count(*)::int,
         count(*) filter (where u.estado = 'activa')::int,
         count(*) filter (where u.estado = 'pendiente_verificacion')::int,
         count(*) filter (where u.estado = 'suspendida')::int,
         count(*) filter (where u.estado = 'suspendida' and coalesce(u.suspension_motivo, '') like 'Automática%')::int,
         count(*) filter (where au.email_confirmed_at is null)::int
    from usuarios u left join auth.users au on au.id = u.id where ve_todo()
$$;
revoke all on function public.usuarios_conteos() from public, anon;
grant execute on function public.usuarios_conteos() to authenticated;
comment on function public.usuarios_conteos() is '[Clientes y cuentas] Contadores de los filtros de la pantalla Usuarios sobre todos los usuarios: total, activos, pendientes de verificación, suspendidos, suspendidos automáticamente e invitaciones sin aceptar. A quien no es de Dynamo le da ceros. Quién: Dynamo (también solo lectura). Argumentos: sin argumentos.';
