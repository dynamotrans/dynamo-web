'use client';

// Clientes (solo Dynamo): tabla y ficha con el diseño de #sec-clientes de dashboard.html
// (columnas Cliente · Contacto · Domicilio fiscal · Condiciones · Factor · Creado ·
// Estado; ficha en la ventana del panel con la rejilla .ptar-sitio-grid).
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { guardarCliente, type ClienteDatos } from '@/app/panel/(app)/clientes/acciones';
import { euros } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';
import { paisDe, telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { principal, CONTACTO_VACIO } from '@/lib/contactos';
import EditorContactos from './EditorContactos';

export type ClienteFila = ClienteDatos & {
  id: string; codigo: string; nombre_visible: string;
  creado_en: string; modificado_en: string | null;
  envios_que_cuentan: number;
};
// Regla del descuento de bienvenida (tabla `parametros`, migración factor_bienvenida).
export type Bienvenida = { pct: number; envios: number };

const ESTADOS: [ClienteDatos['estado'], string, string][] = [
  ['activa', 'Validado', 'green'], ['pendiente_verificacion', 'Pendiente', 'orange'], ['suspendida', 'Suspendido', 'red'],
];
const PLAZOS: [number, string][] = [[0, 'Contado inmediato (0 días)'], [30, '30 días'], [60, '60 días'], [90, '90 días'], [120, '120 días · por defecto']];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s: string) => { const t = String(s ?? '').trim(); if (!t) return null; const v = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

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
  plazo_pago_dias: 120, iva_pct: 21, retencion_pct: 0, recargo_equivalencia_pct: 0,
  recargo_pago_tarde_pct: 0, riesgo_cesce_euros: null, riesgo_manual_euros: null,
  factor_tarifa_pct: -7, factor_fijado_a_mano: false, permite_contraoferta: false, discrecion_comercial: false, exento_pago_previo_primer_envio: false, alta_por: null,
  cuenta_contable: '', holded_forma_pago_ref: '', anotaciones: '',
  contactos: [CONTACTO_VACIO()],
};

type Empleado = { id: string; nombre: string };

export default function Clientes({ filas, error, bienvenida, empleados = [], abrir = null }: { filas: ClienteFila[]; error: string | null; bienvenida: Bienvenida; empleados?: Empleado[]; abrir?: string | null }) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  // ?ver=<id> (p. ej. desde CESCE - Riesgos) abre su ficha directamente.
  const [ficha, setFicha] = useState<{ fila: ClienteFila | null } | null>(() => { const f = abrir ? filas.find((c) => c.id === abrir) : null; return f ? { fila: f } : null; });

  const lista = useMemo(() => {
    const w = norm(q.trim());
    if (!w) return filas;
    return filas.filter((c) => norm([c.razon_social, c.nombre_comercial, c.cif, c.codigo, c.direccion, c.codigo_postal,
      c.poblacion, c.provincia, paisDe(c.pais_codigo_iso), ...c.contactos.flatMap((k) => [k.nombre, k.telefono, k.email, k.cargo]),
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
                  <td>{(() => { const k = principal(c.contactos); return <>{k?.nombre || '—'}<div className="meta">{[telBonito(k?.telefono ?? ''), k?.email].filter(Boolean).join(' · ')}</div>{c.contactos.length > 1 && <div className="meta">+{c.contactos.length - 1} contacto{c.contactos.length > 2 ? 's' : ''} más</div>}</>; })()}</td>
                  <td>{c.direccion || '—'}<div className="meta">{[c.codigo_postal, c.poblacion, c.provincia, paisDe(c.pais_codigo_iso)].filter(Boolean).join(', ')}</div></td>
                  <td>{c.plazo_pago_dias === 0 ? 'Pago inmediato (0 días)' : `Crédito ${c.plazo_pago_dias} días`}
                    <div className="meta">{cesce > 0 ? <span style={{ color: '#0f6b3a', fontWeight: 700 }}>CESCE {euros(cesce)}</span> : 'Sin crédito CESCE'} · Dynamo {euros(dyn)}</div></td>
                  <td><Factor v={Number(c.factor_tarifa_pct)} /><div className="meta">{c.factor_fijado_a_mano ? 'fijado a mano' : 'automático'}</div></td>
                  <td>{creadoTxt(c.creado_en)}{c.modificado_en && <div className="meta">Modif. {creadoTxt(c.modificado_en)}</div>}</td>
                  <td><span className={`badge badge-${est[2]}`}>{est[1]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ficha && (
        <FichaCliente fila={ficha.fila} bienvenida={bienvenida} empleados={empleados} onCerrar={() => setFicha(null)}
          onGuardado={() => { setFicha(null); refrescar(); }} />
      )}
    </section>
  );
}

function FichaCliente({ fila, bienvenida, empleados, onCerrar, onGuardado }: { fila: ClienteFila | null; bienvenida: Bienvenida; empleados: Empleado[]; onCerrar: () => void; onGuardado: () => void }) {
  const [d, setD] = useState<ClienteDatos>(() => {
    if (!fila) return { ...NUEVO, factor_tarifa_pct: bienvenida.pct };
    const o: any = {};
    (Object.keys(NUEVO) as (keyof ClienteDatos)[]).forEach((k) => { o[k] = (fila as any)[k] ?? (NUEVO as any)[k]; });
    return o as ClienteDatos;
  });
  const [textos, setTextos] = useState({
    cesce: d.riesgo_cesce_euros == null ? '' : String(d.riesgo_cesce_euros),
    dyn: d.riesgo_manual_euros == null ? '' : String(d.riesgo_manual_euros),
    iva: String(d.iva_pct), ret: String(d.retencion_pct),
    re: String(d.recargo_equivalencia_pct), tarde: String(d.recargo_pago_tarde_pct),
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
      iva_pct: n.iva ?? 21, retencion_pct: n.ret ?? 0,
      recargo_equivalencia_pct: n.re ?? 0, recargo_pago_tarde_pct: n.tarde ?? 0,
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
  const interruptor = (k: 'permite_contraoferta' | 'discrecion_comercial' | 'exento_pago_previo_primer_envio', label: string) => (
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
          <SelectorPais id="cli-pais" valor={d.pais_codigo_iso} onCambio={(v) => { set('pais_codigo_iso', v); setTextos((t) => ({ ...t, iva: v === 'ES' ? '21' : '0' })); }} />
        </div>

        {titulo('Personas de contacto')}
        <EditorContactos valor={d.contactos} onCambio={(l) => set('contactos', l)} conFuncion
          ayuda={<>La primera es la <strong>principal</strong> (la que sale en la tabla). Pon en <strong>Contabilidad</strong> a quien recibe las facturas.</>} />

        {titulo('Condiciones')}
        <div>
          <label htmlFor="cli-plazo">Plazo de pago</label>
          <select id="cli-plazo" value={d.plazo_pago_dias} onChange={(e) => set('plazo_pago_dias', Number(e.target.value))}>
            {PLAZOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        {texto('iva', 'IVA (%) · 21 en España, 0 fuera (cámbialo si toca, p. ej. Canarias)', '21')}
        {texto('cesce', 'Importe crédito CESCE (€)', 'Ej. 40000')}
        {texto('dyn', 'Importe crédito Dynamo (€) · 0 o vacío = manda CESCE', 'Ej. 10000')}
        {texto('ret', 'Retención (%)', '0')}
        {texto('re', 'Recargo de equivalencia (%)', '0')}
        {texto('tarde', 'Recargo por pago tarde (%)', '0')}
        <div />
        {interruptor('permite_contraoferta', 'Puede hacer contraoferta de precio (si además está encendida en Parámetros)')}
        {interruptor('discrecion_comercial', 'Discreción comercial por defecto')}
        {interruptor('exento_pago_previo_primer_envio', 'Empresa conocida: sin pago previo del primer envío')}
        <div className="meta" style={{ alignSelf: 'end' }}>Solo cuenta si tiene crédito disponible. Sin crédito, todos sus envíos se pagan por adelantado.</div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cli-factor">Factor de precio del cliente (%) <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>· de −30 % a +30 %</span> <span style={{ fontWeight: 800, color: 'var(--red)' }}>· SOLO VISIBLE ADMIN — el cliente NUNCA ve este campo</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.4rem' }}>
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>−30 %</span>
            <input id="cli-factor" type="range" min={-30} max={30} step={1} value={d.factor_tarifa_pct}
              onChange={(e) => { set('factor_tarifa_pct', Number(e.target.value)); set('factor_fijado_a_mano', true); }} style={{ flex: 1, accentColor: 'var(--purple)', padding: 0, border: 'none' }} />
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>+30 %</span>
            <span style={{ minWidth: 58, textAlign: 'center' }}><Factor v={d.factor_tarifa_pct} /></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <label className="ptar-tramp-box" style={{ flex: '0 0 auto' }}>
              <input type="checkbox" className="ptar-switch-input" checked={d.factor_fijado_a_mano}
                onChange={(e) => {
                  const mano = e.target.checked;
                  set('factor_fijado_a_mano', mano);
                  // Vuelta al automático: se enseña ya lo que le tocará (el servidor lo recalcula igual).
                  if (!mano) set('factor_tarifa_pct', (fila?.envios_que_cuentan ?? 0) < bienvenida.envios ? bienvenida.pct : 0);
                }} />
              <span className="ptar-switch" aria-hidden="true" />
              <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">Automático</span><span className="tramp-on">Fijado a mano</span></span>
            </label>
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, flex: '1 1 260px' }}>
              {d.factor_fijado_a_mano
                ? <><strong>Fijado a mano:</strong> la regla automática ya no lo toca. Desactívalo para volver al automático.</>
                : <><strong>Automático:</strong> descuento de bienvenida de <strong>{bienvenida.pct} %</strong> durante los primeros <strong>{bienvenida.envios} envíos</strong>; después pasa solo a <strong>0 %</strong>.{fila ? <> Lleva <strong>{fila.envios_que_cuentan}</strong>.</> : null} Si mueves la barra, queda fijado a mano.</>}
            </span>
          </div>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cli-altapor">Alta dada por <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>· comisiones</span></label>
          <select id="cli-altapor" value={d.alta_por ?? ''} onChange={(e) => set('alta_por', e.target.value || null)}>
            <option value="">Alta online</option>
            {empleados.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.3rem', lineHeight: 1.4 }}>Empleado que captó o dio de alta al cliente, para el control de comisiones. Si se registró por la web queda <strong>Alta online</strong> (sin comisión de empleado).</div>
        </div>

        {titulo('Contabilidad (Holded)')}
        {campo('cuenta_contable', 'Cuenta contable', 'Ej. 43000123')}
        {campo('holded_forma_pago_ref', 'Forma de pago en Holded (ID)', 'Ej. 5f2a…')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cli-notas">Notas internas</label>
          <textarea id="cli-notas" rows={3} placeholder="Solo visibles para el equipo Dynamo" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} />
        </div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {guardando && <Cargando texto={fila ? 'Guardando cambios' : 'Creando cliente'} />}
    </Modal>
  );
}
