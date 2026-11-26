import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { cobrosDeHolded, copiaDeHolded, copiasDeHolded, type FacturaCopia, type FacturaHolded } from '@/lib/holdedFacturas';
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

export type CopiaFacturas =
  | { ok: true; hecho: 'nada' | 'carga' | 'repaso' | 'al_dia'; cargando: boolean; enCurso: boolean; avisos: string[] }
  | { ok: false; conectado: boolean; error: string };

/** `repasarDesde` (AAAA-MM-DD): además de lo de cada rato, vuelve a leer todas las facturas desde
    ese día (el «Repasar desde una fecha» de la pantalla). Si no cabe en una llamada, `enCurso`
    sale a sí y la siguiente llamada sigue por donde iba. */
export async function ponerAlDiaFacturas(opts: { forzar?: boolean; repasarDesde?: string } = {}): Promise<CopiaFacturas> {
  const sv = supabaseServicio();
  if (!holdedListo() || !sv) return { ok: false, conectado: false, error: 'La facturación no está conectada en este entorno.' };
  const fin = Date.now() + PLAZO_MS;
  const queda = (margen = 0) => Date.now() + margen < fin;
  const { data: e } = await sv.from('facturas_copia_estado').select('*').eq('id', true).maybeSingle();
  if (!e) return { ok: false, conectado: true, error: 'Falta el estado de la copia de facturas.' };
  if (!opts.forzar) {
    const { data: p } = await sv.from('parametros').select('valor').eq('clave', 'facturas_copia_activa').maybeSingle();
    if (p?.valor === false) return { ok: true, hecho: 'nada', cargando: !e.carga_completa_en, enCurso: !!e.barrido_tipo, avisos: [] };
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
  const guardar = async (filas: FacturaCopia[]): Promise<string | null> => {
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
          repaso_en: acabado, repaso_desde: b.desde, repaso_inicio_en: b.inicio, carga_completa_en: e.carga_completa_en ?? acabado });
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

  // 2. Las que aquí debían algo y ya no vienen: cobradas o anuladas. Se relee cada una.
  const vienen = new Set(pendientes.map((f) => f.id));
  const yaNo: string[] = [];
  for (let desde = 0; desde < 40_000; desde += 1000) {
    const { data, error } = await sv.from('facturas_emitidas').select('ref_externa').gt('pendiente', 0).neq('estado', 'anulada')
      .order('ref_externa').range(desde, desde + 999);
    if (error) return fallo(`No se ha podido leer la copia: ${error.message}`);
    for (const f of data ?? []) if (!vienen.has(f.ref_externa)) yaNo.push(f.ref_externa);
    if ((data ?? []).length < 1000) break;
  }
  const releer = async (ids: string[]) => {
    const filas: FacturaCopia[] = [], fuera: string[] = [];
    const validos = ids.filter((id) => /^[0-9a-f]{24}$/i.test(id));
    for (let i = 0; i < validos.length; i += 4) {
      await Promise.all(validos.slice(i, i + 4).map(async (id) => {
        const r = await leerHolded(`/invoices/${id}`);
        if (r.ok) { const f = copiaDeHolded(r.datos as FacturaHolded); if (f) filas.push(f); }
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
  if (queda(8000) && repasoDesde && repasoInicio) {
    const { data } = await sv.from('facturas_emitidas').select('ref_externa').gte('fecha_emision', repasoDesde).lt('leido_en', repasoInicio)
      .neq('estado', 'anulada').limit(RELEER_MAX);
    if (data?.length) await releer(data.map((f) => f.ref_externa));
  }

  // 4. Las últimas emitidas: las nuevas (también las que nacen ya cobradas) y lo recién corregido.
  if (queda(6000)) {
    const r = await leerHolded('/invoices', { approval_status: 'approved', start_date: diaMas(hoy, -45), sort: '-date', limit: 200 });
    if (r.ok) { const err = await guardar(copiasDeHolded(r.datos).facturas); if (err) avisos.push(err); }
    else avisos.push(r.error);
  }

  // 5. Los cobros de los últimos días: el día en que se pagó cada una.
  if (queda(6000)) {
    const r = await cobrosEntre(diaMas(hoy, -10), hoy);
    if (!r.ok) avisos.push(r.error);
    else if (r.cobros.length) { const { error } = await sv.rpc('facturas_apuntar_cobros', { p_cobros: r.cobros }); if (error) avisos.push(error.message); }
  }
  // Pagadas hace poco de las que aún no se sabe el día del cobro: su ficha lo trae.
  if (queda(6000)) {
    const { data } = await sv.from('facturas_emitidas').select('ref_externa').eq('estado', 'pagada').is('pagada_el', null)
      .gte('estado_desde', new Date(Date.now() - 3 * 86_400_000).toISOString()).limit(15);
    if (data?.length) await releer(data.map((f) => f.ref_externa));
  }

  // 6. De qué cliente es cada una: el CIF de su contacto. Primero las que deben algo.
  if (queda(5000)) {
    const { data } = await sv.from('facturas_emitidas').select('contacto_id').is('cif', null).not('contacto_id', 'is', null)
      .order('pendiente', { ascending: false }).order('fecha_emision', { ascending: false }).limit(600);
    await contactosDeHolded(sv, [...(data ?? []).map((f) => f.contacto_id), ...pendientes.map((f) => f.contacto_id)], CONTACTOS_POR_VEZ);
    const { error } = await sv.rpc('facturas_casar');
    if (error) avisos.push(error.message);
  }

  await apuntar({ ultima_ok_en: new Date().toISOString(), error: null });
  if (avisos.length) console.error('[Holded] copia de facturas, avisos', avisos.join(' · ').slice(0, 800));
  return { ok: true, hecho, cargando: false, enCurso: !!b.tipo, avisos };
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
