-- =====================================================================================
-- HOMOGENEIDAD PARA n8n — FASE 2: NOMBRES (usuario, 2026-11-05: «ahora», «orden de carga»,
-- «plataforma elevadora»)
-- Solo cambian NOMBRES; los datos no se tocan salvo dos valores de texto (documentos.tipo
-- 'orden_transporte' → 'orden_carga' y notas_internas.campo) y las claves de parámetros.
-- Reglas que quedan para todo lo nuevo:
--   · porcentajes *_pct · instantes *_en · días *_dias · sí/no con es_/tiene_/requiere_/exento_
--   · los estados empiezan por estado_ · importes importe_* · referencias externas *_ref
--   · funciones: verbo delante (guardar_mi_…, dar_baja_…), sin fn_ salvo disparadores,
--     *_publico/_publica las de enlace sin sesión
--   · es_equipo_dynamo() = admin o empleado (antes es_admin) · es_admin_master() = solo el
--     Admin Master (antes es_administrador)
-- Se quedan como están (mismo nombre con sentidos distintos o palabra suelta; el diccionario
-- explica cada uno): adr, pronto_pago, cuando/quien de los registros, tipo_id, desde/hasta de
-- las reservas, porcentaje de recargos_tipo_sitio (lo absorberá el tarifador).
-- Generada a partir de la base de datos; las migraciones anteriores conservan sus nombres.
-- =====================================================================================

-- ---- La vista que repite columnas de envios: se rehace con los nombres nuevos --------
drop view public.v_envios_con_paradas;

-- ---- Columnas ------------------------------------------------------------------------
alter table public.clientes rename column iva_porcentaje to iva_pct;
alter table public.transportistas rename column iva_porcentaje to iva_pct;
alter table public.clientes rename column retencion_porcentaje to retencion_pct;
alter table public.transportistas rename column retencion_porcentaje to retencion_pct;
alter table public.clientes rename column recargo_equivalencia_porcentaje to recargo_equivalencia_pct;
alter table public.clientes rename column factor_tarifa_porcentaje to factor_tarifa_pct;
alter table public.clientes rename column recargo_pago_tarde_porcentaje to recargo_pago_tarde_pct;
alter table public.envios rename column iva_aplicado to iva_pct;
alter table public.almacenamientos rename column iva_aplicado to iva_pct;
alter table public.envios rename column retencion_aplicada to retencion_pct;
alter table public.envios rename column factor_tarifa_aplicado to factor_tarifa_pct;
alter table public.envios rename column plazo_pago_aplicado to plazo_pago_dias;
alter table public.envios rename column plataforma_elevadora to requiere_plataforma_elevadora;
alter table public.clientes rename column plataforma_elevadora_defecto to requiere_plataforma_elevadora_defecto;
alter table public.envios rename column carga_superior to carga_techo;
alter table public.envios rename column pago_previo to estado_pago_previo;
alter table public.almacenamientos rename column pago_adelantado to requiere_pago_previo;
alter table public.clientes rename column sin_pago_previo_primer_envio to exento_pago_previo_primer_envio;
alter table public.envios rename column precio_inicial_cliente to importe_cliente_inicial;
alter table public.envios rename column contraoferta_cliente to importe_contraoferta_cliente;
alter table public.envios rename column precio_revision_anterior to importe_revision_anterior;
alter table public.envios rename column precio_revision_nuevo to importe_revision_nuevo;
alter table public.envios rename column solicitud_estado to estado_solicitud;
alter table public.envios rename column cambio_cliente_estado to estado_cambio_cliente;
alter table public.envios rename column precio_revision to estado_revision_precio;
alter table public.envios rename column precio_revision_fecha to fecha_revision_precio;
alter table public.envios rename column precio_revision_en to revision_precio_en;
alter table public.envios rename column precio_revision_recordado to revision_precio_recordada;
alter table public.envios rename column precio_revisar to requiere_revision_precio;
alter table public.envios rename column precio_valido_hasta to precio_caduca_en;
alter table public.envios rename column pago_pendiente_desde to pago_pendiente_en;
alter table public.usuarios rename column autosusp_desde to autosuspension_desde_en;
alter table public.envio_paradas rename column hora_real to realizado_en;
alter table public.envios rename column nima_requerido to requiere_nima;
alter table public.sitios rename column exige_pin to requiere_pin;
alter table public.clientes rename column exige_pin to requiere_pin;
alter table public.transportistas rename column almacen_logistico to tiene_almacen;
alter table public.usuarios rename column sin_autosuspension to exento_autosuspension;
alter table public.usuarios rename column limite_cargas_diario to limite_envios_diario;
alter table public.clientes rename column sitio_defecto_id to sitio_principal_id;
alter table public.usuarios rename column copias_avisos to emails_copia_avisos;
alter table public.transportistas rename column incidencias_notas to anotaciones_incidencias;
alter table public.distancias_cp rename column pais_origen to pais_codigo_iso_origen;
alter table public.distancias_cp rename column pais_destino to pais_codigo_iso_destino;
alter table public.operadores rename column logo_url to url_logo;
alter table public.envios rename column numero_bultos to num_bultos;
alter table public.envios rename column km_total to distancia_total_km;
alter table public.envio_paradas rename column km_hasta_siguiente to distancia_siguiente_km;
alter table public.clientes rename column forma_pago_holded_id to holded_forma_pago_ref;
alter table public.transportistas rename column forma_pago_holded_id to holded_forma_pago_ref;
alter table public.envios rename column stripe_pago to stripe_pago_ref;
alter table public.envios rename column pedido_venta_holded to holded_pedido_venta;
alter table public.envios rename column pedido_compra_holded to holded_pedido_compra;
alter table public.vehiculos rename column trampilla to tiene_plataforma_elevadora;

-- ---- Tipos y valores -------------------------------------------------------------
alter type public.estado_ticket rename to estado_incidencia;
alter type public.prioridad_ticket rename to prioridad_incidencia;
alter type public.forma_carga rename value 'paletizado_lateral' to 'paletizada_lateral';
alter type public.tipo_hito rename value 'orden_transporte_enviada' to 'orden_carga_enviada';
drop type public.tipo_ticket;
drop type public.tipo_entidad;

-- ---- Datos que son nombres: tipo de documento, campo de nota, claves de parámetros --
alter table public.documentos drop constraint documentos_tipo_check;
update public.documentos set tipo = 'orden_carga' where tipo = 'orden_transporte';
alter table public.documentos add constraint documentos_tipo_check check (tipo = any (array['albaran', 'cmr', 'cmr_firmado', 'orden_carga', 'proforma', 'seguro_cmr', 'tarjeta_transporte', 'foto_incidencia', 'gps_tacografo', 'hoja_cif', 'dni', 'logo', 'adjunto', 'otro']));
alter table public.notas_internas drop constraint notas_internas_campo_check;
update public.notas_internas set campo = 'anotaciones_incidencias' where campo = 'incidencias_notas';
alter table public.notas_internas add constraint notas_internas_campo_check check (campo = any (array['anotaciones', 'anotaciones_incidencias']));
alter table public.notas_internas alter column campo set default 'anotaciones';
update public.parametros set clave = 'pago_previo_activo' where clave = 'previo_pago_activo';
update public.parametros set clave = 'pago_previo_primeros_envios' where clave = 'previo_pago_primeros_envios';
update public.parametros set clave = 'pago_previo_horas' where clave = 'previo_pago_horas';
update public.parametros set clave = 'autosuspension_activa' where clave = 'autosusp_activa';
update public.parametros set clave = 'autosuspension_sin_envios_dias' where clave = 'autosusp_sin_envios_dias';
update public.parametros set clave = 'autosuspension_sin_acceso_dias' where clave = 'autosusp_sin_acceso_dias';
update public.parametros set clave = 'autosuspension_consultas_dia' where clave = 'autosusp_consultas_dia';
update public.parametros set clave = 'autosuspension_consultas_semana' where clave = 'autosusp_consultas_semana';
update public.parametros set clave = 'autosuspension_consultas_mes' where clave = 'autosusp_consultas_mes';
update public.parametros set clave = 'autosuspension_cancel_pct' where clave = 'autosusp_cancel_pct';
update public.parametros set clave = 'autosuspension_cancel_min_envios' where clave = 'autosusp_cancel_min_envios';
update public.parametros set clave = 'autosuspension_cancel_recientes' where clave = 'autosusp_cancel_recientes';
update public.parametros set clave = 'autosuspension_cancel_recientes_dias' where clave = 'autosusp_cancel_recientes_dias';
-- Códigos de los sitios nuevos con S- (de «sitio»); los ya dados conservan su L-.
alter table public.sitios alter column codigo set default ('S-'::text || nextval('seq_sitio_codigo'::regclass));

-- ---- Funciones: las que cambian de argumentos o de lo que devuelven se rehacen -------
drop function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_camion text, p_remolque text, p_conductor text, p_telefono text, p_ip inet);
drop function public.completar_carga_publica(p_reserva uuid, p_camion text, p_remolque text, p_conductor text, p_telefono text);
drop function public.crear_envio(p_envio jsonb, p_paradas jsonb);
drop function public.crear_envio_manual(p_envio jsonb, p_paradas jsonb);
drop function public.crear_solicitud_envio(p_envio jsonb, p_paradas jsonb);
drop function public.flota_sugerencia(p_transportista uuid, p_matricula text, p_conductor text);
drop function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor text);
drop function public.fn_guardar_km_cp(p_pais_origen character, p_cp_origen text, p_pais_destino character, p_cp_destino text, p_km numeric, p_minutos integer, p_proveedor text);
drop function public.fn_km_cp(p_pais_origen character, p_cp_origen text, p_pais_destino character, p_cp_destino text, p_max_edad interval);
drop function public.marcar_exportados(p_fichero text, p_refs text[], p_quitar boolean);
drop function public.mi_empresa();
drop function public.mi_vehiculo_guardar(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv date, p_seguro date, p_tarjeta date, p_adr boolean, p_trampilla boolean);
drop function public.mis_envios();
drop function public.mis_envios_por_ids(p_ids uuid[]);
drop function public.mis_viajes();
drop function public.mis_viajes_por_ids(p_ids uuid[]);
drop function public.pagos_envio(p_envio uuid);
drop function public.resolver_cambio_envio(p_envio uuid, p_aceptar boolean, p_nota text);
drop function public.resolver_contraoferta(p_reserva uuid, p_aprobar boolean);
drop function public.resolver_contraoferta_cliente(p_envio uuid, p_aprobar boolean);
drop function public.revision_precio_envio(p_envio uuid);
alter function public.anotar_reservas_cmr(p_token uuid, p_parada uuid, p_rol text, p_texto text) rename to anotar_reservas_cmr_publico;
alter function public.autosusp_en_curso(o usuarios, n usuarios) rename to autosuspension_en_curso;
alter function public.autosusp_revisar(p_usuario uuid) rename to autosuspension_revisar;
alter function public.es_admin() rename to es_equipo_dynamo;
alter function public.es_administrador() rename to es_admin_master;
alter function public.euros_txt(p numeric) rename to euros_texto;
alter function public.fn_fuera_de_cobertura(p_pais character) rename to fuera_de_cobertura;
alter function public.fn_guardar_km_sitios(p_origen uuid, p_destino uuid, p_km numeric, p_minutos integer, p_proveedor text) rename to guardar_km_sitios;
alter function public.fn_km_sitios(p_origen uuid, p_destino uuid, p_max_edad interval) rename to km_sitios;
alter function public.fn_restriccion_punto(p_pais character, p_cp text, p_tipo_parada text, p_tipo_carga tipo_carga, p_fecha date) rename to restriccion_punto;
alter function public.fn_restricciones_ruta(p_envio uuid) rename to restricciones_ruta;
alter function public.horario_sitio_txt(p_sitio uuid, p_fecha date) rename to horario_sitio_texto;
alter function public.liberar_reserva(p_reserva uuid, p_motivo text) rename to liberar_reserva_publica;
alter function public.mi_conductor_guardar(p_id uuid, p_nombre text, p_documento text, p_documento_pais character, p_telefono text) rename to guardar_mi_conductor;
alter function public.mi_flota_baja(p_tipo text, p_id uuid) rename to dar_baja_mi_flota;
alter function public.mi_transporte_guardar(p_nima text, p_seguro_compania text, p_seguro_poliza text, p_seguro_vence date) rename to guardar_mis_datos_transporte;
alter function public.normaliza_cp(p text) rename to normalizar_cp;
alter function public.normaliza_id_fiscal(p text) rename to normalizar_id_fiscal;
alter function public.normaliza_matricula(p text) rename to normalizar_matricula;
alter function public.p_num(p_clave text, p_defecto numeric) rename to parametro_num;
alter function public.reservar_envio(p_token uuid, p_ip inet, p_navegador text) rename to reservar_envio_publico;

CREATE OR REPLACE FUNCTION public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric DEFAULT NULL::numeric, p_pronto_pago boolean DEFAULT false, p_matricula_camion text DEFAULT NULL::text, p_matricula_remolque text DEFAULT NULL::text, p_conductor_nombre text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; o_t uuid; o_pp boolean; v_t uuid; v_res jsonb; v_tel text; v_fr int; v_fd int;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select transportista_id, pronto_pago into o_t, o_pp from envio_ofertas where id = r.oferta_id; end if;
  -- Pronto pago: un aceptado a la vez comprueba la línea (ver fn_reservas_pronto_pago_linea).
  if coalesce(p_pronto_pago, false) then perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago')); end if;

  v_t := o_t;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(p_cif);
    if v_t is null then
      -- ¿Demasiados fallos con esta carga en 24 h? Solo frena CIF desconocidos: un
      -- transportista que SÍ está en Dynamo puede aceptar aunque otros hayan probado.
      select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
      if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
      select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
      if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
        perform liberar_reserva_publica(p_reserva, 'demasiados CIF no encontrados');
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
        coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
    end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
     where id = p_reserva;
  end if;
  if v_res ->> 'resultado' = 'aceptada' then
    v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
    update envios set
      matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
      matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
      conductor_nombre   = coalesce(nullif(trim(p_conductor_nombre), ''), conductor_nombre),
      conductor_telefono = coalesce(case when length(replace(v_tel, '+', '')) >= 6 then v_tel end, conductor_telefono),
      transportista_nima = coalesce(transportista_nima, (select nima from transportistas where id = v_t))
     where id = r.envio_id;
  end if;
  return v_res || jsonb_build_object('transportista', (select nombre_visible from transportistas where id = v_t));
end $function$;
revoke all on function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_ip inet) from public, anon, authenticated, service_role;
grant execute on function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_ip inet) to anon;
grant execute on function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_ip inet) to authenticated;
grant execute on function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_ip inet) to service_role;
comment on function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric, p_pronto_pago boolean, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_ip inet) is '[Ofertas y transportistas] Enlace público de una carga: el transportista acepta la carga que tiene reservada. Si la oferta no es personal, se identifica con su CIF (ya dado de alta); cada CIF no encontrado cuenta como fallo y al llegar al tope pierde la reserva. Si queda aceptada guarda matrículas y conductor. Devuelve jsonb {resultado, transportista}. Quién: público con reserva (anon o con sesión). Argumentos: p_reserva: envio_reservas.id · p_cif: CIF del transportista (si la oferta no es personal) · p_precio: precio propuesto dentro de la banda (null = el ofertado) · p_pronto_pago: pide pronto pago · p_matricula_camion/p_matricula_remolque: matrículas · p_conductor_nombre, p_telefono: datos del conductor · p_ip: IP de quien llama.';

CREATE OR REPLACE FUNCTION public.alta_transportista_publica(p_reserva uuid, p_bolsa text, p_codigo_bolsa text, p_pais character, p_cif text, p_telefono text, p_precio numeric DEFAULT NULL::numeric, p_pronto_pago boolean DEFAULT false, p_ip inet DEFAULT NULL::inet)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record; v_t uuid; v_base numeric; v_banda numeric; v_fd int;
        o_t uuid; o_precio numeric; o_banda numeric; o_pp boolean;
        v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
        v_cod text := nullif(trim(coalesce(p_codigo_bolsa, '')), '');
        v_cif text := upper(trim(coalesce(p_cif, '')));
        v_nombre_bolsa text; v_fr int;
begin
  select * into r from envio_reservas where id = p_reserva for update;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado <> 'viva' or r.hasta < now() then return jsonb_build_object('resultado', 'reserva_caducada'); end if;
  if r.oferta_id is not null then
    select transportista_id, precio_ofertado, banda_euros, pronto_pago into o_t, o_precio, o_banda, o_pp from envio_ofertas where id = r.oferta_id;
  end if;
  if o_t is not null then return jsonb_build_object('resultado', 'oferta_personal'); end if;

  select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
  if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  -- Topes de altas online (parámetros): pendientes por carga y altas al día en total.
  if (select count(*) from envio_reservas rr join transportistas tt on tt.id = rr.transportista_id
       where rr.envio_id = r.envio_id and rr.estado = 'pendiente_revision' and 'alta_online' = any (tt.tags)) >= parametro_num('alta_online_max_pendientes_carga', 3)
     or (select count(*) from transportistas where 'alta_online' = any (tags) and creado_en > now() - interval '24 hours') >= parametro_num('alta_online_max_dia', 30) then
    return jsonb_build_object('resultado', 'demasiadas_altas');
  end if;

  -- Los cuatro datos (la pantalla ya los valida; aquí, por si llaman a la API a mano).
  if coalesce(p_bolsa, '') not in ('wtransnet', 'teleroute', 'bursa_transport', '123cargo') then
    return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'bolsa');
  end if;
  if v_cod is null or length(v_cod) > 30 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'codigo_bolsa'); end if;
  if coalesce(p_pais, '') !~ '^[A-Z]{2}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'pais'); end if;
  if length(normalizar_id_fiscal(v_cif)) not between 5 and 20 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'cif'); end if;
  if v_tel is null or v_tel !~ '^\+?[0-9]{6,15}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'telefono'); end if;

  -- Ya está en Dynamo (por CIF o por su código en esa bolsa): no se duplica.
  -- Cada intento con un CIF o código que ya existe cuenta como fallo (como en la
  -- aceptación normal): al llegar al máximo por reserva, se pierde la reserva.
  if exists (select 1 from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(v_cif))
     or exists (select 1 from transportistas where bolsa = p_bolsa and lower(trim(codigo_bolsa)) = lower(v_cod)) then
    insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_ya_existe', p_ip);
    select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
    if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
      perform liberar_reserva_publica(p_reserva, 'demasiados intentos de alta');
      return jsonb_build_object('resultado', 'demasiados_intentos');
    end if;
    return jsonb_build_object('resultado', case when exists (select 1 from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(v_cif))
                                                then 'ya_existe' else 'ya_existe_bolsa' end);
  end if;

  -- Precio: el de la oferta, o el propuesto dentro de su banda.
  select * into e from envios where id = r.envio_id for update;
  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then return jsonb_build_object('resultado', 'tomada'); end if;
  v_base := coalesce(o_precio, e.importe_transportista); v_banda := coalesce(o_banda, 0);
  if v_base is null then return jsonb_build_object('resultado', 'envio_sin_precio'); end if;
  if p_precio is not null and abs(p_precio - v_base) > v_banda then
    return jsonb_build_object('resultado', 'precio_fuera_de_banda', 'minimo', v_base - v_banda, 'maximo', v_base + v_banda);
  end if;

  v_nombre_bolsa := case p_bolsa when 'wtransnet' then 'Wtransnet' when 'teleroute' then 'Teleroute'
                                 when 'bursa_transport' then 'Bursa Transport' else '123cargo' end;
  begin
    -- La razón social es obligatoria en la tabla: hasta que Dynamo la copie de la bolsa,
    -- lleva un nombre provisional que dice de dónde sacarla.
    insert into transportistas (razon_social, cif, pais_codigo_iso, estado_operativo, bolsa, codigo_bolsa, tags, anotaciones)
    values (format('Pendiente de completar (%s %s)', v_nombre_bolsa, v_cod), v_cif, p_pais, 'no_ofertar', p_bolsa, v_cod, array['alta_online'],
            format('Alta online desde el enlace de la carga %s el %s. Datos dados: %s %s, CIF %s, teléfono %s. '
                   'PENDIENTE: comprobar que está en %s y completar razón social, dirección, seguro y email desde su ficha de la bolsa.',
                   e.referencia_gx, to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
                   v_nombre_bolsa, v_cod, v_cif, v_tel, v_nombre_bolsa))
    returning id into v_t;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'ya_existe');
  end;
  -- Cada alta cuenta en el límite diario de intentos de la carga.
  insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_online', p_ip);
  insert into contactos (transportista_id, funcion, telefono, es_principal)
  values (v_t, 'trafico', v_tel, true);

  update envio_reservas set estado = 'pendiente_revision', precio_propuesto = coalesce(p_precio, v_base), transportista_id = v_t,
         pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
   where id = p_reserva;
  perform registrar_hito(e.id, 'contraoferta_propuesta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base, 'precio_propuesto', coalesce(p_precio, v_base),
                       'alta_online', true, 'bolsa', p_bolsa, 'codigo_bolsa', v_cod, 'cif', v_cif), 'servidor');
  return jsonb_build_object('resultado', 'alta_pendiente');
end $function$;

CREATE OR REPLACE FUNCTION public.ampliar_plazo_pago(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  update envios set pago_pendiente_en = now()
   where id = p_envio and estado = 'programado' and estado_pago_previo = 'pendiente';
  return jsonb_build_object('resultado', case when found then 'ok' else 'no_pendiente' end);
end $function$;

CREATE OR REPLACE FUNCTION public.anonimizar_conductor(p_conductor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  perform set_config('dynamo.anonimizando', 'on', true);
  update conductores set nombre = 'Conductor eliminado', documento = null, telefono = null where id = p_conductor;
  if not found then perform set_config('dynamo.anonimizando', 'off', true); return jsonb_build_object('resultado', 'no_existe'); end if;
  delete from notas_internas where tabla = 'conductores' and registro_id = p_conductor;
  -- En los envíos se queda el nombre (es parte del CMR, prueba); el teléfono, no.
  update envios set conductor_telefono = null where conductor_id = p_conductor and conductor_telefono is not null;
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok');
end $function$;

CREATE OR REPLACE FUNCTION public.anonimizar_contacto(p_contacto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  perform set_config('dynamo.anonimizando', 'on', true);
  update contactos set nombre = 'Persona eliminada', telefono = null, email = 'eliminado@anonimo.invalid', cargo = null where id = p_contacto;
  if not found then perform set_config('dynamo.anonimizando', 'off', true); return jsonb_build_object('resultado', 'no_existe'); end if;
  delete from contactos where id = p_contacto;
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok');
end $function$;

CREATE OR REPLACE FUNCTION public.anonimizar_usuario(p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u usuarios%rowtype; v_email text;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  select * into u from usuarios where id = p_usuario for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if u.rol not in ('cliente', 'transportista') then return jsonb_build_object('resultado', 'solo_clientes_y_transportistas'); end if;
  v_email := 'eliminado-' || left(replace(u.id::text, '-', ''), 12) || '@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'on', true);
  update usuarios set nombre = 'Persona eliminada', email = v_email, documento = null, telefono = null, cargo = null,
                      emails_copia_avisos = '{}', estado = case when estado = 'pendiente_verificacion' then 'suspendida' else estado end
   where id = p_usuario;
  update usuarios set estado = 'suspendida', suspension_motivo = 'Datos eliminados a petición del interesado (RGPD)'
   where id = p_usuario and estado <> 'suspendida';
  delete from notas_internas where tabla = 'usuarios' and registro_id = p_usuario;
  -- Sus fichas de contacto: se vacían y se quitan (un contacto necesita teléfono o email).
  update contactos set nombre = 'Persona eliminada', telefono = null, email = 'eliminado@anonimo.invalid', cargo = null
   where lower(email) = lower(u.email);
  delete from contactos where email = 'eliminado@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok', 'email_anonimo', v_email);
end $function$;

CREATE OR REPLACE FUNCTION public.anotar_reservas_cmr_publico(p_token uuid, p_parada uuid, p_rol text, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_envio uuid; v_texto text := trim(coalesce(p_texto, '')); v_inc uuid; v_quien text; v_tipo text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;
  if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- La misma casilla que al firmar: remitente en una recogida, destinatario en una entrega,
  -- transportista sin parada. Y nunca en una casilla ya firmada.
  if p_rol = 'transportista' then
    if p_parada is not null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  else
    select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = v_envio;
    if v_tipo is null or (p_rol = 'remitente' and v_tipo <> 'carga') or (p_rol = 'destinatario' and v_tipo <> 'descarga') then
      return jsonb_build_object('resultado', 'parada_no_valida');
    end if;
  end if;
  if exists (select 1 from firmas_cmr where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio) >= 10 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  if length(v_texto) < 3 or length(v_texto) > 1000 then return jsonb_build_object('resultado', 'texto_no_valido'); end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  v_quien := case p_rol when 'remitente' then 'el cargador' when 'transportista' then 'el conductor' else 'el destinatario' end;
  insert into incidencias (tipo_id, envio_id, cliente_id, titulo, detalle)
  values ((select id from tipos_incidencia where clave = 'siniestro'), v_envio, (select cliente_id from envios where id = v_envio),
          format('Reservas en el CMR (%s)', v_quien), v_texto)
  returning id into v_inc;
  insert into cmr_reservas (envio_id, parada_id, rol, texto, incidencia_id) values (v_envio, p_parada, p_rol, v_texto, v_inc);
  return jsonb_build_object('resultado', 'ok');
end $function$;

CREATE OR REPLACE FUNCTION public.asignar_transportista(p_envio uuid, p_transportista uuid, p_importe_transportista numeric DEFAULT NULL::numeric, p_matricula_camion text DEFAULT NULL::text, p_matricula_remolque text DEFAULT NULL::text, p_conductor_nombre text DEFAULT NULL::text, p_conductor_telefono text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_t record; v_tel text := regexp_replace(coalesce(p_conductor_telefono, ''), '[^0-9+]', '', 'g');
  m text; n int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  select estado_operativo into v_t from transportistas where id = p_transportista;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'transportista_no_existe'); end if;
  if v_t.estado_operativo = 'suspendido' then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;
  if p_importe_transportista is not null and p_importe_transportista < 0 then return jsonb_build_object('ok', false, 'resultado', 'importe_no_valido'); end if;
  update envios set transportista_id = p_transportista, estado_asignacion = 'confirmada', importe_transportista = p_importe_transportista,
         matricula_camion = nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''),
         matricula_remolque = nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''),
         conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), ''),
         conductor_telefono = case when length(replace(v_tel, '+', '')) >= 6 then v_tel end
   where id = p_envio;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  return jsonb_build_object('ok', true, 'resultado', 'asignado');
end $function$;

CREATE OR REPLACE FUNCTION public.autosuspension_en_curso(o usuarios, n usuarios)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(current_setting('dynamo.autosusp', true), '') = 'on'
     and o.estado = 'activa' and n.estado = 'suspendida'
     and (n.rol, n.cliente_id, n.transportista_id, n.limite_consultas_precio_diario, n.limite_envios_diario,
          n.exento_autosuspension, n.autosuspension_desde_en, n.email)
         is not distinct from
         (o.rol, o.cliente_id, o.transportista_id, o.limite_consultas_precio_diario, o.limite_envios_diario,
          o.exento_autosuspension, o.autosuspension_desde_en, o.email)
$function$;

CREATE OR REPLACE FUNCTION public.autosuspension_revisar(p_usuario uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m text;
begin
  if p_usuario is null then return; end if;
  if not coalesce((parametro('autosuspension_activa') #>> '{}')::boolean, false) then return; end if;
  select x.motivo into m from autosuspension_motivos(p_usuario) x limit 1;
  if m is null then return; end if;
  perform set_config('dynamo.autosusp', 'on', true);
  update usuarios set estado = 'suspendida', suspendida_en = now(),
                      suspension_motivo = 'Automática (al momento) · ' || m
   where id = p_usuario and estado = 'activa';
  perform set_config('dynamo.autosusp', 'off', true);
end $function$;

CREATE OR REPLACE FUNCTION public.autosuspender_cuentas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer := 0; c record;
begin
  if not es_servidor() and not es_admin_master() then
    raise exception 'Solo el Admin Master (o el proceso diario) lanza la suspensión automática.' using errcode = '42501';
  end if;
  if not coalesce((parametro('autosuspension_activa') #>> '{}')::boolean, false) then return 0; end if;
  for c in select * from autosuspension_candidatos() loop
    update usuarios set estado = 'suspendida', suspendida_en = now(),
                        suspension_motivo = 'Automática · ' || c.motivo
     where id = c.usuario_id and estado = 'activa';
    n := n + 1;
  end loop;
  return n;
end $function$;
comment on function public.autosuspender_cuentas() is '[Sistema y tareas automáticas] Suspende las cuentas activas que cumplen los motivos de suspensión automática (los de autosuspension_candidatos). No hace nada si el parámetro autosuspension_activa está apagado. Devuelve cuántas suspendió. Quién: Admin Master o servidor (tarea diaria). Argumentos: sin argumentos.';

CREATE OR REPLACE FUNCTION public.autosuspension_motivos(p_usuario uuid DEFAULT NULL::uuid)
 RETURNS TABLE(usuario_id uuid, email text, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  d_sin_env int := parametro_num('autosuspension_sin_envios_dias', 45);
  d_acceso  int := parametro_num('autosuspension_sin_acceso_dias', 400);
  c_dia     int := parametro_num('autosuspension_consultas_dia', 15);
  c_sem     int := parametro_num('autosuspension_consultas_semana', 30);
  c_mes     int := parametro_num('autosuspension_consultas_mes', 60);
  pct       numeric := parametro_num('autosuspension_cancel_pct', 30);
  min_env   int := parametro_num('autosuspension_cancel_min_envios', 5);
  n_rec     int := parametro_num('autosuspension_cancel_recientes', 3);
  d_rec     int := parametro_num('autosuspension_cancel_recientes_dias', 10);
begin
  return query
  with base as (
    select u.id, u.email, u.rol, u.cliente_id, u.creado_en,
           coalesce(u.autosuspension_desde_en, u.creado_en) as desde,
           coalesce(u.limite_consultas_precio_diario, c_dia) as max_dia,
           au.last_sign_in_at
      from usuarios u left join auth.users au on au.id = u.id
     where u.estado = 'activa' and not u.exento_autosuspension and u.rol in ('cliente', 'transportista')
       and (p_usuario is null or u.id = p_usuario)
  ), m as (
    select b.*,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '1 day'))  as q1,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '7 days')) as q7,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '30 days')) as q30,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - make_interval(days => d_sin_env))) as q_reg1,
      (select count(*) from envios e where e.cliente_id = b.cliente_id and e.estado <> 'borrador'
          and e.estado_solicitud is distinct from 'rechazada' and e.creado_en >= now() - make_interval(days => d_sin_env)) as env_empresa,
      (select count(*) from envios e where e.creado_por = b.id and e.estado <> 'borrador' and e.creado_en >= b.desde) as env_suyos,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and (h.quien = b.id or e.cancelado_en_nombre_cliente) and e.creado_por = b.id and e.creado_en >= b.desde
            and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and (h.quien = b.id or (e.cancelado_en_nombre_cliente and e.creado_por = b.id))
            and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))
            and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_rec
    from base b
  )
  select m.id, m.email, r.motivo
    from m cross join lateral (
      select case
        when m.rol = 'cliente' and m.creado_en <= now() - make_interval(days => d_sin_env) and m.desde <= now() - make_interval(days => d_sin_env)
             and m.q_reg1 > 0 and m.env_empresa = 0
          then format('Regla 1: pide precios (%s en %s días) y su empresa no ha generado ningún envío.', m.q_reg1, d_sin_env)
        when m.creado_en <= now() - make_interval(days => d_acceso)
             and greatest(coalesce(m.last_sign_in_at, m.creado_en), m.desde) <= now() - make_interval(days => d_acceso)
          then format('Regla 2: no entra en la plataforma desde hace más de %s días.', d_acceso)
        when m.rol = 'cliente' and (m.q1 > m.max_dia or m.q7 > c_sem or m.q30 > c_mes)
          then format('Regla 3: demasiadas consultas de precio (%s hoy, %s en 7 días, %s en 30; máximo %s / %s / %s).', m.q1, m.q7, m.q30, m.max_dia, c_sem, c_mes)
        when m.rol = 'cliente' and m.env_suyos >= greatest(min_env, 1) and m.canc_suyas * 100.0 / m.env_suyos >= pct
          then format('Regla 4: ha cancelado %s de sus %s envíos (%s %%; límite %s %%).', m.canc_suyas, m.env_suyos, round(m.canc_suyas * 100.0 / m.env_suyos), pct)
        when m.rol = 'cliente' and m.canc_rec >= n_rec
          then format('Regla 5: %s cancelaciones en %s días (límite %s).', m.canc_rec, d_rec, n_rec)
      end as motivo) r
   where r.motivo is not null;
end $function$;

CREATE OR REPLACE FUNCTION public.buscar_persona(p_texto text)
 RETURNS TABLE(tipo text, id uuid, nombre text, email text, telefono text, documento text, empresa text, estado text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare q text := lower(trim(coalesce(p_texto, ''))); d text;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master.' using errcode = '42501'; end if;
  if length(q) < 3 then return; end if;
  d := regexp_replace(q, '[^0-9a-z]', '', 'g');   -- teléfonos y DNI sin espacios ni guiones
  return query
    select 'usuario'::text, u.id, u.nombre, u.email, u.telefono, u.documento,
           coalesce((select nombre_visible from clientes where id = u.cliente_id), (select nombre_visible from transportistas where id = u.transportista_id), 'Dynamo'),
           u.estado::text
      from usuarios u
     where lower(u.email) like '%' || q || '%' or lower(coalesce(u.nombre, '')) like '%' || q || '%'
        or (length(d) >= 6 and (regexp_replace(lower(coalesce(u.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%'
                                or regexp_replace(lower(coalesce(u.documento, '')), '[^0-9a-z]', '', 'g') = d))
    union all
    select 'contacto', c.id, c.nombre, c.email, c.telefono, null::text,
           coalesce((select nombre_visible from clientes where id = c.cliente_id), (select nombre_visible from transportistas where id = c.transportista_id),
                    (select nombre_empresa from sitios where id = c.sitio_id)),
           null::text
      from contactos c
     where lower(coalesce(c.email, '')) like '%' || q || '%' or lower(coalesce(c.nombre, '')) like '%' || q || '%'
        or (length(d) >= 6 and regexp_replace(lower(coalesce(c.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%')
    union all
    select 'conductor', k.id, k.nombre, null::text, k.telefono, k.documento,
           (select nombre_visible from transportistas where id = k.transportista_id),
           case when k.activo then 'activo' else 'de baja' end
      from conductores k
     where lower(k.nombre) like '%' || q || '%'
        or (length(d) >= 6 and (regexp_replace(lower(coalesce(k.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%'
                                or regexp_replace(lower(coalesce(k.documento, '')), '[^0-9a-z]', '', 'g') = d))
    limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.caducar_pagos_pendientes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null
              and now() > pago_limite(pago_pendiente_en) + interval '45 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.cambiar_ruta_envio(p_envio uuid, p_paradas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e        envios%rowtype;
  v_p      jsonb;
  v_orden  smallint := 0;
  v_id     uuid;
  v_sitio  uuid;
  v_antes  jsonb;
  v_quedan uuid[] := '{}';
  l        sitios%rowtype;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede cambiar la ruta.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio for update;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.estado not in ('borrador', 'programado', 'hacia_la_carga') then
    raise exception 'La ruta solo se puede cambiar antes de cargar (el envío está %).', replace(e.estado::text, '_', ' ');
  end if;
  if exists (select 1 from firmas_cmr where envio_id = p_envio) then
    raise exception 'Ya hay firmas en el CMR de este envío: la ruta no se puede cambiar.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'empresa', nombre_empresa, 'poblacion', poblacion, 'codigo_postal', codigo_postal) order by orden), '[]')
    into v_antes from envio_paradas where envio_id = p_envio;

  -- Las que se mantienen (deben ser de ESTE envío).
  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_id := nullif(v_p ->> 'id', '')::uuid;
    if v_id is not null then
      if not exists (select 1 from envio_paradas where id = v_id and envio_id = p_envio) then
        raise exception 'Una de las paradas no es de este envío.';
      end if;
      v_quedan := v_quedan || v_id;
    end if;
  end loop;

  set constraints all deferred;
  delete from envio_paradas where envio_id = p_envio and not (id = any(v_quedan));
  -- Primero se apartan las que quedan (orden alto), para que las nuevas no choquen.
  update envio_paradas set orden = orden + 100 where envio_id = p_envio;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_id := nullif(v_p ->> 'id', '')::uuid;
    if v_id is not null then
      update envio_paradas set orden = v_orden,
             referencia = case when v_p ? 'referencia' then nullif(trim(v_p ->> 'referencia'), '') else referencia end,
             anotaciones = case when v_p ? 'anotaciones' then nullif(trim(v_p ->> 'anotaciones'), '') else anotaciones end
       where id = v_id;
      continue;
    end if;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios)
      values (e.cliente_id, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'horarios'), ''))
      returning id into v_sitio;
    end if;
    if v_sitio is not null then
      select * into l from sitios where id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = e.cliente_id);
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (p_envio, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio nuevo le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia,
                                 pais_codigo_iso, referencia, anotaciones)
      values (p_envio, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  if e.estado <> 'borrador' then perform validar_ruta_envio(p_envio); end if;
  perform registrar_hito(p_envio, 'ruta_cambiada', null, null, jsonb_build_object('antes', v_antes,
    'despues', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'empresa', nombre_empresa, 'poblacion', poblacion, 'codigo_postal', codigo_postal) order by orden)
                  from envio_paradas where envio_id = p_envio)));
end $function$;

CREATE OR REPLACE FUNCTION public.cancelar_envio(p_envio uuid, p_motivo text DEFAULT NULL::text, p_en_nombre_cliente boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio; v_pen numeric; v_creador uuid;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo Dynamo puede cancelar un envío desde la ficha.' using errcode = '42501';
  end if;
  select estado, creado_por into v_estado, v_creador from envios where id = p_envio for update;
  if v_estado is null then raise exception 'Ese envío no existe.'; end if;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  update envios set estado = 'cancelado', cancelado_en_nombre_cliente = coalesce(p_en_nombre_cliente, false) where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500),
                         'por', case when p_en_nombre_cliente then 'cliente (por teléfono, cancelado por Dynamo)' else 'dynamo' end));
  end if;
  -- En nombre del cliente: se revisa su suspensión automática al momento, como si cancelara él.
  if p_en_nombre_cliente and v_creador is not null then perform autosuspension_revisar(v_creador); end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar'
   order by creado_en desc limit 1;
  return jsonb_build_object('penalizacion', v_pen is not null, 'importe', v_pen);
end $function$;

CREATE OR REPLACE FUNCTION public.cancelar_mi_envio(p_envio uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio; v_pen numeric;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  if v_estado not in ('borrador', 'programado') then
    raise exception 'El camión ya va hacia la carga: para cancelar, llámanos al +34 955 225 945.';
  end if;
  update envios set estado = 'cancelado',
                    estado_solicitud = case when estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta') then 'rechazada' else estado_solicitud end
   where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null, jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500), 'por', 'cliente'));
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar' order by creado_en desc limit 1;
  return jsonb_build_object('resultado', 'cancelado', 'penalizacion', v_pen is not null, 'importe', v_pen);
end $function$;

CREATE OR REPLACE FUNCTION public.carga_aceptada_publica(p_reserva uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado = 'pendiente_revision' then
    return jsonb_build_object('resultado', 'pendiente_revision', 'precio_propuesto', r.precio_propuesto);
  end if;
  if r.estado = 'viva' and r.hasta > now() then
    return jsonb_build_object('resultado', 'viva', 'hasta', r.hasta, 'ahora', now());
  end if;
  if r.estado <> 'aceptada' then
    return jsonb_build_object('resultado', case when r.estado = 'viva' then 'caducada' else r.estado end);
  end if;
  select * into e from envios where id = r.envio_id;
  if e.transportista_id is distinct from r.transportista_id then
    return jsonb_build_object('resultado', 'reasignada');
  end if;
  -- La llave caduca al terminar el viaje (entregado o cancelado).
  if not enlace_carga_vigente(e.id) then
    return jsonb_build_object('resultado', 'cerrada', 'estado', e.estado, 'referencia', e.referencia_gx);
  end if;
  return jsonb_build_object(
    'resultado', 'aceptada', 'estado', e.estado,
    'referencia', e.referencia_gx, 'referencia_cliente', e.referencia_cliente,
    'transportista', (select nombre_visible from transportistas where id = r.transportista_id),
    'precio', r.precio_aceptado, 'pronto_pago', r.pronto_pago,
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'aceptada_en', r.cerrada_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
    'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
    'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
    'discrecion_comercial', e.discrecion_comercial,
    'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
        'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia,
        'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia, 'anotaciones', p.anotaciones,
        'tipo_sitio', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        'url_google_maps', l.url_google_maps,
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record; v_tel text; v_cam text; v_rem text; v_nom text; k record;
begin
  select * into r from envio_reservas where id = p_reserva and estado = 'aceptada';
  if not found then return jsonb_build_object('resultado', 'no_aceptada'); end if;
  select * into e from envios where id = r.envio_id and transportista_id = r.transportista_id and estado in ('programado', 'hacia_la_carga');
  if not found then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;
  if not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;

  v_cam := nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), '');
  v_rem := nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), '');
  v_nom := nullif(trim(p_conductor_nombre), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  if length(replace(coalesce(v_tel, ''), '+', '')) < 6 then v_tel := null; end if;

  if v_nom is null and v_cam is not null
     and normalizar_matricula(v_cam) is distinct from normalizar_matricula(e.matricula_camion) then
    -- Camión nuevo sin chófer escrito: el de ese camión de otras veces, o vacío.
    select * into k from conductor_de_camion(r.transportista_id, v_cam);
    v_nom := k.nombre;                        -- null si ese camión no tiene historial
    v_tel := coalesce(v_tel, k.telefono);
  elsif v_nom is not null and lower(unaccent_simple(v_nom)) is distinct from lower(unaccent_simple(trim(coalesce(e.conductor_nombre, '')))) then
    -- Chófer nuevo: su teléfono, el que tenga en la flota, o vacío (nunca el del anterior).
    if v_tel is null then select telefono into v_tel from conductor_conocido(r.transportista_id, v_nom); end if;
  else
    -- Mismo chófer (o no escribe): lo que llega vacío no borra.
    v_nom := coalesce(v_nom, e.conductor_nombre);
    v_tel := coalesce(v_tel, e.conductor_telefono);
  end if;

  update envios set
    matricula_camion   = coalesce(v_cam, matricula_camion),
    matricula_remolque = coalesce(v_rem, matricula_remolque),
    conductor_nombre   = v_nom,
    conductor_telefono = v_tel
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado', 'conductor', v_nom, 'telefono', v_tel);
end $function$;
revoke all on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) from public, anon, authenticated, service_role;
grant execute on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) to anon;
grant execute on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) to authenticated;
grant execute on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) to public;
grant execute on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) to service_role;
comment on function public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text) is '[Ofertas y transportistas] Enlace público de una carga ya aceptada: el transportista completa o corrige matrícula del camión y del remolque, nombre y teléfono del conductor. Solo mientras el envío siga suyo y esté programado o hacia la carga. Ojo: los campos vacíos se borran. Devuelve {resultado}. Quién: público con reserva aceptada. Argumentos: p_reserva: envio_reservas.id (aceptada) · p_matricula_camion, p_matricula_remolque: matrículas (se quitan espacios y guiones) · p_conductor_nombre: nombre · p_telefono: mín. 6 cifras.';

CREATE OR REPLACE FUNCTION public.comprobar_cobertura(p_paradas jsonb, p_tipo_carga tipo_carga DEFAULT NULL::tipo_carga)
 RETURNS TABLE(orden integer, punto text, efecto text, mensaje text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (p ->> 'orden')::int, coalesce(nullif(p ->> 'nombre', ''), p ->> 'codigo_postal', '(parada ' || (p ->> 'orden') || ')'),
         f.efecto, f.mensaje
    from jsonb_array_elements(case when jsonb_typeof(p_paradas) = 'array' then p_paradas else '[]'::jsonb end) p
    cross join lateral restriccion_punto(left(coalesce(p ->> 'pais', 'ES'), 2), p ->> 'codigo_postal',
                                            case when p ->> 'tipo' = 'carga' then 'carga' else 'descarga' end, p_tipo_carga) f
   where f.efecto in ('bloquea', 'solo_admin')
   order by 1
$function$;

CREATE OR REPLACE FUNCTION public.conductor_de_camion(p_transportista uuid, p_matricula text)
 RETURNS TABLE(nombre text, telefono text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(c.nombre, e.conductor_nombre)::text, coalesce(c.telefono, e.conductor_telefono)::text
    from envios e left join conductores c on c.id = e.conductor_id
   where e.transportista_id = p_transportista and e.estado <> 'cancelado'
     and nullif(trim(e.conductor_nombre), '') is not null
     and normalizar_matricula(e.matricula_camion) = normalizar_matricula(p_matricula)
   order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc limit 1
$function$;

CREATE OR REPLACE FUNCTION public.contacto_transportista_oculto(p_estado estado_envio, p_entrega date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_estado in ('entregado', 'cancelado')
      or (p_entrega is not null
          and now() > ((p_entrega + 1)::timestamp at time zone 'Europe/Madrid')
                      + make_interval(hours => parametro_num('contacto_transportista_horas_tras_entrega', 12)::int))
$function$;

CREATE OR REPLACE FUNCTION public.contadores_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_rol rol_usuario;
begin
  select rol into v_rol from usuarios where id = auth.uid() and estado = 'activa';
  if v_rol is null then return '{}'::jsonb; end if;

  if v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from envios where estado = 'programado' and not es_manual and transportista_id is null and estado_pago_previo <> 'pendiente'),
      'envios_sin_pagar',   (select count(*) from envios where estado = 'programado' and estado_pago_previo = 'pendiente'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from penalizaciones where estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where requiere_pago_previo and pagado_en is null and estado <> 'cancelado'),
      'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null));
  elsif v_rol = 'cliente' then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from mis_envios() e where e.estado = 'programado' and not e.es_manual
                                and coalesce(e.estado_asignacion::text, '') <> 'confirmada'),
      'envios_sin_pagar',   (select count(*) from pagos_envio(null) p where p.estado_pago_previo = 'pendiente' and p.estado = 'programado'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones() p where p.estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where requiere_pago_previo and pagado_en is null and estado <> 'cancelado'));
  else
    return jsonb_build_object(
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones_transportista() p where p.estado = 'pendiente_confirmar'));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.contraofertar_precio_solicitud(p_envio uuid, p_importe numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_permitida boolean; v_rebaja numeric; v_auto numeric; v_max numeric; v_p numeric := round(p_importe, 2);
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  select permite_contraoferta into v_permitida from clientes where id = e.cliente_id;
  if not coalesce(v_permitida, false) or not coalesce((parametro('contraoferta_cliente_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('resultado', 'no_permitida');
  end if;
  if e.estado_solicitud <> 'precio_propuesto' or e.estado <> 'borrador' then return jsonb_build_object('resultado', 'no_esperando'); end if;
  if e.precio_caduca_en < now() then
    update envios set estado_solicitud = 'pendiente_precio', precio_caduca_en = null where id = p_envio;
    return jsonb_build_object('resultado', 'caducado');
  end if;
  if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
  if v_p is null or v_p <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if v_p >= e.importe_cliente then return jsonb_build_object('resultado', 'no_es_rebaja'); end if;

  v_rebaja := (e.importe_cliente - v_p) * 100 / e.importe_cliente;
  v_auto := parametro_num('contraoferta_cliente_auto_pct', 5);
  v_max  := parametro_num('contraoferta_cliente_max_pct', 15);
  -- Propuestas demasiado bajas: se apuntan y, a la 3.ª en 24 h, el envío no admite más
  -- propuestas ese día (así no se puede ir probando hasta dar con el % máximo).
  if (select count(*) from contraoferta_intentos where envio_id = p_envio and cuando > now() - interval '24 hours') >= 3
     or (select count(*) from contraoferta_intentos i join envios x on x.id = i.envio_id
          where x.cliente_id = e.cliente_id and i.cuando > now() - interval '24 hours') >= 6 then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  if v_rebaja > v_max then
    insert into contraoferta_intentos (envio_id, usuario_id, importe) values (p_envio, auth.uid(), v_p);
    return jsonb_build_object('resultado', 'demasiado_lejos');
  end if;

  perform set_config('dynamo.importe_contraoferta_cliente', 'on', true);
  if v_rebaja <= v_auto then
    update envios set importe_cliente_inicial = importe_cliente, importe_cliente = v_p,
                      importe_contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                      estado_solicitud = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado'
     where id = p_envio;
    perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
      jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p, 'decision', 'aceptada_auto'));
    perform set_config('dynamo.importe_contraoferta_cliente', 'off', true);
    return jsonb_build_object('resultado', 'aceptada');
  end if;
  update envios set importe_contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                    estado_solicitud = 'contraoferta', condiciones_aceptadas_en = now()
   where id = p_envio;
  perform registrar_hito(p_envio, 'contraoferta_propuesta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p));
  perform set_config('dynamo.importe_contraoferta_cliente', 'off', true);
  return jsonb_build_object('resultado', 'pendiente_revision');
end $function$;

CREATE OR REPLACE FUNCTION public.crear_envio(p_datos jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id      uuid;
  v_gx      text;
  v_cliente uuid := (p_datos ->> 'cliente_id')::uuid;
  v_p       jsonb;
  v_orden   smallint := 0;
  v_sitio   uuid;
  l         sitios%rowtype;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede crear envios por ahora.' using errcode = '42501';
  end if;
  if v_cliente is null then
    raise exception 'Falta el cliente del envio.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envio necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como maximo 4 puntos en la ruta (2 paradas ademas del origen y el destino).';
  end if;

  insert into envios (
    cliente_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta,
    descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo,
    requiere_plataforma_elevadora, requiere_nima, adr,
    importe_cliente, importe_transportista, precio_fijado_a_mano, iva_pct,
    discrecion_comercial, anotaciones_cliente
  ) values (
    v_cliente, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador',
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true),
    coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false),
    coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false),
    coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false),
    (p_datos ->> 'importe_cliente')::numeric, (p_datos ->> 'importe_transportista')::numeric,
    (p_datos ->> 'importe_cliente') is not null,
    coalesce((p_datos ->> 'iva_pct')::numeric, 21),
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false),
    nullif(trim(p_datos ->> 'anotaciones_cliente'), '')
  ) returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;

    -- Sitio nuevo que se quiere en la agenda del cliente: se crea primero.
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal,
                           poblacion, provincia, pais_codigo_iso, horarios, anotaciones)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'),
              coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'horarios'), ''), nullif(trim(v_p ->> 'anotaciones_sitio'), ''))
      returning sitios.id into v_sitio;
    end if;

    if v_sitio is not null then
      -- Copia CONGELADA de la dirección del sitio: el CMR de dentro de un año tiene que
      -- seguir diciendo a dónde se fue, aunque el sitio se edite después.
      select * into l from sitios where sitios.id = v_sitio;
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion,
              l.codigo_postal, l.poblacion, l.provincia, l.pais_codigo_iso, l.lat, l.lon,
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', nullif(trim(v_p ->> 'nombre_empresa'), ''),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  -- Confirmar: aquí se comprueban la ruta y las zonas, y se sellan los hitos.
  update envios set estado = 'programado' where envios.id = v_id;

  return query select v_id, v_gx;
end $function$;
revoke all on function public.crear_envio(p_datos jsonb, p_paradas jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crear_envio(p_datos jsonb, p_paradas jsonb) to authenticated;
grant execute on function public.crear_envio(p_datos jsonb, p_paradas jsonb) to service_role;
comment on function public.crear_envio(p_datos jsonb, p_paradas jsonb) is '[Envíos] Dynamo crea un envío completo para un cliente con sus paradas en una sola operación y lo deja programado (al confirmar se comprueban ruta y zonas y se sellan los hitos). Puede fijar precio de cliente y de transportista. Devuelve id y referencia GX. Quién: Dynamo (admin o empleado). Argumentos: p_datos: jsonb {cliente_id (obligatorio), referencia_cliente, fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_lateral/trasera/superior, requiere_plataforma_elevadora, requiere_nima, adr, importe_cliente, importe_transportista (sin IVA), iva_pct, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 paradas {tipo carga|descarga, sitio_id o datos de dirección, guardar_en_agenda, referencia, anotaciones}.';

CREATE OR REPLACE FUNCTION public.crear_envio_manual(p_datos jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := cliente_del_usuario();
  v_oper uuid := nullif(p_datos ->> 'operador_id', '')::uuid;
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede crear envíos todavía.' using errcode = '42501';
  end if;
  if v_oper is null or not exists (select 1 from operadores o where o.id = v_oper and o.cliente_id = v_cliente and not o.borrado) then
    raise exception 'Elige uno de tus operadores de transporte.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_datos ->> 'fecha_carga_desde') is null or (p_datos ->> 'fecha_carga_desde')::date < current_date then
    raise exception 'Elige una fecha de recogida de hoy en adelante.';
  end if;
  if (p_datos ->> 'precio_acordado_operador') is not null and (p_datos ->> 'precio_acordado_operador')::numeric < 0 then
    raise exception 'El precio acordado no es válido.';
  end if;

  insert into envios (cliente_id, operador_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo, requiere_plataforma_elevadora, requiere_nima, adr,
    precio_acordado_operador, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, v_oper, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador',
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true), coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false), coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false), coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false), (p_datos ->> 'precio_acordado_operador')::numeric,
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      select * into l from sitios where sitios.id = v_sitio and not borrado and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia)
      values (v_id, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''));
    end if;
  end loop;
  update envios set estado = 'programado' where envios.id = v_id;   -- comprueba la ruta y sella los hitos
  return query select v_id, v_gx;
end $function$;
revoke all on function public.crear_envio_manual(p_datos jsonb, p_paradas jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crear_envio_manual(p_datos jsonb, p_paradas jsonb) to authenticated;
grant execute on function public.crear_envio_manual(p_datos jsonb, p_paradas jsonb) to service_role;
comment on function public.crear_envio_manual(p_datos jsonb, p_paradas jsonb) is '[Envíos] El cliente crea un envío «manual»: lo mueve con su propio operador de transporte (no lo gestiona Dynamo), para tener sus papeles y seguimiento en la plataforma. Fecha de recogida de hoy en adelante. Queda programado. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_datos: jsonb {operador_id (uno de sus operadores, obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, mercancía, toneladas, metros_lineales, opciones de carga, precio_acordado_operador, discrecion_comercial, anotaciones_cliente (máx. 1000)} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia}.';

CREATE OR REPLACE FUNCTION public.crear_solicitud_envio(p_datos jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := cliente_del_usuario();
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede pedir envíos todavía.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_datos ->> 'fecha_carga_desde') is null or (p_datos ->> 'fecha_carga_desde')::date <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Elige una fecha de recogida a partir de mañana.';
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, estado_solicitud,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo, requiere_plataforma_elevadora, requiere_nima, adr,
    iva_pct, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador', 'pendiente_precio',
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true), coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false), coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false), coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false), 21,
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from sitios where sitios.id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia)
      values (v_id, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''));
    end if;
  end loop;
  perform validar_ruta_envio(v_id);
  return query select v_id, v_gx;
end $function$;
revoke all on function public.crear_solicitud_envio(p_datos jsonb, p_paradas jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crear_solicitud_envio(p_datos jsonb, p_paradas jsonb) to authenticated;
grant execute on function public.crear_solicitud_envio(p_datos jsonb, p_paradas jsonb) to service_role;
comment on function public.crear_solicitud_envio(p_datos jsonb, p_paradas jsonb) is '[Envíos] El cliente pide un envío a Dynamo: queda en borrador con la solicitud pendiente de precio, hasta que Dynamo proponga uno (proponer_precio_solicitud). Fecha de recogida a partir de mañana; 2 a 4 paradas; valida la ruta. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_datos: jsonb {fecha_carga_desde, fecha_carga_hasta, referencia_cliente, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_*, requiere_plataforma_elevadora, requiere_nima, adr, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia, anotaciones}.';

CREATE OR REPLACE FUNCTION public.datos_cmr_envio(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype;
begin
  if not (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio;
  return jsonb_build_object('num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
    'firmado', exists (select 1 from firmas_cmr f where f.envio_id = p_envio));
end $function$;

CREATE OR REPLACE FUNCTION public.datos_orden_manual(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; c clientes%rowtype; o operadores%rowtype; k record;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio;
  if e.operador_id is null then raise exception 'Este envío lo gestiona Dynamo.' using errcode = '42501'; end if;
  select * into c from clientes where id = e.cliente_id;
  select * into o from operadores where id = e.operador_id;
  select x.nombre, x.telefono, x.email into k from contactos x where x.cliente_id = c.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
      'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'precio_acordado_operador', e.precio_acordado_operador,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono, 'es_manual', true),
    'cliente', jsonb_build_object('nombre', coalesce(c.nombre_visible, c.razon_social), 'razon_social', c.razon_social, 'cif', c.cif,
      'direccion', c.direccion, 'codigo_postal', c.codigo_postal, 'poblacion', c.poblacion, 'provincia', c.provincia,
      'pais_codigo_iso', c.pais_codigo_iso, 'telefono', k.telefono, 'email', k.email, 'contacto', k.nombre),
    'porteador', jsonb_build_object('nombre', o.razon_social, 'razon_social', o.razon_social, 'cif', o.cif,
      'telefono', o.telefono, 'email', o.email, 'contacto', o.persona_contacto),
    'paradas', paradas_viaje_json(e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.deshacer_cancelacion(p_envio uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio; v_antes text; e record;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo Dynamo puede deshacer una cancelación.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado is distinct from 'cancelado' then raise exception 'El envío no está cancelado.'; end if;
  -- El estado de antes, del hito de la cancelación (el más reciente).
  select datos ->> 'estado_anterior' into v_antes from envio_hitos
   where envio_id = p_envio and hito = 'cancelado' order by cuando desc limit 1;
  if v_antes is null or v_antes = 'cancelado' then v_antes := 'programado'; end if;
  select * into e from envios where id = p_envio;
  if v_antes = 'borrador' then
    -- Era una solicitud (o un borrador): vuelve a serlo, nunca salta a programado sin
    -- precio aceptado, condiciones ni previo pago.
    update envios set estado = 'borrador',
                      estado_solicitud = case when estado_solicitud = 'rechazada' then 'pendiente_precio' else estado_solicitud end
     where id = p_envio;
    return v_antes;
  end if;
  update envios set estado = v_antes::estado_envio where id = p_envio;
  -- Pendiente de pago: plazo nuevo desde ahora (si no, se volvería a anular en minutos).
  if e.estado_pago_previo = 'pendiente' then update envios set pago_pendiente_en = now() where id = p_envio; end if;
  -- Tenía camión: se le dijo «no vayas a cargar»; ahora hay que avisarle.
  if e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'reactivada', 'urgente', 'Carga reactivada · #' || coalesce(e.referencia_gx, ''),
      'La carga que se canceló vuelve a estar en pie a tu nombre. Confírmalo con Dynamo: +34 955 225 945.', '/panel/envios?ver=' || e.id, e.id);
  end if;
  return v_antes;
end $function$;

CREATE OR REPLACE FUNCTION public.enlace_carga_caduca_en(p_envio uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dia date; v_cierre time;
begin
  select coalesce(fecha_carga_real, fecha_carga_hasta, fecha_carga_desde) into v_dia from envios where id = p_envio;
  if v_dia is null then return null; end if;
  select max(h.cierra) into v_cierre
    from envio_paradas p cross join lateral horario_del_dia(p.sitio_id, v_dia) h
   where p.envio_id = p_envio and p.tipo = 'carga' and p.sitio_id is not null;
  return ((v_dia + coalesce(v_cierre, time '23:59'))::timestamp at time zone 'Europe/Madrid')
         + make_interval(hours => parametro_num('enlace_carga_horas_tras_carga', 4)::int);
end $function$;

CREATE OR REPLACE FUNCTION public.es_equipo_dynamo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol in ('admin','empleado') and estado = 'activa'
  )
$function$;

CREATE OR REPLACE FUNCTION public.es_admin_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'admin' and estado = 'activa')
$function$;

CREATE OR REPLACE FUNCTION public.euros_texto(p numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p is null then '—'
              else translate(to_char(p, 'FM999,999,990.00'), ',.', '.,') || ' €' end
$function$;

CREATE OR REPLACE FUNCTION public.exportar_datos_usuario(p_usuario uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid := coalesce(p_usuario, auth.uid()); u usuarios%rowtype;
begin
  if v is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  if v <> auth.uid() and not ve_todo() then raise exception 'Solo tus datos.' using errcode = '42501'; end if;
  select * into u from usuarios where id = v;
  if not found then return null; end if;
  return jsonb_build_object(
    'generado_en', now(),
    'responsable', jsonb_build_object('empresa', (select valor #>> '{}' from parametros where clave = 'dynamo_razon_social'),
                                      'contacto', 'info@dynamotrans.com'),
    'cuenta', jsonb_build_object('email', u.email, 'nombre', u.nombre, 'telefono', u.telefono, 'documento', u.documento,
                                 'cargo', u.cargo, 'idioma', u.idioma, 'rol', u.rol, 'estado', u.estado,
                                 'suspension_motivo', u.suspension_motivo, 'creado_en', u.creado_en, 'ultima_conexion', u.ultima_conexion,
                                 'emails_copia_avisos', u.emails_copia_avisos),
    'empresa', coalesce((select jsonb_build_object('tipo', 'cliente', 'nombre', nombre_visible, 'cif', cif) from clientes where id = u.cliente_id),
                        (select jsonb_build_object('tipo', 'transportista', 'nombre', nombre_visible, 'cif', cif) from transportistas where id = u.transportista_id)),
    'como_contacto', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'cargo', c.cargo, 'telefono', c.telefono, 'email', c.email, 'recibe_avisos', c.recibe_avisos))
                                 from contactos c where lower(c.email) = lower(u.email)), '[]'),
    'envios_creados', coalesce((select jsonb_agg(jsonb_build_object('referencia', e.referencia_gx, 'creado_en', e.creado_en, 'estado', e.estado,
                                   'fecha_carga', e.fecha_carga_desde) order by e.creado_en)
                                 from envios e where e.creado_por = v), '[]'),
    -- Firmas del CMR con su email: solo fecha y papel (el email lo teclea quien firma y no
    -- se verifica: el nombre y el documento podrían ser de otra persona).
    'firmas_cmr_con_tu_email', coalesce((select jsonb_agg(jsonb_build_object('firmado_en', f.firmado_en, 'papel', f.rol))
                              from firmas_cmr f where u.email is not null and lower(f.email) = lower(u.email)), '[]'),
    'consultas_precio_12_meses', (select count(*) from consultas_precio where usuario_id = v),
    'tiempo_conectado_12_meses', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'minutos', minutos) order by dia)
                                             from conexion_minutos where usuario_id = v), '[]'),
    'nota', 'Esto es lo que la plataforma de Dynamo guarda sobre ti. Las anotaciones internas del equipo y los registros de seguridad se facilitan a petición por email a info@dynamotrans.com.'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.flota_sugerencia(p_transportista uuid, p_matricula text DEFAULT NULL::text, p_conductor_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k record;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  if nullif(trim(p_matricula), '') is not null then
    select * into k from conductor_de_camion(p_transportista, p_matricula);
    return jsonb_build_object('conductor', k.nombre, 'telefono', k.telefono);
  elsif nullif(trim(p_conductor_nombre), '') is not null then
    select * into k from conductor_conocido(p_transportista, p_conductor_nombre);
    return jsonb_build_object('conductor', coalesce(k.nombre, trim(p_conductor_nombre)), 'telefono', k.telefono);
  end if;
  return '{}'::jsonb;
end $function$;
revoke all on function public.flota_sugerencia(p_transportista uuid, p_matricula text, p_conductor_nombre text) from public, anon, authenticated, service_role;
grant execute on function public.flota_sugerencia(p_transportista uuid, p_matricula text, p_conductor_nombre text) to authenticated;
grant execute on function public.flota_sugerencia(p_transportista uuid, p_matricula text, p_conductor_nombre text) to service_role;
comment on function public.flota_sugerencia(p_transportista uuid, p_matricula text, p_conductor_nombre text) is '[Ofertas y transportistas] Ficha de Dynamo (Asignar transportista): al escribir una matrícula, el chófer y teléfono de ese camión de otras veces con ese transportista; al escribir un chófer, su teléfono conocido. Vacío si no hay. Quién: Dynamo y servidor. Argumentos: p_transportista: transportistas.id · p_matricula · p_conductor_nombre.';

CREATE OR REPLACE FUNCTION public.flota_sugerencia_publica(p_reserva uuid, p_matricula text DEFAULT NULL::text, p_conductor_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; k record;
begin
  select x.* into r from envio_reservas x join envios e on e.id = x.envio_id and e.transportista_id = x.transportista_id
   where x.id = p_reserva and x.estado = 'aceptada';
  if not found or not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'no_valida'); end if;
  if nullif(trim(p_matricula), '') is not null then
    select * into k from conductor_de_camion(r.transportista_id, p_matricula);
    return jsonb_build_object('resultado', 'ok', 'conductor', k.nombre, 'telefono', k.telefono);
  elsif nullif(trim(p_conductor_nombre), '') is not null then
    select * into k from conductor_conocido(r.transportista_id, p_conductor_nombre);
    return jsonb_build_object('resultado', 'ok', 'conductor', coalesce(k.nombre, trim(p_conductor_nombre)), 'telefono', k.telefono);
  end if;
  return jsonb_build_object('resultado', 'ok');
end $function$;
revoke all on function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor_nombre text) from public, anon, authenticated, service_role;
grant execute on function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor_nombre text) to anon;
grant execute on function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor_nombre text) to authenticated;
grant execute on function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor_nombre text) to service_role;
comment on function public.flota_sugerencia_publica(p_reserva uuid, p_matricula text, p_conductor_nombre text) is '[Ofertas y transportistas] Enlace público de la carga: al escribir una matrícula, el chófer y teléfono de ese camión de otras veces; al escribir un chófer, su teléfono conocido. Solo de la flota del transportista de la reserva y mientras el enlace valga. Quién: público con la reserva aceptada. Argumentos: p_reserva: envio_reservas.id · p_matricula · p_conductor_nombre.';

CREATE OR REPLACE FUNCTION public.fn_almacenamientos_campos_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cli uuid := cliente_del_usuario(); t record; semanas integer; c record; recalcular boolean;
begin
  -- Dynamo y el servidor (sin cliente en la sesión) no pasan por aquí.
  if es_equipo_dynamo() or v_cli is null then return new; end if;

  if tg_op = 'INSERT' then
    new.cliente_id := v_cli;
    new.estado     := 'pendiente_confirmar';
    new.pagado_en  := null;
    new.anotaciones := null;
    recalcular := true;
  else
    -- Lo que el cliente no cambia nunca en uno ya pedido.
    new.cliente_id  := old.cliente_id;
    new.almacen_id  := old.almacen_id;
    new.pagado_en   := old.pagado_en;
    new.anotaciones := old.anotaciones;
    new.iva_pct    := old.iva_pct;
    new.requiere_pago_previo := old.requiere_pago_previo;
    recalcular := (new.fecha_entrada, new.fecha_salida, new.num_trailers, new.num_repartos)
                  is distinct from (old.fecha_entrada, old.fecha_salida, old.num_trailers, old.num_repartos);
    if not recalcular then
      new.importe_almacenaje := old.importe_almacenaje;
      new.importe_reparto    := old.importe_reparto;
    end if;
  end if;

  if recalcular then
    select * into t from tarifa_almacen(new.almacen_id);
    semanas := greatest(1, ceil(greatest(new.fecha_salida - new.fecha_entrada, 1) / 7.0)::integer);
    new.importe_almacenaje := round(new.num_trailers * semanas * coalesce(t.semana, 240), 2);
    new.importe_reparto    := round(new.num_repartos * coalesce(t.reparto, 220), 2);
  end if;
  if tg_op = 'INSERT' then
    select iva_pct, riesgo_efectivo_euros into c from clientes where id = v_cli;
    new.iva_pct    := coalesce(c.iva_pct, 21);
    -- Sin crédito (CESCE o de Dynamo) se paga por adelantado con proforma.
    new.requiere_pago_previo := not (coalesce(c.riesgo_efectivo_euros, 0) > 0);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_envios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text := (select rol::text from usuarios where id = auth.uid());
  v_dynamo boolean := coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false);
  v_por_cliente boolean := coalesce(v_rol = 'cliente', false);
  v_ref text := '#' || coalesce(new.referencia_gx, '');
  v_cli text;
  v_enl text := '/panel/envios?ver=' || new.id;
  o_sol text; o_est estado_envio; o_cam text; o_pago text; o_tr uuid;
begin
  if coalesce(new.es_manual, false) then return null; end if;
  select nombre_visible into v_cli from clientes where id = new.cliente_id;
  v_cli := coalesce(v_cli, 'El cliente');
  if tg_op = 'UPDATE' then
    o_sol := old.estado_solicitud; o_est := old.estado; o_cam := old.estado_cambio_cliente; o_pago := old.estado_pago_previo; o_tr := old.transportista_id;
  end if;

  -- Solicitudes de precio y contraofertas del cliente.
  if new.estado_solicitud is distinct from o_sol then
    if new.estado_solicitud = 'pendiente_precio' then
      perform crear_aviso('dynamo', null, null, 'solicitud', 'aviso', 'Solicitud de precio · ' || v_ref,
        v_cli || case when o_sol = 'precio_propuesto' then ' vuelve a pedir precio (el anterior caducó).' else ' pide precio para un envío.' end, v_enl, new.id);
    elsif new.estado_solicitud = 'precio_propuesto' then
      if o_sol = 'contraoferta' then
        perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_rechazada', 'aviso', 'Tu propuesta de precio no se ha aceptado · ' || v_ref,
          'Puedes aceptar nuestro precio (' || euros_texto(new.importe_cliente) || ' + IVA) o cancelar sin coste.', v_enl, new.id);
      else
        perform crear_aviso('cliente', new.cliente_id, null, 'precio', 'ok', 'Ya tienes precio · envío ' || v_ref,
          euros_texto(new.importe_cliente) || ' + IVA. Revísalo y acéptalo antes de que caduque.', v_enl, new.id);
      end if;
    elsif new.estado_solicitud = 'contraoferta' then
      perform crear_aviso('dynamo', null, null, 'importe_contraoferta_cliente', 'aviso', 'Contraoferta del cliente · ' || v_ref,
        v_cli || ' propone ' || euros_texto(new.importe_contraoferta_cliente) || ' (le dimos ' || euros_texto(new.importe_cliente) || ').', v_enl, new.id);
    elsif new.estado_solicitud = 'aceptada' and o_sol = 'contraoferta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
        'Tu envío queda confirmado a ' || euros_texto(new.importe_cliente) || ' + IVA.', v_enl, new.id);
    end if;
  end if;

  -- El cliente confirma su envío.
  if tg_op = 'UPDATE' and o_est = 'borrador' and new.estado = 'programado' and v_por_cliente then
    perform crear_aviso('dynamo', null, null, 'confirmado', 'info', 'Envío confirmado · ' || v_ref,
      v_cli || ' lo ha confirmado' || case when new.estado_pago_previo = 'pendiente' then ' (pendiente de pago).' else '.' end, v_enl, new.id);
  end if;

  -- Cambios pedidos por el cliente.
  if new.estado_cambio_cliente is distinct from o_cam then
    if new.estado_cambio_cliente = 'pendiente' then
      perform crear_aviso('dynamo', null, null, 'cambio', 'aviso', 'Cambio pedido · ' || v_ref, v_cli || ' pide un cambio en su envío.', v_enl, new.id);
    elsif new.estado_cambio_cliente in ('aceptado', 'rechazado') then
      perform crear_aviso('cliente', new.cliente_id, null, 'cambio_' || new.estado_cambio_cliente,
        case when new.estado_cambio_cliente = 'aceptado' then 'ok' else 'aviso' end,
        'Tu cambio ha sido ' || new.estado_cambio_cliente || ' · ' || v_ref, new.cambio_cliente_nota, v_enl, new.id);
    end if;
  end if;

  -- Pago por adelantado.
  if tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'pagado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.', v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.', v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.', v_enl, new.id);
  end if;

  -- Transportista asignado.
  if tg_op = 'UPDATE' and new.transportista_id is not null and new.transportista_id is distinct from o_tr and new.estado <> 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'asignado', 'ok', 'Tu envío ya tiene transportista · ' || v_ref, null, v_enl, new.id);
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Carga asignada · ' || v_ref,
      'Revisa los datos y la orden de carga.', v_enl, new.id);
  end if;

  -- En ruta, entregado, cancelado.
  if tg_op = 'UPDATE' and new.estado is distinct from o_est then
    if new.estado = 'en_ruta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'entregado' then
      perform crear_aviso('cliente', new.cliente_id, null, 'entregado', 'ok', 'Entregado · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'cancelado' then
      if v_por_cliente then
        perform crear_aviso('dynamo', null, null, 'cancelado', case when o_tr is not null then 'urgente' else 'aviso' end,
          'Cancelado por el cliente · ' || v_ref,
          v_cli || ' lo ha cancelado' || case when o_tr is not null then '. Tenía camión: avisa al transportista.' else '.' end, v_enl, new.id);
      elsif auth.uid() is null and new.estado_pago_previo = 'pendiente' then
        -- Anulado por el sistema: pasó el plazo para pagar.
        perform crear_aviso('cliente', new.cliente_id, null, 'pago_caducado', 'aviso', 'Envío anulado: no recibimos el pago · ' || v_ref,
          'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.', '/panel/nuevo-envio?repetir=' || new.id, new.id);
        perform crear_aviso('dynamo', null, null, 'pago_caducado', 'info', 'Anulado por falta de pago · ' || v_ref,
          v_cli || ' no pagó a tiempo.', v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al +34 955 225 945.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Carga cancelada · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al +34 955 225 945.', null, new.id);
      end if;
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_penalizaciones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; v_tipo text;
begin
  if not (new.estado = 'confirmada' and old.estado is distinct from 'confirmada') then return null; end if;
  select id, referencia_gx, cliente_id, transportista_id into e from envios where id = new.envio_id;
  select nombre into v_tipo from tipos_penalizacion where id = new.tipo_id;
  if coalesce(new.importe_cliente, 0) > 0 then
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', 'aviso', 'Penalización · envío #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_texto(new.importe_cliente) || ' + IVA. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  if coalesce(new.importe_transportista, 0) > 0 and e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', 'aviso', 'Penalización · carga #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_texto(new.importe_transportista) || '. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_reservas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ref text; v_tr text; v_enl text := '/panel/envios?ver=' || new.envio_id;
begin
  if new.estado = old.estado then return null; end if;
  select '#' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id;
  select nombre_visible into v_tr from transportistas where id = new.transportista_id;
  v_tr := coalesce(v_tr, 'Un transportista');
  if old.estado = 'viva' and new.estado = 'pendiente_revision' then
    perform crear_aviso('dynamo', null, null, 'contraoferta_transportista', 'aviso', 'Contraoferta de transportista · ' || v_ref,
      v_tr || ' propone ' || euros_texto(new.precio_propuesto) || '.', v_enl, new.envio_id);
  elsif old.estado = 'viva' and new.estado = 'aceptada' then
    perform crear_aviso('dynamo', null, null, 'carga_aceptada', 'ok', 'Carga aceptada · ' || v_ref,
      v_tr || ' la acepta a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'aceptada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · carga ' || v_ref,
      'La carga es tuya a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'rechazada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_rechazada', 'aviso', 'Tu contraoferta no ha salido · carga ' || v_ref,
      case when new.motivo_cierre is not null then upper(left(new.motivo_cierre, 1)) || substr(new.motivo_cierre, 2) || '.' end, null, new.envio_id);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_bloqueo_mantenimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_directo boolean;
begin
  -- Conexión directa (pg_cron, migraciones): ni API (authenticator) ni usuario en la sesión.
  v_directo := session_user not in ('authenticator', 'anon', 'authenticated')
               and nullif(current_setting('request.jwt.claim.sub', true), '') is null
               and nullif(current_setting('request.jwt.claims', true), '') is null;
  if mantenimiento_activo() and not es_equipo_dynamo() and not es_servidor() and not v_directo then
    raise exception 'La plataforma está en mantenimiento: vuelve a intentarlo en un rato.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_clientes_factor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Cambio hecho por la propia regla automática: se deja pasar tal cual.
  if current_setting('dynamo.factor_auto', true) = '1' then return new; end if;

  if tg_op = 'INSERT' then
    if not new.factor_fijado_a_mano then
      new.factor_tarifa_pct := factor_automatico(new.id);   -- sin envios: bienvenida
    end if;
    return new;
  end if;

  if old.factor_fijado_a_mano and not new.factor_fijado_a_mano then
    -- Vuelta al automatico: se recalcula con la regla.
    new.factor_tarifa_pct := factor_automatico(new.id);
  elsif new.factor_tarifa_pct is distinct from old.factor_tarifa_pct then
    -- Alguien lo ha cambiado a mano: desde ahora manda Dynamo.
    new.factor_fijado_a_mano := true;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_clientes_iva_pais()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    -- Lo que llega con el valor por defecto (21) se ajusta al país; otro valor es a mano.
    if new.iva_pct = 21 and coalesce(new.pais_codigo_iso, 'ES') <> 'ES' then new.iva_pct := 0; end if;
  elsif new.pais_codigo_iso is distinct from old.pais_codigo_iso and new.iva_pct = old.iva_pct then
    new.iva_pct := case when coalesce(new.pais_codigo_iso, 'ES') = 'ES' then 21 else 0 end;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_clientes_sitio_defecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sitio_principal_id is not null
     and new.sitio_principal_id is distinct from old.sitio_principal_id
     and not exists (select 1 from sitios l
                      where l.id = new.sitio_principal_id
                        and l.cliente_id = new.id and not l.borrado) then
    raise exception 'El sitio principal tiene que ser uno de los sitios de ese cliente.'
      using errcode = '23514';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_consultas_precio_autosusp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform autosuspension_revisar(new.usuario_id);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_documentos_autor()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if auth.uid() is not null and not es_equipo_dynamo() then new.creado_por := auth.uid(); new.visible_cliente := false; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_documentos_recurso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not es_equipo_dynamo()
     and (new.es_recurso or (tg_op = 'UPDATE' and old.es_recurso)) then
    raise exception 'Solo el equipo de Dynamo publica documentos en Recursos.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envio_hitos_autosusp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform autosuspension_revisar(new.quien);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_aa_fecha_lejana()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_max int := parametro_num('envio_antelacion_max_dias', 120)::int;
begin
  if new.fecha_carga_desde is not null and v_max > 0
     and new.fecha_carga_desde > (now() at time zone 'Europe/Madrid')::date + v_max
     and (tg_op = 'INSERT' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and not es_servidor() and not es_equipo_dynamo() then
    raise exception 'Como mucho se puede programar con % días de antelación. Para más, llámanos al +34 955 225 945.', v_max using errcode = '22023';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_aa_fecha_pasada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.fecha_carga_desde is not null
     and new.fecha_carga_desde < (now() at time zone 'Europe/Madrid')::date
     and (tg_op = 'INSERT' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and not es_servidor() and not es_admin_master() then
    raise exception 'Solo el Admin Master puede poner una fecha de carga pasada.' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_aa_previo_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m text; dynamo boolean := es_servidor() or es_equipo_dynamo();
begin
  if tg_op = 'UPDATE' and not dynamo
     and (new.estado_pago_previo, new.pago_motivo, new.pago_metodo, new.pagado_en, new.pago_resuelto_por, new.pago_exento_motivo, new.stripe_pago_ref)
         is distinct from
         (old.estado_pago_previo, old.pago_motivo, old.pago_metodo, old.pagado_en, old.pago_resuelto_por, old.pago_exento_motivo, old.stripe_pago_ref) then
    raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not dynamo then
    new.estado_pago_previo := 'no_requerido'; new.pago_motivo := null; new.pago_metodo := null; new.pagado_en := null;
    new.pago_resuelto_por := null; new.pago_exento_motivo := null; new.stripe_pago_ref := null;
  end if;

  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.estado_pago_previo = 'no_requerido'
     and (tg_op = 'INSERT' or old.estado = 'borrador') then
    m := pago_previo_motivo(new.cliente_id, new.id);
    if m is not null then new.estado_pago_previo := 'pendiente'; new.pago_motivo := m; end if;
  end if;

  if new.estado_pago_previo = 'pendiente' and (
       (new.transportista_id is not null and new.transportista_id is distinct from (case when tg_op = 'UPDATE' then old.transportista_id end))
    or (new.publicado_en_bolsa_en is not null and (tg_op = 'INSERT' or old.publicado_en_bolsa_en is null))
    or (new.estado_asignacion <> 'sin_asignar' and (tg_op = 'INSERT' or old.estado_asignacion = 'sin_asignar'))) then
    raise exception 'Envío pendiente de pago: no se puede ofertar, publicar ni asignar hasta que esté pagado (o Dynamo lo pase sin pago previo).'
      using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_ab_precio_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- Sello del precio: lo pone la base de datos.
  if tg_op = 'INSERT' then
    new.precio_calculado_en := case when new.importe_cliente is not null then now() end;
  elsif new.importe_cliente is distinct from old.importe_cliente then
    new.precio_calculado_en := now();
  else
    new.precio_calculado_en := old.precio_calculado_en;
  end if;
  -- Las columnas de la revisión solo las tocan las funciones de la revisión.
  if coalesce(current_setting('dynamo.revision_precio', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.estado_revision_precio := null; new.fecha_revision_precio := null; new.importe_revision_anterior := null;
      new.importe_revision_nuevo := null; new.revision_precio_en := null; new.revision_precio_recordada := false;
      new.cancelacion_sin_coste := false;
    else
      new.estado_revision_precio := old.estado_revision_precio; new.fecha_revision_precio := old.fecha_revision_precio;
      new.importe_revision_anterior := old.importe_revision_anterior; new.importe_revision_nuevo := old.importe_revision_nuevo;
      new.revision_precio_en := old.revision_precio_en; new.revision_precio_recordada := old.revision_precio_recordada;
      new.cancelacion_sin_coste := old.cancelacion_sin_coste and new.estado = 'cancelado';
    end if;
  end if;
  -- Al confirmar o al cambiar la fecha: ¿precio cerrado o provisional?
  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.fecha_carga_desde is not null
     and new.estado_pago_previo is distinct from 'pagado' and new.transportista_id is null and new.estado_asignacion = 'sin_asignar'
     and (tg_op = 'INSERT' or old.estado = 'borrador' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and (tg_op = 'INSERT' or old.estado_revision_precio is distinct from 'esperando_cliente') then
    if new.fecha_carga_desde - v_hoy > parametro_num('precio_cerrado_dias', 7) then
      new.estado_revision_precio := 'pendiente';
      new.fecha_revision_precio := dias_habiles_antes(new.fecha_carga_desde, parametro_num('precio_revision_dias_habiles', 3)::int);
      new.importe_revision_anterior := null; new.importe_revision_nuevo := null; new.revision_precio_en := null; new.revision_precio_recordada := false;
    elsif tg_op = 'UPDATE' and old.estado = 'programado' and new.estado_revision_precio = 'pendiente' then
      -- Se adelanta la fecha y ya entra en el plazo cerrado: toca revisar ya.
      new.estado_revision_precio := 'revisar'; new.fecha_revision_precio := v_hoy;
    end if;
  end if;
  -- Pagado: el precio queda cerrado (ya está cobrado).
  if new.estado_pago_previo = 'pagado' and precio_por_revisar(new.estado_revision_precio) then
    new.estado_revision_precio := 'hecha'; new.revision_precio_en := now();
  end if;
  -- Con precio provisional: ni oferta, ni bolsa, ni camión.
  if precio_por_revisar(new.estado_revision_precio) and new.estado <> 'cancelado' and (
       (new.transportista_id is not null and new.transportista_id is distinct from (case when tg_op = 'UPDATE' then old.transportista_id end))
    or (new.publicado_en_bolsa_en is not null and (tg_op = 'INSERT' or old.publicado_en_bolsa_en is null))
    or (new.estado_asignacion <> 'sin_asignar' and (tg_op = 'INSERT' or old.estado_asignacion = 'sin_asignar'))) then
    raise exception 'Precio provisional: no se puede ofertar, publicar ni asignar hasta revisar el precio (botón «Revisar precio» de la ficha).'
      using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_ae_pagado_precio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.estado_pago_previo = 'pagado' and new.estado_pago_previo = 'pagado'
     and (new.importe_cliente, new.iva_pct) is distinct from (old.importe_cliente, old.iva_pct) then
    raise exception 'Este envío ya está pagado por adelantado: no se puede cambiar su precio ni su IVA. Deshaz antes el pago (o regulariza la diferencia en la factura).'
      using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_cambios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.requiere_revision_precio, new.cambio_cliente, new.cambio_cliente_en, new.estado_cambio_cliente, new.cambio_cliente_nota)
     is distinct from (old.requiere_revision_precio, old.cambio_cliente, old.cambio_cliente_en, old.estado_cambio_cliente, old.cambio_cliente_nota)
     and not es_servidor() and not es_equipo_dynamo()
     and coalesce(current_setting('dynamo.cambio_envio', true), '') <> 'on' then
    raise exception 'Los cambios se piden con «Pedir un cambio».' using errcode = '42501';
  end if;
  if old.requiere_revision_precio and new.requiere_revision_precio
     and (new.importe_cliente, new.importe_transportista) is distinct from (old.importe_cliente, old.importe_transportista) then
    new.requiere_revision_precio := false;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_cancelado_en_nombre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.estado = 'cancelado' and new.estado <> 'cancelado' then new.cancelado_en_nombre_cliente := false; end if;
  if new.cancelado_en_nombre_cliente and not old.cancelado_en_nombre_cliente and not es_equipo_dynamo() and not es_servidor() then
    raise exception 'Solo Dynamo marca una cancelación en nombre del cliente.' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_consulta_precio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado_solicitud = 'pendiente_precio' then
    insert into consultas_precio (usuario_id, cliente_id, envio_id, origen)
    values (coalesce(new.creado_por, auth.uid()), new.cliente_id, new.id, 'solicitud');
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_contraoferta_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.importe_contraoferta_cliente, new.contraoferta_cliente_en, new.importe_cliente_inicial)
     is distinct from (old.importe_contraoferta_cliente, old.contraoferta_cliente_en, old.importe_cliente_inicial)
     and not es_servidor() and not es_equipo_dynamo()
     and coalesce(current_setting('dynamo.importe_contraoferta_cliente', true), '') <> 'on' then
    raise exception 'La contraoferta solo se hace desde «Proponer otro precio».' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_fin_bienvenida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.es_manual or new.estado in ('borrador', 'cancelado') then return null; end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' then return null; end if;

  perform set_config('dynamo.factor_auto', '1', true);
  update clientes c set factor_tarifa_pct = factor_automatico(c.id)
   where c.id = new.cliente_id and not c.factor_fijado_a_mano
     and c.factor_tarifa_pct is distinct from factor_automatico(c.id);
  perform set_config('dynamo.factor_auto', '', true);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_flota_alta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_tipo tipo_vehiculo; v_tel text;
begin
  if new.operador_id is not null then return new; end if;

  -- Camión
  if tg_op = 'INSERT' or new.matricula_camion is distinct from old.matricula_camion then
    new.vehiculo_camion_id := null;
    if nullif(trim(new.matricula_camion), '') is not null then
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normalizar_matricula(matricula) = normalizar_matricula(new.matricula_camion) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo, tiene_plataforma_elevadora)
        values (new.transportista_id, upper(trim(new.matricula_camion)),
                (case when nullif(trim(new.matricula_remolque), '') is not null then 'tractora'
                     when new.requiere_plataforma_elevadora then 'rigido' else 'tractora' end)::tipo_vehiculo,
                coalesce(new.requiere_plataforma_elevadora, false))
        returning id into v_id;
        new.vehiculo_camion_id := v_id;
      elsif v_tipo <> 'remolque' then
        new.vehiculo_camion_id := v_id;
        update vehiculos set transportista_id = new.transportista_id where id = v_id and transportista_id is null;
      end if;
    end if;
  end if;

  -- Remolque
  if tg_op = 'INSERT' or new.matricula_remolque is distinct from old.matricula_remolque then
    new.vehiculo_remolque_id := null;
    if nullif(trim(new.matricula_remolque), '') is not null then
      v_id := null;
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normalizar_matricula(matricula) = normalizar_matricula(new.matricula_remolque) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo)
        values (new.transportista_id, upper(trim(new.matricula_remolque)), 'remolque')
        returning id into v_id;
        new.vehiculo_remolque_id := v_id;
      elsif v_tipo = 'remolque' then
        new.vehiculo_remolque_id := v_id;
      end if;
    end if;
  end if;

  -- Conductor: por nombre (y teléfono, si lo hay), sin distinguir mayúsculas ni acentos.
  if tg_op = 'INSERT' or new.conductor_nombre is distinct from old.conductor_nombre
     or new.conductor_telefono is distinct from old.conductor_telefono then
    new.conductor_id := null;
    if nullif(trim(new.conductor_nombre), '') is not null then
      v_tel := nullif(regexp_replace(coalesce(new.conductor_telefono, ''), '[^0-9+]', '', 'g'), '');
      if v_tel !~ '^\+?[0-9]{6,15}$' then v_tel := null; end if;
      v_id := null;
      -- Solo entre los conductores de ESE transportista (o sin transportista todavía): dos
      -- chóferes con el mismo nombre en empresas distintas son personas distintas.
      select id into v_id from conductores
       where activo and lower(unaccent_simple(trim(nombre))) = lower(unaccent_simple(trim(new.conductor_nombre)))
         and (transportista_id is null or transportista_id is not distinct from new.transportista_id)
         and (v_tel is null or telefono is null or telefono = v_tel)
       order by (transportista_id is not distinct from new.transportista_id) desc, (telefono = v_tel) desc nulls last limit 1;
      if v_id is null then
        insert into conductores (transportista_id, nombre, telefono)
        values (new.transportista_id, trim(new.conductor_nombre), v_tel) returning id into v_id;
      else
        update conductores set telefono = coalesce(telefono, v_tel),
                               transportista_id = coalesce(transportista_id, new.transportista_id)
         where id = v_id and (telefono is null or transportista_id is null);
      end if;
      new.conductor_id := v_id;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_iva_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id then
    new.iva_pct := coalesce((select iva_pct from clientes where id = new.cliente_id), 21);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_pago_plazo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.pago_pendiente_en := case when new.estado_pago_previo = 'pendiente' and not precio_por_revisar(new.estado_revision_precio) then now() end;
  elsif new.estado_pago_previo = 'pendiente' and old.estado_pago_previo is distinct from 'pendiente' then
    new.pago_pendiente_en := case when precio_por_revisar(new.estado_revision_precio) then null else now() end;
  elsif new.estado_pago_previo = 'pendiente' and new.estado_revision_precio = 'hecha' and old.estado_revision_precio is distinct from 'hecha' then
    new.pago_pendiente_en := now();          -- precio definitivo: empieza el plazo para pagar
  elsif new.estado_pago_previo = 'pendiente' and precio_por_revisar(new.estado_revision_precio) and not precio_por_revisar(old.estado_revision_precio) then
    new.pago_pendiente_en := null;           -- vuelve a ser provisional: se paga tras la revisión
  elsif new.pago_pendiente_en is distinct from old.pago_pendiente_en and not (es_equipo_dynamo() or es_servidor()) then
    new.pago_pendiente_en := old.pago_pendiente_en;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_refrescar_ruta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_envio uuid := coalesce(new.envio_id, old.envio_id);
begin
  update envios e set
    codigo_postal_origen  = o.codigo_postal,
    poblacion_origen      = o.poblacion,
    codigo_postal_destino = d.codigo_postal,
    poblacion_destino     = d.poblacion,
    num_paradas           = coalesce(n.total, 0),
    distancia_total_km              = n.km
  from (select count(*) total, sum(distancia_siguiente_km) km
          from envio_paradas where envio_id = v_envio) n
  left join lateral (select codigo_postal, poblacion from envio_paradas
                     where envio_id = v_envio order by orden asc  limit 1) o on true
  left join lateral (select codigo_postal, poblacion from envio_paradas
                     where envio_id = v_envio order by orden desc limit 1) d on true
  where e.id = v_envio;
  return null;
end $function$;
comment on function public.fn_envios_refrescar_ruta() is '[Disparadores] Mantiene en envios codigo_postal_origen/destino, poblacion_origen/destino, num_paradas y distancia_total_km a partir de las paradas. Por disparador y no desde la app: así no se pueden desincronizar.';

CREATE OR REPLACE FUNCTION public.fuera_de_cobertura(p_pais character)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with lista as (
    select coalesce((select array(select jsonb_array_elements_text(valor)) from parametros
                      where clave = 'cobertura_paises' and jsonb_typeof(valor) = 'array'), array[]::text[]) l
  )
  select case when cardinality(l) = 0 or upper(p_pais) = any (l) then null
              else format('No trabajamos en %s. Trabajamos en %s. Escríbenos y te buscamos una alternativa.',
                          pais_nombre(p_pais),
                          (select string_agg(pais_nombre(x::char(2)), ', ' order by array_position(l, x)) from unnest(l) x)) end
    from lista
$function$;

CREATE OR REPLACE FUNCTION public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer DEFAULT NULL::integer, p_proveedor text DEFAULT 'google_routes'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  -- El UNIQUE va sobre el CP normalizado (índice funcional), así que ON CONFLICT no
  -- puede apuntar a columnas: se busca primero y se actualiza o se inserta.
  select id into v_id
    from distancias_cp
   where pais_codigo_iso_origen = upper(p_pais_codigo_iso_origen)
     and normalizar_cp(codigo_postal_origen) = normalizar_cp(p_codigo_postal_origen)
     and pais_codigo_iso_destino = upper(p_pais_codigo_iso_destino)
     and normalizar_cp(codigo_postal_destino) = normalizar_cp(p_codigo_postal_destino);

  if v_id is null then
    insert into distancias_cp (
      pais_codigo_iso_origen, codigo_postal_origen, pais_codigo_iso_destino, codigo_postal_destino, km, minutos, proveedor
    ) values (
      upper(p_pais_codigo_iso_origen), p_codigo_postal_origen, upper(p_pais_codigo_iso_destino), p_codigo_postal_destino,
      p_km, p_minutos, p_proveedor
    ) returning id into v_id;
  else
    update distancias_cp set km = p_km, minutos = p_minutos, proveedor = p_proveedor
     where id = v_id;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) from public, anon, authenticated, service_role;
grant execute on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) to anon;
grant execute on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) to authenticated;
grant execute on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) to public;
grant execute on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) to service_role;
comment on function public.guardar_km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_km numeric, p_minutos integer, p_proveedor text) is '[Distancias y cobertura] Guarda en la caché los km (y minutos) entre dos códigos postales que acaba de devolver el servicio de rutas; si ya existe la pareja, la actualiza. Devuelve el id. Las reglas por fila no dejan escribir a usuarios: en la práctica solo el servidor. Quién: servidor (con sesión lo frena RLS). Argumentos: p_pais_codigo_iso_origen, p_codigo_postal_origen, p_pais_codigo_iso_destino, p_codigo_postal_destino · p_km · p_minutos (opcional) · p_proveedor (por defecto google_routes).';

CREATE OR REPLACE FUNCTION public.guardar_km_sitios(p_origen uuid, p_destino uuid, p_km numeric, p_minutos integer DEFAULT NULL::integer, p_proveedor text DEFAULT 'google_routes'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_vo integer;
  v_vd integer;
  v_id uuid;
begin
  select version_geo into v_vo from sitios where id = p_origen;
  select version_geo into v_vd from sitios where id = p_destino;

  if v_vo is null or v_vd is null then
    raise exception 'guardar_km_sitios: sitio inexistente (origen=% destino=%)',
      p_origen, p_destino;
  end if;

  insert into distancias_sitios (
    sitio_origen_id, version_origen, sitio_destino_id, version_destino,
    km, minutos, proveedor
  ) values (
    p_origen, v_vo, p_destino, v_vd, p_km, p_minutos, p_proveedor
  )
  on conflict (sitio_origen_id, version_origen, sitio_destino_id, version_destino)
  do update set km        = excluded.km,
                minutos   = excluded.minutos,
                proveedor = excluded.proveedor
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hitos_ruta_cambiada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('dynamo.cambio_envio', 'on', true);
  update envios set requiere_revision_precio = true where id = new.envio_id and estado not in ('entregado', 'cancelado');
  perform set_config('dynamo.cambio_envio', 'off', true);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_incidencias_campos_dynamo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if es_equipo_dynamo() or es_servidor() then return new; end if;
  if tg_op = 'INSERT' then
    if new.almacenamiento_id is not null
       and not exists (select 1 from almacenamientos a where a.id = new.almacenamiento_id and a.cliente_id = cliente_del_usuario()) then
      raise exception 'Ese almacenamiento no es tuyo.' using errcode = '42501';
    end if;
    new.resolucion := null; new.resuelto_en := null;
    return new;
  end if;
  new.envio_id := old.envio_id; new.almacenamiento_id := old.almacenamiento_id;
  new.transportista_id := old.transportista_id; new.cliente_id := old.cliente_id;
  new.prioridad := old.prioridad; new.resolucion := old.resolucion; new.resuelto_en := old.resuelto_en;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_incidencias_completar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_transp uuid := transportista_del_usuario();
begin
  if v_transp is not null and not es_equipo_dynamo() then
    -- La abre un transportista: es suya y no lleva cliente.
    if tg_op = 'INSERT' then new.transportista_id := v_transp; new.cliente_id := null; end if;
  else
    if new.cliente_id is null and new.envio_id is not null then
      select cliente_id into new.cliente_id from envios where id = new.envio_id;
    end if;
    if new.cliente_id is null and new.transportista_id is null then new.cliente_id := cliente_del_usuario(); end if;
  end if;
  if new.estado = 'resuelto' and (tg_op = 'INSERT' or old.estado <> 'resuelto') then
    new.resuelto_en := now();
  elsif new.estado <> 'resuelto' then
    new.resuelto_en := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval DEFAULT '1 year'::interval)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select d.km
    from distancias_cp d
   where d.pais_codigo_iso_origen  = upper(p_pais_codigo_iso_origen)
     and normalizar_cp(d.codigo_postal_origen)  = normalizar_cp(p_codigo_postal_origen)
     and d.pais_codigo_iso_destino = upper(p_pais_codigo_iso_destino)
     and normalizar_cp(d.codigo_postal_destino) = normalizar_cp(p_codigo_postal_destino)
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$function$;
revoke all on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) from public, anon, authenticated, service_role;
grant execute on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) to anon;
grant execute on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) to authenticated;
grant execute on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) to public;
grant execute on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) to service_role;
comment on function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval) is '[Distancias y cobertura] Km guardados en la caché entre dos códigos postales (CP normalizados), o null si no hay o son más viejos que la edad máxima. Quién: Dynamo y servidor (RLS: los demás reciben null). Argumentos: p_pais_codigo_iso_origen, p_codigo_postal_origen, p_pais_codigo_iso_destino, p_codigo_postal_destino · p_max_edad: antigüedad máxima (por defecto 1 año).';

CREATE OR REPLACE FUNCTION public.km_sitios(p_origen uuid, p_destino uuid, p_max_edad interval DEFAULT '1 year'::interval)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select d.km
    from distancias_sitios d
    join sitios lo on lo.id = d.sitio_origen_id
                   and lo.version_geo = d.version_origen
    join sitios ld on ld.id = d.sitio_destino_id
                   and ld.version_geo = d.version_destino
   where d.sitio_origen_id  = p_origen
     and d.sitio_destino_id = p_destino
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$function$;

CREATE OR REPLACE FUNCTION public.fn_mover_nota_interna()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_sistema boolean := current_user not in ('authenticated', 'anon') or es_servidor() or es_equipo_dynamo();
        v_campo text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    if v_sistema and new.anotaciones is not null then perform guardar_nota_interna(tg_table_name, 'anotaciones', new.id, new.anotaciones); end if;
    new.anotaciones := null;
    if tg_table_name = 'transportistas' then
      if v_sistema and new.anotaciones_incidencias is not null then perform guardar_nota_interna('transportistas', 'anotaciones_incidencias', new.id, new.anotaciones_incidencias); end if;
      new.anotaciones_incidencias := null;
    end if;
  elsif v_campo = 'anotaciones' then
    if v_sistema then perform guardar_nota_interna(tg_table_name, 'anotaciones', new.id, new.anotaciones); end if;
    new.anotaciones := null;
  elsif v_campo = 'anotaciones_incidencias' then
    if v_sistema then perform guardar_nota_interna('transportistas', 'anotaciones_incidencias', new.id, new.anotaciones_incidencias); end if;
    new.anotaciones_incidencias := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_ofertas_precio_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from envios where id = new.envio_id and precio_por_revisar(estado_revision_precio)) then
    raise exception 'Precio provisional: no se puede ofertar hasta revisar el precio.' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_ofertas_previo_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from envios where id = new.envio_id and estado_pago_previo = 'pendiente') then
    raise exception 'Envío pendiente de pago: no se puede ofertar hasta que esté pagado (o Dynamo lo pase sin pago previo).'
      using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_restriccion_al_anadir()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_estado estado_envio;
  v_r      record;
  v_carga  tipo_carga;
  v_manual boolean;
begin
  select estado, tipo_carga, operador_id is not null
    into v_estado, v_carga, v_manual from envios where id = new.envio_id;

  if v_estado is null or v_estado in ('borrador', 'entregado', 'cancelado') or v_manual then
    return new;   -- borrador: se mira al confirmar · terminados: historia · manual: no es de Dynamo
  end if;

  for v_r in
    select * from restriccion_punto(new.pais_codigo_iso, new.codigo_postal, new.tipo, v_carga)
  loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_equipo_dynamo()) then
      raise exception 'No se puede anadir esta parada (% en %): %',
        new.tipo, coalesce(new.nombre_empresa, new.poblacion, new.codigo_postal, '?'), v_r.mensaje;
    end if;
  end loop;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.restriccion_punto(p_pais character, p_cp text, p_tipo_parada text DEFAULT 'descarga'::text, p_tipo_carga tipo_carga DEFAULT NULL::tipo_carga, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS TABLE(nombre text, efecto text, mensaje text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'Fuera de cobertura'::text, 'bloquea'::text, fuera_de_cobertura(p_pais)
   where fuera_de_cobertura(p_pais) is not null
  union all
  select * from (
    select r.nombre, r.efecto, r.mensaje
      from restricciones_servicio r
     where r.pais_codigo_iso = upper(p_pais)
       and r.activa
       and p_fecha >= r.vigente_desde
       and (r.vigente_hasta is null or p_fecha <= r.vigente_hasta)
       and (r.prefijos_cp is null
            or (p_cp is not null and exists (select 1 from unnest(r.prefijos_cp) px where normalizar_cp(p_cp) like px || '%')))
       and (r.aplica_a = 'cualquier_punto' or r.aplica_a = p_tipo_parada)
       and (r.tipo_carga is null or r.tipo_carga = p_tipo_carga)
     order by case r.efecto when 'bloquea' then 1 when 'solo_admin' then 2 else 3 end, r.nombre
  ) x
$function$;

CREATE OR REPLACE FUNCTION public.restricciones_ruta(p_envio uuid)
 RETURNS TABLE(orden smallint, punto text, tipo text, nombre text, efecto text, mensaje text)
 LANGUAGE sql
 STABLE
AS $function$
  select p.orden,
         coalesce(p.nombre_empresa, p.poblacion, p.codigo_postal, '(parada ' || p.orden || ')'),
         p.tipo,
         f.nombre, f.efecto, f.mensaje
    from envio_paradas p
    cross join lateral restriccion_punto(
      p.pais_codigo_iso,
      p.codigo_postal,
      p.tipo,
      (select e.tipo_carga from envios e where e.id = p.envio_id)
    ) f
   where p.envio_id = p_envio
   order by p.orden
$function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_campos_dynamo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not es_equipo_dynamo() and not es_servidor() then
    if new.cliente_id is distinct from old.cliente_id
       or new.es_almacen_dynamo is distinct from old.es_almacen_dynamo
       or new.disponible is distinct from old.disponible then
      raise exception 'Ese cambio solo lo puede hacer Dynamo.' using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_quitar_principal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.borrado and not old.borrado then
    update clientes set sitio_principal_id = null where sitio_principal_id = new.id;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_url_mapa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    new.url_google_maps := case when tg_op = 'UPDATE' then old.url_google_maps end;
  end if;
  if new.url_google_maps is not null and new.url_google_maps !~* '^https://' then
    raise exception 'El enlace del mapa tiene que empezar por https://' using errcode = '22023';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_usuarios_aa_autosusp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.exento_autosuspension, new.autosuspension_desde_en, new.suspendida_en, new.suspension_motivo)
     is distinct from (old.exento_autosuspension, old.autosuspension_desde_en, old.suspendida_en, old.suspension_motivo)
     and not es_servidor() and not es_equipo_dynamo() and not autosuspension_en_curso(old, new) then
    raise exception 'Solo Dynamo puede cambiar la suspensión de una cuenta.' using errcode = '42501';
  end if;
  if new.estado = 'suspendida' and old.estado is distinct from 'suspendida' then
    new.suspendida_en := coalesce(new.suspendida_en, now());
    new.suspension_motivo := coalesce(new.suspension_motivo, 'Suspendida a mano por Dynamo.');
  elsif new.estado = 'activa' and old.estado = 'suspendida' then
    new.autosuspension_desde_en := now();
    new.suspendida_en := null;
    new.suspension_motivo := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_usuarios_campos_protegidos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo_rol rol_usuario;
begin
  -- La cuenta de un Admin Master (o admin de lectura) solo la toca el Admin Master, el
  -- sistema o la consola: un empleado no le quita el rol ni le cambia los datos. Cada
  -- uno puede tocar lo suyo (las demás reglas siguen aplicando).
  if old.rol in ('admin', 'admin_lectura') and new.id is distinct from auth.uid()
     and (to_jsonb(new) - 'ultima_conexion' - 'modificado_en' - 'modificado_por') is distinct from (to_jsonb(old) - 'ultima_conexion' - 'modificado_en' - 'modificado_por')
     and not (es_admin_master() or es_servidor() or es_consola_supabase()) then
    raise exception 'La cuenta de un Admin Master solo la cambia el Admin Master.' using errcode = '42501';
  end if;
  -- Una cuenta de cliente o transportista nunca pasa a Dynamo. Tampoco un alta online
  -- (se registró sola, sin invitación): solo las invitaciones de Dynamo nacen como
  -- «cliente» provisional y luego reciben su rol.
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null
          or (old.rol in ('cliente', 'transportista') and not es_consola_supabase() and not es_servidor()
              and exists (select 1 from auth.users au where au.id = old.id and au.invited_at is null)))
     and new.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  -- El estado de un Admin Master: solo desde la consola de Supabase (tampoco con la clave de servicio).
  if old.rol = 'admin' and new.estado is distinct from old.estado and not es_consola_supabase() then
    raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
  end if;
  -- Copias de avisos, email y anotaciones internas: Dynamo o el sistema, no el dueño de la cuenta.
  if (new.emails_copia_avisos, new.email, new.anotaciones) is distinct from (old.emails_copia_avisos, old.email, old.anotaciones)
     and not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then
    raise exception 'Esos datos de la cuenta solo los cambia Dynamo.' using errcode = '42501';
  end if;

  if es_servidor() or autosuspension_en_curso(old, new) then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  -- Estado de la cuenta (2026-11-04): nadie se suspende a sí mismo, el Admin Master solo
  -- se toca desde Supabase, y una cuenta no vuelve a «pendiente de verificación».
  if new.estado is distinct from old.estado then
    if new.id = auth.uid() then
      raise exception 'Nadie puede cambiar el estado de su propia cuenta.' using errcode = '42501';
    end if;
    if old.rol = 'admin' then
      raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
    end if;
    if new.estado = 'pendiente_verificacion' then
      raise exception 'Una cuenta no puede volver a «pendiente de verificación»: o activa o suspendida.' using errcode = '42501';
    end if;
  end if;

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_envios_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_envios_diario) then
    if v_yo_rol is null or v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol in ('admin', 'admin_lectura') and new.rol is distinct from old.rol and v_yo_rol <> 'admin' then
      raise exception 'Solo el Admin Master puede conceder el rol %.', new.rol using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

comment on function public.guardar_nota_interna(p_tabla text, p_campo text, p_id uuid, p_texto text) is '[Clientes y cuentas] Guarda (o borra, si el texto va vacío) la nota interna del equipo de Dynamo sobre una ficha. Máx. 5000 caracteres. Estas notas solo las lee Dynamo. Quién: Dynamo (admin o empleado; RLS). Argumentos: p_tabla: usuarios, clientes, transportistas, vehiculos, conductores o almacenamientos · p_campo: anotaciones o anotaciones_incidencias · p_id: id de la ficha · p_texto: la nota (vacío = borrar).';

CREATE OR REPLACE FUNCTION public.guia_automatizaciones()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (ve_todo() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  return $guia$
GUÍA PARA AUTOMATIZACIONES (n8n, agentes de IA) — Plataforma Dynamo

1. CÓMO ENTRAR
   · Un usuario de Dynamo propio para las automatizaciones (p. ej. «Automatizaciones n8n», rol EMPLEADO; si solo lee,
     EMPLEADO_LECTURA). n8n inicia sesión con su email y contraseña (Supabase Auth) y llama a la API con ese token: se
     aplican las mismas reglas que en la web y la auditoría dice quién lo hizo.
   · La clave de servicio (service_role) se salta las reglas por fila: solo para tareas de sistema (p. ej. el webhook de
     Stripe → pago_envio_stripe) y nunca en un flujo que hable con terceros. Esas funciones de servidor NO salen en
     funciones_api(); su descripción se lee en el editor de Supabase. Las funciones de Dynamo comprueban «usuario de
     Dynamo»: con la clave de servicio responden «Solo Dynamo»; para ellas, el usuario propio.
   · Credenciales guardadas en n8n, nunca a la vista en los flujos.

2. LLAMAR A UNA FUNCIÓN
   · POST /rest/v1/rpc/<funcion> con los argumentos en JSON por su NOMBRE (p_envio, p_estado…). Los que tienen valor por
     defecto se pueden omitir. Lista completa: POST /rest/v1/rpc/funciones_api (o select * from funciones_api();).
   · Las que devuelven TABLE responden una lista (aunque sea de una fila).

3. ¿HA IDO BIEN? (regla para todas)
   · Error HTTP (4xx/5xx) = no se ha hecho nada. El campo «message» viene en castellano y se puede enseñar.
       - code 42501 → sin permiso (usuario equivocado o rol sin acceso). No reintentar.
       - code 55000 → plataforma en modo mantenimiento. Reintentar más tarde.
       - code PGRST202 → nombre de función o de argumento mal escrito.
       - el resto → la regla del negocio que falla va en «message» (p. ej. «Ese transportista está suspendido»).
   · Respuesta correcta con {resultado: …}: mirar «resultado». Las funciones nuevas traen además {ok: true|false}.
     Los códigos posibles de cada una están en su descripción.
   · Respuesta vacía (void) sin error = hecho.

4. ESCRIBIR: CON FUNCIONES O DIRECTO EN LA TABLA
   · Con FUNCIÓN siempre que exista (aplican previo pago, cobertura, revisión del precio, festivos, plazos…):
     crear un envío de Dynamo → crear_envio · poner precio a una solicitud de un cliente → proponer_precio_solicitud ·
     ofertar a un transportista → ofertar_envio · retirar una oferta → revocar_oferta · asignar o quitar transportista →
     asignar_transportista / quitar_transportista · cambiar la fase → marcar_estado_envio · cancelar → cancelar_envio ·
     revisar el precio de un envío lejano → revisar_precio_envio · marcar una transferencia → marcar_pago_envio ·
     horario de un sitio → guardar_horario / horario_del_dia · ¿hay cobertura? → comprobar_cobertura.
     (crear_solicitud_envio es la petición de un CLIENTE: con el usuario de Dynamo se usa crear_envio.)
   · DIRECTO en la tabla (las reglas las ponen la seguridad por filas y los disparadores): incidencias, penalizaciones,
     almacenamientos, documentos, transportistas, operadores, clientes, sitios y contactos. Al cambiar a mano el precio
     del cliente de un envío (envios.importe_cliente), poner también precio_fijado_a_mano = true.
   · Las columnas «automático» del diccionario las pone la base de datos: no se escriben nunca.

5. LEER
   · Qué significa cada dato: select * from diccionario_datos() where tabla = 'envios';
   · Envíos vistos por el cliente o el transportista: mis_envios(), mis_viajes() (sin datos de la otra parte).

6. GLOSARIO Y CONVENCIONES
   · Envío = el transporte que pide el cliente. En las pantallas del transportista se llama «carga» (antes de aceptarla:
     enlaces /carga, funciones *_carga_publica) y «viaje» (después). Es el mismo registro de envios.
   · Sitio = dirección de recogida o entrega de la agenda (tabla sitios). Polo logístico (futuro) = ciudad de referencia
     del tarifador.
   · Importes en euros SIN IVA salvo que la descripción diga otra cosa (IVA aparte: iva_pct / clientes.iva_pct).
   · date = día (hora de Madrid); timestamptz = instante, en ISO 8601 con zona. Columnas *_en = instante.
   · Países en ISO de 2 letras (ES, PT, FR…). Códigos postales como texto (conservan el 0 inicial).
   · Referencia del envío (envios.referencia_gx): la pone la base de datos, GX + número, +7 entre una y la siguiente (la
     primera, GX100888689). Es la «referencia_gx_carga» de las hojas de n8n.
   · Los valores de cada lista cerrada (estados, tipos…) están en el diccionario, columna «lista».
   · Nunca se borra el histórico: los envíos se cancelan, no se borran.

7. DATOS PERSONALES
   · Teléfonos, DNI, emails y firmas son datos personales (RGPD): no enviarlos a servicios externos (IA incluida) si no
     hace falta para la tarea, y nunca a una bolsa de cargas pública.
$guia$;
end $function$;

CREATE OR REPLACE FUNCTION public.historial_campos_cliente()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['estado', 'fecha_carga_desde', 'fecha_carga_hasta', 'fecha_carga_real', 'fecha_entrega_estimada',
               'referencia_cliente', 'descripcion_mercancia', 'metros_lineales', 'toneladas', 'tipo_carga', 'paletizado',
               'num_bultos', 'embalaje', 'volumen_m3', 'importe_cliente', 'anotaciones_cliente', 'discrecion_comercial',
               'matricula_camion', 'matricula_remolque', 'estado_solicitud', 'estado_pago_previo', 'estado_cambio_cliente',
               'adr', 'requiere_nima', 'requiere_plataforma_elevadora', 'carga_lateral', 'carga_trasera', 'carga_techo']
$function$;

CREATE OR REPLACE FUNCTION public.hito_visible_fuera(p tipo_hito)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p in ('creado','confirmado','transportista_asignado','matricula_asignada',
               'cargado','entregado','cancelado','cancelacion_deshecha',
               'orden_carga_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia')
$function$;

CREATE OR REPLACE FUNCTION public.horario_sitio_texto(p_sitio uuid, p_fecha date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when l.verano_activo and p_fecha is not null and l.horarios_verano is not null
                   and en_temporada(p_fecha, l.verano_desde, l.verano_hasta)
              then l.horarios_verano || ' (horario de verano)'
              else l.horarios end
    from sitios l where l.id = p_sitio
$function$;

CREATE OR REPLACE FUNCTION public.liberar_reserva_publica(p_reserva uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado not in ('viva','pendiente_revision') then
    return jsonb_build_object('resultado','no_estaba_activa');
  end if;
  perform 1 from envios where id = r.envio_id for update;
  update envio_reservas set estado = 'liberada', cerrada_en = now(),
         motivo_cierre = left(coalesce(p_motivo, 'liberada'), 200)
   where id = p_reserva;
  perform registrar_hito(r.envio_id, 'reserva_liberada', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'motivo', p_motivo), 'servidor');
  perform caducar_reservas(r.envio_id);
  return jsonb_build_object('resultado','liberada');
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_estado_envio(p_envio uuid, p_estado estado_envio, p_fecha_carga_real date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e record;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  if p_estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then return jsonb_build_object('ok', false, 'resultado', 'estado_no_valido'); end if;
  select estado, transportista_id, es_manual into e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('ok', false, 'resultado', 'cancelado'); end if;
  if p_estado <> 'programado' and e.transportista_id is null and not e.es_manual then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  update envios set estado = p_estado, fecha_carga_real = coalesce(p_fecha_carga_real, fecha_carga_real) where id = p_envio;
  return jsonb_build_object('ok', true, 'resultado', 'cambiado');
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede marcar exportaciones.' using errcode = '42501';
  end if;
  if p_fichero = 'venta' then
    update envios set holded_pedido_venta = case when (not p_valor) then null else referencia_gx end
     where referencia_gx = any(p_refs)
       and (case when (not p_valor) then holded_pedido_venta is not null else holded_pedido_venta is null end);
  elsif p_fichero = 'compra' then
    update envios set holded_pedido_compra = case when (not p_valor) then null else referencia_gx end
     where referencia_gx = any(p_refs)
       and (case when (not p_valor) then holded_pedido_compra is not null else holded_pedido_compra is null end);
  elsif p_fichero = 'bolsa' then
    update envios set publicado_en_bolsa_en = case when (not p_valor) then null else now() end
     where referencia_gx = any(p_refs)
       and (case when (not p_valor) then publicado_en_bolsa_en is not null
                 else publicado_en_bolsa_en is null or modificado_en > publicado_en_bolsa_en end);
  else
    raise exception 'Fichero de exportación no válido: %', p_fichero;
  end if;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean) from public, anon, authenticated, service_role;
grant execute on function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean) to authenticated;
grant execute on function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean) to service_role;
comment on function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean) is '[Facturación] Marca (o desmarca) como exportados unos envíos por referencia GX: pedido de venta o de compra a facturación, o publicado en bolsa (se puede volver a publicar si cambió). Devuelve cuántos envíos cambió. Quién: Dynamo (admin o empleado). Argumentos: p_fichero: venta, compra o bolsa · p_refs: array de referencias GX · p_valor (false = quitar la marca): true = desmarcar.';

CREATE OR REPLACE FUNCTION public.marcar_facturados(p_lado text, p_refs text[], p_valor boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo marca la facturación.' using errcode = '42501'; end if;
  if p_lado = 'venta' then
    update envios set facturado_venta = p_valor where referencia_gx = any(p_refs) and facturado_venta <> p_valor;
  elsif p_lado = 'compra' then
    update envios set facturado_compra = p_valor where referencia_gx = any(p_refs) and facturado_compra <> p_valor;
  else
    raise exception 'Lado no válido: %', p_lado;
  end if;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_pago_envio(p_envio uuid, p_accion text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if p_accion in ('transferencia', 'exento', 'requerir', 'tarjeta') and e.estado <> 'programado' then
    return jsonb_build_object('resultado', 'envio_no_activo');
  end if;

  if p_accion = 'transferencia' then
    if e.estado_pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    update envios set estado_pago_previo = 'pagado', pago_metodo = 'transferencia', pagado_en = now(), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'tarjeta' then
    -- Un cobro con tarjeta que no se aplicó solo (importe distinto): Dynamo lo da por bueno.
    if e.estado_pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    if e.stripe_cobro_sin_aplicar is null then return jsonb_build_object('resultado', 'sin_cobro'); end if;
    update envios set estado_pago_previo = 'pagado', pago_metodo = 'stripe', pagado_en = now(), stripe_pago_ref = stripe_cobro_sin_aplicar,
                      stripe_cobro_sin_aplicar = null, pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'exento' then
    if e.estado_pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    if v_motivo is null or length(v_motivo) < 3 then return jsonb_build_object('resultado', 'falta_motivo'); end if;
    update envios set estado_pago_previo = 'exento', pago_exento_motivo = left(v_motivo, 500), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'requerir' then
    if e.estado_pago_previo <> 'no_requerido' then return jsonb_build_object('resultado', 'ya_tiene_pago'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set estado_pago_previo = 'pendiente', pago_motivo = coalesce(v_motivo, 'Pedido por Dynamo') where id = p_envio;
  elsif p_accion = 'deshacer' then
    if e.estado_pago_previo not in ('pagado', 'exento') then return jsonb_build_object('resultado', 'nada_que_deshacer'); end if;
    if e.pago_metodo = 'stripe' then return jsonb_build_object('resultado', 'pagado_con_tarjeta'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set estado_pago_previo = 'pendiente', pago_metodo = null, pagado_en = null, pago_resuelto_por = null, pago_exento_motivo = null
     where id = p_envio;
  else
    return jsonb_build_object('resultado', 'accion_no_valida');
  end if;
  return jsonb_build_object('resultado', 'ok');
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_pin_enviado(p_parada uuid, p_destino text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_envio uuid;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo gestiona los PIN.' using errcode = '42501';
  end if;
  update envio_parada_pines set enviado_en = now(), enviado_a = left(p_destino, 200)
   where parada_id = p_parada returning envio_id into v_envio;
  if v_envio is null then raise exception 'Ese punto no tiene PIN.'; end if;
  perform registrar_hito(v_envio, 'pin_enviado', p_parada, null,
                         jsonb_build_object('a', p_destino), 'servidor');
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (es_equipo_dynamo() or p_cliente = cliente_del_usuario()) then
    raise exception 'No tienes permiso para hacer esto.' using errcode = '42501';
  end if;
  update clientes set sitio_principal_id = p_sitio where id = p_cliente;
  if not found then
    raise exception 'Ese cliente no existe.';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.mi_cambio_envio(p_envio uuid)
 RETURNS TABLE(cambio jsonb, estado text, en timestamp with time zone, nota text, modificable boolean, con_camion boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.cambio_cliente, e.estado_cambio_cliente, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         coalesce(envio_asignandose(e.id), false)
           or (e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde))
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$function$;

CREATE OR REPLACE FUNCTION public.guardar_mi_conductor(p_id uuid, p_nombre text, p_documento text, p_documento_pais character, p_telefono text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Pon el nombre y apellidos del conductor.'; end if;
  if length(p_nombre) > 120 or length(coalesce(p_documento, '')) > 30 then raise exception 'Alguno de los datos es demasiado largo.'; end if;
  if p_id is null then
    insert into conductores (transportista_id, nombre, documento, documento_pais, telefono)
    values (v_t, trim(p_nombre), nullif(upper(trim(p_documento)), ''), coalesce(p_documento_pais, 'ES'), nullif(p_telefono, ''))
    returning id into v_id;
  else
    update conductores set nombre = trim(p_nombre), documento = nullif(upper(trim(p_documento)), ''),
                           documento_pais = coalesce(p_documento_pais, 'ES'), telefono = nullif(p_telefono, '')
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese conductor no es de tu flota.' using errcode = '42501'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'No se ha podido dar de alta ese conductor. Escríbenos y lo revisamos.';
end $function$;

CREATE OR REPLACE FUNCTION public.mi_contraoferta(p_envio uuid)
 RETURNS TABLE(permitida boolean, propuesta numeric, propuesta_en timestamp with time zone, precio_inicial numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.permite_contraoferta and coalesce((parametro('contraoferta_cliente_activa') #>> '{}')::boolean, false), e.importe_contraoferta_cliente, e.contraoferta_cliente_en, e.importe_cliente_inicial
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio and envio_del_cliente(p_envio)
$function$;

CREATE OR REPLACE FUNCTION public.mi_empresa()
 RETURNS TABLE(id uuid, codigo text, razon_social text, nombre_comercial text, cif text, direccion text, poblacion text, codigo_postal text, provincia text, pais_codigo_iso character, plazo_pago_dias integer, discrecion_comercial boolean, tipo_camion_defecto tipo_camion, forma_carga_defecto forma_carga, requiere_plataforma_elevadora_defecto boolean, estado estado_cuenta, iva_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.codigo, c.razon_social, c.nombre_comercial, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.requiere_plataforma_elevadora_defecto, c.estado, c.iva_pct
    from clientes c where c.id = cliente_del_usuario()
$function$;
revoke all on function public.mi_empresa() from public, anon, authenticated, service_role;
grant execute on function public.mi_empresa() to authenticated;
grant execute on function public.mi_empresa() to service_role;
comment on function public.mi_empresa() is '[Clientes y cuentas] Ficha de la empresa del cliente que llama: código, razón social, nombre comercial, CIF, dirección, plazo de pago, preferencias por defecto (camión, forma de carga, plataforma, discreción comercial), estado de la cuenta y su % de IVA. Quién: cliente. Argumentos: sin argumentos.';

CREATE OR REPLACE FUNCTION public.dar_baja_mi_flota(p_tipo text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); n integer;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
  if p_tipo = 'vehiculo' then
    update vehiculos set activo = false where id = p_id and transportista_id = v_t and activo;
  elsif p_tipo = 'conductor' then
    update conductores set activo = false where id = p_id and transportista_id = v_t and activo;
  else
    raise exception 'Tipo no válido.';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Eso no es de tu flota.' using errcode = '42501'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_mis_datos_transporte(p_nima text, p_seguro_compania text, p_seguro_poliza text, p_seguro_vence date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario();
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar estos datos.' using errcode = '42501'; end if;
  if length(coalesce(p_nima, '')) > 40 or length(coalesce(p_seguro_compania, '')) > 120 or length(coalesce(p_seguro_poliza, '')) > 60 then
    raise exception 'Alguno de los datos es demasiado largo.';
  end if;
  update transportistas set
    nima                = nullif(trim(p_nima), ''),
    seguro_cmr_compania = nullif(trim(p_seguro_compania), ''),
    seguro_cmr_poliza   = nullif(trim(p_seguro_poliza), ''),
    seguro_cmr_vence    = p_seguro_vence
  where id = v_t;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv_vence date, p_seguro_vence date, p_tarjeta_transporte_vence date, p_adr boolean, p_plataforma_elevadora boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
  if p_id is null then
    if exists (select 1 from vehiculos where activo and normalizar_matricula(matricula) = normalizar_matricula(p_matricula)) then
      raise exception 'No se ha podido dar de alta esa matrícula. Si es tuya, escríbenos y lo revisamos.';
    end if;
    insert into vehiculos (transportista_id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, tiene_plataforma_elevadora)
    values (v_t, upper(trim(p_matricula)), p_tipo, p_itv_vence, p_seguro_vence, p_tarjeta_transporte_vence, coalesce(p_adr, false), coalesce(p_plataforma_elevadora, false))
    returning id into v_id;
  else
    -- Corregir la matrícula (p. ej. una errata), si no la tiene otro vehículo. Los envíos
    -- ya hechos conservan la matrícula con la que cargaron.
    if nullif(trim(p_matricula), '') is not null
       and exists (select 1 from vehiculos where activo and id <> p_id and normalizar_matricula(matricula) = normalizar_matricula(p_matricula)) then
      raise exception 'Esa matrícula ya está dada de alta. Si es tuya, escríbenos y lo revisamos.';
    end if;
    update vehiculos set matricula = coalesce(nullif(upper(trim(p_matricula)), ''), matricula),
                         tipo = p_tipo, itv_vence = p_itv_vence, seguro_vence = p_seguro_vence, tarjeta_transporte_vence = p_tarjeta_transporte_vence,
                         adr = coalesce(p_adr, false), tiene_plataforma_elevadora = coalesce(p_plataforma_elevadora, false)
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese camión no es de tu flota.' using errcode = '42501'; end if;
  end if;
  return v_id;
end $function$;
revoke all on function public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv_vence date, p_seguro_vence date, p_tarjeta_transporte_vence date, p_adr boolean, p_plataforma_elevadora boolean) from public, anon, authenticated, service_role;
grant execute on function public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv_vence date, p_seguro_vence date, p_tarjeta_transporte_vence date, p_adr boolean, p_plataforma_elevadora boolean) to authenticated;
grant execute on function public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv_vence date, p_seguro_vence date, p_tarjeta_transporte_vence date, p_adr boolean, p_plataforma_elevadora boolean) to service_role;
comment on function public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv_vence date, p_seguro_vence date, p_tarjeta_transporte_vence date, p_adr boolean, p_plataforma_elevadora boolean) is '[Ofertas y transportistas] El transportista da de alta (sin id) o edita (con id) un camión de su flota. La matrícula solo se pone al crear y no puede estar ya activa en otra flota; al editar no cambia. Devuelve el id del vehículo. Quién: transportista (cuenta activa). Argumentos: p_id: vehiculos.id (null = nuevo) · p_matricula · p_tipo · p_itv_vence, p_seguro_vence, p_tarjeta_transporte_vence: fechas de vencimiento (ITV, seguro, tarjeta de transporte) · p_adr: apto mercancías peligrosas · p_plataforma_elevadora: tiene plataforma elevadora.';

CREATE OR REPLACE FUNCTION public.mis_envios()
 RETURNS TABLE(id uuid, referencia_gx text, referencia_cliente text, estado estado_envio, estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid, precio_acordado_operador numeric, fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date, fecha_entrega_estimada date, descripcion_mercancia character varying, toneladas numeric, metros_lineales numeric, tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_techo boolean, carga_trasera boolean, requiere_plataforma_elevadora boolean, requiere_nima boolean, adr boolean, codigo_postal_origen text, poblacion_origen text, codigo_postal_destino text, poblacion_destino text, num_paradas smallint, importe_cliente numeric, moneda character, iva_pct numeric, anotaciones_cliente character varying, discrecion_comercial boolean, matricula_camion text, matricula_remolque text, conductor_nombre text, conductor_telefono text, creado_en timestamp with time zone, modificado_en timestamp with time zone, confirmado_en timestamp with time zone, asignado_en timestamp with time zone, cargado_en timestamp with time zone, entregado_en timestamp with time zone, cancelado_en timestamp with time zone, paradas jsonb, estado_solicitud text, precio_caduca_en timestamp with time zone, condiciones_aceptadas_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_techo, e.carga_trasera,
         e.requiere_plataforma_elevadora, e.requiere_nima, e.adr,
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
         -- Mientras Dynamo no proponga precio, el cliente no ve ningún importe.
         case when e.estado_solicitud = 'pendiente_precio' then null else e.importe_cliente end,
         e.moneda, e.iva_pct, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_nombre end,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id),
         e.estado_solicitud, e.precio_caduca_en, e.condiciones_aceptadas_en
    from envios e
   where e.cliente_id = cliente_del_usuario()
   order by e.creado_en desc
$function$;
revoke all on function public.mis_envios() from public, anon, authenticated, service_role;
grant execute on function public.mis_envios() to authenticated;
grant execute on function public.mis_envios() to service_role;
comment on function public.mis_envios() is '[Envíos] Lista de envíos del cliente que llama con lo que puede ver: estados, fechas, mercancía, origen/destino, paradas, importe (oculto mientras la solicitud espera precio), matrículas y conductor (este se oculta pasado un tiempo de la entrega). Más recientes primero. Quién: cliente. Argumentos: sin argumentos.';

CREATE OR REPLACE FUNCTION public.mis_envios_por_ids(p_ids uuid[])
 RETURNS TABLE(id uuid, referencia_gx text, referencia_cliente text, estado estado_envio, estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid, precio_acordado_operador numeric, fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date, fecha_entrega_estimada date, descripcion_mercancia character varying, toneladas numeric, metros_lineales numeric, tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_techo boolean, carga_trasera boolean, requiere_plataforma_elevadora boolean, requiere_nima boolean, adr boolean, codigo_postal_origen text, poblacion_origen text, codigo_postal_destino text, poblacion_destino text, num_paradas smallint, importe_cliente numeric, moneda character, iva_pct numeric, anotaciones_cliente character varying, discrecion_comercial boolean, matricula_camion text, matricula_remolque text, conductor_nombre text, conductor_telefono text, creado_en timestamp with time zone, modificado_en timestamp with time zone, confirmado_en timestamp with time zone, asignado_en timestamp with time zone, cargado_en timestamp with time zone, entregado_en timestamp with time zone, cancelado_en timestamp with time zone, paradas jsonb, estado_solicitud text, precio_caduca_en timestamp with time zone, condiciones_aceptadas_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_techo, e.carga_trasera,
         e.requiere_plataforma_elevadora, e.requiere_nima, e.adr,
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
         -- Mientras Dynamo no proponga precio, el cliente no ve ningún importe.
         case when e.estado_solicitud = 'pendiente_precio' then null else e.importe_cliente end,
         e.moneda, e.iva_pct, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_nombre end,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id),
         e.estado_solicitud, e.precio_caduca_en, e.condiciones_aceptadas_en
    from envios e
   where e.cliente_id = cliente_del_usuario() and e.id = any(p_ids)
   order by e.creado_en desc
$function$;
revoke all on function public.mis_envios_por_ids(p_ids uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.mis_envios_por_ids(p_ids uuid[]) to authenticated;
grant execute on function public.mis_envios_por_ids(p_ids uuid[]) to service_role;
comment on function public.mis_envios_por_ids(p_ids uuid[]) is '[Envíos] Igual que mis_envios() pero solo los envíos indicados (una página de resultados del buscador). Quién: cliente. Argumentos: p_ids: ids de envíos.';

CREATE OR REPLACE FUNCTION public.mis_viajes()
 RETURNS TABLE(id uuid, referencia_gx text, estado estado_envio, fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date, fecha_entrega_estimada date, descripcion_mercancia character varying, toneladas numeric, metros_lineales numeric, tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_techo boolean, carga_trasera boolean, requiere_plataforma_elevadora boolean, requiere_nima boolean, adr boolean, importe_transportista numeric, moneda character, matricula_camion text, matricula_remolque text, conductor_nombre text, conductor_telefono text, asignado_en timestamp with time zone, cargado_en timestamp with time zone, entregado_en timestamp with time zone, paradas jsonb, discrecion_comercial boolean, codigo_postal_origen text, poblacion_origen text, codigo_postal_destino text, poblacion_destino text, creado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.estado,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_techo, e.carga_trasera,
         e.requiere_plataforma_elevadora, e.requiere_nima, e.adr,
         e.importe_transportista, e.moneda,
         e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono,
         e.asignado_en, e.cargado_en, e.entregado_en, paradas_viaje_json(e.id),
         e.discrecion_comercial, e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.creado_en
    from envios e
   where e.transportista_id = transportista_del_usuario()
   order by e.fecha_carga_desde desc nulls last
$function$;
revoke all on function public.mis_viajes() from public, anon, authenticated, service_role;
grant execute on function public.mis_viajes() to authenticated;
grant execute on function public.mis_viajes() to service_role;
comment on function public.mis_viajes() is '[Ofertas y transportistas] Viajes asignados al transportista que llama, con lo que necesita: fechas, mercancía, requisitos de carga, importe al transportista (sin IVA), matrículas, conductor, paradas y origen/destino. Los de carga más reciente primero. Quién: transportista. Argumentos: sin argumentos.';

CREATE OR REPLACE FUNCTION public.mis_viajes_por_ids(p_ids uuid[])
 RETURNS TABLE(id uuid, referencia_gx text, estado estado_envio, fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date, fecha_entrega_estimada date, descripcion_mercancia character varying, toneladas numeric, metros_lineales numeric, tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_techo boolean, carga_trasera boolean, requiere_plataforma_elevadora boolean, requiere_nima boolean, adr boolean, importe_transportista numeric, moneda character, matricula_camion text, matricula_remolque text, conductor_nombre text, conductor_telefono text, asignado_en timestamp with time zone, cargado_en timestamp with time zone, entregado_en timestamp with time zone, paradas jsonb, discrecion_comercial boolean, codigo_postal_origen text, poblacion_origen text, codigo_postal_destino text, poblacion_destino text, creado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.estado,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_techo, e.carga_trasera,
         e.requiere_plataforma_elevadora, e.requiere_nima, e.adr,
         e.importe_transportista, e.moneda,
         e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono,
         e.asignado_en, e.cargado_en, e.entregado_en, paradas_viaje_json(e.id),
         e.discrecion_comercial, e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.creado_en
    from envios e
   where e.transportista_id = transportista_del_usuario() and e.id = any(p_ids)
   order by e.fecha_carga_desde desc nulls last
$function$;
revoke all on function public.mis_viajes_por_ids(p_ids uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.mis_viajes_por_ids(p_ids uuid[]) to authenticated;
grant execute on function public.mis_viajes_por_ids(p_ids uuid[]) to service_role;
comment on function public.mis_viajes_por_ids(p_ids uuid[]) is '[Envíos] Igual que mis_viajes() pero solo los viajes indicados (una página de resultados del buscador). Quién: transportista. Argumentos: p_ids: ids de envíos.';

CREATE OR REPLACE FUNCTION public.negociacion_bloqueada(p_envio uuid, p_transportista uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; m numeric; n int;
begin
  if not coalesce((parametro('contraoferta_transportista_activa') #>> '{}')::boolean, false) then
    return 'La negociación está apagada.';
  end if;
  select creado_en, publicado_en_bolsa_en, fecha_carga_desde into e from envios where id = p_envio;
  if not found then return 'La carga no existe.'; end if;
  m := parametro_num('negociacion_min_creada_min', 0);
  if m > 0 and e.creado_en > now() - make_interval(mins => m::int) then
    return format('La carga lleva menos de %s minutos creada.', m);
  end if;
  m := parametro_num('negociacion_min_bolsa_min', 0);
  if m > 0 and e.publicado_en_bolsa_en is not null and e.publicado_en_bolsa_en > now() - make_interval(mins => m::int) then
    return format('La carga lleva menos de %s minutos en la bolsa.', m);
  end if;
  m := parametro_num('negociacion_max_horas_carga', 0);
  if m > 0 and e.fecha_carga_desde is not null
     and (e.fecha_carga_desde::timestamp at time zone 'Europe/Madrid') > now() + make_interval(hours => m::int) then
    return format('Faltan más de %s horas para cargar.', m);
  end if;
  if p_transportista is not null then
    m := parametro_num('negociacion_min_cargas_hechas', 0);
    if m > 0 then
      select count(*) into n from envios where transportista_id = p_transportista and estado = 'entregado';
      if n < m then return format('Para negociar hay que haber hecho al menos %s cargas con Dynamo.', m); end if;
    end if;
    if coalesce((parametro('negociacion_una_por_carga') #>> '{}')::boolean, false)
       and exists (select 1 from envio_reservas where envio_id = p_envio and transportista_id = p_transportista
                    and precio_propuesto is not null and estado in ('rechazada', 'pendiente_revision', 'aceptada')) then
      return 'Ya hiciste una contraoferta para esta carga.';
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.normalizar_cp(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.normalizar_id_fiscal(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.normalizar_matricula(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.oferta_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record; e record; o record; v_motivo text; v_tramite boolean;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = t.envio_id;
  if t.oferta_id is not null then select * into o from envio_ofertas where id = t.oferta_id; end if;

  v_motivo := case
    when e.estado = 'cancelado' then 'cancelado'
    when e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then 'tomada'
    when not t.oferta_activa then 'caducada'
  end;
  v_tramite := exists (select 1 from envio_reservas where envio_id = e.id
                        and estado = 'viva' and hasta > now());

  return jsonb_build_object(
    'resultado', 'ok',
    'disponible', v_motivo is null,
    'motivo', v_motivo,
    'en_tramite', v_tramite,
    'asignada_en', e.asignado_en,
    'referencia', e.referencia_gx,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia,
    'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
    'paletizado', e.paletizado, 'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera,
    'carga_techo', e.carga_techo, 'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora,
    'requiere_nima', e.requiere_nima, 'adr', e.adr,
    'precio', coalesce(o.precio_ofertado, e.importe_transportista),
    'banda_euros', coalesce(o.banda_euros, 0),
    'pronto_pago', coalesce(o.pronto_pago, true),
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'reserva_minutos', parametro('reserva_minutos'),
    'para_transportista', (select nombre_visible from transportistas where id = o.transportista_id),
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
        'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
        'tipo_sitio', l.tipo, 'horarios', horario_sitio_texto(l.id, coalesce((p.fecha_desde at time zone 'Europe/Madrid')::date, case when p.tipo = 'carga' then e.fecha_carga_desde else coalesce(e.fecha_entrega_estimada, e.fecha_carga_desde) end)),
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.ofertar_envio(p_envio uuid, p_transportista uuid, p_canal text, p_precio numeric, p_banda_pct smallint DEFAULT 10, p_pronto_pago boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo puede ofertar cargas.' using errcode = '42501';
  end if;
  select estado, estado_asignacion into v_estado, v_asig
    from envios where id = p_envio for update;
  if v_estado is null then raise exception 'El envio % no existe.', p_envio; end if;
  if v_estado <> 'programado' then
    raise exception 'Solo se ofertan envios programados (este esta en %).', v_estado;
  end if;
  if v_asig = 'confirmada' then
    raise exception 'El envio ya tiene transportista asignado.';
  end if;
  if p_transportista is not null and exists (
       select 1 from transportistas where id = p_transportista
       and estado_operativo <> 'activo') then
    raise exception 'Ese transportista no esta activo para ofertar.';
  end if;

  v_pp := p_pronto_pago and coalesce(
            (select pronto_pago from transportistas where id = p_transportista), true);

  insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado,
                             banda_pct, pronto_pago, caduca_en)
  values (p_envio, p_transportista, p_canal, p_precio, p_banda_pct, v_pp,
          now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int))
  returning id into v_id;

  perform set_config('dynamo.primera_oferta', 'on', true);
  update envios set estado_asignacion = case when estado_asignacion = 'sin_asignar'
                                             then 'ofertada'::estado_asignacion
                                             else estado_asignacion end
   where id = p_envio;
  perform set_config('dynamo.primera_oferta', '', true);

  perform registrar_hito(p_envio, 'ofertado', null, v_id,
    jsonb_build_object('transportista_id', p_transportista, 'canal', p_canal,
                       'precio', p_precio, 'banda_pct', p_banda_pct, 'pronto_pago', v_pp));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.orden_carga_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; t transportistas%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este viaje no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
      'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'importe_transportista', e.importe_transportista,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo()
  );
end $function$;

CREATE OR REPLACE FUNCTION public.otras_cargas_publicas(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  -- Solo con el enlace de una carga reciente (no vale cualquier enlace antiguo).
  if not exists (select 1 from envios where id = t.envio_id
                  and coalesce(fecha_carga_hasta, fecha_carga_desde, creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - parametro_num('tablon_enlace_dias', 14)::int) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha_carga_desde', x->>'referencia')
      from (
        select jsonb_build_object(
          'token', e.token_publico, 'referencia', e.referencia_gx,
          'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
          'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
          'precio', e.importe_transportista,
          'origen',  (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden limit 1),
          'destino', (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden desc limit 1)) as x
          from envios e
         where e.id <> t.envio_id
           and e.publicado_en_bolsa_en is not null
           and e.estado = 'programado' and e.estado_asignacion is distinct from 'confirmada' and e.transportista_id is null
           and e.importe_transportista is not null
           and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) >= (now() at time zone 'Europe/Madrid')::date
           and not exists (select 1 from envio_reservas r where r.envio_id = e.id
                            and r.estado = 'viva' and r.hasta > now())
         order by e.fecha_carga_desde, e.referencia_gx
         limit 12) s), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.parametro_num(p_clave text, p_defecto numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select (valor #>> '{}')::numeric from parametros where clave = p_clave), p_defecto)
$function$;

CREATE OR REPLACE FUNCTION public.pago_envio_importes(p_envio uuid)
 RETURNS TABLE(base numeric, iva numeric, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(coalesce(e.importe_cliente, 0), 2),
         coalesce(e.iva_pct, c.iva_pct, 21),
         round(coalesce(e.importe_cliente, 0) * (1 + coalesce(e.iva_pct, c.iva_pct, 21) / 100), 2)
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio
$function$;

CREATE OR REPLACE FUNCTION public.pago_envio_stripe(p_envio uuid, p_pago text, p_centimos bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; t numeric;
begin
  if not es_servidor() then raise exception 'Solo el servidor confirma pagos con tarjeta.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.stripe_pago_ref = p_pago then return jsonb_build_object('resultado', 'ya_registrado'); end if;
  -- Pago que llega cuando el envío ya está anulado (por ejemplo, fuera de plazo): no lo
  -- reactiva; se avisa a Dynamo para devolverlo en Stripe.
  if e.estado = 'cancelado' then
    perform crear_aviso('dynamo', null, null, 'pago_anulado', 'urgente', 'Pago con tarjeta de un envío anulado · #' || coalesce(e.referencia_gx, ''),
      'Devuélvelo en Stripe (pago ' || p_pago || ') o reactiva el envío si el cliente aún lo quiere.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'envio_anulado');
  end if;
  if e.estado_pago_previo <> 'pendiente' then
    -- Cobro de más (ya pagado por transferencia, o dos páginas de pago): avisar para devolverlo.
    update envios set stripe_cobro_sin_aplicar = p_pago where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'urgente', 'Cobro con tarjeta de un envío ya pagado · #' || coalesce(e.referencia_gx, ''),
      'Se ha cobrado ' || euros_texto(p_centimos / 100.0) || ' con tarjeta (pago ' || p_pago || ') y el envío ya estaba ' || e.estado_pago_previo || '. Devuélvelo en Stripe.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'no_pendiente', 'estado', e.estado_pago_previo);
  end if;
  select total into t from pago_envio_importes(p_envio);
  if round(t * 100) <> p_centimos then
    -- El importe cambió con la página de pago abierta: el cobro está hecho, así que el
    -- envío NO se anula por falta de pago; Dynamo decide (darlo por pagado o devolverlo).
    update envios set stripe_cobro_sin_aplicar = p_pago where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'urgente', 'Cobro con tarjeta por otro importe · #' || coalesce(e.referencia_gx, ''),
      'Cobrado ' || euros_texto(p_centimos / 100.0) || ', el envío dice ' || euros_texto(t) || ' (pago ' || p_pago || '). Dalo por pagado en la ficha o devuelve la diferencia en Stripe.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'importe_distinto', 'esperado', round(t * 100), 'cobrado', p_centimos);
  end if;
  update envios set estado_pago_previo = 'pagado', pago_metodo = 'stripe', pagado_en = now(), stripe_pago_ref = p_pago where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $function$;

CREATE OR REPLACE FUNCTION public.pago_limite(p_desde timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t timestamptz := p_desde + make_interval(hours => parametro_num('pago_previo_horas', 24)::int); i int := 0;
begin
  -- Si el plazo cae en sábado, domingo o festivo, pasa al siguiente día hábil a la misma hora
  -- (una transferencia del viernes por la tarde no llega hasta el lunes).
  while not es_dia_habil((t at time zone 'Europe/Madrid')::date) and i < 10 loop
    t := t + interval '1 day'; i := i + 1;
  end loop;
  return t;
end $function$;
comment on function public.pago_limite(p_desde timestamp with time zone) is '[Precio y pago] Hora límite para pagar un envío con pago previo: el instante dado más las horas del parámetro pago_previo_horas (24 por defecto). Quién: cualquier usuario con sesión. Argumentos: p_desde: desde cuándo está pendiente el pago.';

CREATE OR REPLACE FUNCTION public.pago_previo_motivo(p_cliente uuid, p_envio uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; n_prev int;
begin
  if not coalesce((parametro('pago_previo_activo') #>> '{}')::boolean, false) then return null; end if;
  select riesgo_efectivo_euros, exento_pago_previo_primer_envio into c from clientes where id = p_cliente;
  if not found then return null; end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then
    return case when c.riesgo_efectivo_euros is null then 'Sin crédito: empresa sin clasificar por CESCE'
                else 'Sin crédito: CESCE autoriza 0' end;
  end if;
  if not c.exento_pago_previo_primer_envio then
    select count(*) into n_prev from envios
     where cliente_id = p_cliente and id is distinct from p_envio and not coalesce(es_manual, false)
       and estado not in ('borrador', 'cancelado')
       and estado_pago_previo <> 'pendiente';   -- un envío sin pagar no cuenta como envío hecho
    if n_prev < parametro_num('pago_previo_primeros_envios', 1) then
      return case when n_prev = 0 then 'Primer envío del cliente' else format('Uno de los %s primeros envíos del cliente', parametro_num('pago_previo_primeros_envios', 1)) end;
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.pagos_envio(p_envio uuid DEFAULT NULL::uuid)
 RETURNS TABLE(envio_id uuid, referencia_gx text, referencia_cliente text, estado text, estado_pago_previo text, pago_motivo text, pago_metodo text, pagado_en timestamp with time zone, base numeric, iva numeric, total numeric, pago_limite timestamp with time zone, precio_provisional boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.estado_pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         case when e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null then pago_limite(e.pago_pendiente_en) end,
         precio_por_revisar(e.estado_revision_precio)
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.estado_pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$function$;
revoke all on function public.pagos_envio(p_envio uuid) from public, anon, authenticated, service_role;
grant execute on function public.pagos_envio(p_envio uuid) to authenticated;
grant execute on function public.pagos_envio(p_envio uuid) to service_role;
comment on function public.pagos_envio(p_envio uuid) is '[Precio y pago] Envíos que requieren pago previo con su situación: estado del pago, motivo, método, cuándo se pagó, base, IVA y total en euros, hora límite para pagar y si el precio es provisional (pendiente de revisión). Dynamo ve todos; el cliente los suyos. Quién: Dynamo (también solo lectura) o cliente. Argumentos: p_envio: envios.id (null = todos los que puede ver).';

CREATE OR REPLACE FUNCTION public.paradas_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'sitio_id', p.sitio_id,
           'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
           'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
           'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde,
           'fecha_hasta', p.fecha_hasta, 'realizado_en', p.realizado_en,
           'referencia', p.referencia, 'anotaciones', p.anotaciones)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p where p.envio_id = p_envio
$function$;

CREATE OR REPLACE FUNCTION public.paradas_viaje_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
           'direccion', p.direccion, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia,
           'anotaciones', p.anotaciones, 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta, 'realizado_en', p.realizado_en,
           'horarios', horario_sitio_texto(l.id, coalesce((p.fecha_desde at time zone 'Europe/Madrid')::date, case when p.tipo = 'carga' then e.fecha_carga_desde else coalesce(e.fecha_entrega_estimada, e.fecha_carga_desde) end)), 'url_google_maps', l.url_google_maps, 'requiere_cita', coalesce(l.requiere_cita, false),
           'tiene_medios_carga', coalesce(l.tiene_medios_carga, true), 'notas_sitio', l.anotaciones,
           'contacto_nombre', c.nombre, 'contacto_telefono', c.telefono)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p
    join envios e on e.id = p.envio_id
    left join sitios l on l.id = p.sitio_id
    left join lateral (select nombre, telefono from contactos x where x.sitio_id = p.sitio_id and x.es_principal limit 1) c on true
   where p.envio_id = p_envio
$function$;

CREATE OR REPLACE FUNCTION public.pedir_cambio_envio(p_envio uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.estado_cambio_cliente = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  v_fechas := p_desde is not null and (p_desde, coalesce(p_hasta, p_desde)) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if p_desde is not null and (p_desde <= (now() at time zone 'Europe/Madrid')::date or coalesce(p_hasta, p_desde) < p_desde or coalesce(p_hasta, p_desde) > (now() at time zone 'Europe/Madrid')::date + 183) then
    return jsonb_build_object('resultado', 'fechas_no_validas');
  end if;
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  v_libre := not coalesce(envio_asignandose(p_envio), true);
  -- Con camión asignado o asignándose no se modifica desde la plataforma: hay que llamar.
  if not v_libre then return jsonb_build_object('resultado', 'con_camion'); end if;
  -- Pasada la hora límite para cancelar gratis, tampoco: hay que llamar.
  if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'fuera_de_plazo');
  end if;
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_libre and v_det is null then
    -- Sin camión y solo fechas: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = coalesce(p_hasta, p_desde),
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', coalesce(p_hasta, p_desde),
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), estado_cambio_cliente = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then coalesce(p_hasta, p_desde) end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), estado_cambio_cliente = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $function$;

CREATE OR REPLACE FUNCTION public.poner_datos_cmr(p_envio uuid, p_bultos integer, p_embalaje text, p_volumen numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio;
begin
  select estado into v_estado from envios where id = p_envio;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if es_equipo_dynamo() then
    if v_estado = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  elsif envio_del_cliente(p_envio) then
    if v_estado not in ('borrador', 'programado', 'hacia_la_carga') then
      raise exception 'La carga ya ha empezado: para cambiar estos datos, llama a Dynamo.';
    end if;
    if exists (select 1 from firmas_cmr f where f.envio_id = p_envio) then
      raise exception 'El CMR ya tiene firmas: estos datos ya no se cambian.';
    end if;
  else
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  update envios set num_bultos = p_bultos, embalaje = nullif(trim(p_embalaje), ''), volumen_m3 = p_volumen
   where id = p_envio;
end $function$;

comment on function public.precio_por_revisar(p text) is '[Ayudantes internos] Dice si un estado de revisión de precio significa que el precio es provisional (pendiente, revisar o esperando_cliente). Quién: cualquiera. Argumentos: p: envios.estado_revision_precio.';

CREATE OR REPLACE FUNCTION public.preparar_pines_envio(p_envio uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if exists (select 1 from envios where id = p_envio and operador_id is not null) then
    return 0;
  end if;
  insert into envio_parada_pines (parada_id, envio_id, pin)
  select p.id, p.envio_id, pin_aleatorio((parametro('pin_cifras'))::int)
    from envio_paradas p
    join envios   e on e.id = p.envio_id
    join clientes c on c.id = e.cliente_id
    left join sitios l on l.id = p.sitio_id
   where p.envio_id = p_envio
     and (c.requiere_pin or coalesce(l.requiere_pin, false))
     and not exists (select 1 from envio_parada_pines x where x.parada_id = p.id);
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.proponer_precio_solicitud(p_envio uuid, p_importe numeric, p_importe_transportista numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_horas int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo pone precio a las solicitudes.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if e.estado_solicitud not in ('pendiente_precio', 'precio_propuesto') or e.estado <> 'borrador' then
    raise exception 'Esta solicitud ya no admite precio (está %).', coalesce(e.estado_solicitud, 'sin solicitud');
  end if;
  if p_importe is null or p_importe <= 0 then raise exception 'Pon un precio para el cliente mayor que cero.'; end if;
  select coalesce((select (valor #>> '{}')::int from parametros where clave = 'solicitud_validez_horas'), 24) into v_horas;
  update envios set importe_cliente = p_importe, importe_transportista = p_importe_transportista, precio_fijado_a_mano = true,
                    estado_solicitud = 'precio_propuesto', precio_caduca_en = now() + make_interval(hours => v_horas)
   where id = p_envio;
end $function$;

CREATE OR REPLACE FUNCTION public.purgar_datos_personales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_admin_master()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
  end if;
  -- Apagada por defecto: no se borra NADA del histórico (decisión del usuario 2026-11-05).
  if not coalesce((parametro('rgpd_limpieza_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('limpieza', 'desactivada');
  end if;
  perform set_config('dynamo.purga', 'on', true);
  perform set_config('dynamo.anonimizando', 'on', true);
  update envio_reservas set ip = null, navegador = null
   where coalesce(cerrada_en, desde) < now() - interval '90 days' and (ip is not null or navegador is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('reservas_ip', n);
  delete from intentos_carga_publica where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_carga', n);
  delete from pin_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_pin', n);
  delete from contraoferta_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_contraoferta', n);
  delete from conexion_minutos where dia < current_date - 365;
  get diagnostics n = row_count; r := r || jsonb_build_object('conexion', n);
  delete from consultas_precio where cuando < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);
  -- Teléfono de los conductores sin viajes: SOLO si se activa en Parámetros
  -- (rgpd_telefono_conductor_anios > 0). Por defecto NO se borra: el usuario quiere
  -- conservar los datos de conductores y contactos para portes posteriores (2026-11-05).
  n := 0;
  if parametro_num('rgpd_telefono_conductor_anios', 0) > 0 then
    with sin_viajes as (
      select c.id from conductores c
       where c.creado_en < now() - make_interval(years => parametro_num('rgpd_telefono_conductor_anios', 0)::int)
         and not exists (select 1 from envios e where e.conductor_id = c.id
                          and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date)
                              > current_date - (365 * parametro_num('rgpd_telefono_conductor_anios', 0))::int)
    ), a as (update conductores set telefono = null where id in (select id from sin_viajes) and telefono is not null returning 1)
    select count(*) into n from a;
    update envios set conductor_telefono = null
     where conductor_telefono is not null and conductor_id in (select id from conductores where telefono is null);
  end if;
  r := r || jsonb_build_object('telefonos_conductores', n);
  -- IP y navegador de las reservas que se copiaron a la auditoría antes de este cambio.
  update auditoria set cambios = ((cambios #- '{despues,ip}' #- '{despues,navegador}' #- '{antes,ip}' #- '{antes,navegador}') - 'ip' - 'navegador')
   where tabla = 'envio_reservas' and cuando < now() - interval '90 days'
     and (cambios::text like '%"ip"%' or cambios::text like '%"navegador"%');
  get diagnostics n = row_count; r := r || jsonb_build_object('auditoria_ip', n);
  -- La IP que apuntaba el alta online en su nota interna.
  update notas_internas set texto = regexp_replace(texto, ' \(IP [^)]*\)', '', 'g')
   where texto ~ '\(IP ' and creado_en < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('notas_ip', n);
  perform set_config('dynamo.purga', 'off', true);
  perform set_config('dynamo.anonimizando', 'off', true);
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.quitar_transportista(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  update envios set transportista_id = null where id = p_envio and transportista_id is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', case when exists (select 1 from envios where id = p_envio) then 'sin_transportista' else 'no_existe' end); end if;
  return jsonb_build_object('ok', true, 'resultado', 'quitado');
end $function$;

CREATE OR REPLACE FUNCTION public.regenerar_pin_parada(p_parada uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pin text; v_envio uuid;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo gestiona los PIN.' using errcode = '42501';
  end if;
  select envio_id into v_envio from envio_paradas where id = p_parada;
  if v_envio is null then raise exception 'La parada % no existe.', p_parada; end if;
  if exists (select 1 from envio_parada_pines where parada_id = p_parada
             and validado_en is not null) then
    raise exception 'Ese punto ya esta validado: no se regenera su PIN.';
  end if;
  v_pin := pin_aleatorio((parametro('pin_cifras'))::int);
  insert into envio_parada_pines (parada_id, envio_id, pin)
  values (p_parada, v_envio, v_pin)
  on conflict (parada_id) do update
    set pin = excluded.pin, intentos_fallidos = 0, bloqueado = false,
        exigido = true, enviado_en = null, enviado_a = null;
  return v_pin;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_cambio_email(p_usuario uuid, p_antes text, p_despues text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_admin_master() then raise exception 'Solo el administrador cambia el email de una cuenta.' using errcode = '42501'; end if;
  if not exists (select 1 from usuarios where id = p_usuario and lower(email) = lower(trim(p_despues))) then
    raise exception 'Ese cambio de email no ha ocurrido.';
  end if;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'modificacion', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('email', jsonb_build_object('antes', lower(trim(p_antes)), 'despues', lower(trim(p_despues))),
                             'motivo', 'Cambio de email desde Usuarios (Admin Master)'));
end $function$;

CREATE OR REPLACE FUNCTION public.reglas_precio_envio()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('antelacion_max_dias', parametro_num('envio_antelacion_max_dias', 120), 'cerrado_dias', parametro_num('precio_cerrado_dias', 7),
                            'revision_dias_habiles', parametro_num('precio_revision_dias_habiles', 3), 'margen_pct', parametro_num('precio_revision_margen_pct', 5))
$function$;

CREATE OR REPLACE FUNCTION public.reservar_envio_publico(p_token uuid, p_ip inet DEFAULT NULL::inet, p_navegador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_envio uuid; v_oferta uuid; e record; v_res record; v_id uuid; v_hasta timestamptz;
begin
  select id into v_envio from envios where token_publico = p_token;
  if v_envio is null then
    select envio_id, id into v_envio, v_oferta from envio_ofertas
     where token = p_token and estado = 'activa' and caduca_en > now();
  end if;
  if v_envio is null then
    return jsonb_build_object('resultado', 'enlace_no_valido', 'ahora', now());
  end if;

  -- La fila del envío bloqueada: a partir de aquí nadie más reserva a la vez.
  select * into e from envios where id = v_envio for update;

  if v_oferta is not null then
    update envio_ofertas set aperturas = aperturas + 1,
                             abierta_en = coalesce(abierta_en, now())
     where id = v_oferta;
  end if;
  perform registrar_hito(v_envio, 'enlace_abierto', null, v_oferta,
                         jsonb_build_object('ip', host(p_ip)), 'servidor');

  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado', 'tomada', 'ahora', now(),
                              'asignada_en', e.asignado_en);
  end if;

  perform caducar_reservas(v_envio);

  select * into v_res from envio_reservas
   where envio_id = v_envio and estado = 'viva';
  if found then
    return jsonb_build_object('resultado', 'en_tramite', 'ahora', now(),
                              'hasta', v_res.hasta, 'desde', v_res.desde);
  end if;

  v_hasta := now() + make_interval(mins => (parametro('reserva_minutos'))::int);
  insert into envio_reservas (envio_id, oferta_id, hasta, ip, navegador)
  values (v_envio, v_oferta, v_hasta, p_ip, left(p_navegador, 400))
  returning id into v_id;

  update envios set estado_asignacion = 'reservada' where id = v_envio;
  perform registrar_hito(v_envio, 'reservado', null, v_oferta,
                         jsonb_build_object('reserva_id', v_id), 'servidor');

  return jsonb_build_object('resultado', 'reservada', 'reserva_id', v_id,
                            'ahora', now(), 'hasta', v_hasta);
end $function$;

CREATE OR REPLACE FUNCTION public.resolver_cambio_envio(p_envio uuid, p_acepta boolean, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; d date; h date;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo resuelve los cambios.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found or e.estado_cambio_cliente <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  d := (e.cambio_cliente ->> 'fecha_desde')::date; h := (e.cambio_cliente ->> 'fecha_hasta')::date;
  if p_acepta and d is not null then
    update envios set fecha_carga_desde = d, fecha_carga_hasta = coalesce(h, d) where id = p_envio;
  end if;
  update envios set estado_cambio_cliente = case when p_acepta then 'aceptado' else 'rechazado' end,
                    cambio_cliente_nota = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $function$;
revoke all on function public.resolver_cambio_envio(p_envio uuid, p_acepta boolean, p_nota text) from public, anon, authenticated, service_role;
grant execute on function public.resolver_cambio_envio(p_envio uuid, p_acepta boolean, p_nota text) to authenticated;
grant execute on function public.resolver_cambio_envio(p_envio uuid, p_acepta boolean, p_nota text) to service_role;
comment on function public.resolver_cambio_envio(p_envio uuid, p_acepta boolean, p_nota text) is '[Envíos] Dynamo acepta o rechaza el cambio pendiente que pidió el cliente en un envío. Si acepta y el cambio trae fechas, las aplica; lo demás del detalle hay que cambiarlo a mano. Guarda la nota para el cliente. Devuelve {resultado: ok | no_pendiente}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_acepta: true acepta / false rechaza · p_nota: respuesta para el cliente (opcional).';

CREATE OR REPLACE FUNCTION public.resolver_contraoferta(p_reserva uuid, p_acepta boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo resuelve contraofertas.' using errcode = '42501';
  end if;
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  perform 1 from envios where id = r.envio_id for update;
  -- Con el envío bloqueado, la reserva otra vez y bloqueada: si mientras tanto otra persona
  -- (o la caducidad) la ha cerrado, ya no se resuelve.
  select * into r from envio_reservas where id = p_reserva for update;
  if r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  -- Envío cancelado o ya en marcha: la contraoferta ya no tiene sentido.
  if p_acepta and exists (select 1 from envios where id = r.envio_id and estado <> 'programado') then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga ya no está disponible' where id = p_reserva;
    return jsonb_build_object('resultado', 'no_disponible');
  end if;
  -- Si mientras tanto la carga se la ha quedado otro, esta ya no se puede aprobar.
  if p_acepta and exists (select 1 from envios where id = r.envio_id and (transportista_id is not null or estado_asignacion = 'confirmada')) then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga se la ha quedado otro transportista' where id = p_reserva;
    return jsonb_build_object('resultado', 'tomada');
  end if;

  perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_propuesto', r.precio_propuesto,
                       'decision', case when p_acepta then 'aprobada' else 'rechazada' end));
  if p_acepta then
    return cerrar_aceptacion(p_reserva, r.transportista_id, r.usuario_id, r.precio_propuesto);
  end if;

  update envio_reservas set estado = 'rechazada', cerrada_en = now(),
         motivo_cierre = 'contraoferta rechazada' where id = p_reserva;
  perform caducar_reservas(r.envio_id);     -- devuelve el envío a 'ofertada'
  return jsonb_build_object('resultado','rechazada');
end $function$;
revoke all on function public.resolver_contraoferta(p_reserva uuid, p_acepta boolean) from public, anon, authenticated, service_role;
grant execute on function public.resolver_contraoferta(p_reserva uuid, p_acepta boolean) to authenticated;
grant execute on function public.resolver_contraoferta(p_reserva uuid, p_acepta boolean) to service_role;
comment on function public.resolver_contraoferta(p_reserva uuid, p_acepta boolean) is '[Ofertas y transportistas] Dynamo aprueba o rechaza la contraoferta de precio (o el alta online) de un transportista que está pendiente de revisión. Si aprueba y la carga sigue libre y programada, se la asigna a ese precio; si rechaza, la carga vuelve a estar ofertada. Devuelve {resultado}. Quién: Dynamo y servidor. Argumentos: p_reserva: envio_reservas.id (pendiente_revision) · p_acepta: true aprueba / false rechaza.';

CREATE OR REPLACE FUNCTION public.resolver_contraoferta_cliente(p_envio uuid, p_acepta boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_horas int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo resuelve las contraofertas.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found or e.estado_solicitud <> 'contraoferta' or e.estado <> 'borrador' then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if p_acepta then
    if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
    update envios set importe_cliente_inicial = importe_cliente, importe_cliente = importe_contraoferta_cliente,
                      estado_solicitud = 'aceptada', estado = 'programado'
     where id = p_envio;
  else
    -- Vuelve a nuestro precio, con su validez renovada, para que pueda aceptarlo o cancelar.
    select coalesce((select (valor #>> '{}')::int from parametros where clave = 'solicitud_validez_horas'), 24) into v_horas;
    update envios set estado_solicitud = 'precio_propuesto', condiciones_aceptadas_en = null,
                      precio_caduca_en = greatest(coalesce(precio_caduca_en, now()), now() + make_interval(hours => v_horas))
     where id = p_envio;
  end if;
  perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', e.importe_contraoferta_cliente,
                       'decision', case when p_acepta then 'aprobada' else 'rechazada' end));
  return jsonb_build_object('resultado', 'ok');
end $function$;
revoke all on function public.resolver_contraoferta_cliente(p_envio uuid, p_acepta boolean) from public, anon, authenticated, service_role;
grant execute on function public.resolver_contraoferta_cliente(p_envio uuid, p_acepta boolean) to authenticated;
grant execute on function public.resolver_contraoferta_cliente(p_envio uuid, p_acepta boolean) to service_role;
comment on function public.resolver_contraoferta_cliente(p_envio uuid, p_acepta boolean) is '[Precio y pago] Dynamo aprueba o rechaza la contraoferta de precio de un cliente en su solicitud. Si aprueba, el envío queda programado con el precio del cliente (no si la fecha de carga ya pasó); si rechaza, vuelve al precio de Dynamo con validez renovada. Deja un hito. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id (solicitud en contraoferta) · p_acepta: true aprueba / false rechaza.';

CREATE OR REPLACE FUNCTION public.responder_precio_solicitud(p_envio uuid, p_acepta boolean, p_precio_visto numeric DEFAULT NULL::numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if e.estado_solicitud <> 'precio_propuesto' or e.estado <> 'borrador' then
    raise exception 'Esta solicitud ya no está esperando tu respuesta.';
  end if;
  if not p_acepta then
    update envios set estado_solicitud = 'rechazada', estado = 'cancelado' where id = p_envio;
    return 'rechazada';
  end if;
  -- El precio que el cliente tenía en pantalla: si Dynamo lo ha cambiado mientras, no vale.
  if p_precio_visto is not null and round(p_precio_visto, 2) is distinct from round(e.importe_cliente, 2) then
    return 'precio_cambiado';
  end if;
  if e.precio_caduca_en < now() then
    update envios set estado_solicitud = 'pendiente_precio', precio_caduca_en = null where id = p_envio;
    return 'caducado';
  end if;
  if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de recogida ya ha pasado: cancela la solicitud y pide otra.';
  end if;
  update envios set estado_solicitud = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado' where id = p_envio;
  return 'aceptada';
end $function$;

CREATE OR REPLACE FUNCTION public.responder_subida_precio(p_envio uuid, p_acepta boolean, p_precio_visto numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare e record;
begin
  select id, referencia_gx, cliente_id, estado, estado_revision_precio, importe_revision_nuevo into e from envios where id = p_envio for update;
  if not found or not (e.cliente_id = cliente_del_usuario() or es_equipo_dynamo()) then
    raise exception 'Ese envío no existe o no es tuyo.' using errcode = '42501';
  end if;
  if e.estado <> 'programado' or e.estado_revision_precio is distinct from 'esperando_cliente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  if coalesce(p_acepta, false) and p_precio_visto is not null and round(p_precio_visto, 2) is distinct from round(e.importe_revision_nuevo, 2) then
    return jsonb_build_object('resultado', 'precio_cambiado');
  end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  if coalesce(p_acepta, false) then
    update envios set importe_cliente = importe_revision_nuevo, estado_revision_precio = 'hecha', revision_precio_en = now() where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'precio_aceptado', 'info', 'Acepta el nuevo precio · #' || coalesce(e.referencia_gx, ''),
      'Precio definitivo: ' || euros_texto(e.importe_revision_nuevo) || ' + IVA. Ya se puede ofertar.', '/panel/envios?ver=' || e.id, e.id);
  else
    update envios set estado = 'cancelado', cancelacion_sin_coste = true where id = p_envio;
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'No acepta la subida de precio de la revisión (cancelación sin coste)', 'por', 'cliente'));
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', case when p_acepta then 'aceptado' else 'cancelado' end);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_precio_envio(p_envio uuid, p_nuevo numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare e record; v_margen numeric := parametro_num('precio_revision_margen_pct', 5); v_res text; v_ref text;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo Dynamo revisa el precio.' using errcode = '42501'; end if;
  select id, referencia_gx, cliente_id, estado, importe_cliente, estado_revision_precio into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' or not precio_por_revisar(e.estado_revision_precio) then return jsonb_build_object('resultado', 'no_provisional'); end if;
  if p_nuevo is null or p_nuevo <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  p_nuevo := round(p_nuevo, 2);
  v_ref := '#' || coalesce(e.referencia_gx, '');
  perform set_config('dynamo.revision_precio', 'on', true);
  if e.importe_cliente is null or e.importe_cliente = 0 or abs(p_nuevo - e.importe_cliente) * 100 / e.importe_cliente < v_margen then
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(), importe_revision_anterior = importe_cliente, importe_revision_nuevo = p_nuevo,
                      importe_cliente = coalesce(importe_cliente, p_nuevo) where id = p_envio;
    v_res := 'mantenido';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_confirmado', 'ok', 'Precio confirmado · ' || v_ref,
      'Hemos revisado el precio antes de la carga y se mantiene: ' || euros_texto(coalesce(e.importe_cliente, p_nuevo)) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  elsif p_nuevo < e.importe_cliente then
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(), importe_revision_anterior = importe_cliente, importe_revision_nuevo = p_nuevo,
                      importe_cliente = p_nuevo where id = p_envio;
    v_res := 'bajado';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_bajado', 'ok', 'Tu envío baja de precio · ' || v_ref,
      'Al revisarlo antes de la carga, el precio baja de ' || euros_texto(e.importe_cliente) || ' a ' || euros_texto(p_nuevo) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  else
    update envios set estado_revision_precio = 'esperando_cliente', revision_precio_en = now(), importe_revision_anterior = importe_cliente,
                      importe_revision_nuevo = p_nuevo, revision_precio_recordada = false where id = p_envio;
    v_res := 'subida';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · ' || v_ref,
      'El precio sube de ' || euros_texto(e.importe_cliente) || ' a ' || euros_texto(p_nuevo) || ' + IVA. Acéptalo o cancélalo sin coste desde la ficha del envío.',
      '/panel/envios?ver=' || e.id, e.id);
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', v_res);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_precios_programados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.referencia_gx, e.fecha_carga_desde, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.estado_revision_precio = 'pendiente' and e.fecha_revision_precio <= v_hoy
            for update of e skip locked loop
    update envios set estado_revision_precio = 'revisar' where id = r.id;
    perform crear_aviso('dynamo', null, null, 'requiere_revision_precio', 'aviso', 'Toca revisar el precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' · carga el ' || to_char(r.fecha_carga_desde, 'DD/MM') || '. Pon el precio definitivo en la ficha.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  for r in select e.id, e.referencia_gx, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.estado_revision_precio = 'esperando_cliente' and not e.revision_precio_recordada
              and e.revision_precio_en < now() - make_interval(hours => parametro_num('precio_revision_respuesta_horas', 24)::int)
            for update of e skip locked loop
    update envios set revision_precio_recordada = true where id = r.id;
    perform crear_aviso('dynamo', null, null, 'precio_sin_respuesta', 'urgente', 'No contesta a la subida de precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' no ha aceptado ni cancelado. Llámale.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.ver_revision_precio_envio(p_envio uuid)
 RETURNS TABLE(precio_calculado_en timestamp with time zone, estado_revision_precio text, fecha_revision_precio date, importe_revision_anterior numeric, importe_revision_nuevo numeric, revision_precio_en timestamp with time zone, margen_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.precio_calculado_en, e.estado_revision_precio, e.fecha_revision_precio, e.importe_revision_anterior, e.importe_revision_nuevo,
         e.revision_precio_en, parametro_num('precio_revision_margen_pct', 5)
    from envios e
   where e.id = p_envio and (ve_todo() or e.cliente_id = cliente_del_usuario())
     and (e.estado_solicitud is distinct from 'pendiente_precio')
$function$;
revoke all on function public.ver_revision_precio_envio(p_envio uuid) from public, anon, authenticated, service_role;
grant execute on function public.ver_revision_precio_envio(p_envio uuid) to authenticated;
grant execute on function public.ver_revision_precio_envio(p_envio uuid) to service_role;
comment on function public.ver_revision_precio_envio(p_envio uuid) is '[Precio y pago] Datos de la revisión de precio de un envío: cuándo se calculó, estado de la revisión, fecha prevista, precio anterior y nuevo, cuándo se revisó y margen %. Nada mientras la solicitud espera precio. Quién: Dynamo (también solo lectura) o cliente dueño del envío. Argumentos: p_envio: envios.id.';

CREATE OR REPLACE FUNCTION public.revocar_oferta(p_oferta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo gestiona ofertas.' using errcode = '42501'; end if;
  update envio_ofertas set estado = 'revocada' where id = p_oferta and estado = 'activa';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'resultado', case when n > 0 then 'revocada' else 'no_activa' end);
end $function$;

CREATE OR REPLACE FUNCTION public.riesgos_clientes()
 RETURNS TABLE(cliente_id uuid, nombre text, cif text, riesgo_cesce numeric, plazo_cesce integer, riesgo_manual numeric, riesgo_efectivo numeric, manda text, envios integer, asumido_base numeric, asumido numeric, disponible numeric, ultimo_envio date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (select parametro_num('riesgo_dias_asumido', 60)::int as dias),
  a as (
    select e.cliente_id, count(*)::int as n,
           sum(coalesce(e.importe_cliente, 0)) as base,
           sum(round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_pct, 21) / 100), 2)) as total,
           max(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as ultimo
      from envios e join clientes c on c.id = e.cliente_id, d
     where not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado')
       and e.estado_pago_previo in ('no_requerido', 'exento')          -- lo pagado por adelantado no es riesgo
       and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date) >= current_date - d.dias
     group by e.cliente_id
  )
  select c.id, c.nombre_visible, c.cif, c.riesgo_cesce_euros, c.riesgo_cesce_plazo_dias, c.riesgo_manual_euros,
         c.riesgo_efectivo_euros,
         case when coalesce(c.riesgo_manual_euros, 0) <> 0 then 'manual' when c.riesgo_cesce_euros is not null then 'cesce' else 'ninguno' end,
         coalesce(a.n, 0), coalesce(a.base, 0), coalesce(a.total, 0),
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(a.total, 0) end,
         a.ultimo
    from clientes c left join a on a.cliente_id = c.id
   where ve_todo()
$function$;

CREATE OR REPLACE FUNCTION public.sitio_principal(p_cliente uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.sitio_principal_id from clientes c
   where c.id = p_cliente and (ve_todo() or c.id = cliente_del_usuario())
$function$;

CREATE OR REPLACE FUNCTION public.validar_pin_manual(p_parada uuid, p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k record; par record;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo valida un PIN a mano.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nota, ''))) < 5 then
    raise exception 'Hay que explicar por que se valida a mano (quien llamo y motivo).';
  end if;
  select * into k from envio_parada_pines where parada_id = p_parada for update;
  if not found then return jsonb_build_object('resultado','no_exige_pin'); end if;
  if k.validado_en is not null then
    return jsonb_build_object('resultado','ya_validado','validado_en', k.validado_en);
  end if;
  select * into par from envio_paradas where id = p_parada;

  update envio_parada_pines set validado_en = now(), validado_modo = 'manual_dynamo',
         validado_por = auth.uid(), validado_nota = trim(p_nota)
   where parada_id = p_parada;
  update envio_paradas set realizado_en = coalesce(realizado_en, now()) where id = p_parada;

  perform registrar_hito(k.envio_id, 'pin_validado_manual', p_parada, null,
    jsonb_build_object('orden', par.orden, 'tipo', par.tipo, 'nota', trim(p_nota),
                       'estaba_bloqueado', k.bloqueado));
  perform registrar_hito(k.envio_id, 'incidencia', p_parada, null,
    jsonb_build_object('motivo', 'PIN validado a mano por Dynamo', 'nota', trim(p_nota),
                       'orden', par.orden));
  return jsonb_build_object('resultado','validado_manual','ahora', now());
end $function$;

CREATE OR REPLACE FUNCTION public.validar_pin_parada(p_parada uuid, p_pin text, p_ip inet DEFAULT NULL::inet, p_navegador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k record; par record; e record;
  v_max int; v_antes numeric; v_despues numeric; v_pend int; v_res text;
begin
  select * into k from envio_parada_pines where parada_id = p_parada for update;
  if not found or not k.exigido then
    return jsonb_build_object('resultado','no_exige_pin');
  end if;
  if k.validado_en is not null then
    return jsonb_build_object('resultado','ya_validado','validado_en', k.validado_en);
  end if;

  select * into par from envio_paradas where id = p_parada;
  select * into e   from envios        where id = k.envio_id;

  -- Cualquier rechazo antes de comparar queda también registrado (no cuenta como fallo).
  v_res := case
    when k.bloqueado then 'bloqueado'
    when e.transportista_id is null
      or e.estado not in ('programado','hacia_la_carga','cargando','en_ruta')
      then 'envio_no_activo'
  end;

  -- `#>> '{}'` convierte el null de JSON en un NULL de verdad (null = sin límite).
  -- (Un ::text a secas da la palabra 'null' y revienta: lo cazó la prueba.)
  v_antes   := (parametro('pin_ventana_horas_antes')   #>> '{}')::numeric;
  v_despues := (parametro('pin_ventana_horas_despues') #>> '{}')::numeric;
  if v_res is null and v_antes is not null and par.fecha_desde is not null
     and now() < par.fecha_desde - make_interval(secs => v_antes * 3600) then
    v_res := 'demasiado_pronto';
  end if;
  if v_res is null and v_despues is not null and coalesce(par.fecha_hasta, par.fecha_desde) is not null
     and now() > coalesce(par.fecha_hasta, par.fecha_desde) + make_interval(secs => v_despues * 3600) then
    v_res := 'demasiado_tarde';
  end if;

  -- ¿Quedan puntos ANTERIORES con PIN sin validar?
  select count(*) into v_pend
    from envio_parada_pines x join envio_paradas y on y.id = x.parada_id
   where x.envio_id = k.envio_id and x.exigido and x.validado_en is null
     and y.orden < par.orden;
  if v_res is null and v_pend > 0 and (parametro('pin_orden_obliga'))::boolean then
    v_res := 'faltan_puntos_anteriores';
  end if;

  if v_res is not null then
    insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
    values (p_parada, k.envio_id, false, v_res, p_ip, left(p_navegador, 400));
    return jsonb_build_object('resultado', v_res);
  end if;

  -- La comparación.
  if trim(coalesce(p_pin, '')) <> k.pin then
    v_max := (parametro('pin_max_intentos'))::int;
    update envio_parada_pines set intentos_fallidos = intentos_fallidos + 1,
           bloqueado = (intentos_fallidos + 1 >= v_max)
     where parada_id = p_parada returning * into k;
    insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
    values (p_parada, k.envio_id, false, 'pin_incorrecto', p_ip, left(p_navegador, 400));
    if k.bloqueado then
      perform registrar_hito(k.envio_id, 'pin_bloqueado', p_parada, null,
        jsonb_build_object('orden', par.orden, 'tipo', par.tipo, 'ip', host(p_ip)), 'servidor');
      perform registrar_hito(k.envio_id, 'incidencia', p_parada, null,
        jsonb_build_object('motivo', 'PIN bloqueado por intentos fallidos',
                           'orden', par.orden), 'servidor');
      return jsonb_build_object('resultado','bloqueado');
    end if;
    return jsonb_build_object('resultado','incorrecto',
                              'intentos_restantes', v_max - k.intentos_fallidos);
  end if;

  -- Acierto.
  update envio_parada_pines set validado_en = now(), validado_modo = 'enlace'
   where parada_id = p_parada;
  update envio_paradas set realizado_en = coalesce(realizado_en, now()) where id = p_parada;
  insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
  values (p_parada, k.envio_id, true, 'ok', p_ip, left(p_navegador, 400));
  perform registrar_hito(k.envio_id, 'pin_validado', p_parada, null,
    jsonb_build_object('orden', par.orden, 'tipo', par.tipo), 'servidor');
  if v_pend > 0 then
    perform registrar_hito(k.envio_id, 'pin_fuera_de_orden', p_parada, null,
      jsonb_build_object('orden', par.orden, 'puntos_anteriores_sin_validar', v_pend),
      'servidor');
  end if;
  return jsonb_build_object('resultado','validado','ahora', now(),
                            'aviso', case when v_pend > 0
                                          then 'hay puntos anteriores sin validar' end);
end $function$;

CREATE OR REPLACE FUNCTION public.validar_restricciones_envio(p_envio uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_gx text;
  v_r  record;
begin
  select referencia_gx into v_gx from envios where id = p_envio;

  for v_r in select * from restricciones_ruta(p_envio) loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_equipo_dynamo()) then
      raise exception 'Envio %, parada % (% en %): %',
        v_gx, v_r.orden, v_r.tipo, v_r.punto, v_r.mensaje;
    end if;
  end loop;
end $function$;

-- ---- La vista, con los nombres nuevos ---------------------------------------------
create view public.v_envios_con_paradas with (security_invoker=true) as  SELECT id,
    referencia_gx,
    token_publico,
    referencia_cliente,
    cliente_id,
    estado,
    estado_asignacion,
    transportista_id,
    vehiculo_camion_id,
    vehiculo_remolque_id,
    conductor_id,
    matricula_camion,
    matricula_remolque,
    conductor_nombre,
    conductor_telefono,
    transportista_nima,
    fecha_carga_desde,
    fecha_carga_hasta,
    fecha_carga_real,
    fecha_entrega_estimada,
    descripcion_mercancia,
    toneladas,
    metros_lineales,
    tipo_carga,
    paletizado,
    carga_lateral,
    carga_techo,
    carga_trasera,
    carga_lateral_bajo,
    requiere_plataforma_elevadora,
    requiere_nima,
    adr,
    importe_cliente,
    importe_transportista,
    moneda,
    margen_euros,
    factor_tarifa_pct,
    iva_pct,
    retencion_pct,
    plazo_pago_dias,
    precio_fijado_a_mano,
    codigo_postal_origen,
    poblacion_origen,
    codigo_postal_destino,
    poblacion_destino,
    num_paradas,
    distancia_total_km,
    holded_pedido_venta,
    holded_pedido_compra,
    publicado_en_bolsa_en,
    discrecion_comercial,
    anotaciones_cliente,
    creado_en,
    creado_por,
    modificado_en,
    modificado_por,
    confirmado_en,
    primera_oferta_en,
    asignado_en,
    cargado_en,
    entregado_en,
    cancelado_en,
    operador_id,
    precio_acordado_operador,
    es_manual,
    facturado_venta,
    facturado_compra,
    ( SELECT jsonb_agg(jsonb_build_object('id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso, 'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta, 'realizado_en', p.realizado_en, 'referencia', p.referencia, 'anotaciones', p.anotaciones, 'distancia_siguiente_km', p.distancia_siguiente_km) ORDER BY p.orden) AS jsonb_agg
           FROM envio_paradas p
          WHERE (p.envio_id = e.id)) AS paradas
   FROM envios e;
grant insert on public.v_envios_con_paradas to anon;
grant select on public.v_envios_con_paradas to anon;
grant update on public.v_envios_con_paradas to anon;
grant delete on public.v_envios_con_paradas to anon;
grant truncate on public.v_envios_con_paradas to anon;
grant references on public.v_envios_con_paradas to anon;
grant trigger on public.v_envios_con_paradas to anon;
grant insert on public.v_envios_con_paradas to authenticated;
grant select on public.v_envios_con_paradas to authenticated;
grant update on public.v_envios_con_paradas to authenticated;
grant delete on public.v_envios_con_paradas to authenticated;
grant truncate on public.v_envios_con_paradas to authenticated;
grant references on public.v_envios_con_paradas to authenticated;
grant trigger on public.v_envios_con_paradas to authenticated;
grant insert on public.v_envios_con_paradas to service_role;
grant select on public.v_envios_con_paradas to service_role;
grant update on public.v_envios_con_paradas to service_role;
grant delete on public.v_envios_con_paradas to service_role;
grant truncate on public.v_envios_con_paradas to service_role;
grant references on public.v_envios_con_paradas to service_role;
grant trigger on public.v_envios_con_paradas to service_role;
comment on view public.v_envios_con_paradas is 'Un envio con sus paradas ya ordenadas por `orden`.';

-- ---- Descripciones (diccionario) con los nombres nuevos ---------------------------
comment on table public.vehiculos is 'Flota: camiones, tractoras y remolques, una fila por matrícula (vengan con quien vengan). Se dan de alta solos al poner matrículas en un envío de Dynamo (disparador), los gestiona el transportista con guardar_mi_vehiculo() / dar_baja_mi_flota(), y Dynamo los escribe directamente.';
comment on table public.conductores is 'Conductores (una fila por persona, vengan con el transportista que vengan). Se dan de alta solos al asignar conductor en un envío (disparador), los da el transportista con guardar_mi_conductor() / dar_baja_mi_flota(), y Dynamo los escribe directamente.';
comment on table public.distancias_cp is 'Caché de km entre dos códigos postales (dirigida), para el tarifador público donde no hay ficha de sitio. Los CP se comparan normalizados (sin espacios ni guiones). Solo la escribe el servidor con guardar_km_cp(); se lee con km_cp().';
comment on table public.restricciones_servicio is 'Excepciones de servicio: dónde no se carga o descarga, o solo en camión completo. Una fila por regla, con interruptor y vigencia; solo afecta a los envíos que se generan desde ese momento. Los países atendidos están en parametros (cobertura_paises). Editable solo por Dynamo; se consulta con restriccion_punto() y comprobar_cobertura().';
comment on table public.distancias_sitios is 'Caché de km de Google entre dos sitios de la agenda (pareja dirigida A→B + version_geo de cada extremo): al mudarse un sitio la fila vieja deja de valer sola. Las viejas no se borran: justifican con qué km se tarificó cada envío. Solo la escribe el servidor con guardar_km_sitios(); se lee con km_sitios().';
comment on table public.incidencias is 'Incidencias (tickets) sobre un envío, un almacenamiento o sin ninguno (p. ej. una consulta de facturación). Las abren clientes, transportistas (de sus viajes; el cliente no las ve) o Dynamo; las reservas del CMR abren solas un siniestro (anotar_reservas_cmr_publico()). Resolverlas es solo de Dynamo.';
comment on table public.envio_reservas is 'Histórico de reservas de cada carga: el bloqueo de 3 min al abrir el enlace y su resultado (aceptada, contraoferta, caducada…). Solo una viva por envío a la vez. Se escribe SOLO con reservar_envio_publico(), aceptar_reserva(), aceptar_oferta_publica(), resolver_contraoferta() y liberar_reserva_publica().';
comment on table public.transportistas is 'Red de transportistas de Dynamo (proveedores): datos fiscales (Holded), bolsa de carga, seguro y datos internos (estado, valoraciones). Escribe Dynamo; el transportista lee con mi_empresa_transportista() y cambia NIMA y seguro con guardar_mis_datos_transporte(). Alta online: alta_transportista_publica().';
comment on table public.cmr_reservas is 'Reservas anotadas en el CMR digital antes de firmar (qué falta o está dañado): permiten reclamar al seguro y salen en la casilla 18 del PDF. Se escriben solo con anotar_reservas_cmr_publico() desde el enlace; cada una abre sola una incidencia de siniestro crítica. Máx. 3 por casilla y 10 por envío. No se editan.';
comment on table public.notas_internas is 'Notas del equipo de Dynamo sobre una ficha (usuario, cliente, transportista, camión, conductor o almacenamiento). SOLO DYNAMO las lee y escribe. Una por ficha y campo. Se escriben con guardar_nota_interna() o guardando la columna anotaciones (o anotaciones_incidencias) de la ficha: un disparador mueve el texto aquí y deja la columna vacía.';
comment on column public.clientes.forma_carga_defecto is 'formato: lista cerrada (forma_carga) | rango: no aplica | lista: paletizada_lateral, no_paletizada_lateral, no_paletizada_techo | opcional | Forma de carga que se propondría por defecto en sus envíos nuevos. Hoy ninguna pantalla lo rellena ni lo usa.';
comment on column public.clientes.requiere_pin is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Si es true, todos los puntos de carga y descarga de sus envíos exigen que el conductor valide un PIN. También se puede activar solo por sitio (sitios.requiere_pin).';
comment on column public.vehiculos.tiene_plataforma_elevadora is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Si el vehículo lleva plataforma elevadora (tiene_plataforma_elevadora).';
comment on column public.vehiculos.activo is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | false = dado de baja (dar_baja_mi_flota). No se borra; su matrícula puede volver a darse de alta.';
comment on column public.conductores.activo is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | false = dado de baja (dar_baja_mi_flota). No se borra: queda para el histórico, y su documento puede volver a darse de alta.';
comment on column public.envio_paradas.distancia_siguiente_km is 'formato: número decimal (2 decimales) | rango: mayor que 0 y menor que 6000 | lista: no aplica | opcional | Kilómetros desde este punto hasta el siguiente; su suma da envios.distancia_total_km. Hoy ninguna función lo rellena. Ej. OK: 531.40 · Ej. mal: 0';
comment on column public.distancias_sitios.version_origen is 'formato: número entero | rango: no aplica | lista: no aplica | automático | version_geo del sitio de origen cuando se pidieron los km. La pone guardar_km_sitios() leyendo la actual.';
comment on column public.distancias_sitios.version_destino is 'formato: número entero | rango: no aplica | lista: no aplica | automático | version_geo del sitio de destino cuando se pidieron los km. La pone guardar_km_sitios().';
comment on column public.envio_hitos.hito is 'formato: lista cerrada (tipo_hito) | rango: no aplica | lista: creado, confirmado, publicado_bolsa, transportista_asignado, transportista_quitado, matricula_asignada, cargado, entregado, cancelado, cancelacion_deshecha, ofertado, enlace_abierto, reservado, reserva_caducada, reserva_liberada, contraoferta_propuesta, contraoferta_resuelta, orden_carga_enviada, cmr_firmado, pin_enviado, pin_validado, pin_validado_manual, pin_fuera_de_orden, pin_bloqueado, incidencia, ruta_cambiada | obligatorio | Qué pasó (creado, confirmado, transportista_asignado, cargado, entregado, cancelado, ofertado, reservado, pin_validado, ruta_cambiada…). Cliente y transportista solo ven algunos.';
comment on column public.envio_ofertas.abierta_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Primera vez que el transportista abrió el enlace (instante). Lo pone reservar_envio_publico().';
comment on column public.envio_ofertas.aperturas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Veces que se ha abierto el enlace. Lo suma reservar_envio_publico().';
comment on column public.envios.estado_asignacion is 'formato: lista cerrada (estado_asignacion) | rango: no aplica | lista: sin_asignar, ofertada, reservada, confirmada | automático | Situación del transportista: sin_asignar, ofertada (hay ofertas), reservada (alguien la tiene 3 min), confirmada. La mueven ofertar_envio(), reservar_envio_publico() y la aceptación; ningún disparador lo hace al asignar a mano.';
comment on column public.envios.distancia_total_km is 'formato: número decimal (2 decimales) | rango: no aplica | lista: no aplica | automático | Kilómetros totales: suma de distancia_siguiente_km de las paradas, por disparador. Hoy suele quedar vacío porque nadie rellena esos km.';
comment on column public.envios.importe_contraoferta_cliente is 'formato: número decimal (2 decimales) | rango: mayor que 0 y menor que importe_cliente | lista: no aplica | opcional | Precio en euros SIN IVA que propuso el cliente frente al nuestro (ver estado_solicitud). Solo con contraofertar_precio_solicitud(). Ej. OK: 800.00';
comment on column public.envios.pago_pendiente_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Desde cuándo está pendiente de pago (instante), para el plazo pago_previo_horas; pasado, se anula solo. La pone la base de datos; ampliar_plazo_pago() la renueva.';
comment on column public.incidencias.estado is 'formato: lista cerrada (estado_incidencia) | rango: no aplica | lista: abierto, en_curso, resuelto, cancelado | opcional | Estado del ticket (abierto, en_curso, resuelto, cancelado). Quien la abrió solo puede retirarla (cancelado) mientras está abierta; resolverla es de Dynamo.';
comment on column public.incidencias.prioridad is 'formato: lista cerrada (prioridad_incidencia) | rango: no aplica | lista: baja, media, alta, critica | opcional | Prioridad (baja, media por defecto, alta, crítica). Los siniestros entran siempre como crítica (disparador). Alta o crítica llegan a Dynamo como aviso urgente.';
comment on column public.transportistas.nima is 'formato: texto | rango: máx. 40 caracteres desde su panel | lista: no aplica | opcional | NIMA (número de gestor de residuos) del TRANSPORTISTA, no del cliente ni del envío: lo aporta al aceptar una carga de residuos. Lo cambian Dynamo o él (guardar_mis_datos_transporte). Ej. OK: 4100012345';
comment on column public.usuarios.limite_consultas_precio_diario is 'formato: número entero | rango: mayor que 0 | lista: no aplica | opcional | Tope de consultas de precio al día para este usuario; si lo supera, se suspende solo. Vacío = el general (parámetro autosuspension_consultas_dia). Solo Dynamo. Ej. OK: 20 · Ej. mal: 0';
comment on column public.documentos.tipo is 'formato: texto | rango: no aplica | lista: albaran, cmr, cmr_firmado, orden_carga, proforma, seguro_cmr (seguro del transportista), tarjeta_transporte, foto_incidencia, gps_tacografo (prueba GPS/tacógrafo del viaje), hoja_cif, dni, logo (de un operador), adjunto, otro | obligatorio | Clase de documento. Ej. OK: albaran · Ej. mal: factura';
comment on column public.almacenamientos.pagado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Cuándo validó Dynamo el pago por adelantado (instante, timestamptz). Vacío = sin pagar, o no hace falta (requiere_pago_previo = false). Solo Dynamo.';
comment on column public.cmr_reservas.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | automático | Envío (→ envios.id). Lo deduce anotar_reservas_cmr_publico() a partir del enlace de firma.';
comment on column public.notas_internas.campo is 'formato: texto | rango: no aplica | lista: anotaciones (notas generales, por defecto), anotaciones_incidencias (notas sobre incidencias; solo en transportistas) | opcional | Qué nota de la ficha es.';
