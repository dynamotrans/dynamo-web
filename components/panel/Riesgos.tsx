'use client';

// CESCE - Riesgos (solo Dynamo). Por cliente: crédito CESCE, manual de Dynamo, el que
// limita (el manual si está puesto, también a 0; si está vacío, CESCE), riesgo asumido (envíos de los
// últimos días sin cobrar, IVA incluido; lo pagado por adelantado no cuenta) y disponible.
// Por páginas desde la base de datos: buscador y filtro por la URL; los totales de arriba
// los calcula el servidor sobre todos los clientes.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { euros, fecha, haceTxt, numero } from '@/lib/formato';
import { actualizarDeuda } from '@/app/panel/(app)/riesgos/acciones';
import { guardarCreditoCliente } from '@/app/panel/(app)/clientes/acciones';
import Paginador from './Paginador';
import { BuscadorUrl } from './BuscadorUrl';
import Modal from './Modal';

export type RiesgoFila = {
  id: string; nombre: string; cif: string; cesce: number | null; plazo: number | null; manual: number | null;
  limite: number | null; manda: 'manual' | 'cesce' | 'ninguno'; envios: number; base: number; asumido: number;
  disponible: number | null; ultimo: string | null;
};
// Lo que debe un cliente según la facturación (facturas emitidas con algo pendiente de cobro).
export type DeudaCliente = { pendiente: number; vencido: number; facturas: number; vencePrimera: string | null };
export type EstadoDeuda = { conectado: boolean; ultimaOk: string | null; ultima: string | null; error: string | null; facturas: number; sinCif: number;
  pendiente: number; vencido: number; pendienteOtros: number; facturasOtros: number;
  // El crédito usado sale de la deuda real (lo que debe + envíos sin facturar), no de la estimación por días.
  creditoReal?: boolean;
  // La foto de pedidos de venta sin facturar que hay en la facturación (para cuadrarla con ella).
  pedidosEn?: string | null; pedidos?: number; pedidosImporte?: number; pedidosPlataforma?: number;
  // La comprobación: pedidos que la facturación da por pendientes y ya tienen factura (no se suman),
  // facturas enlazadas con su pedido y facturas recientes aún por enlazar.
  pedidosFacturados?: number; facturasEnlazadas?: number; facturasPorEnlazar?: number };
export type Totales = { limite: number; asumido: number; pasados: number };
export type ListaRiesgos = { q: string; filtro: string; pagina: number; porPagina: number; total: number };
const uso = (f: RiesgoFila) => (f.limite && f.limite > 0 ? f.asumido / f.limite : f.asumido > 0 ? Infinity : 0);
// «1.500,50» → 1500.5 · vacío → null · otra cosa → NaN
const importe = (s: string) => { const t = s.trim(); if (!t) return null; const v = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

// Ventana pequeña para cambiar SOLO el crédito de un cliente sin salir de esta pantalla
// (usuario, 2026-11-16). El nombre del cliente sigue llevando a su ficha completa.
function CreditoRapido({ fila, onCerrar }: { fila: RiesgoFila; onCerrar: () => void }) {
  const router = useRouter();
  const [cesce, setCesce] = useState(fila.cesce == null ? '' : String(fila.cesce).replace('.', ','));
  const [manual, setManual] = useState(fila.manual == null ? '' : String(fila.manual).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const c = importe(cesce), m = importe(manual);
  const valido = !Number.isNaN(c) && !Number.isNaN(m) && (c == null || c >= 0) && (m == null || m >= 0);
  const limite = !valido ? null : m != null ? m : c;
  async function guardar() {
    if (!valido) { setError('Hay un importe que no es un número válido.'); return; }
    setGuardando(true); setError(null);
    const r = await guardarCreditoCliente(fila.id, c, m);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onCerrar(); router.refresh();
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Crédito del cliente" sub={<><strong>{fila.nombre}</strong> · {fila.cif}</>} ancho={460}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando || !valido}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <div>
          <label htmlFor="rg-cesce">Importe crédito CESCE (€) · opcional</label>
          <input id="rg-cesce" type="text" inputMode="decimal" placeholder="Ej. 40000" value={cesce} onChange={(e) => setCesce(e.target.value)} autoFocus />
        </div>
        <div>
          <label htmlFor="rg-manual">Importe crédito Dynamo (€) · opcional</label>
          <input id="rg-manual" type="text" inputMode="decimal" placeholder="Vacío = manda CESCE" value={manual} onChange={(e) => setManual(e.target.value)} />
          <div className="meta" style={{ marginTop: '0.3rem' }}>Manda sobre CESCE. <strong>0</strong> = sin crédito. <strong>Vacío</strong> = manda CESCE.</div>
        </div>
      </div>
      <div style={{ marginTop: '0.9rem', background: 'var(--gray-100)', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: 'var(--fs-m)' }}>
        {!valido ? <span style={{ color: '#dc2626' }}>Revisa los importes.</span> : <>
          <div>Límite que quedará: <strong>{limite != null && limite > 0 ? euros(limite) : 'Sin crédito (previo pago)'}</strong>
            <span className="meta"> · {m != null ? 'manda el de Dynamo' : c != null ? 'manda CESCE' : 'sin clasificar'}</span></div>
          <div className="meta" style={{ marginTop: '0.2rem' }}>Asumido ahora: {euros(fila.asumido)}{limite != null && limite > 0 ? <> · disponible: <strong style={{ color: limite - fila.asumido < 0 ? '#dc2626' : undefined }}>{euros(limite - fila.asumido)}</strong></> : null}</div>
        </>}
      </div>
      <p className="meta" style={{ margin: '0.7rem 0 0' }}>Al guardar, sus envíos sin transportista se reajustan solos: los que quepan van a crédito y los que no, a pendiente de pago.</p>
      {error && <div className="pt-aviso error" style={{ marginTop: '0.7rem' }}><div>{error}</div></div>}
    </Modal>
  );
}

// LO QUE DEBEN, LEÍDO DE LA FACTURACIÓN (usuario, 2026-11-25). La cifra es la última foto
// guardada; aquí se dice de cuándo es y se vuelve a leer sola si tiene más de 10 minutos (o
// con el botón). Si la lectura falla, se avisa y sigue valiendo la foto anterior.
const FOTO_VALE_MS = 10 * 60_000;
function DeudaFacturacion({ e }: { e: EstadoDeuda }) {
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const hecho = useRef(false);
  async function leer() {
    setLeyendo(true); setFallo(null);
    try { const r = await actualizarDeuda(); if (!r.ok) setFallo(r.error); }
    catch { setFallo('No se ha podido leer la facturación. Prueba otra vez en un momento.'); }
    setLeyendo(false); router.refresh();
  }
  // Al entrar: si la foto es vieja (o no hay), se lee sola una vez. Con contactos aún sin
  // casar por CIF (primera lectura), se intenta también, mirando la hora del último intento.
  useEffect(() => {
    if (hecho.current || !e.conectado) return;
    const ultimo = e.ultima ? Date.parse(e.ultima) : 0;
    if (Date.now() - ultimo > (e.sinCif > 0 ? 90_000 : FOTO_VALE_MS)) { hecho.current = true; void leer(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.conectado, e.ultima, e.sinCif]);
  if (!e.conectado && !e.ultimaOk) return null;
  const error = fallo ?? e.error;
  return (
    <div className="table-wrap" id="deuda-facturacion" style={{ padding: '0.7rem 1rem', marginBottom: '0.9rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem 1.2rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span><span className="meta">Facturas pendientes de cobro: </span><strong id="deuda-total" style={{ color: 'var(--navy)' }}>{euros(e.pendiente)}</strong>
          <span className="meta"> en {numero(e.facturas, 0)} {e.facturas === 1 ? 'factura' : 'facturas'}</span></span>
        <span><span className="meta">De eso, vencido: </span><strong style={{ color: e.vencido > 0 ? '#dc2626' : 'var(--navy)' }}>{euros(e.vencido)}</strong></span>
        <span className="meta" id="deuda-cuando">{leyendo ? 'Leyendo de la facturación…' : e.ultimaOk ? `Leído ${haceTxt(e.ultimaOk)}` : 'Aún sin leer'}
          {e.conectado && !leyendo && <>{' · '}<button type="button" className="enlace-paso" id="deuda-actualizar" onClick={leer}>Actualizar</button></>}</span>
      </div>
      {e.facturasOtros > 0 && <div className="meta" id="deuda-otros" style={{ marginTop: '0.25rem' }}>
        Incluye {euros(e.pendienteOtros)} de {numero(e.facturasOtros, 0)} {e.facturasOtros === 1 ? 'factura' : 'facturas'} de contactos que no casan por CIF con ningún cliente de la plataforma
        {e.sinCif > 0 ? ` (${numero(e.sinCif, 0)} aún con el CIF por consultar: se completa solo en las próximas lecturas)` : ''}.
      </div>}
      {/* Pedidos de venta sin facturar (usuario, 2026-11-26): los viajes que en la facturación aún
          no tienen factura. Los que son también un envío de la plataforma no se suman dos veces. */}
      {e.pedidosEn && <div className="meta" id="deuda-pedidos" style={{ marginTop: '0.25rem' }}>
        Pedidos de venta sin facturar en la facturación: <strong style={{ color: 'var(--navy)' }}>{euros(e.pedidosImporte ?? 0)}</strong> en {numero(e.pedidos ?? 0, 0)} {e.pedidos === 1 ? 'pedido' : 'pedidos'}
        {(e.pedidosPlataforma ?? 0) > 0 ? ` (${numero(e.pedidosPlataforma ?? 0, 0)} ${e.pedidosPlataforma === 1 ? 'es' : 'son'} también un envío de la plataforma: ${e.pedidosPlataforma === 1 ? 'cuenta' : 'cuentan'} una sola vez)` : ''}
        {(e.pedidosFacturados ?? 0) > 0 ? ` · ${numero(e.pedidosFacturados ?? 0, 0)} ya ${e.pedidosFacturados === 1 ? 'tiene' : 'tienen'} factura: no se ${e.pedidosFacturados === 1 ? 'suma' : 'suman'}` : ''}
        {' · '}leído {haceTxt(e.pedidosEn)}. Cuentan como crédito usado de su cliente.
      </div>}
      {/* El enlace factura → pedido de venta (usuario, 2026-11-26: «ni puede faltar ni puede
          duplicar»): con él un viaje no se cuenta a la vez como pedido y como factura. */}
      {e.pedidosEn && ((e.facturasEnlazadas ?? 0) > 0 || (e.facturasPorEnlazar ?? 0) > 0) && <div className="meta" id="deuda-enlace" style={{ marginTop: '0.25rem' }}>
        Para no contar un viaje dos veces: <strong style={{ color: 'var(--navy)' }}>{numero(e.facturasEnlazadas ?? 0, 0)}</strong> {e.facturasEnlazadas === 1 ? 'factura enlazada' : 'facturas enlazadas'} con su pedido de venta
        {(e.facturasPorEnlazar ?? 0) > 0 ? ` · ${numero(e.facturasPorEnlazar ?? 0, 0)} de los últimos 4 meses por enlazar (se completa solo en las próximas lecturas)` : ' · todas las de los últimos 4 meses comprobadas'}.
      </div>}
      {error && <div className="pt-aviso error" id="deuda-error" role="alert" style={{ margin: '0.5rem 0 0' }}><div>
        <strong>La última lectura de la facturación ha fallado.</strong> {error} {e.ultimaOk ? 'Se sigue enseñando la última lectura buena.' : ''}
      </div></div>}
    </div>
  );
}

export default function Riesgos({ filas, dias, error, totales, lista, deuda = {}, estadoDeuda }: {
  filas: RiesgoFila[]; dias: number; error: string | null; totales: Totales; lista: ListaRiesgos;
  deuda?: Record<string, DeudaCliente>; estadoDeuda?: EstadoDeuda;
}) {
  const [edita, setEdita] = useState<RiesgoFila | null>(null);
  // La columna de lo que deben solo sale cuando hay de dónde leerlo (o ya hay una foto guardada).
  const conDeuda = !!estadoDeuda && (estadoDeuda.conectado || !!estadoDeuda.ultimaOk);
  const real = !!estadoDeuda?.creditoReal;
  const url = (p: number) => {
    const u = new URLSearchParams();
    if (lista.q) u.set('q', lista.q); if (lista.filtro) u.set('f', lista.filtro);
    if (p > 1) u.set('p', String(p)); if (lista.porPagina !== 50) u.set('n', String(lista.porPagina));
    const s = u.toString(); return `/panel/riesgos${s ? `?${s}` : ''}`;
  };

  return (
    <section className="section active" id="sec-riesgos">
      <div className="sec-header"><h2>CESCE - Riesgos ({numero(lista.total, 0)})</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Crédito de cada cliente frente a lo que tiene pendiente. <strong>Límite</strong>: el manual de Dynamo si está puesto (0 = sin crédito); si está vacío, el de CESCE.
        {' '}{real
          ? <><strong>Usado</strong>: lo que debe de verdad (sus facturas pendientes de cobro, menos abonos) más lo que aún no está facturado (sus envíos a crédito y sus pedidos de venta de la facturación; cada viaje, una sola vez), con IVA (lo pagado por adelantado no cuenta). <strong>Disponible</strong> = límite − usado.</>
          : <><strong>Asumido</strong>: envíos de los últimos {dias} días sin cobrar, con IVA (lo pagado por adelantado no cuenta). <strong>Disponible</strong> = límite − asumido.{conDeuda ? <> <strong>Pendiente de cobro</strong>: lo que debe de verdad según sus facturas (de momento, solo informativo).</> : null}</>} <strong>Pulsa una fila</strong> para cambiar su crédito aquí mismo; pulsa el <strong>nombre</strong> para abrir la ficha completa del cliente.
      </p>
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem', marginBottom: '0.9rem' }}>
        <div className="table-wrap" tabIndex={0} style={{ padding: '0.8rem 1rem' }}><div className="meta">Crédito concedido (límites)</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: 'var(--navy)' }}>{euros(totales.limite)}</div></div>
        <div className="table-wrap" tabIndex={0} style={{ padding: '0.8rem 1rem' }}><div className="meta" id="riesgo-usado-titulo">{real ? 'Crédito usado (deuda + sin facturar)' : `Riesgo asumido (${dias} días)`}</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: 'var(--navy)' }}>{euros(totales.asumido)}</div></div>
        <div className="table-wrap" tabIndex={0} style={{ padding: '0.8rem 1rem' }}><div className="meta">Clientes por encima de su límite</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: totales.pasados ? '#dc2626' : '#0f6b3a' }}>{totales.pasados}</div></div>
      </div>
      {estadoDeuda && <DeudaFacturacion e={estadoDeuda} />}
      <BuscadorUrl accion="/panel/riesgos" valor={lista.q} placeholder="Buscar cliente o CIF…" campos={<>
        <select name="f" defaultValue={lista.filtro} onChange={(ev) => ev.currentTarget.form?.requestSubmit()} aria-label="Filtrar">
          <option value="">Todos los clientes</option>
          <option value="riesgo">Con riesgo asumido</option>
          <option value="alto">80 % o más del límite usado</option>
          <option value="pasado">Por encima del límite</option>
          <option value="con">Con crédito</option>
          <option value="sin">Sin crédito</option>
        </select>
        {lista.porPagina !== 50 && <input type="hidden" name="n" value={lista.porPagina} />}
      </>} />
      {error && <div className="pt-aviso error">No se han podido cargar los riesgos: {error}</div>}
      <div className="table-wrap" tabIndex={0}>
        <table className="data">
          <thead><tr>
            <th>Cliente</th><th className="amount">CESCE</th><th className="amount">Manual (Álvaro)</th><th className="amount">Límite</th>
            <th className="amount">{real ? 'Envíos sin facturar' : `Envíos ${dias} d`}</th><th className="amount" id="th-usado">{real ? 'Usado (IVA incl.)' : 'Asumido (IVA incl.)'}</th>{conDeuda && <th className="amount" id="th-deuda">Pendiente de cobro</th>}<th className="amount">Disponible</th><th style={{ minWidth: 130 }}>Uso</th><th>Último envío</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={conDeuda ? 10 : 9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Sin clientes que coincidan</td></tr>
            ) : filas.map((x) => {
              const u = uso(x), pct = Number.isFinite(u) ? Math.round(u * 100) : null;
              const d = deuda[x.id];
              const color = !Number.isFinite(u) || u > 1 ? '#dc2626' : u >= 0.8 ? '#d97706' : '#16a34a';
              return (
                <tr key={x.id} onClick={() => setEdita(x)} style={{ cursor: 'pointer' }} title="Cambiar el crédito de este cliente">
                  <td><Link href={`/panel/clientes?ver=${x.id}`} onClick={(ev) => ev.stopPropagation()} title="Abrir la ficha completa del cliente" style={{ color: 'var(--navy)', fontWeight: 700 }}>{x.nombre}</Link><div className="meta">{x.cif}</div></td>
                  <td className="amount" style={x.manda === 'cesce' ? { fontWeight: 800 } : { color: 'var(--gray-500)' }}>{x.cesce != null ? euros(x.cesce) : '—'}{x.plazo ? <div className="meta">{x.plazo} días</div> : null}</td>
                  <td className="amount" style={x.manda === 'manual' ? { fontWeight: 800 } : { color: 'var(--gray-500)' }}>{x.manual != null ? euros(x.manual) : '—'}</td>
                  <td className="amount"><strong>{x.limite != null ? euros(x.limite) : 'Sin crédito'}</strong><div className="meta">{x.manda === 'manual' ? 'manda el manual' : x.manda === 'cesce' ? 'manda CESCE' : 'previo pago'}</div></td>
                  <td className="amount">{x.envios || '—'}</td>
                  <td className="amount" data-usado={x.id}>{x.asumido ? euros(x.asumido) : '—'}{x.asumido ? (real
                    // Con la deuda real: de qué sale lo usado (lo que debe + lo que aún no está facturado).
                    ? <div className="meta">{euros(Math.max(0, x.asumido - Math.max(0, d?.pendiente ?? 0)))} sin facturar{d && d.pendiente > 0 ? <> + {euros(d.pendiente)} que debe</> : null}</div>
                    : <div className="meta">{euros(x.base)} sin IVA</div>) : null}</td>
                  {conDeuda && <td className="amount" data-deuda={x.id}>{d ? <>
                    <strong>{euros(d.pendiente)}</strong>
                    <div className="meta">{d.facturas} {d.facturas === 1 ? 'factura' : 'facturas'}</div>
                    {d.vencido > 0 && <div className="meta" style={{ color: '#dc2626', fontWeight: 700 }}>vencido {euros(d.vencido)}</div>}
                  </> : '—'}</td>}
                  <td className="amount" style={{ fontWeight: 800, color: x.disponible != null && x.disponible < 0 ? '#dc2626' : 'var(--navy)' }}>{x.disponible != null ? euros(x.disponible) : '—'}</td>
                  <td>
                    {x.limite && x.limite > 0 ? <>
                      <div style={{ height: 7, borderRadius: 99, background: 'var(--gray-200)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, pct ?? 100)}%`, height: '100%', background: color }} /></div>
                      <div className="meta" style={{ color, fontWeight: 700 }}>{pct} % usado</div>
                    </> : x.asumido > 0 ? <span className="meta" style={{ color: '#dc2626', fontWeight: 700 }}>Riesgo sin crédito</span> : <span className="meta">—</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.ultimo ? fecha(x.ultimo) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginador total={lista.total} pagina={lista.pagina} porPagina={lista.porPagina} url={url} nombre="clientes" nombreUno="cliente" />
      {edita && <CreditoRapido key={edita.id} fila={edita} onCerrar={() => setEdita(null)} />}
    </section>
  );
}
