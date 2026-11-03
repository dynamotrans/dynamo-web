'use client';

// Pantallas de la página pública "aceptar carga" (diseño de aceptar-carga.html): oferta,
// reserva de 3 minutos con su contador, identificación, vehículo, pronto pago, contraoferta
// dentro de la banda, y la carga aceptada con todos sus datos. También: ya no disponible,
// en trámite, tiempo agotado y enlace no válido.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reservar, aceptar, liberar, completar, enlaceCmr } from './acciones';
import { euros, fecha, ventana } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';
import { nombreTipo } from '@/components/panel/TipoSitio';
import { telBonito } from '@/lib/paises';

type Parada = {
  orden: number; tipo: 'carga' | 'descarga'; codigo_postal: string | null; poblacion: string | null; provincia: string | null;
  pais_codigo_iso: string | null; tipo_lugar: string | null; horarios: string | null; requiere_cita: boolean; tiene_medios_carga: boolean;
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
  const forma = [o.carga_lateral && 'Lateral', o.carga_trasera && 'Trasera', o.carga_superior && 'Techo'].filter(Boolean).join(' y ');
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
                <span className={`of-pt-tipo${p.tipo_lugar && p.tipo_lugar !== 'almacen_nave' ? ' esp' : ''}`}>({nombreTipo(p.tipo_lugar)})</span>
              </div>
              {r && <div className="of-pt-fecha">{ventana(o.fecha_carga_desde, o.fecha_carga_hasta)}</div>}
              {!r && o.fecha_entrega_estimada && <div className="of-pt-fecha">Entrega estimada {fecha(o.fecha_entrega_estimada)}</div>}
              {completa && p.nombre_empresa && <div className="of-pt-loc" style={{ color: 'var(--navy)' }}>{p.url_google_maps ? <a href={p.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</div>}
              <div className="of-pt-loc">{[completa ? p.direccion : null, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : ''].filter(Boolean).join(', ')}</div>
              {p.horarios && <div className="of-pt-hor">Horario: {p.horarios}</div>}
              {(p.requiere_cita || !p.tiene_medios_carga) && <div className="of-pt-hor" style={{ color: '#b45309', fontWeight: 700 }}>{[p.requiere_cita && 'Con cita previa', !p.tiene_medios_carga && 'Sin medios de carga (trampilla)'].filter(Boolean).join(' · ')}</div>}
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
            {o.metros_lineales != null && <div className="of-chip"><span className="of-chip-k">Metros</span><span className="of-chip-v">{txtNum(o.metros_lineales)} m</span></div>}
            {o.toneladas != null && <div className="of-chip"><span className="of-chip-k">Peso</span><span className="of-chip-v">{txtNum(o.toneladas)} Tn</span></div>}
            <div className="of-chip"><span className="of-chip-k">Tipo de carga</span><span className="of-chip-v">{o.tipo_carga === 'completa' ? 'Completo' : 'Grupaje'}</span></div>
            {forma && <div className="of-chip"><span className="of-chip-k">Carga por</span><span className="of-chip-v">{forma}</span></div>}
            {o.plataforma_elevadora && <div className="of-chip"><span className="of-chip-k">Camión</span><span className="of-chip-v">Con trampilla</span></div>}
            {o.nima_requerido && <div className="of-chip"><span className="of-chip-k">Residuos</span><span className="of-chip-v">Requiere NIMA</span></div>}
            {o.adr && <div className="of-chip of-chip-full"><span className="of-chip-k">Mercancía</span><span className="of-chip-v" style={{ color: 'var(--red)' }}>ADR · peligrosa</span></div>}
          </div>
        </div>
      </div>
    </>
  );
}

export default function CargaPublica({ token, oferta, reserva }: { token: string; oferta: any; reserva: any }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tramite, setTramite] = useState<{ hasta: string; ahora: string } | null>(null);
  const r = reserva?.resultado as string | undefined;

  // Contraoferta pendiente de Dynamo: se vuelve a mirar cada 10 s.
  useEffect(() => {
    if (r !== 'pendiente_revision') return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [r, router]);

  if (oferta?.resultado === 'error') {
    return <Parar titulo="Estamos haciendo labores de mantenimiento" ambar icono="!"><p className="sub">En este momento no podemos comprobar la carga. Vuelve a intentarlo en un rato o contáctanos.</p><Dudas texto="Contáctanos" /><button className="btn" onClick={() => router.refresh()}>Volver a intentarlo</button></Parar>;
  }
  if (!oferta || oferta.resultado === 'enlace_no_valido') {
    return <Parar titulo="Este enlace no es válido"><p className="sub">Revisa que lo has copiado entero, o pídenos uno nuevo.</p><Dudas /></Parar>;
  }
  if (r === 'aceptada') return <Aceptada token={token} c={reserva} />;
  if (r === 'reasignada') return <Parar titulo="Esta carga ya no está a tu nombre"><p className="sub">Dynamo la ha reasignado. Si crees que es un error, contáctanos.</p><Dudas /></Parar>;
  if (r === 'pendiente_revision') {
    return (
      <div className="stop-screen show">
        <div className="spin spin-lg" />
        <h1>Estamos revisando tu precio</h1>
        <p className="sub">Has propuesto <strong>{euros(reserva.precio_propuesto)}</strong>. La carga sigue reservada para ti mientras un agente de Dynamo lo revisa (normalmente en menos de 2 minutos). <strong>Te contestamos en esta misma pantalla.</strong></p>
        <Dudas />
      </div>
    );
  }
  if (r === 'viva') return <Reservada token={token} o={oferta} hasta={reserva.hasta} ahora={reserva.ahora} />;

  if (!oferta.disponible) {
    if (oferta.motivo === 'cancelado') return <Parar titulo="Esta carga se ha cancelado"><p className="sub">El cliente la ha cancelado. Mira otras cargas con nosotros.</p><Dudas /></Parar>;
    if (oferta.motivo === 'caducada') return <Parar titulo="Esta oferta ha caducado" ambar icono="!"><p className="sub">Si te sigue interesando, contáctanos y te decimos si sigue libre.</p><Dudas /></Parar>;
    return (
      <Parar titulo="Esta carga ya no está disponible">
        <p className="sub">{oferta.asignada_en ? 'Se aceptó por un transportista el:' : 'La ha cogido otro transportista.'}</p>
        {oferta.asignada_en && <p className="tk-fecha-line">{creadoTxt(oferta.asignada_en)}</p>}
        <Dudas />
      </Parar>
    );
  }

  async function reservarla() {
    setTrabajando(true); setAviso(null);
    const x = await reservar(token);
    setTrabajando(false);
    if (x.resultado === 'reservada') { router.refresh(); return; }
    if (x.resultado === 'en_tramite' && x.hasta && x.ahora) { setTramite({ hasta: x.hasta, ahora: x.ahora }); return; }
    if (x.resultado === 'tomada' || x.resultado === 'enlace_no_valido') { router.refresh(); return; }
    setAviso('No se ha podido reservar. Vuelve a intentarlo.');
  }

  return (
    <div id="formScreen" className="show">
      <h1>Carga disponible</h1>
      <p className="sub">Oferta de <strong>Dynamo Operador de Transportes</strong>{oferta.para_transportista ? <> para <strong>{oferta.para_transportista}</strong></> : null}</p>
      {r === 'rechazada' && <div className="warn" style={{ display: 'block', marginBottom: '0.8rem' }}>Dynamo no ha aceptado el precio que propusiste. Si quieres, puedes aceptarla al precio de la oferta.</div>}
      {r === 'caducada' && <div className="warn" style={{ display: 'block', marginBottom: '0.8rem' }}>Se agotó el tiempo de tu reserva anterior. Si sigue libre, puedes volver a reservarla.</div>}
      <Oferta o={oferta} />
      <div className="pago-contado">Precio: <span className="imp">{euros(oferta.precio)}</span> <span className="base-nota">· base imponible (impuestos no incluidos)</span>
        {num(oferta.banda_euros) ? <div className="base-nota" style={{ marginTop: 2 }}>Puedes proponer otro precio entre {euros(num(oferta.precio)! - num(oferta.banda_euros)!)} y {euros(num(oferta.precio)! + num(oferta.banda_euros)!)}.</div> : null}
      </div>
      {(oferta.en_tramite || tramite) && <Tramite hasta={tramite?.hasta} ahora={tramite?.ahora} onLibre={() => { setTramite(null); router.refresh(); }} />}
      <button className="btn" onClick={reservarla} disabled={trabajando}>{trabajando ? 'Reservando…' : 'Reservar y aceptar esta carga'}</button>
      <p className="id-hint" style={{ textAlign: 'center', marginTop: '0.5rem' }}>Al pulsar, la carga queda <strong>reservada para ti {txtNum(oferta.reserva_minutos ?? 3)} minutos</strong> para que la aceptes; nadie más la puede coger mientras.</p>
      {aviso && <div className="warn" style={{ display: 'block' }}>{aviso}</div>}
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
      <div className="spin" /> <strong>Ahora está otro transportista reservando esta carga.</strong>{' '}
      {hasta ? <>Si no la acepta, queda libre en <strong>{texto}</strong>.</> : 'Vuelve a intentarlo en unos minutos.'}
    </div>
  );
}

// ---- Reservada: formulario para aceptar --------------------------------------------
function Reservada({ token, o, hasta, ahora }: { token: string; o: any; hasta: string; ahora: string }) {
  const router = useRouter();
  const { quedan, texto } = useCuenta(hasta, ahora);
  const base = num(o.precio) ?? 0, banda = num(o.banda_euros) ?? 0;
  const [cif, setCif] = useState('');
  const [contra, setContra] = useState(false);
  const [precio, setPrecio] = useState(base);
  const [veh, setVeh] = useState({ camion: '', remolque: '', conductor: '', telefono: '' });
  const [pronto, setPronto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  if (quedan === 0) {
    return (
      <Parar titulo="Se ha agotado el tiempo de reserva" ambar icono="!">
        <p className="sub">No se completó la aceptación a tiempo, así que la carga ha vuelto a quedar libre.</p>
        <button className="btn" onClick={() => router.refresh()}>Volver a comprobar disponibilidad</button>
      </Parar>
    );
  }
  const pct = num(o.pronto_pago_pct) ?? 3, minimo = num(o.pronto_pago_minimo) ?? 20;
  const precioFinal = contra ? precio : base;
  const dto = Math.max(Math.round(precioFinal * pct) / 100, minimo);

  async function aceptarla() {
    setError(null);
    if (!o.para_transportista && !cif.trim()) { setError('Escribe tu CIF / NIF para identificarte.'); return; }
    setTrabajando(true);
    const x = await aceptar(token, { cif, precio: contra && precio !== base ? precio : null, pronto_pago: pronto, ...veh });
    setTrabajando(false);
    if (x.resultado === 'aceptada' || x.resultado === 'pendiente_revision') { router.refresh(); return; }
    const msg: Record<string, string> = {
      transportista_no_encontrado: `No encontramos ese CIF en Dynamo. Revísalo, o contáctanos para darte de alta (solo trabajamos con transportistas de bolsas del grupo Alpega).${x.intentos_restantes != null ? ` Te quedan ${x.intentos_restantes} intento${x.intentos_restantes === 1 ? '' : 's'}.` : ''}`,
      demasiados_intentos: 'Demasiados intentos con CIF que no están en Dynamo: por seguridad, la reserva se ha liberado. Llámanos al +34 955 225 945 y te la asignamos.',
      falta_cif: 'Escribe tu CIF / NIF para identificarte.',
      transportista_no_activo: 'Tu ficha de transportista no está activa ahora mismo. Contáctanos.',
      precio_fuera_de_banda: `El precio tiene que estar entre ${euros(x.minimo)} y ${euros(x.maximo)}.`,
      reserva_caducada: 'Se ha agotado el tiempo de reserva.', tomada: 'La carga ya la ha cogido otro transportista.',
    };
    setError(msg[x.resultado] ?? x.error ?? 'No se ha podido aceptar. Vuelve a intentarlo.');
    if (x.resultado === 'reserva_caducada' || x.resultado === 'tomada' || x.resultado === 'demasiados_intentos') router.refresh();
  }

  return (
    <div id="formScreen" className="show">
      <h1>Pulsa el botón de abajo para aceptar la carga</h1>
      <p className="sub">Oferta de <strong>Dynamo Operador de Transportes</strong></p>
      <div className={`reserva-banner${quedan < 60000 ? ' urgent' : ''}`}>
        <span>Carga <strong>reservada para ti</strong>: nadie más la puede coger durante <span className="rb-timer">{texto}</span></span>
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
        <input type="tel" id="f-tfno" value={veh.telefono} placeholder="+34 600 000 000" inputMode="tel" onChange={(e) => setVeh({ ...veh, telefono: e.target.value })} />
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
      <button className="btn" onClick={aceptarla} disabled={trabajando}>{trabajando ? 'Aceptando…' : contra && precio !== base ? 'Proponer este precio y aceptar' : 'ACEPTAR carga'}</button>
      <button type="button" className="btn-sec" style={{ display: 'block', margin: '0.7rem auto 0', background: 'none', border: 'none', color: 'var(--gray-500)', fontWeight: 700, cursor: 'pointer' }}
        onClick={async () => { await liberar(token); router.refresh(); }}>No me interesa · dejarla libre ya</button>
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
  const [guardado, setGuardado] = useState<string | null>(null);
  const falta = !c.matricula_camion || !c.conductor_nombre || !c.conductor_telefono;
  const editable = ['programado', 'hacia_la_carga'].includes(c.estado);
  const pct = num(c.pronto_pago_pct) ?? 3, minimo = num(c.pronto_pago_minimo) ?? 20, precio = num(c.precio) ?? 0;
  const dto = Math.max(Math.round(precio * pct) / 100, minimo);
  return (
    <div className="ok-screen show">
      <h1 style={{ margin: 0 }}><span className="ok-aceptada">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        {c.estado === 'cancelado' ? ' Carga cancelada por el cliente' : ' ¡Carga aceptada!'}</span></h1>
      <p className="sub" style={{ marginTop: '0.4rem' }}>{c.transportista} · {c.aceptada_en ? creadoTxt(c.aceptada_en) : ''}</p>
      <div className="pago-contado" style={{ textAlign: 'left' }}>
        Precio acordado: <span className="imp">{euros(precio)}</span> <span className="base-nota">· base imponible</span>
        {c.pronto_pago && <div className="base-nota" style={{ marginTop: 2 }}>Con pronto pago: cobras {euros(precio - dto)} a {txtNum(c.pronto_pago_dias)} días de la factura.</div>}
      </div>
      <div className="pago-contado" style={{ background: 'rgba(51,0,204,0.06)', borderColor: 'rgba(51,0,204,0.28)', color: 'var(--navy)', fontWeight: 700, textAlign: 'left' }}>
        Aquí tienes la <strong>orden de carga</strong> con todos estos datos. Guarda esta página: siempre puedes volver a ella con el mismo enlace.
      </div>
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
            <div><label htmlFor="ok-tractora">Matrícula camión / tractora</label><input type="text" id="ok-tractora" value={veh.camion} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, camion: e.target.value })} /></div>
            <div><label htmlFor="ok-remolque">Matrícula remolque</label><input type="text" id="ok-remolque" value={veh.remolque} autoCapitalize="characters" onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
          </div>
          <label htmlFor="ok-chofer">Conductor</label><input type="text" id="ok-chofer" value={veh.conductor} onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} />
          <label htmlFor="ok-tfno">Teléfono del conductor</label><input type="tel" id="ok-tfno" value={veh.telefono} inputMode="tel" onChange={(e) => setVeh({ ...veh, telefono: e.target.value })} />
          <button className="btn" onClick={async () => { const x = await completar(token, veh); setGuardado(x.resultado === 'guardado' ? 'Guardado. Gracias.' : 'No se ha podido guardar; contáctanos.'); }}>Guardar vehículo y conductor</button>
          {guardado && <p className="id-hint" style={{ textAlign: 'center' }}>{guardado}</p>}
        </div>
      )}
      <Dudas />
    </div>
  );
}
