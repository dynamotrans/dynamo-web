# SUPABASE — esquema de la plataforma Dynamo

> Documento de trabajo. Punto de partida: las tablas REALES que el usuario ya tiene montadas en
> Google Sheets. Objetivo: pasar de esas hojas a un esquema Postgres sano en Supabase.
>
> **Leído el 2026-10-06 por MCP de Google Drive** (no es una suposición, son las columnas reales):
> - `IA-DYNAMO-2030` — ID `11hUKWFHu0cirk-IAGIiVPETFxwt5_Lo4QAHmYlUtO8o` — 14 hojas
> - `DYNAMO-GX-INDEX` — **FUERA DE ALCANCE** (decisión del usuario 2026-10-07: es para facturas, no tiene nada que ver con la futura plataforma). Solo se usa `IA-DYNAMO-2030`.
>
> Reglas que manda este esquema: **regla 12 de CLAUDE.md** (fecha y hora + auditoría en TODO),
> **regla 10** (altas sin duplicados) y el pendiente 🔥 de **Holded 1:1**.

---

## 0. INVENTARIO de lo que hay hoy en el Sheet

| Hoja | Columnas | Qué es | Destino en Supabase |
|---|---|---|---|
| `dy_dashboard_hoja` | — (vacía) | Vista/panel | Vistas SQL, no tabla |
| `dy_cargas_hoja` | **123** (A→DS) | El envío. El corazón de todo | `envios` + `envio_puntos` + `envio_hitos` |
| `dy_ticket_hoja` | 17 | Incidencias / tickets | `tickets` |
| `dy_lugar` | 18 | Catálogo de sitios | `lugares` + `lugar_contactos` |
| `dy_lugar_anotaciones_cliente` | 5 | Notas privadas de un cliente sobre un sitio | `lugar_notas_cliente` |
| `dy_clientes_hoja` | 44 | Clientes | `clientes` + `contactos` |
| `dy_transportistas_hoja` | 34 | Transportistas | `transportistas` + `contactos` |
| `dy_contactos_clientes_transportistas_hoja` | 13 | Usuarios de acceso al portal | `usuarios` (Supabase Auth) + `contactos` |
| `dy_holded_pedido_venta` | 33 | **Plantilla de import de Holded (venta)** | Vista de exportación |
| `dy_holded_pedido_compra` | 34 | **Plantilla de import de Holded (compra)** | Vista de exportación |
| `dy_fichero_wtransnet` | 29 | Plantilla de subida a Wtransnet | Vista de exportación |
| `dy_cmr_auto` | — (vacía) | CMR | Se genera; `documentos` |
| `dy_bbdd_auxiliar` | 10 | Tabla ml→Tn→palés, precio diésel, diccionario | `parametros` |
| `dy_polos_capitalyciudadesindustriales` | 10 | **Copia idéntica de la anterior** (sin rellenar) | Descartar una de las dos |

**Hoja aparte** — `DYNAMO-GX-INDEX` (9 col): `GX2REF · FECHA CARGA · CIF PROVEEDOR · PROVEEDOR-NAME ·
MATRICULAS AUTORIZADAS · EMAIL PROVEEDOR · ORIGEN · DESTINO · IMPORTE PROVEEDOR`.
No es una tabla nueva: es una **vista materializada** de `dy_cargas_hoja` para que n8n/el CMR
lean rápido. En Supabase desaparece como fichero: es un `SELECT` sobre `envios`.

### ⭐ DESBLOQUEADO: la plantilla de Holded ya la tengo

El pendiente 🔥 de `TODO.md` decía que antes de fijar el esquema había que **descargar la plantilla
real de importación de Holded**. Ya no hace falta pedirla: está en el propio Sheet, en
`dy_holded_pedido_venta` y `dy_holded_pedido_compra`, con los nombres de columna exactos de Holded:

```
ESTADO VIAJE | EN HOLDED? | FACTURADO? | ALB REC? | PLAZO PAGO |
Num Pedido (referencia_gx_carga) | Formato de numeración | Fecha dd/mm/yyyy |
Fecha de vencimiento dd/mm/yyyy | Descripción | Nombre del contacto | NIF |
Dirección | Población | Código postal | Provincia | País | Concepto |
Descripción del producto | SKU | Precio unidad | Unidades | [Unidades recibidas (solo compra)] |
Descuento % | IVA % | Retención % | Rec. de eq. % | Operación | Forma de pago (ID) |
Tags separados por - | Nombre canal de venta | Cuenta canal de venta | Moneda | Cambio de moneda
```

**Consecuencia para el esquema**: `clientes` y `transportistas` tienen que poder rellenar esas
columnas sin inventarse nada. Lo que eso exige y hoy NO está en el Sheet:
`forma_pago_holded_id`, `cuenta_contable`, `rec_equivalencia_porcentaje`, `moneda`,
`pais_codigo_iso` (hoy el país va como texto libre), `descuento_porcentaje`.
Los 4 campos de control (`EN HOLDED?`, `FACTURADO?`, `ALB REC?`, `ESTADO VIAJE`) **sí** van en
`envios` como banderas de sincronización.

---

## 0-bis. EL DICCIONARIO (`validaciones_descripcion`): qué dice y qué falta

La plantilla de documentación está montada en las filas 2-6 de cada pestaña, con esta leyenda:

| Fila | Para qué es | Valores que admite |
|---|---|---|
| 2 | **Formato** | `texto \| alfanumerico \| longitud_fija: 11`, `fecha \| ISO-8601`, `boolenano (1/0)`, `numero \| >0 <6000`, `%`, `regex_email \| max_length:80`, `lista_controlada` |
| 3 | **Rango de valores o fechas** | p. ej. `incremento = +7 respecto a la referencia anterior`, `1-0`, `60` |
| 4 | **Lista de elementos posibles** | o `lista: no aplica` |
| 5 | **Valor obligatorio** | `obligatorio` / `opcional` / `automatico` |
| 6 | **Descripción** | notas aclaratorias + ejemplo OK y ejemplo mal |

⚠️ **Está empezada, no cumplimentada.** La leyenda existe y unas cuantas columnas de
`dy_cargas_hoja`, `dy_ticket_hoja` y `dy_clientes_hoja` tienen valores, pero la gran mayoría de las
~250 columnas del libro están en blanco en esas filas. **No es un problema**: el sitio natural de
esa documentación es el propio Postgres (`COMMENT ON COLUMN` + `CHECK`), y la vamos rellenando al
escribir el DDL, que es donde además *se cumple* en vez de solo estar escrita.

⚠️ **Limitación técnica encontrada**: el libro **no se puede exportar completo** (Drive devuelve
"File too large" por las ~30.000 filas formateadas de `dy_cargas_hoja`). Se lee por trozos. Para
futuras lecturas conviene borrar el formato de las filas vacías, o trabajar sobre una copia
recortada.

### Lo que SÍ está escrito y es oro (reglas de negocio que no estaban en ningún otro sitio)

**1. La referencia GX — formato real**
```
formato: texto | alfanumerico | longitud_fija: 11
rango: debe seguir el patrón GX + numero largo ; incremento = +7 respecto a la referencia anterior
obligatorio (unicidad requerida)
descripcion: identificador unico de la carga. Formato: GX + numero correlativo largo.
El primer referencia de carga comenzó en el GX100888689.
El incremento entre una referencia y la siguiente es SIEMPRE +7.
```
- **11 caracteres fijos**: `GX` + 9 dígitos. ⚠️ El mockup usa `#GX######` (GX + 6 dígitos = 8
  caracteres). **No coincide con el formato real** → hay que igualar el mockup.
- El **+7** hay que implementarlo como secuencia propia: `CREATE SEQUENCE gx_seq START 100888689
  INCREMENT BY 7;` y la referencia como columna generada. **Nunca** `MAX(ref)+7` desde la
  aplicación: con dos envíos a la vez, los dos leen el mismo máximo y colisionan.
- ⚠️ **Nota de seguridad**: un correlativo de paso fijo es **enumerable**. Si el GX viaja en la URL
  pública de `aceptar-carga.html?e=GX…` (decisión del 2026-07-20: una sola URL por envío, sin
  token), adivinar cargas ajenas es trivial: 1 de cada 7 números acierta. Si esa URL se mantiene
  sin token, el enlace debe llevar **además** un identificador aleatorio (`uuid` o token corto),
  no el GX. El GX se queda para la operativa y la facturación.

**2. Los IDs de las demás tablas llevan prefijo**
`cliente_id` → `C-10000`, `C-10001`, `C-10002` · `id_lugar` → `L-10000` ·
`dy_lugar_anotaciones_cliente.id_lugar` → `LA-10000`.
Mismo patrón previsible para transportistas y contactos. Se mantiene: es legible por humanos y sirve
para hablar por teléfono ("el cliente C-10042"). En Postgres: `id uuid` interno **+** `codigo text
UNIQUE` generado con su prefijo y secuencia. Las dos cosas (el uuid para las FK, el código para la
gente).

**3. `ticket_tipo` — la lista completa**
`incidencia transporte` · `cancelación transporte` · `cambio fecha/hora carga` ·
`facturación consulta` · `pago consulta` → `enum`.

**4. `tipo_de_lugar` — la lista**
`ALMACÉN` · `OBRA` · `EVENTO` · `FINCA` · … (el panel añade *Nave* y *Zona urbana*; hay que cerrar
la lista única, porque de ella cuelgan los recargos del tarifador: Obra +5%, Zona urbana +20%,
Evento +15%, Finca +25%).

**5. `cliente_factor_tarifa` — rango ±3%**
> *"si admite precios superior o inferior poder ajustar segun tipologia cliente: **+-3%**"*

⚠️ **Choca con el panel**, donde el slider va de **−30 a +30** con default **−7%** (captación).
Hay que decidir cuál manda antes de poner el `CHECK`. Mi lectura: el ±3% era el ajuste fino
original y el −30/+30 es lo que de verdad usas hoy → el `CHECK` debería ser `BETWEEN -30 AND 30`,
pero lo confirmas tú.

**6. `cliente_recargo_pago_tarde` (%)**
> *"si paga muy tarde aplicar recargo %"* — recargo por cliente moroso. **No está en el panel**:
hay que añadirlo a la ficha de cliente.

**7. `cliente_negociar_tarifa` (1/0) — regla de texto condicional**
> *"El cliente puede ofrecer otro precio diferente y en ese caso, si está apto para contraofertar
> con el booleano 1/0 activado con 1, entonces se le pone coletilla al precio de: «En caso que la
> tarifa no le encaje, contraoferte su tarifa objetivo, pero no aseguramos tener disponibilidad».
> En caso que el booleano sea 0, no se le pone la coletilla."*

Es una regla de negocio completa que **no está implementada en el mockup**. Va a `clientes` como
`permite_contraoferta boolean` y la coletilla a la tabla `plantillas`.

**8. `cliente_plazo_vencimientos` = 60**
60 días por defecto, con la nota *"nombrar varios para seleccionar"* → lista cerrada
(`0 / 30 / 60 / 90`), que es lo que ya hace el panel (0/30/60).

**9. Las columnas `MAIL_COMERCIAL_*` confirmadas como documento renderizado**
Dentro llevan el encabezado `DYNAMO OPERADOR LOGISTICO S.L. | www.dynamotrans.com` y
`🚛 Detalles del Envío`. Son el email ya montado → tabla `plantillas`, no columna por envío.

---

## 1. LO QUE SOBRA (no se guarda: se calcula o se une)

Nada de esto es un error tuyo — es lo que Sheets te **obliga** a hacer porque no tiene JOIN.
En Postgres desaparece solo.

### 1.1 Las columnas `*_concatenar` → fuera, son un JOIN

`cliente_concatenar`, `transportista_concatenar`, `lugar_concatenar`,
`contacto_cliente_concatenar`, `cliente_asociado_concatenar`, `recogida_direccion_concatenar`,
`parada_1..4_direccion_concatenar`, `entrega_direccion_concatenar`.

Son la clave de texto para el `BUSCARV`. En Postgres se enlaza por `cliente_id` / `lugar_id`
y el nombre sale del JOIN. **Por qué importa de verdad**: hoy, si renombras
`"TRANSPORTES LINAREJOS, S.L."` a `"LINAREJOS SL"`, se rompe el enlace de los 8 envíos que
tiene. Con FK no se rompe nunca.

### 1.2 `validaciones_descripcion` → fuera, se vuelve el tipo de la columna

Esa columna documenta el formato (`regex:^\+34\d{9}$`, `max_length:500`, `numero | >0 <6000`,
`boolenano (1/0)`, `lista_controlada`, `fecha | ISO-8601`). **Está muy bien pensada** y la voy a
aprovechar: cada una se convierte en el tipo + `CHECK` + `COMMENT ON COLUMN` del DDL. Ejemplos:

| Lo que pone hoy | Lo que será en Postgres |
|---|---|
| `boolenano (1/0)` | `boolean` |
| `fecha \| ISO-8601` | `date` / `timestamptz` |
| `numero \| >0 <6000` | `numeric CHECK (km > 0 AND km < 6000)` |
| `max_length:500` | `varchar(500)` |
| `regex_email \| max_length:80` | `citext CHECK (email ~ '...')` |
| `lista_controlada` | `enum` o FK a tabla de catálogo |
| `regex:^\+34\d{9}$` | ⚠️ **hay que relajarlo**: tienes transportistas de PL, IT, PT y conductores extranjeros. Ese regex los rechaza. → `varchar(20) CHECK (telefono ~ '^\+?[0-9]{6,15}$')` |

### 1.3 Agregados y calculados → vista, no columna

- `margen_porcentaje`, `margen_euros` → se derivan de `importe_cliente − importe_transportista`.
  Columna **generada** (`GENERATED ALWAYS AS`), nunca guardada a mano.
- `km_total` → suma de `km_0_1 … km_5_6`. Generada.
- `combustible_litros`, `combustible_euros` → km × consumo × €/l. Calculado.
- `cliente_numero_viajes`, `cliente_km_recorridos`, `cliente_numero_transportes`,
  `cliente_ratio_incidencias`, `cliente_numero_paraliazaciones`, `cliente_numero_cancelaciones`,
  `transportista_numero_transportes`, `transportista_ratio_incidencias`,
  `transportista_numero_incidencias` → **todos** son `COUNT`/`AVG` sobre `envios`.
  Vista materializada que se refresca; **no** columnas que haya que mantener.
  Motivo: una columna de contador que nadie actualiza **miente**, y miente justo cuando la usas
  para decidir si ofreces carga a alguien.
- ⚠️ **Duplicado detectado**: `cliente_numero_viajes` y `cliente_numero_transportes` son lo mismo.

### 1.4 Textos de integración y plantillas → fuera de la tabla de envíos

- `MAIL_COMERCIAL_recogida_direccion…` y sus 5 hermanas (`parada_1..4`, `entrega`) → son **el
  cuerpo del email** ("🚛 AVISO DE LLEGADA DE TRANSPORTE…"). Eso es una **plantilla**, no un dato
  del envío. Van a una tabla `plantillas` y se renderizan al enviar. Si las guardas por envío son
  **6 textos largos × 30.000 filas** de basura duplicada.
- `trigger_n8n_peticion`, `gemini_peticion_formateada`, `wt_oferta`, `cliente_ppto`,
  `transportista_oferta`, `proforma_texto` → payloads de integración y documentos generados.
  Van a `integraciones_log` (con su `jsonb`) o se generan al vuelo. No engordan `envios`.
- `wt_publicado`, `pedido_venta_holded`, `pedido_compra_holded` → **estos SÍ se quedan**: son el
  estado de sincronización y la referencia externa. Imprescindibles.

### 1.5 Defaults del cliente copiados en el envío

`tipo_carga_defecto`, `tipo_mercancia_defecto`, `valor_mercancia_defecto` dentro de `dy_cargas_hoja`
son los valores por defecto del cliente arrastrados a la fila. El default vive en `clientes`;
en el envío solo el **valor final aplicado**. (Ojo: no confundir con el punto 4, snapshot.)

---

## 2. LO QUE FALTA

### 2.1 Las claves. Lo más importante de todo

No hay **ni un solo id** de relación en `dy_cargas_hoja`. Todo enlaza por texto concatenado.
Hay que añadir: `cliente_id`, `transportista_id`, `lugar_id` (en cada punto), `usuario_id`
(quién creó el envío). Con `UNIQUE` sobre `cliente.cif` y `transportista.cif` — que es
exactamente la **regla 10** (altas sin duplicados) impuesta por la base de datos y no por el front.

### 2.2 Las 4 columnas de la regla 12, en TODAS las tablas

Hoy existe `fecha_hora_registro_carga`, `fecha_hora_asignacion_camion`,
`cliente_fecha_hora_registro_alta`, `transportista_fecha_hora_registro…`, `fecha_hora_alta`,
`ticket_fecha_hora`. Está bien, pero:

- **No hay NI UN "quién"** en ninguna hoja. No se puede saber quién bajó un precio.
- `dy_lugar_anotaciones_cliente`, `dy_bbdd_auxiliar` y las plantillas no tienen ninguna fecha.
- Falta la fecha de **modificación** en todas (solo hay la de alta).

→ Las 4 de la regla 12 en cada tabla: `creado_en`, `creado_por`, `modificado_en`, `modificado_por`.
`timestamptz` con `now()` del **servidor**, nunca del navegador.

### 2.3 Tabla `auditoria` append-only — no existe

Regla 12, punto 2. Una fila por cada alta/modificación/baja de cualquier tabla, con el
**antes y el después** en `jsonb`. Impuesta con **triggers de Postgres**, no desde el código.

### 2.4 Los hitos del envío — faltan 12 de 14

Tienes 2 de los 14 que pide la regla 12: creación y asignación de camión.
**Faltan**: modificado · publicado en bolsa · ofertado a cada transportista · enlace abierto ·
reservado · matrícula asignada · orden de transporte enviada · CMR firmado · cargado · entregado ·
cancelado · incidencia.

Y no caben como columnas: "ofertado a cada transportista" es **1-N** (ofertas la misma carga a 20).
→ tabla `envio_hitos` (`envio_id`, `hito`, `cuando`, `quien`, `datos jsonb`).
Esto es lo que después alimenta la **regla de precio por hora** (si a las 15:30 de la víspera no
hay transportista, sube el precio) y lo que te defiende en una reclamación.

### 2.5 Tablas que existen en el panel pero NO en el Sheet

- **`penalizaciones`** (cancelación, paralización, compensación, parada adicional) — el panel ya las
  tiene con pestañas y generación automática al cancelar fuera de plazo.
- **`almacenamientos`** (códigos `#AX######`, reparto urbano radio 20 km).
- **`documentos`** (CMR firmado, albarán, seguro CMR, tarjeta de transporte, adjuntos de
  incidencia). Hoy no hay sitio donde guardar un fichero → va a **Supabase Storage** + tabla de
  metadatos.
- **`firmas_cmr`** (DNI/NIE + nombre + email + sello de tiempo + hash, el valor probatorio).

### 2.6 Campos sueltos que faltan

- **`moneda`** en los importes. Ya tienes envíos a Polonia (`85-453 BYDGOSZCZ`), Italia
  (`20092 Cinisello Balsamo`), Portugal (`2400-016 LEIRIA`), Alemania (`94034 PASSAU`) e
  Irlanda (`N41 RW27`). Hoy todo se asume en euros; mejor explícito desde el día 1.
- **`pais_codigo_iso`** (ES/PT/IT…) además del nombre — lo exige Holded y lo necesita el tarifador.
- **Estado como `enum`** cerrado: `estado_carga`, `estado_cliente`, `ticket_estado`,
  `ticket_prioridad`, `ticket_tipo` están como texto libre.

---

## 3. LO QUE HAY QUE PARTIR (una celda con varios datos dentro)

Esto es el trabajo de verdad de la migración.

### 3.1 `matriculas_autorizadas` — el caso más sucio

Valores reales de tu hoja:

```
2547JSV // R0847BDV .-- NIMA: 5000113855
6593NNT .-- R3422BDG // NIMA: 0900076810
9658-MKH | R-7530-BDV
8221-LXV/ R-4490-BDM
3848 JFJ / R 3506 BCH
4465MDH  // AE34468
PO4LE38 / PO7YA52
8795LXG
PENDIENTE ASIGNAR MATRICULA
```

En una sola celda hay: **tractora + remolque + NIMA**, con 6 separadores distintos
(`//`, `--`, `.--`, `/`, `|`, `-`), espacios dentro de la matrícula, matrículas polacas y
el texto `PENDIENTE ASIGNAR MATRICULA` haciendo de NULL.

→ `matricula_tractora varchar(15)`, `matricula_remolque varchar(15)`, NULL cuando no hay
(nunca el texto "PENDIENTE"), y el NIMA a su columna (`transportista_nima` ya existe).
Script de migración con normalización de separadores y revisión a mano de los raros.

### 3.2 Los contactos: `persona_contacto_1/2 · telefono_1/2 · email_1/2` → 1-N

Está en `dy_clientes_hoja`, `dy_transportistas_hoja` y `dy_lugar`. Son dos huecos fijos para algo
que no tiene número fijo. Prueba de que no caben, de tu propia hoja:

```
pedro.pedreira@abclogistic.es, fatima.castanedo@abclogistic.es, daniel.cacicedo@abclogistic.es,
barbara.gomez@abclogistic.es, ignacio.gimenez@abclogistic.es, angela.velez@abclogistic.es
```

Seis emails metidos en una celda, separados por comas, en un campo con `max_length:80`.

→ tabla `contactos` (`id`, `tipo` cliente|transportista|lugar, `entidad_id`, `nombre`,
`telefono`, `email`, `funcion` tráfico|contabilidad|conductor, `es_principal`).
Ventaja inmediata: la regla del panel de "email de tráfico vs email de contabilidad (solo admin)"
se vuelve un filtro por `funcion`, no dos columnas distintas.

### 3.3 Origen y destino: `"08185 Lliçà de Vall"` → CP + población + país

En `DYNAMO-GX-INDEX` van juntos. Y los internacionales rompen cualquier validación de "5 dígitos":
`2400-016 LEIRIA` (PT), `85-453 BYDGOSZCZ` (PL), `N41 RW27 Irlanda` (IE), `94034 PASSAU` (DE),
`20021` (IT, sin localidad).

→ `codigo_postal varchar(12)` + `poblacion` + `provincia` + `pais_codigo_iso`.
⚠️ **El CP SIEMPRE como texto, jamás numérico**: `08185` guardado como número se convierte en
`8185` y pierdes el cero. Ya pasa en tu hoja con `CIF PROVEEDOR = 0` haciendo de vacío.

### 3.4 Las 28 columnas de paradas → una tabla

`parada_1..4` × 7 campos (`direccion_concatenar`, `resumen_datos`, `anotaciones_cliente`,
`hora_etp`, `resumen_direccion`, `provincia_pais`, `km_n_n+1`) + las 7 de recogida + las 7 de
entrega = **42 columnas** para la ruta.

→ tabla **`envio_puntos`**: `envio_id`, `orden` (1,2,3…), `tipo` (recogida|parada|entrega),
`lugar_id`, `hora_prevista`, `km_hasta_siguiente`, `anotaciones_cliente`.
Esto solo quita **~42 de las 123 columnas** de `dy_cargas_hoja`, y de paso te deja hacer envíos
con 5, 6 o 20 paradas sin tocar el esquema (hoy el techo son 4, por diseño de la hoja).

### 3.5 Las fechas de carga

`fecha_carga_inicio` + `fecha_ventana_carga` + `fecha_carga_maxima` son tres columnas para una cosa.
→ `fecha_carga_desde date` + `fecha_carga_hasta date`. La ventana en días es `hasta − desde`.

### 3.6 Los tags, tres veces

En `dy_transportistas_hoja` hay `transportista_tags`, `transportista_tags_separados_por…` y
`Tags separados por -`. Tres columnas de etiquetas en la misma hoja.
→ `tags text[]` (o tabla `etiquetas` si quieres controlarlas). El formato `separados por -` solo
hace falta al **exportar a Holded**, y eso es un `array_to_string(tags, '-')` en la vista.

### 3.7 Duplicados menores

- `dy_ticket_hoja` tiene **`nombre_contacto` dos veces** (columnas G y N).
- `dy_polos_capitalyciudadesindustriales` es copia literal de `dy_bbdd_auxiliar`.
- `dy_cargas_hoja` tiene `conductor_telefono` y `conductor_whatsapp` — casi siempre el mismo
  número. → un `telefono` + `tiene_whatsapp boolean`.

### 3.8 Nombres a corregir ahora que es gratis

- `discreccion_comercial` → **`discrecion_comercial`** (dos C). Está mal escrito en la hoja y en el
  mockup. Es el momento de arreglarlo: después son migraciones.
- `cliente_numero_paraliazaciones` → `cliente_numero_paralizaciones`.
- `transportista_almacen_logístico` → **sin tilde** (`almacen_logistico`). Identificadores con
  tilde en Postgres obligan a comillas dobles en cada consulta para siempre.
- `boolenano` → `boolean` (en la documentación).

---

## 4. LO QUE HAY QUE CONGELAR (snapshot) — y responde a tu duda

> *"¿para buscar valor más bajo de un envío repetido... buscas cuando haga falta, o en el último
> envío se anota en celda?"*

Son **dos cosas distintas** y la respuesta es diferente para cada una:

### 4.1 Caché de consulta → NO se guarda. Se busca.

`importe_cliente_ultimo` e `importe_transportista_ultimo` (columnas DA y DB de tu hoja) son una
**caché**. En Sheets te hacen falta porque buscar en 30.000 filas con fórmulas va lento.
En Postgres **no hacen falta**: con este índice

```sql
CREATE INDEX idx_envios_ruta_cliente
  ON envios (cliente_id, cp_origen, cp_destino, fecha_carga_desde DESC);
```

la consulta *"último precio de esta ruta para este cliente"* tarda **menos de 1 ms** con 30.000
filas, y con 300.000 también (un índice B-tree crece logarítmicamente: 10× más datos no es 10× más
lento). Lo mismo para *"el más bajo de los últimos 6 meses"* o *"la media de los últimos 15 días"*
(que es lo que ya usa tu tarifador).

Y guardarlo tiene un coste real: **hay que mantenerlo**. El día que corriges un precio de un envío
viejo, las celdas "último precio" de los otros ya mienten, y nadie se enteró. Una caché que miente
es peor que no tener caché.

### 4.2 Valor aplicado → SÍ se guarda. Siempre.

Esto es otra cosa: no es caché, es **lo que se pactó ese día**. Y hay que copiarlo al envío porque
la ficha maestra cambia después:

- `importe_cliente`, `importe_transportista` (evidente)
- el **`factor_tarifa_cliente` que se aplicó** (hoy el cliente tiene −7%; el año que viene 0%; el
  envío de hoy se cobró con −7% y así tiene que quedar)
- `iva_cliente` %, `retencion_porcentaje` %, `plazo_pago` → el porcentaje de ese día
- el **precio del diésel** usado en el cálculo (hoy 1,899 €/l en `dy_bbdd_auxiliar`, mañana otro)
- la **dirección del lugar tal como estaba** (los sitios se editan; el CMR de hace un año tiene que
  seguir diciendo la dirección a la que se fue de verdad)

**El patrón es tener las dos cosas**: la FK al maestro (para saber *quién* es y poder navegar) **y**
la copia del valor aplicado (para saber *qué* se cobró). No una u otra.

Ese es exactamente el criterio: **si el dato se puede recalcular → vista. Si el dato es una
decisión que se tomó en un momento → columna congelada.**

---

## 5. SEGURIDAD — un hallazgo que hay que arreglar al migrar

`dy_contactos_clientes_transportistas_hoja` tiene la columna **`clave_acceso_web_dynamo`**.

Las contraseñas **no se guardan**, ni cifradas ni en columna propia. Van a **Supabase Auth**, que
las almacena con hash (bcrypt) y gestiona el reset. En el esquema no existe ninguna columna de
contraseña: `usuarios.id` es el `auth.users.id` de Supabase y punto.

Esa hoja es, además, el sitio exacto donde se aplica la **regla 10**: `UNIQUE` sobre el email.
Lo bueno que ya tiene y se queda: `limite_ppto_diario` y `limite_cargas_diario` (anti-abuso por
usuario) — eso no lo había previsto y es buena idea.

---

## 6. LAS TABLAS — las 5 tuyas + 15 más

Tus cinco son correctas y son el núcleo. Pero cinco no bastan: hay cosas que **hoy caben en el
Sheet solo porque Sheets te deja meter varios datos en una celda**, y en Postgres necesitan sitio
propio. Lista completa, por grupos:

### A. NÚCLEO — las que dijiste (con un matiz en "contactos")

| # | Tabla | Viene de | Nota |
|---|---|---|---|
| 1 | **`clientes`** | `dy_clientes_hoja` | Sin los 9 agregados ni los `*_concatenar`. Con las columnas que exige Holded. |
| 2 | **`transportistas`** | `dy_transportistas_hoja` | Proveedores. `UNIQUE (cif)` — regla 10. |
| 3 | **`lugares`** | `dy_lugar` | Sitios de recogida/entrega + almacenes Dynamo. |
| 4 | **`contactos`** | los `*_contacto_1/2` de las 3 hojas | Persona de contacto de una empresa. 1-N. |
| 5 | **`usuarios`** | `dy_contactos_clientes_transportistas_hoja` | Quien hace **login**. Supabase Auth. |
| 6 | **`envios`** | `dy_cargas_hoja` | De 123 a ~55 columnas. |

> **⚠️ El matiz: `contactos` y `usuarios` son DOS tablas, no una.**
> Tú los describes juntos ("contactos que son usuarios asignados a clientes/proveedor para tema
> acceso a web"). Pero son dos cosas con vidas distintas:
> - **`contactos`** = la persona de la empresa con la que hablas. `trafico@cointrans.es`,
>   `oficinaperfeval@gmail.com`. El **90% de estos nunca va a entrar al portal**. Hay 6 en ABC
>   Logistic. Tienen función (tráfico / contabilidad / conductor).
> - **`usuarios`** = quien tiene credenciales. Email **único** (regla 10), rol
>   (admin/empleado/cliente/transportista), estado de cuenta, 2FA el día que lo pongas. Tú y tu
>   hermano sois usuarios y **no pertenecéis a ningún cliente**.
>
> Si los metes en una tabla: o tienes miles de filas de "usuario" sin login (y la columna
> `clave_acceso_web_dynamo` vacía, como ahora), o no puedes guardar los 6 emails de tráfico de un
> transportista que nunca entrará al portal. Un contacto **puede** tener un usuario asociado
> (`contacto.usuario_id` opcional) — eso es el enlace, no la fusión.

### B. DERIVADAS DEL ENVÍO — obligatorias, no opcionales

| # | Tabla | Por qué no cabe en `envios` |
|---|---|---|
| 7 | **`envio_puntos`** | Hoy son **42 columnas** (`recogida_*`, `parada_1..4_*`, `entrega_*`). Una fila por punto: `orden`, `tipo`, `lugar_id`, `hora_prevista`, `km_hasta_siguiente`. Techo actual: 4 paradas por diseño de la hoja. Con tabla: las que haga falta. |
| 8 | **`envio_hitos`** | Los 14 sellos de la regla 12. Tienes 2. "Ofertado a cada transportista" es 1-N: no cabe en columna. |
| 9 | **`envio_ofertas`** | A quién se ofreció, a qué precio, con qué banda de negociación (±5/±10/±30%), si abrió el enlace, si reservó, cuándo caducó. Hoy es `transportista_emails_unicos_ruta_provincias`: un texto con emails pegados. |

### C. DEL TRANSPORTISTA — responde a tu pregunta de las matrículas

| # | Tabla | Por qué |
|---|---|---|
| 10 | **`vehiculos`** | **Sí, tabla propia.** Razonado en §7. |
| 11 | **`conductores`** | Mismo caso que las matrículas: nombre, DNI, teléfono, WhatsApp. Se repiten en cada envío y hay datos (el DNI para firmar el CMR) que no tienen dónde vivir. |

### D. OPERATIVA — existen en el panel pero NO en el Sheet

| # | Tabla | Estado |
|---|---|---|
| 12 | **`tickets`** | ✅ Ya la tienes (`dy_ticket_hoja`). |
| 13 | **`penalizaciones`** | ❌ Falta. En el panel: cancelación, paralización, compensación, parada adicional, con generación automática al cancelar fuera de plazo. |
| 14 | **`almacenamientos`** | ❌ Falta. Códigos `#AX######`, reparto urbano radio 20 km. |
| 15 | **`documentos`** | ❌ Falta. CMR firmado, albarán, seguro CMR, tarjeta de transporte, adjuntos de incidencia. Fichero en **Supabase Storage** + metadatos aquí. |
| 16 | **`firmas_cmr`** | ❌ Falta. DNI/NIE + nombre + email + sello de tiempo + hash. Es el valor probatorio de la firma del CMR. |

### E. SOPORTE

| # | Tabla | Nota |
|---|---|---|
| 17 | **`lugar_notas_cliente`** | ✅ Ya la tienes (`dy_lugar_anotaciones_cliente`). **Buen diseño**: la nota privada de un cliente sobre un sitio compartido. Se queda tal cual. |
| 18 | **`tarifas`** | ❌ **La que más falta.** Ver abajo. |
| 19 | **`parametros`** | `dy_bbdd_auxiliar`: diésel €/l, tabla ml→Tn→palés, diccionario. |
| 20 | **`plantillas`** | Las `MAIL_COMERCIAL_*`, la coletilla de contraoferta, los textos de orden y proforma. |
| 21 | **`auditoria`** | Regla 12. Append-only, por triggers. |

> **⚠️ `tarifas` es el agujero más grande del Sheet.** No hay **ni una** tabla de precios. Hoy las
> reglas viven repartidas entre el front del mockup y medias históricas:
> mínimo **220 €** · **1,35 €/km** · no paletizado **+70 €** · carga por techo **90 €** (15 jun–15
> sep) / **50 €** resto · ADR **+50%** · trampilla **60 €** · NIMA **50 €** · parada adicional
> **40 €** · recargos por tipo de lugar (obra +5%, urbana +20%, evento +15%, finca +25%) ·
> descuento por peso bajo · suplemento fecha fija · paralización **40 €/h**.
>
> Y **cambian con el tiempo** (la curva de precio de verano que tienes apuntada: sube del 15-jul al
> pico de mediados de agosto y baja al 30-ago). Por eso no son constantes en el código: es una
> tabla con **vigencia** (`concepto`, `valor`, `tipo` (fijo/€ por km/%), `vigente_desde`,
> `vigente_hasta`). Así el envío de agosto se recalcula con la tarifa de agosto para siempre, y
> cambiar un precio no exige un deploy.

**Total: 21 tablas + 6 vistas** (`v_holded_pedido_venta`, `v_holded_pedido_compra`, `v_wtransnet`,
`mv_cliente_metricas`, `mv_transportista_metricas`, `v_envios_panel`).

---

## 7. MATRÍCULAS: tabla propia. Y el mismo razonamiento para conductores

> *"Igual derivado de envíos, ¿podríamos crear tabla de matrículas? ¿O se toman de la de envíos
> para no repetir info?"*

**Tabla propia, `vehiculos`.** Cuatro razones, de menos a más importante:

**1. La matrícula no es del envío, es del transportista.** Una tractora hace 50 envíos al año. Si
el único sitio donde vive es la columna del envío, el dato está **50 veces repetido** — que es
justo lo que querías evitar. Tu intuición es correcta; la conclusión es la contraria a lo que
temías: la tabla propia es la que *quita* repetición, no la que la añade.

**2. Hay datos del vehículo que hoy no tienen dónde vivir.** Tipo (tractora / remolque / rígido),
caducidad de la **ITV**, del **seguro**, de la **tarjeta de transporte**, certificación **ADR**,
NIMA asociado, si lleva **trampilla**. Hoy nada de eso se puede guardar. Y en cuanto lo tengas,
sale gratis una cosa que vale dinero: **avisar de que el seguro de un transportista caduca la
semana que viene antes de darle una carga**.

**3. Ya estás parseando ese texto a mano.** En `aceptar-carga.html` autocompletas tractora,
remolque y conductor del historial, y resuelves la **pareja tractora↔remolque** y el conductor que
la llevó la última vez (`pares` y `paresChofer` en `TRANS_DEMO`). Eso hoy sale de partir la cadena
`"2547JSV // R0847BDV"`. Con tabla es una consulta de dos líneas, y deja de romperse cuando alguien
escribe `9658-MKH | R-7530-BDV` con otro separador.

**4. Normalización.** La misma matrícula está escrita de 4 formas distintas en tu hoja
(`3848 JFJ`, `8221-LXV`, `2547JSV`, `0826 MPR`). Con tabla y `UNIQUE` sobre la matrícula
normalizada, existe **una sola vez** y se escribe sola.

### Pero el envío además guarda su copia

```
envios.vehiculo_tractora_id   uuid  → FK a vehiculos   (para navegar, filtrar, avisar de ITV)
envios.matricula_tractora     text        (congelada: lo que de verdad fue)
envios.matricula_remolque     text
envios.conductor_id           uuid  → FK a conductores
envios.conductor_nombre       text        (congelado, para el CMR)
```

Es el mismo patrón del §4: **FK al maestro + copia de lo aplicado**. Motivo concreto: un camión se
vende o se da de baja, un conductor se va de la empresa, una matrícula se transfiere. El CMR del
año pasado tiene que seguir diciendo la matrícula que **realmente** cargó, aunque hoy ese vehículo
ya no exista en la flota de nadie. Sin la copia congelada, borrar un vehículo te reescribe la
historia.

Y ojo con el dato que hoy va de polizón en la misma celda: `"... .-- NIMA: 5000113855"`. El NIMA es
del **transportista** (así lo decidiste el 2026-08-07: lo aporta él al aceptar la carga, no es del
cliente), así que vive en `transportistas.nima` y se congela en el envío si se usó.

---

## 8. HOJA DE RUTA — qué hago yo y qué tienes que hacer tú

> *"¿Dame hoja de ruta o cómo habilito siguiente paso una vez saber tablas? ¿Es montar bbdd
> supabase?"*

Sí: el siguiente paso es crear la base de datos. El reparto es este.

### PASO 1 — Solo tú (10 minutos, una vez)

1. Entrar en **supabase.com** → *New project*.
2. **Región: Frankfurt (eu-central-1)**. Importa: RGPD, los datos de tus clientes se quedan en la UE.
3. Nombre: `dynamo`. Plan Free para empezar (se sube cuando haga falta; el Free aguanta de sobra
   el desarrollo).
4. Guardar la **contraseña de la base de datos** en tu gestor de contraseñas.
5. Decirme **solo**: "proyecto creado".

**⚠️ No me pegues NUNCA ninguna clave en el chat.** Ni la `anon`, ni la `service_role`, ni la
contraseña, ni la cadena de conexión. La `service_role` **se salta toda la seguridad** de la base
de datos: quien la tiene, lo puede leer y borrar todo. Las claves van a las variables de entorno de
Vercel y de Supabase, y yo no necesito verlas para escribir el esquema.

### PASO 2 — Yo, sin tocar tu cuenta

Escribo las migraciones como ficheros SQL en el repo, en `supabase/migrations/`, numeradas:

```
supabase/migrations/
  0001_enums_y_catalogos.sql
  0002_auditoria_y_triggers.sql
  0003_clientes_transportistas_contactos.sql
  0004_usuarios_y_roles.sql
  0005_lugares.sql
  0006_vehiculos_conductores.sql
  0007_envios.sql
  0008_envio_puntos_hitos_ofertas.sql
  0009_operativa.sql
  0010_tarifas_parametros_plantillas.sql
  0011_vistas_holded_wtransnet.sql
  0012_rls_politicas.sql
```

Tú los abres y los pegas en el **SQL Editor** de Supabase, uno a uno, en orden. Yo veo el SQL, tú
lo ejecutas. Cero secretos de por medio, y queda todo versionado en git: si algo sale mal, se
revierte.

### PASO 3 — El orden, y por qué ese orden

| Orden | Qué | Por qué va ahí |
|---|---|---|
| 1 | Enums y catálogos | Tipos de lugar, camión, carga, estados, `ticket_tipo`. Todo lo demás los referencia. |
| 2 | **`auditoria` + triggers** | **Antes de meter un solo registro.** Si va después, los primeros datos nacen sin rastro y la regla 12 queda con un agujero desde el día 1. |
| 3 | Clientes, transportistas, contactos | Con las columnas de Holded y los `UNIQUE` de la regla 10. |
| 4 | Usuarios y roles | Supabase Auth. Sin columna de contraseña. |
| 5 | Lugares + notas de cliente | |
| 6 | Vehículos y conductores | Cuelgan del transportista. |
| 7-8 | Envíos + puntos + hitos + ofertas | Lo más complejo, y necesita todo lo anterior montado. |
| 9 | Tickets, penalizaciones, almacenamientos, documentos | |
| 10 | Tarifas, parámetros, plantillas | |
| 11 | Vistas de exportación | El día que se enchufa, los ficheros de Holded y Wtransnet siguen saliendo igual que hoy. |
| 12 | **RLS (seguridad por filas)** | Un cliente solo ve lo suyo, un transportista solo sus viajes. **El gating del front no es seguridad**: se impone aquí, en la base de datos. |

### PASO 4 — Migrar los datos

Scripts de carga con la partición del §3 (matrículas, emails múltiples, CP+población, puntos de
ruta). En seco primero, revisando a mano los raros. El Sheet **sigue siendo la verdad** mientras se
monta cada módulo: se corta de uno en uno (patrón estrangulador), nunca de golpe.

### Lo que NO cambia todavía

El mockup (`dashboard.html`) sigue funcionando con sus datos de prueba. La base de datos se monta
en paralelo y no se conecta nada hasta que un módulo esté completo. Nada de esto toca `main` ni la
web pública.

---

## 9. LO QUE NECESITO DE TI PARA EMPEZAR A ESCRIBIR SQL

Sin esto no puedo cerrar el DDL de los pasos 1-3. Las 4 primeras son las que bloquean:

1. **`cliente_factor_tarifa`: ¿±3% o −30/+30?** El diccionario del Sheet dice ±3%, el panel tiene
   un slider de −30 a +30 con default −7%. ¿Cuál es la buena?
2. **`tipo_concepto`** (col Y de cargas): ¿qué valores tiene? ¿Es el concepto de facturación
   (porte / almacenaje / paralización / penalización)?
3. **`riesgo_disponible` y `riesgo_cliente_euros`**: ¿son los dos CESCE, o uno es el crédito
   interno de Dynamo? En el panel hay dos importes separados.
4. **`tipo_de_lugar`: la lista definitiva.** El Sheet dice ALMACÉN / OBRA / EVENTO / FINCA; el panel
   usa Almacén/Nave · Obra · Zona urbana · Evento · Finca. Hay que cerrarla porque de ella cuelgan
   los recargos del tarifador.

Menos urgentes:

5. **`referencia_continua_carga`** (col B): ¿es un segundo contador además del GX?
6. **`cliente_verificado_hoja_cif_o_mail`**: ¿verificación a mano, o VIES/AEAT?
7. **`transportista_wtransnet`**: ¿es el código de socio de la bolsa?
8. **`cliente_tipo_urgencia_defecto_dias`**, **`cliente_tipo_mercancia_porcentaje`**,
   **`valor_mercancia_porcentaje`**: ¿son recargos del tarifador por cliente?
9. **¿Cuántos clientes y transportistas reales hay?** Las hojas están formateadas hasta 20.005 y
   10.005 filas, pero eso es formato, no datos. (En `dy_cargas_hoja` el volcado da ~30.160 líneas
   con contenido, pero muchas son celdas con saltos de línea, no envíos.)
