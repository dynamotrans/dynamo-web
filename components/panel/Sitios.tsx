'use client';

// Sitios: la agenda de sitios de recogida y entrega. Diseño de #sec-sitios de
// dashboard.html: tabla Empresa · Dirección · Horario · Contacto · Notas, estrella del
// sitio principal y ficha en la ventana del panel con la rejilla .ptar-sitio-grid.
// Dynamo ve los sitios de todos los clientes (con la columna Cliente y su filtro).
import { useEffect, useMemo, useRef, useState } from 'react';
import Paginador from './Paginador';
import { BuscadorUrl } from './BuscadorUrl';
import Buscador from './Buscador';
import { useRefrescar } from '@/lib/useRefrescar';
import Historial from './Historial';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { IconoTipo, TIPOS_SITIO } from './TipoSitio';
import { guardarSitio, borrarSitio, marcarPrincipal, buscarClientes, buscarAgendaSitios, buscarSitiosGoogle, leerSitio, sitioParecido, type SitioDatos, type ClienteOpcion, type SitioGoogle } from '@/app/panel/(app)/sitios/acciones';

import { euros, fechaHora, numero } from '@/lib/formato';
import { paisDe, telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { principal, CONTACTO_VACIO } from '@/lib/contactos';
import EditorContactos from './EditorContactos';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';
import EditorHorario from './EditorHorario';
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

// Los datos de la ficha a partir de una fila (o vacíos): lo usa el estado inicial y el
// comparador de duplicados («Actualizar el mío» parte del registro guardado).
function datosDeFicha(fila: SitioFila | null, veranoDefecto: FechasVerano, almacen: boolean, clienteNuevo: string): SitioDatos {
  const o: Partial<SitioDatos> = fila ? {} : { ...NUEVO, cliente_id: clienteNuevo };
  const w = o as Record<keyof SitioDatos, unknown>;
  if (fila) (Object.keys(NUEVO) as (keyof SitioDatos)[]).forEach((k) => { w[k] = fila[k] ?? NUEVO[k]; });
  if (!o.horario?.length) o.horario = HORARIO_POR_DEFECTO;
  const v = fila?.verano;
  o.verano = { activo: !!v?.activo, desde: v?.desde ?? veranoDefecto.desde, hasta: v?.hasta ?? veranoDefecto.hasta,
               horario: v?.horario?.length ? v.horario : HORARIO_VERANO_POR_DEFECTO.map((g) => ({ dias: [...g.dias], tramos: g.tramos.map((t) => ({ ...t })) })) };
  if (almacen) o.almacen = fila?.almacen ?? { disponible: true, precio_almacenamiento_semana: null, precio_reparto: null };
  return o as SitioDatos;
}

// Direcciones de OpenStreetMap (Nominatim) para el nivel «Dirección» del buscador: gratis
// y sin clave, como en la web pública. Si falla, el buscador sigue con agenda + Google.
type DirOSM = { etiqueta: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais: string };
async function buscarDireccionesOSM(q: string): Promise<DirOSM[]> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&accept-language=es&q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { display_name?: string; address?: Record<string, string> }[];
    return j.map((it) => {
      const a = it.address ?? {};
      const loc = a.city || a.town || a.village || a.municipality || '';
      return {
        etiqueta: (it.display_name ?? '').split(',').slice(0, 3).join(',').trim(),
        direccion: [a.road ?? a.pedestrian ?? '', a.house_number ?? ''].filter(Boolean).join(', '),
        codigo_postal: a.postcode ?? '', poblacion: loc,
        provincia: a.province || (a.state && a.state !== loc ? a.state : '') || '',
        pais: (a.country_code ?? 'es').toUpperCase(),
      };
    }).filter((x) => x.direccion || x.poblacion);
  } catch { return []; }
}

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
          onAbrir={async (id) => { const f = filas.find((x) => x.id === id) ?? await leerSitio(id).catch(() => null); if (f) setFicha({ fila: f }); }}
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
  const [d, setD] = useState<SitioDatos>(() => datosDeFicha(fila, veranoDefecto, !!almacen,
    clientes.length === 1 || clienteFijo ? clientes[0]?.id ?? '' : ''));
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
  const [abierto, setAbierto] = useState({ avisos: false, horario: false });
  const plegar = (k: 'avisos' | 'horario') => setAbierto((a) => ({ ...a, [k]: !a[k] }));
  // Buscador «para autorrellenar» (solo ficha NUEVA): agenda («Guardado»), Google (reales
  // con GOOGLE_MAPS_API_KEY; de ejemplo mientras no se pague la API) y dirección (OSM).
  const [bq, setBq] = useState('');
  const [sug, setSug] = useState<{ ag: { id: string; nombre: string; direccion: string }[]; go: SitioGoogle[]; dir: DirOSM[] }>({ ag: [], go: [], dir: [] });
  const [sugAbierto, setSugAbierto] = useState(false);
  const [avisoParecido, setAvisoParecido] = useState<{ id: string; nombre: string } | null>(null);
  const bqViva = useRef('');
  const elegidoTxt = useRef('');   // lo último ELEGIDO: ese texto no relanza la búsqueda
  useEffect(() => {
    const q = bq.trim(); bqViva.current = q;
    if (fila || almacen) return;
    if (q && q === elegidoTxt.current) { setSug({ ag: [], go: [], dir: [] }); setSugAbierto(false); return; }
    if (q.length < 2) { setSug({ ag: [], go: [], dir: [] }); return; }
    const t = setTimeout(async () => {
      const [ag, go, dir] = await Promise.all([
        buscarAgendaSitios(q, d.cliente_id || null).catch(() => []),
        buscarSitiosGoogle(q).catch(() => []),
        buscarDireccionesOSM(q).catch(() => []),
      ]);
      if (bqViva.current === q) { setSug({ ag, go, dir }); setSugAbierto(true); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la búsqueda depende solo del texto y del cliente
  }, [bq, d.cliente_id]);
  // Elegir una ficha de Google: autorrellena y avisa si ya hay un sitio muy parecido.
  function elegirGoogle(g: SitioGoogle) {
    setD((x) => ({
      ...x, nombre_empresa: g.empresa, direccion: g.direccion, codigo_postal: g.codigo_postal,
      poblacion: g.poblacion, provincia: g.provincia, pais_codigo_iso: g.pais_codigo_iso || 'ES',
      url_google_maps: g.url_google_maps,
      contactos: g.telefono && !x.contactos.some((c) => c.telefono.trim())
        ? x.contactos.map((c, i) => (i === 0 ? { ...c, telefono: g.telefono } : c))
        : x.contactos,
    }));
    elegidoTxt.current = g.empresa;
    setCamposLibres(true);
    setBq(g.empresa); setSugAbierto(false); setAvisoParecido(null);
    sitioParecido(d.cliente_id || null, g.empresa, g.codigo_postal).then(setAvisoParecido).catch(() => {});
  }
  // El comparador de duplicados al guardar: el registro guardado entero + lo que ibas a
  // crear, campo a campo, con flecha para copiar y «Tu registro» editable.
  const [comparar, setComparar] = useState<SitioFila | null>(null);
  const [cmp, setCmp] = useState<Record<string, string>>({});
  // Ficha NUEVA guiada (usuario, 2026-11-09): primero el buscador (caja destacada); el
  // resto de campos queda oculto hasta elegir un resultado o pulsar «rellenar a mano».
  const [camposLibres, setCamposLibres] = useState(false);
  const sinAbrir = !fila && !almacen && !camposLibres;
  const abrirManual = () => {
    setCamposLibres(true); setSugAbierto(false);
    const t = bq.trim();
    if (t && !d.nombre_empresa.trim() && !/\d{4}/.test(t)) set('nombre_empresa', t);
  };
  const set = <K extends keyof SitioDatos>(k: K, v: SitioDatos[K]) => { setD((x) => ({ ...x, [k]: v })); setRepetido(null); };

  async function guardar(aunqueRepetido = false) {
    setError(null);
    if (!almacen && !d.cliente_id) { setError('Elige de qué cliente es el sitio.'); avisaFaltas(['sitio-cliente']); return; }
    const aNum = (t: string) => { const v = t.trim(); return v ? Number(v.replace(/\./g, '').replace(',', '.')) : null; };
    const semana = aNum(precios.semana), reparto = aNum(precios.reparto);
    if ([semana, reparto].some((v) => v != null && (!Number.isFinite(v) || v < 0))) { setError('Los precios tienen que ser un número (o vacíos para usar los de por defecto).'); return; }
    // Cita y medios de carga ocultos de momento: se guardan siempre desactivados.
    const base: SitioDatos = { ...d, requiere_cita: false, tiene_medios_carga: false };
    const datos: SitioDatos = almacen ? { ...base, almacen: { disponible: d.almacen?.disponible ?? true, precio_almacenamiento_semana: semana, precio_reparto: reparto } } : base;
    if (!d.tipo) { setError('Elige el tipo de sitio.'); avisaFaltas(['sitio-tipo']); return; }
    if (!d.nombre_empresa.trim() || !d.direccion.trim() || !d.codigo_postal.trim() || !d.poblacion.trim()) {
      setError('Empresa, dirección, código postal y población son obligatorios.');
      avisaFaltas([!d.nombre_empresa.trim() && 'sitio-nombre_empresa', !d.direccion.trim() && 'sitio-direccion',
        !d.codigo_postal.trim() && 'sitio-codigo_postal', !d.poblacion.trim() && 'sitio-poblacion'].filter(Boolean) as string[]);
      return;
    }
    if (!almacen && !d.contactos.some((x) => x.telefono.trim() && x.email.trim())) {
      setError('El contacto del sitio es obligatorio: pon al menos uno con teléfono y email (el nombre es opcional).'); avisaFaltas(['ct-0-tel', 'ct-0-email']); return;
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
      if (r.duplicado) {
        const full = await leerSitio(r.duplicado.id).catch(() => null);
        if (full) {
          setCmp({
            nombre: full.nombre_empresa ?? '', direccion: full.direccion ?? '', cp: full.codigo_postal ?? '',
            poblacion: full.poblacion ?? '', provincia: full.provincia ?? '',
            telefono: principal(full.contactos)?.telefono ?? '', notas: full.anotaciones ?? '',
          });
          setComparar(full);
        } else setRepetido(r.duplicado);
        return;
      }
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
  const opc = <Req si={false} />;
  const obl = <Req />;
  // Cliente del sitio: en una ficha existente viene con la página; en una nueva se elige con
  // el buscador (los clientes ya no viajan todos a la pantalla).
  const [cliSel, setCliSel] = useState<ClienteOpcion | null>(() => { const c = clientes.find((x) => x.id === d.cliente_id); return c ? { ...c, estado: 'activa' } : null; });
  const cliente = clientes.find((c) => c.id === d.cliente_id) ?? (cliSel?.id === d.cliente_id ? cliSel : undefined);

  // «Actualizar el mío»: guarda sobre el registro EXISTENTE lo editado/copiado en la
  // tabla del comparador (el resto de su ficha —horario, verano, contactos extra— se queda).
  async function actualizarElMio() {
    if (!comparar) return;
    const datos = datosDeFicha(comparar, veranoDefecto, false, '');
    datos.nombre_empresa = cmp.nombre.trim() || datos.nombre_empresa;
    datos.direccion = cmp.direccion.trim() || datos.direccion;
    datos.codigo_postal = cmp.cp.trim() || datos.codigo_postal;
    datos.poblacion = cmp.poblacion.trim() || datos.poblacion;
    datos.provincia = cmp.provincia.trim();
    datos.anotaciones = cmp.notas.trim();
    const tel = cmp.telefono.replace(/[^0-9+]/g, '');
    if (tel) datos.contactos = datos.contactos.length ? datos.contactos.map((c, i) => (i === 0 ? { ...c, telefono: tel } : c)) : [{ ...CONTACTO_VACIO(), telefono: tel }];
    setTrabajando('Actualizando tu registro');
    const r = await guardarSitio(comparar.id, datos);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); setComparar(null); return; }
    onGuardado();
  }
  if (comparar) {
    const propios: Record<string, string> = {
      nombre: d.nombre_empresa, direccion: d.direccion, cp: d.codigo_postal, poblacion: d.poblacion,
      provincia: d.provincia, telefono: d.contactos[0]?.telefono ?? '', notas: d.anotaciones,
    };
    const FILAS: [string, string][] = [['nombre', 'Nombre'], ['direccion', 'Dirección'], ['cp', 'Código postal'], ['poblacion', 'Población'], ['provincia', 'Provincia'], ['telefono', 'Teléfono'], ['notas', 'Notas']];
    return (
      <Modal abierto titulo="Ya tienes un sitio muy parecido" sub="Comprueba que no lo dupliques antes de crearlo"
        icono={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
        onCerrar={() => { if (!trabajando) setComparar(null); }} ancho={700}
        pie={<div className="dup-footer">
          <button className="btn-ghost" onClick={() => guardar(true)} disabled={!!trabajando}>Crear igualmente</button>
          <button className="btn-primary" onClick={actualizarElMio} disabled={!!trabajando}>Actualizar el mío</button>
        </div>}>
        <div className="modal-warn-box">
          Si creas uno nuevo tendrás <strong>dos registros del mismo sitio</strong>. Lo normal es <strong>actualizar el que ya tienes</strong> (puede llevar anotaciones o el teléfono bueno): edita sus campos o cópialos con el botón <strong>→</strong>. Solo pulsa <strong>Crear igualmente</strong> si de verdad es otro sitio distinto (p. ej. otra nave o muelle en la misma dirección).
        </div>
        <div className="table-wrap"><table className="data cmp-table">
          <thead><tr><th></th><th>Datos que ibas a crear</th><th>Tu registro</th></tr></thead>
          <tbody>
            {FILAS.map(([f, label]) => (
              <tr key={f}>
                <td className="cmp-l">{label}</td>
                <td className="cmp-goog">{propios[f]
                  ? <>{propios[f]}<button type="button" className="dup-copy" title="Copiar este dato a mi registro" aria-label={`Copiar ${label} a mi registro`}
                      onClick={() => setCmp((x) => ({ ...x, [f]: propios[f] }))}>→</button></>
                  : <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                <td><input className="dup-inp" aria-label={`${label} de tu registro`} value={cmp[f] ?? ''} onChange={(e) => setCmp((x) => ({ ...x, [f]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {error}</div>}
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }
  return (
    <Modal abierto titulo={fila ? `Editar ${que}` : `Nuevo ${que}`}
      sub={fila ? `${fila.nombre_empresa} · ${fila.codigo}${dynamo && cliente ? ` · ${cliente.nombre}` : ''}` : almacen ? 'Alta de un almacén Dynamo en el catálogo interno' : 'Crea un sitio de recogida/entrega para la agenda'}
      icono={<IcoPin />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        {fila && <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => setConfirmarBorrado(true)} disabled={!!trabajando}>Borrar</button>}
        <button className="btn-primary" onClick={() => guardar(false)} disabled={!!trabajando || sinAbrir}
          title={sinAbrir ? 'Busca primero arriba (o elige «¿No lo encuentras? + Crear un sitio nuevo» en el desplegable)' : undefined}>{fila ? 'Guardar cambios' : `Crear ${que}`}</button>
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
                <label htmlFor="alm-semana">Almacenamiento · 7 días / 1 semana (€) <Req si={false} /></label>
                <input id="alm-semana" type="text" inputMode="decimal" value={precios.semana} placeholder={`${euros(almacen.precioSemana)} por defecto`}
                  onChange={(e) => setPrecios((p) => ({ ...p, semana: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="alm-reparto">Reparto urbano · camión 4 m (€ / reparto) <Req si={false} /></label>
                <input id="alm-reparto" type="text" inputMode="decimal" value={precios.reparto} placeholder={`${euros(almacen.precioReparto)} por defecto`}
                  onChange={(e) => setPrecios((p) => ({ ...p, reparto: e.target.value }))} />
              </div>
            </div>
          </div>
        </>
      )}
      {!fila && !almacen && (
        <div style={{ border: '2px solid var(--green)', background: 'rgba(34,165,90,0.06)', borderRadius: 12, padding: '0.7rem 0.8rem', marginBottom: '0.8rem' }}>
          {/* Dentro de la rejilla estándar para que el campo tenga el mismo tamaño y
              estilo que el resto de la ficha (antes salía con el del navegador). */}
          <div className="ptar-sitio-grid" style={{ position: 'relative', gridTemplateColumns: '1fr' }}>
            <div style={{ position: 'relative' }}>
            <label htmlFor="sitio-buscar" style={{ color: 'var(--green)', fontWeight: 700 }}>Empieza aquí: busca para autorrellenar (tu agenda, Google o dirección)</label>
            <input id="sitio-buscar" autoComplete="off" placeholder="Escribe empresa o dirección…" value={bq}
              onChange={(e) => { setBq(e.target.value); setAvisoParecido(null); }}
              onFocus={() => setSugAbierto(true)} onBlur={() => setTimeout(() => setSugAbierto(false), 150)} />
            {sugAbierto && bq.trim().length >= 2 && (
              <ul className="ptar-sug" style={{ zIndex: 1300 }}>
                {sug.ag.length === 0 && sug.go.length === 0 && sug.dir.length === 0 && (
                  <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Sin resultados con ese nombre.</li>
                )}
                {sug.ag.map((x) => (
                  <li key={`a${x.id}`} onMouseDown={(e) => { e.preventDefault(); setSugAbierto(false); onAbrir(x.id); }}>
                    <span className="sug-chip sug-chip-saved">Guardado</span><strong>{x.nombre}</strong><span className="sug-dir">{x.direccion}</span>
                  </li>
                ))}
                {sug.go.map((g, i) => (
                  <li key={`g${i}`} onMouseDown={(e) => { e.preventDefault(); elegirGoogle(g); }}>
                    <span className="sug-chip sug-chip-google">Google</span><strong>{g.empresa}</strong><span className="sug-dir">{g.etiqueta}</span>
                  </li>
                ))}
                {sug.dir.map((x, i) => (
                  <li key={`d${i}`} onMouseDown={(e) => {
                    e.preventDefault();
                    setD((v) => ({ ...v, direccion: x.direccion || v.direccion, codigo_postal: x.codigo_postal || v.codigo_postal, poblacion: x.poblacion || v.poblacion, provincia: x.provincia || v.provincia, pais_codigo_iso: x.pais || v.pais_codigo_iso }));
                    elegidoTxt.current = x.etiqueta;
                    setCamposLibres(true);
                    setBq(x.etiqueta); setSugAbierto(false);
                  }}>
                    <span className="sug-chip sug-chip-addr">Dirección</span><span className="sug-dir">{x.etiqueta}</span>
                  </li>
                ))}
                <li onMouseDown={(e) => { e.preventDefault(); abrirManual(); }}>
                  <strong style={{ color: 'var(--purple)' }}>¿No lo encuentras? + Crear un sitio nuevo</strong>
                </li>
              </ul>
            )}
            </div>
          </div>
          {avisoParecido && (
            <div className="modal-warn-box" style={{ marginTop: '0.6rem' }}>
              Ya tienes un sitio muy parecido guardado: <strong>{avisoParecido.nombre}</strong>. Puede tener anotaciones o el teléfono bueno.{' '}
              <a href="#" style={{ color: 'var(--purple)', fontWeight: 700 }} onClick={(e) => { e.preventDefault(); onAbrir(avisoParecido.id); }}>Abrir mi registro</a>
            </div>
          )}
        </div>
      )}
      {/* Hasta que el buscador rellene (o se pida «a mano»), el resto de la ficha queda
          oculto: guía primero por el buscador (usuario, 2026-11-09). */}
      {sinAbrir ? null : (<>
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
        {/* CP y Población en la MISMA fila; el CP, justo para 5-6 dígitos. */}
        <div className="ptar-sitio-grid" style={{ gridColumn: '1/-1', gridTemplateColumns: 'minmax(96px, 120px) minmax(0, 1fr)' }}>
          {campo('codigo_postal', <>CP {obl}</>, '41016')}
          {campo('poblacion', <>Población {obl}</>, 'Sevilla')}
        </div>
        {/* Provincia y País SIEMPRE en la misma fila (también en el móvil), como rejilla
            ANIDADA de la estándar: mismos estilos, tamaños y separación que el resto. */}
        <div className="ptar-sitio-grid" style={{ gridColumn: '1/-1', gridTemplateColumns: '1fr 1fr' }}>
          {campo('provincia', <>Provincia {opc}</>, 'Sevilla')}
          <div>
            <label htmlFor="sitio-pais">País</label>
            <SelectorPais id="sitio-pais" valor={d.pais_codigo_iso} onCambio={(v) => set('pais_codigo_iso', v)} />
          </div>
        </div>
        {/* «Requiere cita», «Tiene medios de carga» y «Enlace de Google Maps» ocultos de momento
            (decisión del usuario, 2026-11-08): no se usan por ahora; se dejan desactivados al
            guardar. No se tocan las tablas. */}
      </div>

      {/* El contacto del sitio es OBLIGATORIO (usuario, 2026-11-09): va tras el país,
          desplegado y sin el campo Cargo. */}
      <div className="ptar-section-head" style={{ marginTop: '0.9rem' }}>Contacto de sitio <Req /></div>
      <div className="ptar-sitio-grid">
        <EditorContactos valor={d.contactos} onCambio={(l) => set('contactos', l)} conCargo={false} conAvisos={dynamo} obligatorios />
      </div>

      {/* Lo demás PLEGADO con su resumen a la vista (usuario, 2026-11-08: ficha compacta). */}
      <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.9rem' }}>
        {/* El email de avisos del sitio salió de la ficha (usuario, 2026-11-09): los avisos
            van a los CONTACTOS (todos nacen recibiéndolos; Dynamo puede apagarlos). */}
        <button type="button" className="ptar-notes-toggle" aria-expanded={abierto.avisos} onClick={() => plegar('avisos')} style={{ margin: 0 }}>
          <span className="pnt-icon" aria-hidden="true">{abierto.avisos ? '−' : '+'}</span>
          <span><strong>Notas internas del sitio</strong>{' '}
            {d.anotaciones.trim() ? <span className="badge badge-green">Con datos</span> : <span style={{ color: 'var(--gray-500)' }}>(privadas · opcional)</span>}</span>
        </button>
        {abierto.avisos && (
          <div className="ptar-sitio-grid">
            {campo('anotaciones', <>Notas internas del sitio <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· privadas</span></>, 'Ej. referencia de carga/entrega, pedir cita, báscula…', true)}
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
              : <VeranoSitio v={d.verano!} onCambio={(v) => set('verano', v)} />}
          </div>
        )}

      </div>
      </>)}
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
function VeranoSitio({ v, onCambio }: { v: { activo: boolean; desde: string; hasta: string; horario: GrupoHorario[] };
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
          Se usa el <strong>horario general todo el año</strong>.
        </div></div>
      ) : (
        <>
          <div className="ptar-sitio-grid">
            <div><label htmlFor="ver-desde">Desde <Req /></label><SelectorMMDD id="ver-desde" valor={v.desde} onCambio={(x) => onCambio({ ...v, desde: x })} /></div>
            <div><label htmlFor="ver-hasta">Hasta <Req /></label><SelectorMMDD id="ver-hasta" valor={v.hasta} onCambio={(x) => onCambio({ ...v, hasta: x })} /></div>
          </div>
          <div style={{ marginTop: '-0.3rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Se repite cada año. Fuera de esas fechas se usa el horario general.</div>
          <EditorHorario valor={v.horario} onCambio={(g) => onCambio({ ...v, horario: g })} />
        </>
      )}
    </div>
  );
}
