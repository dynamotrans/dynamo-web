import CuentaAtras from './CuentaAtras';
import ContadorCambio from '@/components/panel/ContadorCambio';
import Link from 'next/link';
import EstadoVacio from './EstadoVacio';
import EtiquetaParada from './EtiquetaParada';
import FilaEnlace from './FilaEnlace';
import FiltrosEnvios, { type OpcionFiltro } from './FiltrosEnvios';
import CalendarioEnvios from './CalendarioEnvios';
import BotonNuevoEnvio from './BotonNuevoEnvio';
import SelectorVistaEnvios from './SelectorVistaEnvios';
import { euros, fechaHora, numero, tipoCargaTxt } from '@/lib/formato';
import { esDynamo, type Rol } from '@/lib/sesion';
import { type EnvioFila, type Parada, type Pestana, estadoVisual, esPendientePago, asignacion, enPestana, urgencia, fechaCarga, fechaEntrega, dirParada, paradasDe, medidas, coincide } from '@/lib/envios';

// Tabla de envíos con el diseño de dashboard.html (sección #sec-cargas). Recibe los
// datos ya leídos y con los permisos del rol aplicados en el servidor.
const POR_PAGINA = 20;
const PESTANAS: { f: Pestana; titulo: string; soloDynamo?: boolean; siHay?: boolean }[] = [
  // «Pendientes de pago» DESPUÉS de «Sin asignar transportista» (usuario, 2026-11-10):
  // un envío sin pagar no está aún en la cola de asignar camión (sin-asignar los excluye
  // y la base de datos rechaza asignar u ofertar hasta que se pague). Las dos aparecen
  // solo cuando tienen algo (usuario, 2026-11-10); a 0, se entra en «Programados».
  { f: 'sin-asignar', titulo: 'Sin asignar transportista', soloDynamo: true, siHay: true },
  { f: 'sin-pagar', titulo: 'Pendientes de pago', siHay: true },
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
  const vis = visiblesPestanas(dynamo, fParam, cuantos);
  return (vis.find((p) => p.f === fParam)?.f
    // Por defecto, la bandeja de trabajo de Dynamo; oculta (a 0), «Programados». Y si no
    // hay ningún programado pero sí pendientes de pago, se entra en esos: desde 2026-11-16
    // «Programados» ya no los enseña, y entrar a una lista vacía los escondería.
    ?? (dynamo && vis.some((p) => p.f === 'sin-asignar') ? 'sin-asignar'
      : cuantos('programada') === 0 && cuantos('sin-pagar') > 0 ? 'sin-pagar' : 'programada')) as Pestana;
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
  // La barra de filtros del mockup y la vista (lista o calendario con su mes).
  op?: string; por?: string; est?: string; fr?: string; fd?: string; fh?: string;
  operadores?: OpcionFiltro[]; creadores?: OpcionFiltro[];
  vista?: 'lista' | 'calendario'; mes?: string; hoy?: string;
  // «Ver como» un transportista (Dynamo): un transportista no crea envíos, así que el
  // botón «+ Nuevo envío» tampoco sale en su vista (usuario, 2026-11-09).
  vistaTransportista?: boolean;
};
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export default function TablaEnvios({ filas, nombres, rol, f: fParam, q, p: pParam, error, nuevo, nota, nuevoManual, desde = '', hasta = '', busqueda = null, conteos = null, pestana, pagina, totalPestana = 0,
  op = '', por = '', est = '', fr = '', fd = '', fh = '', operadores = [], creadores = [], vista = 'lista', mes = '', hoy = '', vistaTransportista = false }: Props) {
  const vistaCal = vista === 'calendario';
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
    // Las páginas, las pestañas y la ficha conservan los filtros de la barra (operador, creado por,
    // fecha y, en la misma pestaña, el estado).
    const v: Record<string, string | number | undefined> = { f, q: q || undefined, desde: desde || undefined, hasta: hasta || undefined, pb: busqueda && busqueda.pagina > 1 ? busqueda.pagina : undefined,
      op: op || undefined, por: por || undefined, est: o.f && o.f !== f ? undefined : est || undefined,
      fr: vistaCal ? undefined : fr || undefined, fd: fr === 'entre' ? fd || undefined : undefined, fh: fr === 'entre' ? fh || undefined : undefined, ...o };
    Object.entries(v).forEach(([k, x]) => { if (x !== undefined && x !== '' && !((k === 'p' || k === 'pb') && String(x) === '1')) u.set(k, String(x)); });
    return `/panel/envios${u.toString() ? `?${u}` : ''}`;
  };

  const columnas = 6 + (dynamo ? 3 : 1);

  return (
    <section className="section active" id="sec-cargas">
      <div className="sec-header">
        <h2>{rol === 'transportista' ? 'Mis envíos' : 'Envíos'}</h2>
        <div className="sec-header-actions">
          <SelectorVistaEnvios vista={vistaCal ? 'calendario' : 'lista'} q={q} op={op} por={por} f={f} />
          {rol !== 'transportista' && !vistaTransportista && <BotonNuevoEnvio />}
        </div>
      </div>

      {!modoBusqueda && !vistaCal && <div className="tabs" data-table="cargas">
        {pestanas.map((p) => (
          <Link key={p.f} href={url({ f: p.f, p: 1 })} className={`tab${p.f === f ? ' active' : ''}`}>
            {p.titulo} (<span>{numero(cuantos(p.f), 0)}</span>)
          </Link>
        ))}
      </div>}

      <FiltrosEnvios f={f} q={q} op={op} por={por} est={est} fr={fr} fd={fd} fh={fh} vistaCal={vistaCal} mes={mes}
        operadores={operadores} creadores={creadores} mostrarEstado={!vistaCal && f === 'programada'}
        placeholder={rol === 'transportista' ? 'Buscar: nº, matrícula, conductor, población…' : 'Buscar por cualquier dato: nº, empresa, dirección, matrícula, población, mercancía…'} />
      {vistaCal && (
        <CalendarioEnvios filas={filas} mes={mes || (hoy || hoyISO()).slice(0, 7)} hoy={hoy || hoyISO()} q={q} op={op} por={por}
          puedeCrear={rol !== 'transportista' && !vistaTransportista} />
      )}
      {!vistaCal && <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '-0.3rem 0 0.8rem', fontSize: 'var(--fs-s)' }}>
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
      </div>}

      {nuevo && (
        <div className="pt-aviso info" role="status"><div>
          {dynamo
            ? <><strong>Envío #{nuevo} creado.</strong> Queda programado, a la espera de asignar transportista.</>
            : nuevoManual
            ? <><strong>Envío #{nuevo} creado</strong> con tu operador. Ábrelo para sacar la orden de carga y llevar su estado.</>
            : <><strong>Envío #{nuevo} creado</strong> con el precio del tarifador. Si tu cuenta paga por adelantado, el camión se asigna al recibir el pago.</>}
        </div></div>
      )}

      {error && (
        <div className="pt-aviso error">No se han podido cargar los envíos: {error}</div>
      )}
      {nota && <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>{nota}</div></div>}

      {!vistaCal && <>
      <div className="table-wrap" tabIndex={0}>
        <table className="data">
          <thead><tr>
            {/* Dynamo: la PRIMERA columna dice de quién es el envío (usuario, 2026-11-19):
                el cliente en una etiqueta azul marino, su CIF y quién lo creó y cuándo. */}
            {dynamo && <th>Cliente · creado por</th>}
            <th>Envío</th><th>Recogida</th><th>Entrega</th>
            <th>Mercancía</th><th>{dynamo ? 'Transportista' : 'Vehículo'}</th>
            {rol !== 'transportista' && <th>P. cliente<SubBase /></th>}
            {dynamo && <th className="col-ptransp">P. transportista<SubBase /></th>}
            {dynamo && <th className="col-margen">Margen<SubBase /></th>}
            {rol === 'transportista' && <th>Tu precio<SubBase /></th>}
          </tr></thead>
          <tbody>
            {trozo.length === 0 ? (
              <tr><td colSpan={columnas} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {modoBusqueda ? 'Ningún envío coincide (en todos los años).'
                  : (enBd ? (conteos!.todas ?? 0) === 0 : filas.length === 0)
                  ? (rol === 'transportista' || vistaTransportista
                    ? <EstadoVacio titulo="Todavía no hay envíos" texto="Aquí saldrán los envíos que Dynamo te asigne o te ofrezca, con su orden de carga, el estado y el eCMR para firmar." />
                    : <EstadoVacio titulo="Todavía no hay envíos"
                        texto="Crea tu primer envío en 2 minutos: origen, destino y fecha — el precio sale al momento, sin llamadas ni esperas."
                        accion={<Link className="btn-primary" href="/panel/nuevo-envio">+ Crear tu primer envío</Link>} />)
                  // La pestaña Programados a cero con envíos antiguos en otras pestañas
                  // (usuario, 2026-11-14): mismo estilo que el vacío de Sitios, con el
                  // botón de crear (salvo transportista, que no crea envíos).
                  : f === 'programada'
                  ? (rol === 'transportista' || vistaTransportista
                    ? <EstadoVacio titulo="Nada programado ahora mismo" texto="Aquí saldrán los envíos que Dynamo te asigne o te ofrezca, con su orden de carga, el estado y el eCMR para firmar." />
                    : <EstadoVacio titulo={dynamo ? 'No hay envíos programados' : 'No tienes envíos programados'}
                        texto="Crea un envío nuevo y síguelo aquí de principio a fin: el precio sale al momento, sin llamadas ni esperas."
                        accion={<Link className="btn-primary" href="/panel/nuevo-envio">+ Crear nuevo envío</Link>} />)
                  : 'Sin envíos en este filtro'}
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
      </>}
    </section>
  );
}

function Parada({ p, fechaTxt, tipo, n }: { p: Parada; fechaTxt: string; tipo: 'orig' | 'dest'; n: number }) {
  return (
    <div className="rf-stop"><div className="rf-line">
      {/* La pastilla de la parada (usuario, 2026-11-19), como en «Nuevo envío»: nº del
          recorrido, Recogida/Entrega por color y el icono del tipo de sitio. */}
      <EtiquetaParada num={n} tipo={tipo === 'orig' ? 'carga' : 'descarga'} tipoSitio={p.tipo_sitio} mini />
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
  const reservado = !!(e.transportista_asignado || e.estado_asignacion === 'confirmada' || ['hacia_la_carga', 'cargando', 'en_ruta'].includes(e.estado));
  // La etiqueta del vehículo cuando aún no hay matrícula (null = «—»).
  const vehiculo: { txt: string; cls: string } | null =
    e.estado === 'entregado' || e.estado === 'cancelado' ? null
    : esPendientePago(e) ? { txt: asig?.label ?? 'Se asigna al pagar', cls: 'badge-gray' }
    : e.es_manual ? { txt: 'Sin matrícula', cls: 'badge-gray' }
    : e.estado === 'borrador' ? null
    : reservado ? { txt: 'Camión reservado', cls: 'badge-green' }
    // Igual que el estado del envío (usuario, 2026-11-19): si aún no se está buscando
    // camión, «Programado»; si se está buscando, «Asignando transportista».
    : e.asignando ? { txt: 'Asignando transportista', cls: 'badge-orange' }
    : { txt: 'Programado', cls: 'badge-gray' };
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
      {dynamo && (
        <td className="creadopor">
          <span className="cli-tag" title={e.cliente ?? undefined}>{e.cliente ?? 'Sin cliente'}</span>
          {e.cliente_cif && <div className="meta" style={{ whiteSpace: 'nowrap' }}>CIF {e.cliente_cif}</div>}
          <div className="meta creado-quien">Creado por <strong>{creador ?? '—'}</strong></div>
          {e.creado_en && <div className="meta" style={{ whiteSpace: 'nowrap' }}>Creación: {fechaHora(e.creado_en)}</div>}
          {e.modificado_en && <div className="meta" style={{ whiteSpace: 'nowrap' }}>Modificación: {fechaHora(e.modificado_en)}</div>}
        </td>
      )}
      <td className="ref">
        <div className="envio-estado envio-estado-top"><span className={`badge badge-${ev.color}`}>{ev.label}</span></div>
        {esPendientePago(e) && (e.pago_avisado_en
          ? <div className="meta pago-plazo" title="El cliente avisó de su transferencia: el plazo está parado hasta que Dynamo la valide o la rechace"><span className="badge badge-orange">{dynamo ? 'Transferencia avisada · validar' : 'Validando tu transferencia'}</span></div>
          : e.pago_limite && <div className="meta pago-plazo" title="Tiempo que queda para pagar; pasado el plazo, el envío se anula solo">Para pagar: <CuentaAtras hasta={e.pago_limite} corto vencidoTxt="plazo vencido" /></div>)}
        {dynamo && e.estado_cambio_cliente === 'pendiente' && <div className="meta" style={{ color: '#b45309', fontWeight: 800 }}>Cambio pedido por el cliente</div>}
        {dynamo && e.requiere_revision_precio && <div className="meta" style={{ color: '#b42318', fontWeight: 800 }}>Revisar precio (ruta cambiada)</div>}
        <strong>#{e.referencia_gx}</strong>
        {e.referencia_cliente && <> <span className="ref-cli-inline">({e.referencia_cliente})</span></>}
        {/* Contador de 30 s para anular el último cambio (usuario, 2026-11-20). */}
        {e.pendiente && <div className="cc-en-fila"><ContadorCambio envio={e.id} referencia={e.referencia_gx} pendiente={e.pendiente} /></div>}
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
        {recogidas.map((p, i) => <Parada key={i} p={p} fechaTxt={fc} tipo="orig" n={i + 1} />)}
      </div></div></td>
      <td className="route-full route-ent"><div className="rf-stops"><div className="rf-col">
        {/* Nº de PARADA del recorrido, continuo (usuario, 2026-11-11: «parada 1 y parada 2»):
            las entregas siguen la cuenta de las recogidas, como en la ruta de Nuevo envío. */}
        {entregas.map((p, i) => <Parada key={i} p={p} fechaTxt={fe} tipo="dest" n={recogidas.length + i + 1} />)}
      </div></div></td>
      <td className="mercancia">
        {e.paletizado === false ? 'No paletizado' : 'Paletizado'}
        {medidas(e) && <div className="meta meta-medidas">{medidas(e)}</div>}
        {e.tipo_carga && (
          <div className="meta"><span className={`carga-tag ${completo ? 'carga-completo' : 'carga-grupaje'}`}>{tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora) || 'Grupaje'}</span></div>
        )}
      </td>
      <td className="vehiculo">
        {/* Dynamo ve QUÉ empresa lleva el envío (usuario, 2026-11-09); el cliente, no:
            para él solo matrículas y estado de asignación. */}
        {dynamo && e.transportista && <div style={{ fontWeight: 800, color: 'var(--navy)', lineHeight: 1.3 }}>{e.transportista}</div>}
        {/* Las dos matrículas seguidas, separadas por «/» (usuario, 2026-11-17). Sin ellas, una
            ETIQUETA igual en todas las pestañas y para todos (usuario, 2026-11-19): «Camión
            reservado» (verde), «Asignando transportista» (naranja), «Se asigna al pagar»… */}
        {e.matricula_camion
          ? <span className="meta-matricula">{e.matricula_camion}{e.matricula_remolque ? ` / ${e.matricula_remolque}` : ''}</span>
          : vehiculo
            ? <span className={`badge ${vehiculo.cls}`} style={{ whiteSpace: 'nowrap' }}>{vehiculo.txt}</span>
            : <span className="meta meta-pend">—</span>}
        {dynamo && e.conductor_nombre && <div className="meta">{e.conductor_nombre}</div>}
        {dynamo && e.conductor_telefono && <div className="meta">{e.conductor_telefono}</div>}
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
    </Fila>
  );
}

// Dynamo abre la ficha al pulsar la fila; los demás (etapas B y C) aún no tienen ficha.
function Fila({ href, className, children }: { href?: string; className?: string; children: React.ReactNode }) {
  return href ? <FilaEnlace href={href} className={className}>{children}</FilaEnlace> : <tr className={className}>{children}</tr>;
}
