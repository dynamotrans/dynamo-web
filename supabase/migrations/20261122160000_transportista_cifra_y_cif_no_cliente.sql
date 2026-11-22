-- (usuario, 2026-11-22)
--  1. El email al transportista de un importe a su favor (compensación, paralización…) SÍ lleva la
--     cifra: «el email a transportista con la compensación sí lleva las cifras».
--  2. Un CIF / NIF que ya está en la base de datos de TRANSPORTISTAS nunca puede darse de alta como
--     CLIENTE: «nunca debería poder crear un usuario de alta como cliente para pedir transporte si
--     el CIF o NIF ya está dado de alta en la base de datos de transportistas» (que no nos
--     subcontrate siendo nuestro transportista). Lo impide la base de datos al crear o cambiar el
--     CIF de un cliente (también si lo hace Dynamo), y el alta de la web lo dice al escribir el CIF.
--     Las fichas que ya existieran no se tocan (solo salta si se crea o se cambia el CIF).

-- 1. ---------------------------------------------------------------------------------------------
create or replace function public.fn_email_penalizacion(p_pen penalizaciones, p_evento text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text; v_clave text; v_desc text; v_ref text; v_min text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI');
  v_cli boolean; v_tra boolean;
begin
  select id, cliente_id, transportista_id, referencia_gx into e from envios where id = p_pen.envio_id;
  if e.id is null then return; end if;
  select nombre into v_tipo from tipos_penalizacion where id = p_pen.tipo_id;
  v_tipo := coalesce(v_tipo, 'Penalización');
  v_ref := ' · #' || coalesce(e.referencia_gx, '');
  v_desc := case when nullif(btrim(p_pen.descripcion), '') is not null
                 then '<p><strong>Motivo:</strong> ' || escapar_html(left(btrim(p_pen.descripcion), 1500)) || '</p>' else '' end;
  v_cli := coalesce(p_pen.importe_cliente, 0) > 0
           and not (p_evento = 'revision' and p_pen.generada_auto);   -- la automática ya va en «Envío cancelado»
  v_tra := coalesce(p_pen.importe_transportista, 0) > 0 and e.transportista_id is not null;

  if v_cli then
    v_clave := case p_evento when 'revision' then 'penalizacion_revision:' || p_pen.id || ':cliente'
                             when 'confirmada' then 'penalizacion:' || p_pen.id || ':cliente'
                             else 'penalizacion_anulada:' || p_pen.id || ':cliente:' || v_min end;
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', case p_evento when 'anulada' then 'info' else 'aviso' end,
      case p_evento when 'revision' then 'Penalización en revisión' when 'confirmada' then 'Penalización confirmada' else 'Penalización anulada' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_cliente) || ' + IVA.'
      || case p_evento when 'revision' then ' Si no estás conforme, ábrenos una incidencia antes de que la confirmemos.'
                       when 'confirmada' then ' La tienes en Penalizaciones.' else ' No se te cobrará.' end,
      '/panel/penalizaciones', e.id);
    perform fn_email_envio_cliente(e.id, v_clave,
      case p_evento when 'revision' then 'penalizacion_revision' when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'revision' then 'Penalización en revisión' when 'confirmada' then 'Penalización confirmada' else 'Penalización anulada' end,
      case p_evento
        when 'revision' then format('<p>Hemos registrado una <strong>penalización en revisión</strong> en tu envío: <strong>%s · %s + IVA</strong> (%s).</p>%s<p>Todavía no está confirmada. Si no estás conforme, ábrenos una <strong>incidencia</strong> desde la plataforma y la revisamos antes de confirmarla.</p>',
                                    escapar_html(v_tipo), euros_texto(p_pen.importe_cliente), escapar_html(p_pen.codigo), v_desc)
        when 'confirmada' then format('<p>Hemos <strong>confirmado una penalización</strong> en tu envío: <strong>%s · %s + IVA</strong> (%s).</p>%s<p>La tienes en <strong>Penalizaciones</strong>, dentro de la plataforma. Si no estás conforme, ábrenos una incidencia.</p>',
                                      escapar_html(v_tipo), euros_texto(p_pen.importe_cliente), escapar_html(p_pen.codigo), v_desc)
        else format('<p>La penalización <strong>%s · %s</strong> (%s + IVA) ha quedado <strong>anulada</strong>: no se te cobrará.</p>',
                    escapar_html(p_pen.codigo), escapar_html(v_tipo), euros_texto(p_pen.importe_cliente)) end);
    -- Es dinero: va también a su contabilidad.
    update emails_enviados set destinatario = fn_unir_emails(destinatario, emails_contactos_cliente(e.cliente_id, 'contabilidad'))
     where clave = v_clave and estado = 'pendiente';
  end if;

  if v_tra then
    v_clave := case p_evento when 'revision' then 'penalizacion_revision:' || p_pen.id || ':transportista'
                             when 'confirmada' then 'penalizacion:' || p_pen.id || ':transportista'
                             else 'penalizacion_anulada:' || p_pen.id || ':transportista:' || v_min end;
    -- En su campana (dentro de la plataforma) sí va la cifra.
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', case p_evento when 'anulada' then 'info' else 'ok' end,
      case p_evento when 'revision' then 'Importe a tu favor en revisión' when 'confirmada' then 'Importe a tu favor confirmado' else 'Importe a tu favor anulado' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_transportista)
      || case p_evento when 'anulada' then '. Ya no se suma a este envío.' else '. Se suma a lo que te pagamos por este envío.' end,
      '/panel/penalizaciones', e.id);
    -- Por email, CON la cifra (usuario, 2026-11-22: «el email al transportista con la compensación sí lleva las cifras»).
    perform fn_email_envio_transportista(e.id, e.transportista_id, v_clave,
      case p_evento when 'revision' then 'penalizacion_revision' when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'revision' then 'Importe a tu favor en revisión' when 'confirmada' then 'Importe a tu favor confirmado' else 'Importe a tu favor anulado' end,
      case p_evento
        when 'revision' then format('<p>Hemos registrado un <strong>importe a tu favor de %s</strong> (sin IVA) en este envío por <strong>%s</strong> (%s). Está en revisión: te avisamos cuando lo confirmemos.</p>%s', euros_texto(p_pen.importe_transportista), escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo), v_desc)
        when 'confirmada' then format('<p>Hemos <strong>confirmado un importe a tu favor de %s</strong> (sin IVA) en este envío por <strong>%s</strong> (%s): se suma a lo que te pagamos por el envío.</p>%s', euros_texto(p_pen.importe_transportista), escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo), v_desc)
        else format('<p>El importe a tu favor de <strong>%s</strong> (sin IVA) por <strong>%s</strong> (%s) de este envío ha quedado <strong>anulado</strong>: ya no se suma a lo que te pagamos.</p>', euros_texto(p_pen.importe_transportista), escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo)) end);
  end if;
end $$;
revoke execute on function public.fn_email_penalizacion(penalizaciones, text) from public, anon, authenticated;
comment on function public.fn_email_penalizacion(penalizaciones, text) is '[Gestión interna] Avisa (campana y email) de una penalización a quien tiene importe en ella. Cliente: su importe + IVA (email también a su contabilidad); si no está conforme, incidencia. Transportista: es un importe A SU FAVOR, con la cifra (sin IVA) en la campana y en el email. Eventos: revision (al crearla pendiente; la automática de cancelación no la repite al cliente), confirmada y anulada (anulada o borrada). Con copia a Dynamo; nada en envíos de gestión directa. Quién: nadie la llama desde fuera; la usa el disparador de penalizaciones. Argumentos: p_pen: la fila de la penalización · p_evento: revision, confirmada o anulada.';

-- 2. ---------------------------------------------------------------------------------------------
create or replace function public.cif_es_de_transportista(p_cif text)
returns boolean language sql stable security definer set search_path = public as $$
  select nullif(normalizar_id_fiscal(p_cif), '') is not null
     and exists (select 1 from transportistas t where normalizar_id_fiscal(t.cif) = normalizar_id_fiscal(p_cif))
$$;
revoke execute on function public.cif_es_de_transportista(text) from public, anon, authenticated;
comment on function public.cif_es_de_transportista(text) is '[Gestión interna] Dice si un CIF / NIF (escrito de cualquier forma) es el de una ficha de transportista, también de una borrada. Quién: funciones internas (bloqueo de clientes con CIF de transportista y alta de la web). Argumentos: p_cif: el CIF / NIF.';

create or replace function public.fn_clientes_cif_no_transportista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or normalizar_id_fiscal(new.cif) is distinct from normalizar_id_fiscal(old.cif))
     and cif_es_de_transportista(new.cif) then
    raise exception 'Este CIF / NIF ya está dado de alta como transportista: no se puede dar de alta como cliente.'
      using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.fn_clientes_cif_no_transportista() from public, anon, authenticated;
comment on function public.fn_clientes_cif_no_transportista() is '[Gestión interna] Disparador de clientes: no deja crear un cliente, ni cambiar su CIF, con el CIF / NIF de un transportista (usuario, 2026-11-22: que nuestro transportista no nos subcontrate como cliente). No afecta a las fichas que ya existían mientras no se cambie su CIF. Quién: nadie la llama; la ejecuta la base de datos.';

drop trigger if exists tg_clientes_cif_no_transportista on clientes;
create trigger tg_clientes_cif_no_transportista before insert or update of cif on clientes
  for each row execute function fn_clientes_cif_no_transportista();

-- El alta de la web: al escribir el CIF ya se le dice que no se puede (sin decir por qué).
create or replace function public.buscar_empresa_de_mi_alta(p_cif text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cif text := nullif(normalizar_id_fiscal(p_cif), '');
  v_hay boolean;
begin
  if auth.uid() is null or not exists (
       select 1 from usuarios where id = auth.uid() and estado = 'pendiente_verificacion' and rol = 'cliente' and cliente_id is null) then
    raise exception 'Solo quien tiene el alta pendiente busca su empresa.' using errcode = '42501';
  end if;
  if v_cif is null or v_cif !~ '^[A-Z0-9]{4,20}$' then return 'no_valido'; end if;
  -- Tope contra el sondeo: 5 CIF distintos (repetir uno ya buscado no cuenta) y 30
  -- búsquedas en total, cada 24 horas.
  if (select count(*) from alta_busquedas_cif
       where usuario_id = auth.uid() and creado_en > now() - interval '24 hours') >= 30
     or (not exists (select 1 from alta_busquedas_cif
                      where usuario_id = auth.uid() and creado_en > now() - interval '24 hours' and cif = v_cif)
         and (select count(distinct cif) from alta_busquedas_cif
               where usuario_id = auth.uid() and creado_en > now() - interval '24 hours') >= 5) then
    return 'tope';
  end if;
  -- CIF de un transportista: nunca puede ser cliente (usuario, 2026-11-22).
  if cif_es_de_transportista(v_cif) then
    insert into alta_busquedas_cif (usuario_id, cif, encontrado) values (auth.uid(), v_cif, false);
    return 'no_admitido';
  end if;
  v_hay := exists (select 1 from clientes where normalizar_id_fiscal(cif) = v_cif);
  insert into alta_busquedas_cif (usuario_id, cif, encontrado) values (auth.uid(), v_cif, v_hay);
  return case when v_hay then 'encontrado' else 'no_encontrado' end;
end $function$;
comment on function public.buscar_empresa_de_mi_alta(text) is '[Altas] Dice si el CIF / NIF que escribe quien tiene el alta pendiente es ya de un cliente de Dynamo: encontrado, no_encontrado, no_valido (no parece un CIF / NIF) o tope (ha buscado demasiado: 5 CIF distintos o 30 búsquedas en 24 horas). No devuelve ningún dato del cliente. Apunta cada búsqueda. Si el CIF es de un transportista contesta «no_admitido»: nunca puede darse de alta como cliente (2026-11-22). Quién: usuario cliente con el alta pendiente y sin empresa. Argumentos: p_cif: CIF / NIF de la empresa, con o sin guiones y puntos.';
