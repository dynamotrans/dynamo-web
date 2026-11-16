-- =====================================================================================
-- EMAIL «TU CUENTA YA ESTÁ ACTIVA» AL CONFIRMAR UN ALTA (usuario, 2026-11-16)
-- =====================================================================================
-- «Cuando confirmamos el alta, debe enviarle un mail diciendo que está de alta, con enlace
-- a entrar a la web (login).» Hasta hoy solo quedaba un aviso en la campana, que nadie ve
-- si no entra.
--
-- Al pasar una cuenta de «pendiente de verificación» a «activa» se encola un email a su
-- propio email, con el botón para entrar. Sale por la cola de emails de la base de datos
-- (la misma de los demás avisos), una sola vez por cuenta.

-- 1. Tipo de email nuevo ---------------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. El email, al confirmar el alta ------------------------------------------------------
create or replace function public.fn_usuarios_email_cuenta_activada()
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
  values ('cuenta_activada:' || new.id, 'cuenta_activada', new.email,
          'Tu cuenta de Dynamo ya está activa',
          format('<p>Hola%s:</p>'
                 || '<p>Hemos verificado tu alta%s. <strong>Tu cuenta ya está activa</strong>: ya puedes entrar en la plataforma.</p>'
                 || '<p><a href="%s/panel/entrar" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">Entrar en la plataforma</a></p>'
                 || '<p>Entras con tu email <strong>%s</strong> y la contraseña que elegiste al registrarte. Si no la recuerdas, pulsa «¿Olvidaste tu contraseña?» en esa misma pantalla.</p>'
                 || '<p>Si el botón no funciona, copia esta dirección en el navegador: %s/panel/entrar</p>'
                 || '<p>¿Dudas? Escríbenos a %s.</p>',
                 coalesce(' ' || escapar_html(v_nombre), ''),
                 coalesce(' en <strong>' || escapar_html(v_empresa) || '</strong>', ''),
                 v_base, escapar_html(new.email), v_base, escapar_html(email_dynamo())))
  on conflict (clave) do nothing;
  return null;
end $$;
revoke execute on function public.fn_usuarios_email_cuenta_activada() from public, anon, authenticated;
comment on function public.fn_usuarios_email_cuenta_activada() is '[Clientes y cuentas] Disparador interno: cuando Dynamo confirma un alta (la cuenta pasa de pendiente de verificación a activa), encola un email al propio usuario diciéndole que su cuenta ya está activa, con el enlace para entrar (parámetro url_plataforma + /panel/entrar). Una sola vez por cuenta (clave única). Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
create trigger tg_usuarios_email_cuenta_activada after update of estado on usuarios
  for each row when (old.estado = 'pendiente_verificacion' and new.estado = 'activa')
  execute function fn_usuarios_email_cuenta_activada();
