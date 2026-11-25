'use client';

// La página pública de pago: lo mínimo de un envío pendiente de pago y cómo pagarlo. Mismas
// piezas que la caja de pago de la ficha del cliente (cuenta atrás, «Pagar con tarjeta» en la
// ventana de Stripe, «Ya he hecho la transferencia»), sin nada más de la plataforma.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { euros, fechaHora, metros, pesoTn, ventana } from '@/lib/formato';
import { paisDe } from '@/lib/paises';
import { CONTACTO } from '@/lib/atencion';
import CuentaAtras from '@/components/panel/CuentaAtras';
import EtiquetaParada from '@/components/panel/EtiquetaParada';
import PagoTarjeta from '@/components/panel/PagoTarjeta';
import Cargando from '@/components/Cargando';
import { avisarTransferenciaPublica } from './acciones';
import type { PagoPublicoDatos } from './tipos';

const Marco = ({ children }: { children: React.ReactNode }) => (
  <div className="pago-pub">
    <div className="pago-pub-caja">
      <div className="pago-pub-cab"><img src="/images/4.png" alt="Dynamo" /><span className="notranslate" translate="no">ALWAYS MOVING</span></div>
      <div className="pago-pub-cuerpo">{children}</div>
    </div>
  </div>
);

function Estado({ color, titulo, children, id }: { color: string; titulo: string; children: React.ReactNode; id: string }) {
  return (
    <Marco>
      <div className="pago-pub-estado" id={id}>
        <span className="ico" style={{ background: `${color}1a`, color }} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d={color === '#0f6b3a' ? 'M8 12.5l2.7 2.7L16 9.5' : 'M12 8v5M12 16.5v.01'} /></svg>
        </span>
        <h1>{titulo}</h1>
        <p>{children}</p>
      </div>
    </Marco>
  );
}

export default function PagoPublico({ token, datos, conTarjeta, vuelta }: { token: string; datos: PagoPublicoDatos; conTarjeta: boolean; vuelta: 'ok' | 'cancelado' | null }) {
  const router = useRouter();
  const [pregunta, setPregunta] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; txt: string } | null>(null);
  // Se pone al día solo (el pago con tarjeta se confirma en unos segundos; la transferencia, cuando Dynamo la valida).
  const pendiente = datos.resultado === 'pendiente';
  useEffect(() => {
    if (!pendiente) return;
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, vuelta === 'ok' ? 4000 : 20000);
    return () => clearInterval(t);
  }, [pendiente, vuelta, router]);

  const ref = datos.referencia ? <span className="notranslate" translate="no">#{datos.referencia}</span> : null;
  const contacto = <>Si tienes dudas, escríbenos a <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a> o llama al <a href={`tel:${CONTACTO.telefono.replace(/\s/g, '')}`}>{CONTACTO.telefono}</a>.</>;
  if (datos.resultado === 'pagado') return <Estado id="pago-pub-pagado" color="#0f6b3a" titulo="Envío pagado">El pago del envío {ref} ya está recibido. Gracias. No hay que hacer nada más.</Estado>;
  if (datos.resultado === 'anulado') return <Estado id="pago-pub-anulado" color="#b42318" titulo="Este envío está anulado">El envío {ref} ya no está pendiente de pago: se anuló. Si todavía hace falta, hay que crearlo de nuevo en la plataforma. {contacto}</Estado>;
  if (datos.resultado === 'no_disponible') return <Estado id="pago-pub-no" color="#b45309" titulo="Ahora no se puede pagar desde aquí">El envío {ref} no está pendiente de pago en este momento. {contacto}</Estado>;
  if (datos.resultado === 'mantenimiento') return <Estado id="pago-pub-mant" color="#b45309" titulo="Plataforma en mantenimiento">Vuelve a abrir este enlace dentro de un rato. {contacto}</Estado>;
  if (datos.resultado !== 'pendiente') return <Estado id="pago-pub-mal" color="#b42318" titulo="Enlace de pago no válido">Comprueba que el enlace está entero (cópialo otra vez del email). {contacto}</Estado>;

  const aCuenta = Number(datos.a_cuenta ?? 0), resto = aCuenta > 0;
  const total = euros(Number(datos.pendiente ?? datos.total ?? 0));
  const avisado = datos.avisado_en ?? null;
  const tarjeta = conTarjeta && !avisado;
  const conAvisar = !avisado && !pregunta;
  const nBotones = (tarjeta ? 1 : 0) + (conAvisar ? 1 : 0);
  const t = datos.transferencia ?? null;
  const merc = [datos.metros_lineales != null && metros(datos.metros_lineales), datos.toneladas != null && pesoTn(datos.toneladas),
    datos.descripcion_mercancia || (datos.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');
  async function avisar() {
    setAvisando(true); setRes(null);
    const r = await avisarTransferenciaPublica(token).catch(() => ({ ok: false as const, error: 'Sin conexión. Prueba otra vez en un momento.' }));
    setAvisando(false); setPregunta(false);
    setRes({ ok: r.ok, txt: r.ok ? r.aviso : r.error });
    if (r.ok) router.refresh();
  }
  return (
    <Marco>
      <h1>Pago del envío {ref}</h1>
      <p className="pago-pub-sub">{datos.cliente ? <>Envío de <strong className="notranslate" translate="no">{datos.cliente}</strong> con Dynamo.</> : 'Envío con Dynamo.'}</p>
      <div className="modal-warn-box" id="pago-pub-caja" style={{ marginBottom: 0 }}>
        {vuelta === 'ok' && <div id="pago-pub-hecho" style={{ color: '#0f6b3a', fontWeight: 800, marginBottom: '0.4rem' }}>Pago con tarjeta hecho. En unos segundos se confirma aquí.</div>}
        {vuelta === 'cancelado' && <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Has salido del pago con tarjeta sin pagar. Puedes intentarlo de nuevo o pagar por transferencia.</div>}
        <div className="pago-cli-cab"><strong style={{ color: '#b42318' }}>{resto ? 'Falta por pagar' : 'Pendiente de pago'} · {total}</strong> <span className="pago-cli-iva">(IVA incl.)</span></div>
        {resto && <div style={{ marginTop: '0.3rem' }}>Ya hay pagados <strong>{euros(aCuenta)}</strong> y el envío cuesta ahora <strong>{euros(Number(datos.total))}</strong>: falta la diferencia.</div>}
        {avisado ? (
          <div id="pago-avisado" className="pago-avisado" role="status">
            <span className="pa-ico" aria-hidden="true">✓</span>
            <span><strong>Transferencia avisada el {fechaHora(avisado)}. La estamos validando.</strong> El plazo para pagar está <strong>parado</strong>: el envío no se anula mientras comprobamos el cobro en el banco.</span>
          </div>
        ) : datos.pago_limite && (
          <div id="pago-plazo">
            <CuentaAtras grande hasta={datos.pago_limite} vencidoTxt="Plazo vencido: el envío se anula en breve" />
            <div className="pago-cli-limite">Hay que pagar antes del <strong>{fechaHora(datos.pago_limite)}</strong>. Si no, el envío se anula solo.</div>
          </div>
        )}
        {nBotones > 0 && (
          <div className={`pago-cli-botones${nBotones % 2 ? ' impar' : ''}`}>
            {tarjeta && <PagoTarjeta envioId="" token={token} id="pago-tarjeta" texto="Pagar con tarjeta" />}
            {conAvisar && <button type="button" id="pago-avisar" className={tarjeta ? 'btn-secondary' : 'btn-primary'} onClick={() => { setRes(null); setPregunta(true); }}>Ya he hecho la transferencia</button>}
          </div>
        )}
        {pregunta && !avisado && (
          <div id="pago-avisar-confirmar" style={{ marginTop: '0.6rem', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
            <strong>¿Ya está hecha la transferencia de {total}?</strong>
            <div style={{ marginTop: '0.25rem' }}>Pulsa «Sí» solo si ya está hecha, con el concepto <strong>PRO-{datos.referencia}</strong>. Paramos el plazo y lo comprobamos en el banco; si no nos consta, el envío se anula.</div>
            <div id="pago-avisar-fechas" style={{ marginTop: '0.35rem' }}>Una transferencia puede tardar <strong>hasta el día siguiente</strong> en llegarnos. Las fechas de recogida cuentan <strong>desde que validamos el pago</strong>: si llega más tarde, se recalculan y pueden cambiar respecto a las indicadas.</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={avisando} onClick={avisar}>Sí, ya está hecha: validadla</button>
              <button type="button" className="btn-ghost" disabled={avisando} onClick={() => setPregunta(false)}>Todavía no</button>
            </div>
          </div>
        )}
        {res && (!res.ok || !!avisado) && <div className={res.ok ? 'pt-aviso info' : 'wiz-warn show'} role="status" style={{ marginTop: '0.5rem' }}><div>{res.ok ? res.txt : `⚠ ${res.txt}`}</div></div>}
        {avisando && <Cargando texto="Enviando el aviso" />}
        {t && !avisado && (
          <div className="pago-pub-transf" id="pago-pub-transferencia">
            <span>Por <strong>transferencia</strong>, a esta cuenta y con este concepto:</span>
            {t.beneficiario && <span>Beneficiario: <strong className="notranslate" translate="no">{t.beneficiario}</strong></span>}
            <span>IBAN: <strong className="notranslate" translate="no">{t.iban}</strong>{t.banco ? ` · ${t.banco}` : ''}{t.bic ? ` · BIC ${t.bic}` : ''}</span>
            <span>Concepto: <strong className="notranslate" translate="no">{t.concepto}</strong> · Importe: <strong>{total}</strong></span>
          </div>
        )}
      </div>

      <div className="pago-pub-datos" id="pago-pub-datos">
        <div className="pen-sum-row"><span className="k">Fecha de carga</span><span className="v" style={{ color: 'var(--orange)', fontWeight: 800 }}>{ventana(datos.fecha_carga_desde, datos.fecha_carga_hasta) || '—'}</span></div>
        {(datos.paradas ?? []).map((p) => (
          <div key={p.num} className="pen-sum-row" data-parada={p.num}>
            <span className="k"><EtiquetaParada num={p.num} tipo={p.tipo} /></span>
            <span className="v">{[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe((p.pais ?? 'ES').toUpperCase())].filter(Boolean).join(', ') || '—'}
              {p.prevista && <div className="meta fecha-parada" style={{ marginTop: '0.1rem' }}>Prevista: <strong style={{ color: 'var(--navy)' }}>{fechaHora(p.prevista)}</strong></div>}</span>
          </div>
        ))}
        <div className="pen-sum-row"><span className="k">Mercancía</span><span className="v">{merc || '—'}</span></div>
        <div className="pen-sum-row"><span className="k">Precio (sin IVA)</span><span className="v">{euros(Number(datos.base ?? 0))}</span></div>
        <div className="pen-sum-row"><span className="k">Total con IVA ({String(Number(datos.iva_pct ?? 21)).replace('.', ',')} %)</span><span className="v">{euros(Number(datos.total ?? 0))}</span></div>
      </div>
      <p className="pago-pub-pie">Pago seguro: la tarjeta se introduce en la ventana de Stripe; Dynamo no ve ni guarda sus datos. Este enlace solo sirve para pagar este envío. {contacto}</p>
    </Marco>
  );
}
