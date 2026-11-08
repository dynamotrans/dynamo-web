'use client';

// El bloque de precio del tarifador de Nuevo envío, CALCADO del mockup (public/dashboard.html):
//   1. «Fecha entrega estimada» en verde (y el aviso de registro a posteriori si la fecha es pasada).
//   2. Caja blanca con el desglose SIEMPRE visible: importe de envío + suplementos →
//      Base imponible (grande, morado, con efecto contador) → IVA → Total.
//   3. Alternativas más baratas: cabecera contextual («Has seleccionado FECHA FIJA URGENTE…
//      ¿No te corre prisa?») y tarjetas con icono, precio grande, «Elegir ›» y «Ahorras X €»;
//      la recomendada con borde verde y pill RECOMENDADA.
// Y, solo para Dynamo, la tabla «Precios internos»: Tarifador hoy · Último (mismo) ·
// Último (todos) · Aplicado (media auto) + Margen peor/mejor caso.
// Números del tarifador en BORRADOR (MOCK) hasta la tarifa real.
import { useEffect, useRef, useState } from 'react';
import { euros, fecha as fmtFecha } from '@/lib/formato';
import { diasDesde, type Tarifa, type TablaInterna, type UltimoRuta } from '@/lib/tarifador';

// Contador animado del mockup: rueda del valor anterior al nuevo en ~480 ms (easeOutCubic,
// saltos de 10). Con `prefers-reduced-motion`, salta directo.
function usePrecioAnimado(v: number | null): number | null {
  const [mostrado, setMostrado] = useState(v);
  const prev = useRef(v);
  useEffect(() => {
    const desde = prev.current; prev.current = v;
    if (v == null || desde == null || desde === v
        || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      setMostrado(v); return;
    }
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / 480);
      const e = 1 - Math.pow(1 - p, 3);
      setMostrado(p < 1 ? Math.round((desde + (v - desde) * e) / 10) * 10 : v);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return mostrado;
}

const IcoFijaCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
const IcoVentCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M7 15h10" />
  </svg>
);

export function BloquePrecio({ tarifa, km, kmEstimado, cargando, paraCliente, ivaPct, pasada, fechaFija, corta = false, onElegir }: {
  tarifa: Tarifa | null;
  km: number | null; kmEstimado: boolean;
  cargando: boolean;
  paraCliente: boolean;                 // true: lo ve el cliente (precio orientativo)
  ivaPct: number;
  pasada: boolean;                      // fecha ya pasada (registro a posteriori del Admin Master)
  fechaFija: string | null;             // la fecha elegida cuando es fecha fija (para la cabecera)
  corta?: boolean;                      // la ventana corta de grupaje (1 a 2 días) está elegida
  onElegir: (urgencia: 'dia' | 'estandar' | 'corta', fecha: string) => void;
}) {
  const neto = usePrecioAnimado(tarifa?.neto ?? null);
  if (cargando) {
    return (
      <div className="ptar-field ptar-field-full ptar-sug-card">
        <div className="ptar-sug-head">Precio {paraCliente ? 'orientativo' : 'sugerido'} <span>· borrador del tarifador</span></div>
        <div className="ptar-sug-skel" aria-hidden="true" />
      </div>
    );
  }
  if (!tarifa || neto == null) return null;
  const urgente = tarifa.alternativas.length === 2;   // fija el primer día disponible
  return (
    <div className="ptar-field ptar-field-full ptar-sug-card">
      <div className="ptar-sug-head">Precio {paraCliente ? 'orientativo' : 'sugerido'} <span>· borrador del tarifador</span></div>

      <dl className="ptar-eta-data">
        <dt>Fecha entrega estimada</dt>
        {tarifa.etaDesde
          ? <dd className="ptar-eta-range">{tarifa.etaHasta && tarifa.etaHasta !== tarifa.etaDesde
              ? <>del {fmtFecha(tarifa.etaDesde)} al {fmtFecha(tarifa.etaHasta)}</> : fmtFecha(tarifa.etaDesde)}</dd>
          : <dd className="ptar-eta-warn">Asigna la fecha de recogida para ver la entrega estimada.</dd>}
      </dl>
      <div className="ptar-sug-sub">{tarifa.grupaje ? 'Grupaje' : 'Camión completo'}{km != null && <> · {km} km{kmEstimado ? ' (estimados)' : ''}</>}</div>

      {pasada && (
        <div className="eta-pasada"><strong>Registro a posteriori</strong>: estás dando de alta un envío con <strong>fecha ya pasada</strong>{fechaFija ? <> ({fmtFecha(fechaFija)})</> : null}. Se registra tal cual, sin suplementos de fecha fija ni avisos de plazo.</div>
      )}

      <div className="alm-price ptar-eta-pricebox">
        {tarifa.lineas.map((l, i) => (
          <div key={i} className="alm-price-row"><span className="k">{l.k}</span><span className="v" style={l.v < 0 ? { color: 'var(--green-dark, #157a3f)' } : undefined}>{euros(l.v)}</span></div>
        ))}
        <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{euros(neto)}</span></div>
        <div className="alm-price-row alm-price-sub"><span className="k">IVA ({String(ivaPct).replace('.', ',')}%)</span><span className="v">{euros(neto * ivaPct / 100)}</span></div>
        <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros(neto * (1 + ivaPct / 100))}</span></div>
      </div>

      {tarifa.alternativas.length > 0 && (
        <div className="ptar-eta-fija">
          <div className="eta-fija-head">
            {corta
              ? <>Has seleccionado la <strong>ventana corta de 1 a 2 días</strong>, con su suplemento.<br /><strong>¿No te corre prisa?</strong> Puedes cambiar a:</>
              : <>Has seleccionado <strong>FECHA FIJA{urgente ? ' URGENTE' : ''}{fechaFija ? ` (${fmtFecha(fechaFija)})` : ''}</strong>, si ese día no hay vehículo, habría que reprogramar a otra fecha.<br /><strong>¿No te corre prisa?</strong> Puedes cambiar a:</>}
          </div>
          <div className="eta-opts">
            {tarifa.alternativas.map((a, i) => (
              <button key={i} type="button" className={`eta-opt${a.recomendada ? ' eta-opt-rec' : ''}`} onClick={() => onElegir(a.urgencia, a.fecha)}>
                <span className="eta-opt-ico">{a.urgencia === 'dia' ? <IcoFijaCal /> : <IcoVentCal />}</span>
                <span className="eta-opt-body">
                  <span className="eta-opt-tit">
                    {a.urgencia === 'dia' ? <>Fecha fija · día siguiente disponible · {fmtFecha(a.fecha)}</> : a.titulo}
                    {a.recomendada && <span className="eta-badge">Recomendada</span>}
                  </span>
                  <span className="eta-opt-sub">{a.urgencia === 'dia' ? 'Un día concreto, algo más económico que el primero disponible.' : `Lo más barato y seguro: ${a.detalle.charAt(0).toLowerCase()}${a.detalle.slice(1)}.`}</span>
                  <span className="eta-opt-ahorro">Ahorras {euros(a.ahorro)}</span>
                </span>
                <span className="eta-opt-price"><span className="eta-opt-eur">{euros(tarifa.neto - a.ahorro)}</span><span className="eta-opt-go">Elegir ›</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="ptar-admin-precio-note" style={{ marginTop: '0.5rem' }}>
        {paraCliente
          ? <>Precio <strong>orientativo</strong> con la información de la ruta y la mercancía: el precio en firme te lo confirma Dynamo con tu tarifa.</>
          : <>Sugerido con el tarifador en <strong>borrador</strong> (números provisionales): revisa la tabla de precios internos y ajusta abajo si hace falta.</>}
      </p>
    </div>
  );
}

// ---- Tabla «Precios internos» (solo Dynamo): tarifador hoy · últimos de la ruta · aplicado ----
const eur0 = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;
function haceTxt(f: string | null, hoy: string): string {
  const n = diasDesde(f, hoy);
  if (n == null || n < 0) return '';
  return ` (${n === 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`})`;
}

function Celda({ imp, f, refx, hoy }: { imp: number | null; f: string | null; refx: string | null; hoy: string }) {
  if (!imp) return <td className="pint-td"><span className="pint-vacia">—</span></td>;
  const viejo = (diasDesde(f, hoy) ?? 0) > 15;
  return (
    <td className="pint-td">
      <strong>{eur0(imp)}</strong>
      {f && <div className="pint-fecha">{fmtFecha(f)}{haceTxt(f, hoy)}{refx ? ` · #${refx}` : ''}</div>}
      {viejo && <div className="pint-viejo">no entra en la media (+15 días)</div>}
    </td>
  );
}

export function PreciosInternosTabla({ tarVenta, tarCompra, mismo, todos, interna, hoy }: {
  tarVenta: number; tarCompra: number; mismo: UltimoRuta; todos: UltimoRuta; interna: TablaInterna; hoy: string;
}) {
  const margen = (m: number) => <strong style={{ color: m > 0 ? '#0f6b3a' : m < 0 ? '#b42318' : 'var(--gray-500)' }}>{eur0(m)}</strong>;
  return (
    <div className="pint">
      <table className="pint-tabla">
        <thead><tr>
          <td />
          <td className="pint-cab" style={{ color: 'var(--purple)' }}>Venta<br />(cliente)</td>
          <td className="pint-cab" style={{ color: 'var(--navy)' }}>Compra<br />(transportista)</td>
        </tr></thead>
        <tbody>
          <tr><td className="pint-lbl">Tarifador hoy</td><Celda imp={tarVenta} f={null} refx={null} hoy={hoy} /><Celda imp={tarCompra} f={null} refx={null} hoy={hoy} /></tr>
          <tr><td className="pint-lbl">Último (mismo)</td><Celda imp={mismo.venta} f={mismo.fecha} refx={mismo.ref} hoy={hoy} /><Celda imp={mismo.compra} f={mismo.fecha} refx={mismo.ref} hoy={hoy} /></tr>
          <tr><td className="pint-lbl">Último (todos)</td><Celda imp={todos.venta} f={todos.fecha} refx={todos.ref} hoy={hoy} /><Celda imp={todos.compra} f={todos.fecha} refx={todos.ref} hoy={hoy} /></tr>
          <tr>
            <td className="pint-apl pint-apl-lbl">Aplicado<div>media auto</div></td>
            <td className="pint-apl">{interna.vApl ? <strong style={{ color: 'var(--purple)' }}>{eur0(interna.vApl)}</strong> : <span className="pint-vacia">—</span>}</td>
            <td className="pint-apl">{interna.cApl ? <strong style={{ color: 'var(--navy)' }}>{eur0(interna.cApl)}</strong> : <span className="pint-vacia">—</span>}</td>
          </tr>
        </tbody>
      </table>
      <div className="pint-nota">La media solo usa los «Último» con <strong>≤ 15 días</strong>; los más antiguos no cuentan (el tarifador de hoy siempre cuenta).</div>
      {interna.margenMin != null && interna.margenMax != null && (
        <div className="pint-margen">
          Margen: {interna.margenMin === interna.margenMax ? margen(interna.margenMin) : <>de {margen(interna.margenMin)} a {margen(interna.margenMax)}</>}
          <div className="pint-nota">Peor y mejor caso combinando las ventas y compras de la tabla.</div>
        </div>
      )}
    </div>
  );
}
