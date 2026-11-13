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
| `20261104090000_transportista_edita_sus_datos.sql` | El transportista cambia su NIMA, su seguro CMR y su flota (camiones y conductores: alta, datos y baja) con funciones de lista cerrada; lo fiscal solo Dynamo. Prueba 88. |
| `20261104100000_almacenamientos_cliente.sql` | El cliente pide almacenamientos: precio, IVA y pago por adelantado los calcula la base de datos (trigger); no puede marcarse como pagado ni tocar notas internas. `almacenes_dynamo_tarifa()` para su pantalla. Prueba 89. |
| `20261104110000_archivos_sueltos.sql` | `archivos_sueltos()`: lista (solo el servidor) los ficheros del almacén sin ninguna fila que los nombre y con más de 24 h; el Admin Master los borra desde Modo mantenimiento con la Storage API. Prueba 90. |
| `20261104120000_cambio_email_registro.sql` | `registrar_cambio_email()`: el cambio de email (solo Admin Master) queda en la auditoría con su autor y el email de antes y de después. Prueba 91. |
| `20261104130000_recursos_documentos.sql` | Documentos de Recursos (`es_recurso`, con título y descripción): los publica y quita solo Dynamo, los ve cualquier cuenta activa. Prueba 92. |
| `20261104140000_valoracion_cliente.sql` | El cliente puntúa (1-5 + comentario) al transportista de su envío de Dynamo entregado; la cambia 30 días; nadie más la toca (trigger). Media interna `transportistas.valoracion_clientes`. Prueba 93. |
| `20261104150000_alta_transportista_online.sql` | Alta online de un transportista nuevo desde un enlace de bolsa: ficha `no_ofertar` + etiqueta `alta_online`, contacto de tráfico, y la carga queda reservada en `pendiente_revision` hasta que Dynamo verifica y aprueba. Sin duplicar CIF. Prueba 94. |
| `20261104160000_alta_transportista_solo_bolsa.sql` | El alta online pasa a ser **solo para transportistas de una bolsa del grupo Alpega**: pide únicamente bolsa + código, país, CIF/NIF y teléfono (el resto lo completa Dynamo desde la bolsa; razón social provisional «Pendiente de completar (…)»). Tampoco duplica un código de bolsa ya dado de alta. Prueba 94 actualizada. |
| `20261104170000_suspension_automatica.sql` | **Suspensión automática** de cuentas (reglas del 2026-07-17) con las cifras en `parametros` (`autosusp_*`), tabla `consultas_precio` (cada solicitud de precio), motivo y casilla «no suspender nunca» por usuario, reactivar reinicia el contador; proceso diario con pg_cron (si no está, se lanza a mano). Prueba 95. |
| `20261104180000_usuarios_metricas.sql` | Usuarios: **«Enviar copia a»** (`copias_avisos`, máx. 10 emails válidos), **tiempo conectado** (`latido()` cada 5 min, no se puede inflar) y `metricas_usuarios()` (consultas y minutos, solo Dynamo). Prueba 96. |
| `20261104190000_tablon_cargas.sql` | `otras_cargas_publicas(token)`: el **tablón** de la página pública de una carga (solo con enlace válido; cargas publicadas en bolsa y libres; sin datos del cliente). Prueba 97. |
| `20261104200000_fecha_pasada_solo_master.sql` | Fecha de carga **pasada**: solo el **Admin Master** (al crear o al cambiar la fecha). Prueba 98. |
| `20261104210000_autosuspension_al_instante.sql` | **Suspensión al momento**: cada consulta de precio (regla 3) y cada cancelación (reglas 4 y 5) revisan a esa persona en la misma operación y la suspenden en ese instante si pasa del límite; el repaso general pasa de cada noche a **cada hora** (minuto 17). Los guardianes de `usuarios` dejan pasar solo ese cambio (activa → suspendida) marcado por la función interna. Prueba 99. |
| `20261104220000_previo_pago_envios.sql` | **Previo pago de envíos**: al confirmar, un envío de cliente sin crédito disponible o su primer envío (parámetro `previo_pago_primeros_envios`, casilla de empresa conocida en `clientes`) queda **pendiente de pago** y no se puede ofertar, publicar en bolsa ni asignar. `marcar_pago_envio` (Dynamo: transferencia, sin pago previo con motivo, exigir, deshacer), `pago_envio_stripe` (solo servidor, importe exacto), `pagos_envio` (cliente: los suyos). Contadores con «sin pagar». Prueba 100. |
| `20261104230000_contraoferta_cliente.sql` | **Contraoferta del CLIENTE** (si su ficha la permite): propone un precio más bajo; hasta `contraoferta_cliente_auto_pct` (5 %) se acepta sola, hasta `contraoferta_cliente_max_pct` (15 %) la revisa Dynamo (`resolver_contraoferta_cliente`), más no se admite. Nuevo estado de solicitud `contraoferta`. Texto de `contraoferta_auto_pct` aclarado (es la del TRANSPORTISTA). Prueba 101. |
| `20261104240000_estado_cuenta_propia.sql` | Estado de la cuenta: **nadie cambia el suyo**, el de un **Admin Master solo desde Supabase**, y ninguna cuenta **vuelve a «pendiente de verificación»**. Prueba 102. |
| `20261104250000_contraoferta_cliente_interruptor.sql` | Contraoferta del cliente: **interruptor general** `contraoferta_cliente_activa`; solo se ve y se usa con el general Y el de la ficha del cliente encendidos. Prueba 103. |
| `20261104260000_negociacion_transportista.sql` | **Negociación del transportista** (otro precio al aceptar una carga): interruptor general `contraoferta_transportista_activa` y requisitos en Parámetros (`negociacion_min_creada_min` 45, `negociacion_min_bolsa_min` 45, `negociacion_max_horas_carga` 48; 0 = no se aplica). `negociacion_publica(token)` para la página; guardián en `envio_reservas`. Prueba 104. |
| `20261104270000_riesgos_cesce.sql` | **Regla del riesgo**: el manual de Dynamo manda si es distinto de 0; si es 0 o vacío, manda CESCE (antes un manual a 0 dejaba sin crédito). `riesgos_clientes()` para **CESCE - Riesgos**: concedido, límite, asumido (envíos de los últimos `riesgo_dias_asumido` = 60 días sin prepagar, con IVA) y disponible. Prueba 105. |
| `20261104280000_contacto_transportista_fin.sql` | El cliente deja de ver **nombre y teléfono del conductor** al entregar/cancelar o `contacto_transportista_horas_tras_entrega` (12) horas tras el final del día de entrega previsto. `mis_envios` redefinida. Prueba 106 (incluye visibilidad por empresa). |
| `20261104290000_negociacion_requisitos_extra.sql` | Negociación del transportista, requisitos extra (apagados por defecto): `negociacion_min_cargas_hechas`, `negociacion_una_por_carga`, `negociacion_sin_quitado_dias`, `negociacion_max_contraofertas_carga`. Prueba 107. |
| `20261104300000_cambios_envio.sql` | **Cambios en un envío confirmado**: el cliente los pide (`pedir_cambio_envio`): sin camión y solo fechas se aplican al momento; si no, pendientes para Dynamo (`resolver_cambio_envio`). Cambiar la ruta marca **«revisar precio»** hasta tocar el precio. Prueba 108. |
| `20261104310000_siniestro.sql` | Tipo de incidencia **siniestro** (daño, rotura o faltante), siempre prioridad **crítica**. Prueba 109. |
| `20261104320000_cmr_reservas.sql` | **Reservas en el CMR digital** (`cmr_reservas`): se anotan antes de firmar, abren un siniestro crítico y salen en la casilla 18 del PDF. `anotar_reservas_cmr`, `reservas_cmr_publico` (con enlace válido). Prueba 110. |
| `20261104330000_historial.sql` | **Historial «quién y cuándo»** de envíos, incidencias, almacenamientos, sitios y transportistas propios (`historial_registro`, de la auditoría): Dynamo lo ve todo; el cliente dueño, sin datos internos y con Dynamo/transportista sin contacto. `autores_mis_envios()` para «Creado por» en la lista del cliente. Prueba 111. |
| `20261104340000_contraofertas_varias.sql` | **Varias contraofertas a la vez**: una contraoferta (o un alta online) pendiente ya **no bloquea** la carga; solo la reserva viva de 3 min es única. Al quedarse uno la carga (aprobada, aceptada al precio o asignada a mano), las demás pendientes quedan **rechazadas**. Fuera `negociacion_sin_quitado_dias` y `negociacion_max_contraofertas_carga`. Prueba 112 (y 94 actualizada). |
| `20261104350000_autosusp_cancelaciones_tardias.sql` | Suspensión automática, reglas 4 y 5: solo cuentan las cancelaciones **con camión asignado** o **sin camión pasado el corte** de las 9:00 del día hábil anterior (`cancelacion_cuenta`). Prueba 113 (y 95/99 ajustadas). |
| `20261104360000_cancelacion_en_nombre_cliente.sql` | Dynamo cancela **desde la vista del cliente** → cuenta como cancelación del cliente (reglas 4 y 5, a nombre de quien creó el envío; revisión al momento). Desde gestión interna no cuenta. `cancelar_envio(envio, motivo, en_nombre_cliente)`. Prueba 114. |
| `20261104370000_cambio_con_camion_llamar.sql` | Con camión asignado el cliente ya no pide cambios desde la plataforma (`pedir_cambio_envio` devuelve `con_camion`): ve una ventana para llamar urgente. Modificar nunca tiene coste; si el cambio no es viable, Dynamo cancela (costes según el plazo de las 9:00) y reasigna. Prueba 108 actualizada. |
| `20261104380000_mantenimiento_tablas_nuevas.sql` | Bloqueo de mantenimiento también en `cmr_reservas` y `envio_hitos` (creadas después del 03-11); las conexiones directas (pg_cron, migraciones) ya no se bloquean. Prueba 115: avisa si una tabla nueva queda sin el bloqueo. |
| `20261104390000_avisos.sql` | **Campana de avisos**: tabla `avisos` (los crea la base de datos con triggers en envíos, reservas, incidencias y suspensiones), `mis_avisos()` (cada uno los suyos; Dynamo con «Ver como» los de esa empresa), `marcar_avisos_vistos()` y limpieza a los 90 días (pg_cron; desactivada después por `no_borrar_historico`). Al cliente nunca le llega el precio del transportista. Prueba 116. |
| `20261104400000_revision_seguridad.sql` | **Revisión de seguridad** de las migraciones del 04-11 (dos revisores): previo pago no se esquiva con un envío sin pagar; el cliente no cambia una carga que se está asignando ni pasada la hora límite; reservas del CMR validadas como la firma; contraofertas rechazadas al cancelar; topes del alta online; tablón solo con enlaces recientes; copias de avisos, email y anotaciones solo Dynamo; estado del Admin Master solo desde la consola. Pruebas 100, 110 y 117. |
| `20261104410000_topes_a_parametros.sql` | Los topes de la revisión de seguridad pasan a Parámetros: `alta_online_max_pendientes_carga` (3), `alta_online_max_dia` (30) y `tablon_enlace_dias` (14). |
| `20261104420000_notas_internas.sql` | **Notas internas solo para Dynamo**: las anotaciones de usuarios, clientes, transportistas (y sus notas de incidencias), camiones, conductores y almacenamientos pasan a `notas_internas` (solo Dynamo lee y escribe). En las fichas la columna queda siempre vacía: un trigger mueve la nota al guardar. Prueba 118. |
| `20261104430000_horario_verano_sitios.sql` | **Horario de verano de los sitios**: `lugar_horarios.temporada` (general/verano), `lugares.verano_activo/verano_desde/verano_hasta` (MM-DD, cada año) y resumen `horarios_verano`; `guardar_horario(…, p_temporada)`, `guardar_horario_verano()` y `horario_del_dia()`. Fechas genéricas en Parámetros: `verano_sitios_desde` (05-25) y `verano_sitios_hasta` (09-15). Prueba 119. |
| `20261104440000_horario_verano_en_envios.sql` | El horario de verano también en los envíos: `horario_sitio_txt(lugar, fecha)` y cada parada de «Mis viajes» y de la página pública de la carga lleva el horario de su fecha. Prueba 120. |
| `20261105090000_seguridad_puntos_bajos.sql` | Puntos bajos de la revisión: la contraoferta del cliente admite como mucho 3 propuestas demasiado bajas en 24 h (tabla `contraoferta_intentos`), y los mensajes de alta de camión o conductor ya no revelan que existen en Dynamo. Prueba 121. |
| `20261105100000_rgpd_herramientas.sql` | **RGPD**: limpieza nocturna `purgar_datos_personales()` (IPs e intentos a 90 días, conexión y consultas a 12 meses, teléfono de conductores sin viajes en 2 años); `anonimizar_usuario/contacto/conductor()` (solo Admin Master; la auditoría apunta los campos sin los valores); `exportar_datos_usuario()`. Prueba 122. |
| `20261105110000_revision_seguridad_2.sql` | Segunda revisión de seguridad (código del 4-5 nov): el historial ya no enseña al cliente campos internos (notas de almacenamientos de antes del 04-11); la exportación de datos no saca nombre ni DNI de firmas cruzadas por email; `horario_del_dia` y `horario_sitio_txt` con los permisos de quien llama; `verano_sitios_fechas()` para que los clientes lean las fechas de verano. Prueba 123. |
| `20261105120000_revision_seguridad_3.sql` | Tercera tanda de la revisión (base de datos del 4-5 nov): la auditoría ya no copia IP ni navegador de las reservas y la limpieza los quita de lo antiguo (única forma de tocar la auditoría, marca `dynamo.purga`); el alta online no apunta la IP en la nota; la limpieza borra también el teléfono del conductor en sus envíos; borrados de una anonimización sin datos en la auditoría; `resolver_contraoferta` vuelve a leer la reserva bloqueada; tope de contraofertas por cliente (6 en 24 h); `horario_texto` solo para el sistema. Prueba 124. |
| `20261105130000_cobertura_paises.sql` | **Cobertura por países**: parámetro `cobertura_paises`; `fn_restriccion_punto` (ahora SECURITY DEFINER) bloquea con motivo lo que está fuera de la lista, además de las excepciones; `comprobar_cobertura()` para avisar en el asistente antes de confirmar; `pais_nombre()`. Prueba 125. |
| `20261105140000_avisos_mas.sql` | Más avisos en la campana: penalización confirmada (al cliente y al transportista, cada uno con su importe), incidencia resuelta (a quien la abrió), almacenamiento confirmado o cancelado, albarán o CMR firmado disponible, CMR firmado en la entrega y cuenta activada. Prueba 126. |
| `20261105150000_buscar_persona_rgpd.sql` | `buscar_persona()` (solo Admin Master): por email, teléfono, DNI o nombre, todas las fichas de una persona (usuario, contactos, conductor) para la pantalla «Protección de datos». Prueba 127. |
| `20261105160000_conservar_conductores.sql` | Los datos de conductores y contactos no se borran solos (decisión del usuario): el borrado del teléfono de conductores sin viajes pasa a ser opcional con `rgpd_telefono_conductor_anios` (0 = nunca, por defecto). |
| `20261105170000_no_borrar_historico.sql` | **No se borra nada del histórico** (decisión del usuario): la limpieza nocturna queda apagada con `rgpd_limpieza_activa = false` y deja de borrar los avisos antiguos. Prueba 122 adaptada. |
| `20261105180000_plazo_pago.sql` | **Plazo para pagar** un envío pendiente de pago: parámetro `previo_pago_horas` (24), `envios.pago_pendiente_desde` (la pone la base de datos), `caducar_pagos_pendientes()` cada 15 min (pg_cron `dynamo-pagos-caducados`) anula los que pasan del plazo + 45 min sin contar como cancelación del cliente, aviso «pago_caducado»; `ampliar_plazo_pago()` (Dynamo); `pagos_envio` devuelve `pago_limite`; un pago con tarjeta que llega con el envío anulado no lo reactiva (aviso urgente a Dynamo para devolverlo). Prueba 128. |
| `20261105190000_revision_precio.sql` | **Revisión del precio** de los envíos programados con antelación: parámetros `envio_antelacion_max_dias` (120), `precio_cerrado_dias` (7), `precio_revision_dias_habiles` (3), `precio_revision_margen_pct` (5), `precio_revision_respuesta_horas` (24). Columnas `precio_calculado_en`, `precio_revision*`, `cancelacion_sin_coste`; guardián `tg_envios_ab_precio_revision` (provisional → ni oferta ni camión; pagado → cerrado); `revisar_precio_envio()` (Dynamo/servidor), `responder_subida_precio()` (cliente), `revisar_precios_programados()` cada hora (pg_cron `dynamo-revision-precios`), `revision_precio_envio()`, `reglas_precio_envio()`; el plazo para pagar espera al precio definitivo; `autosuspension_motivos` no cuenta las cancelaciones sin coste; `pagos_envio` con `precio_provisional`. Prueba 129. |
| `20261105200000_diccionario_datos.sql` | **Diccionario de datos dentro de Supabase**: comentario en las 39 tablas, las 661 columnas (formato \| rango \| lista \| obligatorio/opcional/automático \| descripción + ejemplos OK/mal, como la hoja de validaciones) y las 147 funciones de la API (grupo, qué hace, quién puede, argumentos). `diccionario_datos()`, `funciones_api()` y `guia_automatizaciones()` (solo Dynamo y servidor) para n8n y agentes de IA. Prueba 130: falla si algo queda sin describir, así que **cada migración nueva trae sus `comment on`**. |
| `20261105210000_iva_cliente_y_asignacion.sql` | **IVA del cliente**: al dar de alta un cliente, 21 % si es de España y 0 % si es de otro país (salvo uno puesto a mano); al cambiar el país, el IVA lo sigue. Cada envío toma el IVA de su cliente al crearse (antes, 21 fijo) y el cobro usa el del envío. **Asignar a mano = asignado**: poner el transportista pasa `estado_asignacion` a confirmada; quitarlo, a ofertada o sin asignar. Prueba 131. |
| `20261105220000_llave_carga_caduca.sql` | **La llave del enlace público de la carga (la reserva) caduca al terminar el viaje**: con el envío entregado o cancelado, `carga_aceptada_publica` responde «cerrada» sin datos, `datos_orden_publica` y `enlace_cmr_publico` se niegan. Hasta cargar se completan matrículas y conductor; durante el viaje solo se lee la orden y se abre el CMR. Prueba 132. |
| `20261105230000_llave_carga_por_fecha.sql` | **La llave del enlace de la carga caduca por fecha** (no sabemos cuándo carga el camión): vale hasta el final del último día de carga (hora de Madrid) + `enlace_carga_horas_tras_carga` (24 h), y nunca con el envío entregado o cancelado. `enlace_carga_vigente()`; aplicado a ver la carga, completar camión y conductor, la orden y el enlace del CMR. Prueba 132b. |
| `20261105240000_llave_carga_cierre_almacen.sql` | El enlace de la carga caduca **X horas después del cierre del almacén de carga** el último día de carga (según el horario del sitio ese día, el de verano si toca; con varias recogidas, la que cierra más tarde; sin horario, desde las 23:59). `enlace_carga_horas_tras_carga` pasa a **4 h** por defecto (17:00 + 4 h = 21:00). `enlace_carga_caduca_en()`. Prueba 132b. |
| `20261105250000_completar_carga_sin_borrar.sql` | `completar_carga_publica`: un campo que llega vacío (matrícula, remolque, conductor, teléfono) **no borra** el dato que ya había. Prueba 133. |
| `20261105260000_chofer_con_sus_datos.sql` | **Los datos del chófer van con su chófer**: en el enlace del transportista (`completar_carga_publica`) un chófer nuevo lleva su teléfono, el que tenga en la flota de ese transportista, o vacío (nunca el del anterior); un camión nuevo sin chófer escrito trae el chófer y teléfono de su último viaje con ese transportista, o vacío; el mismo chófer con el teléfono vacío lo conserva. `flota_sugerencia_publica()` (enlace) y `flota_sugerencia()` (ficha de Dynamo) rellenan la pantalla al escribir. El alta automática de la flota solo reutiliza conductores del mismo transportista (el DNI va en su ficha y cambia con él). Prueba 134. |
| `20261105270000_cmr_dni_conductor.sql` | **CMR: la casilla del conductor sale rellena** con su nombre y su DNI (`cmr_publico` solo enseña las últimas cifras, porque el enlace lo abren también el almacén y el destinatario). Si el conductor del envío firma sin escribir el documento, `firmar_cmr_publico` usa el de su ficha; si firma otra persona, tiene que escribir el suyo. Si el conductor no tenía DNI en su ficha, se guarda el que use al firmar. Prueba 135. |
| `20261105280000_arreglos_diccionario.sql` | Arreglos del repaso del diccionario: `envios_que_cuentan()` y `factor_automatico()` cerradas a la API (daban cifras de otro cliente); `envios.carga_trasera` por defecto «no» (como las funciones); IVA y retención del transportista entre 0 y 100; `mi_vehiculo_guardar` deja corregir la matrícula si no la tiene otro. Prueba 136 (y 88 adaptada). |
| `20261105290000_conteos_envios.sql` | La API de Supabase devuelve como mucho **1.000 filas** por consulta: los conteos de envíos por cliente, transportista, operador y usuario los hace ahora la base de datos (`envios_por_empresa()`, `uso_envios_usuarios()`, con RLS) en vez de descargar hasta 200.000 filas. En la app, `lib/leerTodo.ts` lee las listas largas por tandas de 1.000. Prueba 137. |
| `20261105300000_buscador_envios.sql` | **Buscador de envíos para años de datos**: `envios.texto_busqueda` (lo mantiene la base de datos al cambiar el envío, sus paradas o el nombre de la empresa) con índice de trigramas (`pg_trgm`) e índice por fecha de carga; `buscar_envios_pagina()` (texto y/o fechas, por páginas, con el total; Dynamo en todo, cliente en lo suyo, transportista en sus viajes sin datos del cliente); `mis_envios_por_ids()` / `mis_viajes_por_ids()`. La auditoría no apunta el texto de búsqueda. Prueba 138 (y 138b: usa el índice). |
| `20261105310000_revision_logica.sql` | Arreglos de la **revisión de lógica y concurrencia**: aceptar desde el tablón (sin oferta) ya no revienta; línea de pronto pago comprobada al aceptar (cerrojo); cobro con tarjeta no aplicado (`stripe_cobro_sin_aplicar`) avisa y no deja anular, y Dynamo lo da por pagado (`marcar_pago_envio` «tarjeta»); rechazar o cancelar una solicitud no cuenta como cancelación; el cliente acepta solo el precio visto (`p_precio_visto`); deshacer cancelación de una solicitud vuelve a solicitud, con plazo de pago nuevo y aviso al transportista; marcar pago solo en envíos activos; precio e IVA fijos tras pagar; cancelar un borrador no lo confirma; plazo de pago en día hábil; mover la fecha no borra una subida pendiente; «hoy» en hora de Madrid; el transportista no marca en ruta/entregado antes del día de carga; índices. Prueba 139 (y 73 adaptada). |
| `20261105320000_revision_seguridad_4.sql` | Arreglos de la **revisión de seguridad**: CMR sin el DNI del conductor relleno ni «aprendido» (con el enlace se podía firmar por él o guardar un DNI falso), validez del DNI/NIE calculada por la base de datos (`documento_es_valido`), el almacén de archivos ya no se deja listar sin sesión ni por cuentas ajenas (las rutas llevaban las llaves de los CMR; `cmr_trazo_visible`), máx. 20 trazos por enlace; hitos y firmas fuera de Dynamo solo con `mis_hitos()` / `firmas_envio()` (sin precios de la otra parte, IP ni navegador; documento enmascarado); línea de pronto pago solo para Dynamo; el transportista ve solo los documentos de transporte; subidas de clientes y transportistas solo en su carpeta `u/<id>`; almacenes de Dynamo solo con sesión; un empleado no toca al Admin Master y un alta online no pasa a Dynamo; el cliente no reasigna sus incidencias; enlace de Google Maps solo https y de Dynamo; el tope de 24 h del tablón solo cuenta CIF inexistentes. Pruebas 135 (rehecha), 140 (y 15, 17, 37, 73 adaptadas). |
| `20261105330000_carpeta_tarifa.sql` | **Carpeta privada `tarifa`** para las tablas del tarifador (aún sin tablas). No se publica en la API y la web no tiene permiso (ni anónimos ni con sesión); las tablas nuevas nacen sin permisos para la web. Solo la leerán las funciones de precio. Prueba 141. |
| `20261105340000_lugares_a_sitios.sql` | **«Lugares» pasa a llamarse «Sitios» en toda la base de datos**, igual que en las pantallas: `lugares` → `sitios`, `lugar_horarios` → `sitio_horarios`, `distancias_lugares` → `distancias_sitios`, `recargos_tipo_lugar` → `recargos_tipo_sitio`, tipo `tipo_lugar` → `tipo_sitio`, columnas `*lugar_id` → `*sitio_id`, argumentos `p_lugar` → `p_sitio`, y sus funciones, políticas, disparadores, índices y descripciones. Solo nombres: los datos no cambian; el historial anterior (`auditoria.tabla = 'lugares'`) se sigue viendo. Generada desde la base de datos. Las migraciones anteriores conservan los nombres de entonces. Prueba 142. |
| `20261105350000_homogeneidad_n8n_fase1.sql` | **Homogeneidad para n8n, fase 1** (revisión del 2026-11-05). Reglas que solo comprobaba la web, ahora en la base de datos: no se da carga a un transportista suspendido, al asignar se copia su NIMA, al quitarlo se limpian camión/conductor/precio, y sin transportista un envío no pasa de programado. Funciones nuevas `asignar_transportista`, `quitar_transportista`, `marcar_estado_envio`, `revocar_oferta` (devuelven `{ok, resultado}`; la web las usa). «Sin permiso» siempre con código 42501; argumentos opcionales con DEFAULT; `mi_empresa()` con el IVA; `funciones_api()` con valores por defecto y `sin_sesion`; `guia_automatizaciones()` al día (errores, glosario, qué tablas se escriben directo); descripciones corregidas y de las funciones de servidor. Prueba 143 (y 58, 88, 91, 93 adaptadas). |
| `20261105360000_homogeneidad_nombres_fase2.sql` | **Homogeneidad para n8n, fase 2: nombres** (decisiones del usuario: renombrar ahora, «orden de carga», «plataforma elevadora»). ~55 columnas con las reglas comunes (`*_pct`, `*_en`, `*_dias`, `estado_*`, `requiere_/tiene_/exento_`, `importe_*`, `*_ref` para ids externos), `vehiculos.trampilla` → `tiene_plataforma_elevadora`, 25 funciones (`es_admin` → `es_equipo_dynamo`, `es_administrador` → `es_admin_master`, sin `fn_` salvo disparadores, verbo delante, `*_publico` las de enlace, `p_datos` en los `crear_*`, `p_conductor_nombre`, `marcar_exportados(p_valor)`), tipos de incidencia, valores `paletizada_lateral` y `orden_carga_enviada`, documentos `orden_carga`, claves de parámetros `pago_previo_*` y `autosuspension_*`, códigos de sitio nuevos `S-`. Fuera los tipos sin uso `tipo_ticket` y `tipo_entidad`. Se quedan (ambiguos o palabra suelta, explicados en el diccionario): `adr`, `pronto_pago`, `cuando`/`quien`, `tipo_id`, `desde`/`hasta` de reservas, `recargos_tipo_sitio.porcentaje`. Generada desde la base de datos. Prueba 144. |
| `20261105370000_rendimiento_permisos_indices.sql` | **Rendimiento con muchos datos**: las 108 reglas de permisos de `public` llaman a `es_equipo_dynamo()`, `ve_todo()`, `cliente_del_usuario()`, `transportista_del_usuario()`, `es_admin_master()`, `es_servidor()` y `auth.uid()` como `(select …)`: se calculan una vez por consulta y no una por fila (recomendación de Supabase). Lo que permiten no cambia. Índices `envios (estado, creado_en desc)` y `(cliente_id, creado_en desc)`; fuera `idx_paradas_envio`, repetido del único `ux_envio_paradas_orden`. Generada desde la base de datos; pasan las 144 pruebas. |
| `20261105380000_textos_homogeneos.sql` | **Textos que escribe la base de datos, homogéneos** (decisiones del usuario: «Vie 10/07/26» en todo, nombre legal, «orden de carga», «plataforma elevadora»). Ayudantes `fecha_texto()`, `fecha_hora_texto()`, `tel_dynamo()`, `email_dynamo()` (teléfono y email desde Parámetros, antes a mano en 9 sitios; el CMR saca la razón social de Parámetros); tildes en ~30 mensajes; mensajes técnicos en castellano llano (histórico, sin códigos internos, «Admin Master»); títulos de avisos «Título · #GX»; guía con los nombres de rol y cómo leer los errores de Postgres; descripciones con «orden de carga» y «plataforma elevadora». CIF/NIF y matrículas se guardan siempre sin espacios, puntos ni guiones (disparadores; los ya guardados se igualan). Prueba 145 (y 36 adaptada). |
| `20261105390000_envios_por_paginas.sql` | **Lista de envíos por páginas desde la base de datos**: `envios_pestanas()` cuenta cada pestaña y `envios_pagina()` da los ids de la página (mismas reglas que las pestañas de la web, en `envio_en_pestana()`; mismos permisos que el buscador). La web lee solo los 20 de la página (antes, hasta 6.000 con sus paradas). Prueba 146. |
| `20261105400000_panel_mas_ligero.sql` | `contadores_panel()` cuenta los envíos sin asignar del cliente con `cuenta_mis_envios_sin_asignar()` (antes recorría `mis_envios()`, que monta las paradas de cada envío). Prueba 147. |
| `20261105410000_textos_envio_para_todo.sql` | **Decisiones de textos del usuario (2026-11-05)**: «envío» también en lo que ve el transportista (avisos, errores, motivos de cierre; se quedan «hacia la carga», «día de carga», «orden de carga», «bolsa de cargas»); «Anulado sin pago» para el cancelado por no pagar a tiempo; «camión completo (tráiler o rígido)» en las restricciones de Baleares e Irlanda; `horario_texto()` escribe «Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00» y se rehacen los resúmenes guardados; `otras_cargas_publicas()` devuelve `requiere_plataforma_elevadora` (para «Rígido completo»); glosario de la guía de n8n. Prueba 148. |
| `20261105420000_hito_fecha_carga_movida.sql` | Hito nuevo `fecha_carga_movida` (va solo: un valor nuevo de un tipo no se puede usar en la misma transacción). |
| `20261105420100_fecha_carga_al_pagar.sql` | **Fecha de carga al pagar** (usuario, 2026-11-05): si el pago previo llega (o Dynamo lo pasa sin pago) cuando ya no da tiempo, la carga pasa al **primer día posible** (`primera_fecha_carga()`, mismas reglas que el tarifador, horas de corte en Parámetros `primer_dia_corte_fija_hora` 12 y `primer_dia_corte_ventana_hora` 14) con el **mismo tipo de fecha** (fija o los mismos días hábiles de ventana); mueve igual la entrega estimada, deja el hito y lo cuenta en el aviso de «Pago recibido». `pedir_cambio_envio()` mantiene el tipo de fecha, exige día hábil y no antes del primer día posible. Ayudantes `sumar_dias_habiles()`, `dias_ventana_carga()`, `ventana_texto()`. Prueba 149. |
| `20261105430000_duracion_sesion.sql` | **Duración de la sesión** (usuario, 2026-11-05): días sin volver a escribir la contraseña en Parámetros (`sesion_recordar_dias` 90 con «Recordarme», `sesion_dias` 30 sin él; 0 = sin límite) y `duracion_sesion()` para la web. El middleware cierra la sesión de ese dispositivo pasado el plazo, contando desde la última vez que se escribió la contraseña (marca firmada `amr` del token). Prueba 150. |
| `20261105440000_corte_al_pagar.sql` | **Horas de corte al pedir y al pagar, por separado** (usuario, 2026-11-05): mismas horas (fija 12:00, ventana 14:00) en dos juegos de parámetros; los nuevos `primer_dia_corte_pago_fija_hora` y `primer_dia_corte_pago_ventana_hora` se usan al pagar o liberar el envío. `primera_fecha_carga()` gana `p_al_pagar`. Prueba 151. |
| `20261105440100_hoy_en_madrid.sql` | **«Hoy» es el día de Madrid en toda la base de datos**: 6 funciones (`crear_envio_manual`, `marcar_mi_envio_manual`, `riesgos_clientes`, `restriccion_punto`, `metricas_usuarios`, `purgar_datos_personales`), la vista `v_restricciones_vigentes` y dos valores por defecto usaban `current_date` (día UTC de Supabase: de 00:00 a 01:00/02:00 de Madrid aún era «ayer»; p. ej. un envío manual para hoy salía como «fecha pasada»). Las pruebas corren en hora de Madrid. Prueba 152. |
| `20261106100000_baja_de_cuenta.sql` | **Baja de cuenta por el propio usuario** (usuario, 2026-11-06): `darme_de_baja()` deja que un cliente o transportista suspenda **su propio acceso** desde «Mi cuenta» (motivo «Baja a petición del usuario»). **No borra nada**: empresa, envíos, albaranes, CMR, documentos de control y facturas se guardan por obligación legal. Si es el último usuario activo de su empresa y hay envíos en marcha, no deja (tiene que llamar). Aviso a Dynamo en la campana. Los guardianes de `usuarios` solo dejan pasar ese cambio exacto (`baja_propia_en_curso()`). Dynamo la reactiva como cualquier suspendida. Prueba 153. |
| `20261106110000_en_vivo.sql` | **Plataforma en vivo** (usuario, 2026-11-06, «que se mueva sin refrescar»): cada cambio en las tablas del panel (envíos y lo que cuelga de ellos, incidencias, avisos, almacenamientos, usuarios, sitios, contactos, flota, operadores, clientes, transportistas) manda por **Supabase Realtime** una señal **sin datos** (`{"t": tabla}`) a «dynamo», «cliente:<id>» y «transportista:<id>» (`fn_senal_en_vivo()`, tres disparadores por tabla, una señal por sentencia y destinatario, nunca bloquea el cambio). Política de `realtime.messages`: cada cuenta activa solo escucha su canal (Dynamo y lectura, «dynamo»); nadie emite desde el navegador. Prueba 154. |
| `20261106120000_en_vivo_enlaces.sql` | **En vivo también en las páginas con enlace** (sin cuenta): bolsa de cargas `/carga/<enlace>` y firma del CMR `/cmr/<enlace>`. Cada cambio de un envío (o de sus ofertas, reservas, paradas, firmas, o del enlace del CMR) manda la señal sin datos al canal «enlace:<sha256 de la llave>»; lo puede escuchar sin sesión quien tenga el enlace, y la llave nunca va en claro. Prueba 155. |
| `20261106140000_hitos_en_marcha.sql` | Hitos nuevos `hacia_la_carga` y `cargando` (van solos: un valor nuevo de un tipo no se usa en la misma transacción). |
| `20261106140100_hitos_en_marcha_2.sql` | **Línea de tiempo completa** (usuario, 2026-11-06): el envío guarda con fecha, hora y quién la salida hacia la carga y la llegada a cargar (antes solo en la auditoría); el cliente también los ve. Cada parada guarda la hora en que se hizo (`realizado_en`): la del PIN si se validó en el punto; si no, las recogidas al pasar a «En ruta» y las entregas al «Entregado». Prueba 157. |
| `20261106160000_seguimiento_hitos.sql` | Hitos nuevos `descargando`, `descargado` y `etapa_corregida` (van solos: un valor nuevo de un tipo no se usa en la misma transacción). |
| `20261106160100_seguimiento_automatico.sql` | **Seguimiento automático del envío** (usuario, 2026-11-06). El estado avanza solo por etapas (Yendo a la carga → Cargando/Descargando en cada parada → En ruta a la siguiente → Entregado) según un horario previsto: jornada desde las 7:00, llegada a la 1.ª parada a las 12:30 (otra hora en verano), 1 h por parada, 80 km/h y tacógrafo (45 min cada 4 h 30, máx. 9 h al día, jornada de 13 h, descanso de 11 h sin arrancar antes de las 7:00), y espera a que abra cada sitio según su horario; todo en Parámetros («seguimiento_*»). Tarea `dynamo-estados-automaticos` cada 5 min (`avanzar_estados_envios`), etapa a etapa con su hito y su hora prevista. Dynamo marca a mano cualquier etapa con su hora (`marcar_etapa_envio`, también una hora futura para atrasar) y desde ahí sigue; `pausar_seguimiento_envio` lo para. El transportista avisa desde su ficha o la bolsa (`marcar_mi_viaje`, parada a parada). Columnas `fecha_carga_prevista` (obligatoria al asignar si hay ventana: `asignar_transportista` y `completar_carga_publica` la piden), `parada_actual`, `seguimiento_automatico`, `ancla_paso`, `ancla_hora`. Para las pantallas: `etapas_envio`, `seguimiento_envios` (incluye «Asignando transportista» a menos de 36 h). Pruebas 73 y 158. |
| `20261106160200_seguimiento_sin_festivos.sql` | **Los camiones no circulan sábados, domingos ni festivos nacionales** (usuario, 2026-11-06; `es_dia_habil`): en el seguimiento automático, si la jornada acabaría en uno de esos días, el camión descansa y arranca el siguiente día hábil a las 7:00; el día de carga, si cae en uno, pasa al siguiente hábil. Rehace `seguimiento_conducir` y `seguimiento_calcular`. Prueba 158. |
| `20261106163000_cuadro_mando.sql` | **Cuadro de mando del Dashboard admin** (usuario, 2026-11-06): `cuadro_mando(desde, hasta, comp_desde, comp_hasta)` devuelve en un JSON totales (realizados, solicitados, cancelados, facturación, coste, margen, km, €/km), evolución por día o por mes, cada mes con el mismo mes del año anterior, por día de la semana, los 25 clientes que más facturan (con riesgo y plazo) y los 10 transportistas a los que más se compra. Envíos de Dynamo (no los manuales), por su día de carga. Solo Dynamo (también solo lectura). Prueba 159. |
| `20261106163100_sector_cliente.sql` | **Sector del cliente** (usuario, 2026-11-06): `clientes.sector` opcional («Sin definir» si vacío) elegido de la lista del parámetro `sectores_cliente` (10 de partida, editables en Parámetros → Clientes); un sector fuera de la lista no se guarda (`tg_clientes_sector`). `cuadro_mando_sectores(desde, hasta)` reparte la facturación por sector. Prueba 159. |
| `20261106170000_datos_de_prueba.sql` | **Datos de prueba «al límite»** (usuario, 2026-11-06), **solo para `dynamo-pruebas`**: la migración no inserta nada, solo crea `cargar_datos_de_prueba(p_confirmacion, p_escala, p_clave_cuentas, p_cuentas_reales)`, `borrar_datos_de_prueba(p_confirmacion)` y `contar_datos_de_prueba()`, que se ejecutan a mano en el SQL Editor (nunca desde la API ni la web) escribiendo `'SI, ES EL PROYECTO DE PRUEBAS'`. A volumen completo: 3.000 clientes (≈70 % con sector), 20.000 transportistas (empresas y autónomos de 12 países, de 0 a cientos de camiones), ~36.000 conductores, ~33.000 vehículos, ~7.200 sitios, ~64.000 envíos (7 años con estacionalidad, más los próximos 2 meses) con ~156.000 paradas en las 7 combinaciones de recogida/entrega que admite la plataforma (CD, CCD, CDD, CCCD, CCDD, CDCD, CDDD; máx. 4) y en todos los estados —incluida una matriz «en marcha» con cada combinación en cada etapa (yendo a la carga, cargando o descargando en cada parada, en ruta a cada parada) con `parada_actual`, `realizado_en` y sus hitos—, ~640.000 hitos, ofertas, reservas y contraofertas, revisiones de precio, cambios, incidencias, penalizaciones, CMR, almacenamientos, avisos y consultas de precio; precio = máx(200 €, 1,30 €/km), identificadores fiscales y matrículas válidos por país y casos límite a propósito (textos, importes, fechas, horarios, flota, crédito, anclas del seguimiento). Con `p_clave_cuentas` crea cuentas `…@prueba.invalid` para entrar con cada rol (nunca Admin Master) y con `p_cuentas_reales` las del usuario (sus datos llegan como parámetro: nunca en el repositorio). Todo queda marcado (etiqueta `dato_de_prueba`, nota interna, `@prueba.invalid`); `borrar_datos_de_prueba()` lo quita entero con sus hitos y su auditoría (suelta el candado de solo-añadir solo dentro de su transacción). Tarda ~10–18 min en cargar: el coste está en los disparadores de las paradas. Prueba 156. |
| `20261106180000_listas_rapidas_con_volumen.sql` | **Lista de Envíos rápida con volumen** (64.000 envíos de prueba): `envios_pestanas` cuenta las pestañas en una sola pasada (3,5 s → 0,09 s) y `envios_pagina` filtra por columnas (0,5 s → 0,01 s), con los mismos totales e ids. Índices que faltaban: envíos sin camión por fecha de creación, por transportista, por día de carga, y los de las claves ajenas más consultadas (avisos, consultas de precio, vehículos y conductor del envío, reservas por transportista, conductores por nombre). |
| `20261106181000_listas_por_paginas.sql` | **Transportistas, Clientes y Sitios por páginas desde la base de datos** (con 20.000 transportistas la pantalla mandaba 22 MB y tardaba 18 s; ahora 90 KB y 0,3 s). Columna `texto_busqueda` en las tres tablas, mantenida sola por disparadores (también al cambiar sus contactos, vehículos o el cliente del sitio) con índice por trigramas; `transportistas_pagina`, `clientes_pagina` y `sitios_pagina` (texto, filtros, página y total; Dynamo ve todo, un cliente solo lo suyo); `transportistas_flota` y `envios_hechos_de` por lotes de ids; `buscar_transportistas` y `buscar_clientes` (12 coincidencias, más el ya elegido) para los buscadores de «Asignar», «Ofrecer» y la agenda de Sitios, que sustituyen a los desplegables de miles de opciones. Prueba 160. |
| `20261106190000_repaso_datos.sql` | **Repaso de datos** (cinco huecos vistos al montar los datos de prueba a volumen): (1) `normalizar_id_fiscal` quita el prefijo «ES» de los identificadores españoles («ESB01596360» = «B01596360»: la regla «un CIF solo una vez» ya los pilla; los de otros países no se tocan); (2) al migrar del Sheet los hitos creado / confirmado / transportista_asignado / cargado / entregado / cancelado llevan la fecha real de la fila, no la de la migración; (3) el tope de 4 puntos en la ruta lo impone la tabla `envio_paradas` (`tg_paradas_tope`), no solo las funciones; (4) una incidencia de Dynamo sobre un transportista no lleva cliente (si no, él no la veía); (5) fuera el índice GIN de `auditoria.cambios`, sin uso y de 191 MB con volumen. Prueba 161. |
| `20261106200000_datos_de_prueba_en_segundo_plano.sql` | **Carga de datos de prueba en segundo plano** (solo `dynamo-pruebas`): el SQL Editor corta a los ~60 s y `cargar_datos_de_prueba()` tarda 10-18 min. `programar_datos_de_prueba(confirmación, escala, clave, cuentas_reales)` deja el encargo en `datos_de_prueba_peticiones` y programa un reloj de pg_cron que lo ejecuta (`ejecutar_datos_de_prueba_pendientes`: candado para no solapar, sin tope de tiempo, guarda resultado o error, borra contraseña y cuentas de la fila, desprograma el reloj y hace `analyze`). `estado_datos_de_prueba()` dice en qué va. Todo solo consola; sin pg_cron carga en el acto. Prueba 162. |
| `20261106210000_datos_de_prueba_sin_tope.sql` | **Carga en segundo plano sin tope de tiempo**: las sesiones de pg_cron en Supabase llevan `statement_timeout` de 2 min y el `set_config` dentro de la función llegaba tarde (cada intento se cortaba a los 2 min, se deshacía y el reloj lo relanzaba: bucle). Ahora el comando del reloj quita el tope como sentencia aparte antes de llamar a la función (`reprogramar_reloj_datos_de_prueba`); `programar_datos_de_prueba` repone el reloj si ya hay encargo, y la migración reanuda sola un encargo pendiente. |
| `20261107120000_cuadro_mando_indice.sql` | **Cuadro de mando con índice por fecha efectiva** (preparado para volumen: 100 envíos/día son ~36.000 al año). Antes recorría todos los envíos no manuales en cada carga, porque la fecha que cuenta es un coalesce de cuatro columnas (carga real → prevista → primer día de ventana → día de creación) que ningún índice cubría. Ahora la columna `envios.fecha_efectiva` guarda ese coalesce, mantenida sola por `fn_envios_fecha_efectiva` (disparador `tg_envios_zzzzz_...`, corre el último para ver las fechas definitivas), con índice parcial `idx_envios_fecha_efectiva` (solo los de Dynamo). `cuadro_mando` acota la lectura a la ventana del periodo (más un año atrás para comparar) usando ese índice; los números son idénticos. Relleno inicial con `session_replication_role = replica` para no registrar cambios falsos. |
| `20261107130000_paginar_riesgos.sql` | **CESCE - Riesgos por páginas** (con miles de clientes la pantalla mandaba ~870 KB). `riesgos_pagina(texto, filtro, página, por_página)` reusa `riesgos_clientes` y devuelve solo la página ya buscada, filtrada (con/sin crédito, por encima del límite, 80 % usado, con riesgo) y ordenada por uso del límite, con el total; `riesgos_totales()` da los tres números de arriba (crédito concedido, riesgo asumido, clientes por encima del límite) sobre todos los clientes. Solo Dynamo. Prueba 163. |
| `20261107140000_paginar_usuarios.sql` | **Usuarios por páginas** (antes mandaba ~700 KB: todos los usuarios + todos los clientes + todos los transportistas para los desplegables). `usuarios_pagina(texto, rol, estado, página, por_página)` devuelve solo la página ya buscada y filtrada, con el nombre de la empresa de cada uno y el total; `usuarios_conteos()` da los contadores de los filtros de estado. El selector de empresa de la ficha / cambiar-rol / invitar pasa a ser un buscador (`buscar_clientes` / `buscar_transportistas`), así no hacen falta las listas enteras. Solo Dynamo. Prueba 164. |
| `20261108150000_revision_sin_aceptacion.sql` | **La revisión de precio se aplica sola, sin aceptación del cliente** (decisión del usuario 2026-11-08): si al revisar un precio provisional la subida supera el margen, el precio nuevo se aplica directamente (estado «hecha») y se avisa al cliente por la campana (email/WhatsApp cuando se conecten las notificaciones); puede cancelar sin coste mientras no haya camión asignado. Fuera `responder_subida_precio()` y el parámetro `precio_revision_respuesta_horas`; `revisar_precios_programados()` pierde el recordatorio «no contesta» y gana una red de seguridad que resuelve cualquier envío que quedara en «esperando_cliente» (p. ej. datos de prueba); los que hubiera se convierten en la propia migración. Prueba 129 actualizada (y la 114 adelanta la ventana de la regla 5 al terminar, que dejaba una trampa latente). |
| `20261108210000_filtros_envios.sql` | **Filtros de la lista de Envíos como el mockup** (usuario 2026-11-08): la barra gana Operador (`'dynamo'` = envíos sin operador, o un `operadores.id`), Creado por (`usuarios.id`), Estado (fase del envío o `veh:confirmada` / `veh:sin_asignar` del vehículo, solo en Programadas) y Fecha (hoy, mañana, semanas, mes) sobre `fecha_efectiva`. Para funcionar con paginación y volumen filtran EN la base de datos: `envios_pagina` y `buscar_envios_pagina` ganan parámetros opcionales (se quitan antes las firmas viejas para no dejar llamadas ambiguas); los contadores de las pestañas (`envios_pestanas`) siguen siendo globales, como el mockup. `buscar_envios_pagina` acepta ahora también solo-filtros (sin texto ni fechas), que usa la vista calendario. Prueba 165. |
| `20261108230000_campana_por_vista.sql` | **Campana y números del menú según la vista «Ver como»** (usuario 2026-11-08): con «Ver como» un cliente o un transportista, la campana («Por hacer» y su número) y los números del menú lateral enseñaban los contadores GLOBALES de Dynamo, no los de esa empresa (las Novedades ya iban filtradas por `mis_avisos`). `contadores_panel` gana `p_cliente` / `p_transportista` opcionales que solo atiende el equipo de Dynamo: devuelven los números QUE VERÍA esa empresa (misma forma que su rama, sin las altas); a un cliente o transportista se le ignoran. Se quita antes la firma vieja sin parámetros. Prueba 166. |
| `20261109000000_envio_manual_por_vista.sql` | **Envío manual también desde «Ver como» un cliente** (usuario 2026-11-08): el combo de operador de Nuevo envío (Dynamo por defecto o un transportista propio del cliente) sale ahora también en la vista de un cliente, y para que al elegir un operador propio el gestor pueda registrar ese envío manual en nombre del cliente, `crear_envio_manual` gana `p_cliente` opcional: solo lo atiende un gestor de Dynamo (`es_equipo_dynamo`, los roles de lectura no); a un cliente se le ignora y sigue creando solo lo suyo. Cuerpo vigente (el de «hoy es el día de Madrid») sin más cambios; se quita antes la firma vieja. Prueba 167. |
| `20261109010000_envio_cliente_con_precio.sql` | **Fuera las solicitudes de precio: el cliente crea el envío ya preciado** (usuario 2026-11-08): el tarifador es automático, así que el flujo «solicitud → Dynamo pone precio → aceptar/contraoferta» deja de aplicar. `crear_envio_cliente` crea el envío del cliente CON su precio (acotado a 0–100.000; cuando el tarifador viva en el servidor se calculará aquí) y nace programado (el previo pago decide crédito o pago). Las solicitudes vivas se convierten (futuras → programado con su precio o 700 €; pasadas → cancelado sin coste) y la tarea horaria gana esa misma red de seguridad y deja de pedir revisión a Dynamo: el precio provisional que llega a su fecha queda definitivo él solo. Las funciones del flujo viejo quedan sin uso (estrangulador), pendientes de una limpieza. Pruebas 129 (ajustada) y 168. |
| `20261109020000_ventana_desde_hoy.sql` | **La ventana puede empezar HOY mismo** (usuario 2026-11-08): con ventana de carga (completo 1 a 3 días · grupaje 1 a 4), el primer día puede ser hoy si se pide antes del corte (14:00 Madrid) y hoy es hábil; pasado el corte, el siguiente día hábil. Cuentan solo los días hábiles (sin sábados, domingos ni festivos nacionales). La fecha fija (y la ventana corta) siguen igual (corte 12:00, desde mañana). `primera_fecha_carga()` cambia la rama de ventana (vale al pedir y al pagar, cada uno con su hora de Parámetros) y `crear_envio_cliente` pasa su tope duro a «de hoy en adelante» para la ventana (fecha fija sigue desde mañana). La web (lib/fechasCarga.ts) hace lo mismo. Pruebas 149 y 151 ajustadas y 169 nueva. |
| `20261109030000_texto_cancelacion_revision.sql` | **Texto de la cancelación al revisar el precio** (usuario 2026-11-08): el aviso de subida decía «puedes cancelar sin coste mientras no tenga camión asignado»; el plazo sin coste real es **hasta las 9:00 del día hábil anterior a la carga**. Se corrige el texto en `revisar_precio_envio` y en la red de seguridad de `revisar_precios_programados` (solo el texto; la lógica no cambia). La pantalla dice lo mismo. Prueba 129 afinada (comprueba el texto del aviso). |
| `20261109040000_fuera_borradores.sql` | **Fuera el estado «borrador»** (usuario 2026-11-09: le salió un envío con la etiqueta «Borrador»): era el estado interno del flujo viejo de solicitudes y ya no debe verse nunca. La conversión del día 8 y la red horaria solo cubrían borradores CON estado de solicitud, y los datos de prueba generan algunos SIN él: la red de `revisar_precios_programados` pasa a convertir TODOS los borradores (futuros → programado con su precio o 700 €; el resto → cancelado sin coste) y la migración convierte los que quedaran. Prueba 170. |
| `20261109050000_plazo_pago_hasta_corte.sql` | **El plazo de pago = el corte de cancelar gratis** (usuario 2026-11-09): el límite para pagar un envío con pago previo pasa de «24 h desde que se pide» a las **9:00 del día hábil anterior al primer día de carga** (`corte_cancelacion`); sin pagar a esa hora, se anula solo (+45 min de gracia, como antes). Para envíos inminentes cuyo tope ya ha pasado al pedirse (o sin fecha) sigue el plazo corto de `pago_previo_horas` (24 h a día hábil). `pago_limite` gana el argumento `p_carga` y lo usan `caducar_pagos_pendientes` y `pagos_envio`. Fuera el botón «Ampliar el plazo» (pantalla). Prueba 171. |
| `20261109060000_nima_por_defecto.sql` | **NIMA por defecto del cliente** (usuario 2026-11-09): nueva preferencia `clientes.nima_por_defecto` (solo la edita Dynamo, en la ficha del cliente). Con ella activa, al crear envíos de ese cliente el conmutador «Requiere NIMA» nace encendido (se puede apagar en cada envío). `mi_empresa()` y `buscar_clientes()` la devuelven para que la pantalla la conozca (el cliente y el combo de cliente de Nuevo envío). Prueba 172. |
| `20261109070000_anticipos_por_paginas.sql` | **Anticipos de pronto pago por páginas** (usuario 2026-11-09: «si hay 500 anticipos… ¿paginamos?»): la ventana del Dashboard admin listaba TODOS los anticipos de la ventana incrustados en `pronto_pago_estado` (viajaban enteros en cada carga del dashboard). El estado pasa a devolver solo `anticipos_n` (la suma usado/disponible/activo no cambia, que es lo que usan las reglas) y nace `pronto_pago_anticipos(p_pagina, p_por_pagina)`: la lista con su total, solo Dynamo, paginada de 10 en 10 desde la pantalla. Prueba 61 ampliada. |
| `20261109080000_ofertar_con_precio_provisional.sql` | **El precio provisional ya no bloquea ofertar ni asignar** (usuario 2026-11-09: «no debe afectar a poder compartir enlace o crear oferta»): fuera el veto de crear ofertas (`fn_ofertas_precio_revision` y su trigger desaparecen) y el de asignar/publicar de `fn_envios_ab_precio_revision`. Al **asignar transportista**, el precio del cliente queda **definitivo** en ese momento (igual que al pagar); sin camión, todo sigue igual (la tarea horaria lo fija al llegar su fecha y el previo pago espera a la revisión). Pantallas y ayudas con el texto nuevo. Prueba 129 ajustada. |
| `20261109090000_buscador_identificacion_publica.sql` | **Buscador de identificación en la página pública de la carga** (usuario 2026-11-09: «hazlo como lo tiene el mockup»): `sugerencias_transportistas_publicas(p_reserva, p_q)` devuelve hasta 6 transportistas de Dynamo (nombre, CIF, población; los activos primero) que casan con lo escrito — nombre por palabras desde 2 letras, o CIF/NIF normalizado (sin «ES», guiones ni puntos), código de bolsa… Decisión consciente del usuario (expone nombre+CIF a quien tenga el enlace): por eso SOLO responde con una **reserva viva**, como el resto de funciones públicas; sin ella, ni una fila. Prueba 173. |
| `20261109100000_fotos_reservas_cmr.sql` | **Fotos en las reservas del CMR** (usuario 2026-11-09): al anotar reservas desde el enlace ya se abría sola la incidencia de siniestro crítica; ahora quien firma puede adjuntar fotos (cámara o galería). Se suben a la carpeta del enlace (misma política que los trazos: enlace vivo, máx. 20 ficheros) y `anotar_reservas_cmr_publico` gana `p_fotos`: solo rutas de ESE enlace, subidas de verdad, de imagen y ≤25 MB, máx. 6 — las cuelga de la incidencia Y del envío como `foto_incidencia`. Prueba 174. |
| `20261109110000_firmas_extra_cmr.sql` | **Firmas extra en el CMR** (usuario 2026-11-09): además de las casillas de siempre, desde el enlace se pueden añadir hasta **3 firmas extra** (se elige la casilla —recogida / transportista / entrega— y se firma con la pantalla normal, mismo valor probatorio). `firmas_cmr.extra` + el «una por casilla» pasa a índice parcial (solo principales, y cierra el hueco del NULL del transportista); `firmar_cmr_publico` gana `p_extra` (tope 3, `demasiadas_firmas`); `cmr_publico` devuelve `extra` para pintarlas aparte. Una firma extra no anota reservas (son de la casilla principal). Prueba 175. |
| `20261109120000_firma_cmr_avanza_seguimiento.sql` | **La firma del CMR ancla el seguimiento** (usuario 2026-11-09): cada firma PRINCIPAL ajusta la fase del envío a la hora real de la firma — remitente de la recogida p (y el transportista, que firma al recoger) → «en ruta» tras esa parada; destinatario de la ÚLTIMA entrega → **entregado**. Solo hacia delante, solo con camión (transportista u operador) y las firmas extra no mueven nada. Disparador `fn_firmas_seguimiento` sobre `firmas_cmr`: ancla `ancla_paso/ancla_hora`, deja el hito `etapa_corregida` (`por=firma_cmr`) y el automático sigue desde ahí. Prueba 176. |
| `20261109130000_parametros_precio_y_cortes.sql` | **Ajustes de parámetros** (usuario 2026-11-09): la revisión del precio provisional pasa de 3 a **7 días hábiles** antes de la carga (`precio_revision_dias_habiles`, editable; el disparador usa 7 también de respaldo); fuera `solicitud_validez_horas` (flujo de solicitudes retirado: solo lo leían sus funciones muertas, con 24 por defecto); y la descripción de `primer_dia_corte_ventana_hora` se pone al día (la ventana puede empezar HOY antes del corte; la lógica ya estaba bien). Prueba 84 ajustada (usaba el parámetro borrado como «parámetro normal» de ejemplo). |
| `20261109140000_email_firma_cmr_a_ficha.sql` | **El email de la firma del CMR, de la ficha y a la ficha** (usuario 2026-11-09): el campo Email de la pantalla de firma sale precargado con el del PRIMER contacto de la ficha — el del sitio de la parada, o el del transportista en la casilla 23 (`cmr_publico` devuelve `email` por parada y `transportista_email`). Y al revés: si la ficha no tenía ningún email y quien firma escribe el suyo, `firmar_cmr_publico` lo guarda en esa ficha (en su primer contacto, o en uno nuevo si no había); nunca pisa un email existente y un fallo guardándolo no tumba la firma. Prueba 177. |
| `20261109150000_canal_enlace_ofertas.sql` | **Ofertar = envío puntual a transportistas** (usuario 2026-11-09): fuera los selectores «Para: bolsa de cargas…» y «Por dónde se le manda» del modal Ofrecer envío — una oferta es un ENLACE que se manda puntualmente a un transportista (elegirlo es opcional; sin elegirlo, quien lo abre se identifica con su CIF al aceptar). El canal de las ofertas del panel pasa a ser `enlace` (añadido al check; los canales antiguos siguen valiendo para las ofertas guardadas y los avisos automáticos). Prueba 178. |
| `20261109160000_enlace_cmr_automatico.sql` | **El enlace del CMR nace con el envío** (usuario 2026-11-09): disparador en `envios` que crea el enlace de firma al nacer el envío vivo (o al salir de borrador) si no tiene uno vivo — los avisos automáticos se lo mandarán a las partes y la ficha enseña directamente los botones de compartir (el de «crear» queda solo para un enlace retirado o caducado, que no se recrea solo). Relleno para los envíos vivos existentes. Prueba 179; las pruebas 65/110/174/176/177 pasan a coger el enlace vivo en vez de insertarlo. |
| `20261109170000_enlace_cmr_indefinido.sql` | **El enlace del CMR vale indefinidamente** (usuario 2026-11-09): fuera la caducidad de 60 días y el botón «Retirar enlace» de la ficha — el enlace nace con el envío y se firma o consulta cuando toque, también meses después. `caduca_en` pasa a `infinity` (por defecto y en los vivos; la columna se queda por si un enlace concreto necesitara tope) y `revocado` queda como freno de emergencia desde la base de datos. Prueba 180. |
| `20261109180000_detalles_sitio_en_carga_aceptada.sql` | **La carga aceptada enseña la ficha completa de cada sitio** (usuario 2026-11-09): `carga_aceptada_publica` añade a cada parada el **horario de verano** (con sus fechas MM-DD, solo si está activo), **requiere_pin** (el del sitio o el del cliente) y el contacto pasa a ser el **primer contacto CON teléfono** (el principal por delante; antes, si el principal no tenía teléfono, no salía ninguno). La página pinta: horario, verano, cita previa, medios de carga, PIN, teléfono de contacto, referencia y notas. Prueba 181. |
| `20261109190000_oferta_enlace_automatica.sql` | **El enlace de compartir la carga nace con el envío** (usuario 2026-11-09): disparador en `envios` que crea sola la oferta ABIERTA con su enlace (canal `enlace`, precio del transportista, ±10 %, pronto pago) en cuanto el envío es ofertable (programado, sin transportista, pago previo no pendiente, con precio); si nace pendiente de pago o sin precio, el enlace llega al pagarse o al ponérselo, y si se des-asigna el camión vuelve a crearse. El **precio del enlace se mantiene al día** cuando cambia el del envío (sin pisar una reserva en marcha). No toca `estado_asignacion` ni deja hito; retro-fechados (datos de prueba) y manuales no entran. La oferta-enlace abierta deja de contar como «negociación en marcha» (la señal real es la reserva): `envio_asignandose` y el recomputo al quitar transportista la excluyen — el cliente puede seguir modificando su envío y, al des-asignar, vuelve a «sin asignar». El enlace vive al menos hasta pasada la carga. El modal «Ofrecer envío» reutiliza el enlace vivo (y puede crear otra oferta con otro precio). Prueba 182. |
| `20261109200000_cif_operador_opcional.sql` | **CIF opcional en el catálogo privado de transportistas** (usuario 2026-11-09): la agenda de operadores del cliente es informal — el CIF deja de ser obligatorio (BD, acción y pantalla); si se pone, sigue sin poder repetirse en el catálogo del cliente, y varios sin CIF no chocan (el índice único ignora los nulos, `normaliza_id_fiscal` es strict). En el alta, además: fuera los campos Web y Notas (los valores viejos se conservan), el aviso explica que sirve para centralizar la logística en un sitio y es gratis, y el logo se puede elegir YA al crear (se sube solo tras el alta). Prueba 183. |
| `20261109210000_corte_ventanas_descripcion.sql` | **Corte de las ventanas, descripciones al día** (usuario 2026-11-09): sin cambio de comportamiento en BD — `primera_fecha_carga()` ya trataba TODA ventana igual (hoy antes del corte si es hábil; después, el siguiente día hábil, nunca dos) — pero las descripciones de `primer_dia_corte_ventana_hora` y `primer_dia_corte_pago_ventana_hora` aún decían «siguiente; después, el otro». Se reescriben. En la web, además, la ventana corta de grupaje (1-2 días) usaba la regla de la fecha fija (corte 12:00 y +2 pasado el corte): corregida en `lib/fechasCarga.ts` y `AvisoCorte` (grupaje no lleva fecha fija). |
| `20261109220000_entrega_estimada_al_asignar.sql` | **Día de entrega (estimado) al asignar** (usuario 2026-11-09): `asignar_transportista()` gana `p_fecha_entrega_estimada` (firma nueva, la vieja se borra). En BD es opcional a propósito — la aceptación pública por enlace también asigna y no la manda (se conserva la que hubiera) —; la pantalla de asignación la exige (del mismo día de carga a +7 días hábiles) y nunca puede ser anterior al día en que carga (`entrega_antes_de_cargar`). Al QUITAR el transportista se limpia (`fn_envios_ac_asignacion` re-volcada). Siempre se enseña como ESTIMADA. Prueba 184. |
| `20261109240000_flota_publica.sql` | **Aceptar carga: flota de otras veces y contacto oculto** (usuario 2026-11-09): `flota_publica(p_reserva, p_cif)` — solo con reserva viva/aceptada y enlace vigente — devuelve lo ÚLTIMO usado por ese transportista en un envío (camión, remolque, chófer, teléfono: se autorrellena al identificarse), las listas de sus matrículas y chóferes conocidos (máx. 30) y su teléfono/email de ficha OCULTOS (tel sin 4 últimas cifras; email con **** delante de cada tramo), enmascarados en el servidor. Además `sugerencias_transportistas_publicas` sube el umbral: nombre desde 5 caracteres (antes 2); CIF/NIF y código de bolsa desde 4. Prueba 185. |
| `20261109250000_cliente_fechas_solo_validas.sql` | **El cliente nunca elige fechas fuera de reglas** (usuario 2026-11-09): `crear_envio_cliente` exige en BD lo mismo que la pantalla — desde y hasta en día hábil y nunca antes de `primera_fecha_carga()` según el tipo de fecha (ventana: hoy antes del corte; fija: siguiente hábil) — aunque alguien se salte la pantalla y llame a la acción directamente. `pedir_cambio_envio` ya lo exigía (prueba 149); elegir cualquier fecha queda solo para el Admin Master (`crear_envio`). Prueba 186; las 168/169 pasan a fechas siempre hábiles para correr cualquier día. |
| `20261109260000_entrega_estimada_sugerida.sql` | **Entrega estimada automática al asignar, pisable a mano** (usuario 2026-11-09): `seguimiento_calcular()` gana `p_dia` opcional (plan COMO SI se cargara ese día, sin tocar el envío; firma vieja borrada) y `entrega_estimada_sugerida(envio, dia)` devuelve la llegada a la ÚLTIMA parada de ese plan — con TODAS las reglas reales: tacógrafo (45 min cada 4 h 30, máx. 9 h/día, jornada 13 h, descanso 11 h, arranque 7:00), velocidad y minutos por parada de Parámetros, km entre paradas y apertura de los sitios (verano incluido). La ventana de asignación la preselecciona al elegir el día de carga (etiqueta «· sugerido»; si el admin ya puso otra a mano, no se pisa). Solo Dynamo. Prueba 187. |
| `20261110000000_cortes_ventana_por_tipo.sql` | **Hora de corte POR VENTANA, cada una en su parámetro** (usuario 2026-11-10): el corte único de ventana al pedir se desdobla en tres — `primer_dia_corte_ventana_1_3_hora` (1-3, carga completa; renombrado del antiguo `primer_dia_corte_ventana_hora` conservando el valor), `primer_dia_corte_ventana_1_2_hora` y `primer_dia_corte_ventana_1_4_hora` (grupaje), misma regla para todas (antes de su hora en día hábil puede empezar HOY; después, el siguiente hábil — nunca salta dos). `primera_fecha_carga()` gana `p_ventana_dias` (2/3/4; firma vieja borrada); `crear_envio_cliente` y `pedir_cambio_envio` pasan los días de SU ventana; `reglas_precio_envio()` devuelve las tres horas. Al pagar sigue un único corte de ventana. Prueba 188. |
| `20261110010000_corte_pago_unificado.sql` | **Al pagar y liberar rigen los MISMOS cortes que al pedir** (usuario 2026-11-10): fuera `primer_dia_corte_pago_fija_hora` y `primer_dia_corte_pago_ventana_hora`; `primera_fecha_carga()` pierde `p_al_pagar` (firma vieja borrada) y queda `(p_fija, p_instante, p_ventana_dias)`. El disparador `fn_envios_a0_fecha_al_pagar` pasa los días de SU ventana, y `crear_envio_cliente` y `pedir_cambio_envio` van a la firma nueva. Prueba 151 reescrita (y la 188 al día). |
| `20261110020000_mercancia_defecto_sitio.sql` | **Mercancía por defecto del sitio** (usuario 2026-11-10): columna opcional `sitios.mercancia_defecto`. Se edita en la ficha del sitio/almacén (plegada, como las notas internas) y, al elegir el sitio en Nuevo envío, prerrellena el «detalle de mercancía» de esa parada en el paso 4; lo que quede allí al crear el envío se guarda de vuelta en la ficha (vaciarlo lo borra; los almacenes de Dynamo no se tocan desde el envío). Sin prueba numerada: columna simple sin reglas. |
| `20261110030000_firmas_envio_extra.sql` | **`firmas_envio()` devuelve también `extra`** (usuario 2026-11-10): el CMR relleno gana una hoja «Registro de firmas» con TODAS las firmas del CMR digital (paradas intermedias y extras, que no caben en las casillas 22/23/24), y para separar la principal de cada casilla de las añadidas a mano la función devuelve la columna `extra` que ya existía en la tabla. Cambia el tipo de retorno → drop + create con los mismos permisos. Sin prueba numerada: solo añade una columna al retorno. |
| `20261110040000_gps_firma_cmr.sql` | **GPS en la firma del CMR** (usuario 2026-11-10): si quien firma da permiso de ubicación en el móvil, la firma guarda lat/lon/precisión junto a lo de siempre (hora del servidor, documento validado, IP, navegador, huella) — opcional: sin permiso la firma vale igual. `firmas_cmr` gana `lat`/`lon`/`gps_precision_m`; `firmar_cmr_publico` gana `p_lat`/`p_lon`/`p_gps_precision_m` (firma vieja borrada; el servidor descarta pares incompletos o fuera de rango) y `firmas_envio()` devuelve el GPS (firma vieja borrada, mismos permisos). Sale en la hoja «Registro de firmas» del CMR relleno. Sin prueba numerada: columnas opcionales sin reglas de negocio. |
| `20261110050000_gps_direccion_y_huella.sql` | **Dirección de la ubicación al firmar + huella en el registro** (usuario 2026-11-10): al pulsar «Aceptar firma» la página pide la ubicación VIVA (tomada en ese momento; se descarta cualquier posición de más de 40 minutos) y, con permiso, guarda también la dirección aproximada (geocodificado inverso de OSM) — `firmas_cmr.gps_direccion`, `firmar_cmr_publico` gana `p_gps_direccion` (firma vieja borrada; solo con coordenadas, 300 caracteres máx.). `firmas_envio()` devuelve además `gps_direccion` y la huella `sha256` de lo firmado (firma vieja borrada, mismos permisos), que el CMR relleno imprime en la hoja «Registro de firmas». Sin prueba numerada: columnas opcionales sin reglas de negocio. |
| `20261110060000_cambios_al_transportista.sql` | **Cambios de un envío a su transportista: propuesta + aceptar/rechazar** (usuario 2026-11-10): al modificar un envío CON transportista el cambio se aplica YA y se registra una propuesta (`envio_cambios_transportista`: precio antes/ahora, detalle, estado pendiente/aceptado/rechazado/reemplazado) con aviso al transportista. `proponer_cambio_transportista` (Dynamo; reemplaza la pendiente) y `responder_cambio_transportista` (el transportista, o Dynamo `en_nombre` tras llamarle): aceptar avisa a Dynamo; **rechazar DESASIGNA el envío automáticamente** (vuelve a «Asignando transportista») y avisa urgente. Trigger `tg_aviso_precio_cliente_cambiado`: si cambia el importe de un envío vivo, aviso al cliente con el antes → ahora. RLS: Dynamo todo, el transportista solo lo suyo; escrituras solo por funciones; en vivo y mantenimiento como el resto. Prueba 189. |
| `20261110070000_etapa_manual_hora_de_firma.sql` | **La etapa marcada a mano respeta la hora de la firma del CMR** (usuario 2026-11-10): marcar la etapa a mano sigue siendo libre (anterior o posterior, con firmas o sin ellas), pero si la etapa elegida es «parada p terminada» y esa parada tiene firma PRINCIPAL del CMR, la hora guardada es la de la firma (se ignora la escrita) — la parada «acaba de terminar» a su hora real. La firma del transportista cuenta como la de la 1.ª parada. `marcar_etapa_envio` devuelve además `hora_de_firma` y el hito `etapa_corregida` lleva `por=firma_cmr` y el rol. Prueba 190. |
| `20261110080000_solo_envios_confirmados.sql` | **Solo existen envíos confirmados** (usuario 2026-11-10: «no debe haber borradores; si no, se eliminan»): se ELIMINA `crear_solicitud_envio` (el flujo antiguo de pedir precio sin precio, sin pantalla en la web pero aún abierto por API) y los borradores que queden pasan a `cancelado` sin coste (el borrado físico es imposible a propósito: `envio_hitos` es inmutable como garantía antimanipulación; cancelados no salen en ninguna lista). «borrador» queda solo como estado transitorio dentro de la transacción de `crear_envio_cliente` (para el par de hitos creado + confirmado). Prueba 72 reescrita (siembra directa + comprueba que la función ya no existe). |
| `20261110090000_nombre_fotos_reserva.sql` | **Nombre claro para las fotos de las reservas del CMR** (usuario 2026-11-10): las fotos que llegan con una reserva se guardaban como «foto-<uuid>.jpg», que en la sección Documentos no dice nada; `anotar_reservas_cmr_publico` ahora las nombra «Reserva - <cargador\|conductor\|destinatario> · <fecha y hora de Madrid>», con «(2)», «(3)»… si llegan varias y la extensión original. Solo cambia `nombre_archivo`: validaciones, límites y permisos quedan como en 20261109100000. Sin prueba numerada: solo cambia un texto. |
| `20261110100000_firmar_requiere_transportista.sql` | **Sin transportista asignado no se firma el CMR** (usuario 2026-11-10: «si no hay transportista no se puede estar cargando»): `firmar_cmr_publico` devuelve `sin_transportista` mientras el envío no tenga transportista; al asignarlo (o reasignar OTRO tras quitarlo) las firmas se reanudan y las hechas se conservan. En envíos manuales no aplica (el porteador es el operador del cliente). La página pública bloquea los botones Firmar con el aviso. Prueba 191. |
| `20261110110000_quitar_transportista_limpia.sql` | **Limpieza de envíos huérfanos del transportista que se fue** (usuario 2026-11-10: «¿por qué pone Transportista asignado el… si no tiene?»): desde el 2026-11-09 los triggers ya limpian al quitar el transportista (fn_envios_ac_asignacion lo suyo —camión, conductor, NIMA, precio y fechas— y fn_envios_hitos el `asignado_en`), pero quedaban filas de ANTES de esos triggers (o importadas con el flag de migración) con los datos del que se fue. Arreglo de datos de una vez: en envíos sin transportista, no manuales y no entregados/cancelados que aún tenían `asignado_en`, se dejan en nada matrículas, conductor y teléfono, NIMA, vehículos y conductor de flota, precio, día previsto, entrega estimada y ancla, y `estado_asignacion` deja de decir «confirmada». No toca funciones ni triggers. Cubierto en la prueba 191. |
| `20261110120000_ofertar_actualiza_coste_previsto.sql` | **Ofertar con otro precio actualiza el coste previsto** (usuario 2026-11-10: «cuando oferto con otro precio no cambia el precio transportista»): `ofertar_envio` deja el precio ofertado en `importe_transportista` (el margen, columna generada, se recalcula solo). Seguro porque la función ya rechaza envíos con transportista confirmado, así que nunca pisa un precio pactado; con varias ofertas vivas vale la última. Cubierto en la prueba 11. |
| `20261111090000_orden_por_enlace_cmr.sql` | **Orden de carga por el enlace del e-CMR sin clave de servicio** (usuario 2026-11-11: «No funciona abrir PDF o compartir»): la descarga pública `/cmr/<token>/orden` leía con la clave de servicio del servidor y, donde no está configurada (la preview de Vercel), moría con «La plataforma no está conectada». Nueva `datos_orden_por_cmr(p_token)` SECURITY DEFINER para la clave pública: valida el token vivo de `cmr_enlaces` y aplica las mismas reglas que la ruta (ni revocados/caducados, ni cancelados, ni manuales, ni sin transportista); devuelve `orden_carga_json` más `transportista_id` (la clave de las copias con precio). Prueba 192. |
| `20261111120000_asistente_ia.sql` | **Asistente de IA sobre la base de datos, fase 1 (solo Dynamo)** (usuario 2026-11-11): chat del panel que responde preguntas sobre los datos con el motor de Claude. `ia_consulta_sql(p_sql)` SECURITY INVOKER ejecuta UNA consulta de lectura (SELECT/WITH, sin «;») con los permisos y la seguridad por filas de quien llama —no amplía ningún acceso—, pasa la transacción a solo lectura (una escritura en un CTE muere) y devuelve máx. 200 filas en JSON; solo equipo Dynamo. Tabla `ia_consultas`: auditoría inmutable de cada pregunta (quién, pregunta, respuesta, consultas ejecutadas, tokens), visible y escribible solo por el equipo. Prueba 193. |
| `20261111130000_reservas_en_vivo.sql` | **Las reservas del CMR mandan señal en vivo** (usuario 2026-11-11: «subo una reserva con foto y no se actualiza; debe ser instantáneo»): `cmr_reservas` nació el 9-nov, después de la lista de tablas de la plataforma en vivo, y quedó sin disparadores de señal (la foto y la incidencia sí avisaban; la reserva no). Se le ponen los tres (modo «envio»). Prueba 194: barrido de TODAS las tablas con `envio_id` para que ninguna tabla futura se quede muda. |
| `20261111140000_firma_manda_en_seguimiento.sql` | **La parada firmada más avanzada manda en el seguimiento** (usuario 2026-11-11: «si firma es de parada anterior a otra posterior firmada, no cambia el seguimiento a una parada anterior; se queda con la última»): `fn_firmas_seguimiento` ancla ahora a la parada firmada MÁS AVANZADA de todo el envío (no solo la recién firmada), a la hora de la firma de esa parada — así la firma olvidada de una recogida, llegada tarde (incluso tras una marca a mano hacia atrás, que sigue siendo libre), nunca retrocede nada, y con la última entrega firmada el envío queda ENTREGADO. `etapas_envio` gana la columna `firma`: si la etapa marcada la fijó una firma del CMR, y la ficha lo enseña como «la fija la firma del CMR» en vez de «marcada a mano». Prueba 195. |
| `20261111150000_cmr_pdf_por_enlace.sql` | **PDF del e-CMR por su enlace sin clave de servicio** (usuario 2026-11-11: «error abrir cmr» en la preview): `/cmr/<token>/pdf` leía con la clave de servicio y moría con «La plataforma no está conectada» donde no está configurada — el mismo fallo que la orden, arreglado igual. `datos_cmr_por_token(p_token)` SECURITY DEFINER para la clave pública: valida el token vivo y devuelve envío (lista blanca, sin importes), cliente, porteador u operador, paradas, firmas con el documento enmascarado (•••1234), reservas, la fecha del enlace y los datos de Dynamo. Los TRAZOS no pueden salir del almacén con la clave pública (listar revelaría rutas y tokens; pruebas 135/140): el PNG se guarda también en la PROPIA FILA (`firmas_cmr.trazo_png`, lo escribe `firmar_cmr_publico`, que gana `p_trazo_png`) y el JSON lo devuelve en base64 — la página de firmas y el PDF lo incrustan de ahí; las firmas anteriores salen sin dibujo donde no hay clave de servicio. Prueba 196. |
| `20261111160000_mi_uso_autosuspension.sql` | **«Uso de Dynamo»: el cliente ve lo que lleva contra las reglas de suspensión** (usuario 2026-11-11: el texto legal de Nuevo envío decía «3 cancelaciones en los últimos 10 envíos» a pelo, desincronizado de Parámetros): `mi_autosuspension()` devuelve al PROPIO cliente (auth.uid()) sus contadores con los MISMOS recuentos que `autosuspension_motivos` —consultas de precio de hoy/7/30 días con su límite (personal si lo tiene) y cancelaciones con coste sobre sus envíos y recientes— más los límites vivos y si las reglas le aplican. La usan la pantalla «Uso de Dynamo» del menú del cliente (barras de uso) y el aviso legal de Nuevo envío. Para cuentas que no son de cliente, null. Prueba 197. |
| `20261111170000_uso_clientes_y_ver_como.sql` | **Uso de Dynamo para el equipo: «Ver como» cliente y columnas en la lista** (usuario 2026-11-11: «la página Uso debe salirme entrando como admin con Ver como un cliente concreto» + «en lista clientes poner columnas de usos y poder ordenar»): `mi_autosuspension` gana `p_cliente` — el equipo (también solo lectura) ve los contadores del TITULAR de esa empresa, los mismos que ve él; para el cliente el parámetro se ignora y sigue viendo solo lo suyo. Nueva `uso_clientes(p_ids)`: contadores por cliente para la lista (consultas hoy/7/30 días, envíos, cancelaciones con coste, usuarios suspendidos), sumando los usuarios de la empresa desde su marca `autosuspension_desde_en` — la que el disparador `fn_usuarios_aa_autosusp` pone sola al reactivar, por eso un reactivado sale a 0 y no se vuelve a suspender al instante. `clientes_pagina` gana `p_orden` (consultas | canceladas) para ordenar la lista por uso. Prueba 198. |
| `20261111180000_reanclar_firmas_viejas.sql` | **Reanclar el seguimiento de los envíos firmados ANTES del disparador del 11-nov** (usuario 2026-11-11: «¿por qué todo firmado sale aún en ruta?»): el disparador «la parada firmada más avanzada manda» solo actúa al LLEGAR una firma, así que los envíos con todas sus firmas de antes (o de minutos antes de aplicarse la migración) se quedaron anclados donde los dejó el disparador viejo. Nueva `reanclar_seguimiento_firmas()` (solo Dynamo o servidor): recorre los envíos vivos con firmas y camión, aplica la MISMA regla del disparador y solo adelanta (con la última entrega firmada → ENTREGADO); hito `etapa_corregida` con `por=firma_cmr` y seguimiento aplicado. Se ejecuta una vez en la migración y queda disponible por si hiciera falta. Prueba 199. |
| `20261111190000_matriculas_al_firmar.sql` | **Matrículas al firmar el eCMR** (usuario 2026-11-11: «el DeCA debe estar generado antes de salir de la 1.ª parada; no se puede ir con mercancía sin poner matrículas»): en la firma PRINCIPAL del transportista o del cargador de la 1.ª parada (da igual quién firme antes), las matrículas se piden si el envío no las tiene (`faltan_matriculas`; salvo manuales), se muestran para verificar y se pueden corregir (`p_matricula_camion`, `p_matricula_remolque` en `firmar_cmr_publico`); en las demás casillas y en las firmas extra el parámetro se ignora — el envío ya está en tránsito. Con la matrícula puesta, el QR del DeCA se activa solo. `cmr_publico` devuelve `matricula_camion` y `matricula_remolque` por separado para precargar la ventana de firma. Prueba 200 (y los envíos de las pruebas 59/65, 135, 176, 177 y 195 ganan matrícula en su siembra, como en la realidad). |
| `20261111200000_limite_envios_diario.sql` | el límite individual de envíos al día (usuarios.limite_envios_diario) se aplica DE VERDAD: regla 6 de la suspensión automática (el envío que pasa del límite se crea y la cuenta cae al momento; vacío = sin tope, sin parámetro general), con disparador al crear un envío efectivo o salir de borrador | ✅ listo |
| `20261111210000_preaviso_envios_dia.sql` | `mi_autosuspension` gana `envios_dia` {hoy, max_hoy} (límite individual de la regla 6; null = sin tope), para el pre-aviso ámbar del panel al 80 % del cupo del día (consultas y envíos) y la fila «Envíos creados» de la página Uso | ✅ listo |
| `20261112020000_emails_operativos.sql` | emails operativos, fase 1: tabla `emails_enviados` (cola y registro con clave única anti-duplicados, solo lectura Dynamo), `encolar_avisos_operativos()` (matrículas a ≤2 h de la carga con enlace del CMR · recordatorio de víspera a partir de las 17:00), `enviar_emails_pendientes()` por Postmark con pg_net + Vault (secreto `postmark_token`; sin ellos, no-op), tarea pg_cron cada 10 min y parámetro `url_plataforma` | ✅ listo |
| `20261112030000_activar_pg_net.sql` | enciende la extensión pg_net en Supabase (apagada de fábrica), con la que enviar_emails_pendientes() llama a la API de Postmark; en el PostgreSQL local no existe y se omite | ✅ listo |
| `20261112040000_fecha_carga_real_por_firma.sql` | la PRIMERA firma de casilla del cargador o del transportista fija `envios.fecha_carga_real` con la fecha de la firma (Madrid) — si el camión carga tarde, el CMR y el programa enseñan la fecha real solos; la firma del destinatario y las extra no la fijan nunca | ✅ listo |
| `20261112050000_tope_ficheros_enlace_cmr.sql` | el tope anti-abuso de ficheros por carpeta `cmr/<llave>/` sube de 20 a 60: los reintentos de firma dejan trazos huérfanos que también cuentan y 20 se llenaba en una tarde de pruebas — al llenarse, TODA subida se rechazaba y la firma ya no se podía guardar | ✅ listo |
| `20261112060000_conductor_del_envio_al_firmar.sql` | al firmar la casilla principal del transportista, el firmante pasa a ser el conductor del envío si su documento no es el anotado (nombre y ficha, vinculada o creada), igual que las matrículas pisan a las del programa; con el mismo documento no se toca nada y la ficha sin documento se completa si el nombre coincide | ✅ listo |
| `20261112070000_notas_sitio_en_ficha_cliente.sql` | `paradas_json` (lo que ve el cliente en mis_envios / mis_envios_por_ids) gana `notas_sitio`: las indicaciones fijas de la ficha del sitio («cargar siempre por el muelle 10»…), leídas en vivo — ya las veían el transportista y Dynamo, faltaba el cliente | ✅ listo |
| `20261112080000_oferta_escalonada.sql` | oferta escalonada por email: tabla `difusiones`, `iniciar_difusion()`/`parar_difusion()` (Dynamo), `procesar_difusiones()` con pg_cron cada minuto — un email cada N minutos (parámetro) a un transportista cada vez, por ranking interno (favoritos → quien hizo esa ruta → valoración → antigüedad), con el enlace público de aceptar carga; para en seco al asignarse transportista, a mano o al tope (parámetro), y entonces avisa a Dynamo por campana y email | ✅ listo |
| `20261112090000_borrar_transportistas.sql` | borrado lógico de transportistas: `borrar_transportista()` (equipo gestor; con envíos en marcha no deja), fuera de la lista y del buscador, ofertas vivas caducadas y un disparador que corta cualquier oferta nueva a un borrado; de paso, columna `reparto_urbano` (reparto urbano con camión pequeño) para la ficha | ✅ listo |
| `20261112100000_oferta_escalonada.sql` | Oferta escalonada por email: tabla `difusiones`, parámetros (cadencia, tope, ventana 5-23 h), `fn_difusion_paso`/`procesar_difusiones` (cron cada minuto) e `iniciar_difusion`/`parar_difusion`; `emails_enviados` admite `difusion`/`difusion_fin`. |
| `20261112110000_limpieza_solicitudes_precio.sql` | Limpieza: fuera `proponer_precio_solicitud`, `responder_precio_solicitud` y `contraofertar_precio_solicitud` (flujo viejo de solicitudes, retirado el 2026-11-08); se conservan `mi_contraoferta`, `resolver_contraoferta_cliente`, los interruptores y la columna `estado_solicitud` (histórico). |
| `20261113090000_bienvenida_en_reglas.sql` | `reglas_precio_envio()` devuelve también `bienvenida_pct` (parámetro `factor_bienvenida_pct`): el descuento de bienvenida que la pantalla de Nuevo envío aplica al calcular un precio SIN cliente elegido (quien llama a preguntar; el mismo del futuro tarifador público). |
