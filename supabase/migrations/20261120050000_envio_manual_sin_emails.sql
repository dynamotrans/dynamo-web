-- ---- Envío con transportista propio del cliente: Dynamo no avisa a nadie (usuario, 2026-11-20) --
-- «¿Estás enviando recordatorios a los sitios cuando el envío es de un transportista propio del
-- cliente? … Mejor no enviamos nada». Cada aviso ya lo comprobaba por su cuenta (sitios,
-- víspera, matrículas, cliente, transportista, resumen mensual, cargas de vuelta). Aquí queda
-- una red única: cualquier email de un envío manual nace OMITIDO, salvo la orden de carga que
-- el propio cliente manda a su transportista con el botón («orden_manual:…»). Y la oferta
-- escalonada a transportistas no se puede lanzar en un envío manual.

create or replace function fn_emails_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_seg int := greatest(0, parametro_num('emails_espera_segundos', 30)::int); v_vence timestamptz;
begin
  new.creado_por := coalesce(new.creado_por, auth.uid());
  new.enviar_desde := greatest(coalesce(new.enviar_desde, now()), now() + make_interval(secs => v_seg));
  if v_seg = 0 then new.enviar_desde := now(); end if;
  -- Envío con transportista propio del cliente: solo sale lo que el cliente manda él mismo.
  if new.envio_id is not null and new.estado = 'pendiente' and coalesce(new.clave, '') not like 'orden_manual:%'
     and exists (select 1 from envios e where e.id = new.envio_id and (coalesce(e.es_manual, false) or e.operador_id is not null)) then
    new.estado := 'omitido';
    new.error := 'Envío con transportista propio del cliente: Dynamo no avisa a nadie.';
  end if;
  if new.envio_id is not null and new.estado = 'pendiente' then
    select id, vence_en into new.cambio_id, v_vence from envio_cambios
     where envio_id = new.envio_id and estado = 'abierto' and vence_en > now();
    if v_vence is not null then new.enviar_desde := greatest(new.enviar_desde, v_vence); end if;
  end if;
  return new;
end $$;

do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.iniciar_difusion(uuid, numeric, smallint, boolean, time without time zone, boolean)'::regprocedure);
  n := replace(v, $a$  if e.estado is null then return jsonb_build_object('resultado', 'no_existe'); end if;$a$,
    $b$  if e.estado is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  -- Envío con transportista propio del cliente: Dynamo no lo oferta (usuario, 2026-11-20).
  if exists (select 1 from envios x where x.id = p_envio and (coalesce(x.es_manual, false) or x.operador_id is not null)) then
    return jsonb_build_object('resultado', 'manual');
  end if;$b$);
  if n = v then raise exception 'iniciar_difusion: no encuentro dónde comprueba que el envío existe'; end if;
  execute n;
end $$;
