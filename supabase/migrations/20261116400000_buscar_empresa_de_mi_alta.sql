-- =====================================================================================
-- BUSCAR MI EMPRESA POR CIF AL DARME DE ALTA (usuario, 2026-11-16)
-- =====================================================================================
-- Quien se registra entra con el alta pendiente y sin empresa. Antes de subir la
-- documentación escribe el CIF / NIF de su empresa:
--   · si YA es cliente de Dynamo, no rellena nada más: Dynamo le asocia al verificar;
--   · si no lo es, se le abre el alta de la empresa (razón social, domicilio, contacto).
--
-- La respuesta es solo «está / no está». Nunca el nombre ni ningún otro dato del cliente:
-- quien tiene el alta pendiente no ve la tabla de clientes, y así sigue.
--
-- TOPE: 5 CIF distintos cada 24 horas por usuario (y 30 búsquedas en total). Sin él,
-- cualquiera que se registre podría ir probando CIF para saber quién es cliente de
-- Dynamo. Cada búsqueda queda apuntada, y Dynamo las ve.

create table alta_busquedas_cif (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  cif        text not null,
  encontrado boolean not null,
  creado_en  timestamptz not null default now()
);
create index alta_busquedas_cif_usuario_idx on alta_busquedas_cif (usuario_id, creado_en);
comment on table alta_busquedas_cif is 'Cada búsqueda de empresa por CIF / NIF que hace quien tiene el alta pendiente, desde su pantalla de alta. Sirve para poner tope a las búsquedas (nadie averigua probando quién es cliente) y para que Dynamo vea qué se buscó. Solo se añaden.';
comment on column alta_busquedas_cif.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único de la búsqueda.';
comment on column alta_busquedas_cif.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Usuario con el alta pendiente que buscó.';
comment on column alta_busquedas_cif.cif is 'formato: texto, en mayúsculas y sin espacios, puntos ni guiones | rango: 4 a 20 caracteres | lista: no aplica | obligatorio | CIF / NIF buscado, ya normalizado. Ej. OK: B12345678 · Ej. mal: b-12.345.678';
comment on column alta_busquedas_cif.encontrado is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Si ese CIF / NIF era ya de un cliente en el momento de buscar.';
comment on column alta_busquedas_cif.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Fecha y hora de la búsqueda.';
create trigger tg_mantenimiento before insert or update or delete on alta_busquedas_cif
  for each row execute function fn_bloqueo_mantenimiento();
alter table alta_busquedas_cif enable row level security;
create policy alta_busquedas_cif_ver on alta_busquedas_cif for select using (ve_todo());
-- Sin políticas de escritura: solo entra por buscar_empresa_de_mi_alta.

create or replace function buscar_empresa_de_mi_alta(p_cif text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_cif text := nullif(normalizar_id_fiscal(p_cif), '');
  v_hay boolean;
begin
  if auth.uid() is null or not exists (
       select 1 from usuarios where id = auth.uid() and estado = 'pendiente_verificacion' and rol = 'cliente' and cliente_id is null) then
    raise exception 'Solo quien tiene el alta pendiente busca su empresa.' using errcode = '42501';
  end if;
  if v_cif is null or v_cif !~ '^[A-Z0-9]{4,20}$' then return 'no_valido'; end if;
  -- Tope contra el sondeo: 5 CIF distintos (repetir uno ya buscado no cuenta) y 30
  -- búsquedas en total, cada 24 horas.
  if (select count(*) from alta_busquedas_cif
       where usuario_id = auth.uid() and creado_en > now() - interval '24 hours') >= 30
     or (not exists (select 1 from alta_busquedas_cif
                      where usuario_id = auth.uid() and creado_en > now() - interval '24 hours' and cif = v_cif)
         and (select count(distinct cif) from alta_busquedas_cif
               where usuario_id = auth.uid() and creado_en > now() - interval '24 hours') >= 5) then
    return 'tope';
  end if;
  v_hay := exists (select 1 from clientes where normalizar_id_fiscal(cif) = v_cif);
  insert into alta_busquedas_cif (usuario_id, cif, encontrado) values (auth.uid(), v_cif, v_hay);
  return case when v_hay then 'encontrado' else 'no_encontrado' end;
end $$;
revoke execute on function buscar_empresa_de_mi_alta(text) from public, anon;
grant execute on function buscar_empresa_de_mi_alta(text) to authenticated;
comment on function public.buscar_empresa_de_mi_alta(text) is '[Altas] Dice si el CIF / NIF que escribe quien tiene el alta pendiente es ya de un cliente de Dynamo: encontrado, no_encontrado, no_valido (no parece un CIF / NIF) o tope (ha buscado demasiado: 5 CIF distintos o 30 búsquedas en 24 horas). No devuelve ningún dato del cliente. Apunta cada búsqueda. Quién: usuario cliente con el alta pendiente y sin empresa. Argumentos: p_cif: CIF / NIF de la empresa, con o sin guiones y puntos.';
