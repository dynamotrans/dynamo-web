-- VERIFICACIÓN DE EMPRESA: SOLO POR EL CÉNTIMO (usuario, 2026-11-27).
-- 1) «Una tarjeta del CIF o una escritura la puede tener cualquiera que se la haya mandado alguna
--    vez una empresa»: el cliente ya solo puede pedir la verificación por la transferencia de 0,01 €
--    (demuestra que controla una cuenta a nombre de la empresa). La verificación a mano de Dynamo
--    (verificar_empresa, con motivo y contraseña) sigue para los casos que no encajan. Los
--    documentos ya subidos se quedan en la ficha, como consulta.
-- 2) Una sola petición a la vez: con la transferencia ya avisada, no se vuelve a pedir
--    ('ya_pedida', no cambia nada). Una petición antigua por documento sí pasa a transferencia (la
--    más fiable). Se vuelve a poder pedir cuando Dynamo la rechaza.
-- 3) El nombre del ordenante entiende ABREVIATURAS («TRANSP. GARCIA» = «Transportes García»,
--    «HNOS» = «Hermanos», «LOG» = «Logística»…) y no cuenta las palabras que pone el banco
--    («transferencia», «inmediata», «concepto»…), para que no cuadre por casualidad.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.solicitar_verificacion_empresa(text)'::regprocedure);
  n := replace(d, $q$  if p_metodo not in ('transferencia', 'documento') then raise exception 'Vía de verificación no válida.'; end if;$q$,
                  $q$  if p_metodo is distinct from 'transferencia' then raise exception 'Vía de verificación no válida: la empresa se verifica con la transferencia de 0,01 €.'; end if;$q$);
  n := replace(n, $q$  if c.estado_verificacion = 'verificada' then return 'ya_verificada'; end if;$q$,
                  $q$  if c.estado_verificacion = 'verificada' then return 'ya_verificada'; end if;
  if c.verificacion_solicitada = 'transferencia' then return 'ya_pedida'; end if;$q$);
  if n = d or position('ya_pedida' in n) = 0 or position('se verifica con la transferencia' in n) = 0 then
    raise exception 'solicitar_verificacion_empresa: no encuentro lo que hay que cambiar'; end if;
  execute n;
end $$;
comment on function public.solicitar_verificacion_empresa(text) is '[Clientes y cuentas] El cliente avisa de que ha hecho la transferencia de 0,01 € para verificar su empresa (es la única vía del cliente desde el 2026-11-27). Una sola petición a la vez: si ya la avisó devuelve ya_pedida y no cambia nada (hasta que Dynamo la rechace). Avisa a Dynamo. Devuelve ok, ya_pedida o ya_verificada. Quién: un usuario activo de la empresa cliente. Argumentos: p_metodo: transferencia.';

-- Palabra con su forma completa (abreviaturas típicas de razones sociales y de bancos).
create or replace function public.palabra_completa(p text)
returns text language sql immutable set search_path = public as $$
  select case p
    when 'hnos' then 'hermanos' when 'hmnos' then 'hermanos' when 'hno' then 'hermano'
    when 'intl' then 'internacional' when 'gral' then 'general' when 'log' then 'logistica'
    when 'ind' then 'industria' when 'inds' then 'industrias' when 'mat' then 'materiales'
    when 'tte' then 'transporte' when 'ttes' then 'transportes' when 'tpte' then 'transporte' when 'tptes' then 'transportes'
    when 'svcs' then 'servicios' when 'srv' then 'servicios' when 'srvs' then 'servicios'
    else p end
$$;
revoke execute on function public.palabra_completa(text) from public, anon, authenticated;
comment on function public.palabra_completa(text) is '[Gestión interna] Pasa una abreviatura típica a su palabra completa (hnos → hermanos, log → logistica, ttes → transportes…) para comparar nombres de empresa. Quién: ordenante_cuadra. Argumentos: p: la palabra, ya en minúsculas y sin tildes.';

-- ¿El ordenante del movimiento se parece a la razón social? Palabras de 3 o más letras sin las
-- formas jurídicas (S.L., S.A., …): al menos el 60 % aparecen en la descripción del banco. Una
-- palabra cuenta si está igual, si una es abreviatura de la otra (empieza igual, 4 letras o más:
-- «transp» → «transportes») o por la lista de abreviaturas. Las palabras del banco no cuentan.
create or replace function public.ordenante_cuadra(p_razon text, p_descripcion text)
returns boolean language plpgsql stable set search_path = public as $$
declare w text; total int := 0; si int := 0; dw text[];
  fuera constant text[] := array['sl', 'sa', 'slu', 'sau', 'slne', 'sll', 'slp', 'scoop', 'coop', 'sc', 'cb', 'sociedad', 'sdad', 'limitada', 'anonima',
                                 'del', 'las', 'los', 'and', 'cia', 'compania'];
  banco constant text[] := array['transferencia', 'transf', 'trf', 'inmediata', 'concepto', 'recibida', 'emitida', 'sepa', 'ordenante',
                                 'beneficiario', 'abono', 'traspaso', 'ver', 'ref', 'referencia', 'de', 'por', 'para'];
begin
  select coalesce(array_agg(distinct palabra_completa(x)), '{}') into dw
    from regexp_split_to_table(regexp_replace(texto_comparable(regexp_replace(coalesce(p_descripcion, ''), 'VER[\s\-_.]?[A-HJ-NP-Z2-9]{6}', ' ', 'gi')),
                                              '[^a-z0-9]+', ' ', 'g'), '\s+') x
   where x <> '' and not x = any(banco);
  for w in select palabra_completa(x) from regexp_split_to_table(regexp_replace(texto_comparable(coalesce(p_razon, '')), '[^a-z0-9]+', ' ', 'g'), '\s+') x loop
    if length(w) < 3 or w = any(fuera) then continue; end if;
    total := total + 1;
    if exists (select 1 from unnest(dw) d
                where d = w or (length(d) >= 4 and left(w, length(d)) = d) or (length(w) >= 4 and left(d, length(w)) = w)) then
      si := si + 1;
    end if;
  end loop;
  return total > 0 and si >= 1 and si::numeric / total >= 0.6;
end $$;
revoke execute on function public.ordenante_cuadra(text, text) from public, anon, authenticated;
comment on function public.ordenante_cuadra(text, text) is '[Gestión interna] Si la descripción de un movimiento del banco (ordenante y concepto) se parece a una razón social: al menos el 60 % de sus palabras significativas (sin S.L., S.A., …) aparecen en ella, aceptando abreviaturas («transp.» = transportes, «hnos» = hermanos) y sin contar las palabras que pone el banco (transferencia, concepto…). Quién: verificacion_por_movimiento. Argumentos: p_razon: razón social; p_descripcion: descripción del banco.';
