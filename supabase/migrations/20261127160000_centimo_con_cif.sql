-- EL CONCEPTO DEL CÉNTIMO ES EL CIF (usuario, 2026-11-27): «¿no es más fácil poner que el concepto
-- sea el CIF de la empresa? Es más fácil de recordar que un código raro… seguramente se lo sepa de
-- memoria». El movimiento de 0,01 € se reconoce ahora por el CIF (o NIF/NIE) de la empresa escrito
-- en el concepto, con o sin guiones, puntos, espacios o el «ES» delante. El código VER-XXXXXX se
-- sigue aceptando (los que ya se mandaron con él). El ordenante tiene que parecerse a la razón
-- social (si no, «Revisa la verificación» para Dynamo).
-- IMPORTE DE 0,01 € A 1,00 € (usuario, 2026-11-27): «si alguien te manda 1 €, que es más fácil que
-- poner decimales, o se equivoca y pone 0,10…». Se pide 0,01 €, pero vale cualquier importe de
-- 0,01 € a 1,00 €, ambos incluidos.
create or replace function public.cif_sin_pais(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(normalizar_id_fiscal(coalesce(p, '')), '^ES(?=[A-Z0-9]{9}$)', '')
$$;
revoke execute on function public.cif_sin_pais(text) from public, anon, authenticated;
comment on function public.cif_sin_pais(text) is '[Gestión interna] Un CIF/NIF sin guiones, puntos ni espacios, en mayúsculas y sin el «ES» delante si es español (ES-B12345678 → B12345678). Quién: verificacion_por_movimiento. Argumentos: p: el CIF.';

do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.verificacion_por_movimiento(text, text, numeric, timestamptz)'::regprocedure);
  n := replace(d, $q$  if v_cli is null then v_res := 'sin_codigo';$q$,
                  $q$  -- Sin código: el CIF de la empresa en el concepto (2026-11-27). Vale solo si es de UNA empresa.
  if v_cli is null and (select count(*) from clientes x where length(cif_sin_pais(x.cif)) >= 8
                          and position(cif_sin_pais(x.cif) in normalizar_id_fiscal(v_desc)) > 0) = 1 then
    select * into c from clientes x where length(cif_sin_pais(x.cif)) >= 8
       and position(cif_sin_pais(x.cif) in normalizar_id_fiscal(v_desc)) > 0 for update;
    v_cli := c.id;
  end if;
  if v_cli is null then v_res := 'sin_codigo';$q$);
  n := replace(n, $q$  elsif abs(coalesce(p_importe, 0) - 0.01) > 0.001 then v_res := 'importe';$q$,
                  $q$  elsif coalesce(p_importe, 0) < 0.01 or p_importe > 1.00 then v_res := 'importe';$q$);
  if position('p_importe > 1.00' in n) = 0 then raise exception 'verificacion_por_movimiento: no encuentro la regla del importe'; end if;
  n := replace(n, $q$'Automática: llega 0,01 € con su código (movimiento del %s: «%s»)'$q$, $q$'Automática: llega 0,01 € con su CIF o su código (movimiento del %s: «%s»)'$q$);
  n := replace(n, $q$'Llega 0,01 € con su código pero el ordenante no se parece a la razón social: «%s»'$q$, $q$'Llega 0,01 € con su CIF o su código pero el ordenante no se parece a la razón social: «%s»'$q$);
  if n = d or position('cif_sin_pais' in n) = 0 then raise exception 'verificacion_por_movimiento: no encuentro dónde buscar el CIF'; end if;
  execute n;

  -- El aviso a Dynamo cuando el cliente dice que ya la ha hecho: el concepto es su CIF.
  d := pg_get_functiondef('public.solicitar_verificacion_empresa(text)'::regprocedure);
  n := replace(d, $q$format('Dice que ha hecho la transferencia de 0,01 € con el concepto %s. Comprueba en el banco el concepto y que el ordenante sea %s.', c.codigo_transferencia, c.razon_social)$q$,
                  $q$format('Dice que ha hecho la transferencia de 0,01 € con su CIF (%s) en el concepto. Comprueba en el banco el concepto y que el ordenante sea %s.', c.cif, c.razon_social)$q$);
  if n = d then raise exception 'solicitar_verificacion_empresa: no encuentro el texto del aviso'; end if;
  execute n;
end $$;
comment on function public.verificacion_por_movimiento(text, text, numeric, timestamptz) is '[Gestión interna] Mira un movimiento de la cuenta de verificación: si es de 0,01 € a 1,00 € y en el concepto lleva el CIF de una empresa (o su código VER-XXXXXX), y el ordenante se parece a su razón social, la verifica; si el ordenante no cuadra, avisa a Dynamo para revisarla. Cada movimiento se mira una vez. Devuelve verificada, revisar, ya_verificada, importe, sin_codigo o repetido. Quién: solo el servidor. Argumentos: p_movimiento: id del movimiento; p_descripcion: texto del banco; p_importe: importe; p_fecha: fecha.';
