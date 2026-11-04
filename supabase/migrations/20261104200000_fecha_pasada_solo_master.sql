-- =====================================================================================
-- FECHA DE CARGA PASADA: solo el Admin Master (decisión del usuario, 2026-11-04)
-- =====================================================================================
-- El Admin Master puede crear o cambiar un envío con CUALQUIER fecha, también pasada
-- (p. ej. dar de alta un envío de hace 6 meses que se gestionó por teléfono). Nadie más:
-- ni empleados ni clientes, ni llamando a la API a mano. La regla mira solo la fecha de
-- carga «desde» y solo cuando se crea el envío o se cambia esa fecha (tocar otros datos
-- de un envío antiguo sigue funcionando). La fecha de carga REAL (lo que pasó) no entra.
-- =====================================================================================
create or replace function fn_envios_aa_fecha_pasada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fecha_carga_desde is not null
     and new.fecha_carga_desde < (now() at time zone 'Europe/Madrid')::date
     and (tg_op = 'INSERT' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and not es_servidor() and not es_administrador() then
    raise exception 'Solo el Admin Master puede poner una fecha de carga pasada.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_aa_fecha_pasada() from public, anon, authenticated;
create trigger tg_envios_aa_fecha_pasada before insert or update of fecha_carga_desde on envios
  for each row execute function fn_envios_aa_fecha_pasada();
