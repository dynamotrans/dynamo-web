-- NOTIFICACIONES (usuario, 2026-11-28): «una sección diferente a la de parámetros… todo lo que
-- sea notificaciones, con un botón de activar/desactivar, y cuando se activen, que venga marcado
-- email y WhatsApp, y que también se pueda desmarcar email y/o WhatsApp».
-- Una fila por cada notificación que manda la plataforma (el tipo de email), agrupadas por quién
-- la recibe. Cada una: activa sí/no y, activa, por email y/o por WhatsApp.
--   · Desactivada (o sin email), sus emails no salen: quedan en el registro como «omitidos».
--   · WhatsApp: cada mensaje necesita su plantilla aprobada por Meta; hasta entonces la casilla
--     se guarda pero no se usa (la pantalla lo dice: «pendiente de Meta»).
--   · Los códigos de seguridad (aceptar carga, firmar el CMR, accesos a la cuenta) no se pueden
--     apagar: salen siempre.
--   · Los avisos de la campana del panel no dependen de esto: salen siempre.

create table public.notificaciones (
  id uuid not null default gen_random_uuid() unique,
  tipo text primary key,
  grupo text not null check (grupo in ('cliente', 'transportista', 'sitios', 'cuentas', 'dynamo', 'seguridad')),
  orden smallint not null default 100,
  titulo text not null,
  descripcion text,
  bloqueada boolean not null default false,
  activa boolean not null default true,
  email boolean not null default true,
  whatsapp boolean not null default true,
  whatsapp_plantilla text,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  modificado_en timestamptz,
  modificado_por uuid
);
comment on table public.notificaciones is 'Las notificaciones (emails y WhatsApp) que manda la plataforma, una por tipo de email, con su interruptor y sus canales. Desactivada o sin email, sus emails no salen (quedan «omitidos»). Las de seguridad no se pueden apagar. La pantalla Notificaciones del panel de Dynamo; la cambia el Admin Master.';
comment on column public.notificaciones.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador (para la auditoría).';
comment on column public.notificaciones.tipo is 'formato: texto | rango: no aplica | lista: los tipos de emails_enviados | obligatorio | Tipo de email que gobierna esta fila. Ej. OK: envio_creado · Ej. mal: Envío creado';
comment on column public.notificaciones.grupo is 'formato: lista | rango: no aplica | lista: cliente, transportista, sitios, cuentas, dynamo, seguridad | obligatorio | A quién le llega (para agruparlas en la pantalla). Ej. OK: cliente · Ej. mal: clientes';
comment on column public.notificaciones.orden is 'formato: número entero | rango: 0 o más | lista: no aplica | obligatorio | Orden dentro de su grupo en la pantalla. Ej. OK: 10 · Ej. mal: -1';
comment on column public.notificaciones.titulo is 'formato: texto | rango: hasta 120 caracteres | lista: no aplica | obligatorio | Nombre que se ve en la pantalla. Ej. OK: Envío creado · Ej. mal: envio_creado';
comment on column public.notificaciones.descripcion is 'formato: texto | rango: hasta 400 caracteres | lista: no aplica | opcional | Cuándo sale y a quién, en una frase. Ej. OK: Al crear un envío, al cliente y a su contabilidad. · Ej. mal: vacío en una nueva';
comment on column public.notificaciones.bloqueada is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio | Código o aviso de seguridad: no se puede apagar. Ej. OK: true en codigo_firma · Ej. mal: true en envio_creado';
comment on column public.notificaciones.activa is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio | Si la notificación sale. Desactivada, no sale ni por email ni por WhatsApp. Ej. OK: true · Ej. mal: vacío';
comment on column public.notificaciones.email is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio | Si sale por email (estando activa). Ej. OK: true · Ej. mal: vacío';
comment on column public.notificaciones.whatsapp is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio | Si sale por WhatsApp (estando activa y con plantilla aprobada por Meta). Ej. OK: true · Ej. mal: vacío';
comment on column public.notificaciones.whatsapp_plantilla is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Nombre de la plantilla aprobada por Meta para mandarla por WhatsApp. Vacío = pendiente de Meta (solo email). Ej. OK: codigo_verificacion · Ej. mal: un texto inventado';
comment on column public.notificaciones.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Alta de la fila.';
comment on column public.notificaciones.creado_por is 'formato: uuid | rango: no aplica | lista: usuarios.id | automático | Quién la dio de alta (vacío: la migración).';
comment on column public.notificaciones.modificado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último cambio.';
comment on column public.notificaciones.modificado_por is 'formato: uuid | rango: no aplica | lista: usuarios.id | automático | Quién la cambió por última vez.';

insert into public.notificaciones (tipo, grupo, orden, titulo, descripcion, bloqueada, whatsapp_plantilla) values
  -- Al cliente
  ('envio_creado',         'cliente', 10, 'Envío creado', 'Al crear un envío (con el botón de pagar y la proforma si va con pago previo).', false, null),
  ('envio_modificado',     'cliente', 20, 'Envío modificado', 'Cuando cambian fechas, ruta, mercancía o precio de un envío.', false, null),
  ('envio_aceptado',       'cliente', 30, 'Camión asignado', 'Cuando un transportista acepta el envío.', false, null),
  ('envio_matriculas',     'cliente', 40, 'Matrículas asignadas', 'Cuando el transportista pone las matrículas del camión.', false, null),
  ('vispera',              'cliente', 50, 'Víspera de la carga', '«Mañana cargamos tu envío», el día antes de la carga.', false, null),
  ('documento_disponible', 'cliente', 60, 'Documento disponible', 'CMR firmado o albarán ya disponible en la plataforma.', false, null),
  ('sin_camion',           'cliente', 70, 'Sin camión · elige nueva fecha', 'Cuando pasa la fecha de carga sin camión: elegir otra fecha o cancelar sin coste.', false, null),
  ('envio_cancelado',      'cliente', 80, 'Envío cancelado', 'Al cancelarse un envío, con el motivo y el coste si lo hay.', false, null),
  ('envio_reactivado',     'cliente', 90, 'Envío reactivado', 'Cuando un envío cancelado vuelve a estar activo.', false, null),
  ('pago_avisado',         'cliente', 100, 'Transferencia avisada', 'Cuando el cliente avisa de una transferencia: «la estamos validando».', false, null),
  ('pago_devuelto',        'cliente', 110, 'Pago devuelto', 'Cuando se le devuelve un pago con tarjeta.', false, null),
  ('incidencia_abierta',   'cliente', 120, 'Incidencia abierta', 'Al abrir una incidencia (al cliente o al transportista al que afecta).', false, null),
  ('incidencia_resuelta',  'cliente', 130, 'Incidencia resuelta', 'Al resolver una incidencia, con la resolución.', false, null),
  ('incidencia_retirada',  'cliente', 140, 'Incidencia retirada', 'Al retirar una incidencia.', false, null),
  ('credito_aviso',        'cliente', 150, 'Crédito cerca del límite', 'Cuando el cliente se acerca o llega al límite de su línea de crédito.', false, null),
  ('credito_cambio',       'cliente', 160, 'Cambio en la línea de crédito', 'Crédito disponible, ampliado, reducido o retirado.', false, null),
  ('credito_bloqueo',      'cliente', 170, 'Crédito bloqueado por pagos tardíos', 'Cuando se bloquea el crédito por facturas pagadas tarde.', false, null),
  ('empresa_verificada',   'cliente', 180, 'Empresa verificada', 'Cuando su empresa queda verificada.', false, null),
  ('verificacion_rechazada', 'cliente', 190, 'Verificación rechazada', 'Cuando no se ha podido verificar su empresa.', false, null),
  ('proforma_calculo',     'cliente', 200, 'Precio calculado (proforma)', 'El cálculo de precio que el equipo manda a mano desde Nuevo envío.', false, null),
  -- Al transportista
  ('orden_carga',          'transportista', 10, 'Orden de carga', 'Al asignarle un envío, con la orden de carga en PDF.', false, null),
  ('matriculas',           'transportista', 20, 'Faltan las matrículas', 'Recordatorio urgente si faltan las matrículas antes de la carga.', false, null),
  ('transportista_modificado', 'transportista', 30, 'Envío modificado', 'Cuando cambia un envío que tiene asignado.', false, null),
  ('transportista_cancelado',  'transportista', 40, 'Envío cancelado', 'Cuando se cancela un envío que tiene asignado.', false, null),
  ('transportista_retirado',   'transportista', 50, 'Envío retirado', 'Cuando se le retira un envío asignado.', false, null),
  ('transportista_suspendido', 'transportista', 60, 'Cuenta suspendida', 'Cuando se suspende su cuenta.', false, null),
  ('difusion',             'transportista', 70, 'Ofertas de carga', 'Los emails de la difusión de cargas a transportistas.', false, null),
  ('difusion_recordatorio','transportista', 80, 'Recordatorio de oferta', '«La carga sigue disponible», una vez al día.', false, null),
  ('difusion_fin',         'transportista', 90, 'Oferta cerrada', 'Cuando una carga ofrecida ya no está disponible.', false, null),
  ('deca',                 'transportista', 100, 'DeCA actualizado', 'El documento de control (DeCA) cada vez que cambia.', false, null),
  -- A los sitios (carga y descarga)
  ('aviso_parada',         'sitios', 10, 'Aviso de recogida o entrega', 'Al sitio, con el día previsto de la recogida o la entrega.', false, null),
  ('aviso_parada_cancelada', 'sitios', 20, 'Recogida o entrega cancelada', 'Al sitio, si se cancela su recogida o entrega.', false, null),
  ('aviso_entrega',        'sitios', 30, 'Entrega realizada', 'Al destinatario, cuando se entrega la mercancía.', false, null),
  ('resumen_sitio',        'sitios', 40, 'Resumen del sitio', 'Resumen de las cargas y entregas previstas en el sitio.', false, null),
  ('firma_cmr',            'sitios', 50, 'Copia del CMR firmado', 'A quien firma el CMR digital, con su copia.', false, null),
  ('cmr_completo',         'sitios', 60, 'CMR completo', 'Cuando el CMR tiene todas las firmas.', false, null),
  -- Cuentas de usuario
  ('cuenta_activada',      'cuentas', 10, 'Cuenta activada', 'Cuando se activa una cuenta nueva.', false, null),
  ('cuenta_reactivada',    'cuentas', 20, 'Cuenta reactivada', 'Cuando una cuenta suspendida vuelve a estar activa.', false, null),
  ('cuenta_suspendida',    'cuentas', 30, 'Cuenta suspendida', 'Cuando se suspende una cuenta.', false, null),
  ('baja_solicitada',      'cuentas', 40, 'Baja solicitada', 'Cuando un usuario pide la baja de su cuenta.', false, null),
  ('cambio_email',         'cuentas', 50, 'Cambio de email', 'Cuando cambia el email de una cuenta.', false, null),
  -- Al equipo de Dynamo
  ('alta_pendiente',       'dynamo', 10, 'Alta pendiente de revisar', 'Cuando alguien se registra y hay que revisarlo.', false, null),
  ('pago_avisado_dynamo',  'dynamo', 20, 'Transferencia avisada por un cliente', 'Cuando un cliente avisa de que ha hecho una transferencia.', false, null),
  ('control_facturacion',  'dynamo', 30, 'Control de pedidos', 'Resumen de envíos a los que les falta un pedido de venta o de compra.', false, null),
  ('api_limite',           'dynamo', 40, 'Límite de la API', 'Cuando una conexión con otro servicio se acerca a su límite.', false, null),
  ('autorrelleno_saldo',   'dynamo', 50, 'Saldo del autorrelleno de empresas', 'Cuando queda poco saldo en el servicio de datos de empresas.', false, null),
  -- Seguridad (no se pueden apagar)
  ('codigo_aceptar_carga', 'seguridad', 10, 'Código para aceptar una carga', 'El código de 4 cifras al transportista que acepta una carga por su CIF.', true, 'whatsapp_plantilla_codigo'),
  ('codigo_firma',         'seguridad', 20, 'Código para firmar el CMR', 'El código de 6 cifras a quien firma el CMR digital.', true, null),
  ('acceso_nuevo',         'seguridad', 30, 'Acceso desde un dispositivo nuevo', 'Aviso de entrada a la cuenta desde un dispositivo nuevo.', true, null),
  ('acceso_no_he_sido_yo', 'seguridad', 40, '«No he sido yo»', 'Cuando alguien avisa de un acceso que no reconoce.', true, null)
on conflict (tipo) do nothing;

alter table public.notificaciones enable row level security;
create policy notificaciones_ve_todo on public.notificaciones for select using ((select ve_todo()));
create policy notificaciones_cambio on public.notificaciones for update using ((select es_admin_master())) with check ((select es_admin_master()));
revoke all on public.notificaciones from anon;
grant select, update on public.notificaciones to authenticated;
create trigger tg_mantenimiento before insert or update or delete on public.notificaciones
  for each row execute function public.fn_bloqueo_mantenimiento();
create trigger tg_sellar_notificaciones before insert or update on public.notificaciones
  for each row execute function public.fn_sellar();
create trigger tg_auditar_notificaciones after insert or update or delete on public.notificaciones
  for each row execute function public.fn_auditar();

-- Las de seguridad no se pueden apagar; y solo se cambian los interruptores, no lo demás.
create or replace function public.fn_notificaciones_guardia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.tipo, new.grupo, new.orden, new.titulo, new.descripcion, new.bloqueada, new.whatsapp_plantilla)
     is distinct from (old.tipo, old.grupo, old.orden, old.titulo, old.descripcion, old.bloqueada, old.whatsapp_plantilla) then
    if not (es_servidor() or es_consola_supabase()) then
      raise exception 'Desde la pantalla solo se cambian «Activa», «Email» y «WhatsApp».' using errcode = '42501';
    end if;
  end if;
  if old.bloqueada and (not new.activa or not new.email or not new.whatsapp) then
    raise exception 'Es un aviso de seguridad: no se puede desactivar.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_notificaciones_guardia() from public, anon, authenticated;
comment on function public.fn_notificaciones_guardia() is '[Gestión interna] Disparador de notificaciones: desde la pantalla solo se cambian los interruptores (activa, email, WhatsApp), y los avisos de seguridad no se pueden apagar. Quién: nadie la llama; la ejecuta la base de datos.';
create trigger tg_notificaciones_guardia before update on public.notificaciones
  for each row execute function public.fn_notificaciones_guardia();

-- ---- El filtro: un email de una notificación apagada no sale ----------------------------------
create or replace function public.fn_emails_notificacion_apagada()
returns trigger language plpgsql security definer set search_path = public as $$
declare n record;
begin
  if new.estado <> 'pendiente' then return new; end if;
  select activa, email, bloqueada into n from notificaciones where tipo = new.tipo;
  if found and not n.bloqueada and not (n.activa and n.email) then
    new.estado := 'omitido';
    new.error := case when not n.activa then 'Notificación desactivada en Notificaciones.' else 'Email desactivado para esta notificación (Notificaciones).' end;
  end if;
  return new;
end $$;
revoke execute on function public.fn_emails_notificacion_apagada() from public, anon, authenticated;
comment on function public.fn_emails_notificacion_apagada() is '[Gestión interna] Disparador de emails_enviados: si la notificación de ese tipo está desactivada, o sin email, en la pantalla Notificaciones, el email no sale (queda «omitido» con el motivo). Las de seguridad salen siempre. Quién: nadie la llama; la ejecuta la base de datos.';
drop trigger if exists tg_emails_notificacion_apagada on public.emails_enviados;
create trigger tg_emails_notificacion_apagada before insert on public.emails_enviados
  for each row execute function public.fn_emails_notificacion_apagada();
