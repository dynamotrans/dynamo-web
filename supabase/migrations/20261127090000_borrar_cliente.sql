-- BORRAR UN CLIENTE SIN NADA COLGADO (usuario, 2026-11-27): «¿una cuenta de cliente no se puede
-- borrar?». Una empresa con historia no se borra nunca (envíos, albaranes, CMR, documentos de
-- control y facturas hay que guardarlos por ley): para esas están Suspendido, la baja de sus
-- usuarios y Anonimizar. Pero una empresa creada por error o de prueba, sin NADA colgado, sí se
-- puede borrar de verdad. Solo el Admin Master (la pantalla pide además su contraseña y la palabra
-- CONFIRMAR). Queda en la auditoría (tg_auditar_clientes guarda la fila borrada).
--
-- Cuenta como «colgado» (no deja borrar): usuarios, envíos, sitios, transportistas propios,
-- incidencias, almacenamientos, documentos, facturas (copia de la facturación y las de pagos
-- tardíos) y pedidos de venta sin facturar. Se van con ella: sus contactos, avisos, consultas de
-- precio, regla de pagos tardíos, registro de verificación, bajas pedidas y notas internas. Los
-- movimientos del céntimo, las sugerencias y las conversaciones de WhatsApp se quedan, sin empresa.

create or replace function public.borrar_cliente(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d jsonb;
begin
  if not (es_admin_master() or es_servidor()) then
    raise exception 'Solo el Admin Master borra clientes.' using errcode = '42501';
  end if;
  perform 1 from clientes where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  d := jsonb_strip_nulls(jsonb_build_object(
    'usuarios',          nullif((select count(*) from usuarios where cliente_id = p_id), 0),
    'envios',            nullif((select count(*) from envios where cliente_id = p_id), 0),
    'sitios',            nullif((select count(*) from sitios where cliente_id = p_id), 0),
    'transportistas',    nullif((select count(*) from operadores where cliente_id = p_id), 0),
    'incidencias',       nullif((select count(*) from incidencias where cliente_id = p_id), 0),
    'almacenamientos',   nullif((select count(*) from almacenamientos where cliente_id = p_id), 0),
    'documentos',        nullif((select count(*) from documentos where cliente_id = p_id), 0),
    'facturas',          nullif((select count(*) from facturas_emitidas where cliente_id = p_id)
                              + (select count(*) from facturas_cliente where cliente_id = p_id), 0),
    'pedidos',           nullif((select count(*) from pedidos_venta_pendientes where cliente_id = p_id), 0)));
  if d <> '{}'::jsonb then
    return jsonb_build_object('resultado', 'con_datos', 'detalle', d);
  end if;
  delete from notas_internas where tabla = 'clientes' and registro_id = p_id;
  delete from clientes where id = p_id;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function public.borrar_cliente(uuid) from public, anon;
grant execute on function public.borrar_cliente(uuid) to authenticated, service_role;
comment on function public.borrar_cliente(uuid) is '[Clientes] Borra de verdad una empresa cliente SOLO si no tiene nada colgado (usuarios, envíos, sitios, transportistas propios, incidencias, almacenamientos, documentos, facturas ni pedidos de venta): para las creadas por error o de prueba. Si tiene algo, no borra y devuelve con_datos y el recuento. Se van con ella sus contactos, avisos, consultas de precio, regla de pagos, registro de verificación, bajas y notas internas. Devuelve ok, con_datos o no_existe. Quién: solo el Admin Master (la pantalla pide su contraseña y CONFIRMAR). Argumentos: p_id: clientes.id.';
