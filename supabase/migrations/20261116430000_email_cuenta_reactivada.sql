-- =====================================================================================
-- EMAIL «TU CUENTA VUELVE A ESTAR ACTIVA» AL REACTIVAR (usuario, 2026-11-16)
-- =====================================================================================
-- «Si suspendo, debe saber cuándo está reactivada para que entre, por si se autosuspende o
-- se suspende por lo que sea: aviso de cuenta reactivada y enlace al login.»
--
-- Desde hoy, cada vez que una cuenta suspendida (solo lectura o total, a mano o automática,
-- o de baja a petición) vuelve a «activa», se encola un email al propio usuario con el
-- botón para entrar. A diferencia del de alta (una vez por cuenta), este sale en CADA
-- reactivación.

-- 1. Tipo de email nuevo ---------------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. El email, en cada reactivación ------------------------------------------------------
create or replace function public.fn_usuarios_email_cuenta_reactivada()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base    text := rtrim(coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com'), '/');
  v_empresa text;
  v_nombre  text := nullif(trim(split_part(coalesce(new.nombre, ''), ' ', 1)), '');
begin
  if new.email is null or new.email = '' then return null; end if;
  select coalesce(
           (select c.razon_social from clientes c where c.id = new.cliente_id),
           (select t.razon_social from transportistas t where t.id = new.transportista_id))
    into v_empresa;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('cuenta_reactivada:' || new.id || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint,
          'cuenta_reactivada', new.email,
          'Tu cuenta de Dynamo vuelve a estar activa',
          format('<p>Hola%s:</p>'
                 || '<p>Hemos <strong>reactivado tu cuenta</strong>%s. Ya puedes volver a entrar en la plataforma y trabajar con normalidad.</p>'
                 || '<p><a href="%s/panel/entrar" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">Entrar en la plataforma</a></p>'
                 || '<p>Entras con tu email <strong>%s</strong> y tu contraseña de siempre. Si no la recuerdas, pulsa «¿Olvidaste tu contraseña?» en esa misma pantalla.</p>'
                 || '<p>Si el botón no funciona, copia esta dirección en el navegador: %s/panel/entrar</p>'
                 || '<p>¿Dudas? Escríbenos a %s.</p>',
                 coalesce(' ' || escapar_html(v_nombre), ''),
                 coalesce(' de <strong>' || escapar_html(v_empresa) || '</strong>', ''),
                 v_base, escapar_html(new.email), v_base, escapar_html(email_dynamo())))
  on conflict (clave) do nothing;
  return null;
end $$;
revoke execute on function public.fn_usuarios_email_cuenta_reactivada() from public, anon, authenticated;
comment on function public.fn_usuarios_email_cuenta_reactivada() is '[Clientes y cuentas] Disparador interno: cada vez que una cuenta suspendida (solo lectura o total; a mano, automática o de baja a petición) vuelve a estar activa, encola un email al propio usuario diciéndole que su cuenta está reactivada, con el enlace para entrar (parámetro url_plataforma + /panel/entrar). Uno por reactivación. Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
create trigger tg_usuarios_email_cuenta_reactivada after update of estado on usuarios
  for each row when (old.estado in ('suspendida', 'suspendida_total') and new.estado = 'activa')
  execute function fn_usuarios_email_cuenta_reactivada();
