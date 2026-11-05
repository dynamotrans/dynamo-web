'use client';

// Transportistas (solo Dynamo): tabla y ficha con el diseño de #sec-transportistas de
// dashboard.html (Transportista · Contacto · Código bolsa · Puntuación · Flota · Creado).
// La flota NO se edita aquí: sale de los vehículos dados de alta y de los envíos.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { guardarTransportista, type TransportistaDatos } from '@/app/panel/(app)/transportistas/acciones';

import { fecha as fmtFecha, fechaHora } from '@/lib/formato';
import { telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { principal, CONTACTO_VACIO } from '@/lib/contactos';
import EditorContactos from './EditorContactos';

type Flota = { tractoras: number; rigidos: number; remolques: number; adr: boolean; matriculas: string[] };
export type TransportistaFila = TransportistaDatos & {
  id: string; codigo: string; nombre_visible: string;
  valoracion_dynamo: number | null; valoracion_dynamo_votos: number;
  valoracion_clientes?: number | null; valoracion_clientes_votos?: number;
  creado_en: string; modificado_en: string | null;
  flota: Flota; envios: number;
};

const ESTADOS: [TransportistaDatos['estado_operativo'], string, string, { bg: string; fg: string; bd: string }][] = [
  ['activo', 'Activo · ofertar y cargar', 'Ofertar', { bg: '#eafaf0', fg: '#0f6b3a', bd: '#b7ebcd' }],
  ['no_ofertar', 'Activo · no ofertar, sí cargar', 'No ofertar', { bg: '#fff7e6', fg: '#8a5a00', bd: '#ffd591' }],
  ['suspendido', 'Suspendido · no ofertar ni cargar', 'Suspendido', { bg: '#fdecec', fg: '#b42318', bd: '#f5b5b5' }],
];
const BOLSAS: [string, string][] = [['wtransnet', 'Wtransnet'], ['teleroute', 'Teleroute'], ['bursa_transport', 'Bursa Transport'], ['123cargo', '123cargo'], ['', 'Ninguna']];
const PLAZOS: [number, string][] = [[0, 'Contado (0 días)'], [30, '30 días'], [60, '60 días · por defecto'], [90, '90 días']];
const CAMIONES: [string, string][] = [['', 'Sin preferencia'], ['trailer_tauliner', 'Tráiler tauliner (lona)'], ['rigido_plataforma', 'Rígido con plataforma']];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s: string) => { const t = String(s ?? '').trim(); if (!t) return null; const v = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const bolsaDe = (b: string | null) => BOLSAS.find(([k]) => k === (b ?? ''))?.[1] ?? '';

// Días hasta que vence el seguro CMR (negativo = vencido).
function diasSeguro(v: string | null | undefined): number | null {
  if (!v) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(v + 'T00:00:00').getTime() - hoy.getTime()) / 86400000);
}
function AvisoSeguro({ vence, ficha }: { vence: string | null | undefined; ficha?: boolean }) {
  const d = diasSeguro(vence);
  if (d == null || d > 30) return null;
  return <div className={ficha ? undefined : 'meta'} style={{ color: d < 0 ? '#b42318' : '#b45309', fontWeight: 700, ...(ficha ? { fontSize: 'var(--fs-s)', marginTop: '0.25rem' } : {}) }}>
    {d < 0 ? `Seguro CMR vencido (${fmtFecha(vence!)})` : `Seguro CMR vence en ${d} día${d === 1 ? '' : 's'}`}
  </div>;
}
function Estado({ e }: { e: TransportistaDatos['estado_operativo'] }) {
  const x = ESTADOS.find(([k]) => k === e) ?? ESTADOS[0];
  return <span className="badge" style={{ background: x[3].bg, color: x[3].fg, border: `1px solid ${x[3].bd}` }}>{x[2]}</span>;
}
function Estrellas({ v, n }: { v: number | null; n: number }) {
  if (v == null || !n) return <span style={{ color: 'var(--gray-500)' }}>sin valorar</span>;
  return <span style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#f5b301' }}>★</span> <strong>{Number(v).toFixed(1).replace('.', ',')}</strong> <span style={{ color: 'var(--gray-500)' }}>({n})</span></span>;
}

const NUEVO: TransportistaDatos = {
  razon_social: '', nombre_comercial: '', cif: '', estado_operativo: 'activo', bolsa: 'wtransnet', codigo_bolsa: '',
  direccion: '', codigo_postal: '', poblacion: '', provincia: '', pais_codigo_iso: 'ES',
  plazo_pago_dias: 60, pronto_pago: true, iva_pct: 21, retencion_pct: 0,
  nima: '', tiene_almacen: false, tipo_camion_defecto: '',
  seguro_cmr_compania: '', seguro_cmr_poliza: '', seguro_cmr_vence: '',
  cuenta_contable: '', holded_forma_pago_ref: '', anotaciones: '', anotaciones_incidencias: '',
  contactos: [CONTACTO_VACIO('trafico')],
};

export default function Transportistas({ filas, error, abrirId }: { filas: TransportistaFila[]; error: string | null; abrirId?: string }) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fAdr, setFAdr] = useState('');
  // ?ver=<id>: abre esa ficha (p. ej. desde el aviso de un alta online en la ficha del envío).
  const [ficha, setFicha] = useState<{ fila: TransportistaFila | null } | null>(() => { const f = abrirId ? filas.find((x) => x.id === abrirId) : null; return f ? { fila: f } : null; });

  const lista = useMemo(() => {
    const w = norm(q.trim());
    return filas
      .filter((t) => !fEstado || t.estado_operativo === fEstado)
      .filter((t) => !fAdr || (fAdr === 'si') === t.flota.adr)
      .filter((t) => !w || norm([t.razon_social, t.nombre_comercial, t.cif, t.codigo, t.codigo_bolsa, bolsaDe(t.bolsa),
        ...t.contactos.flatMap((k) => [k.nombre, k.telefono, k.email]), t.poblacion, t.provincia, t.nima,
        ...t.flota.matriculas].filter(Boolean).join(' ')).includes(w));
  }, [filas, q, fEstado, fAdr]);

  return (
    <section className="section active" id="sec-transportistas">
      <div className="sec-header">
        <h2>Transportistas ({lista.length})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Nuevo transportista</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Ficha de cada transportista: datos fiscales, contacto, código de bolsa de carga y flota. Pulsa una fila para ver o editar la ficha.
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, CIF, código de bolsa, teléfono, matrícula…" />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Estado (todos)</option>
          {ESTADOS.map(([k, , c]) => <option key={k} value={k}>{c}</option>)}
        </select>
        <select value={fAdr} onChange={(e) => setFAdr(e.target.value)} aria-label="Filtrar por ADR">
          <option value="">ADR (todos)</option>
          <option value="si">Con ADR</option>
          <option value="no">Sin ADR</option>
        </select>
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los transportistas: {error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Transportista</th><th>Contacto</th><th>Código bolsa de carga</th><th>Puntuación</th><th>Flota</th><th>Creado · Modificado</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length === 0 ? 'Todavía no hay transportistas. Da de alta el primero con «+ Nuevo transportista».' : 'Sin transportistas que coincidan'}
              </td></tr>
            ) : lista.map((t) => {
              const f = t.flota;
              const camiones = f.tractoras + f.rigidos;
              return (
                <tr key={t.id} onClick={() => setFicha({ fila: t })} style={{ cursor: 'pointer' }}>
                  <td><strong>{t.nombre_visible}</strong> <Estado e={t.estado_operativo} />
                    <div className="meta">{t.cif}{t.poblacion ? ` · ${t.poblacion}` : ''}</div>
                    <AvisoSeguro vence={t.seguro_cmr_vence} />
                  </td>
                  <td>{(() => { const k = principal(t.contactos, 'trafico') ?? principal(t.contactos); return <>{k?.nombre || '—'}<div className="meta">{[telBonito(k?.telefono ?? ''), k?.email].filter(Boolean).join(' · ')}</div>{t.contactos.length > 1 && <div className="meta">+{t.contactos.length - 1} contacto{t.contactos.length > 2 ? 's' : ''} más</div>}</>; })()}</td>
                  <td>{t.codigo_bolsa ? <><span className="dtc-mat">{t.codigo_bolsa}</span><div className="meta">{bolsaDe(t.bolsa)}</div></> : t.bolsa ? <span className="meta">{bolsaDe(t.bolsa)} · sin código</span> : '—'}</td>
                  <td>Dynamo: <Estrellas v={t.valoracion_dynamo} n={t.valoracion_dynamo_votos} /><div className="meta">Clientes: <Estrellas v={t.valoracion_clientes ?? null} n={t.valoracion_clientes_votos ?? 0} /></div></td>
                  <td>{camiones ? <strong>{camiones} {camiones === 1 ? 'camión' : 'camiones'}</strong> : '—'}
                    {f.adr && <> <span className="badge" style={{ background: '#fdecec', color: '#b42318', border: '1px solid #f5b5b5' }}>ADR</span></>}
                    <div className="meta">{t.envios ? `${t.envios} envío${t.envios === 1 ? '' : 's'}` : 'sin envíos aún'}{f.remolques ? ` · ${f.remolques} remolque${f.remolques === 1 ? '' : 's'}` : ''}</div>
                  </td>
                  <td>{fechaHora(t.creado_en)}{t.modificado_en && <div className="meta">Modif. {fechaHora(t.modificado_en)}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ficha && (
        <FichaTransportista fila={ficha.fila} onCerrar={() => setFicha(null)}
          onGuardado={() => { setFicha(null); refrescar(); }} />
      )}
    </section>
  );
}

function FichaTransportista({ fila, onCerrar, onGuardado }: { fila: TransportistaFila | null; onCerrar: () => void; onGuardado: () => void }) {
  const [d, setD] = useState<TransportistaDatos>(() => {
    if (!fila) return { ...NUEVO };
    const o: any = {};
    (Object.keys(NUEVO) as (keyof TransportistaDatos)[]).forEach((k) => { o[k] = (fila as any)[k] ?? (NUEVO as any)[k]; });
    return o as TransportistaDatos;
  });
  const [textos, setTextos] = useState({ iva: String(d.iva_pct), ret: String(d.retencion_pct) });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof TransportistaDatos>(k: K, v: TransportistaDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    if (!d.razon_social.trim() || !d.cif.trim()) { setError('La empresa y el CIF/NIF son obligatorios.'); return; }
    const iva = num(textos.iva), ret = num(textos.ret);
    if (Number.isNaN(iva) || Number.isNaN(ret)) { setError('El IVA o la retención no son un número.'); return; }
    setGuardando(true);
    const r = await guardarTransportista(fila?.id ?? null, {
      ...d, iva_pct: iva ?? 21, retencion_pct: ret ?? 0,
    });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onGuardado();
  }

  const campo = (id: keyof TransportistaDatos, label: React.ReactNode, ph?: string, full?: boolean, type = 'text') => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`tra-${id}`}>{label}</label>
      <input id={`tra-${id}`} type={type} value={String(d[id] ?? '')} placeholder={ph}
        onChange={(e) => set(id, e.target.value as never)} />
    </div>
  );
  const interruptor = (k: 'pronto_pago' | 'tiene_almacen', label: string, ayuda?: string) => (
    <div>
      <label>{label}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
      </label>
      {ayuda && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.25rem' }}>{ayuda}</div>}
    </div>
  );
  const titulo = (t: string) => <div style={{ gridColumn: '1/-1', marginTop: '0.6rem' }} className="ptar-section-head">{t}</div>;
  const nota = (t: React.ReactNode) => <div style={{ gridColumn: '1/-1', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.5, marginTop: '-0.2rem' }}>{t}</div>;
  const caja = { border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '0.6rem 0.8rem', background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--navy)' } as const;
  const est = ESTADOS.find(([k]) => k === d.estado_operativo) ?? ESTADOS[0];
  const f = fila?.flota;

  return (
    <Modal abierto titulo={fila ? 'Editar transportista' : 'Nuevo transportista'}
      sub={fila ? `${fila.nombre_visible} · ${fila.codigo}` : 'Alta de un transportista en el catálogo interno'}
      icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>}
      onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{fila ? 'Guardar cambios' : 'Crear transportista'}</button>
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creado: {fechaHora(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${fechaHora(fila.modificado_en)}` : ''}
        </div>
      )}
      <div className="ptar-sitio-grid">
        {titulo('Empresa')}
        {campo('razon_social', 'Empresa / Nombre *', 'Razón social o nombre del autónomo', true)}
        {campo('nombre_comercial', 'Nombre comercial (opcional)', 'Si se le conoce por otro nombre')}
        {campo('cif', 'CIF / NIF *', 'B12345678 / 12345678Z')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="tra-estado">Estado operativo <span className="badge" style={{ background: est[3].bg, color: est[3].fg, border: `1px solid ${est[3].bd}`, marginLeft: '0.35rem' }}>{est[2]}</span>
            <span style={{ fontWeight: 800, color: 'var(--red)', marginLeft: '0.4rem' }}>· SOLO ADMIN — el transportista no lo ve</span></label>
          <select id="tra-estado" value={d.estado_operativo} onChange={(e) => set('estado_operativo', e.target.value as TransportistaDatos['estado_operativo'])}>
            {ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tra-bolsa">Bolsa de carga</label>
          <select id="tra-bolsa" value={d.bolsa ?? ''} onChange={(e) => { set('bolsa', e.target.value); if (!e.target.value) set('codigo_bolsa', ''); }}>
            {BOLSAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tra-codigo_bolsa">Código bolsa de carga</label>
          <input id="tra-codigo_bolsa" type="text" value={d.codigo_bolsa} placeholder={d.bolsa ? 'Ej. 482113' : 'Sin bolsa'} disabled={!d.bolsa}
            onChange={(e) => set('codigo_bolsa', e.target.value)} />
        </div>
        {!d.bolsa && nota('Sin bolsa de carga: su alta online queda pendiente de revisión (solo se aceptan transportistas de las bolsas de Alpega).')}

        {titulo('Domicilio fiscal')}
        {campo('direccion', 'Dirección (calle y número)', 'Calle y número', true)}
        {campo('codigo_postal', 'Código postal', '41001')}
        {campo('poblacion', 'Población', 'Sevilla')}
        {campo('provincia', 'Provincia', 'Sevilla')}
        <div>
          <label htmlFor="tra-pais">País</label>
          <SelectorPais id="tra-pais" valor={d.pais_codigo_iso} onCambio={(v) => set('pais_codigo_iso', v)} />
        </div>

        {titulo('Personas de contacto')}
        <EditorContactos valor={d.contactos} onCambio={(l) => set('contactos', l)} conFuncion funcionNueva="trafico"
          ayuda={<>Los de <strong>tráfico</strong> reciben los avisos de la operativa (envíos, recogidas, incidencias). Los de <strong>contabilidad</strong> son <strong>SOLO ADMIN</strong> (facturas): el transportista no los ve.</>} />

        {titulo('Pago')}
        <div>
          <label htmlFor="tra-plazo">Plazo de pago (lo que paga Dynamo)</label>
          <select id="tra-plazo" value={d.plazo_pago_dias} onChange={(e) => set('plazo_pago_dias', Number(e.target.value))}>
            {PLAZOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        {interruptor('pronto_pago', 'Se le ofrece pronto pago', 'Cobrar antes a cambio de un pequeño descuento, al aceptar el envío.')}
        <div><label htmlFor="tra-iva">IVA (%)</label><input id="tra-iva" type="text" inputMode="decimal" value={textos.iva} onChange={(e) => setTextos((t) => ({ ...t, iva: e.target.value }))} /></div>
        <div><label htmlFor="tra-ret">Retención (%)</label><input id="tra-ret" type="text" inputMode="decimal" value={textos.ret} onChange={(e) => setTextos((t) => ({ ...t, ret: e.target.value }))} /></div>

        {titulo('Operativa')}
        {campo('nima', 'Nº de NIMA (residuos)', 'Texto libre, como lo dé el transportista')}
        <div>
          <label htmlFor="tra-camion">Camión habitual</label>
          <select id="tra-camion" value={d.tipo_camion_defecto ?? ''} onChange={(e) => set('tipo_camion_defecto', e.target.value)}>
            {CAMIONES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        {interruptor('tiene_almacen', 'Tiene almacén logístico')}
        <div />
        {campo('seguro_cmr_compania', 'Seguro CMR · compañía', 'Ej. Mapfre')}
        {campo('seguro_cmr_poliza', 'Seguro CMR · nº de póliza', 'Ej. 0961-…')}
        <div>
          <label htmlFor="tra-vence">Seguro CMR · vence</label>
          <input id="tra-vence" type="date" value={d.seguro_cmr_vence ?? ''} onChange={(e) => set('seguro_cmr_vence', e.target.value)} />
          <AvisoSeguro vence={d.seguro_cmr_vence} ficha />
        </div>
        <div />
        {fila && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>Flota (de los vehículos dados de alta)</label>
            <div style={{ ...caja, fontWeight: 700 }}>
              {f && f.tractoras + f.rigidos + f.remolques
                ? <>{f.tractoras} tractora{f.tractoras === 1 ? '' : 's'} · {f.rigidos} rígido{f.rigidos === 1 ? '' : 's'} · {f.remolques} remolque{f.remolques === 1 ? '' : 's'}{f.adr ? ' · con ADR' : ''} · {fila.envios} envío{fila.envios === 1 ? '' : 's'}</>
                : <>Aún sin vehículos dados de alta · {fila.envios} envío{fila.envios === 1 ? '' : 's'}</>}
            </div>
            {nota('No se edita aquí: los vehículos se dan de alta al aceptar los envíos (matrícula, ITV, seguro).')}
          </div>
        )}
        {fila && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>Puntuación interna de Dynamo <span style={{ color: '#b42318', fontWeight: 800 }}>· SOLO ADMIN</span></label>
            <div style={caja}><Estrellas v={fila.valoracion_dynamo} n={fila.valoracion_dynamo_votos} /></div>
            {nota('No se edita: se alimenta de las valoraciones de los envíos entregados.')}
          </div>
        )}
        {fila && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>Puntuación de los clientes <span style={{ color: '#b42318', fontWeight: 800 }}>· SOLO ADMIN</span></label>
            <div style={caja}><Estrellas v={fila.valoracion_clientes ?? null} n={fila.valoracion_clientes_votos ?? 0} /></div>
            {nota('La ponen los clientes al recibir sus envíos (1 a 5 estrellas). El transportista no la ve.')}
          </div>
        )}

        {titulo('Contabilidad (Holded) y notas')}
        {campo('cuenta_contable', 'Cuenta contable', 'Ej. 40000123')}
        {campo('holded_forma_pago_ref', 'Forma de pago en Holded (ID)', 'Ej. 5f2a…')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="tra-inc">Incidencias (historial)</label>
          <textarea id="tra-inc" rows={2} placeholder="Retrasos, daños, no presentados…" value={d.anotaciones_incidencias} onChange={(e) => set('anotaciones_incidencias', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="tra-notas">Notas internas</label>
          <textarea id="tra-notas" rows={3} placeholder="Solo visibles para el equipo Dynamo" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} />
        </div>
        {titulo('Documentación')}
        <div style={{ gridColumn: '1/-1' }}>
          {fila ? <Documentos dueno={{ campo: 'transportista_id', id: fila.id }} max={5} tipos={['hoja_cif', 'seguro_cmr', 'tarjeta_transporte', 'dni', 'otro']}
            ayuda={<>Hoja CIF, seguro CMR, tarjeta de transporte… <strong>Máximo 5.</strong> El transportista también verá los suyos cuando tenga su panel.</>} />
            : <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: 0 }}>Crea el transportista y, al abrir su ficha, podrás subir su documentación (máx. 5).</p>}
        </div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {guardando && <Cargando texto={fila ? 'Guardando cambios' : 'Creando transportista'} />}
    </Modal>
  );
}
