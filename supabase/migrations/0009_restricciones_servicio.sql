-- =====================================================================================
-- 0009 — RESTRICCIONES DE SERVICIO: dónde NO se va, y dónde solo con camión completo
-- =====================================================================================
-- EL AGUJERO QUE TAPA
--
-- Hoy no hay NADA que impida pedir un envío a un sitio donde Dynamo no da servicio. Un
-- cliente puede escribir una dirección de Zúrich en el tarifador y crear el envío; el
-- problema se descubre después, por teléfono. Y el buscador de direcciones **todavía
-- ofrece Suiza** (`countrycodes=...,ch,...` en `index.html` y en 4 sitios de
-- `dashboard.html`), aunque Suiza NO está en la lista de cobertura de la web pública.
--
-- CÓMO SE EXPRESA (petición del usuario: "que se pueda limitar en tablas, manual y
-- rápido editable"). Una FILA por regla, y con eso se dicen las tres formas que tiene
-- el negocio de decir "no":
--
--   · "A Suiza no vamos."                      → país entero, bloquea
--   · "A Canarias no vamos."                   → territorio por CP, bloquea
--   · "A Baleares sí, pero solo completo."     → territorio + tipo de carga, bloquea
--                                                 solo el grupaje
--
-- NO ES UN ENUM NI CÓDIGO: es una tabla con vigencia, igual que las tarifas. El día que
-- se abra Suiza se cierra la fila con una fecha; no hay que desplegar nada. Y el texto
-- que ve el cliente también se edita ahí.
--
-- ÁMBITO: cada regla lleva país (obligatorio) y, opcionalmente, una lista de prefijos
-- de código postal. Con esos dos campos se dice todo sin inventar tipos:
--
--   Suiza          → pais='CH', prefijos=NULL          (el país entero)
--   Canarias       → pais='ES', prefijos={'35','38'}
--   Baleares       → pais='ES', prefijos={'07'}
--   Ceuta/Melilla  → pais='ES', prefijos={'51','52'}
--
-- SE COMPRUEBA EN TODOS LOS PUNTOS, NO SOLO EN ORIGEN Y DESTINO. Una parada intermedia
-- en Canarias es igual de imposible que una entrega. Por eso `aplica_a` vale
-- 'cualquier_punto' por defecto, y la ruta ya es ilimitada desde la 0007.
--
-- DÓNDE SE IMPONE (los tres sitios, y los tres hacen falta):
--   1. AQUÍ, en la base de datos → al confirmar el envío. Es la única garantía: aunque
--      entre por n8n o a mano, no se puede confirmar un envío bloqueado.
--   2. En el tarifador (servidor) → ANTES de preguntarle los km a Google. Así no se
--      paga una llamada para una ruta que no se va a hacer, y el cliente tiene la
--      respuesta al instante.
--   3. En el front → para que se vea el mensaje al momento. Eso es solo comodidad: el
--      front NO es seguridad.
--
-- SE BLOQUEA LA RUTA, NO LA FICHA DEL SITIO. Un cliente puede tener su domicilio fiscal
-- en Las Palmas y cargar desde la península: la ficha se crea sin problema. Lo que no
-- se puede es pedir un transporte que pase por ahí.
--
-- MIENTRAS ES BORRADOR NO MOLESTA: la comprobación se engancha a `validar_ruta_envio`,
-- que solo salta al salir de borrador. El asistente de 4 pasos puede guardar a medias.
-- =====================================================================================


-- =====================================================================================
-- 1. LA TABLA
-- =====================================================================================
create table restricciones_servicio (
  id               uuid primary key default gen_random_uuid(),

  -- Nombre para la tabla del panel: 'Suiza', 'Canarias', 'Baleares solo completo'.
  nombre           text not null check (length(trim(nombre)) > 0),

  pais_codigo_iso  char(2) not null check (pais_codigo_iso ~ '^[A-Z]{2}$'),

  -- NULL = el país entero. Si no, los prefijos de CP del territorio.
  prefijos_cp      text[],

  -- A qué punto de la ruta se le aplica.
  aplica_a         text not null default 'cualquier_punto'
                     check (aplica_a in ('origen', 'destino', 'cualquier_punto')),

  -- NULL = cualquier tipo de carga. 'grupaje' = solo se prohíbe el grupaje (Baleares).
  tipo_carga       tipo_carga,

  --  bloquea    → no se puede, ni el admin (Canarias: no hay camión que vaya).
  --  solo_admin → el cliente no puede pedirlo desde el portal; el admin sí lo registra.
  --  avisa      → se deja pasar, pero se avisa (para repasarlo a mano).
  efecto           text not null default 'bloquea'
                     check (efecto in ('bloquea', 'solo_admin', 'avisa')),

  -- Lo que LEE EL CLIENTE. Se edita aquí, sin tocar código.
  mensaje          text not null check (length(trim(mensaje)) > 0),

  -- Interruptor para AHORA, separado de la vigencia, que es para cambios PLANIFICADOS.
  -- Hacen falta los dos: con solo fechas no se puede apagar hoy una regla que empieza
  -- hoy (`vigente_hasta >= vigente_desde`), y "abro Suiza ya" es justo lo que se pide
  -- desde el panel. Apagarla NO borra nada: la fila queda con su historia.
  activa           boolean not null default true,

  vigente_desde    date not null default current_date,
  vigente_hasta    date,

  creado_en        timestamptz not null default now(),
  creado_por       uuid references auth.users(id) on delete set null,
  modificado_en    timestamptz,
  modificado_por   uuid references auth.users(id) on delete set null,

  constraint ck_restricciones_vigencia
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- Un prefijo vacío casaría con TODOS los CP del país, que es lo que ya significa
  -- NULL. Se prohíbe para que no haya dos formas de decir lo mismo.
  constraint ck_restricciones_prefijos
    check (prefijos_cp is null
           or (cardinality(prefijos_cp) > 0 and not ('' = any(prefijos_cp))))
);

create index idx_restricciones_pais on restricciones_servicio (pais_codigo_iso)
  where activa and vigente_hasta is null;

comment on table restricciones_servicio is
  'Dónde NO se da servicio, y dónde solo con camión completo. Una fila por regla, con '
  'vigencia: abrir o cerrar un destino es editar la tabla, no desplegar código.';
comment on column restricciones_servicio.prefijos_cp is
  'NULL = el país entero. Si no, prefijos de CP del territorio: Canarias {35,38}, '
  'Baleares {07}, Ceuta/Melilla {51,52}.';
comment on column restricciones_servicio.tipo_carga is
  'NULL = cualquiera. ''grupaje'' prohíbe solo el grupaje (es el caso de Baleares: se '
  'va en completo porque va el tráiler entero en el barco).';
comment on column restricciones_servicio.activa is
  'Interruptor de ahora mismo. Apagarla abre ese destino al instante y sin desplegar '
  'nada, y la fila se queda con su historia. Las fechas de vigencia son para lo '
  'planificado ("desde el 1 de enero servimos Suiza").';
comment on column restricciones_servicio.mensaje is
  'El texto que ve el cliente. Que no destape nada interno.';

select activar_rastro('restricciones_servicio');


-- =====================================================================================
-- 2. ¿ESTE PUNTO ESTÁ RESTRINGIDO?  — lo que llama el tarifador ANTES de pagar Google
-- =====================================================================================
create or replace function fn_restriccion_punto(
  p_pais        char(2),
  p_cp          text,
  p_tipo_carga  tipo_carga default null,
  p_posicion    text       default 'cualquier_punto',   -- origen | destino | intermedia
  p_fecha       date       default current_date
) returns table (nombre text, efecto text, mensaje text)
language sql stable as $$
  select r.nombre, r.efecto, r.mensaje
    from restricciones_servicio r
   where r.pais_codigo_iso = upper(p_pais)
     and r.activa
     -- Vigencia
     and p_fecha >= r.vigente_desde
     and (r.vigente_hasta is null or p_fecha <= r.vigente_hasta)
     -- Territorio: país entero, o algún prefijo de CP que case
     and (
           r.prefijos_cp is null
           or (p_cp is not null and exists (
                 select 1 from unnest(r.prefijos_cp) px
                  where normaliza_cp(p_cp) like px || '%'
               ))
         )
     -- Posición en la ruta
     and (r.aplica_a = 'cualquier_punto' or r.aplica_a = p_posicion)
     -- Tipo de carga
     and (r.tipo_carga is null or r.tipo_carga = p_tipo_carga)
   -- Lo más grave primero: el que llama mira la primera fila y ya sabe qué hacer.
   order by case r.efecto when 'bloquea' then 1 when 'solo_admin' then 2 else 3 end,
            r.nombre
$$;

comment on function fn_restriccion_punto(char, text, tipo_carga, text, date) is
  'Reglas que afectan a un punto (país + CP). Sin filas = vía libre. La llama el '
  'servidor del tarifador ANTES de pedir los km a Google, para no pagar una llamada de '
  'una ruta que no se va a hacer. '
  '⚠️ Dos casos que NO casan a propósito, para no bloquear de más: si el punto no trae '
  'CP, las reglas de territorio no se pueden evaluar (las de país entero sí); y si '
  'todavía no se sabe el tipo de carga, las reglas que dependen de él tampoco.';


-- =====================================================================================
-- 3. ¿Y LA RUTA COMPLETA?
-- =====================================================================================
create or replace function fn_restricciones_ruta(p_envio uuid)
returns table (orden smallint, punto text, nombre text, efecto text, mensaje text)
language plpgsql stable as $$
declare
  v_tipo_carga tipo_carga;
  v_min        smallint;
  v_max        smallint;
begin
  select e.tipo_carga into v_tipo_carga from envios e where e.id = p_envio;
  select min(p.orden), max(p.orden) into v_min, v_max
    from envio_paradas p where p.envio_id = p_envio;

  return query
  select p.orden,
         coalesce(p.nombre_empresa, p.poblacion, p.cp, '(punto ' || p.orden || ')'),
         f.nombre, f.efecto, f.mensaje
    from envio_paradas p
    cross join lateral fn_restriccion_punto(
      p.pais_codigo_iso,
      p.cp,
      v_tipo_carga,
      case when p.orden = v_min then 'origen'
           when p.orden = v_max then 'destino'
           else 'intermedia' end
    ) f
   where p.envio_id = p_envio
   order by p.orden;
end $$;

comment on function fn_restricciones_ruta(uuid) is
  'Todas las restricciones que afectan a un envío, punto por punto y en orden de ruta. '
  'Incluye las paradas intermedias: una parada en Canarias es igual de imposible que '
  'una entrega.';


-- =====================================================================================
-- 4. ENGANCHE: al confirmar el envío
-- =====================================================================================
-- ⚠️ ESTO REEMPLAZA la `validar_ruta_envio` de la 0007 (mantiene sus tres
--    comprobaciones y añade las restricciones). No podía ir en la 0007 porque la tabla
--    de restricciones todavía no existía ahí.
create or replace function validar_ruta_envio(p_envio uuid)
returns void language plpgsql as $$
declare
  v_total   int;
  v_primera text;
  v_ultima  text;
  v_gx      text;
  v_r       record;
begin
  select count(*) into v_total from envio_paradas where envio_id = p_envio;
  select referencia_gx into v_gx from envios where id = p_envio;

  if v_total < 2 then
    raise exception 'El envio % necesita al menos 2 paradas (una carga y una descarga); tiene %.',
      v_gx, v_total;
  end if;

  select tipo into v_primera from envio_paradas where envio_id = p_envio order by orden asc  limit 1;
  select tipo into v_ultima  from envio_paradas where envio_id = p_envio order by orden desc limit 1;

  if v_primera <> 'carga' then
    raise exception 'La primera parada del envio % tiene que ser una CARGA (es %).', v_gx, v_primera;
  end if;
  if v_ultima <> 'descarga' then
    raise exception 'La ultima parada del envio % tiene que ser una DESCARGA (es %).', v_gx, v_ultima;
  end if;

  -- ---- Restricciones de servicio (0009) -------------------------------------------
  -- 'bloquea' no lo salta nadie. 'solo_admin' lo salta el admin (sigue registrando
  -- envíos a mano). 'avisa' no para nada aquí: se ve en la ficha y en el panel.
  for v_r in select * from fn_restricciones_ruta(p_envio) loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_admin()) then
      raise exception 'Envio %, parada % (%): %', v_gx, v_r.orden, v_r.punto, v_r.mensaje;
    end if;
  end loop;
end $$;

comment on function validar_ruta_envio(uuid) is
  'Valida la ruta al salir de borrador: al menos 2 paradas, la primera carga, la ultima '
  'descarga, y ninguna restriccion de servicio que bloquee. Reemplaza la version de la '
  '0007 (que no podia mirar las restricciones porque la tabla no existia todavia).';


-- =====================================================================================
-- 5. LAS REGLAS QUE YA SABEMOS
-- =====================================================================================
-- Dichas por el usuario el 2026-10-21. Son filas: se editan, se cierran con una fecha o
-- se añaden desde el panel sin tocar nada de esto.
insert into restricciones_servicio (nombre, pais_codigo_iso, prefijos_cp, tipo_carga, efecto, mensaje) values

  ('Suiza', 'CH', null, null, 'bloquea',
   'No damos servicio en Suiza. Escríbenos y te buscamos una alternativa.'),

  ('Canarias', 'ES', array['35','38'], null, 'bloquea',
   'No damos servicio en Canarias. Escríbenos y te buscamos una alternativa.'),

  -- La que NO es un simple sí/no: el territorio se sirve, pero solo con camión completo
  -- (va el tráiler entero en el barco; el grupaje no sale).
  ('Baleares solo camión completo', 'ES', array['07'], 'grupaje', 'bloquea',
   'A Baleares solo hacemos camión completo, no grupaje. Cambia el envío a carga '
   'completa o escríbenos.'),

  -- Mismo caso que Baleares, y por el mismo motivo: se llega en ferry, así que va el
  -- tráiler entero en el barco y el grupaje no sale. (Decisión del usuario 2026-10-21,
  -- que cierra la pregunta que quedó abierta el 2026-09-21 con el criterio "solo
  -- continental, salvo que haya carretera o puente".)
  ('Irlanda solo camión completo', 'IE', null, 'grupaje', 'bloquea',
   'A Irlanda solo hacemos camión completo, no grupaje. Cambia el envío a carga '
   'completa o escríbenos.'),

  -- No las nombró hoy, pero ya están fuera por decisión suya del 2026-09-03: el mapa de
  -- cobertura de la web pública omite Ceuta y Melilla a propósito, y las provincias de
  -- almacenamiento también. Se deja coherente. Si alguna vez se sirven, se cierra la fila.
  ('Ceuta y Melilla', 'ES', array['51','52'], null, 'bloquea',
   'No damos servicio en Ceuta ni Melilla. Escríbenos y te buscamos una alternativa.'),

  -- Mismo caso: el mapa de cobertura de la web pública omite a propósito Córcega,
  -- Cerdeña y Sicilia (decisión del usuario 2026-09-03, se editaron los subpaths del
  -- SVG), pero no había nada que impidiera pedir un envío a Palermo. Se deja coherente.
  -- ⚠️ PREFIJOS A CONFIRMAR POR EL USUARIO: Córcega = CP franceses 20xxx (seguro);
  --    Cerdeña = CAP italianos 07-09 y Sicilia = 90-98 (comprobar antes de darlos por
  --    buenos: un prefijo de más bloquearía una ruta peninsular italiana de verdad).
  ('Córcega', 'FR', array['20'], null, 'bloquea',
   'No damos servicio en Córcega. Escríbenos y te buscamos una alternativa.'),

  ('Cerdeña y Sicilia', 'IT',
   array['07','08','09','90','91','92','93','94','95','96','97','98'], null, 'bloquea',
   'No damos servicio en Cerdeña ni Sicilia. Escríbenos y te buscamos una alternativa.');


-- =====================================================================================
-- 6. PARA EL PANEL
-- =====================================================================================
create or replace view v_restricciones_vigentes as
select r.nombre,
       r.pais_codigo_iso,
       r.prefijos_cp,
       r.aplica_a,
       coalesce(r.tipo_carga::text, 'cualquiera') as tipo_carga,
       r.efecto,
       r.mensaje,
       r.vigente_desde
  from restricciones_servicio r
 where r.activa
   and current_date >= r.vigente_desde
   and (r.vigente_hasta is null or current_date <= r.vigente_hasta)
 order by r.pais_codigo_iso, r.nombre;

comment on view v_restricciones_vigentes is
  'Las restricciones que están en vigor HOY, para la tabla del panel.';
