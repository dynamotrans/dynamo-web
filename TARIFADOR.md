# Tarifador · ideas y reglas para cuando se monte el de verdad

> Notas del usuario (2026-11-19) para tenerlas presentes al montar el tarifador real y las
> modificaciones de envío. **Nada de esto está programado todavía**: son criterios a decidir
> y a convertir en parámetros. El motor de hoy es el BORRADOR de `lib/tarifador.ts` (importe
> fijo de 700 € de relleno hasta que lleguen las tarifas reales).

## 1. Lo que ya existe y debe seguir siendo un condicionante

- **Distancia (km) de la ruta** y **precio del gasóleo** como base del importe (hoy el motor
  por km y ocupación está escrito pero apagado; ver `ocupacionCamion` en `lib/tarifador.ts`).
- **Ocupación**: metros lineales y peso sobre el máximo del camión (tráiler 13,30 m · 24 Tn;
  rígido 8 m · 14 Tn). Grupaje frente a carga completa. Descuento por peso bajo en completo.
- **Tipo de fecha**: fecha fija (y si es el primer día disponible, urgente) · recogida de
  1 a 2, 1 a 3 o 1 a 4 días. Alternativas más baratas que calcula por detrás.
- **Tipo de sitio** de cada parada: almacén / nave / campa (sin recargo), obra en zona amplia,
  obra en zona urbana, finca (con recargo; `recargos_tipo_sitio`). Al cliente no se le dice
  qué tipos llevan recargo.
- **Mercancía y forma de carga**: no paletizada, carga/descarga por techo (más cara en verano),
  plataforma elevadora, NIMA (residuos), ADR.
- **Paradas extra** (más de 2 puntos).
- **Factor del cliente** (`clientes.factor_tarifa_pct`, de −30 % a +30 %, solo lo ve Dynamo):
  p. ej. +10 % a clientes poco exigentes con el precio, −5 % a los que aprietan. Se congela en
  cada envío (`factor_tarifa_envio`). Si no está fijado a mano, manda el descuento de
  bienvenida (`factor_automatico`).
- **Sábados y domingos**: los clientes NO pueden pedir carga en fin de semana. Si llega algo
  puntual, lo crea a mano el Admin Master o un empleado con el precio que estime.

## 2. Modificar un envío ya pedido: cuándo se deja y cómo se recalcula

**Caso tipo**: Madrid → Sevilla, recogida de 1 a 3 días (la económica), pedido con tiempo para
el viernes. El viernes, ya cargando, el cliente dice que se entrega en otra localidad a 30 km
de la dirección de Sevilla.

**Precio al cambiar la dirección**
- Se recalculan los km de la ruta nueva.
- **Si salen MENOS km: el precio NO baja.** Se respeta el precio acordado (y el del chófer).
- **Si salen MÁS km: se cobra solo la diferencia de km, con las condiciones del día en que se
  pidió el envío** (su tipo de fecha y su antelación), **no como si se pidiera hoy con urgencia**.
  Si no, cambiar a un almacén del polígono de al lado podría encarecer 150 € por tarifar de
  nuevo como fecha urgente, y eso no tiene sentido.

**Cuándo se permite la modificación (idea a cerrar)**
- Solo se pueden **cambiar los sitios que ya están puestos**; se pueden **quitar paradas**, pero
  **no añadir** (el número de paradas no puede crecer).
- El **origen** (primera recogida) y el **destino final** no pueden moverse más de **35 km**
  de donde estaban. Lo mismo para cada parada que se cambie por otra.
- La **ruta total** no puede crecer más de un **10 %** o de **60 km** (a decidir cuál, o el
  menor de los dos).
- Si el cambio es a **otra provincia**, o cambia el recorrido de verdad (p. ej. Madrid →
  Ciudad Real → Sevilla pasa a Madrid → Barcelona → Sevilla), **no se modifica**: hay que
  **cancelar** (el chófer puede estar ya comprometido al día siguiente en Sevilla).
- Fuera de estos límites: cancelar, o que lo decida Dynamo a mano. A decidir.
- Todos estos números (35 km, 10 %, 60 km) deberían ser **parámetros**.

## 3. Temporadas: calendarios de tarifas con % de subida

- Verano, Semana Santa, Navidad… suben los precios. Idea: **calendarios de tarifa** con fechas
  y un **% de incremento** que se aplica solo al llegar esas fechas (según la fecha de carga).
- Editable por Dynamo (fechas que se repiten cada año y fechas sueltas), como los festivos.

## 4. Oferta y demanda: ajustar la tarifa al margen real

- Además de las temporadas, el precio que pagamos al transportista sube o baja según la oferta
  y la demanda (p. ej. en marzo, sin nada especial, de repente cuesta más encontrar camión).
- Idea: el tarifador mira el **margen real** de los envíos recientes de la **misma ruta**
  (provincia de origen → provincia de destino, mismo tipo: completo o grupaje) en los últimos
  días o semanas.
- Si el margen baja (p. ej. de 80 € a 70, 60 o 50 € en carga completa porque los transportistas
  que aceptan cobran más), el tarifador **sube la tarifa en proporción** para volver al margen
  objetivo (mismo % o mismos euros de margen). Y al revés, con cuidado, si el margen sube.
- A decidir: ventana de tiempo que se mira, mínimo de envíos para fiarse del dato, tope de
  subida o bajada por semana, y si el ajuste lo aplica solo o lo propone a Dynamo para aprobar.
- La tabla de precios internos que ya enseña Nuevo envío (último precio de la misma ruta y de
  todas) es el embrión de esto (`tablaInterna` en `lib/tarifador.ts`).

## 4 bis. IPC mensual sobre la parte que no es combustible (usuario, 2026-11-21)

- Además del gasóleo, la base se actualiza con el **IPC mes a mes**, sin esperar a fin de año:
  si al transportista le sube la vida (neumáticos, comida, sueldo, taller…), hay que
  repercutirlo.
- **Índice propio con base 100** en el día de arranque. El **día 1 de cada mes** se aplica el
  IPC mensual que haya publicado el INE (positivo o negativo; p. ej. +0,3 %) sobre ese índice.
  Tarea automática que lee el dato publicado; si un mes no hay dato, no se toca. Dynamo puede
  ver y corregir el índice en Parámetros (con historial de cada mes).
- El IPC se aplica **solo a la parte del coste que no es combustible**. Reparto orientativo
  del coste de un km de tráiler (parametrizable): **~30 % combustible**, **~30 % conductor**,
  **~40 % máquina** (tráiler, neumáticos, parking, mantenimiento, costes indirectos de la
  empresa). Es decir: base × (% combustible × factor gasóleo + % resto × índice IPC / 100).
- Va **antes** de aplicar el gasóleo y de todo lo demás: es una corrección de la base.

## 4 bis-2. IDEA · Gasóleo: «sube como un cohete y baja como una pluma» (usuario, 2026-11-25)

*«Si el precio del gasoil está subiendo, la tarifa se actualiza sobre la marcha. Pero si va
bajando, tarda en aplicar las correcciones, por ejemplo 5 o 6 días… que los precios diarios no
suban y bajen de golpe… para subir subimos al momento, para bajar tardamos.»*

**ES SOLO UNA IDEA (usuario, 2026-11-25: «no sé aún detalles, anótalo como idea de tarifador, ya lo vemos»). Nada decidido ni programado. Una forma posible de hacerlo:**

- El tarifador NO usa el precio del día, sino un **precio de referencia** que se calcula solo:
  **el más alto de los últimos N días** (N = 6 por defecto, en Parámetros).
  - Sube el gasóleo → el de hoy pasa a ser el más alto → la referencia sube **el mismo día**.
  - Baja el gasóleo → la referencia aguanta hasta que el día caro sale de la ventana (N días) y
    entonces baja al siguiente más alto: escalón pequeño, nunca de golpe.
  - Un bajón de un solo día no mueve nada. Una regla, un número, fácil de explicar.
- **Banda muerta**: si la referencia cambia menos de un mínimo (p. ej. 0,5 %), la tarifa no se
  toca, para que no baile céntimos cada día.
- **Freno a datos raros**: si el dato del día se aparta mucho del anterior (p. ej. más de un 5 %)
  o vienen muy pocas gasolineras, no se aplica solo: aviso a Dynamo.
- Solo afecta a la **parte de combustible** del precio (~30 %, apartado 4 bis).
- Solo a **precios nuevos**: un presupuesto o un envío ya confirmado no cambia.

**Hace falta guardar el precio de cada día** (sin historial no hay ventana ni se puede explicar
por qué un precio fue el que fue): tabla con fecha, precio medio nacional del gasóleo A, número
de gasolineras y hora del dato; una tarea diaria lo lee de la fuente pública del Ministerio
(la misma que hoy usa el usuario en su hoja de cálculo; sin clave y sin coste). Arranque: cargar
el historial que ya tiene en la hoja. Y un registro de cada cambio de la referencia (día, de
cuánto a cuánto y por qué).

**Por decidir con el usuario**: N (5 o 6 días); la banda muerta; si la misma regla vale para lo
que se PAGA al transportista o solo para lo que se cobra al cliente; y, en el repaso legal,
que esta regla es para precios nuevos (la revisión del precio por combustible de un transporte
ya contratado va por la ley, no por esto).

## 4 ter. ⚠️ MUY IMPORTANTE · El destino se mide hasta el POLO INDUSTRIAL más cercano, no hasta la capital (usuario, 2026-11-23)

- Ejemplo: Sevilla → un pueblo que linda con Cádiz pero está **muy cerca de un polo
  industrial**. El camión, al descargar, sale cargado desde ese polo: el precio tiene que
  contar con que **acaba en el polo** (donde encuentra la carga de vuelta), **no
  devolverlo a la capital de provincia** ni tratar el destino como un pueblo perdido.
- Regla: cada destino (y cada origen) se asigna a su **polo industrial o de carga más
  cercano** (por km de carretera, dentro del radio de ese polo), y no a la capital.
  Lo que dependa de «dónde se queda el camión» sale de ahí: el coste de la vuelta o de
  ir vacío hasta la siguiente carga, la facilidad de encontrar camión y el «misma ruta»
  del apartado 4 (provincia → provincia pasa a ser polo → polo cuando lo haya).
- Hace falta una **lista de polos** editable por Dynamo (nombre, punto en el mapa, radio y
  lo atractivo que es para recargar: alto / medio / bajo), con los grandes de inicio (en
  Andalucía, p. ej., la Bahía de Cádiz, Jerez, el Campo de Gibraltar, Huelva, Sevilla,
  Málaga…). Un destino lejos de cualquier polo sí lleva el recargo de «vuelta en vacío».
- **Decidido (usuario, 2026-11-23):**
  - **Vale también para el origen**: el camión que viene a cargar sale del polo industrial
    más cercano a la recogida, no de la capital.
  - **El radio es de cada polo**: se fija al dar de alta el polo (según su tamaño y su radio
    de acción), no hay uno general.
  - **Los km entre el punto y su polo se cobran con descuento** (menos que un km normal de
    la ruta); el porcentaje se fija al montar ese módulo del tarifador.

## 5. Orden de cálculo propuesto (borrador)

1. Base por km según ocupación (completo / grupaje, ml y peso), repartida en combustible
   (× gasóleo del día) y resto (× índice IPC mensual, apartado 4 bis). El final de la ruta
   se mide hasta el **polo industrial más cercano**, no hasta la capital (apartado 4 ter).
2. Paradas extra y recargos por tipo de sitio.
3. Suplementos de mercancía y forma de carga (techo, plataforma, NIMA, ADR…).
4. Tipo de fecha (fija / urgente / ventanas).
5. % de temporada (calendario de tarifas).
6. Ajuste por margen reciente de la ruta (oferta y demanda).
7. Factor del cliente.
8. Redondeo.

Al **modificar** un envío ya pedido, los pasos 4 a 7 se toman **congelados del día en que se
pidió** y solo se recalcula lo que cambia por la ruta (km de más), según el apartado 2.
