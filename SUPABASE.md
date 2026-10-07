# SUPABASE — esquema de la plataforma Dynamo

> Documento de trabajo. Punto de partida: las tablas REALES que el usuario ya tiene montadas en
> Google Sheets. Objetivo: pasar de esas hojas a un esquema Postgres sano en Supabase.
>
> **Leído el 2026-10-06 por MCP de Google Drive** (no es una suposición, son las columnas reales):
> - `IA-DYNAMO-2030` — ID `11hUKWFHu0cirk-IAGIiVPETFxwt5_Lo4QAHmYlUtO8o` — 14 hojas
> - `DYNAMO-GX-INDEX` — ID `1qZCqtkisu6ovBMLO-NkMcuync1f_miIoTQiNhS_7l9o` — 1 hoja, 300 filas, se toca a diario
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

## 6. ESQUEMA PROPUESTO — 16 tablas

```
NÚCLEO
  clientes                 ← dy_clientes_hoja (menos agregados y concatenar)
  transportistas           ← dy_transportistas_hoja
  contactos                ← los *_contacto_1/2 de clientes, transportistas y lugares (1-N)
  usuarios                 ← dy_contactos_… + Supabase Auth (sin columna de contraseña)
  lugares                  ← dy_lugar
  lugar_notas_cliente      ← dy_lugar_anotaciones_cliente (lugar_id + cliente_id + notas)

ENVÍO
  envios                   ← dy_cargas_hoja, de 123 a ~55 columnas
  envio_puntos             ← las 42 columnas de recogida/parada_1..4/entrega
  envio_hitos              ← los 14 hitos de la regla 12 (1-N, incluye ofertas)
  envio_ofertas            ← a qué transportistas se ofreció, cuándo, si abrió el enlace

OPERATIVA
  tickets                  ← dy_ticket_hoja
  penalizaciones           ← NUEVA (existe en el panel, no en el Sheet)
  almacenamientos          ← NUEVA (#AX######)
  documentos               ← NUEVA (Supabase Storage: CMR, albarán, seguros, adjuntos)

SISTEMA
  parametros               ← dy_bbdd_auxiliar (diésel €/l, tabla ml→Tn→palés, diccionario)
  auditoria                ← NUEVA, append-only, por triggers (regla 12)

VISTAS (no tablas)
  v_holded_pedido_venta    ← dy_holded_pedido_venta, columnas 1:1 de Holded
  v_holded_pedido_compra   ← dy_holded_pedido_compra
  v_wtransnet              ← dy_fichero_wtransnet
  v_gx_index               ← DYNAMO-GX-INDEX
  mv_cliente_metricas      ← los contadores de cliente (refresco programado)
  mv_transportista_metricas← los contadores de transportista
```

`dy_cargas_hoja` pasa de **123 columnas a unas 55**: −42 de puntos de ruta, −9 de agregados,
−8 de concatenar, −6 de plantillas de email, −5 de payloads de integración, +las 4 de la regla 12.

---

## 7. ORDEN DE TRABAJO

1. **Proyecto Supabase** en región **Frankfurt (eu-central-1)** — RGPD, datos en la UE.
   Esto solo lo puede hacer el usuario. ⚠️ Las claves **nunca** se pegan en el chat; viven en
   variables de entorno de Vercel/Supabase. La `service_role` se salta toda la seguridad.
2. **`parametros` + catálogos/enums** (tipos de lugar, de camión, de carga, estados). Cimientos.
3. **`clientes` + `transportistas` + `contactos`**, con las columnas que exige Holded y los
   `UNIQUE` de la regla 10.
4. **`lugares`** + `lugar_notas_cliente`.
5. **`auditoria` + los triggers** → ANTES de meter un solo envío, para que todo nazca auditado.
6. **`envios` + `envio_puntos` + `envio_hitos` + `envio_ofertas`**.
7. **Operativa**: tickets, penalizaciones, almacenamientos, documentos.
8. **Vistas de exportación** (Holded, Wtransnet, GX-INDEX) → el día que se enchufa, los ficheros
   actuales siguen saliendo igual.
9. **RLS por rol** (admin / cliente / transportista / empleado) — la matriz de permisos del TODO.
   El gating del front **no es seguridad**: se impone aquí.
10. **Migración de datos** con los scripts de partición del punto 3, en seco y revisando los raros.

Patrón **estrangulador**: el Sheet sigue vivo y manda mientras se monta cada módulo; se va cortando
de uno en uno. Nunca un corte total.

---

## 8. PREGUNTAS ABIERTAS para el usuario

1. **`tipo_concepto`** (col Y de cargas) — ¿qué valores tiene? ¿Es el concepto de facturación
   (porte / almacenaje / paralización)? Define si va a `enum` o a tabla de catálogo.
2. **`referencia_continua_carga`** (col B) — ¿es un contador secuencial propio además del GX?
3. **`cliente_verificado_hoja_cif_o_mail`** — ¿verificación manual, o VIES/AEAT?
4. **`transportista_wtransnet`** — ¿es el código de socio de la bolsa? (en el panel está como
   "código de bolsa de carga").
5. **`riesgo_disponible` / `riesgo_cliente_euros`** — ¿los dos son CESCE, o uno es el crédito
   interno de Dynamo? En el panel hay dos importes separados (CESCE y Dynamo).
6. **`cliente_tipo_urgencia_defecto_dias`**, **`cliente_tipo_mercancia_porcentaje`**,
   **`valor_mercancia_porcentaje`** — ¿son los recargos del tarifador por cliente?
7. **`dy_polos_capitalyciudadesindustriales`** — ¿la querías rellenar con polos industriales y
   quedó a medias? (hoy es copia de `dy_bbdd_auxiliar`).
8. **Clientes y transportistas reales**: las hojas tienen el rango formateado hasta 20.005 y 10.005
   filas. ¿Cuántos registros reales hay? (para dimensionar la migración).
