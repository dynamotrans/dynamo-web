'use client';

// Vista CALENDARIO de Envíos (calcada del mockup): un mes completo con los envíos como
// fichitas «origen→destino» coloreadas por estado, 3 por día y «+N más» para desplegar
// el resto, el día de hoy resaltado, navegación ‹ › limitada a ±3 meses y leyenda debajo.
// Cada envío se coloca en su fecha de carga efectiva (real → primer día pedido); pulsar
// una fichita abre primero un mini resumen (recogidas, entregas, mercancía, fecha o ventana)
// con «Abrir detalle del envío» y «Cerrar» (usuario, 2026-11-21). El buscador y los filtros de arriba también filtran aquí.
import { avisarNavegandoA } from './CargandoNavegacion';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EnvioFila } from '@/lib/envios';
import { paradasDe, estadoVisual, fechaCarga, medidas, dirParada } from '@/lib/envios';
import { tipoCargaTxt } from '@/lib/formato';
import Modal from './Modal';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LEYENDA: [string, string][] = [
  ['#3300cc', 'Programado'], ['#1a73e8', 'En ruta'], ['#22a55a', 'Entregado'],
  ['#d93025', 'Pendiente de pago'], ['#8b5e34', 'Otro operador'], ['#9aa0a6', 'Cancelado'],
];

// El color de la fichita, por estado (gana la primera regla, como el mockup).
function colorDe(e: EnvioFila): string {
  if (e.es_manual) return '#8b5e34';
  if (e.estado === 'cancelado') return '#9aa0a6';
  if (e.estado === 'entregado') return '#22a55a';
  if (e.estado_pago_previo === 'pendiente') return '#d93025';
  if (e.estado === 'hacia_la_carga' || e.estado === 'cargando' || e.estado === 'en_ruta') return '#1a73e8';
  return '#3300cc';
}

export default function CalendarioEnvios({ filas, mes, hoy, q, op, por, puedeCrear = false }: {
  filas: EnvioFila[]; mes: string;   // YYYY-MM del mes pintado
  hoy: string;                       // YYYY-MM-DD (Madrid)
  q: string; op: string; por: string;   // los filtros vivos, para conservarlos al navegar
  puedeCrear?: boolean;              // pulsar un día (hoy o futuro) ofrece crear un envío con esa fecha
}) {
  const url = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    const v: Record<string, string> = { vista: 'calendario', mes, q, op, por, ...extra };
    Object.entries(v).forEach(([k, x]) => { if (x) u.set(k, x); });
    return `/panel/envios?${u}`;
  };
  const urlMes = (x: string) => url({ mes: x });
  const urlVer = (id: string) => url({ ver: id });
  const router = useRouter();
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});
  // Pulsar un día (hoy o futuro) abre la ventanita «¿Crear un envío para el…?» (usuario,
  // 2026-11-11). Guarda la fecha YYYY-MM-DD; las fichitas y el «+N más» no la disparan.
  const [diaNuevo, setDiaNuevo] = useState<string | null>(null);
  // Primer clic en una fichita: su mini resumen; desde ahí, «Abrir detalle del envío».
  const [resumen, setResumen] = useState<EnvioFila | null>(null);
  const [a, m] = mes.split('-').map(Number);
  const [ha, hm] = hoy.split('-').map(Number);
  const offset = (a - ha) * 12 + (m - hm);          // meses de distancia a hoy (límite ±3)
  const otroMes = (d: number) => { const x = new Date(a, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

  // Envíos por día del mes (fecha de carga efectiva: real → primer día pedido).
  const porDia: Record<number, EnvioFila[]> = {};
  for (const e of filas) {
    const fch = e.fecha_carga_real || e.fecha_carga_prevista || e.fecha_carga_desde;
    if (!fch) continue;
    const [fa, fm, fd] = fch.split('-').map(Number);
    if (fa !== a || fm !== m) continue;
    (porDia[fd] = porDia[fd] ?? []).push(e);
  }
  const dias = new Date(a, m, 0).getDate();
  const huecos = (new Date(a, m - 1, 1).getDay() + 6) % 7;   // la semana empieza en lunes
  const hoyDia = offset === 0 ? Number(hoy.split('-')[2]) : 0;

  const ficha = (e: EnvioFila) => {
    const { recogidas, entregas } = paradasDe(e);
    const o = recogidas[0]?.poblacion ?? '¿?', d = entregas[entregas.length - 1]?.poblacion ?? '¿?';
    const col = colorDe(e);
    return (
      <button key={e.id} type="button" className="cal-envio" style={{ borderLeftColor: col, background: `${col}14` }}
        title={`#${e.referencia_gx} · ${o} → ${d}`} onClick={() => setResumen(e)}>
        {o}→{d}
      </button>
    );
  };
  // La leyenda de colores sale ARRIBA (debajo del buscador) y también abajo (usuario,
  // 2026-11-11): así se entiende el color de las fichitas sin bajar hasta el final.
  const leyenda = (
    <div className="cal-leyenda">
      {LEYENDA.map(([c, t]) => <span key={t}><i style={{ background: c }} /> {t}</span>)}
    </div>
  );
  return (
    <div className="cal">
      {leyenda}
      <div className="cal-head">
        <button type="button" className="cal-nav" disabled={offset <= -3} aria-label="Mes anterior"
          onClick={() => { avisarNavegandoA(urlMes(otroMes(-1))); router.replace(urlMes(otroMes(-1)), { scroll: false }); }}>‹</button>
        <div className={`cal-title${offset === 0 ? ' cal-title-hoy' : ''}`}>{MESES[m - 1]} {a}</div>
        <button type="button" className="cal-nav" disabled={offset >= 3} aria-label="Mes siguiente"
          onClick={() => { avisarNavegandoA(urlMes(otroMes(1))); router.replace(urlMes(otroMes(1)), { scroll: false }); }}>›</button>
      </div>
      <div className="cal-grid cal-dow"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div>
      <div className="cal-grid">
        {Array.from({ length: huecos }, (_, i) => <div key={`o${i}`} className="cal-cell cal-off" />)}
        {Array.from({ length: dias }, (_, i) => {
          const dia = i + 1;
          const finde = (huecos + i) % 7 >= 5;
          const evs = porDia[dia] ?? [];
          const abierto = !!abiertos[dia];
          const fIso = `${mes}-${String(dia).padStart(2, '0')}`;
          const pulsable = puedeCrear && fIso >= hoy;
          return (
            <div key={dia} className={`cal-cell${finde ? ' cal-finde' : ''}${abierto ? ' cal-open' : ''}${pulsable ? ' cal-pulsable' : ''}`}
              onClick={pulsable ? (ev) => { if (!(ev.target as HTMLElement).closest('button')) setDiaNuevo(fIso); } : undefined}>
              <div className={`cal-day${dia === hoyDia ? ' cal-day-hoy' : ''}`}>{dia}</div>
              {evs.slice(0, 3).map(ficha)}
              {evs.length > 3 && !abierto && (
                <button type="button" className="cal-more" onClick={() => setAbiertos((x) => ({ ...x, [dia]: true }))}>+{evs.length - 3} más</button>
              )}
              {abierto && evs.slice(3).map(ficha)}
            </div>
          );
        })}
      </div>
      {leyenda}
      {resumen && <ResumenEnvio e={resumen} onCerrar={() => setResumen(null)}
        onAbrir={() => { const u = urlVer(resumen.id); setResumen(null); avisarNavegandoA(u); router.push(u, { scroll: false }); }} />}
      <Modal abierto={!!diaNuevo} onCerrar={() => setDiaNuevo(null)} titulo="Crear un envío"
        pie={
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => setDiaNuevo(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => { avisarNavegandoA(`/panel/nuevo-envio?fecha=${diaNuevo}`); router.push(`/panel/nuevo-envio?fecha=${diaNuevo}`); }}>+ Crear envío</button>
          </div>
        }>
        {diaNuevo && (() => {
          const [fa, fm, fd] = diaNuevo.split('-').map(Number);
          const larga = new Date(fa, fm - 1, fd, 12).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <>
              <p style={{ margin: 0 }}>¿Quieres crear un envío para el <strong>{larga}</strong>?</p>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                Se abre el formulario de Nuevo envío con esa fecha de recogida ya puesta; allí puedes cambiarla.
              </p>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

// Mini resumen del envío pulsado en el calendario: lo justo para reconocerlo sin abrir la ficha.
function ResumenEnvio({ e, onCerrar, onAbrir }: { e: EnvioFila; onCerrar: () => void; onAbrir: () => void }) {
  const { recogidas, entregas } = paradasDe(e);
  const est = estadoVisual(e);
  const fija = !!(e.fecha_carga_real || e.fecha_carga_prevista || (e.fecha_carga_desde && e.fecha_carga_desde === e.fecha_carga_hasta));
  const carga = [e.descripcion_mercancia, tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora), medidas(e)].filter(Boolean).join(' · ');
  const parada = (p: ReturnType<typeof paradasDe>['recogidas'][number], i: number, tipo: 'orig' | 'dest') => (
    <li key={`${tipo}${i}`} className="cal-res-parada">
      <span className={`ml-dot ${tipo}`} />
      <span>{p.nombre_empresa && <strong>{p.nombre_empresa}</strong>}{p.nombre_empresa && <br />}{dirParada(p) || '—'}</span>
    </li>
  );
  return (
    <Modal abierto onCerrar={onCerrar} ancho={420} titulo={`Envío #${e.referencia_gx}`}
      sub={e.referencia_cliente ? `Ref. cliente: ${e.referencia_cliente}` : undefined}
      pie={<div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" id="cal-res-cerrar" onClick={onCerrar}>Cerrar</button>
        <button type="button" className="btn-primary" id="cal-res-abrir" onClick={onAbrir}>Abrir detalle del envío</button>
      </div>}>
      <div id="cal-resumen" style={{ display: 'grid', gap: '0.7rem' }}>
        <div><span className={`badge badge-${est.color}`}>{est.label}</span></div>
        <div>
          <div className="cal-res-et">{recogidas.length > 1 ? 'Recogidas' : 'Recogida'}</div>
          <ul className="cal-res-lista">{recogidas.map((p, i) => parada(p, i, 'orig'))}</ul>
        </div>
        <div>
          <div className="cal-res-et">{entregas.length > 1 ? 'Entregas' : 'Entrega'}</div>
          <ul className="cal-res-lista">{entregas.map((p, i) => parada(p, i, 'dest'))}</ul>
        </div>
        {carga && <div><div className="cal-res-et">Mercancía</div><div>{carga}</div></div>}
        <div>
          <div className="cal-res-et">{fija ? 'Fecha de recogida' : 'Ventana de recogida'}</div>
          <div>{fechaCarga(e) || '—'}{!fija && <span className="meta" style={{ display: 'block' }}>Fecha aún sin confirmar</span>}</div>
        </div>
      </div>
    </Modal>
  );
}
