-- PENALIZACIONES: AL GUARDARLA NO SE AVISA NUNCA (usuario, 2026-11-22, rectifica lo de la migración
-- 20261122140000): «cuando guardemos penalización no se notifica nunca, solamente cuando se confirme
-- o se cancele». Al crearla pendiente («Guardar penalización») no sale ni email ni campana; al
-- confirmarla (o si nace confirmada) y al cancelarla o borrarla, sí, como hasta ahora.

create or replace function public.fn_email_penalizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'cancelada' then perform fn_email_penalizacion(old, 'anulada'); end if;
    return null;
  end if;
  if new.estado = 'confirmada' and (tg_op = 'INSERT' or old.estado <> 'confirmada') then
    perform fn_email_penalizacion(new, 'confirmada');
  elsif tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado <> 'cancelada' then
    perform fn_email_penalizacion(old, 'anulada');
  end if;
  return null;
end $$;
revoke execute on function public.fn_email_penalizaciones() from public, anon, authenticated;
comment on function public.fn_email_penalizaciones() is '[Gestión interna] Disparador de penalizaciones: al confirmarse (o nacer confirmada) y al cancelarse o borrarse, avisa por campana y email a quien tiene importe (fn_email_penalizacion). Al guardarla pendiente o volverla a pendiente NO avisa (usuario, 2026-11-22). Quién: nadie la llama; la ejecuta la base de datos.';
