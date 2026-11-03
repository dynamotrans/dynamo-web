'use client';

// Sitios: la agenda de lugares de recogida y entrega. Diseño de #sec-sitios de
// dashboard.html: tabla Empresa · Dirección · Horario · Contacto · Notas, estrella del
// sitio principal y ficha en la ventana del panel con la rejilla .ptar-sitio-grid.
// Dynamo ve los sitios de todos los clientes (con la columna Cliente y su filtro).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { IconoTipo, TIPOS_LUGAR } from './TipoSitio';
import { guardarSitio, borrarSitio, marcarPrincipal, type SitioDatos } from '@/app/panel/(app)/sitios/acciones';
import { creadoTxt } from '@/lib/envios';
import { PAISES, PREFIJOS, paisDe, partirTel, telBonito } from '@/lib/paises';

export type SitioFila = SitioDatos & {
  id: string; codigo: string; creado_en: string; modificado_en: string | null;
};
export type ClienteSitios = { id: string; nombre: string; cif: string; principal_id: string | null };

const POR_PAGINA = [10, 20, 50, 100];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esNuevo = (iso: string) => Date.now() - new Date(iso).getTime() < 48 * 3600 * 1000;

const NUEVO: SitioDatos = {
  cliente_id: '', nombre_empresa: '', tipo: '', direccion: '', codigo_postal: '', poblacion: '',
  provincia: '', pais_codigo_iso: 'ES', horarios: '', url_google_maps: '', anotaciones: '',
  requiere_cita: false, tiene_medios_carga: true, contacto_nombre: '', contacto_telefono: '', emails_avisos: '',
};

const IcoEstrella = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>);
const IcoPin = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);

export default function Sitios({ filas, clientes, dynamo, error }: { filas: SitioFila[]; clientes: ClienteSitios[]; dynamo: boolean; error: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [porPagina, setPorPagina] = useState(20);
  const [pagina, setPagina] = useState(1);
  const [ficha, setFicha] = useState<{ fila: SitioFila | null } | null>(null);
  const [estrella, setEstrella] = useState<string | null>(null);   // sitio cuya estrella se está guardando
  const [aviso, setAviso] = useState<string | null>(null);

  const cliPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const esPrincipal = (f: SitioFila) => cliPorId.get(f.cliente_id)?.principal_id === f.id;

  const lista = useMemo(() => {
    const w = norm(q.trim());
    return filas
      .filter((f) => !filtroCliente || f.cliente_id === filtroCliente)
      .filter((f) => !w || norm([f.nombre_empresa, f.direccion, f.codigo_postal, f.poblacion, f.provincia,
        f.contacto_nombre, f.contacto_telefono, f.emails_avisos, f.anotaciones, f.horarios,
        dynamo ? cliPorId.get(f.cliente_id)?.nombre : ''].filter(Boolean).join(' ')).includes(w))
      .sort((a, b) => {
        // Dynamo sin filtro: agrupados por cliente. Dentro de cada cliente, como en el
        // mockup: el principal arriba, luego los nuevos (48 h) y el resto por nombre.
        if (dynamo && !filtroCliente) {
          const c = (cliPorId.get(a.cliente_id)?.nombre ?? '').localeCompare(cliPorId.get(b.cliente_id)?.nombre ?? '', 'es');
          if (c) return c;
        }
        const pa = esPrincipal(a), pb = esPrincipal(b);
        if (pa !== pb) return pa ? -1 : 1;
        const na = esNuevo(a.creado_en), nb = esNuevo(b.creado_en);
        if (na && nb) return b.creado_en.localeCompare(a.creado_en);
        if (na !== nb) return na ? -1 : 1;
        return a.nombre_empresa.localeCompare(b.nombre_empresa, 'es');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, q, filtroCliente, cliPorId, dynamo]);

  useEffect(() => { setPagina(1); }, [q, filtroCliente, porPagina]);
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const pag = Math.min(pagina, paginas);
  const trozo = lista.slice((pag - 1) * porPagina, pag * porPagina);

  async function alternarEstrella(f: SitioFila) {
    setAviso(null); setEstrella(f.id);
    const r = await marcarPrincipal(f.cliente_id, esPrincipal(f) ? null : f.id);
    setEstrella(null);
    if (!r.ok) { setAviso(r.error ?? 'No se ha podido cambiar el sitio principal.'); return; }
    router.refresh();
  }

  const columnas = dynamo ? 6 : 5;
  return (
    <section className="section active" id="sec-sitios">
      <div className="sec-header">
        <h2>Sitios ({lista.length})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Crear sitio</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <strong style={{ color: 'var(--navy)' }}>{dynamo ? 'Agenda de lugares de recogida y entrega de cada cliente.' : 'Tu agenda de lugares de recogida y entrega.'}</strong>{' '}
        Se usan en el buscador al crear envíos.<br />
        <span style={{ color: '#8a6300' }}>★</span> La <strong style={{ color: 'var(--navy)' }}>estrella</strong> marca el <strong style={{ color: 'var(--navy)' }}>almacén principal</strong>{dynamo ? ' de cada cliente' : ''}: se pone solo como <strong>origen (recogida)</strong> al crear un envío. Solo puede haber uno; al marcar otro, se cambia. Siempre se puede cambiar en el propio envío.
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, dirección, teléfono, notas…" />
        {dynamo && (
          <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} aria-label="Filtrar por cliente">
            <option value="">Todos los clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los sitios: {error}</div>}
      {aviso && <div className="pt-aviso error">{aviso}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Empresa</th>{dynamo && <th>Cliente</th>}<th>Dirección</th><th>Horario</th><th>Contacto</th><th>Notas</th>
          </tr></thead>
          <tbody>
            {trozo.length === 0 ? (
              <tr><td colSpan={columnas} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length === 0 ? 'Todavía no hay sitios. Crea el primero con «+ Crear sitio» (o se guardan solos al crear un envío).' : 'Sin sitios que coincidan'}
              </td></tr>
            ) : trozo.map((f) => {
              const prin = esPrincipal(f);
              const cli = cliPorId.get(f.cliente_id);
              const notas = f.anotaciones.trim();
              return (
                <tr key={f.id} onClick={() => setFicha({ fila: f })} style={{ cursor: 'pointer' }}>
                  <td>
                    <button type="button" className={`sitio-star${prin ? ' on' : ''}`} aria-pressed={prin} disabled={estrella === f.id}
                      title={prin ? 'Sitio principal · origen por defecto (pulsa para quitar)' : 'Marcar como sitio principal (origen por defecto en Nuevo envío)'}
                      aria-label="Sitio principal" onClick={(e) => { e.stopPropagation(); alternarEstrella(f); }}>
                      <IcoEstrella />
                    </button>
                    <IconoTipo tipo={f.tipo} /><strong>{f.nombre_empresa}</strong>
                    {prin && <> <span className="badge badge-principal">Principal</span></>}
                    {esNuevo(f.creado_en) && <> <span className="badge badge-green">Nuevo</span></>}
                    {f.url_google_maps && <div className="meta"><a href={f.url_google_maps} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--purple)', fontWeight: 600, textDecoration: 'none' }}>Ver en Maps</a></div>}
                    <div className="meta sitio-fechas">Creado: {creadoTxt(f.creado_en)}{f.modificado_en ? ` · Modificado: ${creadoTxt(f.modificado_en)}` : ''}</div>
                  </td>
                  {dynamo && <td>{cli?.nombre ?? '—'}<div className="meta">{cli?.cif}</div></td>}
                  <td>{f.direccion || '—'}<div className="meta">{[f.codigo_postal, f.poblacion, f.provincia && f.provincia !== f.poblacion ? f.provincia : '', paisDe(f.pais_codigo_iso)].filter(Boolean).join(', ')}</div></td>
                  <td>{f.horarios || '—'}
                    {(f.requiere_cita || !f.tiene_medios_carga) && <div className="meta" style={{ color: '#b45309', fontWeight: 600 }}>{[f.requiere_cita && 'Con cita previa', !f.tiene_medios_carga && 'Sin medios de carga'].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td>{telBonito(f.contacto_telefono) || '—'}{f.contacto_nombre && <div className="meta">{f.contacto_nombre}</div>}</td>
                  <td>{notas ? <span style={{ color: '#b45309' }}>⚠ {notas.slice(0, 60)}{notas.length > 60 ? '…' : ''}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <div className="pagination-left">
          <label className="pagination-perpage-wrap">Mostrar{' '}
            <select className="pagination-perpage" value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}>
              {POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>{lista.length ? `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, lista.length)} de ${lista.length}` : 'Sin sitios'}</span>
        </div>
        {paginas > 1 && (
          <div className="pagination-pages">
            <button disabled={pag === 1} onClick={() => setPagina(pag - 1)} aria-label="Anterior">‹</button>
            {Array.from({ length: paginas }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === paginas || Math.abs(n - pag) <= 1)
              .map((n, i, arr) => (
                <span key={n} style={{ display: 'contents' }}>
                  {i > 0 && n - arr[i - 1] > 1 && <button disabled>…</button>}
                  <button className={n === pag ? 'active' : ''} onClick={() => setPagina(n)}>{n}</button>
                </span>
              ))}
            <button disabled={pag === paginas} onClick={() => setPagina(pag + 1)} aria-label="Siguiente">›</button>
          </div>
        )}
      </div>

      {ficha && (
        <FichaSitio fila={ficha.fila} clientes={clientes} dynamo={dynamo}
          onCerrar={() => setFicha(null)}
          onAbrir={(id) => { const f = filas.find((x) => x.id === id); if (f) setFicha({ fila: f }); }}
          onGuardado={() => { setFicha(null); router.refresh(); }} />
      )}
    </section>
  );
}

function FichaSitio({ fila, clientes, dynamo, onCerrar, onAbrir, onGuardado }: {
  fila: SitioFila | null; clientes: ClienteSitios[]; dynamo: boolean;
  onCerrar: () => void; onAbrir: (id: string) => void; onGuardado: () => void;
}) {
  const [d, setD] = useState<SitioDatos>(() => {
    if (!fila) return { ...NUEVO, cliente_id: clientes.length === 1 ? clientes[0].id : '' };
    const o: any = {};
    (Object.keys(NUEVO) as (keyof SitioDatos)[]).forEach((k) => { o[k] = (fila as any)[k] ?? (NUEVO as any)[k]; });
    return o as SitioDatos;
  });
  const tel = partirTel(d.contacto_telefono);
  const [pref, setPref] = useState(tel.pref);
  const [telNum, setTelNum] = useState(tel.num);
  const [error, setError] = useState<string | null>(null);
  const [repetido, setRepetido] = useState<{ id: string; nombre: string } | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const set = <K extends keyof SitioDatos>(k: K, v: SitioDatos[K]) => { setD((x) => ({ ...x, [k]: v })); setRepetido(null); };

  async function guardar(aunqueRepetido = false) {
    setError(null);
    if (!d.cliente_id) { setError('Elige de qué cliente es el sitio.'); return; }
    if (!d.tipo) { setError('Elige el tipo de lugar.'); return; }
    if (!d.nombre_empresa.trim() || !d.direccion.trim() || !d.codigo_postal.trim() || !d.poblacion.trim()) {
      setError('Empresa, dirección, código postal y población son obligatorios.'); return;
    }
    setTrabajando(fila ? 'Guardando cambios' : 'Creando sitio');
    const r = await guardarSitio(fila?.id ?? null, { ...d, contacto_telefono: telNum.trim() ? pref + telNum.replace(/\D/g, '') : '' }, aunqueRepetido);
    setTrabajando(null);
    if (!r.ok) {
      if (r.duplicado) { setRepetido(r.duplicado); return; }
      setError(r.error); return;
    }
    onGuardado();
  }
  async function borrar() {
    if (!fila) return;
    setTrabajando('Borrando sitio');
    const r = await borrarSitio(fila.id);
    setTrabajando(null);
    if (!r.ok) { setError(r.error ?? 'No se ha podido borrar.'); setConfirmarBorrado(false); return; }
    onGuardado();
  }

  const campo = (id: keyof SitioDatos, label: React.ReactNode, ph?: string, full?: boolean, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`sitio-${id}`}>{label}</label>
      <input id={`sitio-${id}`} type="text" value={String(d[id] ?? '')} placeholder={ph}
        onChange={(e) => set(id, e.target.value as never)} {...extra} />
    </div>
  );
  const interruptor = (k: 'requiere_cita' | 'tiene_medios_carga', label: string, ayuda: string) => (
    <div>
      <label>{label}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
      </label>
      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.25rem' }}>{ayuda}</div>
    </div>
  );
  const opc = <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span>;
  const obl = <span className="sitio-req">· obligatorio</span>;
  const cliente = clientes.find((c) => c.id === d.cliente_id);

  return (
    <Modal abierto titulo={fila ? 'Editar sitio' : 'Nuevo sitio'}
      sub={fila ? `${fila.nombre_empresa} · ${fila.codigo}${dynamo && cliente ? ` · ${cliente.nombre}` : ''}` : 'Crea un lugar de recogida/entrega para la agenda'}
      icono={<IcoPin />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        {fila && <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => setConfirmarBorrado(true)} disabled={!!trabajando}>Borrar</button>}
        <button className="btn-primary" onClick={() => guardar(false)} disabled={!!trabajando}>{fila ? 'Guardar cambios' : 'Crear sitio'}</button>
      </>}>
      {fila && (
        <div className="sitio-meta-fechas">
          <span><strong>Creado:</strong> {creadoTxt(fila.creado_en)}</span>
          {fila.modificado_en && <span><strong>Última modificación:</strong> {creadoTxt(fila.modificado_en)}</span>}
        </div>
      )}
      {confirmarBorrado && (
        <div className="modal-warn-box">
          <strong>¿Borrar este sitio?</strong> Desaparece de la agenda y del buscador de envíos. Los envíos ya creados <strong>conservan la dirección</strong>.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={borrar}>Sí, borrar</button>
            <button className="btn-ghost" onClick={() => setConfirmarBorrado(false)}>No</button>
          </div>
        </div>
      )}
      {repetido && (
        <div className="modal-warn-box">
          {dynamo ? 'Este cliente ya tiene' : 'Ya tienes'} un sitio muy parecido guardado: <strong>{repetido.nombre}</strong>, en el mismo código postal. Puede tener anotaciones o el teléfono bueno.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => onAbrir(repetido.id)}>Abrir el que ya existe</button>
            <button className="btn-ghost" onClick={() => guardar(true)}>Crear otro igualmente</button>
          </div>
        </div>
      )}
      <div className="ptar-sitio-grid">
        {dynamo && (
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="sitio-cliente">Cliente {!fila && obl}</label>
            {fila
              ? <input id="sitio-cliente" className="sitio-f-lock" readOnly tabIndex={-1} value={cliente ? `${cliente.nombre} · ${cliente.cif}` : '—'} />
              : <select id="sitio-cliente" value={d.cliente_id} onChange={(e) => set('cliente_id', e.target.value)}>
                  <option value="" disabled>Elige el cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.cif}</option>)}
                </select>}
          </div>
        )}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="sitio-emails"><span style={{ color: 'var(--green)' }}>Email de avisos del sitio</span> {opc}</label>
          <input id="sitio-emails" type="text" inputMode="email" value={d.emails_avisos} placeholder="almacen@empresa.com, recepcion@empresa.com"
            style={{ border: '1.5px solid var(--green)' }} onChange={(e) => set('emails_avisos', e.target.value)} />
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.25rem' }}>
            Avisamos al sitio de sus <strong>recogidas y entregas</strong>, con <strong>total discreción</strong> (sin precios ni otros clientes). Puedes poner varios, separados por comas.
          </div>
        </div>
        {campo('anotaciones', <><span style={{ color: 'var(--green)' }}>Notas del sitio</span> {opc}</>, 'Ej. referencia de carga/entrega, pedir cita, báscula…', true)}
        {campo('nombre_empresa', <>Empresa {obl}</>, 'Ej. Talleres Vega e Hijos S.L.')}
        <div>
          <label htmlFor="sitio-tipo">Tipo de lugar {!d.tipo && obl}</label>
          <select id="sitio-tipo" value={d.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="" disabled>Elige tipo de lugar…</option>
            {TIPOS_LUGAR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        {campo('horarios', <>Horario {opc}</>, 'Ej. L-V 8:00-14:00', true)}
        {campo('direccion', <>Dirección (calle y número) {obl}</>, 'Ej. C/ Industria, 4', true)}
        {campo('codigo_postal', <>Código postal {obl}</>, '41016')}
        {campo('poblacion', <>Población {obl}</>, 'Sevilla')}
        {campo('provincia', <>Provincia {opc}</>, 'Sevilla')}
        <div>
          <label htmlFor="sitio-pais">País</label>
          <select id="sitio-pais" value={d.pais_codigo_iso} onChange={(e) => set('pais_codigo_iso', e.target.value)}>
            {PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sitio-tel">Teléfono {opc}</label>
          <div className="tel-group">
            <select className="tel-pref" aria-label="Prefijo de país" value={pref} onChange={(e) => setPref(e.target.value)}>
              {PREFIJOS.map(([p, n]) => <option key={p} value={p}>{p} {n}</option>)}
            </select>
            <input id="sitio-tel" type="tel" inputMode="tel" value={telNum} placeholder="600 000 000" onChange={(e) => setTelNum(e.target.value)} />
          </div>
        </div>
        {campo('contacto_nombre', <>Persona de contacto {opc}</>, 'Persona de contacto')}
        {interruptor('requiere_cita', 'Requiere cita previa', 'Solo carga o descarga con cita. Se avisa al transportista antes de que llegue.')}
        {interruptor('tiene_medios_carga', 'Tiene medios de carga', 'Muelle, carretilla… Si no los hay, hace falta camión con trampilla elevadora.')}
        {dynamo
          ? campo('url_google_maps', 'Enlace de Google Maps', 'https://maps.app.goo.gl/…', true)
          : <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="sitio-maps">Enlace de Google Maps</label>
              <input id="sitio-maps" className="sitio-f-lock" readOnly tabIndex={-1} value={d.url_google_maps} />
              <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.2rem' }}>Lo completa Dynamo. Si tienes otro enlace, ponlo en <strong>Notas del sitio</strong>.</div>
            </div>}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
