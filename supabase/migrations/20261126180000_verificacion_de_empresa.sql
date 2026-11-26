-- VERIFICACIÓN DE EMPRESA Y CRÉDITO (usuario, 2026-11-26).
--
-- La verificación es de la EMPRESA (CIF), no del usuario: se hace una vez y la heredan todos sus
-- usuarios. Vías: transferencia de 0,01 € con un código único en el concepto, documento (tarjeta
-- del CIF o similar) o a mano por Dynamo (llamada, cliente conocido…). El certificado digital,
-- más adelante. Las dos primeras las pide el cliente y las valida Dynamo.
--
-- CORTAFUEGOS: empresa sin verificar = crédito 0, da igual lo que diga CESCE o el crédito
-- manual de Dynamo. Se hace en la columna calculada riesgo_efectivo_euros, así todo lo que ya
-- usa el crédito (pago previo, crédito usado, avisos, riesgos) lo respeta sin tocar nada más.
-- Sin verificar se sigue pudiendo pedir envíos: con pago previo (tarjeta o transferencia).
--
-- CESCE: se guarda su resultado (positivo / cero / denegado) y cuándo se consultó; el importe
-- sigue en riesgo_cesce_euros. Nada de esto lo ve el cliente.
--
-- Empresas que ya existían: verificadas de oficio («cliente anterior»). Las que da de alta
-- Dynamo desde el panel nacen verificadas (las conoce quien las crea); las que se dan de alta
-- solas, sin verificar.

create type public.verificacion_empresa as enum ('no_verificada', 'verificada');
create type public.metodo_verificacion as enum ('transferencia', 'documento', 'manual', 'certificado');
create type public.resultado_cesce as enum ('sin_consultar', 'positivo', 'cero', 'denegado');
comment on type public.verificacion_empresa is 'Si la empresa está verificada (y puede trabajar a crédito) o no.';
comment on type public.metodo_verificacion is 'Cómo se verificó la empresa: transferencia de 0,01 €, documento revisado por Dynamo, a mano por Dynamo o certificado digital.';
comment on type public.resultado_cesce is 'Resultado de la consulta del CIF en CESCE: sin consultar, positivo (con importe), cero o denegado.';

alter table public.clientes
  add column estado_verificacion public.verificacion_empresa not null default 'no_verificada',
  add column metodo_verificacion public.metodo_verificacion,
  add column verificada_por uuid references public.usuarios(id) on delete set null,
  add column verificada_en timestamptz,
  add column verificacion_motivo text,
  add column verificacion_solicitada public.metodo_verificacion,
  add column verificacion_solicitada_en timestamptz,
  add column codigo_transferencia text,
  add column cesce_resultado public.resultado_cesce not null default 'sin_consultar',
  add column cesce_consultado_en timestamptz;
create unique index ux_clientes_codigo_transferencia on public.clientes (codigo_transferencia);

comment on column public.clientes.estado_verificacion is 'formato: lista | rango: no aplica | lista: no_verificada, verificada | automático | Si la empresa está verificada. Sin verificar, su crédito es 0 (pago previo siempre), tenga lo que tenga en CESCE o de Dynamo. La cambian solo las funciones de verificación.';
comment on column public.clientes.metodo_verificacion is 'formato: lista | rango: no aplica | lista: transferencia, documento, manual, certificado | opcional | Cómo se verificó la empresa (vacío si no está verificada).';
comment on column public.clientes.verificada_por is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Usuario de Dynamo que la verificó (vacío: de oficio o por el sistema).';
comment on column public.clientes.verificada_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Cuándo se verificó la empresa.';
comment on column public.clientes.verificacion_motivo is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Por qué se verificó (o se le quitó la verificación): qué se comprobó, llamada, documento…';
comment on column public.clientes.verificacion_solicitada is 'formato: lista | rango: no aplica | lista: transferencia, documento | opcional | Verificación que ha pedido el cliente y espera la revisión de Dynamo (vacío: ninguna pendiente).';
comment on column public.clientes.verificacion_solicitada_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Cuándo pidió el cliente esa verificación.';
comment on column public.clientes.codigo_transferencia is 'formato: texto (VER-XXXXXX) | rango: no aplica | lista: no aplica | automático | Código único de la empresa para el concepto de la transferencia de verificación de 0,01 €.';
comment on column public.clientes.cesce_resultado is 'formato: lista | rango: no aplica | lista: sin_consultar, positivo, cero, denegado | automático | Resultado de CESCE para el CIF (el importe está en riesgo_cesce_euros). Nunca lo ve el cliente.';
comment on column public.clientes.cesce_consultado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Última vez que se consultó (o cambió) el dato de CESCE.';
comment on column public.clientes.verificado is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | automático | Copia de estado_verificacion = verificada (se mantiene por compatibilidad; manda estado_verificacion).';
comment on column public.clientes.verificado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Copia de verificada_en (compatibilidad).';
comment on column public.clientes.verificado_nota is 'formato: texto | rango: no aplica | lista: no aplica | automático | Copia de verificacion_motivo (compatibilidad).';

-- ---- Código de la transferencia: VER- y 6 caracteres sin los que se confunden ------------
create or replace function public.codigo_verificacion_nuevo()
returns text language plpgsql volatile set search_path = public as $$
declare v text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := 'VER-' || (select string_agg(substr(abc, 1 + floor(random() * length(abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from clientes where codigo_transferencia = v);
  end loop;
  return v;
end $$;
revoke execute on function public.codigo_verificacion_nuevo() from public, anon;
grant execute on function public.codigo_verificacion_nuevo() to authenticated;   -- es el valor por defecto de la columna: quien inserta lo usa
comment on function public.codigo_verificacion_nuevo() is '[Gestión interna] Código nuevo y único (VER- y 6 caracteres sin O/0/I/1) para el concepto de la transferencia de verificación de una empresa. Quién: el disparador de clientes. Argumentos: sin argumentos.';

-- ---- Disparador: código, verificación protegida, copia de compatibilidad y CESCE ----------
create or replace function public.fn_clientes_verificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_libre boolean := coalesce(current_setting('dynamo.verificacion', true), '') = 'on' or es_consola_supabase();
begin
  if new.codigo_transferencia is null then new.codigo_transferencia := codigo_verificacion_nuevo(); end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('dynamo.alta_propia', true), '') = 'on' then
      -- La única vía en la que una empresa nace SIN VERIFICAR: se da de alta ella sola.
      new.estado_verificacion := 'no_verificada'; new.metodo_verificacion := null;
      new.verificada_por := null; new.verificada_en := null; new.verificacion_motivo := null;
      new.verificacion_solicitada := null; new.verificacion_solicitada_en := null;
    elsif coalesce(current_setting('dynamo.verificacion', true), '') <> 'on' then
      -- La da de alta Dynamo (panel, consola o sistema): la conoce quien la crea.
      new.estado_verificacion := 'verificada'; new.metodo_verificacion := 'manual';
      new.verificada_por := case when es_equipo_dynamo() then auth.uid() end; new.verificada_en := now();
      new.verificacion_motivo := 'Empresa dada de alta por Dynamo';
      new.verificacion_solicitada := null; new.verificacion_solicitada_en := null;
    end if;
  else
    new.codigo_transferencia := coalesce(old.codigo_transferencia, new.codigo_transferencia);
    if not v_libre and (new.estado_verificacion, new.metodo_verificacion, new.verificada_por, new.verificada_en,
                        new.verificacion_motivo, new.verificacion_solicitada, new.verificacion_solicitada_en, new.codigo_transferencia)
         is distinct from (old.estado_verificacion, old.metodo_verificacion, old.verificada_por, old.verificada_en,
                           old.verificacion_motivo, old.verificacion_solicitada, old.verificacion_solicitada_en, old.codigo_transferencia) then
      raise exception 'La verificación de la empresa solo se cambia con sus botones (verificar, quitar o pedir).' using errcode = '42501';
    end if;
  end if;
  -- CESCE: el resultado sigue al importe (salvo que se ponga a la vez, p. ej. «denegado»).
  if tg_op = 'INSERT' or new.riesgo_cesce_euros is distinct from old.riesgo_cesce_euros then
    if tg_op = 'INSERT' or new.cesce_resultado is not distinct from old.cesce_resultado then
      new.cesce_resultado := case when new.riesgo_cesce_euros is null then
                                    case when tg_op = 'INSERT' then new.cesce_resultado else 'sin_consultar' end
                                  when new.riesgo_cesce_euros > 0 then 'positivo'
                                  when tg_op = 'UPDATE' and old.cesce_resultado = 'denegado' then 'denegado'
                                  else 'cero' end;
    end if;
    if new.riesgo_cesce_euros is not null then new.cesce_consultado_en := coalesce(new.cesce_consultado_en, now()); end if;
    if tg_op = 'UPDATE' then new.cesce_consultado_en := now(); end if;
  end if;
  -- Copia de compatibilidad (las columnas antiguas; manda estado_verificacion).
  new.verificado := new.estado_verificacion = 'verificada';
  new.verificado_en := new.verificada_en;
  new.verificado_nota := new.verificacion_motivo;
  return new;
end $$;
revoke execute on function public.fn_clientes_verificacion() from public, anon, authenticated;
comment on function public.fn_clientes_verificacion() is '[Gestión interna] Disparador de clientes: pone el código de transferencia, protege la verificación (solo la cambian sus funciones), marca verificadas las empresas que da de alta Dynamo, sigue el resultado de CESCE al importe y copia el estado a las columnas antiguas. Quién: el disparador. Argumentos: sin argumentos.';
create trigger tg_clientes_verificacion before insert or update on public.clientes
  for each row execute function public.fn_clientes_verificacion();

-- ---- Empresas que ya existían: verificadas de oficio --------------------------------
do $$ begin
  perform set_config('dynamo.verificacion', 'on', true);
  update clientes set codigo_transferencia = codigo_verificacion_nuevo() where codigo_transferencia is null;
  update clientes set estado_verificacion = 'verificada', metodo_verificacion = 'manual',
         verificada_por = (select id from usuarios where rol = 'admin' order by creado_en limit 1),
         verificada_en = now(), verificacion_motivo = 'De oficio: cliente anterior a la verificación de empresa'
   where estado_verificacion = 'no_verificada';
  update clientes set cesce_resultado = (case when riesgo_cesce_euros > 0 then 'positivo' else 'cero' end)::resultado_cesce,
         cesce_consultado_en = coalesce(modificado_en, now())
   where riesgo_cesce_euros is not null;
  perform set_config('dynamo.verificacion', '', true);
end $$;
alter table public.clientes alter column codigo_transferencia set default public.codigo_verificacion_nuevo();
alter table public.clientes alter column codigo_transferencia set not null;

-- ---- CORTAFUEGOS: sin verificar, crédito 0 ------------------------------------------
alter table public.clientes drop column riesgo_efectivo_euros;
alter table public.clientes add column riesgo_efectivo_euros numeric(12,2)
  generated always as (case when estado_verificacion = 'verificada' then coalesce(riesgo_manual_euros, riesgo_cesce_euros) else 0 end) stored;
comment on column public.clientes.riesgo_efectivo_euros is 'formato: número decimal (2 decimales) | rango: no aplica | lista: no aplica | automático | Calculada: el crédito que limita al cliente, en euros. Empresa SIN VERIFICAR: 0 siempre. Verificada: el manual de Dynamo si está puesto (también si es 0: sin crédito); si está vacío, el de CESCE. Vacío = sin clasificar.';

-- Los disparadores del crédito también saltan al verificar o quitar la verificación.
drop trigger tg_clientes_email_credito on public.clientes;
create trigger tg_clientes_email_credito after update of riesgo_cesce_euros, riesgo_manual_euros, estado_verificacion on public.clientes
  for each row execute function public.fn_email_credito_cambio();
drop trigger tg_clientes_credito_libera_pagos on public.clientes;
create trigger tg_clientes_credito_libera_pagos after update of riesgo_cesce_euros, riesgo_manual_euros, estado_verificacion on public.clientes
  for each row execute function public.fn_clientes_credito_libera_pagos();

-- Emails del crédito: al verificar se dice; al quitar la verificación, texto propio.
do $$ declare d text := pg_get_functiondef('public.fn_email_credito_cambio()'::regprocedure); n text; begin
  n := replace(d, $q$  if a = n or (a <= 0 and n <= 0) then return null; end if;$q$,
$q$  -- Sin verificar ya no hay crédito (usuario, 2026-11-26): texto propio, sin hablar de CESCE.
  if new.estado_verificacion is distinct from old.estado_verificacion and new.estado_verificacion <> 'verificada' then
    if a > 0 then
      perform fn_email_credito(new.id, 'credito_cambio:' || new.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'), 'credito_cambio',
        'Línea de crédito en pausa · Dynamo',
        '<p>Tu empresa ha quedado <strong>pendiente de verificar</strong> y, mientras tanto, tu línea de crédito queda en pausa.</p><p>Los envíos nuevos se pagan <strong>por adelantado</strong>; los que ya están en curso no cambian. Para volver a trabajar a crédito, verifica tu empresa desde la plataforma o llámanos.</p>');
    end if;
    return null;
  end if;
  if a = n or (a <= 0 and n <= 0) then return null; end if;$q$);
  n := replace(n, $q$  perform fn_email_credito(new.id, 'credito_cambio:' || new.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'), 'credito_cambio',
    'Línea de crédito ' || v_que$q$,
$q$  if new.estado_verificacion = 'verificada' and old.estado_verificacion <> 'verificada' then
    v_cuerpo := '<p>Tu empresa ya está <strong>verificada</strong>.</p>' || v_cuerpo;
  end if;
  perform fn_email_credito(new.id, 'credito_cambio:' || new.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'), 'credito_cambio',
    'Línea de crédito ' || v_que$q$);
  if n = d or position('pendiente de verificar' in n) = 0 or position('ya está <strong>verificada' in n) = 0 then
    raise exception 'fn_email_credito_cambio no tiene el texto esperado';
  end if;
  execute n;
end $$;

-- Pago previo: el motivo dice que la empresa está sin verificar.
do $$ declare d text := pg_get_functiondef('public.pago_previo_motivo(uuid,uuid)'::regprocedure); n text; begin
  n := replace(d, $q$  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then$q$,
$q$  if (select estado_verificacion from clientes where id = p_cliente) <> 'verificada' then
    return 'Sin crédito: empresa sin verificar';
  end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then$q$);
  if n = d then raise exception 'pago_previo_motivo no tiene el texto esperado'; end if;
  execute n;
end $$;

-- Lo que ve el cliente de su crédito: sin verificar, «sin_verificar» (nunca si CESCE dijo que no).
do $$ declare d text := pg_get_functiondef('public.mi_cobertura_credito()'::regprocedure); n text; begin
  n := replace(d, $q$  select case
           when c.riesgo_efectivo_euros is null then 'sinclasif'$q$,
$q$  select case
           when c.estado_verificacion <> 'verificada' then 'sin_verificar'
           when c.riesgo_efectivo_euros is null then 'sinclasif'$q$);
  if n = d then raise exception 'mi_cobertura_credito no tiene el texto esperado'; end if;
  execute n;
end $$;
comment on function public.mi_cobertura_credito() is '[Crédito] El estado del crédito de la empresa de quien llama, sin importes: sin_verificar (empresa sin verificar: pago previo siempre), sinclasif, nulo, nulo_cesce, superado o disponible. Quién: cliente. Argumentos: sin argumentos.';

-- ---- Registro de solicitudes y validaciones -----------------------------------------
create table public.verificaciones_empresa (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  accion text not null check (accion in ('solicitud', 'verificada', 'rechazada', 'retirada')),
  metodo public.metodo_verificacion,
  usuario_id uuid references public.usuarios(id) on delete set null,
  motivo text,
  creado_en timestamptz not null default now()
);
create index ix_verificaciones_empresa_cliente on public.verificaciones_empresa (cliente_id, creado_en desc);
alter table public.verificaciones_empresa enable row level security;
create policy verificaciones_empresa_dynamo on public.verificaciones_empresa for select using ((select ve_todo()));
revoke all on public.verificaciones_empresa from anon;
create trigger tg_mantenimiento before insert or update or delete on public.verificaciones_empresa
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.verificaciones_empresa is 'Registro de la verificación de cada empresa: quién la pidió y por qué vía, quién la validó, rechazó o retiró, cuándo y con qué motivo. Solo lo escriben las funciones de verificación; lo lee Dynamo.';
comment on column public.verificaciones_empresa.id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | automático | Identificador del registro.';
comment on column public.verificaciones_empresa.cliente_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | obligatorio | Empresa (clientes.id).';
comment on column public.verificaciones_empresa.accion is 'formato: lista | rango: no aplica | lista: solicitud, verificada, rechazada, retirada | obligatorio | Qué pasó.';
comment on column public.verificaciones_empresa.metodo is 'formato: lista | rango: no aplica | lista: transferencia, documento, manual, certificado | opcional | Vía de verificación.';
comment on column public.verificaciones_empresa.usuario_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Quién lo hizo (usuario del cliente al pedirla; de Dynamo al validar).';
comment on column public.verificaciones_empresa.motivo is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Motivo o comprobación hecha.';
comment on column public.verificaciones_empresa.creado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Cuándo.';

-- ---- Lo que ve el cliente --------------------------------------------------------
create or replace function public.mi_empresa_verificacion()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'estado', c.estado_verificacion,
           'metodo', c.metodo_verificacion,
           'verificada_en', c.verificada_en,
           'solicitada', c.verificacion_solicitada,
           'solicitada_en', c.verificacion_solicitada_en,
           'codigo', c.codigo_transferencia,
           -- El aviso verde: sin verificar y con crédito esperándole (de CESCE o de Dynamo). Sin importes.
           'aviso_credito', c.estado_verificacion <> 'verificada' and coalesce(c.riesgo_manual_euros, c.riesgo_cesce_euros, 0) > 0,
           'razon_social', c.razon_social, 'cif', c.cif)
    from clientes c where c.id = cliente_del_usuario()
$$;
revoke execute on function public.mi_empresa_verificacion() from public, anon;
grant execute on function public.mi_empresa_verificacion() to authenticated;
comment on function public.mi_empresa_verificacion() is '[Clientes y cuentas] La verificación de la empresa de quien llama: estado, vía, la que tiene pedida, su código de transferencia, su razón social y CIF y si sale el aviso de crédito por activar (sin importes ni nada de CESCE). Quién: cliente. Argumentos: sin argumentos.';

create or replace function public.solicitar_verificacion_empresa(p_metodo text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cli uuid := cliente_del_usuario(); c record;
begin
  if v_cli is null or not exists (select 1 from usuarios where id = auth.uid() and estado = 'activa' and rol = 'cliente') then
    raise exception 'Solo un usuario activo de la empresa puede pedir su verificación.' using errcode = '42501';
  end if;
  if p_metodo not in ('transferencia', 'documento') then raise exception 'Vía de verificación no válida.'; end if;
  select * into c from clientes where id = v_cli for update;
  if c.estado_verificacion = 'verificada' then return 'ya_verificada'; end if;
  perform set_config('dynamo.verificacion', 'on', true);
  update clientes set verificacion_solicitada = p_metodo::metodo_verificacion, verificacion_solicitada_en = now() where id = v_cli;
  perform set_config('dynamo.verificacion', '', true);
  insert into verificaciones_empresa (cliente_id, accion, metodo, usuario_id) values (v_cli, 'solicitud', p_metodo::metodo_verificacion, auth.uid());
  perform crear_aviso('dynamo', null, null, 'verificacion_empresa', 'aviso',
    'Empresa por verificar · ' || c.razon_social,
    case when p_metodo = 'transferencia' then format('Dice que ha hecho la transferencia de 0,01 € con el concepto %s. Comprueba en el banco el concepto y que el ordenante sea %s.', c.codigo_transferencia, c.razon_social)
         else format('Ha subido un documento para verificar %s (%s). Revísalo en su ficha.', c.razon_social, c.cif) end,
    '/panel/altas', null);
  return 'ok';
end $$;
revoke execute on function public.solicitar_verificacion_empresa(text) from public, anon;
grant execute on function public.solicitar_verificacion_empresa(text) to authenticated;
comment on function public.solicitar_verificacion_empresa(text) is '[Clientes y cuentas] El cliente pide verificar su empresa: ha hecho la transferencia de 0,01 € con su código o ha subido el documento. Queda pendiente de que Dynamo lo revise (aviso en la campana). Devuelve ok o ya_verificada. Quién: usuario activo del cliente. Argumentos: p_metodo: transferencia o documento.';

-- ---- Lo que hace Dynamo ----------------------------------------------------------
create or replace function public.verificar_empresa(p_cliente uuid, p_metodo text, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo verifica empresas.' using errcode = '42501'; end if;
  if p_metodo not in ('transferencia', 'documento', 'manual', 'certificado') then raise exception 'Vía de verificación no válida.'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe qué has comprobado (el motivo).'; end if;
  select * into c from clientes where id = p_cliente for update;
  if not found then raise exception 'Empresa no encontrada.'; end if;
  if c.estado_verificacion = 'verificada' then return 'ya_verificada'; end if;
  perform set_config('dynamo.verificacion', 'on', true);
  update clientes set estado_verificacion = 'verificada', metodo_verificacion = p_metodo::metodo_verificacion,
         verificada_por = auth.uid(), verificada_en = now(), verificacion_motivo = btrim(p_motivo),
         verificacion_solicitada = null, verificacion_solicitada_en = null
   where id = p_cliente;
  perform set_config('dynamo.verificacion', '', true);
  insert into verificaciones_empresa (cliente_id, accion, metodo, usuario_id, motivo)
  values (p_cliente, 'verificada', p_metodo::metodo_verificacion, auth.uid(), btrim(p_motivo));
  -- Sin crédito que estrenar, el email del crédito no sale: se avisa aquí de la verificación.
  if coalesce((select riesgo_efectivo_euros from clientes where id = p_cliente), 0) <= 0 then
    perform fn_email_credito(p_cliente, 'empresa_verificada:' || p_cliente || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'),
      'empresa_verificada', 'Empresa verificada · Dynamo',
      '<p>Tu empresa ya está <strong>verificada</strong> en la plataforma de Dynamo.</p>');
  end if;
  return 'ok';
end $$;
revoke execute on function public.verificar_empresa(uuid, text, text) from public, anon;
grant execute on function public.verificar_empresa(uuid, text, text) to authenticated;
comment on function public.verificar_empresa(uuid, text, text) is '[Clientes y cuentas] Dynamo verifica una empresa (por transferencia, documento, a mano o certificado) con el motivo de lo comprobado: desde ese momento su crédito cuenta. Queda en el registro quién, cuándo y por qué. Devuelve ok o ya_verificada. Quién: admin o empleado de Dynamo. Argumentos: p_cliente: clientes.id; p_metodo: transferencia, documento, manual o certificado; p_motivo: qué se ha comprobado.';

create or replace function public.rechazar_verificacion_empresa(p_cliente uuid, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo revisa las verificaciones.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo.'; end if;
  select * into c from clientes where id = p_cliente for update;
  if not found or c.verificacion_solicitada is null then return 'sin_solicitud'; end if;
  perform set_config('dynamo.verificacion', 'on', true);
  update clientes set verificacion_solicitada = null, verificacion_solicitada_en = null where id = p_cliente;
  perform set_config('dynamo.verificacion', '', true);
  insert into verificaciones_empresa (cliente_id, accion, metodo, usuario_id, motivo)
  values (p_cliente, 'rechazada', c.verificacion_solicitada, auth.uid(), btrim(p_motivo));
  perform fn_email_credito(p_cliente, 'verificacion_rechazada:' || p_cliente || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'),
    'verificacion_rechazada', 'No hemos podido verificar tu empresa · Dynamo',
    '<p>No hemos podido verificar tu empresa con lo que nos has enviado.</p><p>Puedes probar otra vía desde la plataforma o llamarnos y lo vemos juntos. Mientras tanto sigues pudiendo pedir envíos con pago por adelantado.</p>');
  return 'ok';
end $$;
revoke execute on function public.rechazar_verificacion_empresa(uuid, text) from public, anon;
grant execute on function public.rechazar_verificacion_empresa(uuid, text) to authenticated;
comment on function public.rechazar_verificacion_empresa(uuid, text) is '[Clientes y cuentas] Dynamo rechaza la verificación que ha pedido una empresa (la transferencia no llega o no cuadra, el documento no vale…): se quita la petición, queda en el registro con el motivo y se avisa al cliente por email. Devuelve ok o sin_solicitud. Quién: admin o empleado de Dynamo. Argumentos: p_cliente: clientes.id; p_motivo: por qué.';

create or replace function public.quitar_verificacion_empresa(p_cliente uuid, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo quita la verificación.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo.'; end if;
  if not exists (select 1 from clientes where id = p_cliente and estado_verificacion = 'verificada') then return 'no_verificada'; end if;
  perform set_config('dynamo.verificacion', 'on', true);
  -- Los envíos ya programados a crédito se quedan como estaban (como en el bloqueo por pagos tardíos).
  perform set_config('dynamo.bloqueo_pagos', 'on', true);
  update clientes set estado_verificacion = 'no_verificada', metodo_verificacion = null, verificada_por = auth.uid(),
         verificada_en = null, verificacion_motivo = btrim(p_motivo)
   where id = p_cliente;
  perform set_config('dynamo.bloqueo_pagos', '', true);
  perform set_config('dynamo.verificacion', '', true);
  insert into verificaciones_empresa (cliente_id, accion, usuario_id, motivo) values (p_cliente, 'retirada', auth.uid(), btrim(p_motivo));
  return 'ok';
end $$;
revoke execute on function public.quitar_verificacion_empresa(uuid, text) from public, anon;
grant execute on function public.quitar_verificacion_empresa(uuid, text) to authenticated;
comment on function public.quitar_verificacion_empresa(uuid, text) is '[Clientes y cuentas] Dynamo quita la verificación de una empresa (con motivo): su crédito pasa a 0 al momento y los envíos nuevos van con pago previo; los ya programados se quedan como estaban. Queda en el registro. Devuelve ok o no_verificada. Quién: admin o empleado de Dynamo. Argumentos: p_cliente: clientes.id; p_motivo: por qué.';

-- ---- ALTA DE UNA EMPRESA NUEVA SIN ESPERAR A DYNAMO ---------------------------------
-- Quien se registra con un CIF que no existe entra al momento: se crea su empresa SIN
-- VERIFICAR (pago previo siempre) y su cuenta queda activa. Con un CIF que ya existe sigue
-- esperando a Dynamo en Altas pendientes (o a que un compañero le invite).
create or replace function public.alta_propia_en_curso(o usuarios, n usuarios)
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('dynamo.alta_propia', true), '') = 'on'
     and n.id = auth.uid() and o.id = n.id
     and o.estado = 'pendiente_verificacion' and n.estado = 'activa'
     and o.cliente_id is null and n.cliente_id is not null and o.transportista_id is null and n.transportista_id is null
     and o.rol = 'cliente' and n.rol = 'cliente'
     and (n.limite_consultas_precio_diario, n.limite_envios_diario, n.exento_autosuspension, n.autosuspension_desde_en,
          n.email, n.emails_copia_avisos, n.anotaciones)
         is not distinct from
         (o.limite_consultas_precio_diario, o.limite_envios_diario, o.exento_autosuspension, o.autosuspension_desde_en,
          o.email, o.emails_copia_avisos, o.anotaciones)
$$;
revoke execute on function public.alta_propia_en_curso(usuarios, usuarios) from public, anon, authenticated;
comment on function public.alta_propia_en_curso(usuarios, usuarios) is '[Gestión interna] Verdadero solo durante alta_crear_mi_empresa(): deja pasar a la propia cuenta de pendiente a activa con su empresa nueva, sin cambiar nada más. Quién: el disparador de usuarios. Argumentos: o, n: la fila antes y después.';

do $$ declare d text := pg_get_functiondef('public.fn_usuarios_campos_protegidos()'::regprocedure); n text; begin
  n := replace(d, 'or baja_propia_en_curso(old, new) then return new; end if;',
                  'or baja_propia_en_curso(old, new) or alta_propia_en_curso(old, new) then return new; end if;');
  if n = d then raise exception 'fn_usuarios_campos_protegidos no tiene el texto esperado'; end if;
  execute n;
end $$;

create or replace function public.alta_crear_mi_empresa()
returns text language plpgsql security definer set search_path = public as $$
declare u record; m jsonb; v_cif text; v_pais text; v_cli uuid; v_nombre text;
  t constant text[] := array['empresa', 'direccion', 'codigo_postal', 'poblacion', 'provincia'];
  k text;
begin
  select * into u from usuarios where id = auth.uid() for update;
  if not found or u.rol <> 'cliente' or u.estado <> 'pendiente_verificacion' or u.cliente_id is not null or u.transportista_id is not null then
    return 'no_aplica';
  end if;
  select raw_user_meta_data, email_confirmed_at is not null into m, k from auth.users where id = auth.uid();
  if k is distinct from 'true' then return 'email_sin_confirmar'; end if;
  if movil_pendiente_verificar(auth.uid()) then return 'movil_sin_verificar'; end if;
  if not registro_clientes_abierto() then return 'registro_cerrado'; end if;
  if coalesce(m ->> 'alta_paso', '') <> 'nueva' then return 'no_aplica'; end if;
  foreach k in array t loop
    if length(btrim(coalesce(m ->> k, ''))) = 0 then return 'faltan_datos'; end if;
  end loop;
  v_pais := upper(coalesce(nullif(m ->> 'pais', ''), 'ES'));
  v_cif := normalizar_id_fiscal(m ->> 'cif');
  if coalesce(v_cif, '') = '' then return 'faltan_datos'; end if;
  -- El CIF ya existe (alguien lo dio de alta mientras tanto): a esperar a Dynamo, como hoy.
  if exists (select 1 from clientes where normalizar_id_fiscal(cif) = v_cif) then return 'existente'; end if;
  if exists (select 1 from transportistas where normalizar_id_fiscal(cif) = v_cif) then return 'no_admitido'; end if;
  perform set_config('dynamo.alta_propia', 'on', true);   -- la empresa nace SIN VERIFICAR y la cuenta pasa a activa
  insert into clientes (razon_social, cif, pais_codigo_iso, direccion, codigo_postal, poblacion, provincia, estado)
  values (btrim(m ->> 'empresa'), v_cif, v_pais, btrim(m ->> 'direccion'), btrim(m ->> 'codigo_postal'),
          btrim(m ->> 'poblacion'), btrim(m ->> 'provincia'), 'activa')
  returning id into v_cli;
  update usuarios set cliente_id = v_cli, estado = 'activa' where id = u.id;
  perform set_config('dynamo.alta_propia', '', true);
  -- Sus contactos: quien se da de alta y, si son otros, el teléfono y el email de la empresa.
  v_nombre := coalesce(nullif(btrim(u.nombre), ''), split_part(u.email, '@', 1));
  insert into contactos (cliente_id, nombre, funcion, telefono, email, es_principal, usuario_id, recibe_avisos)
  values (v_cli, v_nombre, 'general', nullif(u.telefono, ''), u.email, true, u.id, true);
  if nullif(btrim(coalesce(m ->> 'empresa_email', '')), '') is not null and lower(btrim(m ->> 'empresa_email')) <> lower(u.email)
     or nullif(btrim(coalesce(m ->> 'empresa_telefono', '')), '') is not null and btrim(m ->> 'empresa_telefono') is distinct from u.telefono then
    insert into contactos (cliente_id, nombre, funcion, telefono, email, es_principal, recibe_avisos)
    values (v_cli, btrim(m ->> 'empresa'), 'general', nullif(btrim(coalesce(m ->> 'empresa_telefono', '')), ''),
            nullif(btrim(coalesce(m ->> 'empresa_email', '')), ''), false, false);
  end if;
  perform crear_aviso('dynamo', null, null, 'alta_cuenta', 'info', 'Empresa nueva dada de alta online · ' || btrim(m ->> 'empresa'),
    format('%s (%s) se ha dado de alta sola. Empresa SIN VERIFICAR: sus envíos van con pago previo hasta que la verifique.', btrim(m ->> 'empresa'), v_cif),
    '/panel/clientes?ver=' || v_cli, null);
  return 'ok:' || v_cli;
end $$;
revoke execute on function public.alta_crear_mi_empresa() from public, anon;
grant execute on function public.alta_crear_mi_empresa() to authenticated;
comment on function public.alta_crear_mi_empresa() is '[Clientes y cuentas] Alta de una empresa NUEVA sin esperar a Dynamo: con el email y el móvil verificados y los datos de la empresa puestos en su alta, crea la empresa SIN VERIFICAR (pago previo siempre), la une a su cuenta, la deja activa y avisa a Dynamo. Si el CIF ya existe devuelve existente (sigue esperando a Dynamo). Devuelve ok:<id del cliente>, existente, no_admitido, faltan_datos, email_sin_confirmar, movil_sin_verificar, registro_cerrado o no_aplica. Quién: el propio usuario en su alta. Argumentos: sin argumentos.';

-- ---- Los dos emails nuevos (empresa verificada sin crédito; verificación rechazada) ----------
do $$ declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['empresa_verificada', 'verificacion_rechazada']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;
