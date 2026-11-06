-- BAJA DE CUENTA POR EL PROPIO USUARIO (usuario, 2026-11-06).
-- Un cliente o transportista puede darse de baja desde «Mi cuenta». La baja es solo de su
-- ACCESO: la cuenta queda suspendida con el motivo «Baja a petición del usuario» y no puede
-- entrar a ver ni crear nada. NO se borra nada: su empresa, sus envíos, albaranes, CMR,
-- documentos de control, facturas y su propio nombre en el histórico se conservan, porque
-- la ley obliga a guardarlos (inspección de transporte, Hacienda, Código de Comercio) y
-- porque su empresa puede tener más usuarios. Si después pide que se borren sus datos
-- personales (RGPD), Dynamo usa «Anonimizar» (no toca envíos ni documentos).
-- Dynamo puede reactivarla como cualquier suspendida.

create or replace function baja_propia_en_curso(o usuarios, n usuarios)
returns boolean language sql stable set search_path = public as $$
  -- Solo la que hace darme_de_baja(): la propia cuenta, de activa (o pendiente) a
  -- suspendida con el motivo de la baja, sin tocar nada más que la suspensión.
  select coalesce(current_setting('dynamo.baja_propia', true), '') = 'on'
     and n.id = auth.uid() and o.id = n.id
     and o.estado in ('activa', 'pendiente_verificacion') and n.estado = 'suspendida'
     and n.suspension_motivo like 'Baja a petición del usuario%'
     and (n.rol, n.cliente_id, n.transportista_id, n.limite_consultas_precio_diario, n.limite_envios_diario,
          n.exento_autosuspension, n.autosuspension_desde_en, n.email, n.emails_copia_avisos, n.anotaciones)
         is not distinct from
         (o.rol, o.cliente_id, o.transportista_id, o.limite_consultas_precio_diario, o.limite_envios_diario,
          o.exento_autosuspension, o.autosuspension_desde_en, o.email, o.emails_copia_avisos, o.anotaciones)
$$;
comment on function baja_propia_en_curso(usuarios, usuarios) is
  'Verdadero solo durante darme_de_baja(): deja pasar a la propia cuenta de activa a suspendida por baja voluntaria, sin cambiar nada más.';
revoke all on function baja_propia_en_curso(usuarios, usuarios) from public, anon;

CREATE OR REPLACE FUNCTION public.fn_usuarios_aa_autosusp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.exento_autosuspension, new.autosuspension_desde_en, new.suspendida_en, new.suspension_motivo)
     is distinct from (old.exento_autosuspension, old.autosuspension_desde_en, old.suspendida_en, old.suspension_motivo)
     and not es_servidor() and not es_equipo_dynamo() and not autosuspension_en_curso(old, new)
     and not baja_propia_en_curso(old, new) then
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

  if es_servidor() or autosuspension_en_curso(old, new) or baja_propia_en_curso(old, new) then return new; end if;
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


create or replace function darme_de_baja(p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u usuarios%rowtype; v_otros int; v_en_marcha int;
begin
  select * into u from usuarios where id = auth.uid() for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if u.rol not in ('cliente', 'transportista') then
    -- El equipo de Dynamo se da de baja desde Usuarios (y el Admin Master, desde Supabase).
    return jsonb_build_object('resultado', 'solo_clientes_y_transportistas');
  end if;
  if u.estado = 'suspendida' then return jsonb_build_object('resultado', 'ya_suspendida'); end if;

  -- Si es el último usuario activo de su empresa y hay envíos en marcha, alguien tiene que
  -- seguir recibiendo los avisos de esos envíos: primero que llame.
  select count(*) into v_otros from usuarios o
   where o.id <> u.id and o.estado = 'activa'
     and ((u.cliente_id is not null and o.cliente_id = u.cliente_id)
       or (u.transportista_id is not null and o.transportista_id = u.transportista_id));
  if v_otros = 0 then
    select count(*) into v_en_marcha from envios e
     where e.estado in ('hacia_la_carga', 'cargando', 'en_ruta')
       and ((u.cliente_id is not null and e.cliente_id = u.cliente_id)
         or (u.transportista_id is not null and e.transportista_id = u.transportista_id));
    if v_en_marcha > 0 then
      return jsonb_build_object('resultado', 'envios_en_marcha', 'envios', v_en_marcha);
    end if;
  end if;

  perform set_config('dynamo.baja_propia', 'on', true);
  update usuarios
     set estado = 'suspendida', suspendida_en = now(),
         suspension_motivo = 'Baja a petición del usuario' || coalesce(': ' || nullif(left(btrim(p_motivo), 300), ''), '.')
   where id = u.id;
  perform set_config('dynamo.baja_propia', 'off', true);

  perform crear_aviso('dynamo', null, null, 'baja_cuenta', 'aviso', 'Un usuario se ha dado de baja',
    coalesce(u.nombre, u.email) || ' (' || u.email || ')' || case when v_otros = 0 then '. Era el último usuario activo de su empresa.' else '.' end,
    '/panel/usuarios', null);
  return jsonb_build_object('resultado', 'ok', 'ultimo_de_su_empresa', v_otros = 0);
end $$;
comment on function darme_de_baja(text) is
  'Baja voluntaria del ACCESO de un cliente o transportista: suspende su propia cuenta con el motivo «Baja a petición del usuario». No borra nada (envíos, documentos y datos se conservan por obligación legal). Rechaza si es el último usuario activo de su empresa y hay envíos en marcha.';
revoke all on function darme_de_baja(text) from public, anon;
grant execute on function darme_de_baja(text) to authenticated;
