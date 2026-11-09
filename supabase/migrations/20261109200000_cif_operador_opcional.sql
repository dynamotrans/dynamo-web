-- =====================================================================================
-- EL CIF DEL TRANSPORTISTA PRIVADO (OPERADORES) PASA A OPCIONAL (usuario, 2026-11-09)
-- =====================================================================================
-- El catálogo privado del cliente es una agenda informal: muchas veces se apunta a un
-- autónomo o una empresa sin tener su CIF a mano. Deja de ser obligatorio; si se pone,
-- sigue sin poder repetirse dentro del catálogo del cliente (dos filas SIN CIF no chocan:
-- el índice único ignora los nulos).
-- =====================================================================================

alter table operadores alter column cif drop not null;

comment on column public.operadores.cif is 'formato: texto | rango: no aplica | lista: no aplica | opcional | CIF/NIF del operador, si se conoce. No puede repetirse dentro del catálogo de un mismo cliente (sin contar los borrados; se compara sin guiones ni espacios); varios operadores sin CIF no chocan. Ej. OK: B11223344 · Ej. mal: B-11223344 si ya está en su catálogo';
