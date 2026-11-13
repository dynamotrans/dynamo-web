'use client';

// Transportistas (solo Dynamo): tabla y ficha con el diseño de #sec-transportistas de
// dashboard.html (Transportista · Contacto · Código bolsa · Puntuación · Flota · Creado).
// La flota NO se edita aquí: sale de los vehículos dados de alta y de los envíos.
import { useState } from 'react';
import Paginador from './Paginador';
import { BuscadorUrl } from './BuscadorUrl';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { SIN_CONEXION } from '@/lib/mensajeError';
import { borrarTransportista, guardarTransportista, flotaDetalle, type TransportistaDatos, type FlotaDetalle } from '@/app/panel/(app)/transportistas/acciones';

import { fecha as fmtFecha, fechaHora, numero } from '@/lib/formato';
import { telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { principal, CONTACTO_VACIO } from '@/lib/contactos';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';
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

const num = (s: string) => { const t = String(s ?? '').trim(); if (!t) return null; const v = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const bolsaDe = (b: string | null) => BOLSAS.find(([k]) => k === (b ?? ''))?.[1] ?? '';

// Días hasta que vence el seguro CMR (negativo = vencido).
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
  nima: '', tiene_almacen: false, reparto_urbano: false,
  cuenta_contable: '', holded_forma_pago_ref: '', anotaciones: '', anotaciones_incidencias: '',
  contactos: [CONTACTO_VACIO('trafico')],
};

// Lo que la página ha pedido a la base de datos (filtros de la URL y total de la búsqueda).
export type ListaTransportistas = { q: string; estado: string; adr: string; pagina: number; porPagina: number; total: number };

export default function Transportistas({ filas, error, abrirId, lista, admin }: { filas: TransportistaFila[]; error: string | null; abrirId?: string; lista: ListaTransportistas; admin?: boolean }) {
  const refrescar = useRefrescar();
  const url = (p: number, cambios: Partial<ListaTransportistas> = {}) => {
    const v = { ...lista, ...cambios };
    const u = new URLSearchParams();
    if (v.q) u.set('q', v.q); if (v.estado) u.set('estado', v.estado); if (v.adr) u.set('adr', v.adr);
    if (p > 1) u.set('p', String(p)); if (v.porPagina !== 20) u.set('n', String(v.porPagina));
    const s = u.toString(); return `/panel/transportistas${s ? `?${s}` : ''}`;
  };
  const enviar = (ev: React.ChangeEvent<HTMLSelectElement>) => ev.currentTarget.form?.requestSubmit();
  // ?ver=<id>: abre esa ficha (p. ej. desde el aviso de un alta online en la ficha del envío).
  const [ficha, setFicha] = useState<{ fila: TransportistaFila | null } | null>(() => { const f = abrirId ? filas.find((x) => x.id === abrirId) : null; return f ? { fila: f } : null; });

  return (
    <section className="section active" id="sec-transportistas">
      <div className="sec-header">
        <h2>Transportistas ({numero(lista.total, 0)})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Nuevo transportista</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Ficha de cada transportista: datos fiscales, contacto, código de bolsa de carga y flota. Pulsa una fila para ver o editar la ficha.
      </p>
      <BuscadorUrl accion="/panel/transportistas" valor={lista.q} placeholder="Buscar por empresa, CIF, código de bolsa, teléfono, matrícula…" campos={<>
        <select name="estado" defaultValue={lista.estado} onChange={enviar} aria-label="Filtrar por estado">
          <option value="">Estado (todos)</option>
          {ESTADOS.map(([k, , c]) => <option key={k} value={k}>{c}</option>)}
        </select>
        <select name="adr" defaultValue={lista.adr} onChange={enviar} aria-label="Filtrar por ADR">
          <option value="">ADR (todos)</option>
          <option value="si">Con ADR</option>
          <option value="no">Sin ADR</option>
        </select>
        {lista.porPagina !== 20 && <input type="hidden" name="n" value={lista.porPagina} />}
      </>} />
      {error && <div className="pt-aviso error">No se han podido cargar los transportistas: {error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Transportista</th><th>Contacto</th><th>Código bolsa de carga</th><th>Puntuación</th><th>Flota</th><th>Creado · Modificado</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {!lista.q && !lista.estado && !lista.adr ? 'Todavía no hay transportistas. Da de alta el primero con «+ Nuevo transportista».' : 'Sin transportistas que coincidan'}
              </td></tr>
            ) : filas.map((t) => {
              const f = t.flota;
              const camiones = f.tractoras + f.rigidos;
              return (
                <tr key={t.id} onClick={() => setFicha({ fila: t })} style={{ cursor: 'pointer' }}>
                  <td><strong>{t.nombre_visible}</strong> <Estado e={t.estado_operativo} />
                    <div className="meta">{t.cif}{t.poblacion ? ` · ${t.poblacion}` : ''}</div>
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
      <Paginador total={lista.total} pagina={lista.pagina} porPagina={lista.porPagina} url={(p) => url(p)} nombre="transportistas" nombreUno="transportista" />

      {ficha && (
        <FichaTransportista fila={ficha.fila} admin={admin} onCerrar={() => setFicha(null)}
          onGuardado={() => { setFicha(null); refrescar(); }} />
      )}
    </section>
  );
}

function FichaTransportista({ fila, admin, onCerrar, onGuardado }: { fila: TransportistaFila | null; admin?: boolean; onCerrar: () => void; onGuardado: () => void }) {
  const [d, setD] = useState<TransportistaDatos>(() => {
    if (!fila) return { ...NUEVO };
    const o: Record<string, unknown> = {};
    (Object.keys(NUEVO) as (keyof TransportistaDatos)[]).forEach((k) => { o[k] = fila[k] ?? NUEVO[k]; });
    return o as TransportistaDatos;
  });
  const [textos, setTextos] = useState({ iva: String(d.iva_pct), ret: String(d.retencion_pct) });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Borrado lógico (solo Admin Master): ventana roja y hay que escribir «confirmar».
  const [pideBorrar, setPideBorrar] = useState(false);
  const [txtBorrar, setTxtBorrar] = useState('');
  const [borrando, setBorrando] = useState(false);
  // FLOTA al detalle (usuario, 2026-11-13): la caja de la flota se pulsa y despliega
  // debajo los vehículos (matrículas, vencimientos, ADR, plataforma) y los chóferes.
  const [verFlota, setVerFlota] = useState(false);
  const [flotaD, setFlotaD] = useState<FlotaDetalle | null>(null);
  async function borrar() {
    if (!fila || txtBorrar.trim().toLowerCase() !== 'confirmar') return;
    setBorrando(true); setError(null);
    const r = await borrarTransportista(fila.id).catch(() => ({ ok: false as const, error: SIN_CONEXION }));
    setBorrando(false);
    if (!r.ok) { setError(r.error); return; }
    onGuardado();
  }
  const set = <K extends keyof TransportistaDatos>(k: K, v: TransportistaDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    if (!d.razon_social.trim() || !d.cif.trim()) {
      setError('La empresa y el CIF/NIF son obligatorios.');
      avisaFaltas([!d.razon_social.trim() && 'tra-razon_social', !d.cif.trim() && 'tra-cif'].filter(Boolean) as string[]);
      return;
    }
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
  const interruptor = (k: 'pronto_pago' | 'tiene_almacen' | 'reparto_urbano', label: string, ayuda?: string) => (
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
        <button className="btn-ghost" onClick={onCerrar} disabled={guardando || borrando}>Cancelar</button>
        {fila && admin && <button className="btn-ghost" style={{ color: '#dc2626' }} disabled={guardando || borrando}
          onClick={() => { setPideBorrar(true); setTxtBorrar(''); setTimeout(() => document.getElementById('tra-borrar-confirm')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0); }}>Borrar</button>}
        <button className="btn-primary" onClick={guardar} disabled={guardando || borrando}>{fila ? 'Guardar cambios' : 'Crear transportista'}</button>
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creado: {fechaHora(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${fechaHora(fila.modificado_en)}` : ''}
        </div>
      )}
      {pideBorrar && fila && (
        <div id="tra-borrar-confirm" style={{ margin: '0 0 0.9rem', padding: '0.8rem 0.9rem', border: '1.5px solid #f5b5b5', borderRadius: 10, background: '#fdecec', color: '#b42318', fontSize: 'var(--fs-m)', lineHeight: 1.5 }}>
          <strong>¿Borrar este transportista?</strong> Desaparece de la lista, del buscador y de las ofertas (las vivas se caducan al momento). Sus envíos y documentos ya hechos <strong>conservan todos los datos</strong>. Con envíos en marcha asignados no se puede borrar.
          <div style={{ marginTop: '0.6rem' }}>
            <label htmlFor="tra-borrar-txt" style={{ color: '#b42318', fontWeight: 800 }}>Escribe <strong>confirmar</strong> para activar el botón</label>
            <input id="tra-borrar-txt" value={txtBorrar} onChange={(e) => setTxtBorrar(e.target.value)} placeholder="confirmar" autoComplete="off" style={{ display: 'block', width: '100%', marginTop: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} disabled={borrando || txtBorrar.trim().toLowerCase() !== 'confirmar'} onClick={borrar}>{borrando ? 'Borrando…' : 'Borrar definitivamente'}</button>
            <button className="btn-ghost" onClick={() => setPideBorrar(false)} disabled={borrando}>No, volver</button>
          </div>
        </div>
      )}
      <div className="ptar-sitio-grid">
        {titulo('Empresa')}
        {campo('razon_social', <>Empresa / Nombre <Req /></>, 'Razón social o nombre del autónomo', true)}
        {campo('nombre_comercial', <>Nombre comercial <Req si={false} /></>, 'Si se le conoce por otro nombre')}
        {campo('cif', <>CIF / NIF <Req /></>, 'B12345678 / 12345678Z')}
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
          <label htmlFor="tra-codigo_bolsa">Código bolsa de carga <Req si={false} /></label>
          <input id="tra-codigo_bolsa" type="text" value={d.codigo_bolsa} placeholder={d.bolsa ? 'Ej. 482113' : 'Sin bolsa'} disabled={!d.bolsa}
            onChange={(e) => set('codigo_bolsa', e.target.value)} />
        </div>
        {!d.bolsa && nota('Sin bolsa de carga: su alta online queda pendiente de revisión (solo se aceptan transportistas de las bolsas de Alpega).')}

        {titulo('Domicilio fiscal')}
        {campo('direccion', <>Dirección (calle y número) <Req si={false} /></>, 'Calle y número', true)}
        {campo('codigo_postal', <>Código postal <Req si={false} /></>, '41001')}
        {campo('poblacion', <>Población <Req si={false} /></>, 'Sevilla')}
        {campo('provincia', <>Provincia <Req si={false} /></>, 'Sevilla')}
        <div>
          <label htmlFor="tra-pais">País</label>
          <SelectorPais id="tra-pais" valor={d.pais_codigo_iso} onCambio={(v) => set('pais_codigo_iso', v)} />
        </div>

        {titulo('Personas de contacto')}
        <EditorContactos valor={d.contactos} onCambio={(l) => set('contactos', l)}
          roles={[['trafico', 'Tráfico'], ['contabilidad', 'Contabilidad']]} funcionNueva="trafico"
          ayuda={<>Los de <strong>tráfico</strong> reciben los avisos de la operativa (envíos, recogidas, incidencias); un <strong>autónomo</strong> va como Tráfico. Los de <strong>contabilidad</strong> son <strong>SOLO ADMIN</strong> (facturas): el transportista no los ve. Los <strong>conductores</strong> van en la flota (matrícula, DNI y móvil), no aquí.</>} />

        {titulo('Pago')}
        <div>
          <label htmlFor="tra-plazo">Plazo de pago (lo que paga Dynamo)</label>
          <select id="tra-plazo" value={d.plazo_pago_dias} onChange={(e) => set('plazo_pago_dias', Number(e.target.value))}>
            {PLAZOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        {interruptor('pronto_pago', 'Se le ofrece pronto pago', 'Cobrar antes a cambio de un pequeño descuento, al aceptar el envío.')}
        <div><label htmlFor="tra-iva">IVA (%) <Req si={false} /></label><input id="tra-iva" type="text" inputMode="decimal" value={textos.iva} onChange={(e) => setTextos((t) => ({ ...t, iva: e.target.value }))} /></div>
        <div><label htmlFor="tra-ret">Retención (%) <Req si={false} /></label><input id="tra-ret" type="text" inputMode="decimal" value={textos.ret} onChange={(e) => setTextos((t) => ({ ...t, ret: e.target.value }))} /></div>

        {titulo('Operativa')}
        {campo('nima', <>Nº de NIMA (residuos) <Req si={false} /></>, 'Texto libre, como lo dé el transportista')}
        {/* El «Camión habitual» declarado se quitó (usuario, 2026-11-13): el tipo de
            camión no es uno por transportista — se aprende de lo que carga cada
            matrícula (trampilla → rígido, remolque → tractora) y se ve en «Flota». */}
        {interruptor('tiene_almacen', 'Tiene almacén logístico')}
        {interruptor('reparto_urbano', 'Reparto urbano (camión pequeño)')}
        <div />
        {fila && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>Flota (de los vehículos dados de alta)</label>
            <button type="button" aria-expanded={verFlota}
              style={{ ...caja, fontWeight: 700, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}
              onClick={() => { setVerFlota((v) => !v); if (!flotaD && fila) flotaDetalle(fila.id).then(setFlotaD).catch(() => setFlotaD({ vehiculos: [], conductores: [] })); }}>
              <span>{f && f.tractoras + f.rigidos + f.remolques
                ? <>{f.tractoras} tractora{f.tractoras === 1 ? '' : 's'} · {f.rigidos} rígido{f.rigidos === 1 ? '' : 's'} · {f.remolques} remolque{f.remolques === 1 ? '' : 's'}{f.adr ? ' · con ADR' : ''} · {fila.envios} envío{fila.envios === 1 ? '' : 's'}</>
                : <>Aún sin vehículos dados de alta · {fila.envios} envío{fila.envios === 1 ? '' : 's'}</>}</span>
              <span style={{ color: 'var(--purple)', fontWeight: 800, whiteSpace: 'nowrap' }}>{verFlota ? 'Ocultar ▴' : 'Ver la flota ▾'}</span>
            </button>
            {verFlota && (
              <div style={{ ...caja, marginTop: '0.45rem' }}>
                {!flotaD ? <p style={{ margin: 0, color: 'var(--gray-500)' }}>Cargando la flota…</p> : <>
                  <div style={{ fontWeight: 800 }}>Vehículos ({flotaD.vehiculos.length})</div>
                  {flotaD.vehiculos.length === 0 && <p style={{ margin: '0.3rem 0 0', color: 'var(--gray-500)' }}>Ninguno todavía: se dan de alta solos al asignar envíos.</p>}
                  {flotaD.vehiculos.map((v) => {
                    const hoy = new Date().toISOString().slice(0, 10);
                    const vto = (txt: string, fch: string | null) => fch
                      ? <span key={txt} style={fch < hoy ? { color: '#b42318', fontWeight: 700 } : undefined}>{txt}: {fmtFecha(fch)}{fch < hoy ? ' ⚠ vencida' : ''}</span>
                      : null;
                    const vtos = [vto('ITV', v.itv_vence), vto('Seguro', v.seguro_vence), vto('Tarjeta', v.tarjeta_transporte_vence)].filter(Boolean);
                    return (
                      <div key={v.matricula} style={{ padding: '0.4rem 0', borderTop: '1px solid var(--gray-200)' }}>
                        <strong>{v.matricula}</strong> · {v.tipo === 'rigido' ? 'Rígido' : v.tipo === 'remolque' ? 'Remolque' : 'Tractora'}{v.plataforma ? ' · plataforma elevadora' : ''}{v.adr ? ' · ADR' : ''}
                        <div className="meta">{vtos.length ? vtos.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>) : 'Sin vencimientos anotados'}</div>
                      </div>
                    );
                  })}
                  <div style={{ fontWeight: 800, margin: '0.8rem 0 0' }}>Chóferes ({flotaD.conductores.length})</div>
                  {flotaD.conductores.length === 0 && <p style={{ margin: '0.3rem 0 0', color: 'var(--gray-500)' }}>Ninguno todavía: se apuntan solos al asignar envíos o al firmar.</p>}
                  {flotaD.conductores.map((c, i) => (
                    <div key={i} style={{ padding: '0.4rem 0', borderTop: '1px solid var(--gray-200)' }}>
                      <strong>{c.nombre}</strong>
                      <div className="meta">{[c.telefono && telBonito(c.telefono), c.documento].filter(Boolean).join(' · ') || 'Sin teléfono ni documento anotados'}</div>
                    </div>
                  ))}
                </>}
              </div>
            )}
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
        {campo('cuenta_contable', <>Cuenta contable <Req si={false} /></>, 'Ej. 40000123')}
        {campo('holded_forma_pago_ref', <>Forma de pago en Holded (ID) <Req si={false} /></>, 'Ej. 5f2a…')}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="tra-inc">Incidencias (historial) <Req si={false} /></label>
          <textarea id="tra-inc" rows={2} placeholder="Retrasos, daños, no presentados…" value={d.anotaciones_incidencias} onChange={(e) => set('anotaciones_incidencias', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="tra-notas">Notas internas <Req si={false} /></label>
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
