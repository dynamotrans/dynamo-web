# Migraciones de Supabase — Dynamo

Cada fichero se aplica **una vez y en orden**. El nombre lleva fecha y hora
(`AAAAMMDDhhmmss_nombre.sql`, formato oficial de Supabase) y **el orden lo da esa fecha**:
la de auditoría (`…090200`) tiene que ir antes de cualquier tabla de datos.

## Cómo llegan a Supabase (desde 2026-11-02)

**No se pegan a mano.** Proyecto `dynamo-pruebas` conectado a GitHub
(*Settings → Integrations → GitHub*):

| Campo | Valor | Por qué |
|---|---|---|
| Repositorio | `dynamotrans/dynamo-web` | |
| Working directory | **`.`** | pide la carpeta que **contiene** `supabase/`, que está en la raíz. Con `supabase/` buscaría `supabase/supabase/` y no aplicaría nada, sin dar error claro |
| Deploy to production | activado | |
| Production branch | **`pruebas`** | las migraciones viven ahí; `main` es la web pública y no tiene ninguna |
| Branching | desactivado | es de pago (Pro) |

Cada push a `pruebas` aplica las migraciones nuevas, cada una en su transacción, y
Supabase lleva la cuenta de cuáles ya están. Pegarlas en el SQL Editor funcionaría, pero
dejaría ese registro vacío y el siguiente despliegue intentaría aplicarlas otra vez.

**Desde el entorno de Claude no se alcanza Supabase** (el proxy lo bloquea): Claude
escribe y prueba aquí, sube a `pruebas`, Supabase aplica. El resultado se mira en el panel
(*Última migración* en la portada del proyecto) o en el estado del commit en GitHub.

### Mientras sea `dynamo-pruebas` vs. el día que haya datos reales

- **Ahora (sin datos reales)**: si algo del esquema no convence, **se reescriben** las
  migraciones y se reaplica todo desde cero. Es el momento de equivocarse.
- **Con datos reales**: una migración aplicada **no se edita jamás**. Cada cambio es un
  fichero nuevo. Editar uno ya aplicado no lo vuelve a ejecutar: solo rompe la
  correspondencia entre lo que dicen los ficheros y lo que hay en la base.

## Antes de cada push que toque migraciones: el arnés

```bash
tools/probar-migraciones/probar.sh
```

Levanta un PostgreSQL de usar y tirar **que imita a Supabase** (roles `anon`,
`authenticated`, `service_role`, esquema `auth` y —lo decisivo— **los privilegios por
defecto que conceden a la API todo lo que se crea en `public`**), aplica todas las
migraciones en orden y lanza las comprobaciones de `comprobar_seguridad.sql`. Si dice
`HAY FALLOS`, no se sube. Está en el repositorio para que cualquier sesión lo repita sin
reconstruir nada.

## Estado

> Las pendientes llevan `AAAAMMDDhhmmss` porque su fecha será la del día en que se escriban: tienen que ir **después** de la última aplicada, o Supabase las aplicaría desordenadas.

| Fichero | Qué monta | Estado |
|---|---|---|
| `20261102090100_enums_y_secuencias.sql` | Enums, catálogo de recargos por tipo de lugar, secuencias de código (incluida la del GX con paso +7) | ✅ listo |
| `20261102090200_auditoria_y_sellos.sql` | Tabla `auditoria` append-only, `fn_sellar()`, `fn_auditar()`, `activar_rastro()` | ✅ listo |
| `20261102090300_clientes_transportistas_contactos.sql` | `clientes`, `transportistas`, `contactos` | ✅ listo |
| `20261102090400_usuarios_y_roles.sql` | `usuarios` sobre Supabase Auth, perfil automático al registrarse, protección del último admin | ✅ listo |
| `20261102090500_lugares.sql` | `lugares` con dirección partida y borrado suave, `lugar_notas_cliente` | ✅ listo |
| `20261102090600_vehiculos_conductores.sql` | `vehiculos` (matrículas) y `conductores` | ✅ listo |
| `20261102090700_envios_y_paradas.sql` | `envios` (sin direcciones) + `envio_paradas` (ruta ilimitada), triggers de origen/destino, validación de ruta, vistas y RLS | ✅ listo |
| `20261102090800_distancias_cache.sql` | caché de los kilómetros de Google: por **sitio** (exacta) y por **código postal** (tarifador público), con invalidación automática al mudarse una empresa | ✅ listo |
| `20261102090900_restricciones_servicio.sql` | dónde **no** se da servicio y dónde **solo con camión completo**, en tabla editable con interruptor y vigencia | ✅ listo |
| `20261102091000_hitos_y_ofertas.sql` | `parametros`, `envio_hitos` (append-only), `envio_ofertas`, `envio_reservas` (bloqueo de 3 min + aceptación atómica + contraoferta), PIN de recogida/entrega (`envio_parada_pines` + `pin_intentos`) | ✅ listo |
| `20261102160000_clientes_transportistas_ajustes.sql` | revisión con el usuario: `nombre` → `razon_social` + `nombre_comercial` + `nombre_visible` (calculada); transportistas: `bolsa` + `codigo_bolsa` (solo bolsas de Alpega) y `pronto_pago` por transportista | ✅ listo |
| `20261102170000_contactos_usuarios_ajustes.sql` | revisión con el usuario: `idioma` y `cargo` en contactos y usuarios, `recibe_avisos` en contactos, `limite_ppto_diario` → `limite_consultas_precio_diario` | ✅ listo |
| `20261102180000_lugares_ajustes.sql` | revisión con el usuario: `requiere_cita` (no por defecto) y `tiene_medios_carga` (sí por defecto) en sitios | ✅ listo |
| `20261102190000_lugares_visibilidad.sql` | **quién ve cada sitio** (opción A del usuario, «compartido pero discreto»): agenda `cliente_agenda_lugares`, cada cliente ve solo lo que creó o usó + almacenes Dynamo; una sola ficha por nave; solo la edita quien la creó; «borrar» = quitar de tu agenda; deduplicación al dar de alta (solo servidor) | ⚠️ sustituida por la siguiente |
| `20261102200000_lugares_por_cliente.sql` | **cada cliente sus sitios** (el usuario lo cambió al pensar en casos reales: notas personales y teléfonos que cambiarían a otro cliente): `lugares.cliente_id` obligatorio salvo almacenes Dynamo; cada cliente ve, edita y borra solo los suyos; un envío solo usa sitios de su cliente. Fuera la agenda compartida y `lugar_notas_cliente` (las notas van en la ficha) | ✅ listo |
| `20261102210000_flota_ajustes.sql` | `idioma` en conductores; `pais_matricula` con formato español exacto (tractora/rígido `1234 LBC`, remolque `R 1234 BCD` y los antiguos); en el envío `matricula_tractora` → `matricula_camion`; regla: un rígido no lleva remolque y camión/remolque son del transportista asignado | ✅ listo |
| `20261102220000_quitar_whatsapp_y_pais_matricula.sql` | fuera `tiene_whatsapp` de contactos y conductores (regla del usuario: **si es móvil, se da por hecho que tiene WhatsApp**; lo decide la app por el número) y fuera `pais_matricula` (y con él la comprobación estricta del formato español) | ✅ listo |
| `20261102230000_flota_libre.sql` | **flota libre** (caso del usuario: el autónomo contratado directo puede venir subcontratado por otro transportista): camión y conductor ya no están atados a un transportista (`transportista_id` = «con quién suele venir», opcional); un camión existe una vez por matrícula y un conductor una vez por DNI; el envío ya no exige que el camión sea del transportista asignado. Se mantiene: un rígido no lleva remolque | ✅ listo |
| `20261102240000_envios_manuales.sql` | **envíos manuales (v1.0)**: catálogo privado `operadores` de cada cliente; en `envios`, `operador_id` (null = Dynamo), `precio_acordado_operador` y `es_manual`. Un envío manual no lleva transportista ni precios de Dynamo, no se oferta ni se reserva, no genera PIN y no le afectan las zonas sin servicio de Dynamo | ✅ listo |
| `AAAAMMDDhhmmss_operativa.sql` | `tickets`, `penalizaciones`, `almacenamientos`, `documentos`, `firmas_cmr` | pendiente |
| `AAAAMMDDhhmmss_tarifas_plantillas.sql` | tarifas con vigencia y plantillas de texto (la tabla `parametros` ya la crea la 0010: aquí solo se le añaden claves). **Bloqueada**: falta el libro de tarifar del usuario y el código del Apps Script | pendiente |
| `AAAAMMDDhhmmss_vistas_holded_wtransnet.sql` | vistas de exportación + métricas de cliente/transportista | pendiente |
| `AAAAMMDDhhmmss_rls_politicas.sql` | las **políticas** por rol (el RLS ya está ACTIVADO en las 15 tablas, cerrado por defecto: ver «Seguridad por defecto» abajo). Ojo a los dos riesgos anotados ahí | pendiente |

## Seguridad por defecto: RLS en TODAS las tablas desde que nacen (2026-11-02)

**El fallo, encontrado justo antes del primer despliegue.** 12 de las 15 tablas y las 5
vistas se habían escrito sin seguridad por filas. En un Postgres normal no se nota; en
Supabase sí, porque **todo lo que se crea en `public` queda concedido a la API**. El arnés
lo demostró con la clave pública (`anon`), antes y después del arreglo:

| Comprobación | Antes | Después |
|---|---|---|
| Tablas sin RLS | **12** (`clientes`, `usuarios`, `transportistas`, `lugares`…) | 0 |
| Vistas que se saltan el RLS | **5** | 0 |
| Filas visibles con la clave pública | `clientes`, `usuarios`, `recargos`, `restricciones` y una vista | ninguna |
| Crear un cliente con la clave pública | **se podía** | rechazado |
| Llamar a `activar_rastro()` (crea triggers) desde la API | **se podía** | rechazado |
| Registrarse crea el perfil | sí | sí (el trigger es `SECURITY DEFINER`) |
| El servidor (`service_role`) lo ve todo | sí | sí |

**El arreglo, y la regla para toda migración futura:**

1. **Toda tabla nueva** lleva `alter table X enable row level security;` **en la misma
   migración** que la crea. Misma transacción: la tabla no existe ni un instante abierta.
   Sin políticas, la API no ve ni escribe nada; solo el servidor y el dueño.
2. **Toda vista** se crea `with (security_invoker = true)`: así respeta el RLS de quien
   consulta. Sin eso corre como su dueño y se salta el RLS de las tablas que lee.
3. **Herramientas internas** (chivatos, `activar_rastro`) revocadas de `public`, `anon`
   y `authenticated`.
4. Chivato nuevo **`v_tablas_sin_rls`**, gemelo de `v_tablas_sin_rastro`: **0 filas
   siempre**. Es la comprobación que vale también en producción.

**⚠️ Dos riesgos que hay que resolver Y PROBAR en `…_rls_politicas.sql`:**

- **Validaciones que dejan pasar en silencio.** `validar_restricciones_envio`,
  `validar_ruta_envio` y las de la caché de km se ejecutan **con los permisos de quien
  llama** y leen `restricciones_servicio`, `lugares`, `distancias_*`, que ahora están
  cerradas. Hoy da igual: nadie puede crear envíos por la API. Pero el día que una
  política abra `envios`/`envio_paradas` a los clientes, si esas funciones no pueden leer
  las restricciones **no encontrarán ninguna y dejarán pasar un envío a Suiza sin avisar**.
  Solución: hacerlas `SECURITY DEFINER` con `search_path` fijado, o dar `SELECT` a esas
  tablas de referencia. Prueba obligatoria: con el token de un cliente, intentar crear un
  envío a Zúrich y **esperar el bloqueo**, no un éxito.
- **`FORCE ROW LEVEL SECURITY`.** `PRODUCCION.md` §02 lo pide para que el dueño no se
  salte las políticas, y es correcto, pero activarlo a ciegas **rompe** los triggers
  `SECURITY DEFINER` que escriben como el dueño (el perfil al registrarse, la auditoría):
  quedarían sujetos al RLS. Cada uno necesita su política o una excepción explícita, y el
  arnés tiene que seguir dando `OK 3` (registrarse crea el perfil).

## Verificado en local

Las 0001-0009 se han ejecutado contra un **PostgreSQL 16 real** (el mismo motor que usa
Supabase) con un stub mínimo de `auth.users` y `auth.uid()` (hoy, el arnés `tools/probar-migraciones/`). Pruebas que pasan:

- Alta de cliente → código `C-10000` automático, `creado_en` y `creado_por` sellados.
- **Regla 10**: `B-91234567` y `b91234567 ` se reconocen como el mismo CIF y el segundo
  se rechaza. El mismo CIF **sí** entra a la vez como cliente y como transportista.
- El riesgo **manual manda** sobre el de CESCE, y al vaciarlo vuelve a mandar CESCE.
- **Regla 12**: la auditoría registra el antes/después y el email de quien lo hizo;
  un intento de falsear `creado_en` se revierte solo; `UPDATE` y `DELETE` sobre
  `auditoria` se bloquean con excepción.
- Un `factor_tarifa` de −45% se rechaza (rango −30/+30).
- Un teléfono polaco `+48221234567` entra (el regex `^\+34\d{9}$` del Sheet lo
  rechazaba, y ya tienes transportistas polacos en la hoja).
- Un contacto con dos dueños a la vez, o sin ningún canal de contacto, se rechaza.
- La secuencia GX da `GX100888689` → `GX100888696` → `GX100888703`: 11 caracteres y
  paso +7, como manda el diccionario del Sheet.
- `v_tablas_sin_rastro` devuelve 0 filas: no hay ninguna tabla que se pueda tocar sin
  dejar rastro.

### Añadido al verificar las 0004-0006

- El alta de un usuario crea su perfil sola, **sin rol admin y sin activar**
  (`pendiente_verificacion`). Cambiar el email en Auth se propaga al perfil.
- Una cuenta **no se puede activar** con rol cliente sin engancharla a su cliente, ni
  pertenecer a un cliente y a un transportista a la vez.
- **No se puede degradar, suspender ni borrar al único admin activo** — la regla que el
  panel comprobaba en JavaScript ahora la impone la base de datos, y cada cambio de rol
  queda en la auditoría con el antes y el después.
- Un lugar **no se puede marcar borrado sin fecha de borrado**. Los CP no españoles
  entran bien: `2400-016` (PT), `85-453` (PL), `N41 RW27` (IE), y `08185` conserva el cero.
- Una nota de cliente sobre un lugar es **una sola por pareja** cliente+lugar.
- `8221-LXV`, `8221 lxv` y `8221LXV` se reconocen como **la misma matrícula** y la segunda
  se rechaza. Pero si el camión se vende, marcándolo inactivo **sí** entra en el otro
  transportista (el UNIQUE es parcial a propósito).
- El mismo DNI no se da de alta dos veces como conductor del mismo transportista
  (`71357921F` == `71357921-f`).

### ⚠️ Fallo encontrado al probar (y por eso se prueba)

La primera versión de la 0004 exigía **siempre** que un usuario con rol `cliente`
tuviera un `cliente_id`. El trigger que crea el perfil al registrarse no puede saber
todavía a qué empresa pertenece, así que fallaba: **nadie podía darse de alta**.
Corregido — la pertenencia solo se exige cuando la cuenta pasa a `activa`, que son las
tres fases que ya tiene el portal (se registra → Dynamo lo verifica y lo engancha →
se activa). Revisando el SQL a ojo no se veía; ejecutándolo, salió en la primera prueba.

### Añadido al verificar la 0007 (envíos y paradas)

- **Ruta de 6 paradas** (4 recogidas + 2 entregas, orden 1-6) y **ruta mixta**
  (cargar → descargar → cargar → descargar). Sin techo de paradas.
- **Origen y destino salen solos**: el trigger rellena `cp_origen`/`cp_destino`/`num_paradas`
  en `envios` desde las paradas. No se escriben a mano, así que no se pueden desincronizar.
- `tipo_carga` **se deriva** de los metros: 13,60 m → `completa`, 6 m → `grupaje`.
- Dos paradas con el mismo `orden` se rechazan; un `tipo` que no sea carga/descarga también.
- **El `DEFERRABLE` del UNIQUE hace falta de verdad**, probado con las dos versiones:
  un `update … set orden = orden + 1` contra un UNIQUE normal da
  `duplicate key value violates unique constraint`; con `DEFERRABLE` funciona, porque la
  comprobación pasa de ser fila a fila a ser al final de la sentencia. Sin esto, reordenar
  paradas es imposible.
- `renumerar_paradas()` compacta los huecos (1,3,5,6,7,8 → 1,2,3,4,5,6).
- **Un envío no se puede confirmar con la ruta coja**: 0 paradas, 1 parada, o la última
  siendo carga → rechazado con el mensaje y el GX. Con carga + descarga, pasa. Y una vez
  confirmado, quitar paradas hasta dejarlo cojo también se rechaza. Un **borrador** sí puede
  estar a medias, que es lo que necesita el asistente de 4 pasos.
- Borrar el envío **arrastra sus paradas** (cascade).
- **RLS probada con dos clientes y un admin** (con el rol `authenticated` como en Supabase):
  el cliente B pidiendo el envío de A **por su UUID exacto** recibe **0 filas**; sus paradas,
  **0 filas**; intentar ponerlo a su nombre → `UPDATE 0` y el dueño no cambia; colgar una
  parada en el envío de A → `new row violates row-level security policy`; borrar las paradas
  de A → `DELETE 0`. Y con lo suyo trabaja con normalidad. El admin ve los 3 envíos.
- **Nadie puede borrar un envío** (no hay política de DELETE, a propósito: se cancela).
- **Regla 11 verificada**: en ruta el cliente ve el teléfono del conductor; al pasar a
  entregado, `null`. El admin lo sigue viendo, con el precio del transportista y el margen.

### Añadido al verificar la 0008 (caché de distancias)

Probado en PostgreSQL 16.13 con los dos casos que el usuario señaló como riesgo:

- Se guardan los km de una ruta y se vuelven a leer: **acierto de caché**, no se pregunta
  a Google otra vez.
- **La empresa se muda al polígono de al lado** (1,8 km): la `version_geo` del sitio pasa
  de 1 a 2 sola, la fila vieja **deja de coincidir** y la consulta devuelve vacío → el
  servidor pregunta a Google. Se invalida **sin borrar nada ni acordarse de nada**.
- **La fila vieja sigue ahí** (531,40 km con versión 1, junto a los 533,10 km con versión 2):
  es el registro de con qué kilómetros se tarificó el envío de antes de la mudanza.
- **Editar el horario del sitio NO invalida** la caché: la versión solo sube con las
  coordenadas. Se mira con `is distinct from`, así que pasar de "sin coordenadas" a
  "con coordenadas" también cuenta como mudanza.
- **El sentido importa**: guardar A→B no contesta a B→A (no siempre miden lo mismo:
  sentidos únicos, enlaces de autovía).
- **El filtro de antigüedad** funciona: con una ventana de 0 segundos la misma fila ya no
  vale (las carreteras cambian; se abre una variante y la ruta de siempre mide otra cosa).
- Origen = destino se **rechaza**.
- **CP**: `2400-016`, `2400 016` y `2400016` son **el mismo** código postal, así que no se
  duplica la fila ni se paga dos veces; al reguardar, **actualiza** (1 fila, 615,00 km).
  `08185` **conserva el cero** (si el CP fuera número sería 8185).
- **Regla 12**: `v_tablas_sin_rastro` sigue devolviendo **0 filas**, y las cuatro escrituras
  quedan en la auditoría con el email de quien las hizo.
- El chivato `v_distancias_caducadas` dice **por qué** cada fila está muerta
  ("un extremo se mudó" / "más de 12 meses"). No borra nada.

**Límite conocido y a propósito**: que no se pueda guardar un kilometraje con una versión
vieja lo garantiza la **función** (`fn_guardar_km_lugares` lee ella misma la versión actual),
no una restricción de la tabla. No se puede poner una clave ajena compuesta a
`(id, version_geo)` porque **borraría justo las filas históricas** que queremos conservar.
Los permisos de la 0013 (RLS) cierran la escritura directa.

### Añadido al verificar la 0009 (restricciones de servicio)

Probado en PostgreSQL 16.13 montando envíos de verdad e intentando confirmarlos.

**Las rutas:**

- **Sevilla → Zúrich** bloqueado; **Sevilla → Madrid** y **Portugal → Madrid** pasan.
- **Canarias** bloqueada por los dos CP (`35xxx` Las Palmas y `38xxx` Tenerife), y
  **Ceuta/Melilla** (`51`/`52`) también.
- **Córcega, Cerdeña y Sicilia** bloqueadas (el mapa de la web pública ya las omitía
  desde el 3-sep, pero nada paraba un envío a Palermo), **sin llevarse por delante lo
  continental**: Ajaccio, Palermo y Cagliari se bloquean; **Lyon, Milán, Nápoles y Roma
  pasan**. ⚠️ Los prefijos italianos (07-09 Cerdeña, 90-98 Sicilia) **los tiene que
  confirmar el usuario**: uno de más bloquearía una ruta peninsular de verdad.
- **Irlanda partida por la aduana** (criterio del usuario): **Dublín con 13,30 m pasa**
  (está en la UE, sin aduana, ferry desde Santander o Bilbao), **Dublín con 6 m de
  grupaje se bloquea**, y **Belfast y Mánchester se bloquean** los dos. Irlanda del Norte
  viaja con código de país `GB`, así que **una sola fila de `GB` cubre las dos partes**
  que no se sirven y no hizo falta ningún campo nuevo. Recoger en Londres también se
  bloquea.
- **Baleares y Irlanda, la regla que no es un sí/no**: `07009` y Dublín con **6 m de
  grupaje → bloqueados**; los mismos destinos con **13,30 m de completo → pasan**.
  Funciona porque `tipo_carga` es una columna generada de los metros lineales (0007),
  así que no hay que marcar nada a mano.
- **Una parada INTERMEDIA bloquea el envío**: una entrega en Tenerife, o en Zúrich como
  parada 2 de 3, revientan aunque los extremos sean peninsulares. Es lo que no haría una
  comprobación de solo "origen y destino".
- **Carga y descarga se distinguen**: con la regla de Suiza puesta en `descarga`,
  **recoger** en Zúrich y entregar en Madrid **pasa**, y entregar en Zúrich no.
- **El borrador con una dirección prohibida SÍ se guarda** (el asistente de 4 pasos no
  se pelea con la base de datos); lo que no se puede es **confirmarlo**.
- **`solo_admin`**: el mismo envío se bloquea para quien no es admin y pasa en cuanto el
  usuario es admin activo. **`avisa`** deja pasar y el mensaje sigue consultable.
- **El interruptor `activa`** abre y cierra el destino en vivo, sin desplegar nada.
- **Regla 12**: 0 tablas sin rastro; las altas y los cambios del interruptor quedan en la
  auditoría con el email de quien los hizo.

**Lo que ya existe no se toca** (el escenario que pidió el usuario: Suiza abierta, hay
viajes a Suiza, y después se cierra la ruta). Probado en tres fases con un envío suizo
**en ruta** en el momento del cierre:

| Con Suiza ya cerrada… | Resultado |
|---|---|
| Sellar la hora de entrega de la parada suiza | **pasa** |
| Corregir el nombre de la empresa suiza | **pasa** |
| Anotar los km del tramo | **pasa** |
| Marcar el envío suizo como **entregado** | **pasa** |
| Crear un envío **nuevo** a Zúrich | **bloqueado** |
| Añadir una entrega en Zúrich a un envío **ya vivo** | **bloqueado** |

### ⚠️ Dos fallos encontrados al probar, y por eso se prueba

**1. La restricción no podía vivir dentro de `validar_ruta_envio`.** Esa función la llama
también el trigger que protege la ruta cada vez que se **toca** una parada de un envío
vivo. Si la comprobación hubiera ido ahí, el día que se cerrara Suiza **habrían reventado
todos los envíos suizos en curso** al primer cambio: no se podría ni sellar la hora de
entrega. Por eso van separadas: `validar_ruta_envio` (0007) sigue mirando **solo la
estructura** y no se toca, y `validar_restricciones_envio` (0009) se llama **solo al
generar** — al confirmar, y al añadir una parada nueva a un envío vivo.

**2. Con solo fechas de vigencia no se podía apagar hoy una regla que empieza hoy**
(`vigente_hasta >= vigente_desde`), así que para abrir Suiza habría que esperar al día
siguiente — lo contrario de "manual y rápido editable". De ahí la columna **`activa`**
(interruptor de ahora mismo) **junto a** la vigencia (cambios planificados: "desde el 1
de enero servimos Suiza"). Son dos preguntas distintas y hacen falta las dos.


### Añadido al verificar la 0010 (hitos, ofertas, reservas y PIN)

El arnés ya no solo mira permisos: **recorre una carga de punta a punta** intentando romperla
(comprobaciones 8 a 17 de `tools/probar-migraciones/comprobar_seguridad.sql`).

| Qué se intenta | Resultado |
|---|---|
| Llamar a reservar / aceptar / validar PIN con la clave pública o con una cuenta normal | **bloqueado**: solo el servidor |
| Confirmar un envío de un cliente con PIN | salen solos los hitos `creado` + `confirmado` y un PIN de 4 cifras por punto |
| Modificar o borrar un hito, incluso como dueño de la base | **bloqueado** (append-only) |
| Que dos transportistas reserven la misma carga | el segundo ve **"en trámite"** |
| Pasan los 3 minutos sin aceptar | la reserva **caduca sola** y el siguiente la coge |
| Aceptar a un precio fuera de la banda | **rechazado** |
| Contraoferta +24 % con banda del 30 % | queda **pendiente de Dynamo**; al aprobarla se asigna a ese precio |
| Reservar una carga ya asignada | **"tomada"** |
| Validar la entrega antes que la recogida | **se deja**, con hito `pin_fuera_de_orden` (decisión 2026-11-02) |
| 3 PIN incorrectos | **bloqueado** + incidencia; acertar después **no** desbloquea |
| Un transportista lee la tabla de PIN | **0 filas** (ve sus paradas, nunca el código) |
| Un transportista valida a mano u oferta una carga | **bloqueado** |
| Dynamo valida a mano sin explicar por qué | **bloqueado**; con nota, queda **quién** lo hizo |
| El cliente mira a quién se ofertó su carga | **0 filas**: solo ve los hitos útiles para él |

**Por qué el PIN va en tabla propia y no en `envio_paradas`:** el transportista **sí** lee las
paradas de su envío, y la seguridad por filas filtra filas, no columnas. Como columna de la
parada, el conductor lo leería del código de la página.

**Fallos cazados al probar:**
1. `fn_auditar()` identifica cada registro por su columna `id`: `parametros` (con clave como
   identificador) y los PIN (con la parada) reventaban al primer INSERT. Ahora llevan `id`.
2. **Con "sin límite de tiempo" (la decisión del usuario), validar el PIN se rompía**: el null
   de JSON convertido a texto es la palabra `'null'`, que no es un número. Se lee con `#>> '{}'`.

**PIN = fase v3 (decisión del usuario 2026-11-02).** Queda en la base de datos pero **apagado** (`exige_pin` vale `false` por defecto en sitios y clientes): en la v1.0 no se genera ningún PIN. No se borra porque ya está aplicado en `dynamo-pruebas` y probado; quitarlo costaría una migración más sin ningún beneficio.

**Pendiente de esta parte (no es de base de datos):**
- El **código de confirmación por email** al aceptar (3 intentos, ver `TODO.md`): necesita el
  envío de emails, va con la función del servidor.
- La función del servidor que envuelve `reservar_envio` / `aceptar_reserva` /
  `validar_pin_parada` y comprueba quién es el transportista antes de llamarlas.
- Vista del transportista con **sus** ofertas sin el % de banda (va con las políticas, 0014).
- Pasar el envío a `cargando` / `en_ruta` al validar el PIN de la primera carga: decidir.


### Sitios: de "compartidos" a "cada cliente los suyos" (2026-11-02)

Primero se montó «compartido pero discreto» (una ficha por nave, cada cliente ve las que usa).
Al pensarlo con casos reales el usuario prefirió **una ficha por cliente**, y tiene razón:
- las notas son personales («Manolo, el de cargas, es amigo de Pepe mi primo»);
- en una ficha compartida, si un cliente cambia el teléfono o el horario, se le cambia al otro sin enterarse;
- y el segundo cliente no podía corregir nada de una nave que no había creado.

Precio aceptado: si dos clientes cargan en la misma nave hay **dos fichas**. Para estadísticas
por nave real se puede añadir más adelante un **enlace interno, solo de Dynamo**, entre fichas
que sean el mismo sitio (por ejemplo `sitio_maestro_id`). No se monta ahora.

**Fallo cazado al probar:** con los sitios borrados ocultos para el cliente, **borrar no
funcionaba**: Postgres exige que la fila siga visible tras un UPDATE, y el borrado suave es un
UPDATE. El cliente ve también sus propios borrados; el panel filtra `borrado = false`.


### Envíos manuales: Dynamo SÍ los ve (decisión del usuario, 2026-11-02)

Cerrada la duda que quedó abierta en julio. El admin de Dynamo ve los envíos manuales de sus
clientes, con su operador y el precio que pactaron: sirve para darles soporte y para ver cuánto
mueven fuera de Dynamo (oportunidad comercial). Probado en el arnés (comprobación 30).
