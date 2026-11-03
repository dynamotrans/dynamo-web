-- =====================================================================================
-- MODO MANTENIMIENTO IMPUESTO EN LA BASE DE DATOS
-- =====================================================================================
-- Hasta hoy el mantenimiento lo imponía la web (pantalla de mantenimiento, enlaces
-- públicos parados). Pero la web no es seguridad: alguien con la clave pública podría
-- seguir escribiendo directamente. Ahora, con el mantenimiento ENCENDIDO, ninguna
-- escritura en las tablas de negocio pasa salvo que la haga el equipo de Dynamo o el
-- servidor (la clave de servicio, n8n, las migraciones). Leer sigue permitido.
create or replace function fn_bloqueo_mantenimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if mantenimiento_activo() and not es_admin() and not es_servidor() then
    raise exception 'La plataforma está en mantenimiento: vuelve a intentarlo en un rato.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
comment on function fn_bloqueo_mantenimiento() is
  'Con el mantenimiento encendido, solo Dynamo y el servidor escriben en las tablas de negocio.';

do $$ declare t text; begin
  foreach t in array array[
    'almacenamientos', 'clientes', 'cmr_enlaces', 'conductores', 'contactos',
    'documentos', 'envio_ofertas', 'envio_parada_pines', 'envio_paradas', 'envio_reservas', 'envios',
    'firmas_cmr', 'incidencias', 'lugar_horarios', 'lugar_notas_cliente', 'lugares', 'operadores',
    'penalizaciones', 'pin_intentos', 'transportistas', 'vehiculos'
  ] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists tg_mantenimiento on %I', t);
    execute format('create trigger tg_mantenimiento before insert or update or delete on %I
                    for each row execute function fn_bloqueo_mantenimiento()', t);
  end loop;
end $$;


-- =====================================================================================
-- CLIENTES: «Alta dada por» (para las comisiones)
-- =====================================================================================
-- El empleado de Dynamo que captó al cliente. Vacío = «Alta online» (se registró por la
-- web, sin comisión de empleado). Solo lo ven y lo tocan los de Dynamo (como toda la tabla).
alter table clientes add column alta_por uuid references usuarios(id) on delete set null;
comment on column clientes.alta_por is
  'SOLO DYNAMO: empleado que captó/dio de alta al cliente (control de comisiones). Null = alta online.';
create or replace function fn_clientes_alta_por()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.alta_por is not null and not exists (select 1 from usuarios where id = new.alta_por and rol in ('admin', 'empleado')) then
    raise exception 'El alta solo la puede dar un empleado de Dynamo.';
  end if;
  return new;
end $$;
create trigger tg_clientes_alta_por before insert or update of alta_por on clientes
  for each row execute function fn_clientes_alta_por();
