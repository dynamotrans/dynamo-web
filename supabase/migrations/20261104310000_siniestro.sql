-- =====================================================================================
-- PROTOCOLO DE SINIESTRO (usuario, 2026-11-04)
-- Daño, rotura o faltante de mercancía: hay que avisar a Dynamo EN EL MOMENTO y antes de
-- descargar (o de terminar la carga), con fotos y reservas en el CMR. Tipo de incidencia
-- propio, que entra siempre con prioridad CRÍTICA (arriba del todo para Dynamo).
-- =====================================================================================

insert into tipos_incidencia (clave, nombre, orden)
values ('siniestro', 'Siniestro: daño, rotura o faltante de mercancía', 0)
on conflict (clave) do nothing;

create or replace function fn_incidencias_siniestro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tipos_incidencia where id = new.tipo_id and clave = 'siniestro') then
    new.prioridad := 'critica';
  end if;
  return new;
end $$;
revoke execute on function fn_incidencias_siniestro() from public, anon, authenticated;
create trigger tg_incidencias_aa_siniestro before insert on incidencias
  for each row execute function fn_incidencias_siniestro();
