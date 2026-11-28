import 'server-only';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { buscarCuentaHolded, fechaHolded, sincronizadoDe } from '@/lib/servidor/cobroProformas';

// VERIFICACIÓN AUTOMÁTICA POR EL CÉNTIMO (usuario, 2026-11-26). Una vez por hora (cada 10 minutos
// si alguien acaba de avisar de su transferencia) se leen (SOLO
// LECTURA) los movimientos pendientes de conciliar de la cuenta secundaria de verificación en la
// facturación (Banco Santander, parámetro dynamo_verificacion_iban). Los de 0,01 € o con un código
// VER-XXXXXX se pasan a la base de datos (verificacion_por_movimiento), que decide: verificar la
// empresa, dejarla por verificar o nada. No se concilia ni se cambia nada en la facturación.
// API: GET /treasury/accounts (busca la cuenta por su IBAN) y
//      GET /treasury/accounts/{id}/bank-movements?status=pending&start_date=…&limit=200&cursor=…
const CADA_MS = 55 * 60_000;
// Si un cliente ha pulsado «Ya la he hecho» hace menos de 6 horas, cada vez que pasa la tarea
// (cada 10 minutos) en vez de una vez por hora (usuario, 2026-11-26).
const RAPIDO_MS = 9 * 60_000;
const RAPIDO_DURANTE_MS = 6 * 3_600_000;
const PAGINAS = 5;
const CODIGO = /VER[\s\-_.]?[A-HJ-NP-Z2-9]{6}/i;
const sinEspacios = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();

type Cuenta = { id?: string; iban?: string | null };
type Movimiento = { id?: string; description?: string | null; note?: string | null; amount?: string | number; value_date?: string; booking_date?: string };
const listaDe = <T,>(d: unknown): { items: T[]; cursor: string | null; mas: boolean } => {
  const o = (d ?? {}) as { items?: T[]; data?: T[]; cursor?: string | null; has_more?: boolean };
  return { items: Array.isArray(d) ? (d as T[]) : (o.items ?? o.data ?? []), cursor: o.cursor ?? null, mas: !!o.has_more };
};

export async function revisarCentimos(forzar = false): Promise<void> {
  const sv = supabaseServicio();
  if (!sv || !holdedListo()) return;
  const { data: est } = await sv.from('verificacion_banco_estado').select('*').eq('id', true).maybeSingle();
  if (!est) return;
  const hace = est.revisado_en ? Date.now() - Date.parse(est.revisado_en) : Infinity;
  if (!forzar && hace < RAPIDO_MS) return;
  if (!forzar && hace < CADA_MS) {
    const { count: esperando } = await sv.from('clientes').select('id', { count: 'exact', head: true })
      .eq('estado_verificacion', 'no_verificada').eq('verificacion_solicitada', 'transferencia')
      .gte('verificacion_solicitada_en', new Date(Date.now() - RAPIDO_DURANTE_MS).toISOString());
    if (!esperando) return;
  }
  // Reserva de la pasada de una vez (auditoría, 2026-11-28): con llamadas simultáneas solo pasa
  // la primera; las demás no gastan consultas de la facturación.
  if (!forzar) {
    let q = sv.from('verificacion_banco_estado').update({ revisado_en: new Date().toISOString() }).eq('id', true);
    q = est.revisado_en ? q.eq('revisado_en', est.revisado_en) : q.is('revisado_en', null);
    const { data: reservada } = await q.select('id');
    if (!reservada?.length) return;
  }
  const guardar = (c: { cuenta_id?: string | null; ultimo_error: string | null }) =>
    sv.from('verificacion_banco_estado').update({ ...c, revisado_en: new Date().toISOString() }).eq('id', true);
  // Sin ninguna empresa por verificar no se gasta ninguna consulta.
  const { count } = await sv.from('clientes').select('id', { count: 'exact', head: true }).eq('estado_verificacion', 'no_verificada');
  if (!count) { await guardar({ ultimo_error: null }); return; }
  const { data: p } = await sv.from('parametros').select('valor').eq('clave', 'dynamo_verificacion_iban').maybeSingle();
  const iban = sinEspacios(p?.valor);
  if (!iban) return;

  let cuenta = est.cuenta_id as string | null;
  if (!cuenta) {
    let cursor: string | undefined;
    for (let i = 0; i < PAGINAS && !cuenta; i++) {
      const r = await leerHolded('/treasury/accounts', { type: 'bank', limit: 100, cursor });
      if (!r.ok) { console.error('[Holded] cuenta de verificación', r.error); await guardar({ ultimo_error: r.error }); return; }
      const l = listaDe<Cuenta>(r.datos);
      cuenta = l.items.find((c) => sinEspacios(c.iban) === iban)?.id ?? null;
      if (!l.mas || !l.cursor) break;
      cursor = l.cursor;
    }
    if (!cuenta) {
      const msg = 'No encuentro en la facturación la cuenta de verificación (por su IBAN): ¿está conectada en Tesorería?';
      console.error('[Holded]', msg); await guardar({ ultimo_error: msg }); return;
    }
  }
  // La última actualización de la cuenta con el banco (para el aviso de conexión caída): como
  // mucho una vez cada 6 horas, que cuesta una consulta (usuario, 2026-11-27).
  let sincronizado: Date | null = null;
  const seisH = 6 * 3_600_000;
  if (Math.floor((est.revisado_en ? Date.parse(est.revisado_en) : 0) / seisH) !== Math.floor(Date.now() / seisH)) {
    const b = await buscarCuentaHolded(iban);
    if (b.ok && b.cuenta) sincronizado = sincronizadoDe(b.cuenta);
  }
  let ultimo: string | null = null;
  // Desde 3 días antes de la última revisión (o 30 días la primera vez): lo ya mirado no se repite.
  const desde = new Date((est.revisado_en ? Date.parse(est.revisado_en) : Date.now()) - (est.revisado_en ? 3 : 30) * 86_400_000).toISOString().slice(0, 10);
  let cursor: string | undefined;
  for (let i = 0; i < PAGINAS; i++) {
    const r = await leerHolded(`/treasury/accounts/${encodeURIComponent(cuenta)}/bank-movements`, { status: 'pending', start_date: desde, limit: 200, cursor });
    if (!r.ok) {
      console.error('[Holded] movimientos de la cuenta de verificación', r.error);
      // La cuenta ya no está (o cambió): se buscará otra vez por el IBAN la próxima.
      await guardar({ ultimo_error: r.error, ...(r.estado === 404 ? { cuenta_id: null } : {}) });
      return;
    }
    const l = listaDe<Movimiento>(r.datos);
    // Rastro SIN datos personales (ni ordenante ni concepto): cuántos movimientos llegan, con qué
    // campos y cuántos son de 0,01 € o llevan un código. Para ajustar la lectura a lo que devuelve
    // de verdad la facturación (2026-11-27: el primer céntimo de prueba no se detectaba).
    const pequeños = l.items.filter((m) => { const x = Number(String(m.amount ?? '').replace(',', '.')); return x >= 0.009 && x <= 1.001; }).length;
    const conCodigo = l.items.filter((m) => CODIGO.test([m.description, m.note].filter(Boolean).join(' '))).length;
    console.info('[Holded] céntimos: página', i + 1, '· desde', desde, '· respuesta', Array.isArray(r.datos) ? 'lista' : Object.keys((r.datos ?? {}) as object).join(','),
      '· movimientos', l.items.length, '· campos', l.items[0] ? Object.keys(l.items[0]).join(',') : '-', '· de 0,01 € a 1 €', pequeños, '· con código', conCodigo,
      '· importes de ejemplo', l.items.slice(0, 5).map((m) => typeof m.amount + ':' + String(m.amount)).join(' '));
    for (const m of l.items) {
      const dia = fechaHolded(m.value_date ?? m.booking_date)?.toISOString().slice(0, 10) ?? null;
      if (dia && (!ultimo || dia > ultimo)) ultimo = dia;
      const desc = [m.description, m.note].filter(Boolean).join(' · ');
      const importe = Number(String(m.amount ?? '').replace(',', '.'));
      // Se pide 0,01 €, pero vale de 0,01 € a 1,00 € (usuario, 2026-11-27: «si alguien manda 1 €…»).
      // Lo decide la base de datos; aquí solo se descartan los que no pueden ser.
      if (!m.id || !((importe >= 0.009 && importe <= 1.001) || CODIGO.test(desc))) continue;
      const { error } = await sv.rpc('verificacion_por_movimiento', {
        p_movimiento: String(m.id), p_descripcion: desc, p_importe: Number.isFinite(importe) ? importe : 0,
        p_fecha: m.value_date ?? m.booking_date ?? new Date().toISOString(),
      });
      if (error) console.error('[Holded] verificación por movimiento', error.message);
    }
    if (!l.mas || !l.cursor) break;
    cursor = l.cursor;
  }
  await guardar({ cuenta_id: cuenta, ultimo_error: null });
  // Cómo está la conexión de esta cuenta: la base de datos avisa a Dynamo si parece caída.
  const { error: e2 } = await sv.rpc('banco_cuenta_leida', { p_cuenta: 'verificacion', p_cuenta_id: cuenta, p_error: null,
    p_ultimo_movimiento: ultimo, p_sincronizado: sincronizado ? sincronizado.toISOString() : null });
  if (e2) console.error('[Holded] estado de la cuenta de verificación', e2.message);
}
