'use client';

// Clientes (solo Dynamo): tabla y ficha con el diseño de #sec-clientes de dashboard.html
// (columnas Cliente · Contacto · Domicilio fiscal · Condiciones · Factor · Creado ·
// Estado; ficha en la ventana del panel con la rejilla .ptar-sitio-grid).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import { guardarCliente, type ClienteDatos } from '@/app/panel/(app)/clientes/acciones';
import { euros } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';

export type ClienteFila = ClienteDatos & {
  id: string; codigo: string; nombre_visible: string;
  creado_en: string; modificado_en: string | null;
};

const PAISES: [string, string][] = [
  ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'], ['DE', 'Alemania'], ['IT', 'Italia'],
  ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['LU', 'Luxemburgo'], ['AT', 'Austria'],
  ['PL', 'Polonia'], ['CZ', 'Rep. Checa'], ['CH', 'Suiza'], ['DK', 'Dinamarca'], ['GB', 'Reino Unido'],
];
const PREFIJOS: [string, string][] = [
  ['+34', 'España'], ['+351', 'Portugal'], ['+33', 'Francia'], ['+49', 'Alemania'], ['+39', 'Italia'],
  ['+44', 'R. Unido'], ['+31', 'P. Bajos'], ['+32', 'Bélgica'], ['+352', 'Luxemburgo'], ['+43', 'Austria'],
  ['+48', 'Polonia'], ['+420', 'Chequia'], ['+41', 'Suiza'], ['+40', 'Rumanía'], ['+212', 'Marruecos'],
  ['+380', 'Ucrania'], ['+86', 'China'], ['+1', 'EE. UU.'],
];
const ESTADOS: [ClienteDatos['estado'], string, string][] = [
  ['activa', 'Validado', 'green'], ['pendiente_verificacion', 'Pendiente', 'orange'], ['suspendida', 'Suspendido', 'red'],
];
const PLAZOS: [number, string][] = [[0, 'Contado inmediato (0 días)'], [30, '30 días'], [60, '60 días'], [90, '90 días'], [120, '120 días · por defecto']];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s: string) => { const t = String(s ?? '').trim(); if (!t) return null; const v = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const paisDe = (c: string) => PAISES.find(([k]) => k === c)?.[1] ?? c;

function partirTel(t: string): { pref: string; num: string } {
  const v = (t || '').replace(/\s/g, '');
  const p = [...PREFIJOS].sort((a, b) => b[0].length - a[0].length).find(([k]) => v.startsWith(k));
  return p ? { pref: p[0], num: v.slice(p[0].length) } : { pref: '+34', num: v.replace(/^\+/, '') };
}
function telBonito(t: string) {
  if (!t) return '';
  const { pref, num: n } = partirTel(t);
  return `${pref} ${n.replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
}

// Etiqueta del factor (verde si cobra por encima, rojo si es descuento, gris a 0).
function Factor({ v }: { v: number }) {
  const st = v > 0 ? { background: 'rgba(34,165,90,0.14)', color: '#0f6b3a' }
    : v < 0 ? { background: 'rgba(217,48,37,0.12)', color: '#c0392b' }
    : { background: 'var(--gray-100)', color: 'var(--gray-500)' };
  return <span style={{ display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: 999, fontWeight: 800, fontSize: 'var(--fs-s)', whiteSpace: 'nowrap', ...st }}>{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v)} %</span>;
}

const NUEVO: ClienteDatos = {
  razon_social: '', nombre_comercial: '', cif: '', estado: 'activa',
  direccion: '', codigo_postal: '', poblacion: '', provincia: '', pais_codigo_iso: 'ES',
  plazo_pago_dias: 120, iva_porcentaje: 21, retencion_porcentaje: 0, recargo_equivalencia_porcentaje: 0,
  recargo_pago_tarde_porcentaje: 0, riesgo_cesce_euros: null, riesgo_manual_euros: null,
  factor_tarifa_porcentaje: -7, permite_contraoferta: false, discrecion_comercial: false,
  cuenta_contable: '', forma_pago_holded_id: '', anotaciones: '',
  contacto_nombre: '', contacto_telefono: '', contacto_email: '',
};

export default function Clientes({ filas, error }: { filas: ClienteFila[]; error: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<{ fila: ClienteFila | null } | null>(null);

  const lista = useMemo(() => {
    const w = norm(q.trim());
    if (!w) return filas;
    return filas.filter((c) => norm([c.razon_social, c.nombre_comercial, c.cif, c.codigo, c.direccion, c.codigo_postal,
      c.poblacion, c.provincia, paisDe(c.pais_codigo_iso), c.contacto_nombre, c.contacto_telefono, c.contacto_email,
      c.anotaciones].filter(Boolean).join(' ')).includes(w));
  }, [filas, q]);

  return (
    <section className="section active" id="sec-clientes">
      <div className="sec-header">
        <h2>Clientes ({lista.length})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Nuevo cliente</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Ficha de cada cliente: datos fiscales, contacto y condiciones de pago. Pulsa una fila para ver o editar la ficha.
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, CIF, email, teléfono, localidad…" />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los clientes: {error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Cliente</th><th>Contacto</th><th>Domicilio fiscal</th><th>Condiciones</th>
            <th>Factor<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>solo admin</span></th>
            <th>Creado · Modificado</th><th>Estado</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length === 0 ? 'Todavía no hay clientes. Da de alta el primero con «+ Nuevo cliente».' : 'Sin clientes que coincidan'}
              </td></tr>
            ) : lista.map((c) => {
              const est = ESTADOS.find(([k]) => k === c.estado) ?? ESTADOS[0];
              const cesce = Number(c.riesgo_cesce_euros) || 0, dyn = Number(c.riesgo_manual_euros) || 0;
              return (
                <tr key={c.id} onClick={() => setFicha({ fila: c })} style={{ cursor: 'pointer' }}>
                  <td><strong>{c.nombre_visible}</strong><div className="meta">{c.cif}{c.nombre_comercial ? ` · ${c.razon_social}` : ''}</div></td>
                  <td>{c.contacto_nombre || '—'}<div className="meta">{[telBonito(c.contacto_telefono), c.contacto_email].filter(Boolean).join(' · ')}</div></td>
                  <td>{c.direccion || '—'}<div className="meta">{[c.codigo_postal, c.poblacion, c.provincia, paisDe(c.pais_codigo_iso)].filter(Boolean).join(', ')}</div></td>
                  <td>{c.plazo_pago_dias === 0 ? 'Pago inmediato (0 días)' : `Crédito ${c.plazo_pago_dias} días`}
                    <div className="meta">{cesce > 0 ? <span style={{ color: '#0f6b3a', fontWeight: 700 }}>CESCE {euros(cesce)}</span> : 'Sin crédito CESCE'} · Dynamo {euros(dyn)}</div></td>
                  <td><Factor v={Number(c.factor_tarifa_porcentaje)} /></td>
                  <td>{creadoTxt(c.creado_en)}{c.modificado_en && <div className="meta">Modif. {creadoTxt(c.modificado_en)}</div>}</td>
                  <td><span className={`badge badge-${est[2]}`}>{est[1]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ficha && (
        <FichaCliente fila={ficha.fila} onCerrar={() => setFicha(null)}
          onGuardado={() => { setFicha(null); router.refresh(); }} />
      )}
    </section>
  );
}

function FichaCliente({ fila, onCerrar, onGuardado }: { fila: ClienteFila | null; onCerrar: () => void; onGuardado: () => void }) {
  const [d, setD] = useState<ClienteDatos>(() => {
    if (!fila) return { ...NUEVO };
    const o: any = {};
    (Object.keys(NUEVO) as (keyof ClienteDatos)[]).forEach((k) => { o[k] = (fila as any)[k] ?? (NUEVO as any)[k]; });
    return o as ClienteDatos;
  });
  const tel = partirTel(d.contacto_telefono);
  const [pref, setPref] = useState(tel.pref);
  const [telNum, setTelNum] = useState(tel.num);
  const [textos, setTextos] = useState({
    cesce: d.riesgo_cesce_euros == null ? '' : String(d.riesgo_cesce_euros),
    dyn: d.riesgo_manual_euros == null ? '' : String(d.riesgo_manual_euros),
    iva: String(d.iva_porcentaje), ret: String(d.retencion_porcentaje),
    re: String(d.recargo_equivalencia_porcentaje), tarde: String(d.recargo_pago_tarde_porcentaje),
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof ClienteDatos>(k: K, v: ClienteDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    if (!d.razon_social.trim() || !d.cif.trim()) { setError('La razón social y el CIF/NIF son obligatorios.'); return; }
    const n = { cesce: num(textos.cesce), dyn: num(textos.dyn), iva: num(textos.iva), ret: num(textos.ret), re: num(textos.re), tarde: num(textos.tarde) };
    if (Object.values(n).some((v) => Number.isNaN(v))) { setError('Hay un importe o porcentaje que no es un número.'); return; }
    setGuardando(true);
    const r = await guardarCliente(fila?.id ?? null, {
      ...d,
      riesgo_cesce_euros: n.cesce, riesgo_manual_euros: n.dyn,
      iva_porcentaje: n.iva ?? 21, retencion_porcentaje: n.ret ?? 0,
      recargo_equivalencia_porcentaje: n.re ?? 0, recargo_pago_tarde_porcentaje: n.tarde ?? 0,
      contacto_telefono: telNum.trim() ? pref + telNum.replace(/\D/g, '') : '',
    });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onGuardado();
  }

  const campo = (id: keyof ClienteDatos, label: string, ph?: string, full?: boolean) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`cli-${id}`}>{label}</label>
      <input id={`cli-${id}`} type="text" value={String(d[id] ?? '')} placeholder={ph}
        onChange={(e) => set(id, e.target.value as never)} />
    </div>
  );
  const texto = (k: keyof typeof textos, label: string, ph?: string) => (
    <div>
      <label htmlFor={`cli-t-${k}`}>{label}</label>
      <input id={`cli-t-${k}`} type="text" inputMode="decimal" value={textos[k]} placeholder={ph}
        onChange={(e) => setTextos((t) => ({ ...t, [k]: e.target.value }))} />
    </div>
  );
  const interruptor = (k: 'permite_contraoferta' | 'discrecion_comercial', label: string) => (
    <div>
      <label>{label}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
      </label>
    </div>
  );
  const titulo = (t: string) => <div style={{ gridColumn: '1/-1', marginTop: '0.6rem' }} className="ptar-section-head">{t}</div>;

  return (
    <Modal abierto titulo={fila ? 'Editar cliente' : 'Nuevo cliente'}
      sub={fila ? `${fila.nombre_visible} · ${fila.codigo}` : 'Alta de un cliente en el catálogo interno'}
      icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
      onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : fila ? 'Guardar cambios' : 'Crear cliente'}</button>
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creado: {creadoTxt(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${creadoTxt(fila.modificado_en)}` : ''}
        </div>
      )}
      <div className="ptar-sitio-grid">
        {titulo('Empresa')}
        {campo('razon_social', 'Razón social *', 'Ej. Marbex Industrial S.L.', true)}
        {campo('nombre_comercial', 'Nombre comercial (opcional)', 'Si se le conoce por otro nombre')}
        {campo('cif', 'CIF / NIF *', 'B12345678 / 12345678Z')}
        <div>
          <label htmlFor="cli-estado">Estado</label>
          <select id="cli-estado" value={d.estado} onChange={(e) => set('estado', e.target.value as ClienteDatos['estado'])}>
            {ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>

        {titulo('Domicilio fiscal')}
        {campo('direccion', 'Dirección (calle y número)', 'Calle y número', true)}
        {campo('codigo_postal', 'Código postal', '41001')}
        {campo('poblacion', 'Población', 'Sevilla')}
        {campo('provincia', 'Provincia', 'Sevilla')}
        <div>
          <label htmlFor="cli-pais">País</label>
          <select id="cli-pais" value={d.pais_codigo_iso} onChange={(e) => set('pais_codigo_iso', e.target.value)}>
            {PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </div>

        {titulo('Contacto')}
        {campo('contacto_nombre', 'Persona de contacto', 'Nombre y apellidos', true)}
        <div>
          <label htmlFor="cli-tel">Teléfono</label>
          <div className="tel-group">
            <select className="tel-pref" aria-label="Prefijo de país" value={pref} onChange={(e) => setPref(e.target.value)}>
              {PREFIJOS.map(([p, n]) => <option key={p} value={p}>{p} {n}</option>)}
            </select>
            <input id="cli-tel" type="tel" inputMode="tel" value={telNum} placeholder="600 000 000" onChange={(e) => setTelNum(e.target.value)} />
          </div>
        </div>
        {campo('contacto_email', 'Email (contabilidad y gerencia)', 'administracion@dominio.com')}

        {titulo('Condiciones')}
        <div>
          <label htmlFor="cli-plazo">Plazo de pago</label>
          <select id="cli-plazo" value={d.plazo_pago_dias} onChange={(e) => set('plazo_pago_dias', Number(e.target.value))}>
            {PLAZOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        {texto('iva', 'IVA (%)', '21')}
        {texto('cesce', 'Importe crédito CESCE (€)', 'Ej. 40000')}
        {texto('dyn', 'Importe crédito Dynamo (€)', 'Ej. 10000')}
        {texto('ret', 'Retención (%)', '0')}
        {texto('re', 'Recargo de equivalencia (%)', '0')}
        {texto('tarde', 'Recargo por pago tarde (%)', '0')}
        <div />
        {interruptor('permite_contraoferta', 'Puede hacer contraoferta de precio')}
        {interruptor('discrecion_comercial', 'Discreción comercial por defecto')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cli-factor">Factor de precio del cliente (%) <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>· de −30 % a +30 %</span> <span style={{ fontWeight: 800, color: 'var(--red)' }}>· SOLO VISIBLE ADMIN — el cliente NUNCA ve este campo</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.4rem' }}>
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>−30 %</span>
            <input id="cli-factor" type="range" min={-30} max={30} step={1} value={d.factor_tarifa_porcentaje}
              onChange={(e) => set('factor_tarifa_porcentaje', Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--purple)', padding: 0, border: 'none' }} />
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>+30 %</span>
            <span style={{ minWidth: 58, textAlign: 'center' }}><Factor v={d.factor_tarifa_porcentaje} /></span>
          </div>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.4rem', lineHeight: 1.4 }}>
            <strong>Por defecto −7 %</strong> al dar de alta un cliente (descuento de captación); súbelo a <strong>0 %</strong> u otro valor cuando lo veas.
          </div>
        </div>

        {titulo('Contabilidad (Holded)')}
        {campo('cuenta_contable', 'Cuenta contable', 'Ej. 43000123')}
        {campo('forma_pago_holded_id', 'Forma de pago en Holded (ID)', 'Ej. 5f2a…')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cli-notas">Notas internas</label>
          <textarea id="cli-notas" rows={3} placeholder="Solo visibles para el equipo Dynamo" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} />
        </div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
    </Modal>
  );
}
