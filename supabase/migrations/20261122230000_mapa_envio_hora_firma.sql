-- MAPA DEL ENVÍO: LA HORA REAL DE CADA PARADA Y DE DÓNDE SALE (usuario, 2026-11-22). Cada parada
-- lleva también la hora de su firma en el CMR (la primera que no sea extra), para que el mapa
-- diga «firmado en el CMR a las…» y no solo «hecho»; y la dirección, para situarla en el mapa
-- cuando falta el código postal. El resto de mapa_envio no cambia.
do $$
declare v_def text; v_aguja text := '''realizado_en'', p.realizado_en)';
begin
  select pg_get_functiondef('public.mapa_envio'::regproc) into v_def;
  if position('firmada_en' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 1 then
    raise exception 'No se encuentra (una sola vez) la lista de paradas esperada en mapa_envio: revisar antes de aplicar.';
  end if;
  execute replace(v_def, v_aguja, '''realizado_en'', p.realizado_en, ''direccion'', p.direccion, '
    || '''firmada_en'', (select min(f.firmado_en) from firmas_cmr f where f.envio_id = p.envio_id and f.parada_id = p.id and not f.extra))');
end $$;
