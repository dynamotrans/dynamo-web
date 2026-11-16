-- =====================================================================================
-- LOGO DE LA EMPRESA DEL CLIENTE, Y EL CLIENTE QUITA SUS LOGOS (usuario, 2026-11-16)
-- =====================================================================================
-- 1) «Aquí ponemos logo empresa, y si no hay, iniciales de empresa.» El cliente puede tener
--    el logo de SU empresa: lo sube él desde Mi cuenta → Datos empresa, o Dynamo desde la
--    ficha del cliente. Es un documento de tipo «logo» cuyo dueño es el cliente
--    (documentos.cliente_id), igual que el logo de un transportista propio lo es del operador.
-- 2) «El usuario debe poder editar fotos de SUS transportistas siempre.» Quitar un documento
--    solo podía hacerlo Dynamo, así que al cliente le salía «Solo el equipo de Dynamo quita
--    documentos» al quitar o cambiar el logo de uno de sus transportistas. Ahora un cliente
--    quita los LOGOS que son suyos: el de su empresa y los de sus transportistas propios.
--    El resto de documentos (albaranes, CMR…) sigue quitándolos solo Dynamo: son prueba.

-- ---- 1. El cliente como dueño de un documento -------------------------------------------
alter table documentos add column cliente_id uuid references clientes(id) on delete restrict;
create index idx_documentos_cliente on documentos (cliente_id) where cliente_id is not null;
comment on column public.documentos.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | opcional | Cliente al que pertenece (→ clientes.id): el logo de su empresa, que sale arriba en su panel.';

alter table documentos drop constraint ck_documentos_dueno;
alter table documentos add constraint ck_documentos_dueno check (
  envio_id is not null or incidencia_id is not null or almacenamiento_id is not null or transportista_id is not null
  or penalizacion_id is not null or operador_id is not null or usuario_id is not null or cliente_id is not null or es_recurso);
alter table documentos drop constraint ck_documentos_recurso;
alter table documentos add constraint ck_documentos_recurso check (
  not es_recurso or (recurso_titulo is not null and envio_id is null and incidencia_id is null and almacenamiento_id is null
    and transportista_id is null and penalizacion_id is null and operador_id is null and usuario_id is null and cliente_id is null));

-- ---- 2. Quién lo ve y quién lo sube -------------------------------------------------------
-- El cliente ve el logo de su empresa (Dynamo ya lo ve todo).
create policy documentos_sel_logo_cliente on documentos for select to authenticated
  using (not borrado and tipo = 'logo' and cliente_id is not null and cliente_id = (select cliente_del_usuario()));
-- El cliente sube el logo de SU empresa, en su carpeta, y de nadie más.
create policy documentos_ins_logo_cliente on documentos for insert to authenticated
  with check (tipo = 'logo' and cliente_id is not null and cliente_id = (select cliente_del_usuario())
    and storage_ruta like 'u/' || (select auth.uid())::text || '/%'
    and envio_id is null and incidencia_id is null and almacenamiento_id is null and transportista_id is null
    and penalizacion_id is null and operador_id is null and usuario_id is null);
-- Candado: fuera de Dynamo, cliente_id SOLO puede llevar el cliente propio y SOLO en un logo
-- que no tenga otro dueño. Así nadie le «planta» un documento a otra empresa colgándolo de
-- una subida que sí tiene permitida (p. ej. el logo de uno de sus transportistas).
create policy documentos_cliente_id_solo_logo_propio on documentos as restrictive for insert to authenticated
  with check (cliente_id is null or (select es_equipo_dynamo())
    or (tipo = 'logo' and cliente_id = (select cliente_del_usuario())
        and envio_id is null and incidencia_id is null and almacenamiento_id is null and transportista_id is null
        and penalizacion_id is null and operador_id is null and usuario_id is null));

-- ---- 3. El cliente quita SUS logos --------------------------------------------------------
create or replace function quitar_logo(p_documento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d documentos%rowtype; v_cli uuid := cliente_del_usuario();
begin
  select * into d from documentos where id = p_documento and tipo = 'logo' and not borrado;
  if not found then raise exception 'Ese logo ya no existe.'; end if;
  if not es_equipo_dynamo() then
    if v_cli is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa')
       or not (d.cliente_id = v_cli
               or exists (select 1 from operadores o where o.id = d.operador_id and o.cliente_id = v_cli)) then
      raise exception 'No tienes permiso para quitar ese logo.' using errcode = '42501';
    end if;
  end if;
  update documentos set borrado = true, borrado_en = now() where id = p_documento;
end $$;
revoke execute on function quitar_logo(uuid) from public, anon;
grant execute on function quitar_logo(uuid) to authenticated;
comment on function public.quitar_logo(uuid) is '[Documentos] Quita (borrado suave) un logo. El cliente puede quitar los que son suyos: el de su empresa y los de sus transportistas propios; el equipo de Dynamo, cualquiera. El resto de documentos no se quitan por aquí (solo Dynamo, desde la ficha). Quién: cliente con la cuenta activa o equipo de Dynamo. Argumentos: p_documento: documentos.id del logo.';

-- ---- 4. El logo de mi empresa, para pintarlo arriba ---------------------------------------
create or replace function mi_logo_empresa()
returns uuid language sql stable security definer set search_path = public as $$
  select d.id from documentos d
   where d.cliente_id = cliente_del_usuario() and d.tipo = 'logo' and not d.borrado
   order by d.creado_en desc limit 1
$$;
revoke execute on function mi_logo_empresa() from public, anon;
grant execute on function mi_logo_empresa() to authenticated;
comment on function public.mi_logo_empresa() is '[Clientes y cuentas] El documento (documentos.id) con el logo vigente de la empresa del cliente que llama, o nada si no tiene. Quién: cliente. Argumentos: sin argumentos.';
