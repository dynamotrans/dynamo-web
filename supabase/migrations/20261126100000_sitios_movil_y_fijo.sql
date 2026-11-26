-- SITIOS: DOS TELÉFONOS, MÓVIL (WHATSAPP) Y FIJO (usuario, 2026-11-26).
-- «Haz en sitios 2 campos, móvil para WhatsApp y fijo. Y según rellenemos, o Google, que lo ponga
-- fijo directo en fijo, claro. Y si no, móvil, pues en móvil.»
--   · contactos.telefono      = el MÓVIL (con él se coordinan recogidas y entregas por WhatsApp).
--   · contactos.telefono_fijo = el FIJO (nuevo).
--   · En los contactos de un SITIO cada número va solo a su campo, lo escriba quien lo escriba
--     (una persona, Google al crear el sitio, la creación de un envío…): un fijo español (empieza
--     por 8 o 9) puesto en el móvil pasa al fijo, y un móvil español (6 o 7) puesto en el fijo
--     pasa al móvil, siempre que el otro campo esté libre. De otros países no se puede saber:
--     se queda donde se escribió.
--   · Donde se enseña «el teléfono del sitio» (ficha, orden de carga, página del transportista)
--     sale el móvil y, si no hay, el fijo.
-- El teléfono de la EMPRESA en el alta NO se obliga a que sea móvil (misma decisión).

alter table public.contactos
  add column if not exists telefono_fijo text check (telefono_fijo is null or telefono_fijo ~ '^\+?[0-9]{6,15}$');
comment on column public.contactos.telefono_fijo is 'formato: texto, + y solo cifras | rango: 6 a 15 cifras | lista: no aplica | opcional | Teléfono FIJO de la persona de contacto. En los contactos de un sitio, un fijo español escrito en «telefono» pasa aquí solo. Ej. OK: +34954123456 · Ej. MAL: 954 12 34 56';
comment on column public.contactos.telefono is 'formato: texto, + y solo cifras | rango: 6 a 15 cifras | lista: no aplica | opcional | Teléfono de la persona de contacto. En los contactos de un SITIO es el MÓVIL (WhatsApp): un fijo español escrito aquí pasa solo a telefono_fijo. Ej. OK: +34600123123 · Ej. MAL: 600 12 31 23';

-- Un contacto sirve para algo: móvil, fijo o email.
alter table public.contactos drop constraint if exists ck_contactos_algun_canal;
alter table public.contactos add constraint ck_contactos_algun_canal check (telefono is not null or telefono_fijo is not null or email is not null);

-- Cada número, a su campo (solo en contactos de sitios).
create or replace function public.fn_contacto_sitio_telefonos()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sitio_id is null then return new; end if;
  if new.telefono ~ '^(\+?34|0034)?[89][0-9]{8}$' and new.telefono_fijo is null then
    new.telefono_fijo := new.telefono; new.telefono := null;
  elsif new.telefono_fijo ~ '^(\+?34|0034)?[67][0-9]{8}$' and new.telefono is null then
    new.telefono := new.telefono_fijo; new.telefono_fijo := null;
  end if;
  return new;
end $$;
comment on function public.fn_contacto_sitio_telefonos() is '[Sitios y agenda] Disparador de contactos: en los contactos de un sitio pone cada teléfono en su campo. Un fijo español (8 o 9) escrito en el móvil pasa al fijo, y un móvil español (6 o 7) escrito en el fijo pasa al móvil, si el otro campo está libre. Quién: automático. Argumentos: sin argumentos.';
revoke all on function public.fn_contacto_sitio_telefonos() from public, anon, authenticated;
drop trigger if exists tg_a_telefonos_sitio on public.contactos;
create trigger tg_a_telefonos_sitio before insert or update of telefono, telefono_fijo, sitio_id on public.contactos
  for each row execute function fn_contacto_sitio_telefonos();

-- Lo que ya había: los fijos de los contactos de sitios pasan a su campo (lo hace el disparador).
update public.contactos set telefono = telefono
 where sitio_id is not null and telefono ~ '^(\+?34|0034)?[89][0-9]{8}$' and telefono_fijo is null;

-- ---- Donde se enseña «el teléfono del sitio»: el móvil y, si no hay, el fijo ----------------
do $$ declare d text; n text; begin
  -- La página pública del transportista (carga aceptada): el primer contacto con algún teléfono.
  d := pg_get_functiondef('public.carga_aceptada_publica_completa(uuid)'::regprocedure);
  n := replace(d, $a$jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)$a$, $a$jsonb_build_object('nombre', c.nombre, 'telefono', coalesce(c.telefono, c.telefono_fijo))$a$);
  n := replace(n, 'c.sitio_id = p.sitio_id and c.telefono is not null', 'c.sitio_id = p.sitio_id and coalesce(c.telefono, c.telefono_fijo) is not null');
  if n = d or position('coalesce(c.telefono, c.telefono_fijo) is not null' in n) = 0 or position($a$'telefono', coalesce(c.telefono, c.telefono_fijo)$a$ in n) = 0 then
    raise exception 'carga_aceptada_publica_completa: no encuentro el teléfono del contacto'; end if;
  execute n;
  -- Las paradas del viaje (orden de carga, CMR, panel del transportista).
  d := pg_get_functiondef('public.paradas_viaje_json_completa(uuid)'::regprocedure);
  n := replace(d, 'select nombre, telefono from contactos x where x.sitio_id = p.sitio_id and x.es_principal limit 1',
                  'select nombre, coalesce(telefono, telefono_fijo) as telefono from contactos x where x.sitio_id = p.sitio_id and x.es_principal limit 1');
  if n = d then raise exception 'paradas_viaje_json_completa: no encuentro el teléfono del contacto'; end if;
  execute n;
  -- El texto por el que se busca un sitio: también su fijo.
  d := pg_get_functiondef('public.sitio_texto_busqueda(sitios)'::regprocedure);
  n := replace(d, $a$concat_ws(' ', c.nombre, c.telefono, c.email)$a$, $a$concat_ws(' ', c.nombre, c.telefono, c.telefono_fijo, c.email)$a$);
  if n = d then raise exception 'sitio_texto_busqueda: no encuentro el teléfono del contacto'; end if;
  execute n;
  -- Lo que se sube a Brevo: el móvil y, si no hay, el fijo (así lo ya subido no cambia).
  d := pg_get_functiondef('public.brevo_sitios_candidatos()'::regprocedure);
  n := replace(d, $a$nullif(btrim(c.telefono), '') as telefono$a$, $a$nullif(btrim(coalesce(c.telefono, c.telefono_fijo)), '') as telefono$a$);
  if n = d then raise exception 'brevo_sitios_candidatos: no encuentro el teléfono del contacto'; end if;
  execute n;
end $$;
-- El disparador de búsqueda de contactos ya salta con cualquier cambio; se rehace el texto de
-- los sitios cuyos contactos han cambiado de campo.
update public.sitios s set texto_busqueda = sitio_texto_busqueda(s)
 where exists (select 1 from contactos c where c.sitio_id = s.id and c.telefono_fijo is not null);
