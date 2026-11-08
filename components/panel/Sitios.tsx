'use client';

// Sitios: la agenda de sitios de recogida y entrega. Diseño de #sec-sitios de
// dashboard.html: tabla Empresa · Dirección · Horario · Contacto · Notas, estrella del
// sitio principal y ficha en la ventana del panel con la rejilla .ptar-sitio-grid.
// Dynamo ve los sitios de todos los clientes (con la columna Cliente y su filtro).
import { useMemo, useState } from 'react';
import Paginador from './Paginador';
import { BuscadorUrl } from './BuscadorUrl';
import Buscador from './Buscador';
import { useRefrescar } from '@/lib/useRefrescar';
import Historial from './Historial';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { IconoTipo, TIPOS_SITIO } from './TipoSitio';
import { guardarSitio, borrarSitio, marcarPrincipal, buscarClientes, type SitioDatos, type ClienteOpcion } from '@/app/panel/(app)/sitios/acciones';

import { euros, fechaHora, numero } from '@/lib/formato';
import { paisDe, telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { principal, CONTACTO_VACIO } from '@/lib/contactos';
import EditorContactos from './EditorContactos';
import EditorHorario from './EditorHorario';
import EjemploAviso from './EjemploAviso';
import { HORARIO_POR_DEFECTO, HORARIO_VERANO_POR_DEFECTO, VERANO_GENERICO, MMDD, mmddTxt, resumenHorario, validarHorario, type FechasVerano, type GrupoHorario } from '@/lib/horarios';

export type SitioFila = SitioDatos & {
  id: string; codigo: string; creado_en: string; modificado_en: string | null;
  horarios: string | null;   // resumen legible que escribe la base de datos
  horarios_verano?: string | null;
};
export type ClienteSitios = { id: string; nombre: string; cif: string; principal_id: string | null };

const esNuevo = (iso: string) => Date.now() - new Date(iso).getTime() < 48 * 3600 * 1000;

const NUEVO: SitioDatos = {
  cliente_id: '', nombre_empresa: '', tipo: '', direccion: '', codigo_postal: '', poblacion: '',
  provincia: '', pais_codigo_iso: 'ES', horario: HORARIO_POR_DEFECTO, url_google_maps: '', anotaciones: '',
  requiere_cita: false, tiene_medios_carga: false, contactos: [CONTACTO_VACIO()], emails_avisos: '',
};

const IcoEstrella = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>);
const IcoPin = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);

// Lo que la página ha pedido a la base de datos (filtros de la URL y total). `vistaCliente`:
// Dynamo está «viendo como» un cliente, así que no hay filtro de cliente que elegir.
export type ListaSitios = { q: string; cliente: string; pagina: number; porPagina: number; total: number; vistaCliente: boolean };

export default function Sitios({ filas, clientes, dynamo, error, veranoDefecto, lista }: { filas: SitioFila[]; clientes: ClienteSitios[]; dynamo: boolean; error: string | null; veranoDefecto?: FechasVerano; lista: ListaSitios }) {
  const refrescar = useRefrescar();
  const url = (p: number, cliente: string = lista.cliente) => {
    const u = new URLSearchParams();
    if (lista.q) u.set('q', lista.q); if (cliente) u.set('cliente', cliente);
    if (p > 1) u.set('p', String(p)); if (lista.porPagina !== 20) u.set('n', String(lista.porPagina));
    const s = u.toString(); return `/panel/sitios${s ? `?${s}` : ''}`;
  };
  // Filtro por cliente (Dynamo): el elegido viene con los clientes de la página.
  const [cliFiltro, setCliFiltro] = useState<ClienteOpcion | null>(() => { const c = clientes.find((x) => x.id === lista.cliente); return c ? { ...c, estado: 'activa' } : null; });
  const [ficha, setFicha] = useState<{ fila: SitioFila | null } | null>(null);
  const [estrella, setEstrella] = useState<string | null>(null);   // sitio cuya estrella se está guardando
  const [aviso, setAviso] = useState<string | null>(null);

  const cliPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const esPrincipal = (f: SitioFila) => cliPorId.get(f.cliente_id)?.principal_id === f.id;


  async function alternarEstrella(f: SitioFila) {
    setAviso(null); setEstrella(f.id);
    const r = await marcarPrincipal(f.cliente_id, esPrincipal(f) ? null : f.id);
    setEstrella(null);
    if (!r.ok) { setAviso(r.error ?? 'No se ha podido cambiar el sitio principal.'); return; }
    refrescar();
  }

  const columnas = dynamo ? 6 : 5;
  return (
    <section className="section active" id="sec-sitios">
      <div className="sec-header">
        <h2>Sitios ({numero(lista.total, 0)})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Crear sitio</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <strong style={{ color: 'var(--navy)' }}>{dynamo ? 'Agenda de sitios de recogida y entrega de cada cliente.' : 'Tu agenda de sitios de recogida y entrega.'}</strong>{' '}
        Se usan en el buscador al crear envíos.<br />
        <span style={{ color: '#8a6300' }}>★</span> La <strong style={{ color: 'var(--navy)' }}>estrella</strong> marca el <strong style={{ color: 'var(--navy)' }}>almacén principal</strong>{dynamo ? ' de cada cliente' : ''}: se pone solo como <strong>origen (recogida)</strong> al crear un envío. Solo puede haber uno; al marcar otro, se cambia. Siempre se puede cambiar en el propio envío.
      </p>
      <BuscadorUrl id="sitios-filtros" accion="/panel/sitios" valor={lista.q} placeholder="Buscar por empresa, dirección, teléfono, notas…" campos={<>
        {dynamo && !lista.vistaCliente && <>
          <input type="hidden" name="cliente" value={cliFiltro?.id ?? ''} />
          <Buscador id="sitios-cliente" valor={cliFiltro} buscar={(q) => buscarClientes(q, lista.cliente || null)} placeholder="Todos los clientes (escribe para filtrar por uno)…"
            onElegir={(c) => { setCliFiltro(c); setTimeout(() => (document.getElementById('sitios-filtros') as HTMLFormElement | null)?.requestSubmit(), 0); }} />
          {cliFiltro && <a className="btn-ghost" href={url(1, '')} style={{ whiteSpace: 'nowrap' }}>Todos los clientes</a>}
        </>}
        {lista.porPagina !== 20 && <input type="hidden" name="n" value={lista.porPagina} />}
      </>} />
      {error && <div className="pt-aviso error">No se han podido cargar los sitios: {error}</div>}
      {aviso && <div className="pt-aviso error">{aviso}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Empresa</th>{dynamo && <th>Cliente</th>}<th>Dirección</th><th>Horario</th><th>Contacto</th><th>Notas</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={columnas} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {!lista.q && !lista.cliente ? 'Todavía no hay sitios. Crea el primero con «+ Crear sitio» (o se guardan solos al crear un envío).' : 'Sin sitios que coincidan'}
              </td></tr>
            ) : filas.map((f) => {
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
                    <div className="meta sitio-fechas">Creado: {fechaHora(f.creado_en)}{f.modificado_en ? ` · Modificado: ${fechaHora(f.modificado_en)}` : ''}</div>
                  </td>
                  {dynamo && <td>{cli?.nombre ?? '—'}<div className="meta">{cli?.cif}</div></td>}
                  <td>{f.direccion || '—'}<div className="meta">{[f.codigo_postal, f.poblacion, f.provincia && f.provincia !== f.poblacion ? f.provincia : '', paisDe(f.pais_codigo_iso)].filter(Boolean).join(', ')}</div></td>
                  <td>{f.horarios || '—'}
                    {f.verano?.activo && f.horarios_verano && <div className="meta" style={{ color: '#b45309' }}>Verano ({mmddTxt(f.verano.desde)} – {mmddTxt(f.verano.hasta)}): {f.horarios_verano}</div>}
                  </td>
                  <td>{(() => { const k = principal(f.contactos); return <>{telBonito(k?.telefono ?? '') || k?.email || '—'}{k?.nombre && <div className="meta">{k.nombre}</div>}{f.contactos.length > 1 && <div className="meta">+{f.contactos.length - 1} contacto{f.contactos.length > 2 ? 's' : ''} más</div>}</>; })()}</td>
                  <td>{notas ? <span style={{ color: '#b45309' }}>⚠ {notas.slice(0, 60)}{notas.length > 60 ? '…' : ''}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginador total={lista.total} pagina={lista.pagina} porPagina={lista.porPagina} url={url} nombre="sitios" nombreUno="sitio" />

      {ficha && (
        <FichaSitio fila={ficha.fila} clientes={clientes} dynamo={dynamo} clienteFijo={lista.vistaCliente} veranoDefecto={veranoDefecto}
          onCerrar={() => setFicha(null)}
          onAbrir={(id) => { const f = filas.find((x) => x.id === id); if (f) setFicha({ fila: f }); }}
          onGuardado={() => { setFicha(null); refrescar(); }} />
      )}
    </section>
  );
}

// La misma ficha sirve para los ALMACENES DYNAMO (como en el mockup: formulario idéntico
// al de Sitios + disponibilidad y precios propios). `almacen` trae los precios por defecto.
export function FichaSitio({ fila, clientes, dynamo, clienteFijo = false, almacen, veranoDefecto = VERANO_GENERICO, onCerrar, onAbrir, onGuardado }: {
  fila: SitioFila | null; clientes: ClienteSitios[]; dynamo: boolean; veranoDefecto?: FechasVerano;
  // «Ver como» un cliente: el sitio es SIEMPRE de ese cliente, así que el campo Cliente no sale.
  clienteFijo?: boolean;
  almacen?: { precioSemana: number; precioReparto: number };
  onCerrar: () => void; onAbrir: (id: string) => void; onGuardado: () => void;
}) {
  const [d, setD] = useState<SitioDatos>(() => {
    const o: Partial<SitioDatos> = fila ? {} : { ...NUEVO, cliente_id: clientes.length === 1 || clienteFijo ? clientes[0]?.id ?? '' : '' };
    const w = o as Record<keyof SitioDatos, unknown>;
    if (fila) (Object.keys(NUEVO) as (keyof SitioDatos)[]).forEach((k) => { w[k] = fila[k] ?? NUEVO[k]; });
    if (!o.horario?.length) o.horario = HORARIO_POR_DEFECTO;
    const v = fila?.verano;
    o.verano = { activo: !!v?.activo, desde: v?.desde ?? veranoDefecto.desde, hasta: v?.hasta ?? veranoDefecto.hasta,
                 horario: v?.horario?.length ? v.horario : HORARIO_VERANO_POR_DEFECTO.map((g) => ({ dias: [...g.dias], tramos: g.tramos.map((t) => ({ ...t })) })) };
    if (almacen) o.almacen = fila?.almacen ?? { disponible: true, precio_almacenamiento_semana: null, precio_reparto: null };
    return o as SitioDatos;
  });
  const [precios, setPrecios] = useState({
    semana: d.almacen?.precio_almacenamiento_semana == null ? '' : String(d.almacen.precio_almacenamiento_semana).replace('.', ','),
    reparto: d.almacen?.precio_reparto == null ? '' : String(d.almacen.precio_reparto).replace('.', ','),
  });
  const que = almacen ? 'almacén' : 'sitio';
  const [error, setError] = useState<string | null>(null);
  const [repetido, setRepetido] = useState<{ id: string; nombre: string } | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [tabHorario, setTabHorario] = useState<'general' | 'verano'>('general');
  // Ficha compacta (usuario, 2026-11-08): lo opcional y el horario van PLEGADOS con su
  // resumen a la vista; solo se abre lo que haga falta tocar.
  const [abierto, setAbierto] = useState({ avisos: false, horario: false, contactos: false });
  const plegar = (k: 'avisos' | 'horario' | 'contactos') => setAbierto((a) => ({ ...a, [k]: !a[k] }));
  const set = <K extends keyof SitioDatos>(k: K, v: SitioDatos[K]) => { setD((x) => ({ ...x, [k]: v })); setRepetido(null); };

  async function guardar(aunqueRepetido = false) {
    setError(null);
    if (!almacen && !d.cliente_id) { setError('Elige de qué cliente es el sitio.'); return; }
    const aNum = (t: string) => { const v = t.trim(); return v ? Number(v.replace(/\./g, '').replace(',', '.')) : null; };
    const semana = aNum(precios.semana), reparto = aNum(precios.reparto);
    if ([semana, reparto].some((v) => v != null && (!Number.isFinite(v) || v < 0))) { setError('Los precios tienen que ser un número (o vacíos para usar los de por defecto).'); return; }
    // Cita y medios de carga ocultos de momento: se guardan siempre desactivados.
    const base: SitioDatos = { ...d, requiere_cita: false, tiene_medios_carga: false };
    const datos: SitioDatos = almacen ? { ...base, almacen: { disponible: d.almacen?.disponible ?? true, precio_almacenamiento_semana: semana, precio_reparto: reparto } } : base;
    if (!d.tipo) { setError('Elige el tipo de sitio.'); return; }
    if (!d.nombre_empresa.trim() || !d.direccion.trim() || !d.codigo_postal.trim() || !d.poblacion.trim()) {
      setError('Empresa, dirección, código postal y población son obligatorios.'); return;
    }
    const malHorario = validarHorario(d.horario);
    if (malHorario) { setAbierto((a) => ({ ...a, horario: true })); setTabHorario('general'); setError(malHorario); return; }
    if (d.verano?.activo) {
      if (!MMDD.test(d.verano.desde) || !MMDD.test(d.verano.hasta)) { setAbierto((a) => ({ ...a, horario: true })); setTabHorario('verano'); setError('Pon las fechas del horario de verano.'); return; }
      const mv = validarHorario(d.verano.horario);
      if (mv) { setAbierto((a) => ({ ...a, horario: true })); setTabHorario('verano'); setError(`Horario de verano: ${mv.charAt(0).toLowerCase()}${mv.slice(1)}`); return; }
    }
    setTrabajando(fila ? 'Guardando cambios' : `Creando ${que}`);
    const r = await guardarSitio(fila?.id ?? null, datos, aunqueRepetido);
    setTrabajando(null);
    if (!r.ok) {
      if (r.duplicado) { setRepetido(r.duplicado); return; }
      setError(r.error); return;
    }
    onGuardado();
  }
  async function borrar() {
    if (!fila) return;
    setTrabajando(`Borrando ${que}`);
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
  const opc = <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span>;
  const obl = <span className="sitio-req">· obligatorio</span>;
  // Cliente del sitio: en una ficha existente viene con la página; en una nueva se elige con
  // el buscador (los clientes ya no viajan todos a la pantalla).
  const [cliSel, setCliSel] = useState<ClienteOpcion | null>(() => { const c = clientes.find((x) => x.id === d.cliente_id); return c ? { ...c, estado: 'activa' } : null; });
  const cliente = clientes.find((c) => c.id === d.cliente_id) ?? (cliSel?.id === d.cliente_id ? cliSel : undefined);

  return (
    <Modal abierto titulo={fila ? `Editar ${que}` : `Nuevo ${que}`}
      sub={fila ? `${fila.nombre_empresa} · ${fila.codigo}${dynamo && cliente ? ` · ${cliente.nombre}` : ''}` : almacen ? 'Alta de un almacén Dynamo en el catálogo interno' : 'Crea un sitio de recogida/entrega para la agenda'}
      icono={<IcoPin />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        {fila && <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => setConfirmarBorrado(true)} disabled={!!trabajando}>Borrar</button>}
        <button className="btn-primary" onClick={() => guardar(false)} disabled={!!trabajando}>{fila ? 'Guardar cambios' : `Crear ${que}`}</button>
      </>}>
      {fila && (
        <div className="sitio-meta-fechas">
          <span><strong>Creado:</strong> {fechaHora(fila.creado_en)}</span>
          {fila.modificado_en && <span><strong>Última modificación:</strong> {fechaHora(fila.modificado_en)}</span>}
        </div>
      )}
      {confirmarBorrado && (
        <div className="modal-warn-box">
          <strong>¿Borrar este {que}?</strong> Desaparece {almacen ? 'del catálogo y de los desplegables' : 'de la agenda y del buscador de envíos'}. Lo ya creado <strong>conserva la dirección</strong>.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={borrar}>Sí, borrar</button>
            <button className="btn-ghost" onClick={() => setConfirmarBorrado(false)}>No</button>
          </div>
        </div>
      )}
      {repetido && (
        <div className="modal-warn-box">
          {almacen ? 'Ya hay un almacén Dynamo' : dynamo ? 'Este cliente ya tiene un sitio' : 'Ya tienes un sitio'} muy parecido guardado: <strong>{repetido.nombre}</strong>, en el mismo código postal. Puede tener anotaciones o el teléfono bueno.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => onAbrir(repetido.id)}>Abrir el que ya existe</button>
            <button className="btn-ghost" onClick={() => guardar(true)}>Crear otro igualmente</button>
          </div>
        </div>
      )}
      {almacen && (
        <>
          <div style={{ margin: '0 0 0.9rem', padding: '0.7rem 0.85rem', border: '1.5px solid var(--gray-200)', borderRadius: 10, background: 'var(--gray-50)' }}>
            <label className="ptar-tramp-box" style={{ maxWidth: 260 }}>
              <input type="checkbox" className="ptar-switch-input" checked={d.almacen?.disponible ?? true}
                onChange={(e) => setD((x) => ({ ...x, almacen: { ...x.almacen!, disponible: e.target.checked } }))} />
              <span className="ptar-switch" aria-hidden="true" />
              <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">Completo</span><span className="tramp-on">Disponible</span></span>
            </label>
            <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginTop: '0.4rem', lineHeight: 1.45 }}>
              Si está <strong>completo</strong>, sigue saliendo en los desplegables, pero no admite almacenamientos nuevos. Recoger o entregar en él sí se puede.
            </div>
          </div>
          <div style={{ margin: '0 0 0.9rem', padding: '0.7rem 0.85rem', border: '1.5px solid var(--gray-200)', borderRadius: 10, background: 'var(--gray-50)' }}>
            <strong style={{ color: 'var(--navy)', fontSize: 'var(--fs-l)' }}>Precios de este almacén</strong>
            <span style={{ display: 'block', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: '1px 0 0.6rem' }}>Base sin IVA. Vacío = el precio por defecto.</span>
            <div className="ptar-sitio-grid">
              <div>
                <label htmlFor="alm-semana">Almacenamiento · 7 días / 1 semana (€)</label>
                <input id="alm-semana" type="text" inputMode="decimal" value={precios.semana} placeholder={`${euros(almacen.precioSemana)} por defecto`}
                  onChange={(e) => setPrecios((p) => ({ ...p, semana: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="alm-reparto">Reparto urbano · camión 4 m (€ / reparto)</label>
                <input id="alm-reparto" type="text" inputMode="decimal" value={precios.reparto} placeholder={`${euros(almacen.precioReparto)} por defecto`}
                  onChange={(e) => setPrecios((p) => ({ ...p, reparto: e.target.value }))} />
              </div>
            </div>
          </div>
        </>
      )}
      <div className="ptar-sitio-grid">
        {dynamo && !almacen && !clienteFijo && (
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="sitio-cliente">Cliente {!fila && obl}</label>
            {fila
              ? <input id="sitio-cliente" className="sitio-f-lock" readOnly tabIndex={-1} value={cliente ? `${cliente.nombre} · ${cliente.cif}` : '—'} />
              : <Buscador id="sitio-cliente" valor={cliSel} buscar={(q) => buscarClientes(q)} placeholder="Busca el cliente por nombre o CIF…"
                  onElegir={(c) => { setCliSel(c); set('cliente_id', c?.id ?? ''); }} />}
          </div>
        )}
        {campo('nombre_empresa', <>Empresa {obl}</>, 'Ej. Talleres Vega e Hijos S.L.')}
        <div>
          <label htmlFor="sitio-tipo">Tipo de sitio {!d.tipo && obl}</label>
          <select id="sitio-tipo" value={d.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="" disabled>Elige tipo de sitio…</option>
            {TIPOS_SITIO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        {campo('direccion', <>Dirección (calle y número) {obl}</>, 'Ej. C/ Industria, 4', true)}
        {campo('codigo_postal', <>Código postal {obl}</>, '41016')}
        {campo('poblacion', <>Población {obl}</>, 'Sevilla')}
        {campo('provincia', <>Provincia {opc}</>, 'Sevilla')}
        <div>
          <label htmlFor="sitio-pais">País</label>
          <SelectorPais id="sitio-pais" valor={d.pais_codigo_iso} onCambio={(v) => set('pais_codigo_iso', v)} />
        </div>
        {/* «Requiere cita», «Tiene medios de carga» y «Enlace de Google Maps» ocultos de momento
            (decisión del usuario, 2026-11-08): no se usan por ahora; se dejan desactivados al
            guardar. No se tocan las tablas. */}
      </div>

      {/* Lo demás PLEGADO con su resumen a la vista (usuario, 2026-11-08: ficha compacta). */}
      <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.9rem' }}>
        <button type="button" className="ptar-notes-toggle" aria-expanded={abierto.avisos} onClick={() => plegar('avisos')} style={{ margin: 0 }}>
          <span className="pnt-icon" aria-hidden="true">{abierto.avisos ? '−' : '+'}</span>
          <span><strong>Email de avisos y notas del sitio</strong>{' '}
            {d.emails_avisos.trim() || d.anotaciones.trim() ? <span className="badge badge-green">Con datos</span> : <span style={{ color: 'var(--gray-500)' }}>(opcional)</span>}</span>
        </button>
        {abierto.avisos && (
          <div className="ptar-sitio-grid">
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="sitio-emails"><span style={{ color: 'var(--green)' }}>Email de avisos del sitio</span> {opc}</label>
              <input id="sitio-emails" type="text" inputMode="email" value={d.emails_avisos} placeholder="almacen@empresa.com, recepcion@empresa.com"
                style={{ border: '1.5px solid var(--green)' }} onChange={(e) => set('emails_avisos', e.target.value)} />
              <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.25rem' }}>
                Avisamos al sitio de sus <strong>recogidas y entregas</strong> con total discreción (sin precios ni otros clientes); varios, separados por comas.{' '}
                <EjemploAviso cliente={cliente?.nombre} />
              </div>
            </div>
            {campo('anotaciones', <><span style={{ color: 'var(--green)' }}>Notas del sitio</span> {opc}</>, 'Ej. referencia de carga/entrega, pedir cita, báscula…', true)}
          </div>
        )}

        <button type="button" className="ptar-notes-toggle" aria-expanded={abierto.horario} onClick={() => plegar('horario')} style={{ margin: 0 }}>
          <span className="pnt-icon" aria-hidden="true">{abierto.horario ? '−' : '+'}</span>
          <span><strong>Horario de carga y descarga</strong>{' '}
            <span style={{ color: 'var(--gray-500)' }}>· {resumenHorario(d.horario) || 'sin definir'}{d.verano?.activo ? ' · verano activo' : ''}</span></span>
        </button>
        {abierto.horario && (
          <div className="ptar-sitio-grid" style={{ marginTop: '-0.1rem' }}>
            <div className="tabs hor-tabs" style={{ gridColumn: '1/-1', marginBottom: 0 }} role="tablist">
              <button type="button" role="tab" aria-selected={tabHorario === 'general'} className={`tab${tabHorario === 'general' ? ' active' : ''}`} onClick={() => setTabHorario('general')}>Horario general</button>
              <button type="button" role="tab" aria-selected={tabHorario === 'verano'} className={`tab${tabHorario === 'verano' ? ' active' : ''}`} onClick={() => setTabHorario('verano')}>
                Horario de verano{d.verano?.activo ? <span className="badge badge-green" style={{ marginLeft: 6 }}>Activo</span> : null}
              </button>
            </div>
            {tabHorario === 'general'
              ? <EditorHorario valor={d.horario} onCambio={(g) => set('horario', g)} />
              : <VeranoSitio v={d.verano!} generico={veranoDefecto} onCambio={(v) => set('verano', v)} />}
          </div>
        )}

        <button type="button" className="ptar-notes-toggle" aria-expanded={abierto.contactos} onClick={() => plegar('contactos')} style={{ margin: 0 }}>
          <span className="pnt-icon" aria-hidden="true">{abierto.contactos ? '−' : '+'}</span>
          <span><strong>Personas de contacto</strong>{' '}
            {(() => { const n = d.contactos.filter((c) => c.nombre.trim() || c.telefono.trim() || c.email.trim()).length;
              return n > 0 ? <span className="badge badge-green">{n}</span> : <span style={{ color: 'var(--gray-500)' }}>(opcional)</span>; })()}</span>
        </button>
        {abierto.contactos && (
          <div className="ptar-sitio-grid">
            <EditorContactos valor={d.contactos} onCambio={(l) => set('contactos', l)}
              ayuda="Encargado de almacén, recepción… La primera es la principal (la que sale en la tabla)." />
          </div>
        )}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {fila?.id && <Historial tabla="sitios" id={fila.id} />}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

// Pestaña «Horario de verano» de la ficha del sitio: se activa con sus fechas (cada año) y
// su horario (por defecto lunes a viernes 7:30-15:00). Sin activar, se usa el general todo
// el año y, al crear un envío en las fechas de verano genéricas, se avisa de revisarlo.
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function SelectorMMDD({ id, valor, onCambio }: { id: string; valor: string; onCambio: (v: string) => void }) {
  const [m, d] = MMDD.test(valor) ? [Number(valor.slice(0, 2)), Number(valor.slice(3))] : [6, 1];
  const poner = (mm: number, dd: number) => onCambio(`${String(mm).padStart(2, '0')}-${String(Math.min(dd, new Date(2024, mm, 0).getDate())).padStart(2, '0')}`);
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <select id={id} className="ptar-select" value={d} onChange={(e) => poner(m, Number(e.target.value))} aria-label="Día">
        {Array.from({ length: new Date(2024, m, 0).getDate() }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select className="ptar-select" value={m} onChange={(e) => poner(Number(e.target.value), d)} aria-label="Mes">
        {MESES_CORTOS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
      </select>
    </div>
  );
}
function VeranoSitio({ v, generico, onCambio }: { v: { activo: boolean; desde: string; hasta: string; horario: GrupoHorario[] }; generico: FechasVerano;
  onCambio: (v: { activo: boolean; desde: string; hasta: string; horario: GrupoHorario[] }) => void }) {
  return (
    <div style={{ gridColumn: '1/-1', display: 'grid', gap: '0.7rem' }}>
      <div>
        <label className="ptar-tramp-box" style={{ display: 'inline-flex' }}>
          <input type="checkbox" className="ptar-switch-input" checked={v.activo} onChange={(e) => onCambio({ ...v, activo: e.target.checked })} aria-label="Este sitio tiene horario de verano" />
          <span className="ptar-switch" aria-hidden="true" />
          <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
        </label>
        <span style={{ marginLeft: '0.6rem', fontWeight: 700, color: 'var(--navy)' }}>Este sitio tiene horario de verano</span>
      </div>
      {!v.activo ? (
        <div className="pt-aviso info" style={{ margin: 0 }}><div>
          Se usa el <strong>horario general todo el año</strong>. Entre el <strong>{mmddTxt(generico.desde)}</strong> y el <strong>{mmddTxt(generico.hasta)}</strong> avisaremos
          al crear un envío de que muchos almacenes cambian de horario en verano, para que lo revises.
        </div></div>
      ) : (
        <>
          <div className="ptar-sitio-grid">
            <div><label htmlFor="ver-desde">Desde</label><SelectorMMDD id="ver-desde" valor={v.desde} onCambio={(x) => onCambio({ ...v, desde: x })} /></div>
            <div><label htmlFor="ver-hasta">Hasta</label><SelectorMMDD id="ver-hasta" valor={v.hasta} onCambio={(x) => onCambio({ ...v, hasta: x })} /></div>
          </div>
          <div style={{ marginTop: '-0.3rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Se repite cada año. Fuera de esas fechas se usa el horario general.</div>
          <EditorHorario valor={v.horario} onCambio={(g) => onCambio({ ...v, horario: g })} />
        </>
      )}
    </div>
  );
}
