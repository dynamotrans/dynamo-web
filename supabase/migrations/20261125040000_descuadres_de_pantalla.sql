-- =====================================================================================
-- DESCUADRES DE PANTALLA EN EL MÓVIL (usuario, 2026-11-25)
-- =====================================================================================
-- «¿Por qué cada semana tengo que decirte que el scroll se queda infinito? Lo arreglas y al
-- tiempo vuelve a pasar.»
--
-- QUÉ PASA: en el iPhone (iOS 26, en Safari y en Chrome) la pantalla a veces se queda mirando
-- más abajo de donde acaba la página: sale una zona vacía debajo del contenido. Es un fallo
-- del navegador del teléfono y aquí, en las pruebas, no se puede provocar.
--
-- QUÉ SE HACE: el navegador lo detecta y lo recoloca solo (components/GuardaVista.tsx) y,
-- cada vez que pasa, lo APUNTA aquí con las medidas de la pantalla de antes y de después.
-- Así se sabe cuándo pasa, en qué teléfono y si el arreglo sirvió, sin que nadie avise.
-- Solo medidas, ruta y navegador: nada de lo que el usuario veía o escribía.

create table if not exists public.pantalla_descuadres (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios (id) on delete set null,
  causa      text not null check (causa in ('pasado_del_final', 'zona_desplazada', 'scroll_de_mas', 'pagina_larga')),
  ruta       text not null,
  navegador  text not null,
  corregido  boolean not null default false,
  datos      jsonb not null default '{}',
  creado_en  timestamptz not null default now()
);
create index if not exists pantalla_descuadres_creado_idx on public.pantalla_descuadres (creado_en desc);
create index if not exists pantalla_descuadres_usuario_idx on public.pantalla_descuadres (usuario_id, creado_en);
comment on table public.pantalla_descuadres is 'Cada vez que el navegador de un usuario detecta que la pantalla se ha quedado descuadrada (zona vacía debajo del contenido en el móvil) y la recoloca solo. Sirve para saber cuándo pasa, en qué teléfono y si el arreglo automático funcionó. Solo medidas de pantalla, ruta y navegador. Solo se añaden; se borran solas a los 90 días.';
comment on column public.pantalla_descuadres.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del apunte.';
comment on column public.pantalla_descuadres.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | A quién le pasó.';
comment on column public.pantalla_descuadres.causa is 'formato: texto | rango: no aplica | lista: pasado_del_final, zona_desplazada, scroll_de_mas, pagina_larga | obligatorio | Qué se detectó: la pantalla mira más allá del final de la página, la zona visible está desplazada, la página está bajada de más, o la página mide bastante más que su contenido. Ej. OK: pasado_del_final';
comment on column public.pantalla_descuadres.ruta is 'formato: texto | rango: 1 a 120 caracteres | lista: no aplica | obligatorio | Pantalla en la que pasó, sin llaves ni identificadores. Ej. OK: /panel/dashboard';
comment on column public.pantalla_descuadres.navegador is 'formato: texto | rango: 1 a 80 caracteres | lista: no aplica | obligatorio | Teléfono y navegador, en corto. Ej. OK: iPhone/iPad (iOS 26.1) · Chrome';
comment on column public.pantalla_descuadres.corregido is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Si después de recolocarla la pantalla quedó bien.';
comment on column public.pantalla_descuadres.datos is 'formato: json {motivo, antes, despues} | rango: hasta 2 KB | lista: no aplica | automático | Qué lo disparó (scroll, teclado, pantalla…) y las medidas de la pantalla antes y después de recolocar (y, alto, doc, contenido, vvAlto, vvArriba, vvPagina, escala).';
comment on column public.pantalla_descuadres.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo pasó.';
alter table public.pantalla_descuadres enable row level security;
drop policy if exists pantalla_descuadres_ver on public.pantalla_descuadres;
create policy pantalla_descuadres_ver on public.pantalla_descuadres for select using ((select ve_todo()));
revoke all on public.pantalla_descuadres from anon;
revoke insert, update, delete, truncate on public.pantalla_descuadres from authenticated;
grant select on public.pantalla_descuadres to authenticated;
drop trigger if exists tg_mantenimiento on public.pantalla_descuadres;
create trigger tg_mantenimiento before insert or update or delete on public.pantalla_descuadres
  for each row execute function fn_bloqueo_mantenimiento();

-- Lo apunta el propio usuario desde su navegador (a través del servidor). Como mucho 20 al
-- día por usuario, y de paso se borran los de hace más de 90 días.
create or replace function public.pantalla_descuadre_anotar(p_causa text, p_ruta text, p_navegador text, p_corregido boolean, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if p_causa is null or p_causa not in ('pasado_del_final', 'zona_desplazada', 'scroll_de_mas', 'pagina_larga') then return; end if;
  if (select count(*) from pantalla_descuadres where usuario_id = v_uid and creado_en > now() - interval '1 day') >= 20 then return; end if;
  begin
    delete from pantalla_descuadres where creado_en < now() - interval '90 days';
    insert into pantalla_descuadres (usuario_id, causa, ruta, navegador, corregido, datos)
    values (v_uid, p_causa, left(coalesce(nullif(btrim(p_ruta), ''), '/'), 120), left(coalesce(nullif(btrim(p_navegador), ''), 'Otro'), 80),
            coalesce(p_corregido, false),
            case when p_datos is null or jsonb_typeof(p_datos) <> 'object' or length(p_datos::text) > 2000 then '{}'::jsonb else p_datos end);
  exception when others then null;   -- un apunte de diagnóstico nunca da error (p. ej. en mantenimiento)
  end;
end $$;
comment on function public.pantalla_descuadre_anotar(text, text, text, boolean, jsonb) is '[Sistema y tareas automáticas] Apunta que la pantalla de un usuario se quedó descuadrada en el móvil (zona vacía debajo del contenido) y si se recolocó sola: causa, pantalla, navegador y medidas de antes y después. Como mucho 20 al día por usuario; borra los apuntes de más de 90 días. Sin sesión no hace nada. Quién: cualquier usuario con sesión (lo llama el servidor al recibir el aviso del navegador). Argumentos: p_causa: pasado_del_final, zona_desplazada, scroll_de_mas o pagina_larga · p_ruta: pantalla · p_navegador: teléfono y navegador · p_corregido: si quedó bien · p_datos: medidas.';
revoke all on function public.pantalla_descuadre_anotar(text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.pantalla_descuadre_anotar(text, text, text, boolean, jsonb) to authenticated;
