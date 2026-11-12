-- =====================================================================================
-- ACTIVAR pg_net (complemento de 20261112020000_emails_operativos.sql): la extensión
-- con la que enviar_emails_pendientes() llama a la API de Postmark. En Supabase está
-- disponible pero apagada de fábrica; aquí se enciende. En el PostgreSQL local de
-- pruebas no existe y no pasa nada: la función ya no hace nada sin ella.
-- =====================================================================================
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;
