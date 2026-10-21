-- =====================================================================================
-- 0009 — RESTRICCIONES DE SERVICIO: dónde NO se entrega, y dónde solo con camión completo
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
--   · "A Suiza no entregamos."                 → país entero, descarga, bloquea
--   · "A Canarias no vamos."                   → territorio por CP, cualquier punto
--   · "A Baleares sí, pero solo completo."     → territorio + tipo de carga, bloquea
--                                                 solo el grupaje
--
-- NO ES UN ENUM NI CÓDIGO: es una tabla con interruptor y vigencia. El día que se abra
-- Suiza se apaga la fila; no hay que desplegar nada. Y el texto que ve el cliente
-- también se edita ahí.
--
-- ÁMBITO: cada regla lleva país (obligatorio) y, opcionalmente, una lista de prefijos
-- de código postal. Con esos dos campos se dice todo sin inventar tipos:
--
--   Suiza          → pais='CH', prefijos=NULL          (el país entero)
--   Canarias       → pais='ES', prefijos={'35','38'}
--   Baleares       → pais='ES', prefijos={'07'}
--   Ceuta/Melilla  → pais='ES', prefijos={'51','52'}
--
-- ⚠️ SE MIRA SI EL PUNTO ES CARGA O DESCARGA, NO SI ES "ORIGEN O DESTINO"
--    (corrección del usuario, 2026-10-21: *"no debería dejar generar ese tipo de envíos
--    a ese destino, no origen o destino"*.)
--
--    "No entregamos en Suiza" es una frase sobre las DESCARGAS, y hay que cogerlas
--    TODAS, no solo la última parada de la ruta: una entrega en Zúrich que sea la
--    parada 2 de 4 es igual de imposible que si fuera la última. Como `envio_paradas`
--    ya distingue `carga` de `descarga`, la regla se dice en esos términos y sale
--    exacta:
--
--      aplica_a = 'descarga'        → no entregamos ahí (pero sí podemos recoger)
--      aplica_a = 'carga'           → no recogemos ahí
--      aplica_a = 'cualquier_punto' → no se pasa por ahí, en ningún sentido
--
-- ⚠️ LO QUE YA EXISTE NO SE TOCA  ← lo importante de este fichero
--    (petición del usuario: *"a lo mejor en un momento dado Suiza se está permitiendo y
--    hay viajes a Suiza y posteriormente se cancela esa ruta. Lo que ya existe no debe
--    afectarse."*)
--
--    Es un riesgo real y no es teórico: la comprobación NO podía ir dentro de
--    `validar_ruta_envio`, porque esa función la llama también el trigger que protege la
--    ruta cada vez que se TOCA una parada de un envío vivo (`hora_real` al llegar el
--    camión, los km de un tramo, corregir un teléfono...). Si la restricción viviera
--    ahí, el día que se cierre Suiza **reventarían todos los envíos suizos en curso** al
--    primer cambio: no se podría ni marcar la hora de entrega.
--
--    Por eso van separadas:
--      · `validar_ruta_envio` (0007)        → SOLO la estructura (2 paradas, la primera
--                                             carga, la última descarga). Intacta.
--      · `validar_restricciones_envio`      → las restricciones, y se llama en dos
--        (este fichero)                       momentos, los dos de "generar":
--                                               1. al CONFIRMAR (salir de borrador),
--                                               2. al AÑADIR una parada nueva a un
--                                                  envío vivo (eso es negocio nuevo).
--
--    Lo que NO se comprueba nunca: modificar o borrar una parada de un envío que ya
--    existe. Así un envío a Suiza de antes del cierre se sigue pudiendo gestionar,
--    entregar, facturar y corregir hasta el final de su vida.
--
-- DÓNDE SE IMPONE (los tres sitios, y los tres hacen falta):
--   1. AQUÍ, en la base de datos → al generar. Es la única garantía: aunque entre por
--      n8n o a mano, no se puede confirmar un envío bloqueado.
--   2. En el tarifador (servidor) → ANTES de preguntarle los km a Google. Así no se
--      paga una llamada para una ruta que no se va a hacer, y el cliente tiene la
--      respuesta al instante.
--   3. En el front → para que se vea el mensaje al momento. Eso es solo comodidad: el
--      front NO es seguridad.
--
-- IRLANDA, PARTIDA POR LA ADUANA (usuario 2026-10-21): la República de Irlanda (IE) SÍ
-- se sirve —está en la UE, sin aduana, en ferry desde Santander o Bilbao— pero solo con
-- camión completo. Irlanda del Norte y Gran Bretaña NO, porque llevan aduana. Irlanda
-- del Norte viaja con código `GB`, así que una sola fila de `GB` cubre las dos.
--
-- SE BLOQUEA LA RUTA, NO LA FICHA DEL SITIO. Un cliente puede tener su domicilio fiscal
-- en Las Palmas y cargar desde la península: la ficha se crea sin problema.
--
-- MIENTRAS ES BORRADOR NO MOLESTA: el asistente de 4 pasos puede guardar a medias con
-- una dirección prohibida; lo que no se puede es confirmarlo.
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

  -- A qué paradas se les aplica. Ver la nota de la cabecera: se habla de cargas y
  -- descargas, no de "origen y destino", para coger también las paradas intermedias.
  aplica_a         text not null default 'cualquier_punto'
                     check (aplica_a in ('carga', 'descarga', 'cualquier_punto')),

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
  'interruptor y vigencia: abrir o cerrar un destino es editar la tabla, no desplegar '
  'código. Solo afecta a los envíos que se generan desde ese momento.';
comment on column restricciones_servicio.prefijos_cp is
  'NULL = el país entero. Si no, prefijos de CP del territorio: Canarias {35,38}, '
  'Baleares {07}, Ceuta/Melilla {51,52}.';
comment on column restricciones_servicio.aplica_a is
  '''descarga'' = no entregamos ahí (sí podemos recoger) · ''carga'' = no recogemos ahí '
  '· ''cualquier_punto'' = no se pasa por ahí. Se habla de cargas y descargas y NO de '
  '"origen y destino" para coger también las paradas intermedias: una entrega en Zúrich '
  'que sea la parada 2 de 4 es igual de imposible que si fuera la última.';
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
-- 2. ¿ESTA PARADA ESTÁ RESTRINGIDA?  — lo que llama el tarifador antes de pagar Google
-- =====================================================================================
create or replace function fn_restriccion_punto(
  p_pais        char(2),
  p_cp          text,
  p_tipo_parada text       default 'descarga',   -- 'carga' | 'descarga'
  p_tipo_carga  tipo_carga default null,
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
     -- Carga o descarga
     and (r.aplica_a = 'cualquier_punto' or r.aplica_a = p_tipo_parada)
     -- Tipo de carga
     and (r.tipo_carga is null or r.tipo_carga = p_tipo_carga)
   -- Lo más grave primero: el que llama mira la primera fila y ya sabe qué hacer.
   order by case r.efecto when 'bloquea' then 1 when 'solo_admin' then 2 else 3 end,
            r.nombre
$$;

comment on function fn_restriccion_punto(char, text, text, tipo_carga, date) is
  'Reglas que afectan a una parada (país + CP + si es carga o descarga). Sin filas = '
  'vía libre. La llama el servidor del tarifador ANTES de pedir los km a Google, para '
  'no pagar una llamada de una ruta que no se va a hacer. '
  '⚠️ Dos casos que NO casan a propósito, para no bloquear de más: si la parada no trae '
  'CP, las reglas de territorio no se pueden evaluar (las de país entero sí); y si '
  'todavía no se sabe el tipo de carga, las reglas que dependen de él tampoco.';


-- =====================================================================================
-- 3. ¿Y LA RUTA COMPLETA?
-- =====================================================================================
create or replace function fn_restricciones_ruta(p_envio uuid)
returns table (orden smallint, punto text, tipo text, nombre text, efecto text, mensaje text)
language sql stable as $$
  select p.orden,
         coalesce(p.nombre_empresa, p.poblacion, p.cp, '(parada ' || p.orden || ')'),
         p.tipo,
         f.nombre, f.efecto, f.mensaje
    from envio_paradas p
    cross join lateral fn_restriccion_punto(
      p.pais_codigo_iso,
      p.cp,
      p.tipo,
      (select e.tipo_carga from envios e where e.id = p.envio_id)
    ) f
   where p.envio_id = p_envio
   order by p.orden
$$;

comment on function fn_restricciones_ruta(uuid) is
  'Todas las restricciones que afectan a un envío, parada por parada y en orden de ruta. '
  'Incluye las intermedias: una entrega en Canarias es igual de imposible siendo la '
  'parada 2 que siendo la última.';


-- =====================================================================================
-- 4. LA COMPROBACIÓN — separada de `validar_ruta_envio` a propósito
-- =====================================================================================
-- ⚠️ NO se mete dentro de `validar_ruta_envio` (0007). Esa función la llama también el
--    trigger que protege la ruta cuando se toca una parada de un envío vivo, así que si
--    la restricción viviera ahí, al cerrar Suiza reventarían los envíos suizos EN CURSO
--    al primer cambio (no se podría ni sellar la hora de entrega). Ver la cabecera.
create or replace function validar_restricciones_envio(p_envio uuid)
returns void language plpgsql as $$
declare
  v_gx text;
  v_r  record;
begin
  select referencia_gx into v_gx from envios where id = p_envio;

  for v_r in select * from fn_restricciones_ruta(p_envio) loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_admin()) then
      raise exception 'Envio %, parada % (% en %): %',
        v_gx, v_r.orden, v_r.tipo, v_r.punto, v_r.mensaje;
    end if;
  end loop;
end $$;

comment on function validar_restricciones_envio(uuid) is
  'Revienta si alguna parada del envio choca con una restriccion de servicio. Se llama '
  'SOLO al generar: al confirmar el envio y al anadir una parada nueva a uno vivo. '
  'Nunca al modificar o borrar paradas de un envio que ya existe, para que cerrar un '
  'destino no rompa los envios que ya estaban en marcha.';


-- ---- Momento 1: al confirmar (salir de borrador) -----------------------------------
-- Reemplaza el de la 0007 añadiendo la segunda llamada. La estructura se sigue
-- validando con la función original, que no se toca.
create or replace function fn_envios_validar_al_confirmar()
returns trigger language plpgsql as $$
begin
  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform validar_ruta_envio(new.id);          -- estructura (0007)
    perform validar_restricciones_envio(new.id); -- restricciones (0009)
  end if;
  return new;
end $$;


-- ---- Momento 2: al añadir una parada nueva a un envío vivo -------------------------
-- Añadir una entrega en un destino cerrado es negocio NUEVO, así que se mira. Modificar
-- o borrar una parada que ya estaba, no: eso es gestionar lo que ya existe.
-- Los envíos ya terminados (entregado/cancelado) no se miran: son historia.
create or replace function fn_paradas_restriccion_al_anadir()
returns trigger language plpgsql as $$
declare
  v_estado estado_envio;
  v_r      record;
  v_carga  tipo_carga;
begin
  select estado, tipo_carga into v_estado, v_carga from envios where id = new.envio_id;

  if v_estado is null or v_estado in ('borrador', 'entregado', 'cancelado') then
    return new;   -- borrador: ya se mira al confirmar. Terminados: historia.
  end if;

  for v_r in
    select * from fn_restriccion_punto(new.pais_codigo_iso, new.cp, new.tipo, v_carga)
  loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_admin()) then
      raise exception 'No se puede anadir esta parada (% en %): %',
        new.tipo, coalesce(new.nombre_empresa, new.poblacion, new.cp, '?'), v_r.mensaje;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists tg_paradas_restriccion_al_anadir on envio_paradas;
create trigger tg_paradas_restriccion_al_anadir
  before insert on envio_paradas
  for each row execute function fn_paradas_restriccion_al_anadir();

comment on function fn_paradas_restriccion_al_anadir() is
  'Impide anadir una parada nueva en un destino cerrado a un envio que ya esta vivo. '
  'Solo INSERT: modificar o borrar paradas de un envio existente no se comprueba.';


-- =====================================================================================
-- 5. LAS REGLAS QUE YA SABEMOS
-- =====================================================================================
-- Dichas por el usuario el 2026-10-21. Son filas: se editan, se apagan con el
-- interruptor o se añaden desde el panel sin tocar nada de esto.
insert into restricciones_servicio
  (nombre, pais_codigo_iso, prefijos_cp, aplica_a, tipo_carga, efecto, mensaje) values

  -- SUIZA: solo las DESCARGAS. El usuario dijo "destino Suiza", no origen. Si alguna
  -- vez tampoco se quiere recoger allí, se cambia este campo a 'cualquier_punto'.
  ('Suiza', 'CH', null, 'descarga', null, 'bloquea',
   'No entregamos en Suiza. Escríbenos y te buscamos una alternativa.'),

  -- Territorios a los que no se llega en camión: ni se carga ni se descarga.
  ('Canarias', 'ES', array['35','38'], 'cualquier_punto', null, 'bloquea',
   'No damos servicio en Canarias. Escríbenos y te buscamos una alternativa.'),

  ('Ceuta y Melilla', 'ES', array['51','52'], 'cualquier_punto', null, 'bloquea',
   'No damos servicio en Ceuta ni Melilla. Escríbenos y te buscamos una alternativa.'),

  -- El mapa de cobertura de la web pública ya omite Córcega, Cerdeña y Sicilia a
  -- propósito (decisión del usuario 2026-09-03, se editaron los subpaths del SVG), pero
  -- no había nada que impidiera pedir un envío a Palermo.
  -- ⚠️ PREFIJOS A CONFIRMAR POR EL USUARIO: Córcega = CP franceses 20xxx (seguro);
  --    Cerdeña = CAP italianos 07-09 y Sicilia = 90-98 (comprobar: un prefijo de más
  --    bloquearía una ruta peninsular italiana de verdad).
  ('Córcega', 'FR', array['20'], 'cualquier_punto', null, 'bloquea',
   'No damos servicio en Córcega. Escríbenos y te buscamos una alternativa.'),

  ('Cerdeña y Sicilia', 'IT',
   array['07','08','09','90','91','92','93','94','95','96','97','98'],
   'cualquier_punto', null, 'bloquea',
   'No damos servicio en Cerdeña ni Sicilia. Escríbenos y te buscamos una alternativa.'),

  -- Las dos que NO son un simple sí/no: el territorio se sirve, pero solo con camión
  -- completo (va el tráiler entero en el barco; el grupaje no sale). En los dos
  -- sentidos: tampoco se trae un grupaje de vuelta.
  ('Baleares solo camión completo', 'ES', array['07'], 'cualquier_punto', 'grupaje',
   'bloquea',
   'A Baleares solo hacemos camión completo, no grupaje. Cambia el envío a carga '
   'completa o escríbenos.'),

  -- IRLANDA SE PARTE EN DOS, Y LA FRONTERA ES LA ADUANA (usuario, 2026-10-21):
  --
  --   · REPÚBLICA DE IRLANDA (IE) → SÍ se sirve. Está en la UE, no hay aduana, la
  --     mercancía va en ferry desde Santander o Bilbao. Pero **solo camión completo**,
  --     igual que Baleares: va el tráiler entero en el barco, el grupaje no sale.
  --
  --   · IRLANDA DEL NORTE y GRAN BRETAÑA → NO se sirven. Llevan aduana.
  --
  -- Y aquí la geografía ayuda: Irlanda del Norte **viaja con el código de país `GB`**,
  -- no `IE`. Como no se sirve ninguna de las dos partes de GB, **una sola fila de `GB`
  -- las cubre a las dos** y no hace falta ningún campo nuevo.
  --
  -- ⚠️ Si algún día se quisiera Irlanda del Norte (CP que empiezan por `BT`) pero NO el
  --    resto de Gran Bretaña, entonces SÍ haría falta añadir a la tabla un campo "todo
  --    el país SALVO estos CP": hoy los prefijos solo sirven para prohibir, no para
  --    permitir, y las zonas postales británicas son ~120, no se pueden enumerar.
  ('Irlanda (República) solo camión completo', 'IE', null, 'cualquier_punto', 'grupaje',
   'bloquea',
   'A Irlanda solo hacemos camión completo, no grupaje. Cambia el envío a carga '
   'completa o escríbenos.'),

  ('Gran Bretaña e Irlanda del Norte', 'GB', null, 'cualquier_punto', null, 'bloquea',
   'No damos servicio en Gran Bretaña ni en Irlanda del Norte. Escríbenos y te buscamos '
   'una alternativa.');


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
