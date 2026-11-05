'use client';

// Dashboard del cliente, copiado de #sec-dashboard de dashboard.html: guía de primeros
// pasos (cuenta sin envíos), botones «Nuevo envío» y «Otras gestiones», «Mis envíos»,
// Recomiéndanos / Puntúanos en Google, muro de clientes, servicios y flota.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from './Modal';
import { fecha, ventana, pesoTn, medidasTxt } from '@/lib/formato';
import { FLOTA_HTML } from '@/lib/dashboardContenido';

// «Nuestros servicios» y «Nuestra flota» ocultos de momento (decisión del usuario,
// 2026-11-03). Para volver a enseñarlos basta con poner esto a true.
const MOSTRAR_SERVICIOS_Y_FLOTA = false;

export type MiniEnvio = {
  id: string; referencia_gx: string; referencia_cliente: string | null; estado: string;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null; origen: string; destino: string;
  metros_lineales: number | null; toneladas: number | null; mercancia: string | null; cliente: string | null;
};

const ESTADO: Record<string, [string, string]> = {
  programado: ['Programado', 'prog'], hacia_la_carga: ['Hacia la carga', 'hacia'], cargando: ['Cargando', 'cargando'], en_ruta: ['En ruta', 'enruta'],
};
const RECOMIENDA_MSG = 'Hola,\n\nos envío contacto de Dynamo Operador Logístico, S.L.. (pregunta por Álvaro Blanco)\n\nTrabajamos con ellos. Realizan grupajes y cargas completas por España y Europa.\n\nPodéis consultar online precio de envíos y generar nuevos envíos online directamente (https://dynamotrans.com).\n\nO si prefieres, también por estas vías te atienden:\n+34 955 225 945\ninfo@dynamotrans.com';
// Enlace DIRECTO de reseña de la ficha de Google (el que va en las órdenes de carga).
const GOOGLE_RESENA = 'https://g.page/r/Cdy34Hp-P-IEEBI/review';
const LOGOS: [string, string, string][] = [
  ['jardipond.webp', 'Jardí Pond', ''], ['ferticenter.webp', 'Ferticenter', ''], ['rosport.webp', 'Rosport', 'Servicios Integrales'], ['talsa.webp', 'TALSA', ''],
  ['aceitunascazorla.webp', 'Aceitunas Cazorla', ''], ['solbau.webp', 'SOLBAU', ''], ['poolback.webp', 'PoolBack', 'Logística del Envase'], ['pansur.webp', 'PANSUR', ''],
  ['sagredo.webp', 'Sagredo', 'Abonos y Semillas'], ['jysk.webp', 'JYSK', ''], ['alquibox.webp', 'AlquiBox', 'Andalucía'], ['ghi.webp', 'ghi', 'Smart Furnaces'],
  ['rivi.webp', 'RIVI', 'Technical Group'], ['almendrun.webp', 'Almendrun', ''], ['prodisa.webp', 'Prodisa', 'Comunicación'], ['grupopuma.webp', 'Grupo Puma', ''],
  ['aguacates.webp', 'Aguacates', 'Valle del Guadiana'], ['GRAMOFLOR.webp', 'Gramoflor', 'Ibérica'], ['TRANSMETALICAS.webp', 'Transmetálicas', ''], ['DIMASIBER.webp', 'Dimasiber', ''],
  ['COAVANTIA.webp', 'Coavantia', ''], ['TODOEMBALAJE.webp', 'Todoembalaje', '.com'], ['hidrodiseno.webp', 'Hydrodiseño', 'Global'], ['QUIMICAS%20ORO.webp', 'Químicas Oro', ''],
  ['JUMASA.webp', 'Jumasa', 'Parts'], ['BRELLO.webp', 'Brello', 'Plásticos'], ['PISCIMAR.webp', 'Piscimar', 'Pools'], ['BIGMAT.webp', 'BigMat', 'Logística'],
  ['STRUGAL.webp', 'Strugal', ''], ['COTAIN%20SA.webp', 'Cotain', ''], ['RIMOBEL.webp', 'Rimobel', ''], ['SKLUM.webp', 'SKLUM', ''],
];
const SERVICIOS = [
  { t: 'Grupajes', chip: 'Nacional 24 h', img: '/images/FOTO 1 - copia55420ac5170e2.jpeg', pos: '', d: 'Comparte espacio y optimiza costes. Envío directo sin transbordos ni manipulaciones, tal y como se carga, se entrega. Mercancía paletizada y cargas especiales. Recogidas desde mismo día. Entregas desde 24h.' },
  { t: 'Carga Completa', chip: 'Tráfico directo', img: '/images/HERO-DYNAMO.webp', pos: '34% center', d: 'El camión es tuyo. Sin transbordos: máxima seguridad, rapidez y entrega directa origen-destino.' },
  { t: 'Importación', chip: 'Toda Europa', img: '/images/AdobeStock_154376791.jpeg', pos: '', d: 'Hasta la puerta de tu empresa, desde cualquier punto de Europa, con plazos garantizados y máxima calidad.' },
  { t: 'Exportación', chip: 'Import & Export', img: '/images/AdobeStock_260603287.jpeg', pos: '', d: 'Portugal, Francia, Alemania, Italia, Países Bajos, Bélgica, Luxemburgo, Austria, Polonia y República Checa.' },
];
const n = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
const Svg = ({ size = 16, children }: { size?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

function Logo({ l }: { l: [string, string, string] }) {
  return (
    <div className="logo-pill"><div className="logo-box">
      <div className="logo-icon"><img loading="lazy" src={`/images/logos/${l[0]}`} alt={l[1]} /></div>
      <div><span className="logo-name">{l[1]}</span>{l[2] && <span className="logo-sub">{l[2]}</span>}</div>
    </div></div>
  );
}

export default function DashboardCliente({ envios, activos, dynamo, sinEnvios }: { envios: MiniEnvio[]; activos: number; dynamo: boolean; sinEnvios: boolean }) {
  const [menu, setMenu] = useState(false);
  const [ventanaAbierta, setVentana] = useState<null | 'recomendar' | 'google' | number>(null);
  const [texto, setTexto] = useState(RECOMIENDA_MSG);
  const [copiado, setCopiado] = useState(false);
  const dd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { if (dd.current && !dd.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [menu]);
  const filas = [0, 1, 2].map((r) => LOGOS.filter((_, i) => i % 3 === r));

  return (
    <section className="section active" id="sec-dashboard">
      {dynamo && (
        <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '0 0 0.9rem' }}>
          <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>VISTA DYNAMO</span>
          Así ve el panel un cliente. Aquí salen los envíos en curso de <strong>todos</strong> los clientes; cada cliente verá solo los suyos.
        </p>
      )}
      {sinEnvios && (
        <div style={{ background: '#fff', border: '1.5px solid rgba(51,0,204,0.25)', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 'var(--fs-d1)' }}>Bienvenido a tu portal Dynamo</div>
          <p style={{ margin: '0.25rem 0 0.7rem', fontSize: 'var(--fs-m)', color: 'var(--gray-600)' }}>Tres pasos y tienes tu primer transporte en marcha:</p>
          <div className="onb-steps">
            <Link className="onb-step" href="/panel/sitios"><span className="onb-num">1</span><span className="onb-txt"><strong>Crea tu primer sitio</strong><br />Tu agenda de recogidas y entregas: empresa, dirección, horario y teléfono. Lo eliges con un clic en cada envío.</span></Link>
            <Link className="onb-step" href="/panel/nuevo-envio"><span className="onb-num">2</span><span className="onb-txt"><strong>Calcula el precio y crea tu primer envío</strong><br />Origen, destino y fecha: precio al momento, sin llamadas ni esperas.</span></Link>
            <Link className="onb-step" href="/panel/operadores"><span className="onb-num">3</span><span className="onb-txt"><strong>Añade tus transportistas (opcional)</strong><br />Registra también los envíos que hagas con otros transportistas y tenlo todo unificado.</span></Link>
          </div>
        </div>
      )}

      <div className="dash-top-row dash-top-2">
        <div className="dash-left-col">
          <div className="dash-cta-stack">
            <Link className="dash-cta dash-cta-purple" href="/panel/nuevo-envio">
              <div className="dash-cta-icon"><Svg size={28}><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></Svg></div>
              <div className="dash-cta-text"><h4>Nuevo envío</h4><p>Solicita un transporte</p></div>
            </Link>
            <div className={`btn-dropdown dash-cta-dd${menu ? ' open' : ''}`} ref={dd}>
              <a className="dash-cta dash-cta-green" href="#" aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.preventDefault(); setMenu((v) => !v); }}>
                <div className="dash-cta-icon"><Svg size={28}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></Svg></div>
                <div className="dash-cta-text"><h4>Otras gestiones</h4><p>Reportar incidencia, crear sitio y más…</p></div>
                <span className="dash-cta-chev" aria-hidden="true"><svg className="btn-dropdown-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
              </a>
              <div className="btn-dropdown-menu" role="menu" hidden={!menu}>
                <Link role="menuitem" href="/panel/incidencias?abrir=1"><Svg><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg> Reportar incidencia</Link>
                <Link role="menuitem" href="/panel/sitios"><Svg><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg> Crear sitio</Link>
                {dynamo && <Link role="menuitem" href="/panel/almacenamientos?abrir=1"><Svg><path d="M3 21V9l9-5 9 5v12" /><path d="M3 21h18" /><rect x="8" y="13" width="8" height="8" /></Svg> Nuevo almacenamiento</Link>}
              </div>
            </div>
          </div>
        </div>
        <Link className="mini-list-card" href="/panel/envios" aria-label="Ver todos los envíos" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mini-list-head"><h4>{dynamo ? 'Envíos en curso' : 'Mis envíos'} ({activos})</h4><span className="mini-list-ver">Ver todos →</span></div>
          <ul className="mini-list">
            {envios.length === 0 ? <li style={{ color: 'var(--gray-500)' }}>No hay envíos en curso.</li> : envios.map((e) => {
              const est = ESTADO[e.estado] ?? ESTADO.programado;
              return (
                <li key={e.id}>
                  <div className="mini-list-left">
                    <span className="mini-list-date">{e.fecha_carga_hasta && e.fecha_carga_hasta !== e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : fecha(e.fecha_carga_desde)} <span className="ml-ref">#{e.referencia_gx}</span>{dynamo && e.cliente ? ` · ${e.cliente}` : ''}</span>
                    <span className="mini-list-route"><span className="ml-dot orig" />{e.origen || '—'}</span>
                    <span className="mini-list-route"><span className="ml-dot dest" />{e.destino || '—'}</span>
                  </div>
                  <div className="mini-list-right">
                    <span className={`badge badge-${est[1]}`}>{est[0]}</span>
                    {(e.metros_lineales != null || e.toneladas != null) && <span className="mini-list-meta">{medidasTxt(e.metros_lineales, e.toneladas)}</span>}
                    {e.mercancia && <span className="mini-list-meta">{e.mercancia}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Link>
      </div>

      <div className="dash-recomienda dash-recomienda-full">
        <div className="dash-recomienda-icon"><Svg size={22}><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></Svg></div>
        <div className="dash-recomienda-text"><p style={{ fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>¿Te estamos ayudando en tu negocio? Ayúdanos valorando nuestro trabajo. Gracias.</p></div>
        <div className="dash-recomienda-btns">
          <button type="button" className="btn-primary" onClick={() => setVentana('recomendar')}>Recomendar Dynamo</button>
          <button type="button" className="btn-secondary" onClick={() => setVentana('google')}>★ Puntúanos en Google</button>
        </div>
      </div>

      <div className="dash-carousels">
        <div className="dash-clientes">
          <p className="dash-flota-eyebrow">Nuestros clientes</p>
          <h4 className="dash-flota-title">Más de 480 empresas confían en Dynamo</h4>
          <p className="dash-flota-desc">Empresas de todos los sectores que ya mueven su mercancía con nosotros.</p>
          <div className="clientes-wall" translate="no">
            {filas.map((f, i) => (
              <div key={i} className="clientes-row" data-dir={i === 1 ? 'rtl' : 'ltr'} style={{ ['--dur' as any]: `${[30, 38, 45][i]}s` }}>
                <div className="clientes-row-track">{[...f, ...f].map((l, k) => <Logo key={k} l={l} />)}</div>
              </div>
            ))}
          </div>
        </div>
        {MOSTRAR_SERVICIOS_Y_FLOTA && (<>
        <div className="dash-servicios">
          <p className="dash-flota-eyebrow">Nuestros servicios</p>
          <h4 className="dash-flota-title">Soluciones de transporte</h4>
          <p className="dash-flota-desc">Grupaje, camión completo, importación y exportación por España y Europa.</p>
          <div className="clientes-row" data-dir="ltr" style={{ overflowX: 'auto' }}>
            <div className="clientes-row-track">
              {SERVICIOS.map((s, i) => (
                <div key={i} className="dash-svc-card" role="button" tabIndex={0} aria-label={`Ver ${s.t}`} onClick={() => setVentana(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVentana(i); } }}>
                  <div className="dash-svc-img"><img loading="lazy" src={s.img} alt={s.t} style={s.pos ? { objectPosition: s.pos } : undefined} /><span className="dash-svc-chip">{s.chip}</span></div>
                  <div className="dash-svc-body"><strong>{s.t}</strong><span>{s.d}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="dash-flota">
          <p className="dash-flota-eyebrow">Nuestra flota</p>
          <h4 className="dash-flota-title">Tipos de vehículo</h4>
          <p className="dash-flota-desc">Disponemos del vehículo adecuado para cada tipo de carga y necesidad.</p>
          <div dangerouslySetInnerHTML={{ __html: FLOTA_HTML }} />
        </div>
        </>)}
      </div>

      {ventanaAbierta === 'recomendar' && (
        <Modal abierto titulo="Recomiéndanos" sub="A tu proveedor o cliente — estaremos muy agradecidos" onCerrar={() => setVentana(null)}
          icono={<Svg size={20}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></Svg>}
          pie={<button className="btn-ghost" onClick={() => setVentana(null)}>Cerrar</button>}>
          <p style={{ fontSize: 'var(--fs-l)', lineHeight: 1.55, color: 'var(--gray-700)', marginBottom: '0.7rem' }}>Si tu <strong>proveedor o cliente</strong> también necesita transportes, preséntanos con este mensaje (puedes editarlo antes de enviarlo):</p>
          <textarea rows={11} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.8rem', border: '1.5px solid var(--gray-200)', borderRadius: 10, font: 'inherit', fontSize: 'var(--fs-m)', color: 'var(--navy)', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <a className="btn-primary" style={{ flex: 1, minWidth: 180, background: '#25D366', borderColor: '#25D366', textAlign: 'center', textDecoration: 'none' }} href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener">Compartir por WhatsApp</a>
            <a className="btn-primary" style={{ flex: 1, minWidth: 180, textAlign: 'center', textDecoration: 'none' }} href={`mailto:?subject=${encodeURIComponent('Os recomiendo Dynamo Operador Logístico, S.L.')}&body=${encodeURIComponent(texto.replace(/\n/g, '\r\n'))}`}>Enviar por email</a>
          </div>
          <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: '0.6rem' }}
            onClick={() => { navigator.clipboard?.writeText(texto).finally(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }); }}>{copiado ? '✓ Copiado' : 'Copiar el texto'}</button>
        </Modal>
      )}
      {ventanaAbierta === 'google' && (
        <Modal abierto titulo="Puntúanos en Google" sub="Tu reseña nos ayuda muchísimo" onCerrar={() => setVentana(null)}
          icono={<Svg size={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>}
          pie={<button className="btn-ghost" onClick={() => setVentana(null)}>Cerrar</button>}>
          <p style={{ fontSize: 'var(--fs-l)', lineHeight: 1.6, color: 'var(--gray-700)', marginBottom: '0.9rem' }}>Las reseñas en Google son la mejor carta de presentación que podemos tener: <strong>nos ayudan muchísimo</strong> a que otras empresas confíen en nosotros. Si estás contento con el servicio, te agradecemos de corazón que nos dediques <strong>un minuto para puntuarnos</strong> (y si algo no fue bien, cuéntanoslo primero a nosotros y lo arreglamos).</p>
          <a href={GOOGLE_RESENA} target="_blank" rel="noopener" className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', boxSizing: 'border-box', textDecoration: 'none' }}>★ Abrir nuestra ficha y puntuar</a>
        </Modal>
      )}
      {typeof ventanaAbierta === 'number' && (
        <Modal abierto titulo={SERVICIOS[ventanaAbierta].t} sub={SERVICIOS[ventanaAbierta].chip} onCerrar={() => setVentana(null)}
          icono={<Svg size={20}><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></Svg>}
          pie={<button className="btn-ghost" onClick={() => setVentana(null)}>Cerrar</button>}>
          <div className="svc-modal">
            <div className="svc-modal-img"><img src={SERVICIOS[ventanaAbierta].img} alt={SERVICIOS[ventanaAbierta].t} style={SERVICIOS[ventanaAbierta].pos ? { objectPosition: SERVICIOS[ventanaAbierta].pos } : undefined} /><span className="dash-svc-chip">{SERVICIOS[ventanaAbierta].chip}</span></div>
            <p className="svc-modal-desc">{SERVICIOS[ventanaAbierta].d}</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
