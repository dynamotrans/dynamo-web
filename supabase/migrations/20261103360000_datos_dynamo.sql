-- =====================================================================================
-- LOS DATOS FIJOS DE DYNAMO, EN PARÁMETROS (para cambiarlos sin tocar código)
-- =====================================================================================
-- Razón social, CIF, dirección, teléfonos, email, código de Wtransnet y tarjeta de
-- transporte: salen en la orden de carga, el CMR y Mi cuenta. Hasta hoy vivían en el
-- código; ahora en `parametros` (Dynamo los cambia en Parámetros). Son datos PÚBLICOS de
-- la empresa (van en cada orden), así que cualquiera con sesión puede leerlos con
-- datos_dynamo(); el resto de parámetros sigue siendo solo de Dynamo.
insert into parametros (clave, valor, descripcion) values
  ('dynamo_razon_social',   '"Dynamo Operador Logístico, S.L."', 'Razón social de Dynamo (órdenes de carga, CMR).'),
  ('dynamo_cif',            '"ESB01596360"',                     'CIF de Dynamo.'),
  ('dynamo_direccion',      '"Paseo de las Delicias 1, planta 5ª"', 'Dirección de Dynamo (calle y número).'),
  ('dynamo_codigo_postal',  '"41001"',                           'Código postal de Dynamo.'),
  ('dynamo_poblacion',      '"Sevilla"',                         'Población de Dynamo.'),
  ('dynamo_email',          '"info@dynamotrans.com"',            'Email de Dynamo en los documentos.'),
  ('dynamo_telefono',       '"+34 955 225 945"',                 'Teléfono de Dynamo (urgencias e incidencias 24 h).'),
  ('dynamo_movil',          '"+34 628 995 709"',                 'Móvil / WhatsApp de Dynamo.'),
  ('dynamo_wtransnet',      '"267017"',                          'Código de Dynamo en Wtransnet.'),
  ('dynamo_tarjeta_ot',     '"12548918-1"',                      'Tarjeta de operador de transporte (O.T.).'),
  ('dynamo_web',            '"www.dynamotrans.com"',             'Web de Dynamo.')
on conflict (clave) do nothing;

create or replace function datos_dynamo()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(substr(clave, 8), valor #>> '{}'), '{}'::jsonb)
    from parametros where clave like 'dynamo\_%'
$$;
revoke execute on function datos_dynamo() from public, anon;
grant execute on function datos_dynamo() to authenticated;
