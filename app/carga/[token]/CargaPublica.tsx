'use client';

// Pantallas de la página pública "aceptar carga" (diseño de aceptar-carga.html): oferta,
// reserva de 3 minutos con su contador, identificación, vehículo, pronto pago, contraoferta
// dentro de la banda, y la carga aceptada con todos sus datos. También: ya no disponible,
// en trámite, tiempo agotado y enlace no válido.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import AvisoSiniestro from '@/components/AvisoSiniestro';
import { reservar, aceptar, liberar, completar, enlaceCmr, darseDeAlta, sugerirFlota, type AltaTransportista } from './acciones';
import SelectorPais from '@/components/SelectorPais';
import { euros, fecha, ventana, pesoTn, fechaHora, metros, tipoCargaTxt } from '@/lib/formato';

import { nombreTipo } from '@/components/panel/TipoSitio';
import { telBonito } from '@/lib/paises';
import CampoTelefono from '@/components/CampoTelefono';

type Parada = {
  orden: number; tipo: 'carga' | 'descarga'; codigo_postal: string | null; poblacion: string | null; provincia: string | null;
  pais_codigo_iso: string | null; tipo_sitio: string | null; horarios: string | null; requiere_cita: boolean; tiene_medios_carga: boolean;
  // Solo en la carga aceptada:
  nombre_empresa?: string | null; direccion?: string | null; referencia?: string | null; anotaciones?: string | null;
  notas_sitio?: string | null; url_google_maps?: string | null; contacto?: { nombre: string | null; telefono: string | null } | null;
};

const TEL = '+34955225945', WA = '34628995709', MAIL = 'info@dynamotrans.com';
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const txtNum = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));

function Dudas({ texto = '¿Dudas?' }: { texto?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="dudas-toggle" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{texto} <span className="dt-chev" aria-hidden="true">▾</span></button>
      {abierto && (
        <div className="contact-btns">
          <a className="cbtn cbtn-call" href={`tel:${TEL}`}>Llamar</a>
          <a className="cbtn cbtn-wa" href={`https://wa.me/${WA}`} target="_blank" rel="noopener">WhatsApp</a>
          <a className="cbtn cbtn-mail" href={`mailto:${MAIL}`}>Email</a>
        </div>
      )}
    </>
  );
}
function Parar({ titulo, children, icono = '✕', ambar = false }: { titulo: string; children?: React.ReactNode; icono?: React.ReactNode; ambar?: boolean }) {
  return (
    <div className="stop-screen show">
      <div className={`stop-ico${ambar ? ' amber' : ''}`}>{icono}</div>
      <h1 style={ambar ? undefined : { color: 'var(--red)' }}>{titulo}</h1>
      {children}
    </div>
  );
}

// ---- La oferta: envío, ruta en tarjetas, mercancía con chips y precio --------------
function Oferta({ o, completa }: { o: any; completa?: boolean }) {
  const paradas: Parada[] = o.paradas ?? [];
  const rec = paradas.filter((p) => p.tipo === 'carga'), ent = paradas.filter((p) => p.tipo === 'descarga');
  const forma = [o.carga_lateral && 'Lateral', o.carga_trasera && 'Trasera', o.carga_techo && 'Techo'].filter(Boolean).join(' y ');
  return (
    <>
      <div className="of-envio"><span className="of-envio-lbl">Envío</span><span>#{o.referencia}</span></div>
      <div id="viajeBox" className="viaje">
        <div className="of-route">
          {[...rec.map((p, i) => ({ p, i, rec: true })), ...ent.map((p, i) => ({ p, i, rec: false }))].map(({ p, i, rec: r }) => (
            <div key={p.orden} className={`of-pt ${r ? 'of-pt-rec' : 'of-pt-ent'}`}>
              <div className="of-pt-head">
                <span className="of-pt-num">{i + 1}</span>
                <span className="of-pt-tag">{r ? 'Recogida' : 'Entrega'}</span>
                <span className={`of-pt-tipo${p.tipo_sitio && p.tipo_sitio !== 'almacen_nave' ? ' esp' : ''}`}>({nombreTipo(p.tipo_sitio)})</span>
              </div>
              {r && <div className="of-pt-fecha">{ventana(o.fecha_carga_desde, o.fecha_carga_hasta)}</div>}
              {!r && o.fecha_entrega_estimada && <div className="of-pt-fecha">Entrega estimada {fecha(o.fecha_entrega_estimada)}</div>}
              {completa && p.nombre_empresa && <div className="of-pt-loc" style={{ color: 'var(--navy)' }}>{p.url_google_maps ? <a href={p.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</div>}
              <div className="of-pt-loc">{[completa ? p.direccion : null, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : ''].filter(Boolean).join(', ')}</div>
              {p.horarios && <div className="of-pt-hor">Horario: {p.horarios}</div>}
              {(p.requiere_cita || !p.tiene_medios_carga) && <div className="of-pt-hor" style={{ color: '#b45309', fontWeight: 700 }}>{[p.requiere_cita && 'Con cita previa', !p.tiene_medios_carga && 'Sin medios de carga (plataforma elevadora)'].filter(Boolean).join(' · ')}</div>}
              {completa && p.contacto?.telefono && <div className="of-pt-hor">Contacto: <a href={`tel:${p.contacto.telefono}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>{telBonito(p.contacto.telefono)}</a>{p.contacto.nombre ? ` (${p.contacto.nombre})` : ''}</div>}
              {completa && p.referencia && <div className="of-pt-hor">Referencia: <strong style={{ color: 'var(--navy)' }}>{p.referencia}</strong></div>}
              {completa && [p.notas_sitio, p.anotaciones].filter(Boolean).map((n, k) => <div key={k} className="of-pt-hor" style={{ color: '#b45309' }}>⚠ {n}</div>)}
            </div>
          ))}
        </div>
        <div className="of-merc">
          <div className="of-merc-head">
            <span className="of-merc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg></span>
            <div><div className="of-merc-lbl">Mercancía</div><div className="of-merc-tipo">{o.descripcion_mercancia || (o.paletizado === false ? 'No paletizada' : 'Paletizada')}</div></div>
          </div>
          <div className="of-chips">
            {o.metros_lineales != null && <div className="of-chip"><span className="of-chip-k">Metros</span><span className="of-chip-v">{metros(o.metros_lineales)}</span></div>}
            {o.toneladas != null && <div className="of-chip"><span className="of-chip-k">Peso</span><span className="of-chip-v">{pesoTn(o.toneladas)}</span></div>}
            <div className="of-chip"><span className="of-chip-k">Tipo de carga</span><span className="of-chip-v">{tipoCargaTxt(o.tipo_carga, o.requiere_plataforma_elevadora) || 'Grupaje'}</span></div>
            {forma && <div className="of-chip"><span className="of-chip-k">Carga por</span><span className="of-chip-v">{forma}</span></div>}
            {o.requiere_plataforma_elevadora && <div className="of-chip"><span className="of-chip-k">Camión</span><span className="of-chip-v">Con plataforma elevadora</span></div>}
            {o.requiere_nima && <div className="of-chip"><span className="of-chip-k">Residuos</span><span className="of-chip-v">Requiere NIMA</span></div>}
            {o.adr && <div className="of-chip of-chip-full"><span className="of-chip-k">Mercancía</span><span className="of-chip-v" style={{ color: 'var(--red)' }}>ADR · peligrosa</span></div>}
          </div>
        </div>
      </div>
    </>
  );
}

export default function CargaPublica({ token, oferta, reserva, altaOnline = false, otras = [] }: { token: string; oferta: any; reserva: any; altaOnline?: boolean; otras?: OtraCarga[] }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tramite, setTramite] = useState<{ hasta: string; ahora: string } | null>(null);
  const [verOtras, setVerOtras] = useState(false);
  const r = reserva?.resultado as string | undefined;

  // Contraoferta pendiente de Dynamo: se vuelve a mirar cada 10 s.
  useEffect(() => {
    if (r !== 'pendiente_revision') return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [r, router]);

  if (oferta?.resultado === 'error') {
    return <Parar titulo="Estamos haciendo labores de mantenimiento" ambar icono="!"><p className="sub">En este momento no podemos comprobar el envío. Vuelve a intentarlo en un rato o contáctanos.</p><Dudas texto="Contáctanos" /><button className="btn" onClick={() => refrescar()}>Volver a intentarlo</button></Parar>;
  }
  if (!oferta || oferta.resultado === 'enlace_no_valido') {
    return <Parar titulo="Este enlace no es válido"><p className="sub">Revisa que lo has copiado entero, o pídenos uno nuevo.</p><Dudas /></Parar>;
  }
  if (verOtras && otras.length) return <OtrasCargas cargas={otras} onVolver={() => setVerOtras(false)} />;
  const botonOtras = otras.length > 0 && (
    <button type="button" className="btn-otras" onClick={() => { setVerOtras(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></svg>
      {oferta?.disponible ? '¿No te encaja? Ver otros envíos disponibles de Dynamo' : `Ver otros envíos disponibles de Dynamo (${otras.length})`}
    </button>
  );
  if (r === 'aceptada') return <Aceptada token={token} c={reserva} />;
  if (r === 'cerrada') return <Parar titulo={reserva?.estado === 'cancelado' ? 'Este envío se ha cancelado' : 'Este enlace ya ha caducado'}><p className="sub">Por seguridad, el enlace del envío deja de mostrar los datos pasado el día de carga. El CMR sigue en su propio enlace. Si necesitas algo (orden, albarán, factura…), contáctanos.</p><Dudas /></Parar>;
  if (r === 'reasignada') return <Parar titulo="Este envío ya no está a tu nombre"><p className="sub">Dynamo lo ha reasignado. Si crees que es un error, contáctanos.</p><Dudas /></Parar>;
  if (r === 'pendiente_revision' && altaOnline) {
    return (
      <div className="stop-screen show">
        <div className="spin spin-lg" />
        <h1>Estamos verificando tus datos, danos 3 minutos</h1>
        <p className="sub">Comprobamos tu ficha en la bolsa de cargas y completamos tu alta. Mientras tanto, el envío sigue <strong>reservado para ti</strong>. <strong>Te contestamos en esta misma pantalla.</strong></p>
        <p className="sub">Si quieres agilizar el alta, escríbenos o llámanos:</p>
        <div className="contact-btns">
          <a className="cbtn cbtn-mail" href={`mailto:${MAIL}`}>Email</a>
          <a className="cbtn cbtn-wa" href={`https://wa.me/${WA}`} target="_blank" rel="noopener">WhatsApp</a>
          <a className="cbtn cbtn-call" href={`tel:${TEL}`}>Llamar</a>
        </div>
      </div>
    );
  }
  if (r === 'pendiente_revision') {
    return (
      <div className="stop-screen show">
        <div className="spin spin-lg" />
        <h1>Estamos revisando tu precio</h1>
        <p className="sub">Has propuesto <strong>{euros(reserva.precio_propuesto)}</strong>. El envío sigue reservado para ti mientras un agente de Dynamo lo revisa (normalmente en menos de 2 minutos). <strong>Te contestamos en esta misma pantalla.</strong></p>
        <Dudas />
      </div>
    );
  }
  if (r === 'viva') return <Reservada token={token} o={oferta} hasta={reserva.hasta} ahora={reserva.ahora} />;

  if (!oferta.disponible) {
    if (oferta.motivo === 'cancelado') return <Parar titulo="Este envío se ha cancelado"><p className="sub">El cliente lo ha cancelado. Mira otros envíos con nosotros.</p>{botonOtras}<Dudas /></Parar>;
    if (oferta.motivo === 'caducada') return <Parar titulo="Esta oferta ha caducado" ambar icono="!"><p className="sub">Si te sigue interesando, contáctanos y te decimos si sigue libre.</p>{botonOtras}<Dudas /></Parar>;
    return (
      <Parar titulo="Este envío ya no está disponible">
        <p className="sub">{oferta.asignada_en ? 'Se aceptó por un transportista el:' : 'Lo ha cogido otro transportista.'}</p>
        {oferta.asignada_en && <p className="tk-fecha-line">{fechaHora(oferta.asignada_en)}</p>}
        {botonOtras}
        <Dudas />
      </Parar>
    );
  }

  async function reservarla() {
    setTrabajando(true); setAviso(null);
    const x = await reservar(token);
    setTrabajando(false);
    if (x.resultado === 'reservada') { refrescar(); return; }
    if (x.resultado === 'en_tramite' && x.hasta && x.ahora) { setTramite({ hasta: x.hasta, ahora: x.ahora }); return; }
    if (x.resultado === 'tomada' || x.resultado === 'enlace_no_valido') { refrescar(); return; }
    setAviso('No se ha podido reservar. Vuelve a intentarlo.');
  }

  return (
    <div id="formScreen" className="show">
      <h1>Envío disponible</h1>
      <p className="sub">Oferta de <strong>Dynamo Operador Logístico, S.L.</strong>{oferta.para_transportista ? <> para <strong>{oferta.para_transportista}</strong></> : null}</p>
      {r === 'rechazada' && <div className="warn" style={{ display: 'block', marginBottom: '0.8rem' }}>Dynamo no ha aceptado el precio que propusiste. Si quieres, puedes aceptarla al precio de la oferta.</div>}
      {r === 'caducada' && <div className="warn" style={{ display: 'block', marginBottom: '0.8rem' }}>Se agotó el tiempo de tu reserva anterior. Si sigue libre, puedes volver a reservarla.</div>}
      <Oferta o={oferta} />
      <div className="pago-contado">Precio: <span className="imp">{euros(oferta.precio)}</span> <span className="base-nota">· base imponible (impuestos no incluidos)</span>
        {num(oferta.banda_euros) ? <div className="base-nota" style={{ marginTop: 2 }}>Puedes proponer otro precio entre {euros(num(oferta.precio)! - num(oferta.banda_euros)!)} y {euros(num(oferta.precio)! + num(oferta.banda_euros)!)}.</div> : null}
      </div>
      {(oferta.en_tramite || tramite) && <Tramite hasta={tramite?.hasta} ahora={tramite?.ahora} onLibre={() => { setTramite(null); refrescar(); }} />}
      <button className="btn" onClick={reservarla} disabled={trabajando}>{trabajando ? 'Reservando…' : 'Reservar y aceptar este envío'}</button>
      <p className="id-hint" style={{ textAlign: 'center', marginTop: '0.5rem' }}>Al pulsar, el envío queda <strong>reservado para ti {txtNum(oferta.reserva_minutos ?? 3)} minutos</strong> para que lo aceptes; nadie más lo puede coger mientras.</p>
      {aviso && <div className="warn" style={{ display: 'block' }}>{aviso}</div>}
      {botonOtras}
      <div style={{ textAlign: 'center' }}><Dudas /></div>
    </div>
  );
}

// ---- Tablón: otras cargas de Dynamo disponibles (diseño de #bolsaScreen del mockup) ----
export type OtraCarga = {
  token: string; referencia: string; fecha_carga_desde: string | null; fecha_carga_hasta: string | null;
  metros_lineales: number | null; toneladas: number | null; tipo_carga: string | null; requiere_plataforma_elevadora?: boolean | null; precio: number | null;
  origen: { codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais: string | null } | null;
  destino: { codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais: string | null } | null;
};
const sitioTxt = (l: OtraCarga['origen']) => !l ? '—' : [l.poblacion, l.provincia && l.provincia !== l.poblacion ? l.provincia : null, l.pais && l.pais !== 'ES' ? l.pais : null].filter(Boolean).join(', ') || l.codigo_postal || '—';
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function OtrasCargas({ cargas, onVolver }: { cargas: OtraCarga[]; onVolver: () => void }) {
  const [fo, setFo] = useState(''), [fd, setFd] = useState(''), [ftc, setFtc] = useState(''), [ff, setFf] = useState('');
  const txtSitio = (l: OtraCarga['origen']) => sinAcentos([l?.codigo_postal, l?.poblacion, l?.provincia, l?.pais].filter(Boolean).join(' '));
  const lista = cargas.filter((c) =>
    (!fo || txtSitio(c.origen).includes(sinAcentos(fo))) && (!fd || txtSitio(c.destino).includes(sinAcentos(fd)))
    && (!ftc || (ftc === 'completa') === (c.tipo_carga === 'completa'))
    && (!ff || ventana(c.fecha_carga_desde, c.fecha_carga_hasta).toLowerCase().includes(ff.toLowerCase())));
  return (
    <div id="bolsaScreen">
      <button type="button" className="bolsa-volver" onClick={onVolver}><span aria-hidden="true">←</span> Volver a la oferta</button>
      <h1 style={{ marginTop: '0.4rem' }}>Envíos disponibles de Dynamo</h1>
      <p className="sub">Filtra y pulsa un envío para ver sus datos y aceptarlo.</p>
      <div className="bolsa-filtros">
        <div className="bf-field"><label htmlFor="bf-origen">Origen</label><input type="text" id="bf-origen" placeholder="Provincia, CP o país" value={fo} onChange={(e) => setFo(e.target.value)} /></div>
        <div className="bf-field"><label htmlFor="bf-destino">Destino</label><input type="text" id="bf-destino" placeholder="Provincia, CP o país" value={fd} onChange={(e) => setFd(e.target.value)} /></div>
        <div className="bf-field"><label htmlFor="bf-tc">Tipo de carga</label>
          <select id="bf-tc" value={ftc} onChange={(e) => setFtc(e.target.value)}><option value="">Todas</option><option value="completa">Completo</option><option value="grupaje">Grupaje</option></select></div>
        <div className="bf-field"><label htmlFor="bf-fecha">Fecha</label><input type="text" id="bf-fecha" placeholder="Ej. 23/07" value={ff} onChange={(e) => setFf(e.target.value)} /></div>
        <button type="button" className="bf-clear" onClick={() => { setFo(''); setFd(''); setFtc(''); setFf(''); }}>Limpiar filtros</button>
      </div>
      <div className="bolsa-count">{lista.length} {lista.length === 1 ? 'envío disponible' : 'envíos disponibles'}</div>
      <div className="bolsa-list">
        {lista.length === 0 ? <div className="bolsa-empty">No hay envíos que coincidan con los filtros. Prueba a ampliarlos o pulsa «Limpiar filtros».</div>
          : lista.map((c) => (
            <a key={c.token} className="bolsa-item" href={`/carga/${c.token}`} style={{ textDecoration: 'none' }}>
              <div className="bolsa-ruta">{sitioTxt(c.origen)} → {sitioTxt(c.destino)}</div>
              <div className="bolsa-meta">#{c.referencia} · {[c.metros_lineales != null && `${metros(c.metros_lineales)}`, c.toneladas != null && `${pesoTn(c.toneladas)}`, tipoCargaTxt(c.tipo_carga, c.requiere_plataforma_elevadora) || 'Grupaje'].filter(Boolean).join(' · ')}<br />Carga: {ventana(c.fecha_carga_desde, c.fecha_carga_hasta)}</div>
              <div className="bolsa-fila"><span className="bolsa-precio">{euros(c.precio)} <span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>· sin IVA</span></span>
                <span className="bolsa-go">Ver y aceptar →</span></div>
            </a>
          ))}
      </div>
      <div style={{ textAlign: 'center' }}><Dudas /></div>
    </div>
  );
}

// ---- Contador común (con el reloj del servidor, para que el del móvil no engañe) ---
function useCuenta(hasta?: string, ahora?: string) {
  const desfase = useMemo(() => (ahora ? new Date(ahora).getTime() - Date.now() : 0), [ahora]);
  const fin = hasta ? new Date(hasta).getTime() : 0;
  const [quedan, setQuedan] = useState(() => Math.max(0, fin - (Date.now() + desfase)));
  useEffect(() => {
    if (!fin) return;
    const t = setInterval(() => setQuedan(Math.max(0, fin - (Date.now() + desfase))), 500);
    return () => clearInterval(t);
  }, [fin, desfase]);
  const s = Math.ceil(quedan / 1000);
  return { quedan, texto: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
}

function Tramite({ hasta, ahora, onLibre }: { hasta?: string; ahora?: string; onLibre: () => void }) {
  const { quedan, texto } = useCuenta(hasta, ahora);
  useEffect(() => { if (hasta && quedan === 0) onLibre(); }, [hasta, quedan, onLibre]);
  return (
    <div className="tramite-box" style={{ marginTop: '0.8rem' }}>
      <div className="spin" /> <strong>Ahora está otro transportista reservando este envío.</strong>{' '}
      {hasta ? <>Si no la acepta, queda libre en <strong>{texto}</strong>.</> : 'Vuelve a intentarlo en unos minutos.'}
    </div>
  );
}

// ---- Reservada: formulario para aceptar --------------------------------------------
function Reservada({ token, o, hasta, ahora }: { token: string; o: any; hasta: string; ahora: string }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const { quedan, texto } = useCuenta(hasta, ahora);
  const base = num(o.precio) ?? 0, banda = num(o.banda_euros) ?? 0;
  const [cif, setCif] = useState('');
  const [contra, setContra] = useState(false);
  const [precio, setPrecio] = useState(base);
  const [veh, setVeh] = useState({ camion: '', remolque: '', conductor: '', telefono: '' });
  const [pronto, setPronto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [alta, setAlta] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);

  if (quedan === 0) {
    return (
      <Parar titulo="Se ha agotado el tiempo de reserva" ambar icono="!">
        <p className="sub">No se completó la aceptación a tiempo, así que el envío ha vuelto a quedar libre.</p>
        <button className="btn" onClick={() => refrescar()}>Volver a comprobar disponibilidad</button>
      </Parar>
    );
  }
  const pct = num(o.pronto_pago_pct) ?? 3, minimo = num(o.pronto_pago_minimo) ?? 20;
  const precioFinal = contra ? precio : base;
  const dto = Math.max(Math.round(precioFinal * pct) / 100, minimo);
  if (alta) return <AltaNueva token={token} cif={cif} precio={contra && precio !== base ? precio : null} pronto={pronto} texto={texto} urgente={quedan < 60000} onVolver={() => setAlta(false)} />;

  async function aceptarla() {
    setError(null);
    if (!o.para_transportista && !cif.trim()) { setError('Escribe tu CIF / NIF para identificarte.'); return; }
    setTrabajando(true);
    const x = await aceptar(token, { cif, precio: contra && precio !== base ? precio : null, pronto_pago: pronto, ...veh });
    setTrabajando(false);
    if (x.resultado === 'aceptada' || x.resultado === 'pendiente_revision') { refrescar(); return; }
    const msg: Record<string, string> = {
      transportista_no_encontrado: `No encontramos ese CIF en Dynamo. Revísalo o, si es tu primer envío con nosotros, date de alta aquí abajo.${x.intentos_restantes != null ? ` Te quedan ${x.intentos_restantes} intento${x.intentos_restantes === 1 ? '' : 's'}.` : ''}`,
      demasiados_intentos: 'Demasiados intentos con CIF que no están en Dynamo: por seguridad, la reserva se ha liberado. Llámanos al +34 955 225 945 y te la asignamos.',
      falta_cif: 'Escribe tu CIF / NIF para identificarte.',
      transportista_no_activo: 'Tu ficha de transportista no está activa ahora mismo. Contáctanos.',
      precio_fuera_de_banda: `El precio tiene que estar entre ${euros(x.minimo)} y ${euros(x.maximo)}.`,
      reserva_caducada: 'Se ha agotado el tiempo de reserva.', tomada: 'El envío ya lo ha cogido otro transportista.',
    };
    setError(msg[x.resultado] ?? x.error ?? 'No se ha podido aceptar. Vuelve a intentarlo.');
    if (x.resultado === 'transportista_no_encontrado') setNoEncontrado(true);
    if (x.resultado === 'reserva_caducada' || x.resultado === 'tomada' || x.resultado === 'demasiados_intentos') refrescar();
  }

  return (
    <div id="formScreen" className="show">
      <h1>Pulsa el botón de abajo para aceptar el envío</h1>
      <p className="sub">Oferta de <strong>Dynamo Operador Logístico, S.L.</strong></p>
      <div className={`reserva-banner${quedan < 60000 ? ' urgent' : ''}`}>
        <span>Envío <strong>reservado para ti</strong>: nadie más lo puede coger durante <span className="rb-timer">{texto}</span></span>
      </div>
      <Oferta o={o} />
      <div className="pago-contado">Precio: <span className="imp">{euros(precioFinal)}</span> <span className="base-nota">· base imponible (impuestos no incluidos)</span></div>

      {banda > 0 && <>
        <button type="button" className="contra-toggle" style={{ marginTop: '0.8rem' }} onClick={() => { setContra((v) => !v); setPrecio(base); }}>
          {contra ? 'Aceptarla al precio de la oferta' : 'Puedo aceptarla, pero a OTRO precio'} <span className="ct-chev" aria-hidden="true">▾</span>
        </button>
        {contra && (
          <div className="contra-box">
            <label htmlFor="contraRange" style={{ marginTop: 0 }}>Propón tu precio · dentro del rango permitido</label>
            <input type="range" id="contraRange" min={base - banda} max={base + banda} step={10} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} style={{ width: '100%' }} />
            <div className="contra-minmax"><span>{euros(base - banda)}</span><span>{euros(base + banda)}</span></div>
            <div className="contra-precio">{euros(precio)} <span className="base-nota">· base imponible</span></div>
            <div className="contra-delta">{precio === base ? 'Igual que la oferta' : precio > base ? `+${euros(precio - base)} sobre la oferta` : `${euros(precio - base)} bajo la oferta`}</div>
            <p className="contra-nota">Si tu precio se aleja poco de la oferta se acepta al momento; si no, un agente de Dynamo lo revisa y <strong>te contestamos en esta misma pantalla</strong>.</p>
          </div>
        )}
      </>}

      {o.para_transportista ? (
        <div className="empresa-resumen" style={{ marginTop: '1rem' }}>
          <div className="er-nombre">{o.para_transportista}</div>
          <div className="er-cif">Esta oferta es para tu empresa: no hace falta identificarte.</div>
        </div>
      ) : (
        <div id="identBlock">
          <div className="sec-title">Identifícate</div>
          <label htmlFor="f-cif">Tu CIF / NIF (el de tu ficha en Dynamo) *</label>
          <input type="text" id="f-cif" value={cif} placeholder="B12345678" autoCapitalize="characters" autoComplete="off" onChange={(e) => setCif(e.target.value)} />
          <p className="id-hint">¿Primer envío con Dynamo? <a href="#" style={{ color: 'var(--purple)', fontWeight: 700 }} onClick={(ev) => { ev.preventDefault(); setAlta(true); }}>Date de alta aquí</a> y acepta el envío.</p>
        </div>
      )}

      <div className="fsec fsec-vehiculo">
        <div className="sec-title">Vehículo y conductor <span className="op" style={{ fontWeight: 600, color: 'var(--gray-500)' }}>· puedes mandarlos más tarde</span></div>
        <div className="row2">
          <div><label htmlFor="f-tractora">Matrícula camión / tractora</label><input type="text" id="f-tractora" value={veh.camion} placeholder="1234ABC" autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, camion: e.target.value })} /></div>
          <div><label htmlFor="f-remolque">Matrícula remolque</label><input type="text" id="f-remolque" value={veh.remolque} placeholder="R5678DEF" autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
        </div>
        <label htmlFor="f-chofer">Nombre y apellidos del conductor</label>
        <input type="text" id="f-chofer" value={veh.conductor} placeholder="Nombre y apellidos" onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} />
        <label htmlFor="f-tfno">Teléfono del conductor</label>
        <CampoTelefono id="f-tfno" valor={veh.telefono} onCambio={(v) => setVeh({ ...veh, telefono: v })} />
        <p className="id-hint">Con estos datos, cargador y destinatario <strong>coordinan la recogida y la entrega</strong> con el conductor.</p>
      </div>

      {o.pronto_pago && (
        <div className="fac-opts">
          <div className="fac-title">Cobro <span className="op">· opcional</span></div>
          <label className="chk fac-chk">
            <input type="checkbox" checked={pronto} onChange={(e) => setPronto(e.target.checked)} />
            <span><strong>Pronto pago</strong> · cobro a <strong>{txtNum(o.pronto_pago_dias)} días</strong> tras la factura con <strong>−{txtNum(pct)} %</strong> (mínimo {euros(minimo)}).</span>
          </label>
          {pronto && <div className="fac-detail"><div className="pc-line"><span className="pc-lbl">Cobrarías</span><span className="pc-amount">{euros(precioFinal - dto)}</span></div>
            <div className="pc-alt">en vez de {euros(precioFinal)} a {txtNum(o.plazo_pago_dias)} días.</div>
            <div className="pc-sub">Precios sin IVA ni retención.</div></div>}
        </div>
      )}

      {error && <div className="warn" style={{ display: 'block' }}>{error}</div>}
      {noEncontrado && !o.para_transportista && <button type="button" className="btn-sec" style={{ width: '100%', marginBottom: '0.6rem' }} onClick={() => setAlta(true)}>No estoy en Dynamo · darme de alta y aceptar</button>}
      <button className="btn" onClick={aceptarla} disabled={trabajando}>{trabajando ? 'Aceptando…' : contra && precio !== base ? 'Proponer este precio y aceptar' : 'ACEPTAR envío'}</button>
      <button type="button" className="btn-sec" style={{ display: 'block', margin: '0.7rem auto 0', background: 'none', border: 'none', color: 'var(--gray-500)', fontWeight: 700, cursor: 'pointer' }}
        onClick={async () => { await liberar(token); refrescar(); }}>No me interesa · dejarla libre ya</button>
      <div style={{ textAlign: 'center' }}><Dudas /></div>
    </div>
  );
}

// ---- Aceptada: todos los datos de la carga ------------------------------------------
// El CMR digital: se firma con el dedo en cada carga, en la entrega y por el conductor.
function BotonCmr({ token }: { token: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  return (
    <>
      <button type="button" className="btn-sec" disabled={abriendo} onClick={async () => {
        setAbriendo(true); setMsg(null);
        const w = window.open('', '_blank');
        const r = await enlaceCmr(token);
        setAbriendo(false);
        if (r.cmr) { if (w) w.location.href = `/cmr/${r.cmr}`; else window.location.href = `/cmr/${r.cmr}`; }
        else { w?.close(); setMsg(r.error ?? 'No se ha podido abrir el CMR.'); }
      }}>{abriendo ? 'Abriendo…' : 'Abrir el CMR digital para firmar'}</button>
      {msg && <p className="id-hint" style={{ textAlign: 'center', color: 'var(--red)' }}>{msg}</p>}
    </>
  );
}

function Aceptada({ token, c }: { token: string; c: any }) {
  const [veh, setVeh] = useState({ camion: c.matricula_camion ?? '', remolque: c.matricula_remolque ?? '', conductor: c.conductor_nombre ?? '', telefono: c.conductor_telefono ?? '' });
  // Lo último guardado/sugerido, para saber si el camión o el chófer han cambiado.
  const [base, setBase] = useState({ camion: veh.camion, conductor: veh.conductor });
  const sinEsp = (x: string) => x.replace(/[^0-9a-z]/gi, '').toUpperCase();
  const mismoNombre = (a: string, b: string) => a.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === b.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Camión nuevo → el chófer de ese camión de otras veces (o vacío). Chófer nuevo → su teléfono (o vacío).
  async function alSalirCamion() {
    if (!veh.camion.trim() || sinEsp(veh.camion) === sinEsp(base.camion)) return;
    const s = await sugerirFlota(token, { matricula: veh.camion });
    if (!s) return;
    setVeh((v) => ({ ...v, conductor: s.conductor ?? '', telefono: s.telefono ?? '' }));
    setBase({ camion: veh.camion, conductor: s.conductor ?? '' });
  }
  async function alSalirConductor() {
    if (!veh.conductor.trim() || mismoNombre(veh.conductor, base.conductor)) return;
    const s = await sugerirFlota(token, { conductor: veh.conductor });
    if (!s) return;
    setVeh((v) => ({ ...v, telefono: s.telefono ?? '' }));
    setBase((b) => ({ ...b, conductor: veh.conductor }));
  }
  const [guardado, setGuardado] = useState<string | null>(null);
  const falta = !c.matricula_camion || !c.conductor_nombre || !c.conductor_telefono;
  const editable = ['programado', 'hacia_la_carga'].includes(c.estado);
  const pct = num(c.pronto_pago_pct) ?? 3, minimo = num(c.pronto_pago_minimo) ?? 20, precio = num(c.precio) ?? 0;
  const dto = Math.max(Math.round(precio * pct) / 100, minimo);
  return (
    <div className="ok-screen show">
      <h1 style={{ margin: 0 }}><span className="ok-aceptada">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        {c.estado === 'cancelado' ? ' Envío cancelado por el cliente' : ' ¡Envío aceptado!'}</span></h1>
      <p className="sub" style={{ marginTop: '0.4rem' }}>{c.transportista} · {c.aceptada_en ? fechaHora(c.aceptada_en) : ''}</p>
      <div className="pago-contado" style={{ textAlign: 'left' }}>
        Precio acordado: <span className="imp">{euros(precio)}</span> <span className="base-nota">· base imponible</span>
        {c.pronto_pago && <div className="base-nota" style={{ marginTop: 2 }}>Con pronto pago: cobras {euros(precio - dto)} a {txtNum(c.pronto_pago_dias)} días de la factura.</div>}
      </div>
      <div className="pago-contado" style={{ background: 'rgba(51,0,204,0.06)', borderColor: 'rgba(51,0,204,0.28)', color: 'var(--navy)', fontWeight: 700, textAlign: 'left' }}>
        Aquí tienes la <strong>orden de carga</strong> con todos estos datos. Guarda esta página: siempre puedes volver a ella con el mismo enlace.
      </div>
      {['programado', 'hacia_la_carga', 'cargando', 'en_ruta'].includes(c.estado) && <div style={{ textAlign: 'left' }}><AvisoSiniestro /></div>}
      {c.estado !== 'cancelado' && (
        <a className="btn" href={`/carga/${token}/orden-de-carga`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxSizing: 'border-box', marginTop: '0.4rem' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
          Ver orden de carga (PDF)
        </a>
      )}
      {['programado', 'hacia_la_carga', 'cargando', 'en_ruta'].includes(c.estado) && <BotonCmr token={token} />}
      {c.discrecion_comercial && <div className="pago-contado" style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#8a5a00', textAlign: 'left' }}><strong>Discreción comercial:</strong> en la carga no reveles el destino, ni en la entrega el origen.</div>}
      <div id="ok-resumen"><Oferta o={c} completa /></div>
      {editable && (
        <div className="fsec fsec-vehiculo" style={{ textAlign: 'left' }}>
          <div className="sec-title">Vehículo y conductor {falta && <span style={{ color: 'var(--red)' }}>· faltan datos</span>}</div>
          <div className="row2">
            <div><label htmlFor="ok-tractora">Matrícula camión / tractora</label><input type="text" id="ok-tractora" value={veh.camion} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, camion: e.target.value })} onBlur={alSalirCamion} /></div>
            <div><label htmlFor="ok-remolque">Matrícula remolque</label><input type="text" id="ok-remolque" value={veh.remolque} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
          </div>
          <label htmlFor="ok-chofer">Conductor</label><input type="text" id="ok-chofer" value={veh.conductor} onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} onBlur={alSalirConductor} />
          <label htmlFor="ok-tfno">Teléfono del conductor</label><CampoTelefono id="ok-tfno" valor={veh.telefono} onCambio={(v) => setVeh({ ...veh, telefono: v })} />
          <button className="btn" onClick={async () => {
            const x = await completar(token, veh);
            if (x.resultado === 'guardado') {
              // Lo que ha quedado guardado de verdad (p. ej. el teléfono conocido de ese chófer).
              setVeh((v) => ({ ...v, conductor: x.conductor ?? '', telefono: x.telefono ?? '' }));
              setBase({ camion: veh.camion, conductor: x.conductor ?? '' });
            }
            setGuardado(x.resultado === 'guardado' ? 'Guardado. Gracias.' : 'No se ha podido guardar; contáctanos.');
          }}>Guardar vehículo y conductor</button>
          <p className="id-hint" style={{ textAlign: 'center' }}>Al poner una matrícula o un conductor, rellenamos sus datos de otras veces (si los tenemos). Si dejas un campo vacío, se mantiene el que ya había.</p>
          {guardado && <p className="id-hint" style={{ textAlign: 'center' }}>{guardado}</p>}
        </div>
      )}
      <Dudas />
    </div>
  );
}

// ---- Alta online de un transportista nuevo -------------------------------------------------
const BOLSAS: [string, string][] = [['wtransnet', 'Wtransnet'], ['teleroute', 'Teleroute'], ['bursa_transport', 'Bursa Transport'], ['123cargo', '123cargo']];
function AltaNueva({ token, cif, precio, pronto, texto, urgente, onVolver }: { token: string; cif: string; precio: number | null; pronto: boolean; texto: string; urgente: boolean; onVolver: () => void }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [d, setD] = useState<AltaTransportista>({ bolsa: 'wtransnet', codigo_bolsa: '', pais: 'ES', cif, telefono: '', precio, pronto_pago: pronto });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const set = (k: keyof AltaTransportista, v: string) => setD((x) => ({ ...x, [k]: v }));
  async function enviar() {
    setError(null);
    if (!d.codigo_bolsa.trim()) { setError('Escribe tu código en la bolsa de cargas.'); return; }
    if (!d.cif.trim()) { setError('Escribe tu CIF / NIF.'); return; }
    if (d.telefono.replace(/[^0-9]/g, '').length < 6) { setError('Escribe un teléfono de contacto.'); return; }
    setTrabajando(true);
    const x = await darseDeAlta(token, d);
    setTrabajando(false);
    if (x.resultado === 'alta_pendiente') { refrescar(); return; }
    const campos: Record<string, string> = { bolsa: 'la bolsa de cargas', codigo_bolsa: 'tu código en la bolsa', pais: 'el país', cif: 'el CIF / NIF', telefono: 'el teléfono' };
    const msg: Record<string, string> = {
      ya_existe: 'Ese CIF ya está dado de alta en Dynamo: vuelve atrás y acepta el envío con él.',
      ya_existe_bolsa: 'Ese código de bolsa ya está dado de alta en Dynamo: vuelve atrás y acepta el envío con tu CIF.',
      datos_no_validos: x.error ?? `Revisa ${campos[x.campo ?? ''] ?? 'los datos'}.`,
      reserva_caducada: 'Se ha agotado el tiempo de reserva.', tomada: 'El envío ya lo ha cogido otro transportista.',
      oferta_personal: 'Esta oferta es para otra empresa.', demasiados_intentos: 'Demasiados intentos con este envío. Llámanos al +34 955 225 945.',
      demasiadas_altas: 'Ahora mismo no podemos tramitar más altas online para este envío. Llámanos al +34 955 225 945 y te damos de alta.',
      precio_fuera_de_banda: `El precio tiene que estar entre ${euros(x.minimo)} y ${euros(x.maximo)}.`,
    };
    setError(msg[x.resultado] ?? x.error ?? 'No se ha podido completar el alta. Vuelve a intentarlo o llámanos.');
    if (['reserva_caducada', 'tomada'].includes(x.resultado)) refrescar();
  }
  return (
    <div id="formScreen" className="show">
      <h1>Date de alta en Dynamo</h1>
      <p className="sub">Te damos de alta y el envío queda <strong>reservado para ti</strong> mientras verificamos tus datos.</p>
      <div className={`reserva-banner${urgente ? ' urgent' : ''}`}><span>Tienes <span className="rb-timer">{texto}</span> para enviar el alta.</span></div>
      <div className="pago-contado" style={{ textAlign: 'left' }}>Solo trabajamos con transportistas de <strong>bolsas de cargas del grupo Alpega</strong> (Wtransnet, Teleroute…). Por eso solo te pedimos estos datos: <strong>el resto (razón social, dirección, seguro…) lo completamos nosotros desde tu ficha en la bolsa</strong>.</div>

      <div className="row2">
        <div><label htmlFor="al-bolsa">Bolsa de cargas *</label>
          <select id="al-bolsa" value={d.bolsa} onChange={(e) => set('bolsa', e.target.value)}>{BOLSAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div><label htmlFor="al-cbolsa">Tu código en la bolsa *</label><input type="text" id="al-cbolsa" value={d.codigo_bolsa} maxLength={30} placeholder="Ej.: 123456" onChange={(e) => set('codigo_bolsa', e.target.value)} /></div>
      </div>
      <div className="row2">
        <div><label htmlFor="al-pais">País *</label><SelectorPais modo="pais" id="al-pais" valor={d.pais} onCambio={(v) => set('pais', v)} /></div>
        <div><label htmlFor="al-cif">CIF / NIF *</label><input type="text" id="al-cif" value={d.cif} autoCapitalize="characters" placeholder="B12345678" onChange={(e) => set('cif', e.target.value)} /></div>
      </div>
      <label htmlFor="al-tel">Teléfono *</label>
      <CampoTelefono id="al-tel" valor={d.telefono} onCambio={(v) => set('telefono', v)} />

      {error && <div className="warn" style={{ display: 'block' }}>{error}</div>}
      <button className="btn" onClick={enviar} disabled={trabajando}>{trabajando ? 'Enviando…' : 'Darme de alta y aceptar el envío'}</button>
      <button type="button" className="btn-sec" style={{ display: 'block', margin: '0.7rem auto 0', background: 'none', border: 'none', color: 'var(--gray-500)', fontWeight: 700, cursor: 'pointer' }} onClick={onVolver}>← Volver</button>
      <div style={{ textAlign: 'center' }}><Dudas /></div>
    </div>
  );
}
