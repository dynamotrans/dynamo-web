-- =====================================================================================
-- SITIOS → BREVO: REVISAR LA LISTA ANTES DE SUBIRLA (usuario, 2026-11-25)
-- =====================================================================================
-- «¿Quieres revisar la lista antes de que se mande o que vaya sola?» — «OK, reviso, pásamela.»
-- La pantalla de Mantenimiento enseña, uno a uno, los emails que van a subir a la lista
-- 04-SITIOS-DYNAMO, y es él quien pulsa «Subir ahora». El interruptor de Parámetros pasa
-- a decidir solo si ADEMÁS suben solos cada mañana: apagado (como nace) = solo a mano.

create or replace function public.brevo_sitios_revisar()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', p.email, 'nombre', p.nombre, 'cargo', p.cargo, 'empresa', p.empresa,
           'poblacion', p.poblacion, 'provincia', p.provincia,
           'motivo', case when b.email is null then 'nuevo' when b.estado = 'subido' then 'cambiado' else 'reintento' end)
           order by p.empresa nulls last, p.email), '[]'::jsonb)
    into v
    from brevo_sitios_pendientes(500) as p(email, nombre, cargo, empresa, cif, telefono, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, google_maps, sitio_id, huella)
    left join brevo_subidas b on b.email = p.email;
  return v;
end $$;
comment on function public.brevo_sitios_revisar() is '[Gestión interna] Los emails de sitios que van a subir a Brevo en la próxima subida (500 como mucho), con persona, empresa, población y por qué suben (nuevo, cambiado o reintento), para revisarlos antes de pulsar «Subir ahora». Quién: el equipo de Dynamo (pantalla de Mantenimiento). Argumentos: sin argumentos.';
revoke all on function public.brevo_sitios_revisar() from public, anon;
grant execute on function public.brevo_sitios_revisar() to authenticated, service_role;
