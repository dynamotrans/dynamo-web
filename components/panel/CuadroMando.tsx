'use client';

// CUADRO DE MANDO (usuario, 2026-11-06): lo que llevaba en su hoja —facturación, margen,
// viajes, % cerrados, km y €/km, por cliente y por mes— calculado de
// los envíos reales (cuadro_mando() en la base de datos). Primera versión, para ir ajustando.
// Gráficos en SVG propio (sin librerías), barras finas, tooltip al pasar o al pulsar, tabla
// debajo para quien prefiera los números. La evolución (usuario, 2026-11-06) lleva las tres
// series a la vez: barras de facturación y línea de margen en euros (eje izquierdo) y línea de
// envíos en unidades (eje derecho), con leyenda y los tres valores del mes al pulsar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { euros, importe } from '@/lib/formato';

export type Totales = { realizados: number; solicitados: number; cancelados: number; facturacion: number; margen: number; coste: number;
  km: number; fact_con_km: number; coste_con_km: number; sin_km: number; clientes: number; transportistas: number };
export type Cuadro = {
  desde: string; hasta: string; granularidad: 'dia' | 'mes';
  totales: Totales; comparacion: Totales | null;
  serie: { k: string; realizados: number; solicitados: number; facturacion: number; margen: number }[];
  meses: { k: string; realizados: number; solicitados: number; facturacion: number; margen: number; km: number; realizados_ant: number; facturacion_ant: number; margen_ant: number }[];
  semana: { dow: number; realizados: number; facturacion: number; margen: number; km: number; fact_con_km: number; coste_con_km: number }[];
  clientes: { id: string; nombre: string | null; cif: string; realizados: number; solicitados: number; facturacion: number; margen: number; riesgo: number | null; disponible: number | null; plazo_pago_dias: number | null }[];
  transportistas: { id: string; nombre: string | null; cif: string; realizados: number; coste: number; margen: number; km: number }[];
};
export type Sector = { sector: string; clientes: number; realizados: number; facturacion: number; margen: number };
export type Periodo = '5a' | '12m' | 'mes' | 'mes-ant' | 'anio' | 'anio-ant' | 'todo' | 'otro';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const n = (x: unknown) => Number(x ?? 0);
const pct = (a: number, b: number) => (b ? `${(a / b * 100).toFixed(1).replace('.', ',')} %` : '—');
const porKm = (eur: number, km: number) => (km > 0 ? `${(eur / km).toFixed(2).replace('.', ',')} €` : '—');
const etiquetaMes = (iso: string) => { const [a, m] = iso.split('-'); return `${MESES[Number(m) - 1]} ${a.slice(2)}`; };
const etiquetaDia = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
const fechaCorta = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };

// Variación de un dato respecto al periodo de comparación: «+12,3 %» en verde, «−4 %» en rojo.
function Var({ a, b, invertir }: { a: number; b: number | undefined; invertir?: boolean }) {
  if (b == null) return null;
  if (!b) return <span className="cm-var" style={{ color: 'var(--gray-500)' }}>{a ? 'nuevo' : '—'}</span>;
  const v = (a - b) / Math.abs(b) * 100;
  const bien = invertir ? v <= 0 : v >= 0;
  return <span className="cm-var" style={{ color: Math.abs(v) < 0.05 ? 'var(--gray-500)' : bien ? '#0f6b3a' : '#b42318' }}>
    {v > 0 ? '+' : ''}{v.toFixed(1).replace('.', ',')} %</span>;
}

function Kpi({ label, valor, sub, a, b, invertir }: { label: string; valor: string; sub?: string; a?: number; b?: number; invertir?: boolean }) {
  return (
    <div className="stat-card" style={{ cursor: 'default' }}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value" style={{ fontSize: '1.35rem' }}>{valor}</span>
      <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {a != null && <Var a={a} b={b} invertir={invertir} />}{sub}
      </span>
    </div>
  );
}

// ---- Gráfico de barras (una serie) con tooltip, en SVG ------------------------------------
function Barras({ datos, color, formato, titulo, alto = 180 }: { datos: { k: string; v: number; extra?: string }[]; color: string; formato: (v: number) => string; titulo: string; alto?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.v));
  const ancho = 720, izq = 8, abajo = 22, arriba = 8;
  const w = (ancho - izq * 2) / Math.max(datos.length, 1);
  const barra = Math.max(2, Math.min(w - 2, 40));
  const y = (v: number) => arriba + (alto - arriba - abajo) * (1 - v / max);
  const cada = Math.ceil(datos.length / 12);
  // Etiquetas recortadas al hueco de su barra (usuario, 2026-11-09: los nombres de sector
  // enteros se montaban unos sobre otros). El nombre completo vive en el tooltip y en la tabla.
  const maxChars = Math.max(4, Math.floor(w / 6.5));
  const etiqueta = (t: string) => t.length > maxChars ? t.slice(0, maxChars - 1).trimEnd() + '…' : t;
  return (
    <div className="cm-chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setSel(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={izq} x2={ancho - izq} y1={y(max * f)} y2={y(max * f)} stroke="var(--gray-200)" strokeWidth="1" />)}
        {datos.map((d, i) => {
          const x = izq + i * w + (w - barra) / 2;
          const h = Math.max(0, y(0) - y(d.v));
          return (
            <g key={d.k} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} tabIndex={-1}>
              <rect x={izq + i * w} y={arriba} width={w} height={alto - arriba - abajo} fill="transparent" />
              <rect x={x} y={y(d.v)} width={barra} height={h} rx={Math.min(4, barra / 2)} fill={color} opacity={sel == null || sel === i ? 1 : 0.45} />
              {d.v > 0 && h < 4 && <rect x={x} y={y(0) - 2} width={barra} height={2} fill={color} />}
              {i % cada === 0 && <text x={izq + i * w + w / 2} y={alto - 6} textAnchor="middle" fontSize="11" fill="var(--gray-500)">{etiqueta(d.k)}</text>}
            </g>
          );
        })}
        <line x1={izq} x2={ancho - izq} y1={y(0)} y2={y(0)} stroke="var(--gray-300)" strokeWidth="1" />
      </svg>
      {sel != null && datos[sel] && (
        <div className="cm-tip" style={{ left: `${Math.min(88, Math.max(12, (izq + sel * w + w / 2) / ancho * 100))}%` }}>
          <strong>{datos[sel].k}</strong> · {formato(datos[sel].v)}{datos[sel].extra ? ` · ${datos[sel].extra}` : ''}
        </div>
      )}
    </div>
  );
}

// Redondea un máximo al siguiente múltiplo de `paso` por encima (340.000 con paso 100.000 →
// 400.000; 11.422 con paso 5.000 → 15.000). Mínimo un `paso`, para que sin datos el eje no
// salga en 0.
function techo(v: number, paso: number): number {
  return Math.max(paso, Math.ceil(v / paso) * paso);
}
const eurosCortos = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} M€` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',')} k€` : `${Math.round(v)} €`);
const COLOR_FACT = '#3300cc', COLOR_MARGEN = '#22a55a', COLOR_ENVIOS = '#ff7a00';

// Evolución: barras de facturación (eje izquierdo, €) + línea de margen (eje derecho, €, con su
// propia escala para que no se aplaste contra la facturación) + línea de envíos realizados sin
// eje (se escala sola a su máximo). Al pasar el ratón o pulsar un mes, etiqueta flotante con los
// tres valores (al pulsar se queda unos segundos, para el móvil).
function Evolucion({ datos, titulo }: { datos: { k: string; facturacion: number; margen: number; realizados: number; solicitados: number }[]; titulo: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const [fijo, setFijo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  const pulsar = (i: number) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setSel(i); setFijo(true);
    temporizador.current = setTimeout(() => { setFijo(false); setSel(null); }, 4500);
  };
  // El gráfico se dibuja a tamaño real (píxeles del contenedor), no escalado: así los textos
  // de los ejes miden lo mismo que el resto de la pantalla, sea ancha o estrecha.
  const lienzo = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(720);
  useLayoutEffect(() => {
    const el = lienzo.current; if (!el) return;
    const medir = () => setAncho(Math.max(320, Math.floor(el.clientWidth)));
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const alto = 240, izq = 64, der = 58, arriba = 12, abajo = 26;
  const H = alto - arriba - abajo;
  // Eje izquierdo = facturación, tope al cien mil por encima del máximo (340.000 → 400.000).
  // Eje derecho = margen, tope al cinco mil por encima (11.422 → 15.000); si algún mes el
  // margen es negativo, el suelo baja al cinco mil por debajo. Los envíos no tienen eje: la
  // línea se escala a 1,5 × su máximo (eje invisible), para verse la forma sin pegarse arriba.
  const maxFact = techo(Math.max(0, ...datos.map((d) => d.facturacion)), 100000);
  const margAlto = techo(Math.max(0, ...datos.map((d) => d.margen)), 5000);
  const margMin = Math.min(0, ...datos.map((d) => d.margen));
  const margBajo = margMin < 0 ? -techo(-margMin, 5000) : 0;
  const maxEnv = Math.max(1, ...datos.map((d) => d.realizados)) * 1.5;
  const w = (ancho - izq - der) / Math.max(datos.length, 1);
  const barra = Math.max(2, Math.min(w - 4, 36));
  const yF = (v: number) => arriba + H * (1 - v / maxFact);
  const yM = (v: number) => arriba + H * (1 - (v - margBajo) / (margAlto - margBajo));
  const yN = (v: number) => arriba + H * (1 - v / maxEnv);
  const xc = (i: number) => izq + i * w + w / 2;
  const cada = Math.max(1, Math.ceil(datos.length / Math.max(4, Math.floor((ancho - izq - der) / 64))));
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const linea = (f: (d: typeof datos[number]) => number, y: (v: number) => number) => datos.map((d, i) => `${i ? 'L' : 'M'}${xc(i).toFixed(1)},${y(f(d)).toFixed(1)}`).join(' ');
  const d = sel != null ? datos[sel] : null;
  const muchos = datos.length > 40;   // con muchos puntos, las líneas van sin los circulitos
  const derecha = sel != null && xc(sel) > ancho / 2;   // la etiqueta se pone al otro lado del mes marcado
  return (
    <div className="cm-chart" style={{ position: 'relative' }}>
      <div className="cm-leyenda" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: 'var(--fs-s)', color: 'var(--gray-700)', margin: '0 0 0.4rem' }}>
        <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: COLOR_FACT, verticalAlign: '-1px', marginRight: 5 }} />Facturación (€, eje izquierdo)</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 3, borderRadius: 2, background: COLOR_MARGEN, verticalAlign: '3px', marginRight: 5 }} />Margen (€, eje derecho)</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 3, borderRadius: 2, background: COLOR_ENVIOS, verticalAlign: '3px', marginRight: 5 }} />Envíos realizados (línea)</span>
      </div>
      <div className="cm-chart-scroll"><div className="cm-chart-lienzo" ref={lienzo}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo} style={{ display: 'block' }} onMouseLeave={() => { if (!fijo) setSel(null); }}>
        {ticks.map((f) => {
          const y = arriba + H * (1 - f);
          return (
            <g key={f}>
              <line x1={izq} x2={ancho - der} y1={y} y2={y} stroke="var(--gray-200)" strokeWidth="1" />
              <text x={izq - 8} y={y + 4} textAnchor="end" fontSize="13" fill={COLOR_FACT}>{eurosCortos(maxFact * f)}</text>
              <text x={ancho - der + 8} y={y + 4} textAnchor="start" fontSize="13" fill={COLOR_MARGEN}>{eurosCortos(margBajo + (margAlto - margBajo) * f)}</text>
            </g>
          );
        })}
        {datos.map((p, i) => {
          const x = izq + i * w + (w - barra) / 2;
          const h = Math.max(0, yF(0) - yF(p.facturacion));
          return (
            <g key={p.k}>
              <rect x={x} y={yF(p.facturacion)} width={barra} height={h} rx={Math.min(4, barra / 2)} fill={COLOR_FACT} opacity={sel == null || sel === i ? 0.9 : 0.4} />
              {p.facturacion > 0 && h < 3 && <rect x={x} y={yF(0) - 2} width={barra} height={2} fill={COLOR_FACT} />}
              {i % cada === 0 && <text x={xc(i)} y={alto - 8} textAnchor="middle" fontSize="13" fill="var(--gray-500)">{p.k}</text>}
            </g>
          );
        })}
        <line x1={izq} x2={ancho - der} y1={yF(0)} y2={yF(0)} stroke="var(--gray-300)" strokeWidth="1" />
        <path d={linea((p) => p.margen, yM)} fill="none" stroke={COLOR_MARGEN} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={linea((p) => p.realizados, yN)} fill="none" stroke={COLOR_ENVIOS} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={datos.length > 40 ? undefined : '0'} />
        {datos.map((p, i) => (muchos && sel !== i ? null : (
          <g key={p.k}>
            <circle cx={xc(i)} cy={yM(p.margen)} r={sel === i ? 4.5 : 3} fill="#fff" stroke={COLOR_MARGEN} strokeWidth="2" />
            <circle cx={xc(i)} cy={yN(p.realizados)} r={sel === i ? 4.5 : 3} fill="#fff" stroke={COLOR_ENVIOS} strokeWidth="2" />
          </g>
        )))}
        {sel != null && <line x1={xc(sel)} x2={xc(sel)} y1={arriba} y2={alto - abajo} stroke="var(--navy)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
        {/* Zonas de captura: una por mes, encima de todo (ratón y toque). */}
        {datos.map((p, i) => (
          <rect key={`z${p.k}`} x={izq + i * w} y={arriba} width={w} height={alto - arriba - abajo} fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => { if (!fijo) setSel(i); }} onClick={() => pulsar(i)} />
        ))}
      </svg>
      </div></div>
      {d && (
        <div className="cm-tip cm-tip-3" style={derecha ? { right: `${(100 - xc(sel!) / ancho * 100 + 1.5).toFixed(1)}%` } : { left: `${(xc(sel!) / ancho * 100 + 1.5).toFixed(1)}%` }}>
          <strong>{d.k}</strong>
          <span><i style={{ background: COLOR_FACT }} />Facturación {euros(d.facturacion)}</span>
          <span><i style={{ background: COLOR_MARGEN }} />Margen {euros(d.margen)}{d.facturacion ? ` (${pct(d.margen, d.facturacion)})` : ''}</span>
          <span><i style={{ background: COLOR_ENVIOS }} />Envíos {n(d.realizados)} realizados / {n(d.solicitados)} solicitados</span>
        </div>
      )}
    </div>
  );
}

function Tabla({ cab, filas, nota }: { cab: string[]; filas: (string | number | React.ReactNode)[][]; nota?: string }) {
  return (
    <div className="table-wrap" style={{ marginTop: '0.4rem' }}>
      <table className="data" style={{ minWidth: 0 }}>
        <thead><tr>{cab.map((c, i) => <th key={c} style={i ? { textAlign: 'right' } : undefined}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j} style={j ? { textAlign: 'right', whiteSpace: 'nowrap' } : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
      {nota && <div className="meta" style={{ marginTop: '0.3rem' }}>{nota}</div>}
    </div>
  );
}

export default function CuadroMando({ datos, periodo, error, sectores = [] }: { datos: Cuadro | null; periodo: Periodo; error: string | null; sectores?: Sector[] }) {
  const router = useRouter(); const ruta = usePathname();
  const [desde, setDesde] = useState(datos?.desde ?? ''); const [hasta, setHasta] = useState(datos?.hasta ?? '');
  const [todosClientes, setTodosClientes] = useState(false);
  const ir = (p: Periodo, d?: string, h?: string) => router.push(`${ruta}?cm=${p}${p === 'otro' && d && h ? `&desde=${d}&hasta=${h}` : ''}`, { scroll: false });
  const t = datos?.totales, c = datos?.comparacion ?? undefined;
  const serie = useMemo(() => (datos?.serie ?? []).map((s) => ({
    k: datos!.granularidad === 'dia' ? etiquetaDia(s.k) : etiquetaMes(s.k),
    facturacion: n(s.facturacion), margen: n(s.margen), realizados: n(s.realizados), solicitados: n(s.solicitados),
  })), [datos]);
  const totFact = n(t?.facturacion);
  // Por defecto, últimos 5 años (usuario, 2026-11-06).
  const PERIODOS: [Periodo, string][] = [['5a', 'Últimos 5 años'], ['12m', 'Últimos 12 meses'], ['mes', 'Este mes'], ['mes-ant', 'Mes pasado'], ['anio', 'Este año'], ['anio-ant', 'Año pasado'], ['todo', 'Todo'], ['otro', 'Otro periodo…']];

  return (
    <div className="cm">
      <div className="ptar-section-head" style={{ marginTop: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        Cuadro de mando
        {datos && <span className="meta" style={{ fontWeight: 500 }}>del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}{c ? ' · comparado con el periodo anterior' : ''}</span>}
      </div>
      <div className="prm-indice" style={{ marginBottom: '0.8rem' }} data-envivo-ignorar="">
        <nav className="prm-saltos" aria-label="Periodo">
          {PERIODOS.map(([p, l]) => <button key={p} type="button" className="prm-salto" aria-pressed={periodo === p} style={periodo === p ? { background: 'var(--purple)', color: '#fff', borderColor: 'var(--purple)' } : undefined} onClick={() => (p === 'otro' ? ir('otro', desde, hasta) : ir(p))}>{l}</button>)}
        </nav>
        {periodo === 'otro' && (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="param-input" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
            <span className="meta">hasta</span>
            <input type="date" className="param-input" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
            <button type="button" className="btn-secondary" onClick={() => ir('otro', desde, hasta)}>Ver</button>
          </div>
        )}
      </div>
      {error && <div className="pt-aviso error"><div>No se ha podido calcular el cuadro de mando: {error}</div></div>}
      {t && (
        <>
          {!n(t.solicitados) && <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div>Sin envíos en este periodo. Prueba otro periodo arriba.</div></div>}
          <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Kpi label="Facturación (sin IVA)" valor={euros(totFact)} a={totFact} b={c && n(c.facturacion)} sub={`${n(t.realizados)} envíos realizados`} />
            <Kpi label="Margen" valor={euros(n(t.margen))} a={n(t.margen)} b={c && n(c.margen)} sub={`${pct(n(t.margen), totFact)} sobre facturación`} />
            <Kpi label="Envíos realizados" valor={String(n(t.realizados))} a={n(t.realizados)} b={c && n(c.realizados)} sub={`de ${n(t.solicitados)} solicitados · ${pct(n(t.realizados), n(t.solicitados))} cerrados`} />
            <Kpi label="Cancelados" valor={String(n(t.cancelados))} a={n(t.cancelados)} b={c && n(c.cancelados)} invertir sub={pct(n(t.cancelados), n(t.solicitados)) + ' de los solicitados'} />
            <Kpi label="Margen medio por envío" valor={n(t.realizados) ? euros(n(t.margen) / n(t.realizados)) : '—'} sub={`${n(t.clientes)} clientes · ${n(t.transportistas)} transportistas`} />
          </div>

          <div className="mini-list-card" style={{ marginTop: '1rem' }}>
            <div className="mini-list-head"><h4>Evolución {datos!.granularidad === 'dia' ? 'por día' : 'por mes'}</h4><span className="meta">pulsa un {datos!.granularidad === 'dia' ? 'día' : 'mes'} para ver sus cifras</span></div>
            <Evolucion datos={serie} titulo="Evolución de facturación, margen y envíos" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', alignItems: 'start', marginTop: '1rem' }}>
            <div className="mini-list-card">
              <div className="mini-list-head"><h4>Clientes del periodo</h4><Link href="/panel/clientes">Ver todos →</Link></div>
              <Tabla cab={['Cliente', 'Envíos', '% cerr.', 'Facturación', 'Margen', '% marg.', 'Riesgo disp.', 'Plazo']}
                filas={datos!.clientes.slice(0, todosClientes ? 25 : 10).map((k) => [<Link key={k.id} href={`/panel/clientes?ver=${k.id}`}>{k.nombre ?? k.cif}</Link>, `${n(k.realizados)} / ${n(k.solicitados)}`, pct(n(k.realizados), n(k.solicitados)),
                  euros(n(k.facturacion)), euros(n(k.margen)), pct(n(k.margen), n(k.facturacion)),
                  k.disponible == null ? '—' : <span key="d" style={{ color: n(k.disponible) <= 0 ? '#b42318' : undefined }}>{euros(n(k.disponible))}</span>, k.plazo_pago_dias != null ? `${k.plazo_pago_dias} d` : '—'])}
                nota={datos!.clientes.length > 10 ? `Los ${todosClientes ? datos!.clientes.length : 10} clientes que más facturan en el periodo.` : undefined} />
              {datos!.clientes.length > 10 && <button type="button" className="btn-ghost" style={{ marginTop: '0.3rem' }} onClick={() => setTodosClientes((v) => !v)}>{todosClientes ? 'Ver solo 10' : `Ver los ${datos!.clientes.length}`}</button>}
            </div>
            <div className="mini-list-card">
              <div className="mini-list-head"><h4>Transportistas del periodo</h4><Link href="/panel/transportistas">Ver todos →</Link></div>
              <Tabla cab={['Transportista', 'Envíos', 'Compra', 'Margen que deja', 'Km', '€/km compra']}
                filas={datos!.transportistas.map((x) => [<Link key={x.id} href={`/panel/transportistas?ver=${x.id}`}>{x.nombre ?? x.cif}</Link>, n(x.realizados), euros(n(x.coste)), euros(n(x.margen)), importe(n(x.km)), porKm(n(x.coste), n(x.km))])}
                nota="Los 10 a los que más se compra en el periodo." />
            </div>
          </div>
          {sectores.length > 0 && (
            <div className="mini-list-card" style={{ marginTop: '1rem' }}>
              <div className="mini-list-head"><h4>Por sector del cliente</h4><span className="meta">el sector se pone en la ficha de cada cliente</span></div>
              <Barras datos={sectores.map((s) => ({ k: s.sector, v: n(s.facturacion), extra: `${n(s.clientes)} clientes · ${n(s.realizados)} envíos` }))} color="#3300cc" formato={euros} titulo="Facturación por sector" alto={150} />
              <Tabla cab={['Sector', 'Clientes', 'Envíos', 'Facturación', '% total', 'Margen', '% marg.']}
                filas={sectores.map((s) => [s.sector, n(s.clientes), n(s.realizados), euros(n(s.facturacion)), pct(n(s.facturacion), totFact), euros(n(s.margen)), pct(n(s.margen), n(s.facturacion))])} />
            </div>
          )}
          <p className="meta" style={{ marginTop: '0.8rem' }}>
            Cuenta los envíos de Dynamo (no los manuales de otros operadores) por su día de carga (real, previsto o primer día de la ventana). Realizados = en marcha o entregados; solicitados = todos los pedidos, también sin aceptar o cancelados. Facturación y compra en base sin IVA; sin precio de transportista, el margen cuenta 0. €/km solo con los envíos que tienen km.
          </p>
        </>
      )}
    </div>
  );
}
