'use client';

// MAPA GENERAL (usuario, 2026-11-22): todos los envíos en programación o en marcha a la vez —
// Dynamo ve todos; el cliente, los suyos. Los entregados y los cancelados no salen. El encuadre
// se ajusta solo a lo que haya (y a lo que deje ver el filtro). En marcha: el camión en su
// posición ESTIMADA y la ruta; programados: un punto en
// su primera recogida. Pulsando un camión: su estado y botones para su mapa y su ficha.
// Se actualiza sola cada 2 minutos. Cuando un transportista comparta su GPS, su posición real
// sustituirá a la estimada (mapa_envio decide la posición; aquí solo se pinta).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { mapaEnviosEnCurso, situarParadasDelMapa, trazadosDeEnvios, type EnvioMapa } from '@/app/panel/(app)/envios/acciones-mapa';
import { repartirTrazados, type PuntoLinea } from '@/lib/lineaRuta';
import { claveParada, posicionCamion } from '@/lib/mapaEnvio';
import { fecha } from '@/lib/formato';
import { nombreEstado } from '@/lib/estados';
import { BotonEncuadrar, CAJA_MAPA, COLOR, TONO, VentanaMapa } from './MapaEnvio';
import { crearMotor, type Grupo, type LL, type Motor } from './mapa/motor';
import { dibujarRuta, resaltador, ESTILO_MAPA, marcadorCamion, svgCamion, type Ruta } from './mapaRuta';

type Filtro = 'todos' | 'marcha' | 'programados';
const enMarcha = (e: EnvioMapa) => e.estado !== 'programado';

// `incrustado`: el mismo mapa dentro del dashboard (usuario, 2026-11-26), en tarjeta, con el
// texto corto, enlace a la pantalla completa y el alto ajustado al hueco que queda en pantalla.
export default function MapaGeneral({ dynamo, incrustado = false }: { dynamo: boolean; incrustado?: boolean }) {
  const [envios, setEnvios] = useState<EnvioMapa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<{ id: string; ref: string } | null>(null);
  // Las coordenadas que faltan se buscan DESPUÉS de pintar (usuario, 2026-11-22: el mapa
  // tardaba 5 s esperándolas) y se añaden al llegar.
  const situando = useRef(false);
  // Las rutas POR LA CARRETERA también llegan después de pintar: primero las de los envíos en
  // marcha. Se vuelven a pedir cuando cambian los envíos y, mientras falte alguna por
  // calcular, CADA 20 SEGUNDOS con el mapa abierto (usuario, 2026-11-24; antes solo con el
  // refresco de 2 minutos): el gasto total es el mismo, solo llega antes. Si tres tandas
  // seguidas no avanzan (p. ej. Google ha llegado a su tope del día), se vuelve al paso de 2 minutos.
  const [trazados, setTrazados] = useState<Record<string, Record<string, PuntoLinea[]>>>({});
  const rutas = useRef({ clave: '', faltan: false, pidiendo: false, antes: -1, sinAvance: 0, huella: '', lista: [] as EnvioMapa[], reloj: null as ReturnType<typeof setTimeout> | null, vivo: true });
  const pedirRutas = useCallback(async (lista: EnvioMapa[]) => {
    const r = rutas.current;
    r.lista = lista;
    const ids = [...lista].sort((a, b) => Number(enMarcha(b)) - Number(enMarcha(a))).map((e) => e.id);
    const clave = ids.join(',');
    if (!ids.length || r.pidiendo || (clave === r.clave && !r.faltan)) return;
    r.pidiendo = true;
    try {
      const t = await trazadosDeEnvios(ids);
      if (t.ok) {
        r.sinAvance = clave === r.clave && t.faltan >= r.antes && r.antes >= 0 ? r.sinAvance + 1 : 0;
        r.clave = clave; r.faltan = t.faltan > 0; r.antes = t.faltan;
        // Solo se repinta si han llegado rutas nuevas: repintar apaga la ruta que el usuario
        // tenga resaltada, y una tanda de las de cada 20 s que no trae nada no debe hacerlo.
        const huella = `${clave}|${t.faltan}|${t.tramos.length}|${t.lineas.length}`;
        if (huella !== r.huella) { r.huella = huella; setTrazados(repartirTrazados(t)); }
      }
    } catch { /* se reintenta en la próxima actualización */ } finally { r.pidiendo = false; }
    if (r.reloj) { clearTimeout(r.reloj); r.reloj = null; }
    if (r.vivo && r.faltan && r.sinAvance < 3) r.reloj = setTimeout(() => { r.reloj = null; if (r.vivo) void pedirRutasRef.current(r.lista); }, 20_000);
  }, []);
  const pedirRutasRef = useRef(pedirRutas);
  useEffect(() => { pedirRutasRef.current = pedirRutas; }, [pedirRutas]);
  useEffect(() => { const r = rutas.current; r.vivo = true; return () => { r.vivo = false; if (r.reloj) clearTimeout(r.reloj); }; }, []);
  const cargar = useCallback(async () => {
    const r = await mapaEnviosEnCurso().catch(() => ({ ok: false as const, error: 'No se ha podido cargar el mapa.' }));
    if (!r.ok) { setError(r.error); return; }
    setEnvios(r.envios); setError(null);
    void pedirRutas(r.envios);
    if (situando.current || !r.envios.some((e) => e.paradas.some((p) => p.lat == null || p.lon == null))) return;
    situando.current = true;
    try {
      const x = await situarParadasDelMapa();
      if (x.ok && Object.keys(x.hallados).length) {
        setEnvios((l) => l && l.map((e) => ({ ...e, paradas: e.paradas.map((p) => {
          const c = p.lat == null || p.lon == null ? x.hallados[claveParada(p)] : undefined;
          return c ? { ...p, lat: c.lat, lon: c.lon, coord: 'codigo_postal' as const } : p;
        }) })));
      }
    } catch { /* se reintenta en la próxima actualización */ } finally { situando.current = false; }
  }, [pedirRutas]);
  useEffect(() => { void cargar(); const t = setInterval(() => void cargar(), 120_000); return () => clearInterval(t); }, [cargar]);

  const visibles = useMemo(() => (envios ?? []).filter((e) => filtro === 'todos' || (filtro === 'marcha' ? enMarcha(e) : !enMarcha(e)))
    .map((e) => (trazados[e.id] ? { ...e, trazados: trazados[e.id] } : e)), [envios, filtro, trazados]);
  const nMarcha = (envios ?? []).filter(enMarcha).length, nProg = (envios ?? []).length - nMarcha;
  const sinSituar = visibles.filter((e) => !e.paradas.some((p) => p.lat != null)).length;

  const pestanas = (
    <div role="tablist" aria-label="Qué envíos ver" style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
      {([['todos', `Todos (${(envios ?? []).length})`], ['marcha', `En marcha (${nMarcha})`], ['programados', `Programados (${nProg})`]] as [Filtro, string][]).map(([k, t]) => (
        <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
          style={{ borderRadius: 999, padding: '0.3rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${filtro === k ? 'var(--purple)' : 'var(--gray-300)'}`, background: filtro === k ? 'var(--purple)' : '#fff', color: filtro === k ? '#fff' : 'var(--navy)' }}>{t}</button>
      ))}
    </div>
  );
  const Caja = incrustado ? 'div' : 'section';
  return (
    <Caja className={incrustado ? 'dash-mapa' : 'section active'} id={incrustado ? 'dash-mapa' : undefined} aria-labelledby={incrustado ? 'tituloMapaDash' : 'tituloMapa'}>
      {incrustado ? (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <h4 id="tituloMapaDash" style={{ margin: 0, fontSize: 'var(--fs-l)', color: 'var(--navy)' }}>Mapa de envíos</h4>
          <Link href="/panel/mapa" id="dash-mapa-completo" style={{ fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--purple)' }}>Pantalla completa →</Link>
          {pestanas}
        </div>
        <p className="meta" style={{ margin: '0.2rem 0 0.6rem' }}>
          {dynamo ? 'Todos los envíos' : 'Tus envíos'} programados y en marcha. La posición del camión es <strong>estimada</strong>; se actualiza sola cada 2 minutos.
        </p>
      </>) : (<>
      <div className="sec-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id="tituloMapa" style={{ margin: 0 }}>Mapa de envíos</h2>
        {pestanas}
      </div>
      <p className="meta" style={{ margin: '0.2rem 0 0.7rem' }}>
        {dynamo ? 'Todos los envíos' : 'Tus envíos'} en programación y en marcha (los entregados y los cancelados no salen). La posición del camión es
        {' '}<strong>estimada</strong> con el horario previsto, las pausas del conductor y las firmas del CMR. Se actualiza sola cada 2 minutos.
        {sinSituar > 0 && ` ${sinSituar} sin coordenadas todavía (se están buscando; salen en cuanto se encuentren).`}
      </p>
      </>)}
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.6rem' }}><div>{error}</div></div>}
      {envios && envios.length === 0 && <div className="pt-aviso ok" style={{ marginBottom: '0.6rem' }}><div>No hay envíos en programación ni en marcha ahora mismo.</div></div>}
      <Lienzo envios={visibles} dynamo={dynamo} hueco={incrustado} onAbrir={(id, ref) => setAbierto({ id, ref })} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', fontSize: '0.78rem', color: 'var(--gray-700)', marginTop: '0.5rem' }} aria-label="Leyenda del mapa general">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}><span dangerouslySetInnerHTML={{ __html: svgCamion(34) }} style={{ display: 'inline-flex' }} />En marcha (borde: <span style={{ color: TONO.azul }}>en ruta</span> · <span style={{ color: '#b45309' /* ámbar oscuro: el de TONO no llega al contraste AA en texto */ }}>cargando/descargando</span> · <span style={{ color: TONO.gris }}>parado</span> · <span style={{ color: TONO.rojo }}>con retraso</span>)</span>
        <span><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 6, background: '#9ca3af', verticalAlign: 'middle' }} /> Programado (junto a su 1.ª recogida)</span>
        <span><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 6, background: COLOR.carga, verticalAlign: 'middle' }} /> Recogida · <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 6, background: COLOR.descarga, verticalAlign: 'middle' }} /> Entrega</span>
        <span><span style={{ borderTop: `3px solid ${COLOR.ruta}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Hecho · <span style={{ borderTop: `3px dashed ${COLOR.pendiente}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Por hacer</span>
        {!incrustado && <span>Pulsa una parada o una ruta para ver todas sus paradas con su hora (si no caben todas, toca una parada o acerca el mapa).</span>}
      </div>
      {abierto && <VentanaMapa envioId={abierto.id} referencia={abierto.ref} onCerrar={() => setAbierto(null)} />}
    </Caja>
  );
}

function Lienzo({ envios, dynamo, hueco = false, onAbrir }: { envios: EnvioMapa[]; dynamo: boolean; hueco?: boolean; onAbrir: (id: string, ref: string) => void }) {
  const div = useRef<HTMLDivElement>(null);
  // En el dashboard (usuario, 2026-11-26), el mapa se ajusta a lo que se ve de pantalla: al
  // bajar hasta él, la tarjeta entera (título, mapa y leyenda) cabe bajo la barra de arriba.
  // Alargado: nunca más alto que el 62 % de su ancho; mínimo 340 px. En el móvil (≤760 px)
  // manda el CSS: cuadrado, como todos los mapas.
  useEffect(() => {
    if (!hueco) return;
    const el = div.current;
    if (!el) return;
    const ajustar = () => {
      if (window.innerWidth <= 760) { el.style.height = ''; return; }
      const barra = (document.querySelector('.topbar') as HTMLElement | null)?.offsetHeight ?? 64;
      const tarjeta = el.closest('.dash-mapa') as HTMLElement | null;
      // Lo que ocupa la tarjeta además del mapa (título, texto, leyenda y márgenes).
      const resto = tarjeta ? tarjeta.offsetHeight - el.offsetHeight : 130;
      const alto = Math.min(window.innerHeight - barra - resto - 24, el.offsetWidth * 0.62);
      el.style.height = `${Math.round(Math.max(340, alto))}px`;
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [hueco]);
  const motor = useRef<Motor | null>(null);
  const capa = useRef<Grupo | null>(null);
  const dibujadas = useRef<Ruta[]>([]);
  const encuadre = useRef('');
  const todos = useRef<LL[]>([]);
  // Todo lo que se ve (camiones, puntos y paradas), justo: ni falta ni sobra.
  const encuadrar = useCallback(() => {
    const m = motor.current, t = todos.current;
    if (!m || !t.length) return;
    if (t.length === 1) m.centrar(t[0], 9); else m.encuadrar(t, 10);
  }, []);
  const [listo, setListo] = useState<'google' | 'libre' | null>(null);
  const abrir = useRef(onAbrir); abrir.current = onAbrir;
  const res = useRef(resaltador());

  useEffect(() => {
    let vivo = true;
    const r = res.current;
    const caja = div.current;
    if (!caja) return;
    // Los botones de las ventanitas de los camiones abren el mapa del envío.
    const pulsado = (ev: MouseEvent) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-abrir-mapa]');
      if (b) abrir.current(b.dataset.abrirMapa!, b.dataset.ref ?? '');
    };
    caja.addEventListener('click', pulsado);
    void crearMotor(caja, [40.2, -3.7], 6).then((m) => {
      if (!vivo) { m.destruir(); return; }
      m.alPulsarFondo(() => r.apagar());   // pulsar fuera de un envío: se apaga al momento
      motor.current = m; capa.current = m.grupo();
      setListo(m.nombre);
      setTimeout(() => m.recalcular(), 300);
    });
    return () => { vivo = false; caja.removeEventListener('click', pulsado); r.apagar(); dibujadas.current = []; motor.current?.destruir(); motor.current = null; };
  }, []);

  useEffect(() => {
    const m = motor.current, g = capa.current;
    if (!listo || !m || !g) return;
    res.current.apagar();
    for (const r of dibujadas.current) r.quitar();
    g.vaciar();
    const puntos: LL[] = [];
    const rutas: Ruta[] = [];
    const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    for (const e of envios) {
      const pts = e.paradas.filter((p) => p.lat != null && p.lon != null);
      if (!pts.length) continue;
      const ruta = `${esc(pts[0].poblacion)} → ${esc(pts[pts.length - 1].poblacion)}`;
      const botones = `<div style="margin-top:6px;display:flex;gap:6px"><button type="button" data-abrir-mapa="${e.id}" data-ref="${esc(e.referencia)}" style="border:1px solid #3300cc;color:#3300cc;background:#fff;border-radius:7px;padding:3px 8px;font-weight:700;cursor:pointer">Mapa del envío</button><a href="/panel/envios?ver=${e.id}" style="border:1px solid #d1d5db;color:#1f2937;border-radius:7px;padding:3px 8px;font-weight:700;text-decoration:none">Ver ficha</a></div>`;
      const cabecera = `<strong>#${esc(e.referencia)}</strong>${dynamo && e.cliente ? ` · ${esc(e.cliente)}` : ''}<br>${ruta}`;
      // La ruta de cada envío, como en el mapa del envío: al pulsar una parada o la línea se
      // resalta (y se atenúan las demás) con las etiquetas de todas sus paradas, 4 segundos.
      // Ruta y paradas a la vista en todos (usuario, 2026-11-26) menos en los pendientes de
      // pago, que solo enseñan su punto hasta pulsarlo.
      const r = dibujarRuta(m, e, { oculta: !!e.pendiente_pago, alPulsar: () => res.current.resaltar(r) });
      rutas.push(r);
      if (!enMarcha(e)) {
        // Programado: un punto gris en su 1.ª recogida; al pulsarlo, su ficha breve y su ruta.
        const p = pts[0];
        // Con sus paradas a la vista, el punto va pegado arriba a la derecha de la parada 1 (como
        // una insignia) para no tapar su número; sin ellas (pendiente de pago), en su sitio.
        const bolita = 'width:16px;height:16px;border-radius:8px;background:#9ca3af;border:2px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.35)';
        r.sumar(g.marca([+p.lat!, +p.lon!], { clase: 'punto-programado', ancho: e.pendiente_pago ? 16 : 40, alto: e.pendiente_pago ? 16 : 40, titulo: `#${e.referencia}`,
          html: e.pendiente_pago ? `<div style="${bolita}"></div>`
            : `<div style="position:relative;width:40px;height:40px;pointer-events:none"><div style="position:absolute;left:23px;top:1px;pointer-events:auto;cursor:pointer;${bolita}"></div></div>`,
          ventana: `${cabecera}<br>Programado${e.fecha_carga ? ` · carga ${fecha(e.fecha_carga)}` : ''}${botones}`,
          alPulsar: () => res.current.resaltar(r, p.orden) }));
        puntos.push([+p.lat!, +p.lon!]);
        continue;
      }
      const pc = posicionCamion(e);
      const donde: LL = pc ? [pc.lat, pc.lon] : [+pts[0].lat!, +pts[0].lon!];
      const tono = pc ? TONO[pc.tono] : TONO.gris;
      const mc = marcadorCamion(tono);
      r.sumar(g.marca(donde, { clase: 'camion-mapa', ancho: mc.ancho, alto: mc.alto, html: mc.html, titulo: `#${e.referencia}`, encima: true,
        ventana: `${cabecera}<br><span style="color:${tono};font-weight:700">${esc(pc?.titulo ?? nombreEstado(e.estado))}</span>${pc ? `<br>${esc(pc.detalle)}` : ''}<br><em>Posición estimada</em>${botones}`,
        alPulsar: () => res.current.resaltar(r) }));
      puntos.push(donde);
      for (const p of pts) puntos.push([+p.lat!, +p.lon!]);
    }
    dibujadas.current = rutas;
    res.current.poner(rutas);
    // Encuadre automático a lo que haya (solo cuando cambia QUÉ se ve, no en cada
    // actualización: si el usuario ha movido el mapa, se respeta).
    const clave = envios.map((e) => e.id).sort().join(',');
    todos.current = puntos;
    if (clave !== encuadre.current && puntos.length) { encuadre.current = clave; encuadrar(); }
  }, [listo, envios, dynamo, encuadrar]);

  return (
    <div style={CAJA_MAPA}>
      <style>{ESTILO_MAPA}</style>
      <div ref={div} data-mapa-general="" data-motor={listo ?? undefined} role="region" aria-label="Mapa de los envíos en curso" className="mapa-lienzo mapa-general-lienzo"
        style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#eef2f7' }} />
      <BotonEncuadrar onClick={encuadrar} que="todos los envíos" arriba={listo === 'google'} />
    </div>
  );
}
