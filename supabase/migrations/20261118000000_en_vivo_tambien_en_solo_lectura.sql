-- EN VIVO TAMBIÉN CON LA CUENTA EN SOLO LECTURA (usuario, 2026-11-18).
--
-- Un usuario suspendido en solo lectura (estado «suspendida») puede consultarlo todo, pero
-- no recibía las señales de «en vivo»: la política solo dejaba escuchar a las cuentas
-- activas (es de antes de que existiera la suspensión en dos niveles). Consecuencia que vio
-- el usuario: al reactivarle la cuenta, la banda roja de «cuenta suspendida» seguía en
-- pantalla hasta recargar a mano, porque el aviso del cambio no le llegaba.
--
-- Ahora escuchan su canal las cuentas activas Y las que están en solo lectura. La señal
-- sigue sin llevar datos (solo el nombre de la tabla) y lo que se pide después pasa por
-- los permisos de siempre, así que no se abre nada nuevo. La suspensión TOTAL y el resto
-- de estados siguen sin escuchar.
do $$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    raise notice 'en vivo: este Postgres no tiene Supabase Realtime; la política se crea en Supabase.';
    return;
  end if;
  execute 'drop policy if exists "en vivo: cada uno sus señales" on realtime.messages';
  execute $p$
    create policy "en vivo: cada uno sus señales" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (
          (realtime.topic() = 'dynamo' and (public.es_equipo_dynamo() or public.es_solo_lectura()))
          or exists (
            select 1 from public.usuarios u
             where u.id = auth.uid() and u.estado in ('activa', 'suspendida')
               and (realtime.topic() = 'cliente:' || u.cliente_id::text
                 or realtime.topic() = 'transportista:' || u.transportista_id::text))
        )
      )
  $p$;
end $$;
