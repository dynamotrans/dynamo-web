-- COBRO AUTOMÁTICO DE PROFORMAS Y VERIFICACIÓN DE REGALO (usuario, 2026-11-27). La plataforma lee
-- (SOLO LECTURA) los movimientos pendientes de la cuenta PRINCIPAL de Dynamo en la facturación (la
-- del IBAN de las proformas, parámetro dynamo_iban). No concilia nada. Dos cosas SEPARADAS:
--   · VERIFICAR LA EMPRESA: «con que cumpla el número de la proforma, que es en cierto modo
--     aleatorio, y el 60 % de la razón social; el importe no lo metería». Proforma (PRO-GX…, GX… o
--     sus cifras) de UN envío + ordenante parecido (60 %, abreviaturas) → verificada, sea cual sea
--     el importe y esté como esté el envío (es dinero desde una cuenta a nombre de la empresa).
--   · DAR EL ENVÍO POR PAGADO (dinero): solo si espera el pago y llega lo pendiente o más (si llega
--     de más, aviso para devolver la diferencia). Si llega menos, NO se da por pagado: aviso.
--   · SIN PAGOS DUPLICADOS («si ya la anoté a mano como pagada… que no apunte otro pago encima»):
--     cada movimiento se mira una sola vez, y un envío que ya está pagado nunca se vuelve a pagar.
--     Si Dynamo lo anotó a mano por transferencia y este es el primer movimiento que llega de esa
--     proforma, se entiende que es ese mismo pago: se apunta como «ya anotado», sin aviso. Si el
--     envío ya tenía otro movimiento suyo o se pagó con tarjeta, es un pago de más: aviso urgente.
--   · Varias proformas en una transferencia, o envío anulado → solo aviso a Dynamo.
-- CONEXIÓN DEL BANCO (usuario, 2026-11-27: «hazlo con las dos cuentas»): si la cuenta principal
-- lleva más de 4 días sin traer ningún movimiento, o cualquiera de las dos lleva más de 2 días sin
-- actualizarse (si la facturación da esa fecha), o un céntimo avisado hace más de 24 h no aparece,
-- se avisa a Dynamo (una vez al día) para revisar la conexión del banco en la facturación.

-- ---- Movimientos de la cuenta principal ya mirados (cada uno una vez; también registro) ------
create table public.pago_movimientos (
  movimiento_id text primary key,
  envio_id uuid references public.envios(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  resultado text not null check (resultado in ('pagado', 'pagado_de_mas', 'importe_menor', 'ya_anotado', 'ya_pagado', 'varias', 'anulado', 'sin_proforma')),
  verifica boolean not null default false,
  importe numeric(12,2),
  fecha timestamptz,
  descripcion text,
  procesado_en timestamptz not null default now()
);
create index ix_pago_movimientos_envio on public.pago_movimientos (envio_id);
create index ix_pago_movimientos_cliente on public.pago_movimientos (cliente_id);
alter table public.pago_movimientos enable row level security;
create policy pago_movimientos_dynamo on public.pago_movimientos for select using ((select ve_todo()));
revoke all on public.pago_movimientos from anon;
create trigger tg_mantenimiento before insert or update or delete on public.pago_movimientos
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.pago_movimientos is 'Movimientos de la cuenta principal de Dynamo (la de las proformas) ya mirados, cada uno una vez, y qué se hizo con el pago (envío pagado, pagado de más, llega menos, ya anotado a mano, pago de más de un envío ya pagado, varias proformas, envío anulado o proforma desconocida) y si verificó la empresa. Lo escribe el servidor.';
comment on column public.pago_movimientos.movimiento_id is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Identificador del movimiento en la facturación.';
comment on column public.pago_movimientos.envio_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Envío de la proforma que llevaba el concepto.';
comment on column public.pago_movimientos.cliente_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Cliente de ese envío.';
comment on column public.pago_movimientos.resultado is 'formato: lista | rango: no aplica | lista: pagado, pagado_de_mas, importe_menor, ya_anotado, ya_pagado, varias, anulado, sin_proforma | obligatorio | Qué se hizo con el pago.';
comment on column public.pago_movimientos.verifica is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | automático | Si este movimiento verificó la empresa (proforma + ordenante parecido).';
comment on column public.pago_movimientos.importe is 'formato: número decimal (2 decimales) | rango: no aplica | lista: no aplica | opcional | Importe del movimiento, en euros.';
comment on column public.pago_movimientos.fecha is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Fecha del movimiento en el banco.';
comment on column public.pago_movimientos.descripcion is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Descripción del banco (ordenante y concepto).';
comment on column public.pago_movimientos.procesado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Cuándo se miró.';

-- ---- Estado de la conexión de las dos cuentas del banco ----------------------------------
create table public.banco_cuentas_estado (
  cuenta text primary key check (cuenta in ('principal', 'verificacion')),
  cuenta_id text,
  revisado_en timestamptz,
  ultimo_error text,
  ultimo_movimiento date,
  sincronizado_en timestamptz,
  aviso_en date
);
insert into public.banco_cuentas_estado (cuenta) values ('principal'), ('verificacion');
alter table public.banco_cuentas_estado enable row level security;
create policy banco_cuentas_estado_dynamo on public.banco_cuentas_estado for select using ((select ve_todo()));
revoke all on public.banco_cuentas_estado from anon;
create trigger tg_mantenimiento before insert or update or delete on public.banco_cuentas_estado
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.banco_cuentas_estado is 'Las dos cuentas del banco de Dynamo que lee la plataforma en la facturación (principal: proformas; verificacion: céntimos): su identificador allí, última lectura y fallo, fecha del último movimiento, última actualización del banco (si la da la facturación) y último aviso de conexión. La escribe el servidor.';
comment on column public.banco_cuentas_estado.cuenta is 'formato: lista | rango: no aplica | lista: principal, verificacion | obligatorio | Qué cuenta es.';
comment on column public.banco_cuentas_estado.cuenta_id is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Identificador de la cuenta en la facturación (se busca por el IBAN).';
comment on column public.banco_cuentas_estado.revisado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Última lectura de sus movimientos.';
comment on column public.banco_cuentas_estado.ultimo_error is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Último fallo al leer (vacío si fue bien).';
comment on column public.banco_cuentas_estado.ultimo_movimiento is 'formato: fecha | rango: no aplica | lista: no aplica | opcional | Fecha del movimiento más reciente que ha traído el banco.';
comment on column public.banco_cuentas_estado.sincronizado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Última actualización de la cuenta con el banco, si la facturación la da.';
comment on column public.banco_cuentas_estado.aviso_en is 'formato: fecha | rango: no aplica | lista: no aplica | opcional | Último día en que se avisó a Dynamo de un problema de conexión (uno al día como mucho).';

-- ---- Un movimiento de la cuenta principal ----------------------------------------------
create or replace function public.pago_por_movimiento(p_movimiento text, p_descripcion text, p_importe numeric, p_fecha timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare v_desc text := left(btrim(coalesce(p_descripcion, '')), 300); v_refs text[]; v_n int; e record; c record; v_envio uuid; v_cliente uuid;
  v_res text; v_verifica boolean := false; t numeric; v_imp numeric := round(coalesce(p_importe, 0), 2); v_motivo text; v_banco text;
  v_dia date := (coalesce(p_fecha, now()) at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if exists (select 1 from pago_movimientos where movimiento_id = p_movimiento) then return 'repetido'; end if;
  -- Las referencias del concepto: «PRO-GX102345620», «GX 102345620» o solo «102345620».
  select coalesce(array_agg(distinct 'GX' || m[1]), '{}') into v_refs
    from regexp_matches(upper(v_desc), '(?:^|[^0-9])(?:GX[\s\-_.]?)?([0-9]{6,12})(?=[^0-9]|$)', 'g') m;
  select count(*) into v_n from envios where referencia_gx = any(v_refs);
  if v_n = 0 then
    v_res := 'sin_proforma';
  elsif v_n > 1 then
    v_res := 'varias';
    perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'aviso', 'Transferencia con varias proformas',
      format('Ha llegado %s con varias proformas en el concepto («%s»): valídalas a mano en cada envío.', euros_texto(v_imp), v_desc), '/panel/envios', null);
  else
    select * into e from envios where referencia_gx = any(v_refs) for update;
    select * into c from clientes where id = e.cliente_id for update;
    v_envio := e.id; v_cliente := e.cliente_id;

    -- 1) VERIFICAR LA EMPRESA: proforma + ordenante parecido, sin mirar el importe.
    if c.estado_verificacion <> 'verificada' and v_imp > 0 and ordenante_cuadra(c.razon_social, v_desc) then
      v_verifica := true;
      v_motivo := format('Automática: pago de la proforma PRO-%s (movimiento del %s: «%s»)', e.referencia_gx, to_char(v_dia, 'DD/MM/YYYY'), v_desc);
      perform set_config('dynamo.verificacion', 'on', true);
      update clientes set estado_verificacion = 'verificada', metodo_verificacion = 'transferencia', verificada_por = null,
             verificada_en = now(), verificacion_motivo = v_motivo, verificacion_solicitada = null, verificacion_solicitada_en = null
       where id = c.id;
      perform set_config('dynamo.verificacion', '', true);
      insert into verificaciones_empresa (cliente_id, accion, metodo, motivo) values (c.id, 'verificada', 'transferencia', v_motivo);
      if coalesce((select riesgo_efectivo_euros from clientes where id = c.id), 0) <= 0 then
        perform fn_email_credito(c.id, 'empresa_verificada:' || c.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'),
          'empresa_verificada', 'Empresa verificada · Dynamo', '<p>Hemos recibido el pago de tu proforma desde la cuenta de tu empresa: tu empresa ya está <strong>verificada</strong> en la plataforma de Dynamo.</p>');
      end if;
    end if;

    -- 2) EL PAGO DEL ENVÍO (dinero), sin duplicar nunca.
    if e.estado = 'cancelado' then
      v_res := 'anulado';
      perform crear_aviso('dynamo', null, null, 'pago_anulado', 'urgente', 'Transferencia de un envío anulado · #' || e.referencia_gx,
        format('Ha llegado %s con la proforma PRO-%s y el envío está anulado: devuélvela o reactiva el envío si el cliente aún lo quiere.', euros_texto(v_imp), e.referencia_gx), '/panel/envios?ver=' || e.id, e.id);
    elsif e.estado_pago_previo <> 'pendiente' then
      if e.estado_pago_previo = 'pagado' and e.pago_metodo = 'transferencia'
         and not exists (select 1 from pago_movimientos m where m.envio_id = e.id and m.resultado in ('pagado', 'pagado_de_mas', 'ya_anotado')) then
        -- Lo anotó Dynamo a mano y es el primer movimiento de esa proforma: es ese mismo pago.
        v_res := 'ya_anotado';
      else
        v_res := 'ya_pagado';
        perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'urgente', 'Posible pago de más · #' || e.referencia_gx,
          format('Ha llegado %s con la proforma PRO-%s y el envío ya estaba %s%s. No se ha apuntado otro pago: revisa si hay que devolverlo.', euros_texto(v_imp), e.referencia_gx,
                 replace(e.estado_pago_previo::text, '_', ' '), case when e.pago_metodo = 'stripe' then ' con tarjeta' else '' end), '/panel/envios?ver=' || e.id, e.id);
      end if;
    elsif e.estado <> 'programado' then
      v_res := 'ya_pagado';
      perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'aviso', 'Transferencia de un envío sin pago pendiente · #' || e.referencia_gx,
        format('Ha llegado %s con la proforma PRO-%s: valídala a mano en la ficha.', euros_texto(v_imp), e.referencia_gx), '/panel/envios?ver=' || e.id, e.id);
    else
      t := round(pago_envio_pendiente(e.id), 2);
      if v_imp < t then
        v_res := 'importe_menor';
        perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'aviso', 'Transferencia por menos importe · #' || e.referencia_gx,
          format('Ha llegado %s con la proforma PRO-%s y el envío espera %s: no se da por pagado. Si es correcto, dalo por pagado en la ficha.', euros_texto(v_imp), e.referencia_gx, euros_texto(t)), '/panel/envios?ver=' || e.id, e.id);
      else
        v_res := case when v_imp > t then 'pagado_de_mas' else 'pagado' end;
        v_banco := left(coalesce((select valor #>> '{}' from parametros where clave = 'dynamo_banco'), 'Banco'), 60);
        update envios set estado_pago_previo = 'pagado', pago_metodo = 'transferencia', pagado_en = now(), pago_resuelto_por = null,
               pago_banco = v_banco, pago_concepto = left(v_desc, 200), pago_fecha = least(v_dia, (now() at time zone 'Europe/Madrid')::date)
         where id = e.id;
        if v_imp > t then
          perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'aviso', 'Transferencia de más · #' || e.referencia_gx,
            format('Ha llegado %s con la proforma PRO-%s y el envío esperaba %s: queda pagado; revisa si hay que devolver la diferencia (%s).', euros_texto(v_imp), e.referencia_gx, euros_texto(t), euros_texto(v_imp - t)), '/panel/envios?ver=' || e.id, e.id);
        end if;
      end if;
    end if;

    -- Pagado (o con dinero) pero el ordenante no se parece y la empresa sigue sin verificar: aviso.
    if not v_verifica and c.estado_verificacion <> 'verificada' and v_res in ('pagado', 'pagado_de_mas', 'ya_anotado') then
      perform crear_aviso('dynamo', null, null, 'verificacion_empresa', 'aviso', 'Pago de proforma de otro ordenante · ' || c.razon_social,
        format('El envío #%s está pagado, pero el ordenante no se parece a la razón social («%s»): la empresa sigue sin verificar.', e.referencia_gx, v_desc), '/panel/clientes?ver=' || c.id, e.id);
    end if;
  end if;
  insert into pago_movimientos (movimiento_id, envio_id, cliente_id, resultado, verifica, importe, fecha, descripcion)
  values (p_movimiento, v_envio, v_cliente, v_res, v_verifica, p_importe, p_fecha, v_desc);
  return v_res || case when v_verifica then '+verificada' else '' end;
end $$;
revoke execute on function public.pago_por_movimiento(text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.pago_por_movimiento(text, text, numeric, timestamptz) to service_role;
comment on function public.pago_por_movimiento(text, text, numeric, timestamptz) is '[Precio y pago] Mira un movimiento de la cuenta principal de Dynamo con la proforma de UN envío en el concepto. Verifica la empresa si el ordenante se parece a su razón social (sin mirar el importe). Da el envío por pagado solo si esperaba el pago y llega lo pendiente o más (de más: aviso); si llega menos, aviso. Nunca apunta un pago encima de otro: si ya estaba pagado a mano por transferencia y es el primer movimiento de esa proforma lo toma por ese mismo pago (ya_anotado); si no, aviso de pago de más. Cada movimiento se mira una vez. Devuelve pagado, pagado_de_mas, importe_menor, ya_anotado, ya_pagado, varias, anulado, sin_proforma o repetido (con +verificada si verificó). Quién: solo el servidor. Argumentos: p_movimiento: id del movimiento; p_descripcion: texto del banco; p_importe: importe; p_fecha: fecha.';

-- ---- Lo que se sabe de cada cuenta tras leerla, y el aviso si la conexión parece caída -------
create or replace function public.banco_cuenta_leida(p_cuenta text, p_cuenta_id text, p_error text, p_ultimo_movimiento date, p_sincronizado timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare s record; v_hoy date := (now() at time zone 'Europe/Madrid')::date; v_fin text; v_motivo text;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update banco_cuentas_estado set cuenta_id = coalesce(p_cuenta_id, cuenta_id), revisado_en = now(), ultimo_error = p_error,
         ultimo_movimiento = greatest(ultimo_movimiento, p_ultimo_movimiento), sincronizado_en = coalesce(p_sincronizado, sincronizado_en)
   where cuenta = p_cuenta returning * into s;
  if not found then raise exception 'Cuenta no válida: %', p_cuenta; end if;
  if s.aviso_en = v_hoy then return 'ya_avisado'; end if;
  v_fin := right(regexp_replace(coalesce((select valor #>> '{}' from parametros
             where clave = case when p_cuenta = 'principal' then 'dynamo_iban' else 'dynamo_verificacion_iban' end), ''), '\s', '', 'g'), 4);
  if s.sincronizado_en is not null and s.sincronizado_en < now() - interval '2 days' then
    v_motivo := format('no se actualiza con el banco desde el %s', to_char(s.sincronizado_en at time zone 'Europe/Madrid', 'DD/MM/YYYY'));
  elsif p_cuenta = 'principal' and s.ultimo_movimiento is not null and s.ultimo_movimiento < v_hoy - 4 then
    v_motivo := format('no trae movimientos desde el %s', to_char(s.ultimo_movimiento, 'DD/MM/YYYY'));
  elsif p_cuenta = 'verificacion' and exists (
      select 1 from clientes c where c.estado_verificacion = 'no_verificada' and c.verificacion_solicitada = 'transferencia'
         and c.verificacion_solicitada_en < now() - interval '24 hours'
         and not exists (select 1 from verificacion_movimientos m where m.cliente_id = c.id and m.procesado_en >= c.verificacion_solicitada_en)) then
    v_motivo := 'tiene un céntimo avisado hace más de 24 horas que no aparece';
  end if;
  if v_motivo is null then return 'ok'; end if;
  update banco_cuentas_estado set aviso_en = v_hoy where cuenta = p_cuenta;
  perform crear_aviso('dynamo', null, null, 'banco_conexion', 'urgente',
    format('La cuenta %s (…%s) %s', case when p_cuenta = 'principal' then 'principal' else 'de verificación' end, v_fin, v_motivo),
    'Revisa la conexión del banco en la facturación (Tesorería): si se ha caído, los pagos de proformas y los céntimos de verificación no se aplican solos.', null, null);
  return 'avisado';
end $$;
revoke execute on function public.banco_cuenta_leida(text, text, text, date, timestamptz) from public, anon, authenticated;
grant execute on function public.banco_cuenta_leida(text, text, text, date, timestamptz) to service_role;
comment on function public.banco_cuenta_leida(text, text, text, date, timestamptz) is '[Precio y pago] El servidor apunta lo leído de una cuenta del banco en la facturación (identificador, fallo, último movimiento, última actualización) y, si la conexión parece caída, avisa a Dynamo una vez al día: principal sin movimientos más de 4 días, cualquiera sin actualizarse más de 2 días, o un céntimo avisado hace más de 24 h que no aparece. Devuelve ok, avisado o ya_avisado. Quién: solo el servidor. Argumentos: p_cuenta: principal o verificacion; p_cuenta_id: su id en la facturación; p_error: último fallo; p_ultimo_movimiento: fecha del más reciente; p_sincronizado: última actualización con el banco.';
