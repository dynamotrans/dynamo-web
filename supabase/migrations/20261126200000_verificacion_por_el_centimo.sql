-- VERIFICACIÓN AUTOMÁTICA POR EL CÉNTIMO (usuario, 2026-11-26). Los 0,01 € de verificación van a
-- una cuenta SECUNDARIA de Dynamo (Banco Santander) conectada a la facturación. La plataforma lee
-- (solo lectura, una vez por hora) sus movimientos pendientes de conciliar y, si llega 0,01 €
-- con el código VER-XXXXXX de una empresa en el concepto y el ordenante se parece a su razón
-- social, la verifica sola. Si el nombre no cuadra, la deja «por verificar» con el movimiento
-- para que decida Dynamo. No concilia nada: el resto lo hace el usuario a mano.

-- La cuenta: dato aparte del IBAN de las proformas, blindado igual (solo se cambia en Supabase).
insert into parametros (clave, valor, descripcion) values
  ('dynamo_verificacion_iban', '"ES7100491837552110469743"', 'Verificación de empresa: IBAN de la cuenta secundaria de Dynamo donde los clientes hacen la transferencia de 0,01 € con su código. Lo ve el cliente en la ventana de verificación. Por seguridad solo se cambia en Supabase.'),
  ('dynamo_verificacion_banco', '"Banco Santander"', 'Verificación de empresa: banco de esa cuenta. Solo se cambia en Supabase.')
on conflict (clave) do nothing;

do $$ declare d text := pg_get_functiondef('public.fn_parametros_blindados()'::regprocedure); n text; begin
  n := replace(d, $q$'dynamo_razon_social', 'dynamo_cif')$q$, $q$'dynamo_razon_social', 'dynamo_cif', 'dynamo_verificacion_iban', 'dynamo_verificacion_banco')$q$);
  if n = d then raise exception 'fn_parametros_blindados no tiene el texto esperado'; end if;
  execute n;
end $$;

-- Estado de la revisión (una fila) y movimientos ya mirados (no se repiten; también registro).
create table public.verificacion_banco_estado (
  id boolean primary key default true check (id),
  cuenta_id text,
  revisado_en timestamptz,
  ultimo_error text
);
insert into public.verificacion_banco_estado (id) values (true);
alter table public.verificacion_banco_estado enable row level security;
create policy verificacion_banco_estado_dynamo on public.verificacion_banco_estado for select using ((select ve_todo()));
revoke all on public.verificacion_banco_estado from anon;
create trigger tg_mantenimiento before insert or update or delete on public.verificacion_banco_estado
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.verificacion_banco_estado is 'Una sola fila: cuándo se revisaron por última vez los movimientos de la cuenta de verificación en la facturación, su identificador allí y el último fallo. La escribe el servidor.';
comment on column public.verificacion_banco_estado.id is 'formato: sí/no (true/false) | rango: solo true | lista: no aplica | automático | Siempre true (una sola fila).';
comment on column public.verificacion_banco_estado.cuenta_id is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Identificador de la cuenta de verificación en la facturación (se busca por el IBAN).';
comment on column public.verificacion_banco_estado.revisado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Última revisión de los movimientos.';
comment on column public.verificacion_banco_estado.ultimo_error is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Último fallo al leer (vacío si fue bien).';

create table public.verificacion_movimientos (
  movimiento_id text primary key,
  cliente_id uuid references public.clientes(id) on delete set null,
  resultado text not null check (resultado in ('verificada', 'revisar', 'ya_verificada', 'sin_codigo', 'importe')),
  importe numeric(12,2),
  fecha timestamptz,
  descripcion text,
  procesado_en timestamptz not null default now()
);
create index ix_verificacion_movimientos_cliente on public.verificacion_movimientos (cliente_id);
alter table public.verificacion_movimientos enable row level security;
create policy verificacion_movimientos_dynamo on public.verificacion_movimientos for select using ((select ve_todo()));
revoke all on public.verificacion_movimientos from anon;
create trigger tg_mantenimiento before insert or update or delete on public.verificacion_movimientos
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.verificacion_movimientos is 'Movimientos de la cuenta de verificación ya mirados (cada uno una vez) y qué se hizo: empresa verificada, a revisar por Dynamo (el ordenante no cuadra), ya estaba verificada, sin código conocido o importe distinto de 0,01 €.';
comment on column public.verificacion_movimientos.movimiento_id is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Identificador del movimiento en la facturación.';
comment on column public.verificacion_movimientos.cliente_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Empresa cuyo código llevaba (vacío si ninguno).';
comment on column public.verificacion_movimientos.resultado is 'formato: lista | rango: no aplica | lista: verificada, revisar, ya_verificada, sin_codigo, importe | obligatorio | Qué se hizo con él.';
comment on column public.verificacion_movimientos.importe is 'formato: número decimal (2 decimales) | rango: no aplica | lista: no aplica | opcional | Importe del movimiento, en euros.';
comment on column public.verificacion_movimientos.fecha is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Fecha del movimiento en el banco.';
comment on column public.verificacion_movimientos.descripcion is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Descripción del banco (ordenante y concepto).';
comment on column public.verificacion_movimientos.procesado_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Cuándo se miró.';

-- ¿El ordenante del movimiento se parece a la razón social? Palabras de 3 o más letras sin las
-- formas jurídicas (S.L., S.A., …): al menos el 60 % aparecen en la descripción del banco.
create or replace function public.ordenante_cuadra(p_razon text, p_descripcion text)
returns boolean language plpgsql stable set search_path = public as $$
declare d text := ' ' || regexp_replace(texto_comparable(coalesce(p_descripcion, '')), '[^a-z0-9]+', ' ', 'g') || ' ';
  w text; total int := 0; si int := 0;
  fuera constant text[] := array['sl', 'sa', 'slu', 'sau', 'slne', 'sll', 'slp', 'scoop', 'coop', 'sc', 'cb', 'sociedad', 'limitada', 'anonima',
                                 'del', 'las', 'los', 'and', 'cia', 'compania'];
begin
  for w in select x from regexp_split_to_table(regexp_replace(texto_comparable(coalesce(p_razon, '')), '[^a-z0-9]+', ' ', 'g'), '\s+') x loop
    if length(w) < 3 or w = any(fuera) then continue; end if;
    total := total + 1;
    if position(' ' || w || ' ' in d) > 0 then si := si + 1; end if;
  end loop;
  return total > 0 and si >= 1 and si::numeric / total >= 0.6;
end $$;
revoke execute on function public.ordenante_cuadra(text, text) from public, anon, authenticated;
comment on function public.ordenante_cuadra(text, text) is '[Gestión interna] Si la descripción de un movimiento del banco (ordenante y concepto) se parece a una razón social: al menos el 60 % de sus palabras significativas (sin S.L., S.A., …) aparecen en ella. Quién: verificacion_por_movimiento. Argumentos: p_razon: razón social; p_descripcion: descripción del banco.';

create or replace function public.verificacion_por_movimiento(p_movimiento text, p_descripcion text, p_importe numeric, p_fecha timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text; c record; v_cli uuid; v_res text; v_motivo text; v_desc text := left(btrim(coalesce(p_descripcion, '')), 300);
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if exists (select 1 from verificacion_movimientos where movimiento_id = p_movimiento) then return 'repetido'; end if;
  v_cod := (regexp_match(upper(v_desc), 'VER[\s\-_.]?([A-HJ-NP-Z2-9]{6})'))[1];
  if v_cod is not null then
    select * into c from clientes where codigo_transferencia = 'VER-' || v_cod for update;
    if found then v_cli := c.id; end if;
  end if;
  if v_cli is null then v_res := 'sin_codigo';
  elsif abs(coalesce(p_importe, 0) - 0.01) > 0.001 then v_res := 'importe';
  elsif c.estado_verificacion = 'verificada' then v_res := 'ya_verificada';
  elsif ordenante_cuadra(c.razon_social, v_desc) then
    v_res := 'verificada';
    v_motivo := format('Automática: llega 0,01 € con su código (movimiento del %s: «%s»)', to_char(p_fecha at time zone 'Europe/Madrid', 'DD/MM/YYYY'), v_desc);
    perform set_config('dynamo.verificacion', 'on', true);
    update clientes set estado_verificacion = 'verificada', metodo_verificacion = 'transferencia', verificada_por = null,
           verificada_en = now(), verificacion_motivo = v_motivo, verificacion_solicitada = null, verificacion_solicitada_en = null
     where id = c.id;
    perform set_config('dynamo.verificacion', '', true);
    insert into verificaciones_empresa (cliente_id, accion, metodo, motivo) values (c.id, 'verificada', 'transferencia', v_motivo);
    if coalesce((select riesgo_efectivo_euros from clientes where id = c.id), 0) <= 0 then
      perform fn_email_credito(c.id, 'empresa_verificada:' || c.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'),
        'empresa_verificada', 'Empresa verificada · Dynamo', '<p>Hemos recibido tu transferencia de verificación: tu empresa ya está <strong>verificada</strong> en la plataforma de Dynamo.</p>');
    end if;
  else
    -- El código y el importe cuadran pero el ordenante no: a revisar por Dynamo.
    v_res := 'revisar';
    v_motivo := format('Llega 0,01 € con su código pero el ordenante no se parece a la razón social: «%s»', v_desc);
    perform set_config('dynamo.verificacion', 'on', true);
    update clientes set verificacion_solicitada = 'transferencia', verificacion_solicitada_en = coalesce(verificacion_solicitada_en, now()) where id = c.id;
    perform set_config('dynamo.verificacion', '', true);
    insert into verificaciones_empresa (cliente_id, accion, metodo, motivo) values (c.id, 'solicitud', 'transferencia', v_motivo);
    perform crear_aviso('dynamo', null, null, 'verificacion_empresa', 'aviso', 'Revisa la verificación · ' || c.razon_social,
      v_motivo || '. Si es de la empresa, verifícala desde su ficha.', '/panel/clientes?ver=' || c.id, null);
  end if;
  insert into verificacion_movimientos (movimiento_id, cliente_id, resultado, importe, fecha, descripcion)
  values (p_movimiento, v_cli, v_res, p_importe, p_fecha, v_desc);
  return v_res;
end $$;
revoke execute on function public.verificacion_por_movimiento(text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.verificacion_por_movimiento(text, text, numeric, timestamptz) to service_role;
comment on function public.verificacion_por_movimiento(text, text, numeric, timestamptz) is '[Gestión interna] Mira un movimiento de la cuenta de verificación (una sola vez): con 0,01 €, el código VER-XXXXXX de una empresa sin verificar y el ordenante parecido a su razón social, la verifica sola (vía transferencia, queda en el registro y se le avisa); si el ordenante no cuadra, la deja por verificar con aviso a Dynamo. Devuelve verificada, revisar, ya_verificada, sin_codigo, importe o repetido. Quién: el servidor (revisión horaria). Argumentos: p_movimiento: id en la facturación; p_descripcion: lo que dice el banco; p_importe: euros; p_fecha: fecha del movimiento.';
