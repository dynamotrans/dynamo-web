import 'server-only';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { supabaseServicio } from '@/lib/supabase/servicio';

// VERIFICACIÓN AUTOMÁTICA POR EL CÉNTIMO (usuario, 2026-11-26). Una vez por hora se leen (SOLO
// LECTURA) los movimientos pendientes de conciliar de la cuenta secundaria de verificación en la
// facturación (Banco Santander, parámetro dynamo_verificacion_iban). Los de 0,01 € o con un código
// VER-XXXXXX se pasan a la base de datos (verificacion_por_movimiento), que decide: verificar la
// empresa, dejarla por verificar o nada. No se concilia ni se cambia nada en la facturación.
// API: GET /treasury/accounts (busca la cuenta por su IBAN) y
//      GET /treasury/accounts/{id}/bank-movements?status=pending&start_date=…&limit=200&cursor=…
const CADA_MS = 55 * 60_000;
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
  if (!forzar && est.revisado_en && Date.now() - Date.parse(est.revisado_en) < CADA_MS) return;
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
    for (const m of l.items) {
      const desc = [m.description, m.note].filter(Boolean).join(' · ');
      const importe = Number(String(m.amount ?? '').replace(',', '.'));
      if (!m.id || !(Math.abs(importe - 0.01) < 0.001 || CODIGO.test(desc))) continue;
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
}
