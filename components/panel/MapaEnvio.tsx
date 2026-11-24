'use client';

// MAPA DEL ENVÍO (usuario, 2026-11-22): ventana con la ruta (paradas numeradas, en línea recta
// hasta tener las rutas de Google Maps), el camión en su POSICIÓN ESTIMADA (plan del
// seguimiento + tacógrafo + firmas del CMR, ver lib/mapaEnvio.ts), su estado y la leyenda.
// Se abre con el botón «Mapa» de la ficha del envío y de cada fila de la lista. Se actualiza
// sola cada minuto mientras está abierta. El mapa es el de Google (o el de reserva sin su
// clave): lo pone ./mapa/motor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { mapaDelEnvio, trazadosDeEnvios } from '@/app/panel/(app)/envios/acciones-mapa';
import { repartirTrazados, type PuntoLinea } from '@/lib/lineaRuta';
import { estadoMapa, horaParada, posicionCamion, type MapaEnvio } from '@/lib/mapaEnvio';
import { dibujarRuta, resaltador, ESTILO_MAPA, marcadorCamion, svgCamion, type Ruta } from './mapaRuta';
import { crearMotor, type Grupo, type LL, type Motor } from './mapa/motor';

export const COLOR = { carga: '#e07b00', descarga: '#3300cc', hecho: '#16a34a', ruta: '#3300cc', pendiente: '#9ca3af' };
export const TONO: Record<string, string> = { gris: '#6b7280', azul: '#2563eb', ambar: '#d97706', verde: '#16a34a', rojo: '#dc2626' };

// El mapa en su propia capa (isolation): los paneles del mapa llevan z-index altos y, sin
// esto, quedaban POR ENCIMA del menú desplegable de la cabecera (usuario, 2026-11-22).
export const CAJA_MAPA: React.CSSProperties = { position: 'relative', isolation: 'isolate', zIndex: 0 };

/** «Encuadrar»: vuelve a enseñar todo lo pintado, justo (sin que falte ni sobre). */
export function BotonEncuadrar({ onClick, que, arriba }: { onClick: () => void; que: string; arriba?: boolean }) {
  // En el mapa de Google va ARRIBA: abajo a la izquierda está su logotipo, que no se tapa.
  return (
    <button type="button" onClick={onClick} aria-label={`Encuadrar ${que}`} title={`Encuadrar ${que}`} data-encuadrar=""
      style={{ position: 'absolute', ...(arriba ? { top: 10 } : { bottom: 12 }), left: 10, zIndex: 1000, display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#fff', border: '2px solid rgba(0,0,0,.2)', borderRadius: 8, padding: '5px 10px', font: '700 13px system-ui',
        color: 'var(--navy)', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      Encuadrar
    </button>
  );
}

export const IcoMapa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" />
  </svg>
);

/** Botón «Mapa» que abre la ventana. `compacto`: solo el icono (filas de la lista). */
export function BotonMapa({ envioId, referencia, compacto, className }: { envioId: string; referencia?: string | null; compacto?: boolean; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={className ?? (compacto ? 'btn-icono' : 'btn-secondary')} data-boton-mapa=""
        aria-label={`Ver en el mapa${referencia ? ` el envío #${referencia}` : ''}`} title="Ver en el mapa"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAbierto(true); }}
        style={compacto ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--purple)', cursor: 'pointer' } : undefined}>
        <IcoMapa />{!compacto && <span style={{ marginLeft: 6 }}>Mapa</span>}
      </button>
      {/* A la ventana se la saca al final de la página y no deja pasar los clics ni las teclas:
          dentro de una fila de la lista abrirían la ficha, y Escape cerraría también la ficha
          que haya debajo. Escape cierra SOLO el mapa (por eso se le da el foco al abrirse). */}
      {abierto && createPortal(
        <div ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }} tabIndex={-1} style={{ outline: 'none' }}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setAbierto(false); }}>
          <VentanaMapa envioId={envioId} referencia={referencia} onCerrar={() => setAbierto(false)} />
        </div>, document.body)}
    </>
  );
}

export function VentanaMapa({ envioId, referencia, onCerrar }: { envioId: string; referencia?: string | null; onCerrar: () => void }) {
  const [datos, setDatos] = useState<MapaEnvio | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La ruta POR LA CARRETERA llega aparte, después de pintar (no hace esperar al mapa): hasta
  // entonces los tramos van en línea recta. Se vuelve a pedir mientras falte alguno.
  const [trazados, setTrazados] = useState<Record<string, PuntoLinea[]> | null>(null);
  const pedirRuta = useRef(true);
  const cargar = useCallback(async () => {
    const r = await mapaDelEnvio(envioId).catch(() => ({ ok: false as const, error: 'No se ha podido cargar el mapa.' }));
    if (!r.ok) { setError(r.error); return; }
    setDatos(r.mapa); setError(null);
    if (!pedirRuta.current) return;
    pedirRuta.current = false;
    const t = await trazadosDeEnvios([envioId]).catch(() => ({ ok: false as const }));
    if (!t.ok) return;
    pedirRuta.current = t.faltan > 0;
    const mios = repartirTrazados(t)[envioId];
    if (mios) setTrazados(mios);
  }, [envioId]);
  useEffect(() => { void cargar(); const t = setInterval(() => void cargar(), 60_000); return () => clearInterval(t); }, [cargar]);
  const mapa = useMemo(() => (datos && trazados ? { ...datos, trazados } : datos), [datos, trazados]);
  const porCarretera = !!trazados;
  const ref = mapa?.referencia ?? referencia;
  const pc = mapa ? posicionCamion(mapa) : null;
  return (
    <Modal abierto envivo plano ancho={920} onCerrar={onCerrar} icono={<IcoMapa />}
      titulo={`Mapa del envío${ref ? ` #${ref}` : ''}`}
      sub={mapa ? <span data-mapa-estado="" style={{ color: pc ? TONO[pc.tono] : undefined, fontWeight: 700 }}>{estadoMapa(mapa)}</span> : error ?? 'Cargando el mapa…'}>
      {mapa && <>
        <Lienzo mapa={mapa} />
        <Leyenda />
        <ol className="mapa-paradas" style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
          {mapa.paradas.map((p) => {
            // La hora real (firma del CMR, marcada en el seguimiento) o la prevista.
            const h = horaParada(mapa, p);
            return (
              <li key={p.orden} style={{ marginBottom: '0.2rem' }}>
                <strong>{p.tipo === 'carga' ? 'Recogida' : 'Entrega'}</strong> · {[p.empresa, p.poblacion].filter(Boolean).join(' · ')}
                {h && <span style={{ color: h.real ? COLOR.hecho : 'var(--gray-500)', fontWeight: h.real ? 700 : 400 }}> · {h.texto}</span>}
                {p.coord === 'codigo_postal' && <span style={{ color: 'var(--gray-500)' }}> · (situada por su código postal)</span>}
                {p.coord === 'sin' && <span style={{ color: '#b45309' }}> · (sin coordenadas: no sale en el mapa)</span>}
              </li>
            );
          })}
        </ol>
        <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>
          Posición <strong>estimada</strong>, no GPS: sale del horario previsto de cada parada, la velocidad media y las pausas obligatorias del
          conductor, corregida con las firmas del CMR (hora exacta y, si se dio permiso, su ubicación). {porCarretera
            ? 'La ruta sigue la carretera (ruta de un turismo: un camión puede tener que desviarse).'
            : 'La ruta se dibuja en línea recta entre paradas.'} Se actualiza sola cada minuto.
        </p>
      </>}
    </Modal>
  );
}

function Leyenda() {
  const punto = (c: string, t: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14 }}><span style={{ width: 12, height: 12, borderRadius: 6, background: c, display: 'inline-block' }} />{t}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--gray-700)', marginTop: '0.5rem' }} aria-label="Leyenda del mapa">
      {punto(COLOR.carga, 'Recogida')}{punto(COLOR.descarga, 'Entrega')}
      <span style={{ marginRight: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}><span dangerouslySetInnerHTML={{ __html: svgCamion(34) }} style={{ display: 'inline-flex' }} />Camión (posición estimada)</span>
      <span style={{ marginRight: 14 }}><span style={{ borderTop: `3px solid ${COLOR.ruta}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Hecho</span>
      <span style={{ marginRight: 14 }}><span style={{ borderTop: `3px dashed ${COLOR.pendiente}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Por hacer</span>
      <span>Pulsa una parada o la ruta para ver sus etiquetas (si no caben todas, toca una parada o acerca el mapa).</span>
    </div>
  );
}

function Lienzo({ mapa }: { mapa: MapaEnvio }) {
  const div = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const capa = useRef<Grupo | null>(null);
  const ruta = useRef<Ruta | null>(null);
  const encuadrado = useRef(false);
  const puntos = useRef<LL[]>([]);
  const encuadrar = useCallback(() => {
    const m = motor.current, t = puntos.current;
    if (!m || !t.length) return;
    if (t.length === 1) m.centrar(t[0], 10); else m.encuadrar(t, 12);
  }, []);
  const [listo, setListo] = useState<'google' | 'libre' | null>(null);
  const res = useRef(resaltador());

  useEffect(() => {
    let vivo = true;
    const r = res.current;
    if (!div.current) return;
    void crearMotor(div.current, [40.2, -3.7], 5).then((m) => {
      if (!vivo) { m.destruir(); return; }
      m.alPulsarFondo(() => r.apagar());   // pulsar fuera: se apaga al momento
      motor.current = m; capa.current = m.grupo();
      setListo(m.nombre);
      // La ventana se abre con animación: recalcula el tamaño cuando ya está en su sitio.
      setTimeout(() => m.recalcular(), 350);
    });
    return () => { vivo = false; r.apagar(); ruta.current = null; motor.current?.destruir(); motor.current = null; };
  }, []);

  useEffect(() => {
    const m = motor.current, g = capa.current;
    if (!listo || !m || !g) return;
    res.current.apagar();
    ruta.current?.quitar();
    g.vaciar();
    const pc = posicionCamion(mapa);
    // La ruta (tramos y paradas) como en todos los mapas: al pulsar una parada o la línea
    // salen las etiquetas de todas las paradas con su hora, 4 segundos o hasta pulsar fuera.
    const r = dibujarRuta(m, mapa, { grande: true, alPulsar: () => res.current.resaltar(r) });
    ruta.current = r;
    res.current.poner([r]);
    if (pc) {
      const mc = marcadorCamion(TONO[pc.tono], true);
      g.marca([pc.lat, pc.lon], { clase: 'camion-mapa', ancho: mc.ancho, alto: mc.alto, html: mc.html, titulo: pc.titulo, encima: true,
        ventana: `<strong>${pc.titulo}</strong><br>${pc.detalle}<br><em>Posición estimada</em>` });
    }
    // Encuadre: la primera vez, todas las paradas y el camión; después se respeta lo que
    // haya movido quien mira.
    const todos: LL[] = [...r.puntos];
    if (pc) todos.push([pc.lat, pc.lon]);
    puntos.current = todos;
    if (!encuadrado.current) { encuadrar(); encuadrado.current = todos.length > 0; }
  }, [listo, mapa, encuadrar]);

  return (
    <div style={CAJA_MAPA}>
      <style>{ESTILO_MAPA}</style>
      <div ref={div} data-mapa-envio="" data-motor={listo ?? undefined} role="region" aria-label="Mapa de la ruta del envío"
        style={{ width: '100%', height: 'min(60vh, 460px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#eef2f7' }} />
      <BotonEncuadrar onClick={encuadrar} que="la ruta" arriba={listo === 'google'} />
    </div>
  );
}
