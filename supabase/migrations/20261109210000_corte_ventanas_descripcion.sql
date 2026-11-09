-- =====================================================================================
-- CORTE DE LAS VENTANAS: DESCRIPCIONES AL DÍA (usuario, 2026-11-09)
-- =====================================================================================
-- Sin cambio de comportamiento: primera_fecha_carga() ya trata TODA ventana igual
-- (antes del corte puede empezar hoy si es hábil; después, el siguiente día hábil,
-- nunca dos). Pero las descripciones de los dos parámetros de ventana venían de antes
-- (20261105420100/20261105440000) y aún decían «el siguiente día hábil; después, el
-- otro». Se reescriben para que digan la regla real. La web, además, trataba la
-- ventana corta de grupaje (1-2 días) con la regla de la fecha fija: corregida en
-- lib/fechasCarga.ts en este mismo cambio (grupaje no lleva fecha fija).
-- =====================================================================================

update public.parametros set descripcion =
  'Hora de corte (Madrid) al pedir un envío con ventana (todas: 1-2, 1-3 y 1-4 días; tarifador y cambios de fecha): antes, la ventana puede empezar HOY mismo si hoy es hábil; después, el siguiente día hábil — nunca salta dos.'
 where clave = 'primer_dia_corte_ventana_hora';

update public.parametros set descripcion =
  'Hora de corte (Madrid) al pagar (o liberar sin pago previo) un envío con ventana (todas: 1-2, 1-3 y 1-4 días): antes, la ventana puede empezar ese mismo día si es hábil; después, el siguiente día hábil — nunca salta dos. Si la ventana elegida ya no llega, pasa a ese día con los mismos días hábiles.'
 where clave = 'primer_dia_corte_pago_ventana_hora';
