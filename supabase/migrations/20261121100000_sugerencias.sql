-- =====================================================================================
-- SUGERENCIAS Y FALLOS (usuario, 2026-11-21)
-- =====================================================================================
-- «Un botón en Soporte, sea por donde sea donde entre, de sugerencias o mejoras, donde nos
-- indiquen qué mejoras podemos hacer o si han detectado algún fallo técnico: un campo de
-- comentario sencillo, los botones de hacer foto y subir foto, y "Enviar sugerencia". Que
-- llegue a nuestro panel: en el menú, "Sugerencias", en un listado paginado; al pinchar,
-- el detalle con la foto, el comentario, quién y cuándo, y un estado: activa (al entrar),
-- desestimada o realizada.»
--   · Cualquier cuenta activa (cliente, transportista o del equipo) envía la suya con
--     enviar_sugerencia(); las fotos van al almacén de documentos colgadas de la sugerencia
--     (documentos.sugerencia_id), como las de una incidencia.
--   · Cada uno ve solo las suyas; Dynamo las ve todas y cambia el estado con su nota.
--   · Al entrar una, aviso en la campana de Dynamo y un número en el menú (las activas).

create table if not exists sugerencias (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  usuario_id uuid references usuarios(id) on delete set null,
  autor_email text,
  cliente_id uuid references clientes(id) on delete set null,
  transportista_id uuid references transportistas(id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 3 and 4000),
  pagina text check (pagina is null or char_length(pagina) <= 300),
  navegador text check (navegador is null or char_length(navegador) <= 300),
  estado text not null default 'activa' check (estado in ('activa', 'desestimada', 'realizada')),
  nota_dynamo text check (nota_dynamo is null or char_length(nota_dynamo) <= 2000),
  revisada_por uuid references usuarios(id) on delete set null,
  revisada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists idx_sugerencias_estado on sugerencias (estado, creado_en desc);
create index if not exists idx_sugerencias_usuario on sugerencias (usuario_id);
create index if not exists idx_sugerencias_cliente on sugerencias (cliente_id) where cliente_id is not null;
create index if not exists idx_sugerencias_transportista on sugerencias (transportista_id) where transportista_id is not null;
create index if not exists idx_sugerencias_revisada_por on sugerencias (revisada_por) where revisada_por is not null;

alter table sugerencias enable row level security;
drop policy if exists sugerencias_ver on sugerencias;
create policy sugerencias_ver on sugerencias for select to authenticated
  using (ve_todo() or usuario_id = (select auth.uid()));
revoke all on sugerencias from anon;
revoke insert, update, delete on sugerencias from authenticated;

drop trigger if exists tg_mantenimiento on sugerencias;
create trigger tg_mantenimiento before insert or update or delete on sugerencias
  for each row execute function fn_bloqueo_mantenimiento();

comment on table sugerencias is '[Gestión interna] Sugerencias de mejora y fallos técnicos que manda cualquier usuario desde Soporte, con fotos opcionales (documentos.sugerencia_id). Dynamo las revisa en Gestión interna → Sugerencias: activa al entrar; desestimada o realizada después. Cada usuario ve solo las suyas.';
comment on column sugerencias.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador. Ej. OK: 3f2a…';
comment on column sugerencias.numero is 'formato: número entero | rango: >= 1 | lista: no aplica | automático | Número correlativo que se enseña (SUG-12). Ej. OK: 12';
comment on column sugerencias.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién la mandó (vacío si la cuenta ya no existe). Ej. OK: 0b6f…';
comment on column sugerencias.autor_email is 'formato: email | rango: no aplica | lista: no aplica | automático | Email de quien la mandó, tal como era al enviarla. Ej. OK: compras@empresa.es';
comment on column sugerencias.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | automático | Empresa cliente de quien la mandó, si es un cliente. Ej. OK: 0b6f…';
comment on column sugerencias.transportista_id is 'formato: uuid | → transportistas.id | rango: no aplica | lista: no aplica | automático | Transportista de quien la mandó, si es un transportista. Ej. OK: 0b6f…';
comment on column sugerencias.texto is 'formato: texto | rango: 3 a 4000 caracteres | lista: no aplica | obligatorio | La sugerencia o el fallo, en sus palabras. Ej. OK: Al filtrar por fecha en el móvil no se ve el calendario';
comment on column sugerencias.pagina is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | automático | Pantalla desde la que la mandó (ruta). Ej. OK: /panel/envios';
comment on column sugerencias.navegador is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | automático | Navegador y aparato, para reproducir un fallo. Ej. OK: Safari · iPhone';
comment on column sugerencias.estado is 'formato: texto | rango: no aplica | lista: activa · desestimada · realizada | obligatorio | Activa al entrar; Dynamo la desestima o la marca realizada. Ej. OK: activa';
comment on column sugerencias.nota_dynamo is 'formato: texto | rango: hasta 2000 caracteres | lista: no aplica | opcional | Nota interna de Dynamo al revisarla (qué se hizo o por qué no). Ej. OK: Arreglado en la versión del 25-nov';
comment on column sugerencias.revisada_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién de Dynamo le cambió el estado por última vez. Ej. OK: 0b6f…';
comment on column sugerencias.revisada_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Cuándo se le cambió el estado por última vez. Ej. OK: 2026-11-21 19:40+01';
comment on column sugerencias.creado_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Cuándo la mandó. Ej. OK: 2026-11-21 19:30+01';

-- ---- Mandar una sugerencia -----------------------------------------------------------------
create or replace function public.enviar_sugerencia(p_texto text, p_pagina text default null, p_navegador text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u usuarios%rowtype; v_id uuid; v_num bigint; v_hoy int;
begin
  select * into u from usuarios where id = auth.uid() and estado = 'activa';
  if not found then raise exception 'Tu cuenta no está activa.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_texto, ''))) < 3 then raise exception 'Escribe la sugerencia o el fallo.'; end if;
  -- Freno sencillo contra el abuso: 20 al día por persona.
  select count(*) into v_hoy from sugerencias where usuario_id = u.id and creado_en > now() - interval '1 day';
  if v_hoy >= 20 then raise exception 'Has mandado muchas sugerencias hoy: mañana puedes mandar más.'; end if;
  insert into sugerencias (usuario_id, autor_email, cliente_id, transportista_id, texto, pagina, navegador)
  values (u.id, u.email, u.cliente_id, u.transportista_id, left(btrim(p_texto), 4000),
          nullif(left(btrim(coalesce(p_pagina, '')), 300), ''), nullif(left(btrim(coalesce(p_navegador, '')), 300), ''))
  returning id, numero into v_id, v_num;
  perform crear_aviso('dynamo', null, null, 'sugerencia', 'info', 'Sugerencia nueva · SUG-' || v_num,
    left(coalesce(nullif(u.nombre, ''), u.email) || ': ' || btrim(p_texto), 500), '/panel/sugerencias?ver=' || v_id, null);
  return v_id;
end $$;
revoke execute on function public.enviar_sugerencia(text, text, text) from public, anon;
grant execute on function public.enviar_sugerencia(text, text, text) to authenticated;
comment on function public.enviar_sugerencia(text, text, text) is '[Gestión interna] Guarda una sugerencia o un fallo técnico de quien está dentro (activa), con su empresa, y avisa a Dynamo en la campana. Como mucho 20 al día por persona. Devuelve su id (las fotos se cuelgan después como documentos). Quién: cualquier cuenta activa. Argumentos: p_texto: el comentario · p_pagina: la pantalla desde la que se manda · p_navegador: navegador y aparato.';

-- ---- Revisarla (Dynamo) ----------------------------------------------------------------------
create or replace function public.revisar_sugerencia(p_sugerencia uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo revisa las sugerencias.' using errcode = '42501'; end if;
  if p_estado not in ('activa', 'desestimada', 'realizada') then raise exception 'Estado no válido.'; end if;
  update sugerencias set estado = p_estado, nota_dynamo = nullif(left(btrim(coalesce(p_nota, '')), 2000), ''),
                         revisada_por = auth.uid(), revisada_en = now()
   where id = p_sugerencia;
  if not found then raise exception 'Esa sugerencia no existe.'; end if;
end $$;
revoke execute on function public.revisar_sugerencia(uuid, text, text) from public, anon;
grant execute on function public.revisar_sugerencia(uuid, text, text) to authenticated;
comment on function public.revisar_sugerencia(uuid, text, text) is '[Gestión interna] Cambia el estado de una sugerencia (activa, desestimada o realizada) con una nota interna, y anota quién y cuándo. Quién: el equipo de Dynamo con permiso de escritura. Argumentos: p_sugerencia: sugerencias.id · p_estado: activa, desestimada o realizada · p_nota: nota interna.';

-- ---- Las fotos: documentos colgados de la sugerencia ---------------------------------------
alter table documentos add column if not exists sugerencia_id uuid references sugerencias(id) on delete restrict;
create index if not exists idx_documentos_sugerencia on documentos (sugerencia_id) where sugerencia_id is not null;
comment on column public.documentos.sugerencia_id is 'formato: uuid | → sugerencias.id | rango: no aplica | lista: no aplica | opcional | Sugerencia a la que pertenece (→ sugerencias.id): las fotos que manda quien la escribe.';

alter table documentos drop constraint if exists ck_documentos_dueno;
alter table documentos add constraint ck_documentos_dueno check (
  envio_id is not null or incidencia_id is not null or almacenamiento_id is not null or transportista_id is not null
  or penalizacion_id is not null or operador_id is not null or usuario_id is not null or cliente_id is not null
  or sugerencia_id is not null or es_recurso);
alter table documentos drop constraint if exists ck_documentos_recurso;
alter table documentos add constraint ck_documentos_recurso check (
  not es_recurso or (recurso_titulo is not null and envio_id is null and incidencia_id is null and almacenamiento_id is null
    and transportista_id is null and penalizacion_id is null and operador_id is null and usuario_id is null and cliente_id is null
    and sugerencia_id is null));

-- Quien la escribe ve sus fotos (Dynamo ya lo ve todo).
drop policy if exists documentos_sel_sugerencia on documentos;
create policy documentos_sel_sugerencia on documentos for select to authenticated
  using (not borrado and sugerencia_id is not null
         and exists (select 1 from sugerencias s where s.id = documentos.sugerencia_id and s.usuario_id = (select auth.uid())));
-- Y las sube, en su carpeta, solo a SU sugerencia y en la hora siguiente a mandarla.
drop policy if exists documentos_ins_sugerencia on documentos;
create policy documentos_ins_sugerencia on documentos for insert to authenticated
  with check (tipo = 'adjunto' and sugerencia_id is not null
    and storage_ruta like 'u/' || (select auth.uid())::text || '/%'
    and envio_id is null and incidencia_id is null and almacenamiento_id is null and transportista_id is null
    and penalizacion_id is null and operador_id is null and usuario_id is null and cliente_id is null
    and exists (select 1 from sugerencias s where s.id = documentos.sugerencia_id and s.usuario_id = (select auth.uid())
                and s.creado_en > now() - interval '1 hour'));
-- Candado: fuera de Dynamo, sugerencia_id solo en ese caso (nadie cuelga un documento de
-- otra subida permitida en la sugerencia de otro).
drop policy if exists documentos_sugerencia_solo_propia on documentos;
create policy documentos_sugerencia_solo_propia on documentos as restrictive for insert to authenticated
  with check (sugerencia_id is null or (select es_equipo_dynamo())
    or (tipo = 'adjunto' and envio_id is null and incidencia_id is null and almacenamiento_id is null and transportista_id is null
        and penalizacion_id is null and operador_id is null and usuario_id is null and cliente_id is null
        and exists (select 1 from sugerencias s where s.id = documentos.sugerencia_id and s.usuario_id = (select auth.uid())
                    and s.creado_en > now() - interval '1 hour')));

-- Como mucho 5 fotos por sugerencia.
create or replace function public.fn_documentos_sugerencia_max()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sugerencia_id is not null
     and (select count(*) from documentos d where d.sugerencia_id = new.sugerencia_id and not d.borrado) >= 5 then
    raise exception 'Como máximo 5 fotos por sugerencia.';
  end if;
  return new;
end $$;
revoke execute on function public.fn_documentos_sugerencia_max() from public, anon, authenticated;
comment on function public.fn_documentos_sugerencia_max() is '[Gestión interna] Disparador de documentos: como mucho 5 fotos por sugerencia. Quién: el disparador. Argumentos: ninguno.';
drop trigger if exists tg_documentos_sugerencia_max on documentos;
create trigger tg_documentos_sugerencia_max before insert on documentos
  for each row when (new.sugerencia_id is not null) execute function public.fn_documentos_sugerencia_max();

-- ---- El número del menú: sugerencias activas (solo la vista de Dynamo) ------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.contadores_panel(uuid, uuid)'::regprocedure);
  if position('sugerencias' in v) > 0 then return; end if;
  if (length(v) - length(replace(v, '''altas'',', ''))) / length('''altas'',') <> 1 then
    raise exception 'contadores_panel: no encuentro una sola línea de altas';
  end if;
  n := replace(v, '''altas'',', '''sugerencias'', (select count(*) from public.sugerencias where estado = ''activa''),
      ''altas'',');
  execute n;
end $$;
