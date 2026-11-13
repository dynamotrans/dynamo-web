-- =====================================================================================
-- CÁLCULO DE PRECIO SIN CLIENTE (decisión del usuario, 2026-11-13)
-- =====================================================================================
-- La pantalla de Nuevo envío de Dynamo puede calcular un precio SIN elegir cliente
-- (alguien llama a preguntar y se le manda el cálculo por email), aplicando el
-- descuento de bienvenida de Parámetros: el mismo con el que empieza un cliente nuevo
-- y el que verá el tarifador público de la web, sin registro. Para eso
-- reglas_precio_envio() devuelve también ese porcentaje (bienvenida_pct).
-- Crear el envío sigue exigiendo cliente: esto solo alimenta el cálculo.

create or replace function public.reglas_precio_envio()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('antelacion_max_dias', parametro_num('envio_antelacion_max_dias', 120), 'cerrado_dias', parametro_num('precio_cerrado_dias', 7),
                            'revision_dias_habiles', parametro_num('precio_revision_dias_habiles', 7), 'margen_pct', parametro_num('precio_revision_margen_pct', 5),
                            'corte_fija_hora', parametro_num('primer_dia_corte_fija_hora', 12),
                            'corte_ventana_1_2_hora', parametro_num('primer_dia_corte_ventana_1_2_hora', 14),
                            'corte_ventana_1_3_hora', parametro_num('primer_dia_corte_ventana_1_3_hora', 14),
                            'corte_ventana_1_4_hora', parametro_num('primer_dia_corte_ventana_1_4_hora', 14),
                            'bienvenida_pct', parametro_num('factor_bienvenida_pct', -7))
$function$;

comment on function public.reglas_precio_envio() is '[Precio y pago] Reglas de precio y fechas para la pantalla de pedir envío (de los parámetros): antelación máxima en días, días con precio cerrado, días hábiles para revisar el precio, margen % de revisión, horas de corte para cargar — la de fecha fija y una POR VENTANA (1-2, 1-3 y 1-4 días) — y el descuento de bienvenida (%) que se aplica al calcular un precio sin cliente elegido (el de cliente nuevo y el del tarifador público). Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';
