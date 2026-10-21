-- =====================================================================================
-- 0008 — CACHÉ DE DISTANCIAS (los kilómetros que hoy se piden a Google en cada consulta)
-- =====================================================================================
-- POR QUÉ EXISTE ESTA TABLA
--
-- El tarifador necesita kilómetros, y los kilómetros se le piden a Google (Routes API),
-- que SE PAGA POR USO. Hoy el Apps Script los pide CADA VEZ que alguien tarifa, así que
-- la misma ruta Sevilla→Madrid se paga veinte veces al día. Las rutas de Dynamo se
-- repiten casi siempre: los mismos almacenes, los mismos polígonos, los mismos CP.
-- Guardando la respuesta se le pregunta a Google UNA vez por ruta y se deja de pagar
-- por la segunda y la siguiente.
--
-- DOS CACHÉS, NO UNA. Y A PROPÓSITO (decisión del usuario, 2026-10-21):
--
--   1. `distancias_lugares` — entre dos fichas de la agenda. Es el caso de CASI TODOS
--      los envíos reales (su catálogo y los almacenes de los clientes). Kilómetros
--      EXACTOS, cero tolerancia, y acierta prácticamente siempre porque lo que se
--      repite es "ese almacén de siempre".
--
--   2. `distancias_cp` — entre dos códigos postales. Para el tarifador público, donde
--      alguien escribe un pueblo y no hay ficha. Ahí sí interesa tolerancia de unos
--      kilómetros, y un CP es una zona administrativa REAL.
--
-- ⚠️ POR QUÉ NO SE CACHEA POR COORDENADAS REDONDEADAS (se descartó al diseñarlo):
--    Se valoró redondear lat/lon a una cuadrícula. Falla por los dos lados:
--      · Con cuadrícula GRANDE (3 km), la empresa que se muda al polígono de al lado
--        (1-2 km) cae en la MISMA casilla → la caché acierta → devuelve los kilómetros
--        de la nave vieja y el precio sale mal SIN AVISAR. Y dos puntos pueden estar a
--        4,2 km compartiendo casilla, lo que en un reparto urbano de 10 km es un error
--        casi del tamaño de la ruta (≈11,50 € a 1,35 €/km).
--      · Con cuadrícula PEQUEÑA (100 m), dos naves a 200 m una de otra caen en casillas
--        distintas y no comparten nada, mientras el acierto real (la misma ficha de
--        siempre) ya lo da la caché por sitio. El redondeo no aporta.
--    La cuadrícula además tiene un efecto arbitrario: "cerca" en la cuadrícula no es
--    "cerca" en la carretera.
--
-- CÓMO SE INVALIDA CUANDO UNA EMPRESA SE MUDA  ← el agujero que había que tapar
--
--    `lugares` gana una columna `version_geo`. Un trigger la sube SOLO cuando cambian
--    las coordenadas. La clave de la caché incluye la versión de los dos extremos, así
--    que al mudarse:
--      · la versión sube,
--      · las filas viejas YA NO COINCIDEN con la clave nueva,
--      · falta en la caché → una llamada a Google y a correr.
--    Se invalida SOLA. No hay que acordarse de borrar nada al editar una ficha, que es
--    exactamente el tipo de cosa que funciona un año y falla el día que alguien añade
--    otra forma de editar un sitio.
--
--    Y las filas viejas NO se borran: son el registro de con qué kilómetros se tarificó
--    cada envío. El de febrero puede seguir justificando sus km aunque la empresa se
--    haya mudado en mayo.
--
-- LAS PARADAS: una ruta con 5 paradas son 6 tramos, y cada tramo es una pareja de esta
-- tabla. Una sola llamada a Google con las paradas como puntos intermedios devuelve los
-- 6 tramos de golpe, así que un fallo de caché rellena varias filas a la vez.
--
-- EL SENTIDO IMPORTA: A→B y B→A se guardan por separado. No siempre miden lo mismo
-- (sentidos únicos, enlaces de autovía). Las filas son baratas; un precio mal, no.
--
-- ⚠️ ESTA TABLA NO LA ESCRIBE NADIE A MANO. La rellena la ruta de servidor de Vercel,
--    que es la única que habla con Google (la base de datos NO hace llamadas a internet:
--    mientras espera a Google se queda ocupada una conexión y lo nota toda la
--    plataforma). La función de cálculo de tarifa RECIBE los km ya resueltos: así es
--    comprobable (los mismos km dan siempre el mismo precio) y si algún día se cambia
--    de proveedor de mapas, la fórmula no se toca.
-- =====================================================================================


-- =====================================================================================
-- 1. VERSIÓN GEOGRÁFICA DEL LUGAR — lo que hace que la caché se invalide sola
-- =====================================================================================
alter table lugares
  add column if not exists version_geo integer not null default 1;

comment on column lugares.version_geo is
  'Sube SOLO cuando cambian lat/lon (la empresa se muda). Forma parte de la clave de '
  'distancias_lugares: al subir, las filas de caché viejas dejan de coincidir y los '
  'kilómetros se vuelven a pedir. No tocar a mano.';


create or replace function fn_lugares_version_geo()
returns trigger language plpgsql as $$
begin
  -- `is distinct from` y no `<>`: con NULL de por medio, `<>` da NULL (ni true ni
  -- false) y el trigger no saltaría al pasar de "sin coordenadas" a "con coordenadas".
  if new.lat is distinct from old.lat or new.lon is distinct from old.lon then
    new.version_geo := old.version_geo + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_lugares_version_geo on lugares;
create trigger tg_lugares_version_geo
  before update on lugares
  for each row execute function fn_lugares_version_geo();

comment on function fn_lugares_version_geo() is
  'Sube lugares.version_geo cuando cambian las coordenadas, para invalidar la caché de '
  'distancias sin tener que borrar filas.';


-- =====================================================================================
-- 2. CACHÉ ENTRE SITIOS DE LA AGENDA — kilómetros exactos
-- =====================================================================================
create table distancias_lugares (
  id                uuid primary key default gen_random_uuid(),

  lugar_origen_id   uuid    not null references lugares(id) on delete cascade,
  version_origen    integer not null,
  lugar_destino_id  uuid    not null references lugares(id) on delete cascade,
  version_destino   integer not null,

  km                numeric(8,2) not null check (km >= 0),
  minutos           integer check (minutos is null or minutos >= 0),
  proveedor         text not null default 'google_routes',

  -- Las 4 de la regla 12. `creado_en`/`modificado_en` hacen además de "cuándo se le
  -- preguntó a Google": no hace falta una columna aparte que diga lo mismo.
  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) on delete set null,
  modificado_en     timestamptz,
  modificado_por    uuid references auth.users(id) on delete set null,

  constraint ck_distancias_lugares_distintos
    check (lugar_origen_id <> lugar_destino_id),

  -- La clave: pareja DIRIGIDA + la versión de cada extremo.
  constraint ux_distancias_lugares
    unique (lugar_origen_id, version_origen, lugar_destino_id, version_destino)
);

-- Para barrer las filas de un sitio concreto (diagnóstico, no uso normal).
create index idx_distancias_lugares_origen  on distancias_lugares (lugar_origen_id);
create index idx_distancias_lugares_destino on distancias_lugares (lugar_destino_id);

comment on table distancias_lugares is
  'Caché de kilómetros de Google entre dos fichas de la agenda. Clave: pareja dirigida '
  '+ version_geo de cada extremo, para que al mudarse una empresa la fila vieja deje de '
  'coincidir sola. Las filas viejas NO se borran: son el registro de con qué kilómetros '
  'se tarificó cada envío.';

select activar_rastro('distancias_lugares');


-- =====================================================================================
-- 3. CACHÉ POR CÓDIGO POSTAL — para el tarifador público, con tolerancia de un CP
-- =====================================================================================
-- Normalizador de CP, mismo criterio que el de CIF y matrícula: '2400-016' (PT),
-- '2400 016' y '2400016' son el mismo CP. Importante que sea TEXTO y no número:
-- '08185' como número sería 8185 y se perdería el cero.
create or replace function normaliza_cp(p text)
returns text language sql immutable strict as $$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$$;

comment on function normaliza_cp(text) is
  'Normaliza un código postal para comparar: quita separadores y pasa a mayúsculas. '
  'Vale para los formatos de los 12 países de servicio (ES 08185, PT 2400-016, '
  'PL 85-453, IE N41 RW27).';


create table distancias_cp (
  id              uuid primary key default gen_random_uuid(),

  pais_origen     char(2) not null check (pais_origen  ~ '^[A-Z]{2}$'),
  cp_origen       text    not null check (length(normaliza_cp(cp_origen))  between 3 and 10),
  pais_destino    char(2) not null check (pais_destino ~ '^[A-Z]{2}$'),
  cp_destino      text    not null check (length(normaliza_cp(cp_destino)) between 3 and 10),

  km              numeric(8,2) not null check (km >= 0),
  minutos         integer check (minutos is null or minutos >= 0),
  proveedor       text not null default 'google_routes',

  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id) on delete set null,
  modificado_en   timestamptz,
  modificado_por  uuid references auth.users(id) on delete set null
);

-- UNIQUE sobre el CP NORMALIZADO: así '2400-016' no entra dos veces escrito distinto.
-- Dirigida también (ida y vuelta por separado), por el mismo motivo que la de sitios.
create unique index ux_distancias_cp on distancias_cp (
  pais_origen, normaliza_cp(cp_origen), pais_destino, normaliza_cp(cp_destino)
);

comment on table distancias_cp is
  'Caché de kilómetros entre dos códigos postales. Para el tarifador público, donde no '
  'hay ficha de sitio. Un CP es una zona real, no una cuadrícula inventada.';

select activar_rastro('distancias_cp');


-- =====================================================================================
-- 4. LEER LA CACHÉ
-- =====================================================================================
-- Devuelven los km, o NULL si no hay nada válido (y entonces el servidor pregunta a
-- Google). `p_max_edad` existe porque las carreteras cambian: se abre una variante y la
-- ruta de siempre pasa a medir otra cosa. Un año es prudente para transporte; el valor
-- lo decide quien llama, no está clavado aquí.

create or replace function fn_km_lugares(
  p_origen    uuid,
  p_destino   uuid,
  p_max_edad  interval default interval '12 months'
) returns numeric
language sql stable as $$
  select d.km
    from distancias_lugares d
    join lugares lo on lo.id = d.lugar_origen_id
                   and lo.version_geo = d.version_origen
    join lugares ld on ld.id = d.lugar_destino_id
                   and ld.version_geo = d.version_destino
   where d.lugar_origen_id  = p_origen
     and d.lugar_destino_id = p_destino
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$$;

comment on function fn_km_lugares(uuid, uuid, interval) is
  'Kilómetros cacheados entre dos sitios, o NULL si no hay (porque nunca se pidieron, '
  'porque alguno se mudó, o porque la fila ya es vieja). NULL = hay que preguntar a Google.';


create or replace function fn_km_cp(
  p_pais_origen   char(2),
  p_cp_origen     text,
  p_pais_destino  char(2),
  p_cp_destino    text,
  p_max_edad      interval default interval '12 months'
) returns numeric
language sql stable as $$
  select d.km
    from distancias_cp d
   where d.pais_origen  = upper(p_pais_origen)
     and normaliza_cp(d.cp_origen)  = normaliza_cp(p_cp_origen)
     and d.pais_destino = upper(p_pais_destino)
     and normaliza_cp(d.cp_destino) = normaliza_cp(p_cp_destino)
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$$;

comment on function fn_km_cp(char, text, char, text, interval) is
  'Kilómetros cacheados entre dos códigos postales, o NULL si no hay.';


-- =====================================================================================
-- 5. GUARDAR EN LA CACHÉ
-- =====================================================================================
-- La versión NO se la pasa quien llama: la lee la función del lugar en ese momento. Así
-- el servidor no puede envenenar la caché guardando kilómetros con una versión que ya
-- no es la actual (justo lo que pasaría si se mudan a mitad de la consulta a Google).

create or replace function fn_guardar_km_lugares(
  p_origen     uuid,
  p_destino    uuid,
  p_km         numeric,
  p_minutos    integer default null,
  p_proveedor  text    default 'google_routes'
) returns uuid
language plpgsql as $$
declare
  v_vo integer;
  v_vd integer;
  v_id uuid;
begin
  select version_geo into v_vo from lugares where id = p_origen;
  select version_geo into v_vd from lugares where id = p_destino;

  if v_vo is null or v_vd is null then
    raise exception 'fn_guardar_km_lugares: lugar inexistente (origen=% destino=%)',
      p_origen, p_destino;
  end if;

  insert into distancias_lugares (
    lugar_origen_id, version_origen, lugar_destino_id, version_destino,
    km, minutos, proveedor
  ) values (
    p_origen, v_vo, p_destino, v_vd, p_km, p_minutos, p_proveedor
  )
  on conflict (lugar_origen_id, version_origen, lugar_destino_id, version_destino)
  do update set km        = excluded.km,
                minutos   = excluded.minutos,
                proveedor = excluded.proveedor
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_guardar_km_lugares(uuid, uuid, numeric, integer, text) is
  'Guarda los km que acaba de devolver Google. Sella la version_geo actual de los dos '
  'lugares (no se la pasa quien llama, para que no se pueda guardar con una versión vieja).';


create or replace function fn_guardar_km_cp(
  p_pais_origen   char(2),
  p_cp_origen     text,
  p_pais_destino  char(2),
  p_cp_destino    text,
  p_km            numeric,
  p_minutos       integer default null,
  p_proveedor     text    default 'google_routes'
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  -- El UNIQUE va sobre el CP normalizado (índice funcional), así que ON CONFLICT no
  -- puede apuntar a columnas: se busca primero y se actualiza o se inserta.
  select id into v_id
    from distancias_cp
   where pais_origen = upper(p_pais_origen)
     and normaliza_cp(cp_origen) = normaliza_cp(p_cp_origen)
     and pais_destino = upper(p_pais_destino)
     and normaliza_cp(cp_destino) = normaliza_cp(p_cp_destino);

  if v_id is null then
    insert into distancias_cp (
      pais_origen, cp_origen, pais_destino, cp_destino, km, minutos, proveedor
    ) values (
      upper(p_pais_origen), p_cp_origen,
      upper(p_pais_destino), p_cp_destino,
      p_km, p_minutos, p_proveedor
    ) returning id into v_id;
  else
    update distancias_cp
       set km = p_km, minutos = p_minutos, proveedor = p_proveedor
     where id = v_id;
  end if;

  return v_id;
end;
$$;

comment on function fn_guardar_km_cp(char, text, char, text, numeric, integer, text) is
  'Guarda los km entre dos CP que acaba de devolver Google.';


-- =====================================================================================
-- 6. CHIVATO — qué filas ya no sirven
-- =====================================================================================
-- No borra nada (las filas viejas son el registro de con qué km se tarificó). Solo deja
-- ver cuánta caché está muerta y por qué, para saber si el gasto en Google va a subir.
create or replace view v_distancias_caducadas as
select d.id,
       lo.nombre_empresa                            as origen,
       ld.nombre_empresa                            as destino,
       d.km,
       coalesce(d.modificado_en, d.creado_en)        as consultado_en,
       case
         when lo.version_geo <> d.version_origen
           or ld.version_geo <> d.version_destino  then 'un extremo se mudó'
         else                                            'más de 12 meses'
       end                                          as motivo
  from distancias_lugares d
  join lugares lo on lo.id = d.lugar_origen_id
  join lugares ld on ld.id = d.lugar_destino_id
 where lo.version_geo <> d.version_origen
    or ld.version_geo <> d.version_destino
    or coalesce(d.modificado_en, d.creado_en) <= now() - interval '12 months';

comment on view v_distancias_caducadas is
  'Filas de caché que ya no se van a usar y por qué (un extremo se mudó, o son viejas). '
  'Informativa: no se borra nada.';
