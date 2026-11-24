-- =====================================================================================
-- EL PLAZO PARA PAGAR UN ENVÍO PENDIENTE DE PAGO PASA A 60 MINUTOS (usuario, 2026-11-24)
-- =====================================================================================
-- «Dejamos 60 minutos. Si pide carga con fecha fija justo en el último minuto del corte y
-- damos 3 horas y paga al final, contamos con mucho menos margen para buscar camión.»
--
-- El plazo sale del parámetro pago_previo_horas (en horas; nació con 24 y en pruebas estaba
-- en 3). Con 1, el cliente tiene una hora desde que el envío queda pendiente de pago: con
-- tarjeta paga al momento y por transferencia avisa con «Ya he hecho la transferencia», que
-- para el plazo. Si no hace ninguna de las dos cosas, el envío y su proforma se anulan solos.
-- Sigue siendo un parámetro: se cambia en Parámetros sin tocar nada más.

update public.parametros set valor = '1'::jsonb where clave = 'pago_previo_horas';
