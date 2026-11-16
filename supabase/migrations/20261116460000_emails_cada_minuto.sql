-- =====================================================================================
-- LA COLA DE EMAILS SALE CADA MINUTO, NO CADA 10 (usuario, 2026-11-16)
-- =====================================================================================
-- «¿No manda los emails al momento? ¿Los deja en espera 10 minutos? ¿Por qué?» Porque la
-- tarea que vacía la cola se programó cada 10 minutos. Para una oferta de carga, un «tu
-- cuenta ya está activa» o un cambio de email, 10 minutos es demasiado.
--
-- Desde hoy:
--   · una tarea nueva manda la cola CADA MINUTO;
--   · la de cada 10 minutos sigue igual: es la que prepara los avisos de reloj
--     (matrículas, vísperas) y, de paso, también manda.
-- Para que dos pasadas a la vez no manden el mismo email dos veces, cada una toma solo
-- las filas que la otra no tiene cogidas. Y un email no se toca hasta que lleva 15
-- segundos en la cola: los que manda el servidor web con su PDF adjunto se apuntan
-- primero como pendientes, y así la cola no se le adelanta.

do $$
declare v_oid oid := 'public.enviar_emails_pendientes()'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'for r in select x.* from emails_enviados x where x.estado = ''pendiente'' order by x.creado_en limit 20',
    'for r in select x.* from emails_enviados x where x.estado = ''pendiente''' || chr(10) ||
    '             and x.creado_en < now() - interval ''15 seconds''' || chr(10) ||
    '           order by x.creado_en limit 20 for update skip locked');
  if v_nueva = v_def then raise exception 'No encuentro la lectura de la cola en enviar_emails_pendientes: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.enviar_emails_pendientes() is %L',
    obj_description(v_oid, 'pg_proc') || ' La llama una tarea cada minuto (y la pasada completa de cada 10 minutos); dos pasadas a la vez no repiten email, y un email no se toca hasta que lleva 15 segundos en la cola.');
end $$;

comment on function public.procesar_emails_operativos() is '[Gestión interna] La pasada completa de los emails operativos: encola los avisos de reloj que toquen (matrículas, vísperas) y manda la cola. La llama pg_cron cada 10 minutos; además, otra tarea manda la cola cada minuto (enviar_emails_pendientes). Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-emails-enviar', '* * * * *', 'select public.enviar_emails_pendientes()');
  end if;
end $$;
