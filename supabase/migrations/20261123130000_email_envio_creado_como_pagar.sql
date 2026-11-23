-- EMAIL «ENVÍO CREADO» DE UN ENVÍO PENDIENTE DE PAGO: cómo pagar, botón y proforma adjunta
-- (usuario, 2026-11-23: «en el mail también podríamos poner el botón de pago tarjeta, o adjunta
-- PDF proforma de ese envío y en mail texto de: o paga con transferencia a los datos de la
-- proforma PDF adjunta, cuando esté avísanos para validar que el pago ha llegado a nuestra cuenta»).
--
-- El email lo sigue encolando la base de datos. Ahora dice CÓMO pagar y lleva el botón «Pagar el
-- envío» (a la ficha, donde están el pago con tarjeta, la proforma y «Ya he hecho la
-- transferencia»). El servidor web, justo al crear el envío, completa ese mismo email mientras
-- espera su plazo de salida (lib/servidor/emailEnvioCreado.ts): le adjunta la proforma en PDF y
-- rellena los dos huecos que deja este texto como comentarios:
--   <!--pago-tarjeta-->   · «con tarjeta … o», si el pago con tarjeta está conectado
--   <!--pago-proforma-->  · «, que va adjunta en PDF a este email», si se ha podido adjuntar
-- Si el servidor web no llega a hacerlo, el email sale igual y sigue siendo correcto: los huecos
-- son comentarios que no se ven.
--
-- Con el precio todavía PROVISIONAL la proforma no es pagadera: ni «cómo pagar» ni botón ni plazo.
create or replace function public.fn_email_envio_creado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare e record; v_limite timestamptz; v_provisional boolean; v_url text;
begin
  select id, estado, estado_pago_previo, pago_pendiente_en, pago_a_cuenta, fecha_carga_desde, estado_revision_precio
    into e from envios where id = new.envio_id;
  if e.id is null or e.estado in ('borrador', 'cancelado') then return null; end if;
  v_provisional := coalesce(precio_por_revisar(e.estado_revision_precio), false);
  -- Con el precio todavía provisional el plazo no ha empezado (se pide al revisarlo).
  if e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0
     and not v_provisional then
    v_limite := pago_limite(e.pago_pendiente_en, e.fecha_carga_desde);
  end if;
  v_url := coalesce(parametro('url_plataforma') #>> '{}', '') || '/panel/envios?ver=' || e.id;
  perform fn_email_envio_cliente(e.id, 'envio_creado:' || e.id, 'envio_creado', 'Envío creado',
    '<p>Tu envío ya está <strong>creado</strong>.</p>'
    || case when e.estado_pago_previo = 'pendiente' and v_provisional
            then '<p style="color:#b42318"><strong>Pendiente de pago: el envío queda en firme cuando recibamos el pago.</strong></p>'
              || '<p>El precio de este envío todavía es <strong>provisional</strong>: te avisaremos para pagarlo en cuanto quede fijado.</p>'
            when e.estado_pago_previo = 'pendiente'
            then '<p style="color:#b42318"><strong>Pendiente de pago: el envío queda en firme cuando recibamos el pago.</strong></p>'
              || '<p><strong>Cómo pagar:</strong><!--pago-tarjeta--> por <strong>transferencia</strong> a los datos de la proforma<!--pago-proforma-->'
              || ' (la tienes también en la ficha del envío). Cuando la hagas, avísanos con el botón «Ya he hecho la transferencia» de la ficha'
              || ' y validamos que el pago ha llegado a nuestra cuenta.</p>'
              || '<p><a href="' || v_url || '" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Pagar el envío</a></p>'
              || case when v_limite is not null
                      then '<p><strong>Plazo para pagar: hasta el ' || fecha_hora_texto(v_limite) || '.</strong> Si no nos llega el pago en ese plazo, '
                        || 'el envío y su proforma se anulan solos y tendrás que crear un envío nuevo, con el precio de ese momento.</p>'
                      else '' end
            else '' end);
  return null;
end $$;
