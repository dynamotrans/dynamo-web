-- CARGAS DE VUELTA: NADA DESDE SU BASE HACIA PROVINCIAS LIMÍTROFES DE SU BASE (usuario, 2026-11-19).
-- Un envío que sale de la provincia de su base hacia una provincia vecina de su base es un
-- viaje corto alrededor de casa: no se ofrece, ni completo ni grupaje (p. ej. con base en
-- Valencia, nada de Valencia → Castellón, Cuenca, Albacete, Alicante o Teruel).

do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.envios_de_vuelta_calculo(uuid, integer, text)'::regprocedure) into v_def;
  if position('desde su base hacia una limítrofe' in v_def) > 0 then return; end if;
  v_nueva := replace(v_def,
    '               and not (x3.d_pais = v_dest.pais_iso and left(x3.d_cp, 2) = v_dest.cp2)',
    '               and not (x3.d_pais = v_dest.pais_iso and left(x3.d_cp, 2) = v_dest.cp2)
               -- Ni desde su base hacia una limítrofe de su base (viaje corto alrededor de casa).
               and not (x3.o_pais = v_base.pais_iso and left(x3.o_cp, 2) = v_base.cp2
                        and exists (select 1 from provincias_colindantes pc
                                     where pc.pais_codigo_iso = v_base.pais_iso and pc.cp2 = v_base.cp2
                                       and pc.pais_colindante = x3.d_pais and pc.colinda_con = left(x3.d_cp, 2)))');
  if v_nueva = v_def then raise exception 'envios_de_vuelta_calculo() no tiene el texto esperado: revisar la migración'; end if;
  execute v_nueva;
end $$;
