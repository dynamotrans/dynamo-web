-- ---- Direcciones de prueba: se quitan solo ellas, el resto del email sale (usuario, 2026-11-20) --
-- «He creado envíos con un usuario y no me han llegado ni a mí ni a info@». La cola dejaba
-- OMITIDO el email entero si UNA sola de sus direcciones era de prueba (@….invalid): un cliente
-- con un usuario de prueba y otro real no recibía nada, y tampoco salía la copia a Dynamo.
-- Ahora se quitan las direcciones .invalid y se manda al resto; solo si no queda ninguna real
-- queda omitido, como antes.

create or replace function emails_sin_prueba(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(string_agg(btrim(x), ', ' order by n), '')
    from unnest(regexp_split_to_array(coalesce(p, ''), '[,;]')) with ordinality as t(x, n)
   where btrim(x) <> '' and btrim(x) !~* '\.invalid\s*>?\s*$'
$$;
revoke all on function emails_sin_prueba(text) from public, anon, authenticated;
grant execute on function emails_sin_prueba(text) to service_role;
comment on function emails_sin_prueba(text) is '[Gestión interna] Quita de una lista de destinatarios (separada por comas o punto y coma) las direcciones de prueba del dominio .invalid, que no existe. Devuelve el resto separado por comas, o null si no queda ninguna. Quién: la cola de emails. Argumentos: p: la lista de destinatarios.';

do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  n := replace(v, $a$  update emails_enviados set estado = 'omitido', error = 'Dirección de prueba (.invalid): no se envía.'$a$,
    $b$  update emails_enviados set destinatario = emails_sin_prueba(destinatario)
   where estado = 'pendiente' and destinatario ~* '\.invalid(\s|>|,|;|$)' and emails_sin_prueba(destinatario) is not null;
  -- Solo quedan las que no tienen ninguna dirección real: esas no se mandan.
  update emails_enviados set estado = 'omitido', error = 'Dirección de prueba (.invalid): no se envía.'$b$);
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('emails_sin_prueba(destinatario)' in v) = 0 then raise exception 'enviar_emails_pendientes: no encuentro la regla de las direcciones de prueba'; end if;
end $$;

-- ---- Mientras corre el contador, el envío sigue en su pestaña de antes (usuario, 2026-11-20) --
-- «Deja el envío donde estaba antes del cambio, con su spinner, y una vez pase el tiempo lo
-- pones donde tenga que ir… y ponlo el primero de su lista». La lista pregunta qué envíos
-- tienen un cambio corriendo y cómo estaban antes: con eso los coloca arriba de la pestaña
-- de antes y, al acabar el plazo, ya salen donde les toca.
create or replace function cambios_en_espera(p_cliente uuid default null, p_transportista uuid default null)
returns table (envio_id uuid, vence_en timestamptz, tipo text, estado_antes text, pago_antes text, manual_antes boolean, asignado_antes boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.envio_id, c.vence_en, c.tipo,
         c.antes ->> 'estado', c.antes ->> 'estado_pago_previo', (c.antes ->> 'es_manual')::boolean,
         case when c.antes is null then null
              else (c.antes ->> 'transportista_id') is not null or c.antes ->> 'estado_asignacion' = 'confirmada' end
    from envio_cambios c
    join envios e on e.id = c.envio_id
   where c.estado = 'abierto' and c.vence_en > now()
     and (ve_todo() or c.usuario_id = auth.uid())
     and (ve_todo() or e.cliente_id = cliente_del_usuario() or e.transportista_id = transportista_del_usuario())
     and (p_cliente is null or e.cliente_id = p_cliente)
     and (p_transportista is null or e.transportista_id = p_transportista)
   order by c.vence_en desc
   limit 50
$$;
revoke all on function cambios_en_espera(uuid, uuid) from public, anon;
grant execute on function cambios_en_espera(uuid, uuid) to authenticated, service_role;
comment on function cambios_en_espera(uuid, uuid) is '[Envíos] Para la lista de envíos: los envíos con un cambio cuyo contador aún corre (máx. 50), hasta cuándo, qué fue (creado, modificado, cancelado, asignado) y cómo estaban antes (estado, pago previo, manual y si tenía transportista; null en uno recién creado). La lista los deja arriba de la pestaña de antes hasta que acaba el plazo. Quién: Dynamo ve todos; los demás, solo los cambios que hicieron ellos. Argumentos: p_cliente: clientes.id (vista de un cliente) · p_transportista: transportistas.id (vista de un transportista).';
