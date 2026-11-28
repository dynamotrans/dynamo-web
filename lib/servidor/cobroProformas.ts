import 'server-only';
import { leerHolded } from '@/lib/servidor/holded';
import { supabaseServicio } from '@/lib/supabase/servicio';

// COBRO AUTOMÁTICO DE PROFORMAS (usuario, 2026-11-27). Se leen (SOLO LECTURA) los movimientos
// pendientes de conciliar de la cuenta PRINCIPAL de Dynamo en la facturación (la del IBAN de las
// proformas, parámetro dynamo_iban). Los que llevan una referencia de envío (PRO-GX…, GX… o sus
// cifras) se pasan a la base de datos (pago_por_movimiento), que decide: envío pagado (y empresa
// verificada si el ordenante cuadra), o aviso a Dynamo. No se concilia ni se cambia nada en la
// facturación. Además se apunta cómo está la conexión de la cuenta (banco_cuenta_leida): si lleva
// días sin movimientos o sin actualizarse con el banco, la base de datos avisa a Dynamo.
//
// Consultas a la facturación (tope del plan al mes): cada 15 minutos solo si hay envíos esperando
// pago por adelantado; si no, cada 6 horas (para vigilar la conexión). La lista de cuentas (para
// saber la última actualización con el banco) se pide como mucho una vez cada 6 horas.
const CON_PENDIENTES_MS = 14 * 60_000;
const SIN_PENDIENTES_MS = 6 * 3_600_000;
const PAGINAS = 5;
const REFERENCIA = /(?:^|[^0-9])(?:GX[\s\-_.]?)?[0-9]{6,12}(?=[^0-9]|$)/i;
const sinEspacios = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const bloque6h = (t: number) => Math.floor(t / SIN_PENDIENTES_MS);

type Cuenta = Record<string, unknown> & { id?: string; iban?: string | null };
type Movimiento = { id?: string; description?: string | null; note?: string | null; amount?: string | number; value_date?: string; booking_date?: string; date?: string | number };

export const listaHolded = <T,>(d: unknown): { items: T[]; cursor: string | null; mas: boolean } => {
  const o = (d ?? {}) as { items?: T[]; data?: T[]; cursor?: string | null; has_more?: boolean };
  return { items: Array.isArray(d) ? (d as T[]) : (o.items ?? o.data ?? []), cursor: o.cursor ?? null, mas: !!o.has_more };
};

/** Una fecha de la facturación (texto o segundos/milisegundos) a Date, o null. */
export function fechaHolded(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d;
}
/** La última actualización con el banco, si la ficha de la cuenta la trae (no sabemos aún con qué nombre). */
export function sincronizadoDe(c: Cuenta): Date | null {
  for (const k of ['lastSync', 'last_sync', 'lastSyncAt', 'last_sync_at', 'lastSynchronization', 'syncedAt', 'synced_at', 'lastUpdate', 'last_update', 'updatedAt', 'updated_at']) {
    const d = fechaHolded(c[k]);
    if (d) return d;
  }
  return null;
}
const diaDe = (m: Movimiento): string | null => {
  const d = fechaHolded(m.value_date ?? m.booking_date ?? m.date);
  return d ? d.toISOString().slice(0, 10) : null;
};
const importeDe = (m: Movimiento) => Number(String(m.amount ?? '').replace(',', '.'));

/** Busca una cuenta del banco en la facturación por su IBAN. Una consulta por página de cuentas. */
export async function buscarCuentaHolded(iban: string): Promise<{ ok: true; cuenta: Cuenta | null } | { ok: false; error: string; estado: number }> {
  let cursor: string | undefined;
  for (let i = 0; i < PAGINAS; i++) {
    const r = await leerHolded('/treasury/accounts', { type: 'bank', limit: 100, cursor });
    if (!r.ok) return { ok: false, error: r.error, estado: r.estado };
    const l = listaHolded<Cuenta>(r.datos);
    const c = l.items.find((x) => sinEspacios(x.iban) === iban);
    if (c) {
      // Rastro sin datos: qué campos trae la ficha de la cuenta (para saber dónde viene la última actualización).
      console.info('[Holded] cuenta del banco: campos', Object.keys(c).join(','), '· actualizada', sincronizadoDe(c)?.toISOString() ?? '¿?');
      return { ok: true, cuenta: c };
    }
    if (!l.mas || !l.cursor) break;
    cursor = l.cursor;
  }
  return { ok: true, cuenta: null };
}

export async function revisarProformas(forzar = false): Promise<void> {
  const sv = supabaseServicio();
  if (!sv) return;
  const { data: est } = await sv.from('banco_cuentas_estado').select('*').eq('cuenta', 'principal').maybeSingle();
  if (!est) return;
  const ahora = Date.now();
  const antes = est.revisado_en ? Date.parse(est.revisado_en) : 0;
  const { count: pendientes } = await sv.from('envios').select('id', { count: 'exact', head: true })
    .eq('estado_pago_previo', 'pendiente').eq('estado', 'programado');
  if (!forzar && ahora - antes < (pendientes ? CON_PENDIENTES_MS : SIN_PENDIENTES_MS)) return;
  const { data: p } = await sv.from('parametros').select('valor').eq('clave', 'dynamo_iban').maybeSingle();
  const iban = sinEspacios(p?.valor);
  if (!iban) return;
  const apuntar = (c: { cuenta_id?: string | null; error?: string | null; ultimo?: string | null; sincronizado?: Date | null }) =>
    sv.rpc('banco_cuenta_leida', { p_cuenta: 'principal', p_cuenta_id: c.cuenta_id ?? null, p_error: c.error ?? null,
      p_ultimo_movimiento: c.ultimo ?? null, p_sincronizado: c.sincronizado ? c.sincronizado.toISOString() : null });

  let cuenta = est.cuenta_id as string | null;
  let sincronizado: Date | null = null;
  if (!cuenta || forzar || bloque6h(antes) !== bloque6h(ahora)) {
    const b = await buscarCuentaHolded(iban);
    if (!b.ok) { console.error('[Holded] cuenta principal', b.error); await apuntar({ error: b.error }); return; }
    if (!b.cuenta?.id) {
      const msg = 'No encuentro en la facturación la cuenta principal (por su IBAN): ¿está conectada en Tesorería?';
      console.error('[Holded]', msg); await apuntar({ error: msg }); return;
    }
    cuenta = b.cuenta.id;
    sincronizado = sincronizadoDe(b.cuenta);
  }
  // Pendientes desde 3 días antes de la última lectura (30 días la primera vez).
  const desde = new Date((antes || ahora) - (antes ? 3 : 30) * 86_400_000).toISOString().slice(0, 10);
  let ultimo: string | null = null;
  let cursor: string | undefined;
  for (let i = 0; i < PAGINAS; i++) {
    const r = await leerHolded(`/treasury/accounts/${encodeURIComponent(cuenta!)}/bank-movements`, { status: 'pending', start_date: desde, limit: 200, cursor });
    if (!r.ok) {
      console.error('[Holded] movimientos de la cuenta principal', r.error);
      await apuntar({ cuenta_id: r.estado === 404 ? null : cuenta, error: r.error });
      if (r.estado === 404) await sv.from('banco_cuentas_estado').update({ cuenta_id: null }).eq('cuenta', 'principal');
      return;
    }
    const l = listaHolded<Movimiento>(r.datos);
    let conReferencia = 0;
    for (const m of l.items) {
      const dia = diaDe(m);
      if (dia && (!ultimo || dia > ultimo)) ultimo = dia;
      const desc = [m.description, m.note].filter(Boolean).join(' · ');
      const importe = importeDe(m);
      if (!m.id || !(importe > 0) || !REFERENCIA.test(desc)) continue;
      conReferencia++;
      const { error } = await sv.rpc('pago_por_movimiento', {
        p_movimiento: String(m.id), p_descripcion: desc, p_importe: importe, p_fecha: m.value_date ?? m.booking_date ?? new Date().toISOString(),
      });
      if (error) console.error('[Holded] pago por movimiento', error.message);
    }
    // Rastro sin datos personales: cuántos movimientos y cuántos con una referencia de envío.
    console.info('[Holded] cuenta principal: página', i + 1, '· movimientos', l.items.length, '· con referencia', conReferencia);
    if (!l.mas || !l.cursor) break;
    cursor = l.cursor;
  }
  // Si entre los pendientes no hay nada de los últimos 4 días (puede que ya estén conciliados),
  // se mira el movimiento más reciente de cualquier estado, antes de dar la conexión por caída.
  const hace4 = new Date(ahora - 4 * 86_400_000).toISOString().slice(0, 10);
  if (!ultimo || ultimo < hace4) {
    const r = await leerHolded(`/treasury/accounts/${encodeURIComponent(cuenta!)}/bank-movements`, { start_date: new Date(ahora - 10 * 86_400_000).toISOString().slice(0, 10), limit: 200 });
    if (r.ok) for (const m of listaHolded<Movimiento>(r.datos).items) { const d = diaDe(m); if (d && (!ultimo || d > ultimo)) ultimo = d; }
  }
  const { error } = await apuntar({ cuenta_id: cuenta, ultimo, sincronizado });
  if (error) console.error('[Holded] estado de la cuenta principal', error.message);
}
