-- =====================================================================================
-- AVISO A LAS DOS DIRECCIONES CUANDO CAMBIA EL EMAIL DE ACCESO (usuario, 2026-11-16)
-- =====================================================================================
-- «Cuando se cambia el mail, ¿le llega mail al antiguo y al nuevo avisando del cambio?»
-- No llegaba nada: el cambio que hace Dynamo desde Usuarios es directo. Y cambiar el email
-- con el que entra alguien es justo lo que haría quien quisiera quedarse con una cuenta,
-- así que el dueño de la dirección de antes tiene que enterarse.
--
-- Desde hoy, al cambiar el email de una cuenta (lo cambie Dynamo desde Usuarios o el propio
-- usuario desde Mi cuenta) se encolan dos emails:
--   · a la dirección ANTIGUA: ya no sirve para entrar, cuál es la nueva y qué hacer si no
--     lo ha pedido;
--   · a la dirección NUEVA: desde ahora entra con ella, con el enlace al login.
-- La contraseña no cambia con el email, y los dos emails lo dicen.
-- No sale nada al anonimizar una cuenta (el «email nuevo» es uno inventado) ni a las
-- direcciones de prueba (.invalid).

-- 1. Tipo de email nuevo ---------------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) · cambio_email (a la dirección antigua y a la nueva, cuando cambia el email de acceso de una cuenta) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. Los dos emails ----------------------------------------------------------------------
create or replace function public.fn_usuarios_email_cambio_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base   text := rtrim(coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com'), '/');
  v_nombre text := nullif(trim(split_part(coalesce(new.nombre, ''), ' ', 1)), '');
  v_hola   text;
  v_marca  text := (extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
begin
  -- Anonimizar una cuenta le pone un email inventado: eso no es un cambio de email.
  if new.email like '%@anonimo.invalid' then return null; end if;
  v_hola := '<p>Hola' || coalesce(' ' || escapar_html(v_nombre), '') || ':</p>';

  if old.email is not null and old.email <> '' and old.email not like '%.invalid' then
    insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
    values ('cambio_email:' || new.id || ':' || v_marca || ':antiguo', 'cambio_email', old.email,
            'El email de acceso de tu cuenta de Dynamo ha cambiado',
            v_hola || format(
              '<p>El email con el que se entra en tu cuenta de Dynamo ha cambiado. Desde ahora se entra con <strong>%s</strong>.</p>'
              || '<p><strong>Esta dirección (%s) ya no sirve para entrar</strong> en la plataforma ni recibirá más avisos de ella. La contraseña no ha cambiado.</p>'
              || '<p><strong>¿No lo has pedido tú?</strong> Avísanos cuanto antes: escríbenos a %s o llámanos al %s y lo revisamos.</p>',
              escapar_html(new.email), escapar_html(old.email), escapar_html(email_dynamo()), escapar_html(tel_dynamo())))
    on conflict (clave) do nothing;
  end if;

  if new.email is not null and new.email <> '' and new.email not like '%.invalid' then
    insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
    values ('cambio_email:' || new.id || ':' || v_marca || ':nuevo', 'cambio_email', new.email,
            'Este es tu nuevo email de acceso a Dynamo',
            v_hola || format(
              '<p>Desde ahora <strong>entras en la plataforma de Dynamo con este email (%s)</strong> y con tu contraseña de siempre: la contraseña no ha cambiado. Los avisos te llegarán aquí.</p>'
              || '<p><a href="%s/panel/entrar" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">Entrar en la plataforma</a></p>'
              || '<p>El email anterior (%s) deja de servir para entrar. Si no recuerdas la contraseña, pulsa «¿Olvidaste tu contraseña?» en esa misma pantalla.</p>'
              || '<p>Si el botón no funciona, copia esta dirección en el navegador: %s/panel/entrar</p>'
              || '<p>¿Dudas? Escríbenos a %s.</p>',
              escapar_html(new.email), v_base, escapar_html(coalesce(old.email, '')), v_base, escapar_html(email_dynamo())))
    on conflict (clave) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.fn_usuarios_email_cambio_email() from public, anon, authenticated;
comment on function public.fn_usuarios_email_cambio_email() is '[Clientes y cuentas] Disparador interno: cuando cambia el email de acceso de una cuenta (lo cambie Dynamo desde Usuarios o el propio usuario desde Mi cuenta), encola dos emails: a la dirección antigua (ya no sirve para entrar, cuál es la nueva y qué hacer si no lo ha pedido) y a la nueva (desde ahora entra con ella, con el enlace al login). La contraseña no cambia. No sale nada al anonimizar una cuenta ni a direcciones de prueba (.invalid). Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
create trigger tg_usuarios_email_cambio_email after update of email on usuarios
  for each row when (lower(old.email) is distinct from lower(new.email))
  execute function fn_usuarios_email_cambio_email();
