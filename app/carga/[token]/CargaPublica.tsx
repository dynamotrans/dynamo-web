'use client';

// Pantallas de la página pública "aceptar carga" (diseño de aceptar-carga.html): oferta,
// reserva de 3 minutos con su contador, identificación, vehículo, pronto pago, contraoferta
// dentro de la banda, y la carga aceptada con todos sus datos. También: ya no disponible,
// en trámite, tiempo agotado y enlace no válido.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import AvisoSiniestro from '@/components/AvisoSiniestro';
import { reservar, aceptar, liberar, completar, enlaceCmr, darseDeAlta, sugerirFlota, sugerirTransportistas, flotaPublica, type AltaTransportista, type SugerenciaT, type FlotaPublica } from './acciones';
import SelectorPais from '@/components/SelectorPais';
import { euros, fecha, ventana, pesoTn, fechaHora, metros, tipoCargaTxt, diasEntre } from '@/lib/formato';

import { nombreTipo } from '@/components/panel/TipoSitio';
import { telBonito } from '@/lib/paises';
import CampoTelefono from '@/components/CampoTelefono';
import { validaIdFiscal, validaIdFiscalPais } from '@/lib/idFiscal';
import { CONTACTO } from '@/lib/atencion';
import type { OfertaPublica, ReservaPublica, ParadaPublica } from './tipos';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

type Parada = ParadaPublica;

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const txtNum = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));

function Dudas({ texto = '¿Dudas?' }: { texto?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="dudas-toggle" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{texto} <span className="dt-chev" aria-hidden="true">▾</span></button>
      {abierto && (
        <div className="contact-btns">
          <a className="cbtn cbtn-call" href={CONTACTO.telHref}>Llamar</a>
          <a className="cbtn cbtn-wa" href={CONTACTO.waHref} target="_blank" rel="noopener">WhatsApp</a>
          <a className="cbtn cbtn-mail" href={`mailto:${CONTACTO.email}`}>Email</a>
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
function Oferta({ o, completa }: { o: OfertaPublica | ReservaPublica; completa?: boolean }) {
  const paradas: Parada[] = o.paradas ?? [];
  const rec = paradas.filter((p) => p.tipo === 'carga'), ent = paradas.filter((p) => p.tipo === 'descarga');
  const ddmm = (s: string) => s.split('-').reverse().join('/');   // 'MM-DD' → 'DD/MM' (cada año)
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
              {p.horarios_verano && <div className="of-pt-hor">Verano{p.verano_desde && p.verano_hasta ? ` (del ${ddmm(p.verano_desde)} al ${ddmm(p.verano_hasta)})` : ''}: {p.horarios_verano}</div>}
              {(p.requiere_cita || !p.tiene_medios_carga || p.requiere_pin) && <div className="of-pt-hor" style={{ color: '#b45309', fontWeight: 700 }}>{[p.requiere_cita && 'Con cita previa', !p.tiene_medios_carga && 'Sin medios de carga (plataforma elevadora)', p.requiere_pin && `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} con PIN`].filter(Boolean).join(' · ')}</div>}
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

export default function CargaPublica({ token, oferta, reserva, altaOnline = false, otras = [] }: { token: string; oferta: OfertaPublica | null; reserva: ReservaPublica | null; altaOnline?: boolean; otras?: OtraCarga[] }) {
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
  if (r === 'aceptada') return <Aceptada token={token} c={reserva!} />;
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
          <a className="cbtn cbtn-mail" href={`mailto:${CONTACTO.email}`}>Email</a>
          <a className="cbtn cbtn-wa" href={CONTACTO.waHref} target="_blank" rel="noopener">WhatsApp</a>
          <a className="cbtn cbtn-call" href={CONTACTO.telHref}>Llamar</a>
        </div>
      </div>
    );
  }
  if (r === 'pendiente_revision') {
    return (
      <div className="stop-screen show">
        <div className="spin spin-lg" />
        <h1>Estamos revisando tu precio</h1>
        <p className="sub">Has propuesto <strong>{euros(reserva!.precio_propuesto)}</strong>. El envío sigue reservado para ti mientras un agente de Dynamo lo revisa (normalmente en menos de 2 minutos). <strong>Te contestamos en esta misma pantalla.</strong></p>
        <Dudas />
      </div>
    );
  }
  if (r === 'viva') return <Reservada token={token} o={oferta} hasta={reserva!.hasta ?? ''} ahora={reserva!.ahora ?? ''} />;

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
      {/* Caja destacada (usuario, 2026-11-09): de quién es la oferta y para quién, bien visible. */}
      <div className="oferta-para"><span className="op-lbl">Oferta de</span><strong>Dynamo Operador Logístico, S.L.</strong>{oferta.para_transportista ? <> para <strong>{oferta.para_transportista}</strong></> : null}</div>
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
function Reservada({ token, o, hasta, ahora }: { token: string; o: OfertaPublica; hasta: string; ahora: string }) {
  const refrescar = useRefrescar();
  const { quedan, texto } = useCuenta(hasta, ahora);
  const base = num(o.precio) ?? 0, banda = num(o.banda_euros) ?? 0;
  const [cif, setCif] = useState('');
  const [contra, setContra] = useState(false);
  const [precio, setPrecio] = useState(base);
  const [veh, setVeh] = useState({ camion: '', remolque: '', conductor: '', telefono: '' });
  // El día de carga se elige YA al aceptar (usuario, 2026-11-10): antes se aceptaba sin
  // día y la página lo reclamaba después, cuando debió ponerlo el propio transportista.
  const diasV = diasEntre(o.fecha_carga_desde ?? null, o.fecha_carga_hasta ?? null);
  const [diaAc, setDiaAc] = useState('');
  const [pronto, setPronto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [alta, setAlta] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);
  // Autocompletado del mockup: sugerencias de la base de Dynamo mientras escribe
  // (nombre desde 2 letras; CIF, NIF o código de bolsa desde 4). Elegir una deja la
  // empresa fijada («No soy yo · cambiar»). La base de datos solo responde con la
  // reserva viva de este enlace.
  const [sugs, setSugs] = useState<SugerenciaT[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [acAbierto, setAcAbierto] = useState(false);
  const [elegido, setElegido] = useState<SugerenciaT | null>(null);
  // Flota de otras veces (usuario, 2026-11-09): al identificarse se autorrellena lo
  // último usado (si los campos están vacíos) y cada campo ofrece la lista de
  // matrículas/chóferes ya usados. prefRef recuerda lo autorrellenado para poder
  // vaciarlo si cambia de empresa sin haberlo tocado.
  const [flo, setFlo] = useState<FlotaPublica | null>(null);
  const prefFlo = useRef<string | null>(null);
  async function cargaFlota(cifSel: string | null) {
    const f = await flotaPublica(token, cifSel);
    setFlo(f);
    setVeh((v) => {
      if (!f?.ultimo || v.camion || v.remolque || v.conductor || v.telefono) return v;
      const nuevo = { camion: f.ultimo.camion ?? '', remolque: f.ultimo.remolque ?? '', conductor: f.ultimo.conductor ?? '', telefono: f.ultimo.telefono ?? '' };
      prefFlo.current = JSON.stringify(nuevo);
      return nuevo;
    });
  }
  // Oferta personal: el transportista ya es el de la reserva.
  useEffect(() => { if (o.para_transportista) cargaFlota(null); }, [o.para_transportista]); // eslint-disable-line react-hooks/exhaustive-deps
  const seqBusqueda = useRef(0);
  useEffect(() => {
    if (elegido || o.para_transportista) return;
    const q = cif.trim();
    // Mínimo 4 caracteres para autocompletar (usuario, 2026-11-09): con 2 salían listas enormes.
    if (q.replace(/[^0-9A-Za-z]/g, '').length < 4) { setSugs(null); setBuscando(false); return; }
    setBuscando(true);
    const mio = ++seqBusqueda.current;
    const t = setTimeout(() => {
      sugerirTransportistas(token, q)
        .then((r) => { if (seqBusqueda.current === mio) { setSugs(r); setBuscando(false); } })
        .catch(() => { if (seqBusqueda.current === mio) { setSugs([]); setBuscando(false); } });
    }, 300);
    return () => clearTimeout(t);
  }, [cif, elegido, token, o.para_transportista]);

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
  if (alta) return <AltaNueva token={token} cif={/\d{4,}/.test(cif) ? cif : ''} precio={contra && precio !== base ? precio : null} pronto={pronto} texto={texto} urgente={quedan < 60000} onVolver={() => setAlta(false)} />;

  const cifReal = (elegido?.cif ?? cif).trim();
  async function aceptarla() {
    setError(null);
    if (!o.para_transportista && !cifReal) { setError('Escribe tu CIF / NIF para identificarte.'); avisaFaltas(['f-cif']); return; }
    if (diasV.length > 1 && !diaAc) { setError('Elige el día en que cargas dentro de la ventana.'); avisaFaltas(['f-dia']); return; }
    setTrabajando(true);
    const x = await aceptar(token, { cif: cifReal, precio: contra && precio !== base ? precio : null, pronto_pago: pronto, ...veh });
    if (x.resultado === 'aceptada' && diasV.length > 1 && diaAc) await completar(token, { ...veh, dia: diaAc });
    setTrabajando(false);
    if (x.resultado === 'aceptada' || x.resultado === 'pendiente_revision') { refrescar(); return; }
    const msg: Record<string, string> = {
      transportista_no_encontrado: `No encontramos ese CIF en Dynamo. Revísalo o, si es tu primer envío con nosotros, date de alta aquí abajo.${x.intentos_restantes != null ? ` Te quedan ${x.intentos_restantes} intento${x.intentos_restantes === 1 ? '' : 's'}.` : ''}`,
      demasiados_intentos: `Demasiados intentos con CIF que no están en Dynamo: por seguridad, la reserva se ha liberado. Llámanos al ${CONTACTO.telefono} y te la asignamos.`,
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
      <div className="oferta-para"><span className="op-lbl">Oferta de</span><strong>Dynamo Operador Logístico, S.L.</strong></div>
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
          <div className="sec-title">{elegido ? 'Identificado' : 'Identifícate'}</div>
          {elegido ? (
            /* La clase `show` es la que lo pinta (el CSS lo trae oculto): sin ella, la caja
               se quedaba vacía tras elegir la empresa (usuario, 2026-11-09). */
            <div className="empresa-resumen show" style={{ marginTop: '0.6rem' }}>
              <div className="er-nombre">{elegido.nombre}</div>
              <div className="er-cif">{elegido.cif}{elegido.poblacion ? ` · ${elegido.poblacion}` : ''}</div>
              {/* Contacto de su ficha, OCULTO (llega ya enmascarado del servidor). */}
              {flo?.telefono_oculto && <div className="er-cif" style={{ marginTop: '0.3rem' }}>Teléfono: {flo.telefono_oculto}</div>}
              {flo?.email_oculto && <div className="er-cif">Mail: {flo.email_oculto}</div>}
              <button type="button" className="btn-sec" style={{ marginTop: '0.55rem', padding: '0.55rem' }} onClick={() => {
                setElegido(null); setCif(''); setSugs(null); setFlo(null);
                // Si los campos del vehículo siguen tal cual se autorrellenaron, se vacían.
                setVeh((v) => prefFlo.current === JSON.stringify(v) ? { camion: '', remolque: '', conductor: '', telefono: '' } : v);
                prefFlo.current = null;
              }}>No soy yo · cambiar</button>
            </div>
          ) : (<>
            <label htmlFor="f-cif">Tu CIF / NIF, código de bolsa o el nombre de tu empresa <Req /></label>
            <div className="idrow">
              <input type="text" id="f-cif" value={cif} placeholder="B12345678 o tu empresa" autoCapitalize="characters" autoComplete="off"
                onChange={(e) => { setCif(e.target.value); setAcAbierto(true); }}
                onFocus={() => setAcAbierto(true)} onBlur={() => setTimeout(() => setAcAbierto(false), 150)} />
              <ul className={`ac-list${acAbierto && cif.trim().replace(/[^0-9A-Za-z]/g, '').length >= 4 && (buscando || sugs !== null) ? ' show' : ''}`} id="ac-buscar">
                {(sugs ?? []).map((s) => (
                  <li key={s.cif} onMouseDown={(ev) => { ev.preventDefault(); setElegido(s); setCif(s.cif); setAcAbierto(false); cargaFlota(s.cif); }}>
                    {s.nombre}<span className="ac-sub">{s.cif}{s.poblacion ? ` · ${s.poblacion}` : ''}</span>
                  </li>
                ))}
                {buscando && <li className="ac-tip">Consultando la base de Dynamo…</li>}
                {/* Última opción (o la única, si no hay resultados): darse de alta. */}
                {!buscando && sugs !== null && (
                  <li style={{ color: 'var(--purple)', fontWeight: 800 }} onMouseDown={(ev) => { ev.preventDefault(); setAlta(true); }}>
                    {sugs.length ? '¿No eres ninguna? Darme de alta y aceptar →' : 'No te encontramos · darme de alta y aceptar →'}
                  </li>
                )}
              </ul>
            </div>
            {/* Aviso en vivo SOLO cuando el número casa con un formato conocido y el control
                falla (una errata): así no se gasta un intento de identificación. */}
            {(() => { const r = cif.trim() ? validaIdFiscal(cif) : null;
              return r && !r.ok && r.tipo ? <p className="id-hint" style={{ color: 'var(--red)' }}>{r.tipo}: {r.msg}. Revísalo antes de aceptar.</p> : null; })()}
            <p className="id-hint">Sugerencias desde 5 letras (nombre) o 4 caracteres (CIF o código de bolsa). ¿Primer envío con Dynamo? <a href="#" style={{ color: 'var(--purple)', fontWeight: 700 }} onClick={(ev) => { ev.preventDefault(); setAlta(true); }}>Date de alta aquí</a> y acepta el envío.</p>
          </>)}
        </div>
      )}

      {/* El vehículo y el conductor solo salen cuando ya hay identificación (usuario,
          2026-11-10): oferta nominal, empresa elegida o un CIF/nombre escrito (4+). Así la
          pantalla guía: primero identifícate (o date de alta), luego lo demás. */}
      {(o.para_transportista || elegido || cif.trim().replace(/[^0-9A-Za-z]/g, '').length >= 4) && (
      <div className="fsec fsec-vehiculo">
        <div className="sec-title">Vehículo y conductor <span className="op" style={{ fontWeight: 600, color: 'var(--gray-500)' }}>· puedes mandarlos más tarde</span></div>
        {diasV.length > 1 && <>
          <label htmlFor="f-dia">Día en que cargas <Req /></label>
          <select id="f-dia" value={diaAc} onChange={(e) => setDiaAc(e.target.value)}>
            <option value="">Elige un día de la ventana…</option>
            {diasV.map((d) => { const w = new Date(`${d}T12:00:00`).getDay(); return <option key={d} value={d} disabled={w === 0 || w === 6}>{fecha(d)}{w === 0 || w === 6 ? ' (no se circula)' : ''}</option>; })}
          </select>
        </>}
        <div className="row2">
          <div><label htmlFor="f-tractora">Matrícula camión / tractora <Req si={false} /></label><input type="text" id="f-tractora" list="fl-camiones" value={veh.camion} placeholder="1234ABC" autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, camion: e.target.value })} /></div>
          <div><label htmlFor="f-remolque">Matrícula remolque <Req si={false} /></label><input type="text" id="f-remolque" list="fl-remolques" value={veh.remolque} placeholder="R5678DEF" autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
          <datalist id="fl-camiones">{(flo?.camiones ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="fl-remolques">{(flo?.remolques ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="fl-choferes">{(flo?.conductores ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <label htmlFor="f-chofer">Nombre y apellidos del conductor <Req si={false} /></label>
        <input type="text" id="f-chofer" list="fl-choferes" value={veh.conductor} placeholder="Nombre y apellidos" onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} />
        <label htmlFor="f-tfno">Teléfono del conductor <Req si={false} /></label>
        <CampoTelefono id="f-tfno" valor={veh.telefono} onCambio={(v) => setVeh({ ...veh, telefono: v })} />
        <p className="id-hint">Con estos datos, cargador y destinatario <strong>coordinan la recogida y la entrega</strong> con el conductor.</p>
      </div>
      )}

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

function Aceptada({ token, c }: { token: string; c: ReservaPublica }) {
  const [veh, setVeh] = useState({ camion: c.matricula_camion ?? '', remolque: c.matricula_remolque ?? '', conductor: c.conductor_nombre ?? '', telefono: c.conductor_telefono ?? '' });
  // Listas de matrículas y chóferes de otras veces (usuario, 2026-11-09): aquí el
  // transportista ya es el de la reserva, así que se piden al cargar.
  const [flo, setFlo] = useState<FlotaPublica | null>(null);
  useEffect(() => { flotaPublica(token, null).then(setFlo).catch(() => {}); }, [token]);
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
  const [guardado, setGuardado] = useState<{ ok: boolean; txt: string } | null>(null);
  // Envío con ventana: el día en que cargas es obligatorio (con él va el seguimiento del viaje).
  const dias = diasEntre(c.fecha_carga_desde ?? null, c.fecha_carga_hasta ?? null);
  const [dia, setDia] = useState<string>(c.fecha_carga_prevista ?? '');
  // Instantánea de lo último GUARDADO (usuario, 2026-11-11: con todo relleno «parece que
  // está sin guardar»): sin cambios respecto a ella, el botón dice «✓ Guardado» y se
  // desactiva; con cambios sobre datos ya guardados, dice «Actualizar…».
  const [salvo, setSalvo] = useState({ camion: c.matricula_camion ?? '', remolque: c.matricula_remolque ?? '',
    conductor: c.conductor_nombre ?? '', telefono: c.conductor_telefono ?? '', dia: c.fecha_carga_prevista ?? '' });
  const nMat = (x: string) => x.replace(/[\s-]/g, '').toUpperCase();
  const nTel = (x: string) => x.replace(/[^0-9]/g, '');
  const sinCambios = nMat(veh.camion) === nMat(salvo.camion) && nMat(veh.remolque) === nMat(salvo.remolque)
    && veh.conductor.trim().toLowerCase() === salvo.conductor.trim().toLowerCase()
    && nTel(veh.telefono) === nTel(salvo.telefono) && (dias.length <= 1 || dia === salvo.dia);
  const teniaDatos = !!(salvo.camion || salvo.conductor);
  const falta = !salvo.camion || !salvo.conductor || !salvo.telefono || (dias.length > 1 && !salvo.dia);
  const editable = ['programado', 'hacia_la_carga'].includes(c.estado ?? '');
  const pct = num(c.pronto_pago_pct) ?? 3, minimo = num(c.pronto_pago_minimo) ?? 20, precio = num(c.precio) ?? 0;
  const dto = Math.max(Math.round(precio * pct) / 100, minimo);
  return (
    <div className="ok-screen show">
      <h1 style={{ margin: 0 }}><span className="ok-aceptada">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        {c.estado === 'cancelado' ? ' Envío cancelado por el cliente' : ' ¡Envío aceptado!'}</span></h1>
      {/* Caja destacada (usuario, 2026-11-09): quién lo aceptó y cuándo. Todas las cajas
          de esta cabecera van ALINEADAS a la izquierda y con el mismo ritmo de 0.7rem
          (usuario, 2026-11-11: «diseña bien esa pantalla, alinea, separaciones»); fuera
          el mensaje de «guarda esta página», que solo metía ruido. */}
      {/* Tres líneas (usuario, 2026-11-11): etiqueta, nombre y fecha, cada una en la suya. */}
      <div className="oferta-para" style={{ margin: '0.7rem 0 0', textAlign: 'left' }}>
        <span className="op-lbl">Aceptado por</span>
        <strong style={{ display: 'block' }}>{c.transportista}</strong>
        {c.aceptada_en && <div style={{ fontSize: 'var(--fs-m)', fontWeight: 600, color: 'var(--gray-500, #6b7280)', marginTop: 2 }}>{fechaHora(c.aceptada_en)}</div>}
      </div>
      {/* Dos líneas y CENTRADO (usuario, 2026-11-11): «Precio acordado:» arriba, importe debajo. */}
      <div className="pago-contado" style={{ textAlign: 'center' }}>
        <span style={{ display: 'block' }}>Precio acordado:</span>
        <span className="imp">{euros(precio)}</span> <span className="base-nota">· base imponible</span>
        {c.pronto_pago && <div className="base-nota" style={{ marginTop: 2 }}>Con pronto pago: cobras {euros(precio - dto)} a {txtNum(c.pronto_pago_dias)} días de la factura.</div>}
      </div>
      {c.estado !== 'cancelado' && (
        <a className="btn" href={`/carga/${token}/orden-de-carga`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxSizing: 'border-box', marginTop: '0.7rem' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
          Ver orden de carga (PDF)
        </a>
      )}
      {['programado', 'hacia_la_carga', 'cargando', 'en_ruta'].includes(c.estado ?? '') && <BotonCmr token={token} />}
      {c.discrecion_comercial && <div className="pago-contado" style={{ background: '#fff7e6', borderColor: '#ffd591', color: '#8a5a00', textAlign: 'left' }}><strong>Discreción comercial:</strong> en la carga no reveles el destino, ni en la entrega el origen.</div>}
      <div id="ok-resumen"><Oferta o={c} completa /></div>
      {editable && (
        <div className="fsec fsec-vehiculo" style={{ textAlign: 'left' }}>
          <div className="sec-title">Vehículo y conductor {falta
            ? <span style={{ color: 'var(--red)' }}>· faltan datos</span>
            : <span style={{ color: '#047857' }}>· guardado</span>}</div>
          <div className="row2">
            <div><label htmlFor="ok-tractora">Matrícula camión / tractora <Req si={false} /></label><input type="text" id="ok-tractora" list="okfl-camiones" value={veh.camion} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, camion: e.target.value })} onBlur={alSalirCamion} /></div>
            <div><label htmlFor="ok-remolque">Matrícula remolque <Req si={false} /></label><input type="text" id="ok-remolque" list="okfl-remolques" value={veh.remolque} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
            <datalist id="okfl-camiones">{(flo?.camiones ?? []).map((m) => <option key={m} value={m} />)}</datalist>
            <datalist id="okfl-remolques">{(flo?.remolques ?? []).map((m) => <option key={m} value={m} />)}</datalist>
            <datalist id="okfl-choferes">{(flo?.conductores ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          {dias.length > 1 && <>
            <label htmlFor="ok-dia">Día en que cargas <Req /></label>
            <select id="ok-dia" value={dia} onChange={(e) => setDia(e.target.value)}>
              <option value="">Elige un día de la ventana…</option>
              {dias.map((d) => { const w = new Date(`${d}T12:00:00`).getDay(); return <option key={d} value={d} disabled={w === 0 || w === 6}>{fecha(d)}{w === 0 || w === 6 ? ' (no se circula)' : ''}</option>; })}
            </select>
          </>}
          <label htmlFor="ok-chofer">Conductor <Req si={false} /></label><input type="text" id="ok-chofer" list="okfl-choferes" value={veh.conductor} onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} onBlur={alSalirConductor} />
          <label htmlFor="ok-tfno">Teléfono del conductor <Req si={false} /></label><CampoTelefono id="ok-tfno" valor={veh.telefono} onCambio={(v) => setVeh({ ...veh, telefono: v })} />
          <button className="btn" disabled={sinCambios} style={sinCambios ? { background: '#047857', opacity: 1 } : undefined} onClick={async () => {
            if (dias.length > 1 && !dia) { setGuardado({ ok: false, txt: 'Elige el día en que cargas.' }); avisaFaltas(['ok-dia']); return; }
            const x = await completar(token, { ...veh, dia });
            if (x.resultado === 'guardado') {
              // Lo que ha quedado guardado de verdad (p. ej. el teléfono conocido de ese chófer).
              setVeh((v) => ({ ...v, conductor: x.conductor ?? '', telefono: x.telefono ?? '' }));
              setBase({ camion: veh.camion, conductor: x.conductor ?? '' });
              setSalvo({ camion: veh.camion, remolque: veh.remolque, conductor: x.conductor ?? '', telefono: x.telefono ?? '', dia });
            }
            // Cada fallo con su mensaje (usuario, 2026-11-10: «no funciona bien» y el
            // genérico no decía POR QUÉ): sin cookie, reserva caída o envío cambiado.
            setGuardado(x.resultado === 'guardado' ? { ok: true, txt: 'Vehículo y conductor guardados.' }
              : { ok: false, txt: x.resultado === 'falta_fecha_prevista' ? 'Elige el día en que cargas.'
              : x.resultado === 'fecha_fuera_de_ventana' ? 'Ese día no está dentro de los días de recogida.'
              : x.resultado === 'sin_reserva' ? 'Este navegador ya no guarda tu acceso a esta carga: abre otra vez el enlace que te enviaron y vuelve a intentarlo.'
              : x.resultado === 'no_aceptada' || x.resultado === 'ya_no_se_puede' ? 'Este envío ha cambiado o ya no está contigo: recarga la página para ver cómo está, o llámanos.'
              : 'No se ha podido guardar; contáctanos.' });
          }}>{sinCambios ? '✓ Guardado' : teniaDatos ? 'Actualizar vehículo y conductor' : 'Guardar vehículo y conductor'}</button>
          {/* Resultado BIEN VISIBLE (usuario, 2026-11-11): verde cuando está guardado y
              sin cambios pendientes; rojo si el guardado falló. */}
          {sinCambios && teniaDatos && !falta && (
            <div style={{ marginTop: '0.6rem', background: '#ecfdf5', border: '1px solid #b7ebcd', color: '#047857', fontWeight: 700, borderRadius: 10, padding: '0.55rem 0.8rem', textAlign: 'center' }}>
              ✓ {guardado?.ok ? guardado.txt : 'Estos datos ya están guardados.'}
            </div>
          )}
          {!sinCambios && teniaDatos && (
            <div style={{ marginTop: '0.6rem', background: '#fff7e6', border: '1px solid #ffd591', color: '#8a5a00', fontWeight: 700, borderRadius: 10, padding: '0.55rem 0.8rem', textAlign: 'center' }}>
              Hay cambios sin guardar: pulsa «Actualizar vehículo y conductor».
            </div>
          )}
          {guardado && !guardado.ok && (
            <div role="alert" style={{ marginTop: '0.6rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b42318', fontWeight: 700, borderRadius: 10, padding: '0.55rem 0.8rem', textAlign: 'center' }}>
              {guardado.txt}
            </div>
          )}
          <p className="id-hint" style={{ textAlign: 'center' }}>Al poner una matrícula o un conductor, rellenamos sus datos de otras veces (si los tenemos). Si dejas un campo vacío, se mantiene el que ya había.</p>
        </div>
      )}
      {/* El aviso de dudas/incidencias va AL FINAL (usuario, 2026-11-10) y SUSTITUYE al
          botón «¿Dudas?» (usuario, 2026-11-11: duplicaba los mismos contactos). El botón
          solo queda en los estados sin aviso (entregado o cancelado), que si no se
          quedarían sin contacto. */}
      {['programado', 'hacia_la_carga', 'cargando', 'en_ruta'].includes(c.estado ?? '')
        ? <div style={{ textAlign: 'left', marginTop: '0.7rem' }}><AvisoSiniestro /></div>
        : <Dudas />}
    </div>
  );
}

// ---- Alta online de un transportista nuevo -------------------------------------------------
const BOLSAS: [string, string][] = [['wtransnet', 'Wtransnet'], ['teleroute', 'Teleroute'], ['bursa_transport', 'Bursa Transport'], ['123cargo', '123cargo']];
function AltaNueva({ token, cif, precio, pronto, texto, urgente, onVolver }: { token: string; cif: string; precio: number | null; pronto: boolean; texto: string; urgente: boolean; onVolver: () => void }) {
  const refrescar = useRefrescar();
  const [d, setD] = useState<AltaTransportista>({ bolsa: 'wtransnet', codigo_bolsa: '', pais: 'ES', cif, telefono: '', precio, pronto_pago: pronto });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const set = (k: keyof AltaTransportista, v: string) => setD((x) => ({ ...x, [k]: v }));
  // Aviso en vivo bajo el campo: valen empresas Y autónomos (CIF, NIF o NIE) y cualquier
  // país — con prefijo de IVA si es europeo; del resto del mundo se admite el nº fiscal
  // tal cual y lo revisa Dynamo al activar (usuario, 2026-11-09).
  const idf = d.cif.trim() ? validaIdFiscalPais(d.cif, d.pais) : null;
  async function enviar() {
    setError(null);
    if (!d.codigo_bolsa.trim()) { setError('Escribe tu código en la bolsa de cargas.'); avisaFaltas(['al-cbolsa']); return; }
    if (!d.cif.trim()) { setError('Escribe tu CIF / NIF.'); avisaFaltas(['al-cif']); return; }
    if (d.telefono.replace(/[^0-9]/g, '').length < 6) { setError('Escribe un teléfono de contacto.'); avisaFaltas(['al-tel']); return; }
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
      oferta_personal: 'Esta oferta es para otra empresa.', demasiados_intentos: `Demasiados intentos con este envío. Llámanos al ${CONTACTO.telefono}.`,
      demasiadas_altas: `Ahora mismo no podemos tramitar más altas online para este envío. Llámanos al ${CONTACTO.telefono} y te damos de alta.`,
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
        <div><label htmlFor="al-bolsa">Bolsa de cargas</label>
          <select id="al-bolsa" value={d.bolsa} onChange={(e) => set('bolsa', e.target.value)}>{BOLSAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div><label htmlFor="al-cbolsa">Tu código en la bolsa <Req /></label><input type="text" id="al-cbolsa" value={d.codigo_bolsa} maxLength={30} placeholder="Ej.: 123456" onChange={(e) => set('codigo_bolsa', e.target.value)} /></div>
      </div>
      <div className="row2">
        <div><label htmlFor="al-pais">País</label><SelectorPais modo="pais" id="al-pais" valor={d.pais} onCambio={(v) => set('pais', v)} /></div>
        <div><label htmlFor="al-cif">CIF / NIF <Req /></label><input type="text" id="al-cif" value={d.cif} autoCapitalize="characters" placeholder="B12345678 / 12345678Z" onChange={(e) => set('cif', e.target.value)} /></div>
      </div>
      <p className="id-hint" style={idf && !idf.ok ? { color: 'var(--red)' } : undefined}>
        {idf && !idf.ok
          ? `${idf.tipo ? `${idf.tipo}: ` : ''}${idf.msg}.`
          : idf?.ok && !idf.soft && idf.tipo
          ? `${idf.tipo}: correcto.`
          : 'Empresa o autónomo, da igual: CIF, NIF o NIE en España; de otro país, tu nº de IVA con el prefijo (PT…, FR…) o tu nº fiscal tal cual.'}
      </p>
      <label htmlFor="al-tel">Teléfono <Req /></label>
      <CampoTelefono id="al-tel" valor={d.telefono} onCambio={(v) => set('telefono', v)} />

      {error && <div className="warn" style={{ display: 'block' }}>{error}</div>}
      <button className="btn" onClick={enviar} disabled={trabajando}>{trabajando ? 'Enviando…' : 'Darme de alta y aceptar el envío'}</button>
      <button type="button" className="btn-sec" style={{ display: 'block', margin: '0.7rem auto 0', background: 'none', border: 'none', color: 'var(--gray-500)', fontWeight: 700, cursor: 'pointer' }} onClick={onVolver}>← Volver</button>
      <div style={{ textAlign: 'center' }}><Dudas /></div>
    </div>
  );
}
