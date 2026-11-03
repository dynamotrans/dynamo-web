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
| `20261103000000_operativa.sql` | `tipos_incidencia` + `incidencias` (INC-), `tipos_penalizacion` + `penalizaciones` (PEN-, automática al cancelar tarde con camión y retirada al deshacer), `almacenamientos` (AX + 6 cifras), `documentos` (datos; el fichero en Storage), `firmas_cmr` (append-only) | ✅ listo |
| `20261103030000_festivos.sql` | tabla `festivos` (nacionales, de comunidad y locales; editable por Dynamo), sembrados los nacionales de España 2026-2030 con la misma lista que `js/festivos.js`; `es_dia_habil()`; el **corte de cancelación ya salta festivos** | ✅ listo |
| `20261103080000_festivos_anuales.sql` | los festivos dicen **cómo se repiten**: `repetir` = `no` (solo esa fecha) · `cada_anio` (mismo día y mes, sin fin) · `pascua` (a `dias_desde_pascua` del Domingo de Pascua, calculado solo). `fecha` = desde cuándo vale; `vigente_hasta` = hasta cuándo (vacío = siempre). Los nacionales pasan de 55 filas (2026-2030) a **11 que no caducan**. `festivos_entre(desde, hasta)` da las fechas reales de un periodo | ✅ listo |
| `20261103090000_sitio_principal.sql` | la **estrella** de Sitios: `marcar_sitio_principal(cliente, sitio)` y `sitio_principal(cliente)` sobre `clientes.lugar_defecto_id` (el cliente no escribe en `clientes`); el principal tiene que ser un sitio **de ese cliente**; al borrar el sitio la estrella se quita sola; la **hora del borrado** de un sitio la pone la base de datos (regla 12) | ✅ listo |
| `20261103100000_usuarios_panel.sql` | regla dura del panel: una cuenta **ya atada a un cliente o transportista** nunca pasa a empleado/admin (ni con la llave del servidor; toda cuenta nace como cliente, así que un empleado invitado sí se puede subir); `conexiones_usuarios()` da la última conexión y si confirmó el email (viven en `auth.users`), solo a Dynamo | ✅ listo |
| `20261103110000_tipos_de_lugar.sql` | tipos de lugar nuevos (usuario): **Almacén / Nave / Campa** · **Obra en zona amplia** · **Obra en zona urbana** · **Finca / zona agrícola o rústica**. Fuera *evento* y *zona urbana* (el tipo se crea de nuevo: Postgres no deja quitar valores). Recargos provisionales 0/5/20/25 % | ✅ listo |
| `20261103120000_emails_avisos_sitio.sql` | los **emails de avisos de un sitio** pasan a su propia lista `lugares.emails_avisos` (máx. 10, validados), en vez de contactos falsos: así `contactos` queda solo para **personas** (varias por cliente, transportista o sitio) | ✅ listo |
| `20261103130000_horarios_sitios.sql` | **horarios en tabla** `lugar_horarios` (día 1-7 + tramo abre/cierra, sin solapes, sin pasar de medianoche): mañana y tarde, y horarios distintos por días. `lugares.horarios` pasa a ser el **resumen automático** (no se escribe a mano). Todo sitio nace con el horario por defecto del usuario (**L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00**); `guardar_horario()` lo cambia de una vez (todo o nada, obligatorio). Los textos que había se guardaron en las notas del sitio | ✅ listo |
| `20261103140000_precios_almacenes.sql` | precios de los **almacenes Dynamo**: por defecto en `parametros` (`almacen_precio_semana` 240 €, `almacen_precio_reparto` 220 €, base sin IVA) y, si se pone, el **propio de cada almacén** (`lugares.precio_almacenamiento_semana`, `precio_reparto`); un sitio de cliente no puede tener precio | ✅ listo |
| `20261103150000_ficha_envio.sql` | ficha del envío: `cancelar_envio(envio, motivo)` (deja el motivo en el historial; la penalización la pone el trigger de siempre si toca) y `deshacer_cancelacion(envio)` (vuelve al estado que tenía, no siempre a programado). Solo Dynamo | ✅ listo |
| `20261103160000_aceptar_carga_publica.sql` | página pública del transportista: `oferta_publica(enlace)` (la oferta SIN empresas, direcciones exactas ni contactos), `aceptar_oferta_publica` (oferta personal = ese transportista; de bolsa = se busca por CIF normalizado), `completar_carga_publica` (matrículas y conductor después) y `carga_aceptada_publica` (los datos completos, solo a quien la aceptó). Pronto pago en la reserva y sus parámetros (3 %, mín. 20 €, 5 días; plazo normal 60). Es lo único que puede llamar la clave pública | ✅ listo |
| `20261103170000_tipos_incidencia_mockup.sql` | los 4 tipos de incidencia del desplegable del panel (albarán, siniestro, transportista/conductor, otros) añadidos al catálogo | ✅ listo |
| `20261103180000_pronto_pago_linea.sql` | línea de pronto pago a transportistas: `parametros` (línea 50.000 €, interruptor, ventana de 60 días), `pronto_pago_estado()` (anticipado, disponible, si está activa y los anticipos, estos solo a Dynamo) y trigger que quita el pronto pago de las ofertas nuevas si la línea está agotada o apagada | ✅ listo |
| `20261103190000_altas_pendientes.sql` | `altas_pendientes()`: lo que escribió en el registro quien espera verificación (metadatos de Supabase Auth), solo para Dynamo | ✅ listo |
| `20261103200000_mantenimiento.sql` | modo mantenimiento: parámetro `mantenimiento_activo` y `mantenimiento_activo()` (lo consulta cualquiera, también sin sesión) | ✅ listo |
| `20261103210000_almacen_archivos.sql` | almacén de archivos: bucket PRIVADO `documentos` (25 MB, PDF e imágenes), un fichero solo se descarga si su fila de `documentos` es visible para quien lo pide, subir solo Dynamo (o cada uno a su carpeta `u/<id>/`), sin borrar ni cambiar ficheros. Documentos también de penalizaciones, operadores (logo) y usuarios (alta) | ✅ listo |
| `20261103220000_cmr_digital.sql` | CMR digital: `cmr_enlaces` (uno vivo por envío, caduca y se retira), puertas sin cuenta `cmr_publico` (documento ENMASCARADO) y `firmar_cmr_publico` (casilla correcta, una sola vez, trazo ya subido a la carpeta del enlace), y permisos del almacén para subir/ver solo en `cmr/<enlace vigente>/` | ✅ listo |
| `20261103230000_exportaciones_marcar.sql` | `marcar_exportados(fichero, refs, quitar)`: marca (o desmarca) envíos como pasados a Holded (venta/compra: nº de pedido) o publicados en la bolsa (hora del servidor + hito). Solo Dynamo | ✅ listo |
| `20261103240000_cambiar_ruta.sql` | `cambiar_ruta_envio(envío, paradas)`: reescribe la ruta antes de cargar (mantiene las paradas por id, borra las que faltan, crea las nuevas con la dirección congelada), sin firmas de CMR, con hito `ruta_cambiada` (antes/después). Solo Dynamo | ✅ listo |
| `20261103250000_flota_y_valoracion.sql` | Trigger que da de alta (o reutiliza, sin duplicar) en `vehiculos` y `conductores` lo que se asigna en el envío y lo enlaza (no en envíos manuales); `envios.valoracion_transportista` (1-5, solo al entregar) que rehace la media interna `transportistas.valoracion_dynamo` | ✅ listo |
| `20261103260000_buscar_envios.sql` | `buscar_envios(texto, límite)`: búsqueda en la base de datos sobre TODOS los envíos (cada palabra en referencia, cliente, transportista, mercancía, matrículas o paradas; sin acentos), con los permisos de quien busca | ✅ listo |
| `20261103270000_mantenimiento_en_bd.sql` | Modo mantenimiento impuesto en la base de datos: con él encendido, solo Dynamo y el servidor escriben en las tablas de negocio (trigger `tg_mantenimiento`). Y `clientes.alta_por` («Alta dada por», comisiones; solo empleados de Dynamo) | ✅ listo |
| `20261103280000_solicitudes_cliente.sql` | Etapa B: el cliente pide su envío (`crear_solicitud_envio`, solo con sus sitios), Dynamo pone precio (`proponer_precio_solicitud`, válido `solicitud_validez_horas`), el cliente acepta (con las condiciones generales, hora en `condiciones_aceptadas_en`) o rechaza (`responder_precio_solicitud`); `cancelar_mi_envio` rehecho; `mis_envios()` con el estado de la solicitud | ✅ listo |
| `20261103290000_panel_transportista.sql` | Etapa C: `mis_viajes()` con horario, teléfono y avisos de cada muelle (`paradas_viaje_json`), `marcar_mi_viaje` (solo hacia delante), el transportista sube albarán/CMR firmado/fotos/GPS de SUS viajes, y `mi_enlace_cmr` (transportista o cliente del envío) | ✅ listo |
| `20261103300000_orden_transportista.sql` | `datos_orden_transportista(envío)`: lo justo para que el transportista descargue la orden de carga de SU viaje (sin el cliente de Dynamo ni su precio) | ✅ listo |
| `20261103310000_incidencias_transportista.sql` | El transportista abre incidencias de SUS viajes (y adjunta fotos); las ven Dynamo y él, el cliente no (ni su texto en el historial del envío) | ✅ listo |
| `20261103320000_envios_manuales_cliente.sql` | El cliente crea envíos con SU operador (`crear_envio_manual`), lleva su estado (`marcar_mi_envio_manual`) y saca la orden de transporte sin nada de Dynamo (`datos_orden_manual`) | ✅ listo |
| `20261103330000_documentos_ficha_transportista.sql` | El transportista sube la documentación de SU empresa (CIF, seguro CMR, tarjeta de transporte, DNI, otros; máx. 5) | ✅ listo |
| `20261103340000_limite_intentos_carga.sql` | Aceptar carga por enlace: 5 CIF fallidos por reserva (y se libera) y 20 fallos/día por carga; registro append-only `intentos_carga_publica` | ✅ listo |
| `20261103350000_exportaciones_facturado.sql` | `marcar_facturados(venta/compra)` (columna FACTURADO? de Holded desde el panel) y la bolsa vuelve a publicar lo modificado después de publicarlo | ✅ listo |
| `20261103360000_datos_dynamo.sql` | Los datos fijos de Dynamo (razón social, CIF, dirección, teléfonos, Wtransnet, O.T.) en `parametros` (`dynamo_*`) y `datos_dynamo()` para leerlos con sesión | ✅ listo |
| `20261103370000_orden_carga_publica.sql` | La orden de carga en PDF y el CMR digital desde el enlace público `/carga/<enlace>` tras aceptar (llave: la reserva aceptada); una sola copia del contenido de la orden (`orden_carga_json`) para el panel y el enlace. |
| `20261103380000_bultos_cmr.sql` | Bultos, embalaje y volumen del envío (casillas 7, 8 y 12 del CMR): los pone Dynamo o el cliente antes de cargar y sin firmas (`poner_datos_cmr`, `datos_cmr_envio`); también en la orden de carga. |
| `20261103390000_almacenamientos_pago.sql` | Pago por adelantado del almacenamiento (`pagado_en`, pestaña «Pendiente de pago») y datos bancarios de Dynamo en Parámetros (`dynamo_iban` vacío hasta que lo ponga el usuario, `dynamo_banco`, `dynamo_bic`) para la proforma. |
| `20261103400000_parametros_blindados.sql` | Parámetros: Dynamo lee, solo el ADMINISTRADOR escribe (antes un empleado podía por la API). IBAN, banco, BIC, titular y CIF de Dynamo **solo se cambian en Supabase**, nunca desde la web (trigger anti-fraude). |
| `20261103410000_roles_lectura.sql` | Dos tipos de usuario nuevos: **Admin lectura** (`admin_lectura`) y **Empleado lectura** (`empleado_lectura`). Aparte porque Postgres no deja usar un valor nuevo de un tipo enumerado en la misma transacción. `admin`/`empleado` no se renombran: en pantalla son «Admin Master» y «Empleado gestor». |
| `20261103420000_roles_lectura_permisos.sql` | Los de solo lectura **lo leen todo y no escriben nada**: `ve_todo()` (los 4 roles de Dynamo) abre una política de SOLO LECTURA gemela de cada lectura con `es_admin()`; `es_admin()` no cambia y sigue siendo lo que abre la escritura. Las funciones que solo leen (altas, conexiones, pronto pago, datos del CMR, sitio principal) pasan a `ve_todo()`. Admin lectura solo lo concede el Admin Master; un email de cliente o transportista no pasa a ningún rol de Dynamo. |
| `20261103430000_contadores_y_cobertura.sql` | `contadores_panel()`: los números del menú lateral y de la campana en una sola llamada (SECURITY INVOKER: cuenta solo lo que quien llama puede ver). `mi_cobertura_credito()`: estado de crédito del cliente para el punto de la barra (disponible / nulo / sin clasificar), **nunca importes**. |
| `20261103440000_admin_master_solo_supabase.sql` | El **Admin Master** (`admin`) solo se nombra desde Supabase (Table Editor o SQL Editor, conexión directa como `postgres`). Ni otro admin desde la web ni la clave de servicio pueden crearlo (trigger en `usuarios`, prueba 87). Quitárselo a alguien sí se puede desde la web. |
| `20261103450000_negociacion_envio.sql` | `envios.negociacion_pct` (0/5/10/30): la banda de negociación con el transportista se puede dejar puesta al **crear o modificar** el envío, y «Ofrecer carga» sale con ella. Dato interno (el cliente no lo ve; el transportista nunca ve el %). |
| `AAAAMMDDhhmmss_tarifas_plantillas.sql` | tarifas con vigencia y plantillas de texto (la tabla `parametros` ya la crea la 0010: aquí solo se le añaden claves). **LA ÚLTIMA, por decisión del usuario (2026-11-03): «cuando todo esté montado hacemos esto»**. Necesitará su libro de tarifar y el código del Apps Script | pendiente (al final) |
| `20261103020000_exportaciones_holded_wtransnet.sql` | `v_holded_pedido_venta` (33 col.), `v_holded_pedido_compra` (34) y `v_wtransnet` (29) con **las cabeceras exactas** de las plantillas del Sheet; el porte y las penalizaciones confirmadas son líneas del mismo pedido; Wtransnet solo publica lo programado sin transportista y quieto 3 min; banderas `facturado_venta` / `facturado_compra`; ajustes de Holded en `parametros` | ✅ listo |
| `20261103010000_permisos_por_rol.sql` | **permisos por rol**: Dynamo lee las tablas; cliente y transportista leen por funciones (`mis_envios`, `mis_viajes`, `mis_ofertas`, `mi_empresa`…) que solo dan sus filas y sus columnas; los envíos solo los escriben Dynamo y el servidor (el cliente cancela con `cancelar_mi_envio`); contactos, usuarios (nadie se cambia el rol, solo admin concede admin), flota, auditoría | ✅ listo |

## Convención de nombres (2026-11-03)

Fijada al unificar los nombres (`20261103040000_nombres_unificados.sql`). Se sigue en toda
migración nueva:

| Qué | Cómo | Ejemplos |
|---|---|---|
| Tablas | plural, minúsculas, `_` | `envios`, `envio_paradas` |
| Columnas | **sin prefijo de tabla** (`envios.estado`, no `envio_estado`) | `estado`, `cif` |
| Relación con otra tabla | `<tabla en singular>_id` | `cliente_id`, `envio_id` |
| Fecha y hora | `*_en` (siempre `timestamptz`) | `creado_en`, `entregado_en` |
| Fecha sin hora | `fecha_*` (`date`) | `fecha_carga_desde` |
| Sí / no | `es_*`, `tiene_*`, `requiere_*` | `es_manual`, `requiere_cita` |
| Dinero | `importe_*` | `importe_cliente` |
| Con unidad | la unidad al final | `margen_euros`, `banda_pct` |

Y un nombre para cada dato, en todas las tablas: **`codigo_postal`** (nunca `cp`),
**`poblacion`** (nunca `localidad` ni `ciudad`), **`direccion`** (calle y número; nunca `calle`), **`anotaciones`** (nunca `notas` ni
`observaciones`) y **`pais_codigo_iso`** ('ES'; el nombre del país no se guarda, se saca
del código). La prueba 47 del arnés avisa si vuelve a aparecer uno de los viejos.

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

**Los dos riesgos que quedaron anotados aquí (resueltos el 2026-11-03 con los permisos por rol):** el primero desaparece porque **los clientes no escriben envíos**: los escriben Dynamo y el servidor, que sí leen las restricciones (y la comprobación 29 confirma que un envío de Dynamo a Zúrich se bloquea). El segundo (`FORCE`) queda pendiente y anotado en `PRODUCCION.md` §02.

**Texto original:**

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
- **Origen y destino salen solos**: el trigger rellena `codigo_postal_origen`/`codigo_postal_destino`/`num_paradas`
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


### Añadido al verificar la operativa (2026-11-03)

Comprobaciones 31 a 37 del arnés. Lo no obvio:

- **Corte de cancelación** (`corte_cancelacion`): 9:00 de Madrid del día hábil anterior, bien en
  verano (UTC+2) e invierno (UTC+1). **Desde `20261103030000_festivos.sql` salta también los
  festivos** (comprobación 46: Inmaculada, Semana Santa y un festivo de comunidad). La penalización
  automática usa los nacionales; los de comunidad se usan si se pasa la región.
- **Penalización automática**: cancelar un envío de Dynamo **con camión asignado** después del
  corte crea la de *Cancelación* por el **servicio entero** (importe cliente y transportista).
  Deshacer la cancelación la **retira** (queda como cancelada, no se borra)… salvo que Dynamo la
  haya renegociado (`editada_a_mano`), que se queda.
- **El cliente ve sus penalizaciones con `mis_penalizaciones()`**, no leyendo la tabla: la seguridad
  por filas filtra filas, no columnas, y la tabla lleva lo que se paga al transportista. **Este es el
  patrón para las vistas por rol** que faltan (envíos: el cliente no debe leer `importe_transportista`
  ni el margen leyendo `envios` directamente). Va en la migración de políticas por rol.
- **Documentos**: el cliente ve lo marcado `visible_cliente` de lo suyo (albarán, CMR) y las fotos y
  adjuntos que sube él a sus incidencias. Nunca el seguro o la tarjeta del transportista ni la
  orden interna. Máximo 5 en la ficha de cada transportista.
  **Fallo cazado:** la primera versión dejaba ver al cliente *cualquier* documento que constara
  como subido por él; si alguien de Dynamo trabajaba con una sesión mal puesta, un documento interno
  quedaba a la vista. Ahora lo "subido por mí" solo cuenta para fotos y adjuntos de incidencias.
- **Pendiente al conectar**: crear en Supabase Storage el bucket **`documentos` PRIVADO** (enlaces
  firmados con caducidad, nunca públicos) con sus políticas, y el de las firmas.
- **Firmas del CMR**: append-only, las escribe solo el servidor (quien firma no tiene cuenta),
  dejan hito `cmr_firmado`, y el cliente ve las de sus envíos.


### Exportaciones a Holded y Wtransnet (2026-11-03)

Comprobaciones 42 a 45. Pedir la vista en **CSV** a la API de Supabase da el fichero listo para
importar, con la cabecera exacta de la plantilla.

**A confirmar con una importación real** (anotado también en la propia migración):
- **Holded · "Operación"**: España → `general`, resto de la UE → `intracomunitaria`, fuera →
  `exportacion`. Es la regla habitual del IVA en transporte, pero el texto exacto que espera Holded
  y el criterio fiscal los tiene que validar el asesor.
- **Holded · "Formato de numeración" y "canal de venta"**: vacíos hasta que se rellenen en
  `parametros` (`holded_formato_numeracion_*`, `holded_canal_*`).
- **Wtransnet · "Tipo Bolsa", "Tipo Vehiculo", "Especialidad"**: puestos como Completa/Grupaje,
  Trailer/Rigido y Lona; **"Peso" en kg**. Comprobar con un fichero que Wtransnet haya aceptado.
- **Wtransnet · "Comentarios Públicos"**: sale SIEMPRE vacío a propósito. Las anotaciones del
  cliente pueden llevar teléfonos o el nombre de su cliente final, y la bolsa es pública.
- **"CLIENTE"** en el fichero de Wtransnet es columna interna de la hoja; con discreción comercial
  sale vacía.
