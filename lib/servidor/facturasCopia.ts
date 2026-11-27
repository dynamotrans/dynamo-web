import 'server-only';
import { revisarCentimos } from '@/lib/servidor/verificacionBanco';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { cobrosDeHolded, copiaDeHolded, copiasDeHolded, cuentasDeHolded, formaDe, pedidosDeHolded, pedidosFacturadosDeHolded, gxDePedido, type FacturaCopia, type FacturaHolded, type PedidoFacturado, type PedidoVenta } from '@/lib/holdedFacturas';
import { apuntarConsultas, refrescarUsoReal, usoDelMes } from '@/lib/servidor/holdedUso';
import { contactosDeHolded } from '@/lib/servidor/holdedContactos';
import { hoyMadrid } from '@/lib/filtroFechas';
import { diaMas, mesesAtras, finDeMes } from '@/lib/facturasCopiaFechas';

// LA COPIA DE FACTURAS EMITIDAS, SIEMPRE AL DÍA (usuario, 2026-11-25).
// «Me basta con tener las de los últimos 12 meses de partida, y se irán acumulando a partir de
// ahí ya siempre. El tema es que son vivas: imagínate que me pagan una factura de hace 11 meses.»
// «Para cobros pendientes y riesgos, tener en cuenta importes, más que estado.»
//
// Tres trabajos, y este fichero decide cuál toca cada vez que se le llama:
//   1. PRIMERA CARGA: las emitidas de los últimos 12 meses, de la más nueva a la más antigua,
//      por tandas; si no da tiempo, se apunta por dónde va y sigue en la llamada siguiente.
//   2. LO DE CADA RATO: se piden SOLO las que tienen algo pendiente (tengan la fecha que
//      tengan) y se comparan con la copia. La que aquí debía algo y ya no viene, se ha cobrado
//      o anulado → se relee esa sola. Y al revés: la que aquí estaba pagada y vuelve a venir
//      (se corrigió un cobro) recupera su importe pendiente. Más las últimas emitidas.
//   3. REPASO DE CADA NOCHE: otra vez los últimos 6 meses, por si se corrigió algo en una ya
//      cobrada. Lo que ya no aparezca se comprueba una a una (borrada o devuelta a borrador →
//      anulada). Para lo más antiguo, «Repasar desde una fecha» (a mano, desde la pantalla).
// LOS ABONOS (facturas rectificativas) van en la misma copia, en negativo (usuario, 2026-11-26):
// se leen con la primera carga y con cada repaso; y los pendientes y los recientes, una vez por
// hora (hay pocos) o al pulsar «Actualizar ahora». Si su lectura falla, la de facturas sigue.
// LOS PEDIDOS DE VENTA SIN FACTURAR (usuario, 2026-11-26) se leen también una vez por hora: una
// FOTO entera que sustituye a la anterior, para que el crédito usado cuente los viajes hechos
// fuera de la plataforma que aún no tienen factura. Una lectura fallida no toca la foto.
// Nunca se borra nada de la copia. SOLO LECTURA de la facturación: aquí solo se escribe en
// nuestra base de datos. Topes de la facturación: 120 consultas por minuto y 30.000 al mes.
const PLAZO_MS = 42_000;          // lo que trabaja cada llamada (el servidor corta a los 60 s)
const MESES = 12;                // la primera carga: un año de historia
const MESES_REPASO = 6;          // el repaso de cada noche (usuario, 2026-11-26: «más de 6 no tiene sentido, ya lo controlo por la facturación»)
const ESPERA_MS = 100_000;        // entre dos pasadas automáticas
const ESPERA_FORZADA_MS = 15_000; // entre dos «Actualizar ahora»
const PAGINAS_MAX = 120;          // 120 × 200 = 24.000 facturas por llamada, de sobra
const RELEER_MAX = 30;            // facturas que se releen una a una en cada pasada
const CONTACTOS_POR_VEZ = 40;     // consultas de CIF por pasada (el resto, en la siguiente)
const ABONOS_CADA_MS = 3_600_000; // los abonos pendientes y recientes: una vez por hora
const FICHAS_ABONO = 10;          // fichas de abono que se leen por pasada (para saber qué factura corrigen)
const FICHAS_FACTURA = 25;        // fichas de factura que se leen por pasada (para saber de qué pedido de venta salió cada una)
type Doc = { id: string; tipo: 'factura' | 'abono' };
type Fila = FacturaCopia & { ficha?: boolean };

export type CopiaFacturas =
  | { ok: true; hecho: 'nada' | 'carga' | 'repaso' | 'al_dia'; cargando: boolean; enCurso: boolean; avisos: string[] }
  | { ok: false; conectado: boolean; error: string };

/** `repasarDesde` (AAAA-MM-DD): además de lo de cada rato, vuelve a leer todas las facturas desde
    ese día (el «Repasar desde una fecha» de la pantalla). Si no cabe en una llamada, `enCurso`
    sale a sí y la siguiente llamada sigue por donde iba. */
export async function ponerAlDiaFacturas(opts: { forzar?: boolean; repasarDesde?: string } = {}): Promise<CopiaFacturas> {
  try {
    const r = await ponerAlDia(opts);
    // El gasto oficial de consultas del mes, si toca preguntarlo (cuesta una consulta).
    if (r.ok && r.hecho !== 'nada') await refrescarUsoReal(!!opts.forzar);
    // Los céntimos de verificación de empresa (como mucho una vez por hora; solo lectura).
    // «Actualizar ahora» (forzar) también mira la cuenta del céntimo al momento.
    await revisarCentimos(!!opts.forzar).catch((e) => console.error('[Holded] céntimos de verificación', e instanceof Error ? e.message : 'fallo'));
    return r;
  } finally {
    await apuntarConsultas();      // las consultas hechas en esta llamada, pase lo que pase
  }
}

// LA DEUDA DE ESE CLIENTE, AL DÍA JUSTO ANTES DE CREAR UN ENVÍO (usuario, 2026-11-26): si
// el cliente tiene crédito, se pone al día la copia (lo que lleve más de un par de minutos sin
// leerse) antes de decidir si el envío cabe en su crédito o va con pago previo. Así, si pagó
// esta mañana, ya cuenta. Con un tope de tiempo: si la facturación tarda, se sigue con lo que
// hay (la pasada sigue sola en la siguiente). Sin crédito no hace falta: va con pago previo.
export async function refrescarAntesDeEnvio(clienteId: string | null | undefined, maxMs = 6000): Promise<void> {
  const sv = supabaseServicio();
  if (!clienteId || !holdedListo() || !sv) return;
  const { data: c } = await sv.from('clientes').select('riesgo_efectivo_euros').eq('id', clienteId).maybeSingle();
  if (!c || !(Number(c.riesgo_efectivo_euros) > 0)) return;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    ponerAlDiaFacturas().catch(() => null),
    new Promise<void>((r) => { reloj = setTimeout(r, maxMs); }),
  ]);
  if (reloj) clearTimeout(reloj);
}

const TOPE_AUTOMATICO = 0.9;      // con el 90 % del cupo del mes gastado, las pasadas automáticas se paran
const CUENTAS_CADA_MS = 24 * 3_600_000;

async function ponerAlDia(opts: { forzar?: boolean; repasarDesde?: string }): Promise<CopiaFacturas> {
  const sv = supabaseServicio();
  if (!holdedListo() || !sv) return { ok: false, conectado: false, error: 'La facturación no está conectada en este entorno.' };
  const fin = Date.now() + PLAZO_MS;
  const queda = (margen = 0) => Date.now() + margen < fin;
  const { data: e } = await sv.from('facturas_copia_estado').select('*').eq('id', true).maybeSingle();
  if (!e) return { ok: false, conectado: true, error: 'Falta el estado de la copia de facturas.' };
  if (!opts.forzar) {
    const { data: p } = await sv.from('parametros').select('valor').eq('clave', 'facturas_copia_activa').maybeSingle();
    if (p?.valor === false) return { ok: true, hecho: 'nada', cargando: !e.carga_completa_en, enCurso: !!e.barrido_tipo, avisos: [] };
    // CASI SIN CUPO (usuario, 2026-11-26): con el 90 % de las consultas del mes gastadas, la
    // plataforma deja de actualizar sola hasta el mes siguiente, para no quedarse a cero. Sigue
    // «Actualizar ahora». La pantalla lo avisa (components/panel/Facturas.tsx).
    const uso = await usoDelMes();
    if (uso && uso.usadas >= uso.limite * TOPE_AUTOMATICO) return { ok: true, hecho: 'nada', cargando: !e.carga_completa_en, enCurso: !!e.barrido_tipo, avisos: [] };
  }
  // Quien llame de más (dos pestañas, la tarea y el botón a la vez) no repite el trabajo.
  if (e.ultima_en && Date.now() - Date.parse(e.ultima_en) < (opts.forzar ? ESPERA_FORZADA_MS : ESPERA_MS)) {
    return { ok: true, hecho: 'nada', cargando: !e.carga_completa_en, enCurso: !!e.barrido_tipo, avisos: [] };
  }
  // CON MUCHAS FACTURAS PENDIENTES, MÁS ESPACIADO (tope de la facturación: 30.000 consultas al
  // mes). Pedir las pendientes cuesta una consulta por cada 200. Con pocas (hasta 800, 4
  // consultas) se hace en cada pasada, cada 10 minutos; a partir de ahí, la pasada automática
  // espera 3 minutos por consulta: con 3.400 pendientes (20.000 facturas al año), una cada 50.
  // «Actualizar ahora» no espera. La primera carga y el repaso de la noche, tampoco.
  if (!opts.forzar && e.carga_completa_en && !e.barrido_tipo && e.ultima_ok_en) {
    const { count } = await sv.from('facturas_emitidas').select('ref_externa', { count: 'exact', head: true }).gt('pendiente', 0).neq('estado', 'anulada');
    const consultas = Math.ceil((count ?? 0) / 200);
    if (consultas > 4 && Date.now() - Date.parse(e.ultima_ok_en) < consultas * 3 * 60_000) {
      return { ok: true, hecho: 'nada', cargando: false, enCurso: false, avisos: [] };
    }
  }
  const ahora = new Date().toISOString();
  const apuntar = async (cambios: Partial<typeof e>) => {
    const { error } = await sv.from('facturas_copia_estado').update(cambios).eq('id', true);
    if (error) console.error('[Holded] estado de la copia', error.message);
  };
  await apuntar({ ultima_en: ahora });
  const fallo = async (error: string): Promise<CopiaFacturas> => { await apuntar({ error: error.slice(0, 500) }); return { ok: false, conectado: true, error }; };
  const guardar = async (filas: Fila[]): Promise<string | null> => {
    for (let i = 0; i < filas.length; i += 1000) {
      const { error } = await sv.rpc('facturas_guardar', { p_facturas: filas.slice(i, i + 1000) });
      if (error) return `No se han podido guardar las facturas leídas: ${error.message}`;
    }
    return null;
  };
  const avisos: string[] = [];
  const hoy = hoyMadrid();

  // ---- ¿Hay un repaso por fechas en curso, o toca empezar uno? ------------------------------
  let b = { tipo: e.barrido_tipo, desde: e.barrido_desde, hasta: e.barrido_hasta, cobros: e.barrido_cobros, inicio: e.barrido_inicio_en };
  let cargada = !!e.carga_completa_en;
  let repasoDesde = e.repaso_desde, repasoInicio = e.repaso_inicio_en;
  if (!b.tipo) {
    const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const horas = e.repaso_en ? (Date.now() - Date.parse(e.repaso_en)) / 3_600_000 : Infinity;
    // El repaso, de madrugada (de 1 a 5); si por lo que sea lleva día y medio sin hacerse, cuando toque.
    const aMano = cargada && opts.repasarDesde && /^\d{4}-\d{2}-\d{2}$/.test(opts.repasarDesde) && opts.repasarDesde <= hoy ? opts.repasarDesde : null;
    if (!cargada || aMano || horas > 36 || (horas > 20 && hora >= 1 && hora <= 5)) {
      const desde = aMano ?? mesesAtras(hoy, cargada ? MESES_REPASO : MESES);
      b = { tipo: cargada ? 'repaso' : 'inicial', desde, hasta: hoy, cobros: desde, inicio: ahora };
      await apuntar({ barrido_tipo: b.tipo, barrido_desde: b.desde, barrido_hasta: b.hasta, barrido_cobros: b.cobros, barrido_inicio_en: b.inicio });
    }
  }

  let hecho: 'carga' | 'repaso' | 'al_dia' = 'al_dia';
  let abonosLeidos = false;        // en esta llamada se han podido leer abonos de la facturación
  if (b.tipo && b.desde) {
    hecho = b.tipo === 'inicial' ? 'carga' : 'repaso';
    // Las facturas del periodo, de la más nueva a la más antigua.
    if (b.hasta) {
      let cursor: string | undefined, visto = b.hasta, completo = false;
      for (let i = 0; i < PAGINAS_MAX && queda(); i++) {
        const r = await leerHolded('/invoices', { approval_status: 'approved', start_date: b.desde, end_date: b.hasta, sort: '-date', limit: 200, cursor });
        if (!r.ok) { await apuntar({ barrido_hasta: visto }); return fallo(r.error); }
        const p = copiasDeHolded(r.datos);
        const g = await guardar(p.facturas);
        if (g) { await apuntar({ barrido_hasta: visto }); return fallo(g); }
        for (const f of p.facturas) if (f.emision < visto) visto = f.emision;
        if (!p.hayMas || !p.cursor) { completo = true; break; }
        cursor = p.cursor;
      }
      // Y los abonos del mismo periodo (pocos: caben de una vez). Si fallan, no paran lo demás.
      if (completo) {
        const a = await abonosDe({ approval_status: 'approved', start_date: b.desde, sort: '-date' });
        if (a.ok) { const g = await guardar(a.filas); if (g) avisos.push(g); else abonosLeidos = true; }
        else { avisos.push(a.error); console.error('[Holded] abonos', a.error); }
      }
      b.hasta = completo ? null : visto;     // si no ha dado tiempo, la siguiente llamada sigue desde ese día
      await apuntar({ barrido_hasta: b.hasta });
    }
    // Después, los cobros del periodo (el día en que se pagó cada una), mes a mes.
    if (!b.hasta && b.cobros) {
      while (queda(4000) && b.cobros <= hoy) {
        const tope = finDeMes(b.cobros) < hoy ? finDeMes(b.cobros) : hoy;
        const r = await cobrosEntre(b.cobros, tope);
        if (!r.ok) { await apuntar({ barrido_cobros: b.cobros }); return fallo(r.error); }
        if (r.cobros.length) {
          const { error } = await sv.rpc('facturas_apuntar_cobros', { p_cobros: r.cobros });
          if (error) { await apuntar({ barrido_cobros: b.cobros }); return fallo(`No se han podido guardar los cobros leídos: ${error.message}`); }
        }
        b.cobros = diaMas(tope, 1);
      }
      if (b.cobros > hoy) {
        // Terminado: a partir de aquí, lo de cada rato. Se apunta qué cubrió, para comprobar lo que falte.
        const acabado = new Date().toISOString();
        await apuntar({ barrido_tipo: null, barrido_desde: null, barrido_hasta: null, barrido_cobros: null, barrido_inicio_en: null,
          repaso_en: acabado, repaso_desde: b.desde, repaso_inicio_en: b.inicio, carga_completa_en: e.carga_completa_en ?? acabado,
          // Desde qué día están TODAS: el comienzo de la primera carga, o un repaso a mano más antiguo.
          ...(b.tipo === 'inicial' || !e.copia_desde || b.desde < e.copia_desde ? { copia_desde: b.desde } : {}) });
        repasoDesde = b.desde; repasoInicio = b.inicio; cargada = true;
        b = { tipo: null, desde: null, hasta: null, cobros: null, inicio: null };
      } else {
        await apuntar({ barrido_cobros: b.cobros });
      }
    }
  }
  // La primera carga sigue a medias, o este repaso ha gastado el tiempo: lo demás, en la siguiente.
  if (!cargada || !queda(12_000)) {
    if (cargada || !b.tipo) await apuntar({ error: null });
    return { ok: true, hecho, cargando: !cargada, enCurso: !!b.tipo, avisos };
  }

  // ---- LO DE CADA RATO ----------------------------------------------------------------------
  // 1. Todas las que tienen algo pendiente de cobro, tengan la fecha que tengan.
  const pendientes: FacturaCopia[] = [];
  let cursor: string | undefined;
  for (let i = 0; ; i++) {
    if (i >= PAGINAS_MAX) return fallo('Hay demasiadas facturas pendientes para leerlas de una vez.');
    const r = await leerHolded('/invoices', { status: 'outstanding', approval_status: 'approved', limit: 200, cursor });
    if (!r.ok) return fallo(r.error);
    const p = copiasDeHolded(r.datos);
    pendientes.push(...p.facturas);
    if (!p.hayMas || !p.cursor) break;
    cursor = p.cursor;
  }
  const g = await guardar(pendientes);
  if (g) return fallo(g);

  // 1b. Los abonos con saldo (sin devolver ni compensar): una vez por hora, o al pedirlo a mano.
  const tocaAbonos = !!opts.forzar || !e.abonos_en || Date.now() - Date.parse(e.abonos_en) > ABONOS_CADA_MS;
  let abonosVienen: Set<string> | null = null;      // null = en esta pasada no se han leído
  if (tocaAbonos) {
    const a = await abonosDe({ status: 'outstanding', approval_status: 'approved' });
    if (a.ok) { const err = await guardar(a.filas); if (err) avisos.push(err); else { abonosVienen = new Set(a.filas.map((f) => f.id)); abonosLeidos = true; } }
    else { avisos.push(a.error); console.error('[Holded] abonos', a.error); }
  }

  // 2. Las que aquí debían algo y ya no vienen: cobradas o anuladas. Se relee cada una.
  //    (Un abono con saldo que ya no viene: devuelto, compensado o anulado. Solo se mira en
  //    las pasadas en que se han leído los abonos.)
  const vienen = new Set(pendientes.map((f) => f.id));
  const yaNo: Doc[] = [];
  for (let desde = 0; desde < 40_000; desde += 1000) {
    const { data, error } = await sv.from('facturas_emitidas').select('ref_externa, tipo').neq('pendiente', 0).neq('estado', 'anulada')
      .order('ref_externa').range(desde, desde + 999);
    if (error) return fallo(`No se ha podido leer la copia: ${error.message}`);
    for (const f of data ?? []) {
      if (f.tipo === 'abono') { if (abonosVienen && !abonosVienen.has(f.ref_externa)) yaNo.push({ id: f.ref_externa, tipo: 'abono' }); }
      else if (!vienen.has(f.ref_externa)) yaNo.push({ id: f.ref_externa, tipo: 'factura' });
    }
    if ((data ?? []).length < 1000) break;
  }
  let pedidosVetados = false;     // la clave no deja leer pedidos de venta: en esta pasada no se insiste
  let pedidosFoto = !!e.pedidos_en;   // la foto de pedidos se ha podido leer alguna vez
  const pedidosSePueden = () => pedidosFoto && !pedidosVetados;
  // Releer la FICHA de cada documento (factura o abono). Se apunta que se ha leído (`ficha`),
  // para no pedir la misma una y otra vez.
  // La ficha de una FACTURA dice de qué pedido de venta salió: se lee también ese pedido (una
  // vez) para apuntar el GX que lleva. Solo si los pedidos de venta se pueden leer (si la foto
  // de pedidos no se ha podido leer nunca, no se gastan consultas en balde).
  const releer = async (docs: Doc[]) => {
    const filas: Fila[] = [], fuera: string[] = [];
    const validos = docs.filter((d) => /^[0-9a-f]{24}$/i.test(d.id));
    const conPedido = new Set<string>();
    const deFactura = validos.filter((d) => d.tipo === 'factura').map((d) => d.id);
    if (pedidosSePueden() && deFactura.length) {
      const { data } = await sv.from('facturas_emitidas').select('ref_externa').in('ref_externa', deFactura).not('pedido_gx', 'is', null);
      for (const f of data ?? []) conPedido.add(f.ref_externa);
    }
    for (let i = 0; i < validos.length; i += 4) {
      await Promise.all(validos.slice(i, i + 4).map(async ({ id, tipo }) => {
        const r = await leerHolded(`${tipo === 'abono' ? '/credit-notes' : '/invoices'}/${id}`);
        if (r.ok) {
          const f = copiaDeHolded(r.datos as FacturaHolded, tipo);
          if (f) {
            const fila: Fila = { ...f, ficha: true };
            if (tipo === 'factura' && f.pedido_origen && pedidosSePueden() && !conPedido.has(id)) {
              const p = await leerHolded(`/sales-orders/${f.pedido_origen}`);
              if (p.ok) fila.pedido_gx = gxDePedido(p.datos);
              else if (p.estado === 404) fila.pedido_gx = [];        // ese pedido ya no existe: nada que apuntar
              else if (p.estado === 401 || p.estado === 403) pedidosVetados = true;
              // cualquier otro fallo: se reintenta otro día
            }
            filas.push(fila);
          }
        }
        else if (r.estado === 404) fuera.push(id);          // ya no existe en la facturación
        // cualquier otro fallo: se queda como estaba y se reintenta en la pasada siguiente
      }));
    }
    const err = await guardar(filas);
    if (err) avisos.push(err);
    if (fuera.length) { const { error } = await sv.rpc('facturas_anular', { p_ids: fuera }); if (error) avisos.push(error.message); }
  };
  if (yaNo.length) await releer(yaNo.slice(0, RELEER_MAX));
  if (yaNo.length > RELEER_MAX) avisos.push(`Quedan ${yaNo.length - RELEER_MAX} facturas por comprobar: se hará en las próximas pasadas.`);

  // 3. Las del último repaso que no aparecieron en él (borradas o devueltas a borrador).
  //    Los abonos, solo si en esta llamada se han podido leer (si no, se preguntaría en balde).
  if (queda(8000) && repasoDesde && repasoInicio) {
    const { data } = await sv.from('facturas_emitidas').select('ref_externa, tipo').gte('fecha_emision', repasoDesde).lt('leido_en', repasoInicio)
      .neq('estado', 'anulada').in('tipo', abonosLeidos ? ['factura', 'abono'] : ['factura']).limit(RELEER_MAX);
    if (data?.length) await releer(data.map((f) => ({ id: f.ref_externa, tipo: f.tipo === 'abono' ? 'abono' as const : 'factura' as const })));
  }

  // 4. Las últimas emitidas: las nuevas (también las que nacen ya cobradas) y lo recién corregido.
  if (queda(6000)) {
    const r = await leerHolded('/invoices', { approval_status: 'approved', start_date: diaMas(hoy, -45), sort: '-date', limit: 200 });
    if (r.ok) { const err = await guardar(copiasDeHolded(r.datos).facturas); if (err) avisos.push(err); }
    else avisos.push(r.error);
  }
  // 4b. Y los últimos abonos (también los que nacen ya compensados), cuando toca leerlos.
  if (tocaAbonos && queda(6000)) {
    const a = await abonosDe({ approval_status: 'approved', start_date: diaMas(hoy, -45), sort: '-date' });
    if (a.ok) { const err = await guardar(a.filas); if (err) avisos.push(err); else abonosLeidos = true; }
    else avisos.push(a.error);
    await apuntar({ abonos_en: new Date().toISOString() });
  }

  // 4c. La foto de pedidos de venta sin facturar (pendientes y facturados en parte), entera.
  //     Solo se guarda si se ha podido leer TODA; si no, se queda la anterior.
  let pedidosLeidos: PedidoVenta[] | null = null;
  if (tocaAbonos && queda(7000)) {
    const leidos: PedidoVenta[] = [];
    let bien = true;
    for (const estado of ['pending', 'partial']) {
      let cur: string | undefined;
      for (let i = 0; bien; i++) {
        if (i >= 25 || !queda(3000)) { bien = false; break; }
        const r = await leerHolded('/sales-orders', { status: estado, approval_status: 'approved', sort: '-date', limit: 200, cursor: cur });
        if (!r.ok) { bien = false; avisos.push(`Pedidos de venta: ${r.error}`); console.error('[Holded] pedidos de venta', r.error); break; }
        const p = pedidosDeHolded(r.datos);
        leidos.push(...p.pedidos);
        if (!p.hayMas || !p.cursor) break;
        cur = p.cursor;
      }
      if (!bien) break;
    }
    if (bien) {
      const { error } = await sv.rpc('pedidos_venta_guardar', { p_pedidos: leidos });
      if (error) avisos.push(`No se han podido guardar los pedidos de venta: ${error.message}`); else { pedidosLeidos = leidos; pedidosFoto = true; }
    }
  }

  // 4d. Los pedidos de venta YA FACTURADOS de los últimos 4 meses que llevan algún GX: el envío
  //     de la plataforma con ese GX está facturado (aunque su factura agrupe varios envíos y no
  //     lleve el GX). Misma cadencia que la foto de pendientes; solo se guarda si se lee ENTERA.
  if (tocaAbonos && pedidosSePueden() && queda(7000)) {
    const hechos: PedidoFacturado[] = [];
    let bien = true, cur: string | undefined;
    for (let i = 0; ; i++) {
      if (i >= 25 || !queda(3000)) { bien = false; break; }
      const r = await leerHolded('/sales-orders', { status: 'completed', approval_status: 'approved', start_date: diaMas(hoy, -120), sort: '-date', limit: 200, cursor: cur });
      if (!r.ok) { bien = false; avisos.push(`Pedidos de venta facturados: ${r.error}`); console.error('[Holded] pedidos de venta facturados', r.error); break; }
      const p = pedidosFacturadosDeHolded(r.datos);
      hechos.push(...p.pedidos);
      if (!p.hayMas || !p.cursor) break;
      cur = p.cursor;
    }
    if (bien) {
      const { error } = await sv.rpc('pedidos_venta_facturados_guardar', { p_pedidos: hechos });
      if (error) avisos.push(`No se han podido guardar los pedidos de venta facturados: ${error.message}`);
    }
  }

  // 5. Los cobros de los últimos días: el día en que se pagó cada una.
  if (queda(6000)) {
    const r = await cobrosEntre(diaMas(hoy, -10), hoy);
    if (!r.ok) avisos.push(r.error);
    else if (r.cobros.length) { const { error } = await sv.rpc('facturas_apuntar_cobros', { p_cobros: r.cobros }); if (error) avisos.push(error.message); }
  }
  // Pagadas hace poco de las que aún no se sabe el día del cobro: su ficha lo trae.
  // Cada una se pregunta UNA vez desde que cambió de estado, y como mucho otra vez al día
  // (si su ficha no trae el cobro, pedirla en cada pasada no lo iba a arreglar).
  if (queda(6000)) {
    const { data } = await sv.from('facturas_emitidas').select('ref_externa, tipo, estado_desde, ficha_en').eq('estado', 'pagada').is('pagada_el', null)
      .gte('estado_desde', new Date(Date.now() - 3 * 86_400_000).toISOString()).order('ficha_en', { ascending: true, nullsFirst: true }).limit(60);
    const ayer = Date.now() - 86_400_000;
    const toca = (data ?? []).filter((f) => (f.tipo !== 'abono' || abonosLeidos)
      && (!f.ficha_en || Date.parse(f.ficha_en) < Date.parse(f.estado_desde) || Date.parse(f.ficha_en) < ayer)).slice(0, 15);
    if (toca.length) await releer(toca.map((f) => ({ id: f.ref_externa, tipo: f.tipo === 'abono' ? 'abono' as const : 'factura' as const })));
  }
  // Los abonos de los que aún no se ha leído la ficha: es la que dice qué factura corrigen.
  if (abonosLeidos && queda(6000)) {
    const { data } = await sv.from('facturas_emitidas').select('ref_externa').eq('tipo', 'abono').is('ficha_en', null).neq('estado', 'anulada')
      .order('fecha_emision', { ascending: false }).limit(FICHAS_ABONO);
    if (data?.length) await releer(data.map((f) => ({ id: f.ref_externa, tipo: 'abono' as const })));
  }

  // Las facturas recientes de las que aún no se sabe de qué pedido de venta salieron (o cuyo
  // pedido no se pudo leer: ese se reintenta como mucho una vez al día). Con ese enlace un
  // viaje no se cuenta dos veces: ni como pedido y factura, ni como envío sin facturar y factura.
  if (queda(8000)) {
    const ayer = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await sv.from('facturas_emitidas').select('ref_externa').eq('tipo', 'factura').neq('estado', 'anulada')
      .gte('fecha_emision', diaMas(hoy, -120))
      .or(pedidosSePueden() ? `ficha_en.is.null,and(pedido_origen.not.is.null,pedido_gx.is.null,ficha_en.lt.${ayer})` : 'ficha_en.is.null')
      .order('fecha_emision', { ascending: false }).limit(FICHAS_FACTURA);
    if (data?.length) await releer(data.map((f) => ({ id: f.ref_externa, tipo: 'factura' as const })));
  }

  // 6. De qué cliente es cada una: el CIF de su contacto. Primero las que deben algo.
  if (queda(5000)) {
    const { data } = await sv.from('facturas_emitidas').select('contacto_id').is('cif', null).not('contacto_id', 'is', null)
      .order('pendiente', { ascending: false }).order('fecha_emision', { ascending: false }).limit(600);
    const vistos = await contactosDeHolded(sv, [...(data ?? []).map((f) => f.contacto_id), ...pendientes.map((f) => f.contacto_id), ...(pedidosLeidos ?? []).map((q) => q.contacto_id)], CONTACTOS_POR_VEZ);
    const { error } = await sv.rpc('facturas_casar');
    if (error) avisos.push(error.message);
    // Los pedidos se casan con su cliente al guardarlos: si en esta pasada se ha sabido el CIF
    // de alguno de sus contactos, se guarda la foto otra vez (sin volver a leerla).
    if (pedidosLeidos?.some((q) => q.contacto_id && vistos.has(q.contacto_id))) {
      const r2 = await sv.rpc('pedidos_venta_guardar', { p_pedidos: pedidosLeidos });
      if (r2.error) avisos.push(r2.error.message);
    }
  }

  // 7. El plan de cuentas (para enseñar el nombre de la cuenta contable y no su identificador):
  //    una vez al día. Si la clave no deja leerlo, se queda sin nombre y se reintenta mañana.
  //    Si se leyó pero no se guardó ninguna (la respuesta no traía lo esperado), se reintenta
  //    cada hora y se apunta la FORMA de la respuesta (nombres de campos, ningún dato).
  let sinCuentas = false;
  if (tocaAbonos && e.cuentas_en) { const { count } = await sv.from('holded_cuentas').select('cuenta_id', { count: 'exact', head: true }); sinCuentas = !count; }
  if (queda(4000) && (!e.cuentas_en || sinCuentas || Date.now() - Date.parse(e.cuentas_en) > CUENTAS_CADA_MS)) {
    const r = await leerHolded('/accounting-accounts', { include_empty: 'true', archived: 'true' });
    if (r.ok) {
      const cuentas = cuentasDeHolded(r.datos).map((c) => ({ ...c, visto_en: new Date().toISOString() }));
      if (!cuentas.length) console.error('[Holded] plan de cuentas sin cuentas; forma de la respuesta:', formaDe(r.datos).slice(0, 600));
      for (let i = 0; i < cuentas.length; i += 500) {
        const { error } = await sv.from('holded_cuentas').upsert(cuentas.slice(i, i + 500), { onConflict: 'cuenta_id' });
        if (error) { avisos.push(error.message); break; }
      }
    } else console.error('[Holded] plan de cuentas', r.error);
    await apuntar({ cuentas_en: new Date().toISOString() });
  }

  // 8. Las facturas de cada cliente, para la regla de pagos tardíos (a 60 días de la emisión).
  if (queda(3000)) { const { error } = await sv.rpc('facturas_cliente_desde_copia'); if (error) avisos.push(`Pagos tardíos: ${error.message}`); }

  await apuntar({ ultima_ok_en: new Date().toISOString(), error: null });
  if (avisos.length) console.error('[Holded] copia de facturas, avisos', avisos.join(' · ').slice(0, 800));
  return { ok: true, hecho, cargando: false, enCurso: !!b.tipo, avisos };
}

// Abonos (facturas rectificativas) de la facturación con esos filtros, todas las páginas:
// hay pocos. Ya como filas de la copia (tipo abono, importes en negativo).
async function abonosDe(filtros: Record<string, string>): Promise<{ ok: true; filas: FacturaCopia[] } | { ok: false; error: string }> {
  const filas: FacturaCopia[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const r = await leerHolded('/credit-notes', { ...filtros, limit: 200, cursor });
    if (!r.ok) return { ok: false, error: `Abonos: ${r.error}` };
    const p = copiasDeHolded(r.datos, 'abono');
    filas.push(...p.facturas);
    if (!p.hayMas || !p.cursor) break;
    cursor = p.cursor;
  }
  return { ok: true, filas };
}

// Los cobros de facturas entre dos días (los dos incluidos): de cada cobro, a qué factura
// corresponde y su fecha. Con varios cobros para una factura, la base de datos se queda el último.
async function cobrosEntre(desde: string, hasta: string): Promise<{ ok: true; cobros: { documento: string; fecha: string }[] } | { ok: false; error: string }> {
  const cobros: { documento: string; fecha: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 100; i++) {
    const r = await leerHolded('/payments', { type: 'collection', document_type: 'invoice', start_date: desde, end_date: hasta, limit: 200, cursor });
    if (!r.ok) return { ok: false, error: r.error };
    const p = cobrosDeHolded(r.datos);
    cobros.push(...p.cobros);
    if (!p.hayMas || !p.cursor) break;
    cursor = p.cursor;
  }
  return { ok: true, cobros };
}
