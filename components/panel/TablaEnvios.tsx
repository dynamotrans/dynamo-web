import Link from 'next/link';
import FilaEnlace from './FilaEnlace';
import BuscadorEnvios from './BuscadorEnvios';
import { euros, fechaHora, numero, tipoCargaTxt } from '@/lib/formato';
import { esDynamo, type Rol } from '@/lib/sesion';
import { type EnvioFila, type Parada, type Pestana, estadoVisual, asignacion, enPestana, urgencia, fechaCarga, fechaEntrega, dirParada, paradasDe, medidas, coincide } from '@/lib/envios';

// Tabla de envíos con el diseño de dashboard.html (sección #sec-cargas). Recibe los
// datos ya leídos y con los permisos del rol aplicados en el servidor.
const POR_PAGINA = 20;
const PESTANAS: { f: Pestana; titulo: string; soloDynamo?: boolean; siHay?: boolean }[] = [
  { f: 'solicitudes', titulo: 'Solicitudes de precio', siHay: true },
  { f: 'sin-pagar', titulo: 'Pendientes de pago', siHay: true },
  { f: 'sin-asignar', titulo: 'Sin asignar transportista', soloDynamo: true },
  { f: 'programada', titulo: 'Programados' },
  { f: 'entregada', titulo: 'Entregados' },
  { f: 'cancelada', titulo: 'Cancelados' },
  { f: 'todas', titulo: 'Todas' },
];

// Pestañas que se ven (las de «solo si hay» aparecen cuando tienen algo) y la elegida.
export function visiblesPestanas(dynamo: boolean, fParam: string | undefined, cuantos: (p: Pestana) => number) {
  return PESTANAS.filter((p) => (dynamo || !p.soloDynamo) && (!p.siHay || cuantos(p.f) > 0 || fParam === p.f));
}
export function pestanaElegida(dynamo: boolean, fParam: string | undefined, cuantos: (p: Pestana) => number): Pestana {
  return (visiblesPestanas(dynamo, fParam, cuantos).find((p) => p.f === fParam)?.f ?? (dynamo ? 'sin-asignar' : 'programada')) as Pestana;
}
export const POR_PAGINA_ENVIOS = POR_PAGINA;

const SubBase = () => (<><br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>base sin IVA</span></>);

type Props = {
  filas: EnvioFila[]; nombres: Record<string, string>; rol: Rol;
  f?: string; q: string; p?: string; error: string | null; nuevo?: string; nota?: string | null; nuevoManual?: boolean;
  // Buscador (todos los años): fechas de carga y la página de resultados de la base de datos.
  desde?: string; hasta?: string; busqueda?: { total: number; pagina: number; porPagina: number } | null;
  // Lista normal por páginas desde la base de datos (envios_pestanas / envios_pagina): cuántos
  // hay en cada pestaña, la pestaña elegida y la página (las filas ya son solo las de esa página).
  conteos?: Record<string, number> | null; pestana?: Pestana; pagina?: number; totalPestana?: number;
};
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export default function TablaEnvios({ filas, nombres, rol, f: fParam, q, p: pParam, error, nuevo, nota, nuevoManual, desde = '', hasta = '', busqueda = null, conteos = null, pestana, pagina, totalPestana = 0 }: Props) {
  const dynamo = esDynamo(rol);
  const modoBusqueda = !!busqueda;
  // ---- Pestaña, buscador y página
  const enBd = !!conteos && !modoBusqueda;
  const cuantos = (p: Pestana) => (enBd ? conteos![p] ?? 0 : filas.filter((e) => enPestana(e, p)).length);
  const pestanas = visiblesPestanas(dynamo, fParam, cuantos);
  const f = (enBd && pestana) ? pestana : pestanaElegida(dynamo, fParam, cuantos);
  // Con búsqueda, la base de datos ya ha filtrado (en todos los años) y pagina de 100 en 100.
  const buscadas = modoBusqueda || enBd ? filas : q ? filas.filter((e) => coincide(e, q)) : filas;
  const lista = modoBusqueda || enBd ? filas : buscadas.filter((e) => enPestana(e, f));
  const totalLista = enBd ? totalPestana : lista.length;
  const paginas = Math.max(1, Math.ceil(totalLista / POR_PAGINA));
  const pag = modoBusqueda ? 1 : enBd ? Math.min(Math.max(1, pagina ?? 1), paginas) : Math.min(Math.max(1, Number(pParam) || 1), paginas);
  const trozo = modoBusqueda || enBd ? lista : lista.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const pbTotal = busqueda ? Math.max(1, Math.ceil(busqueda.total / busqueda.porPagina)) : 1;
  const url = (o: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const v: Record<string, string | number | undefined> = { f, q: q || undefined, desde: desde || undefined, hasta: hasta || undefined, pb: busqueda && busqueda.pagina > 1 ? busqueda.pagina : undefined, ...o };
    Object.entries(v).forEach(([k, x]) => { if (x !== undefined && x !== '' && !((k === 'p' || k === 'pb') && String(x) === '1')) u.set(k, String(x)); });
    return `/panel/envios${u.toString() ? `?${u}` : ''}`;
  };

  const columnas = 6 + (dynamo ? 4 : rol === 'cliente' ? 2 : 1);

  return (
    <section className="section active" id="sec-cargas">
      <div className="sec-header">
        <h2>{rol === 'transportista' ? 'Mis envíos' : 'Envíos'}</h2>
        {rol !== 'transportista' && (
          <div className="sec-header-actions">
            <Link className="btn-primary" href="/panel/nuevo-envio">+ Nuevo envío</Link>
          </div>
        )}
      </div>

      {!modoBusqueda && <div className="tabs" data-table="cargas">
        {pestanas.map((p) => (
          <Link key={p.f} href={url({ f: p.f, p: 1 })} className={`tab${p.f === f ? ' active' : ''}`}>
            {p.titulo} (<span>{numero(cuantos(p.f), 0)}</span>)
          </Link>
        ))}
      </div>}

      <BuscadorEnvios f={f} q={q} desde={desde} hasta={hasta}
        placeholder={rol === 'transportista' ? 'Buscar: nº, matrícula, conductor, población…' : 'Buscar en todos los años: nº, empresa, matrícula, población, mercancía…'} />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '-0.3rem 0 0.8rem', fontSize: 'var(--fs-s)' }}>
        {(() => {
          const h = hoyISO(), y = Number(h.slice(0, 4));
          const atajos: [string, string, string][] = [
            ['Este mes', `${h.slice(0, 7)}-01`, h], ['Este año', `${y}-01-01`, `${y}-12-31`], ['Año pasado', `${y - 1}-01-01`, `${y - 1}-12-31`], ['Todas las fechas', '', ''],
          ];
          return atajos.map(([t, d, hh]) => (
            <Link key={t} className={`chip${desde === d && hasta === hh && (d || modoBusqueda) ? ' active' : ''}`} href={url({ desde: d || undefined, hasta: hh || undefined, pb: 1, p: 1 })}
              style={{ padding: '0.2rem 0.6rem', borderRadius: 999, border: '1px solid var(--gray-300)', textDecoration: 'none' }}>{t}</Link>
          ));
        })()}
        {modoBusqueda && <Link href="/panel/envios" style={{ marginLeft: 'auto' }}>✕ Quitar búsqueda</Link>}
      </div>

      {nuevo && (
        <div className="pt-aviso info" role="status"><div>
          {dynamo
            ? <><strong>Envío #{nuevo} creado.</strong> Queda programado, a la espera de asignar transportista.</>
            : nuevoManual
            ? <><strong>Envío #{nuevo} creado</strong> con tu operador. Ábrelo para sacar la orden de carga y llevar su estado.</>
            : <><strong>Solicitud #{nuevo} enviada.</strong> Te pasamos el precio en menos de 25 minutos (en horario de oficina) y lo verás aquí para aceptarlo.</>}
        </div></div>
      )}

      {error && (
        <div className="pt-aviso error">No se han podido cargar los envíos: {error}</div>
      )}
      {nota && <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>{nota}</div></div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Envío</th><th>Recogida</th><th>Entrega</th>
            {dynamo && <th className="cliente-col">Cliente · CIF</th>}
            <th>Mercancía</th><th>Vehículo</th>
            {rol !== 'transportista' && <th>P. cliente<SubBase /></th>}
            {dynamo && <th className="col-ptransp">P. transportista<SubBase /></th>}
            {dynamo && <th className="col-margen">Margen<SubBase /></th>}
            {rol === 'transportista' && <th>Tu precio<SubBase /></th>}
            {rol !== 'transportista' && <th>Creado por</th>}
          </tr></thead>
          <tbody>
            {trozo.length === 0 ? (
              <tr><td colSpan={columnas} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {modoBusqueda ? 'Ningún envío coincide (en todos los años).' : (enBd ? (conteos!.todas ?? 0) === 0 : filas.length === 0) ? 'Todavía no hay envíos.' : 'Sin envíos en este filtro'}
              </td></tr>
            ) : trozo.map((e) => <FilaEnvio key={e.id} e={e} rol={rol} dynamo={dynamo} creador={e.creado_por ? nombres[e.creado_por] : undefined} href={url({ p: pag, ver: e.id })} />)}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div className="pagination-left">
          <span>{busqueda
            ? (busqueda.total ? `Resultados ${numero((busqueda.pagina - 1) * busqueda.porPagina + 1, 0)}–${numero(Math.min(busqueda.pagina * busqueda.porPagina, busqueda.total), 0)} de ${numero(busqueda.total, 0)} (todos los años)` : 'Sin resultados en todos los años. Prueba con menos palabras o sin fechas.')
            : totalLista ? `Mostrando ${numero((pag - 1) * POR_PAGINA + 1, 0)}–${numero(Math.min(pag * POR_PAGINA, totalLista), 0)} de ${numero(totalLista, 0)} envíos` : 'Sin envíos'}</span>
        </div>
        {busqueda && pbTotal > 1 && (
          <div className="pagination-pages">
            {busqueda.pagina > 1 && <Link href={url({ pb: busqueda.pagina - 1 })} aria-label="Anteriores">‹ Anteriores {busqueda.porPagina}</Link>}
            <span style={{ padding: '0 0.4rem' }}>Página {busqueda.pagina} de {pbTotal}</span>
            {busqueda.pagina < pbTotal && <Link href={url({ pb: busqueda.pagina + 1 })} aria-label="Siguientes">Siguientes {busqueda.porPagina} ›</Link>}
          </div>
        )}
        {!busqueda && paginas > 1 && (
          <div className="pagination-pages">
            {pag > 1 && <Link href={url({ p: pag - 1 })} aria-label="Anterior">‹</Link>}
            {Array.from({ length: paginas }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === paginas || Math.abs(n - pag) <= 2)
              .map((n, i, arr) => (
                <span key={n} style={{ display: 'contents' }}>
                  {i > 0 && n - arr[i - 1] > 1 && <span style={{ padding: '0 0.3rem', color: 'var(--gray-500)' }}>…</span>}
                  <Link href={url({ p: n })} className={n === pag ? 'active' : ''}>{n}</Link>
                </span>
              ))}
            {pag < paginas && <Link href={url({ p: pag + 1 })} aria-label="Siguiente">›</Link>}
          </div>
        )}
      </div>
    </section>
  );
}

function Parada({ p, fechaTxt, tipo }: { p: Parada; fechaTxt: string; tipo: 'orig' | 'dest' }) {
  return (
    <div className="rf-stop"><div className="rf-line">
      <span className={`rf-dot ${tipo}`} />
      <span className="rf-txt">
        <span className="rf-fecha"><strong>{fechaTxt}</strong></span>
        <span className="rf-dir">{dirParada(p) || '—'}</span>
        {p.nombre_empresa && <> <span className="rf-site">({p.nombre_empresa})</span></>}
      </span>
    </div></div>
  );
}

function FilaEnvio({ e, rol, dynamo, creador, href }: { e: EnvioFila; rol: string; dynamo: boolean; creador?: string; href?: string }) {
  const ev = estadoVisual(e);
  const asig = asignacion(e);
  const { recogidas, entregas } = paradasDe(e);
  const fc = fechaCarga(e), fe = fechaEntrega(e);
  const manual = !!e.es_manual;
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  const margen = pc != null && pt != null ? pc - pt : null;
  const fijado = e.precio_fijado_a_mano ? <div className="meta-manual">fijado a mano</div> : null;
  const completo = e.tipo_carga === 'completa';

  return (
    <Fila href={href} className={urgencia(e) || undefined}>
      <td className="ref">
        <div className="envio-estado envio-estado-top"><span className={`badge badge-${ev.color}`}>{ev.label}</span></div>
        {dynamo && e.estado_cambio_cliente === 'pendiente' && <div className="meta" style={{ color: '#b45309', fontWeight: 800 }}>Cambio pedido por el cliente</div>}
        {dynamo && e.requiere_revision_precio && <div className="meta" style={{ color: '#b42318', fontWeight: 800 }}>Revisar precio (ruta cambiada)</div>}
        <strong>#{e.referencia_gx}</strong>
        {e.referencia_cliente && <> <span className="ref-cli-inline">({e.referencia_cliente})</span></>}
        {rol !== 'transportista' && (
          <div className="op-chip2-wrap">
            {manual ? (
              <span className="op-chip2 op-chip2-otro" title={e.operador ?? 'Otro operador'}>
                <span className="op-chip2-ic op-chip2-ic-truck">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                </span>
                <span className="op-chip2-name">{(e.operador ?? 'Otro operador').replace(/,?\s+(S\.?L\.?U?\.?|S\.?A\.?)$/i, '')}</span>
              </span>
            ) : (
              <span className="op-chip2 op-chip2-dynamo" title="Dynamo Operador Logístico, S.L.">
                <span className="op-chip2-ic"><img src="/images/dynamo-logo-sq.png" alt="" /></span>
                <span className="op-chip2-name">Dynamo</span>
              </span>
            )}
          </div>
        )}
      </td>
      <td className="route-full route-rec"><div className="rf-stops"><div className="rf-col">
        {recogidas.map((p, i) => <Parada key={i} p={p} fechaTxt={fc} tipo="orig" />)}
      </div></div></td>
      <td className="route-full route-ent"><div className="rf-stops"><div className="rf-col">
        {entregas.map((p, i) => <Parada key={i} p={p} fechaTxt={fe} tipo="dest" />)}
      </div></div></td>
      {dynamo && (
        <td className="cliente-col">
          <strong>{e.cliente ?? '—'}</strong>
          <div className="meta" style={{ whiteSpace: 'nowrap' }}>{e.cliente_cif ?? '—'}</div>
        </td>
      )}
      <td className="mercancia">
        {e.paletizado === false ? 'No paletizado' : 'Paletizado'}
        {medidas(e) && <div className="meta meta-medidas">{medidas(e)}</div>}
        {e.tipo_carga && (
          <div className="meta"><span className={`carga-tag ${completo ? 'carga-completo' : 'carga-grupaje'}`}>{tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora) || 'Grupaje'}</span></div>
        )}
      </td>
      <td className="vehiculo">
        {asig && <div className={`asig-line asig-top asig-${asig.key}`}><span className="asig-dot" />{asig.label}</div>}
        {e.matricula_camion ? <span className="meta-matricula">{e.matricula_camion}</span> : <span className="meta meta-pend">Sin matrícula</span>}
        {e.matricula_remolque && <div className="meta">Remolque: <span className="meta-matricula" style={{ fontSize: 'var(--fs-s)' }}>{e.matricula_remolque}</span></div>}
      </td>
      {rol !== 'transportista' && (manual ? (
        <td className="amount">
          {e.precio_acordado_operador != null
            ? <><span style={{ fontWeight: 800, color: 'var(--navy)' }}>{euros(e.precio_acordado_operador)}</span><div className="meta">acordado</div></>
            : '—'}
        </td>
      ) : (
        <td className={`amount${dynamo ? ' td-precio' : ''}`}><strong>{pc != null ? euros(pc) : '—'}</strong>{dynamo && fijado}</td>
      ))}
      {dynamo && <td className="amount td-precio col-ptransp">{manual ? '—' : <><strong>{pt != null ? euros(pt) : '—'}</strong>{fijado}</>}</td>}
      {dynamo && (
        <td className="amount col-margen">
          {manual || margen == null ? '—' : <span className={margen > 0 ? 'marg-pos' : margen < 0 ? 'marg-neg' : ''}>{euros(margen)}</span>}
        </td>
      )}
      {rol === 'transportista' && <td className="amount"><strong>{pt != null ? euros(pt) : '—'}</strong></td>}
      {rol !== 'transportista' && (
        <td className="creadopor" style={{ whiteSpace: 'nowrap', fontSize: 'var(--fs-s)', color: 'var(--gray-700)' }}>
          <strong>{creador ?? '—'}</strong>
          {e.creado_en && <div className="meta" style={{ whiteSpace: 'nowrap' }}>Creación: {fechaHora(e.creado_en)}</div>}
          {e.modificado_en && <div className="meta" style={{ whiteSpace: 'nowrap' }}>Modificación: {fechaHora(e.modificado_en)}</div>}
        </td>
      )}
    </Fila>
  );
}

// Dynamo abre la ficha al pulsar la fila; los demás (etapas B y C) aún no tienen ficha.
function Fila({ href, className, children }: { href?: string; className?: string; children: React.ReactNode }) {
  return href ? <FilaEnlace href={href} className={className}>{children}</FilaEnlace> : <tr className={className}>{children}</tr>;
}
