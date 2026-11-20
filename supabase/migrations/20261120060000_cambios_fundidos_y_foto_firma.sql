-- ---- Dos cambios seguidos: un solo «antes → ahora» por dato (usuario, 2026-11-20) ----------
-- «¿Por qué repite 2 veces la mercancía con el cambio? Solo habría una, ¿no?». Dos cambios
-- dentro del mismo plazo se juntaban en un email poniendo una lista detrás de otra
-- (Mercancía 20→21 y Mercancía 21→23). Ahora se funden: cada dato sale una vez, con el valor
-- de ANTES del primer cambio y el de AHORA del último (20→23); si vuelve a quedar como estaba,
-- se quita. Y el email que espera se busca por envío, no por minuto: dos cambios a las 10:59
-- y a las 11:00 ya no salen en dos emails.

create or replace function fundir_cambios_html(p_viejos text, p_nuevos text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_items text[] := array(select m[1] from regexp_matches(coalesce(p_viejos, ''), '(<li>.*?</li>)', 'g') m);
  n text; v_et text; i int; v_antes text; v_ahora text; v_hecho boolean;
  limpio constant text := '<[^>]+>|\s*\+\s*IVA';
begin
  for n in select m[1] from regexp_matches(coalesce(p_nuevos, ''), '(<li>.*?</li>)', 'g') m loop
    v_et := substring(n from '^<li><strong>([^<]*):</strong>');
    v_hecho := false;
    if v_et is not null then
      for i in 1 .. coalesce(array_length(v_items, 1), 0) loop
        if substring(v_items[i] from '^<li><strong>([^<]*):</strong>') = v_et then
          v_antes := substring(v_items[i] from ':</strong> antes (.*?) · ahora ');
          v_ahora := substring(n from ' · ahora (.*)</li>$');
          if v_ahora is null then
            v_items[i] := n;                                   -- sin «antes/ahora» (la ruta): el último
          elsif v_antes is null then
            v_items[i] := format('<li><strong>%s:</strong> %s</li>', v_et, v_ahora);   -- antes no había valor
          elsif btrim(regexp_replace(v_antes, limpio, '', 'g')) = btrim(regexp_replace(v_ahora, limpio, '', 'g')) then
            v_items[i] := null;                                -- vuelve a como estaba: fuera
          else
            v_items[i] := format('<li><strong>%s:</strong> antes %s · ahora %s</li>', v_et, v_antes, v_ahora);
          end if;
          v_hecho := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_hecho then v_items := v_items || n; end if;
  end loop;
  return coalesce(array_to_string(v_items, ''), '');
end $$;
revoke all on function fundir_cambios_html(text, text) from public, anon, authenticated;
grant execute on function fundir_cambios_html(text, text) to service_role;
comment on function fundir_cambios_html(text, text) is '[Gestión interna] Junta la lista «Qué ha cambiado» de un email que aún espera con la de un cambio nuevo: cada dato sale una vez, con el valor de antes del primer cambio y el de ahora del último; si vuelve a quedar como estaba, se quita. Quién: los emails de envío modificado. Argumentos: p_viejos: los <li> que ya tenía el email · p_nuevos: los <li> del cambio nuevo.';

create or replace function fn_encolar_email_envio_modificado(p_envio uuid, p_cambios text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text := 'envio_modificado:' || p_envio || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS');
        v_estado estado_envio; x record; v_lista text;
begin
  select estado into v_estado from envios where id = p_envio;
  if v_estado is null or v_estado in ('borrador', 'cancelado') or nullif(p_cambios, '') is null then return; end if;
  -- Un email de «modificado» de este envío que aún espera: se funde con él.
  select id, cuerpo_html into x from emails_enviados
   where envio_id = p_envio and tipo = 'envio_modificado' and estado = 'pendiente' and clave like 'envio_modificado:%'
   order by creado_en desc limit 1 for update;
  if x.id is not null then
    v_lista := fundir_cambios_html(substring(split_part(x.cuerpo_html, '<!--detalle-->', 1) from '<ul>(.*)</ul>'), p_cambios);
    if v_lista = '' then
      update emails_enviados set estado = 'omitido', error = 'Los cambios se han deshecho: el envío quedó como estaba.' where id = x.id;
    else
      update emails_enviados
         set cuerpo_html = regexp_replace(split_part(cuerpo_html, '<!--detalle-->', 1), '<ul>.*</ul>', '<ul>' || replace(v_lista, '\', '\\') || '</ul>')
                           || '<!--detalle-->' || envio_detalle_html(p_envio)
                           || substr(split_part(cuerpo_html, '<!--detalle-->', 2), position('<p>Lo sigues' in split_part(cuerpo_html, '<!--detalle-->', 2)))
       where id = x.id;
    end if;
    return;
  end if;
  perform fn_email_envio_cliente(p_envio, v_clave, 'envio_modificado', 'Envío modificado',
    '<p>Tu envío se ha <strong>modificado</strong>.</p><p><strong>Qué ha cambiado</strong></p><ul>' || p_cambios || '</ul>');
end $$;

create or replace function fn_encolar_email_transportista_modificado(p_envio uuid, p_transportista uuid, p_cambios text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text := 'transportista_modificado:' || p_envio || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS');
        x record; v_lista text;
begin
  if p_transportista is null or nullif(p_cambios, '') is null then return; end if;
  select id, cuerpo_html into x from emails_enviados
   where envio_id = p_envio and tipo = 'transportista_modificado' and estado = 'pendiente' and clave like 'transportista_modificado:%'
   order by creado_en desc limit 1 for update;
  if x.id is not null then
    v_lista := fundir_cambios_html(substring(split_part(x.cuerpo_html, '<!--detalle-->', 1) from '<ul>(.*)</ul>'), p_cambios);
    if v_lista = '' then
      update emails_enviados set estado = 'omitido', error = 'Los cambios se han deshecho: el envío quedó como estaba.' where id = x.id;
    else
      update emails_enviados
         set cuerpo_html = regexp_replace(split_part(cuerpo_html, '<!--detalle-->', 1), '<ul>.*</ul>', '<ul>' || replace(v_lista, '\', '\\') || '</ul>')
                           || '<!--detalle-->' || envio_detalle_transportista_html(p_envio) || '<!--cierre-->' || split_part(cuerpo_html, '<!--cierre-->', 2)
       where id = x.id;
    end if;
    return;
  end if;
  perform fn_email_envio_transportista(p_envio, p_transportista, v_clave, 'transportista_modificado', 'Envío modificado',
    '<p>El envío que tienes asignado se ha <strong>modificado</strong>.</p><p><strong>Qué ha cambiado</strong></p><ul>' || p_cambios || '</ul>',
    '<p>Si el cambio afecta al precio acordado, <strong>te llamamos</strong> para verlo. La orden de carga actualizada la tienes en tu panel.</p>');
end $$;

-- ---- Foto de la firma, 1,5 veces más grande (usuario, 2026-11-20: «mi avatar más grande») --
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.firma_email_persona()'::regprocedure);
  n := replace(replace(replace(v, 'width:64px"><img', 'width:96px"><img'), 'width="64" height="64"', 'width="96" height="96"'), 'width:64px;height:64px', 'width:96px;height:96px');
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('width="96"' in v) = 0 then raise exception 'firma_email_persona: no encuentro el tamaño de la foto'; end if;
end $$;

-- ---- Firma: tercer botón «Entrar en dynamotrans.com» (usuario, 2026-11-20) --------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.email_con_diseno(text, text)'::regprocedure);
  n := replace(v,
    $a$|| '<td style="padding:0 0 8px 0"><a class="btn2" href="mailto:%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Escribir a Dynamo</a></td>'
      || '</tr></table>',
      regexp_replace(v_tel, '[^0-9+]', '', 'g'), escapar_html(v_tel), escapar_html(v_mail));$a$,
    $b$|| '<td style="padding:0 8px 8px 0"><a class="btn2" href="mailto:%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Escribir a Dynamo</a></td>'
      || '<td style="padding:0 0 8px 0"><a class="btn2" href="https://%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Entrar en %s</a></td>'
      || '</tr></table>',
      regexp_replace(v_tel, '[^0-9+]', '', 'g'), escapar_html(v_tel), escapar_html(v_mail),
      escapar_html(regexp_replace(v_web, '^https?://', '')), escapar_html(regexp_replace(v_web, '^(https?://)?(www\.)?', '')));$b$);
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('Entrar en %s' in v) = 0 then raise exception 'email_con_diseno: no encuentro los botones de la firma'; end if;
end $$;

-- ---- Aviso de anulación al sitio: lo anula el cliente, no Dynamo (usuario, 2026-11-20) ------
-- «Pon algo que sea que anula el cliente, no nosotros»: «Queda anulada la entrega por parte de
-- Cliente S.L. … Si tenéis cualquier duda, contactad con vuestro cliente.»
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.encolar_anulacion_parada'::regproc);
  n := replace(replace(v, '</strong> de parte de <strong>', '</strong> por parte de <strong>'),
               '). Disculpad las molestias.</p>', '). Si tenéis cualquier duda, contactad con vuestro cliente.</p>');
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('contactad con vuestro cliente' in v) = 0 then raise exception 'encolar_anulacion_parada: no encuentro el texto del aviso'; end if;
end $$;

-- ---- Resumen mensual a los sitios: qué se recogió o entregó (usuario, 2026-11-20) -------------
-- «Pon qué se entregó o recogió de mercancía»: cada línea, una recogida o entrega con sus
-- medidas («07/10/2026 · Entrega · 5,00 metros · 3,00 toneladas · Grupaje · Paletizada»). Sin
-- la descripción de la mercancía ni el cliente.
do $m$ declare v text; n text; begin
  v := pg_get_functiondef('public.encolar_resumen_sitios'::regproc);
  n := replace(replace(v, $a1$format('<li>%s · %s</li>', to_char(x.dia, 'DD/MM/YYYY'),
                             case when x.tipo = 'carga' then 'Recogida' else 'Entrega' end)$a1$, $b1$format('<li>%s · %s · %s</li>', to_char(x.dia, 'DD/MM/YYYY'),
                             case when x.tipo = 'carga' then 'Recogida' else 'Entrega' end, escapar_html(x.merc))$b1$), $a2$        select distinct (coalesce(p.realizado_en, case when p.tipo = 'carga' then e.fecha_carga_real::timestamptz else e.entregado_en end)
                         at time zone 'Europe/Madrid')::date as dia,
               p.tipo
$a2$, $b2$        select (coalesce(p.realizado_en, case when p.tipo = 'carga' then e.fecha_carga_real::timestamptz else e.entregado_en end)
                         at time zone 'Europe/Madrid')::date as dia,
               p.tipo,
               envio_mercancia_texto(e.metros_lineales, e.toneladas, e.tipo_carga::text, false, null, false, false)
                 || case when e.paletizado is false then ' · No paletizada' else ' · Paletizada' end as merc
$b2$);
  if position('escapar_html(x.merc)' in v) = 0 then
    if n = v or position('as merc' in n) = 0 or position('escapar_html(x.merc)' in n) = 0 then raise exception 'encolar_resumen_sitios: no encuentro las líneas del resumen'; end if;
    execute n;
  end if;
end $m$;

-- ---- Oferta escalonada sin aceptación: botón «Abrir el envío» para Dynamo (usuario, 2026-11-20) --
-- Desde el aviso, a la ficha: ver detalles, mover la fecha, cambiar el precio, llamar al cliente…
do $$ declare v text; n text;
  boton constant text := $b$</p>' || format('<p><a href="%s/panel/envios?ver=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Abrir el envío</a></p>', coalesce(parametro('url_plataforma') #>> '{}', ''), d.envio_id) || '<p>— %s</p>'$b$;
begin
  v := pg_get_functiondef('public.fn_difusion_paso'::regproc);
  n := replace(replace(v,
    $a$Contactados: %s. Esto ya es de teléfono.</p><p>— %s</p>'$a$, $a$Contactados: %s. Esto ya es de teléfono.$a$ || boton),
    $a$ha terminado sin aceptación. %s Contactados: %s.</p><p>— %s</p>'$a$, $a$ha terminado sin aceptación. %s Contactados: %s.$a$ || boton);
  if position('>Abrir el envío</a>' in v) = 0 then
    if (length(n) - length(replace(n, '>Abrir el envío</a>', ''))) / length('>Abrir el envío</a>') <> 2 then
      raise exception 'fn_difusion_paso: no encuentro los dos avisos de oferta sin aceptación'; end if;
    execute n;
  end if;
end $$;

-- ---- Cuenta suspendida automáticamente: botón «Revisar la cuenta» (usuario, 2026-11-20) ----
-- Abre Usuarios con la ficha de esa cuenta ya abierta, para revisarla y reactivarla o llamar.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_usuarios_aviso_suspension'::regproc);
  n := replace(v,
    $a$|| '<p>Si es un cliente legítimo, se reactiva desde el panel (Usuarios, estado «Activa»): el contador de las reglas vuelve a empezar.</p>',$a$,
    $b$|| '<p>Si es un cliente legítimo, se reactiva desde el panel (Usuarios, estado «Activa»): el contador de las reglas vuelve a empezar.</p>'
                 || format('<p><a href="%s/panel/usuarios?q=%s&amp;abrir=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Revisar la cuenta</a></p>',
                           coalesce(parametro('url_plataforma') #>> '{}', ''), replace(replace(new.email, '%', ''), '+', '%%2B'), new.id),$b$);   -- %% : va dentro del texto de otro format()
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('Revisar la cuenta' in v) = 0 then raise exception 'fn_usuarios_aviso_suspension: no encuentro el texto del aviso'; end if;
end $$;
