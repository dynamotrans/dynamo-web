-- =====================================================================================
-- CONTEOS DE ENVÍOS EN LA BASE DE DATOS (2026-11-05)
-- La API de Supabase devuelve como mucho 1.000 filas por consulta (Settings → API → Max
-- rows). Varias pantallas contaban envíos descargándolos todos (hasta 200.000 filas): con
-- más de 1.000 envíos, los números habrían salido mal. Ahora los cuenta la base de datos.
-- Con los permisos de quien llama (cada uno cuenta lo que puede ver).
-- =====================================================================================

create or replace function envios_por_empresa(p_campo text)
returns table (id uuid, envios bigint)
language sql stable security invoker set search_path = public as $$
  select case p_campo when 'cliente' then e.cliente_id when 'transportista' then e.transportista_id else e.operador_id end, count(*)
    from envios e
   where case p_campo
           when 'cliente'       then not e.es_manual and e.estado not in ('borrador', 'cancelado')
           when 'transportista' then e.transportista_id is not null and e.estado not in ('borrador', 'cancelado')
           when 'operador'      then e.es_manual and e.operador_id is not null
           else false end
   group by 1
$$;
revoke execute on function envios_por_empresa(text) from public, anon;
grant execute on function envios_por_empresa(text) to authenticated;

create or replace function uso_envios_usuarios()
returns table (usuario_id uuid, envios bigint, cancelados bigint, cancelados_ult10 bigint)
language sql stable security invoker set search_path = public as $$
  select creado_por, count(*), count(*) filter (where estado = 'cancelado'), count(*) filter (where estado = 'cancelado' and rn <= 10)
    from (select creado_por, estado, row_number() over (partition by creado_por order by creado_en desc) as rn
            from envios where creado_por is not null and estado <> 'borrador') x
   group by creado_por
$$;
revoke execute on function uso_envios_usuarios() from public, anon;
grant execute on function uso_envios_usuarios() to authenticated;

comment on function public.envios_por_empresa(text) is '[Avisos y panel] Nº de envíos por empresa, contados por la base de datos: «cliente» (de Dynamo, sin borradores ni cancelados), «transportista» (sin borradores ni cancelados) u «operador» (envíos manuales). Cada uno cuenta lo que puede ver. Quién: cualquier usuario con sesión (RLS). Argumentos: p_campo: cliente | transportista | operador.';
comment on function public.uso_envios_usuarios() is '[Avisos y panel] Por usuario: envíos creados, cancelados y cancelados entre sus 10 últimos (sin borradores). Para la pantalla Usuarios. Quién: Dynamo (RLS). Argumentos: ninguno.';
