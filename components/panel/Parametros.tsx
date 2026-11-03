'use client';

// Parámetros de la plataforma: cada regla que tiene un número (descuento de bienvenida,
// pronto pago, tarifas de almacén, PIN, reservas…) se cambia aquí, sin tocar el código.
// Los ve todo Dynamo; solo un ADMIN los cambia. Cada cambio queda en la auditoría.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { guardarParametro } from '@/app/panel/(app)/parametros/acciones';
import { creadoTxt } from '@/lib/envios';

// Datos que deciden a quién paga el cliente: solo se cambian en Supabase (la base de datos
// lo impone; migración parametros_blindados). Aquí se ven, sin poder tocarlos.
const BLINDADOS = ['dynamo_iban', 'dynamo_banco', 'dynamo_bic', 'dynamo_razon_social', 'dynamo_cif'];

export type ParametroFila = { clave: string; valor: unknown; descripcion: string; modificado_en: string | null };

// Grupos por el principio de la clave (lo que no encaje, en «Otros»).
const GRUPOS: [string, string, (k: string) => boolean][] = [
  ['clientes', 'Clientes y precios', (k) => k.startsWith('factor_') || k.startsWith('contraoferta')],
  ['pronto', 'Pronto pago a transportistas', (k) => k.startsWith('pronto_pago') || k.startsWith('plazo_pago')],
  ['ofertas', 'Ofertas, reservas y bolsas de carga', (k) => k.startsWith('oferta') || k.startsWith('reserva') || k.startsWith('bolsa')],
  ['almacen', 'Almacenamientos', (k) => k.startsWith('almacen')],
  ['pin', 'PIN de recogida y entrega', (k) => k.startsWith('pin_')],
  ['holded', 'Holded (facturación)', (k) => k.startsWith('holded')],
  ['plataforma', 'Plataforma', (k) => k.startsWith('mantenimiento')],
];
const grupoDe = (k: string) => GRUPOS.find(([, , f]) => f(k))?.[0] ?? 'otros';
const texto = (v: unknown) => (v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

export default function Parametros({ filas, esAdmin, error }: { filas: ParametroFila[]; esAdmin: boolean; error: string | null }) {
  const grupos = useMemo(() => {
    const m = new Map<string, ParametroFila[]>();
    filas.forEach((p) => m.set(grupoDe(p.clave), [...(m.get(grupoDe(p.clave)) ?? []), p]));
    return [...GRUPOS.map(([k, t]) => [k, t] as [string, string]), ['otros', 'Otros'] as [string, string]]
      .filter(([k]) => m.has(k)).map(([k, t]) => ({ t, filas: m.get(k)! }));
  }, [filas]);
  return (
    <section className="section active" id="sec-parametros">
      <div className="sec-header"><h2>Parámetros</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Los números que mueven las reglas de la plataforma. Se aplican al momento y cada cambio queda registrado (quién y cuándo).
        {!esAdmin && <> Los puede <strong>ver</strong> todo el equipo; solo un <strong>administrador</strong> los cambia.</>}
      </p>
      {error && <div className="pt-aviso error"><div>No se han podido cargar: {error}</div></div>}
      {grupos.map((g) => (
        <div key={g.t} style={{ marginBottom: '1.1rem' }}>
          <div className="ptar-section-head" style={{ marginBottom: '0.5rem' }}>{g.t}</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: '45%' }}>Para qué sirve</th><th>Valor</th><th>Último cambio</th></tr></thead>
              <tbody>{g.filas.map((p) => <Fila key={p.clave} p={p} esAdmin={esAdmin} />)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function Fila({ p, esAdmin }: { p: ParametroFila; esAdmin: boolean }) {
  const router = useRouter();
  const tipo = typeof p.valor === 'boolean' ? 'si_no' : typeof p.valor === 'number' ? 'numero' : 'texto';
  const [v, setV] = useState(texto(p.valor));
  const [estado, setEstado] = useState<null | 'guardando' | 'ok' | string>(null);
  const cambiado = v !== texto(p.valor);
  const blindado = BLINDADOS.includes(p.clave);
  const puede = esAdmin && !blindado;

  async function guardar(valor: unknown) {
    setEstado('guardando');
    const r = await guardarParametro(p.clave, valor);
    setEstado(r.ok ? 'ok' : r.error);
    if (r.ok) router.refresh();
  }
  function guardarTexto() {
    if (tipo === 'numero') {
      const n = Number(v.replace(',', '.'));
      if (!v.trim() || !Number.isFinite(n)) { setEstado('Tiene que ser un número.'); return; }
      guardar(n);
    } else if (p.valor === null) {
      // Vacío = sin valor (null); si escriben un número, se guarda como número.
      const t = v.trim(), n = Number(t.replace(',', '.'));
      guardar(!t ? null : Number.isFinite(n) ? n : t);
    } else guardar(v);
  }

  return (
    <tr>
      <td>{p.descripcion}<div className="meta" style={{ fontFamily: 'monospace' }}>{p.clave}</div>
        {blindado && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Por seguridad, solo se cambia en Supabase (Table Editor → parametros).</div>}</td>
      <td style={{ minWidth: 220 }}>
        {tipo === 'si_no' ? (
          <label className="ptar-tramp-box" style={{ display: 'inline-flex' }}>
            <input type="checkbox" className="ptar-switch-input" checked={p.valor === true} disabled={!puede || estado === 'guardando'}
              onChange={(e) => guardar(e.target.checked)} />
            <span className="ptar-switch" aria-hidden="true" />
            <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
          </label>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="text" inputMode={tipo === 'numero' ? 'decimal' : 'text'} value={v} disabled={!puede} onChange={(e) => { setV(e.target.value); setEstado(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && cambiado) guardarTexto(); }} className="param-input" style={{ maxWidth: 200 }} aria-label={p.descripcion} />
            {puede && cambiado && <button className="btn-primary" style={{ padding: '0.4rem 0.8rem' }} onClick={guardarTexto} disabled={estado === 'guardando'}>Guardar</button>}
          </div>
        )}
        {estado === 'guardando' && <div className="meta">Guardando…</div>}
        {estado === 'ok' && <div className="meta" style={{ color: '#0f6b3a', fontWeight: 700 }}>Guardado</div>}
        {estado && estado !== 'ok' && estado !== 'guardando' && <div className="meta" style={{ color: 'var(--red)', fontWeight: 700 }}>{estado}</div>}
      </td>
      <td>{p.modificado_en ? creadoTxt(p.modificado_en) : '—'}</td>
    </tr>
  );
}
