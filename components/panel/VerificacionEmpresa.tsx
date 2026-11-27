'use client';

// VERIFICACIÓN DE EMPRESA (usuario, 2026-11-26), lado del CLIENTE.
// · Aviso de arriba: solo si la empresa está sin verificar y tiene crédito esperándole
//   (check verde, sin importes ni nada de CESCE), o si ya ha pedido la verificación.
// · Tarjeta en Mi cuenta: el estado y el botón para verificar.
// · Ventana: SOLO la transferencia de 0,01 € con su código (usuario, 2026-11-27: «una tarjeta del CIF
//   la puede tener cualquiera»; ni documento ni certificado). Lo que no encaje, por teléfono: Dynamo
//   la verifica a mano. Con la transferencia ya avisada, no se vuelve a pedir.
import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import Tip from '@/components/Tip';
import BotonCopiar from '@/components/BotonCopiar';
import { fecha } from '@/lib/formato';
import { CONTACTO } from '@/lib/atencion';
import { useRefrescar } from '@/lib/useRefrescar';
import { miVerificacion, pedirVerificacion, type MiVerificacion } from '@/app/panel/(app)/verificacion/acciones';

const VIA: Record<string, string> = { transferencia: 'transferencia de 0,01 €', documento: 'documento', manual: 'comprobación de Dynamo', certificado: 'certificado digital' };

export function AvisoVerificacion({ avisoCredito, solicitada }: { avisoCredito: boolean; solicitada: string | null }) {
  const [abierta, setAbierta] = useState(false);
  if (solicitada === 'transferencia') {
    return (
      <div className="pt-aviso info" id="aviso-verificacion-revision" style={{ marginBottom: '0.9rem' }}><div>
        <strong>Estamos revisando la verificación de tu empresa</strong> ({VIA[solicitada] ?? solicitada}). Te avisamos por email en cuanto esté. Mientras tanto, tus envíos se pagan por adelantado.
      </div></div>
    );
  }
  // Con crédito esperándole: verde, «verifica para activarlo». Sin crédito (CESCE dio 0 o aún no
  // hay): azul, sin prometer crédito ni decir que se denegó (usuario, 2026-11-27).
  return (
    <>
      {avisoCredito ? (
        <div className="pt-aviso ok" id="aviso-verificacion-credito" style={{ marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}><strong>✓ Tu empresa tiene crédito disponible para trabajar sin pagar por adelantado.</strong></div>
          <button type="button" className="btn-primary" id="btn-verificar-empresa" onClick={() => setAbierta(true)}>Verifica tu empresa para activarlo</button>
        </div>
      ) : (
        <div className="pt-aviso info" id="aviso-verificacion-sin-credito" style={{ marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}><strong>Tu empresa aún está sin verificar.</strong> De momento tus envíos se pagan por adelantado (tarjeta o transferencia). Verifícala una sola vez para que podamos estudiar trabajar contigo a crédito y pagar a 30 días.</div>
          <button type="button" className="btn-primary" id="btn-verificar-empresa" onClick={() => setAbierta(true)}>Verificar mi empresa</button>
        </div>
      )}
      {abierta && <VentanaVerificacion onCerrar={() => setAbierta(false)} />}
    </>
  );
}

export function TarjetaVerificacion() {
  const [v, setV] = useState<MiVerificacion | null | undefined>(undefined);
  const [abierta, setAbierta] = useState(false);
  const cargar = useCallback(() => { miVerificacion().then(setV).catch(() => setV(null)); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!v) return null;
  const ok = v.estado === 'verificada';
  return (
    <div className="account-card" id="tarjeta-verificacion">
      <h3 className="account-card-title">Verificación de la empresa</h3>
      {ok ? (
        <p className="account-card-desc"><span className="badge badge-green">✓ Empresa verificada</span>{v.verificada_en ? <> el {fecha(v.verificada_en)}</> : null}{v.metodo ? <> · por {VIA[v.metodo] ?? v.metodo}</> : null}.</p>
      ) : v.solicitada ? (
        <p className="account-card-desc"><span className="badge badge-orange">En revisión</span> Has pedido la verificación por {VIA[v.solicitada] ?? v.solicitada}{v.solicitada_en ? <> el {fecha(v.solicitada_en)}</> : null}. Te avisamos por email.</p>
      ) : (
        <p className="account-card-desc"><span className="badge badge-gray">Sin verificar</span> Puedes pedir envíos con <strong>pago por adelantado</strong> (tarjeta o transferencia). Verifica tu empresa una sola vez para poder trabajar <strong>a crédito</strong>; vale para todos los usuarios de tu empresa.</p>
      )}
      {!ok && <button type="button" className="btn-ghost account-edit" id="btn-abrir-verificacion" onClick={() => setAbierta(true)}>{v.solicitada === 'transferencia' ? 'Ver mi petición' : 'Verificar mi empresa'}</button>}
      {abierta && <VentanaVerificacion onCerrar={() => { setAbierta(false); cargar(); }} />}
    </div>
  );
}

export function VentanaVerificacion({ onCerrar }: { onCerrar: () => void }) {
  const refrescar = useRefrescar();
  const [v, setV] = useState<MiVerificacion | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  useEffect(() => { miVerificacion().then((x) => { setV(x); }).catch(() => setV(null)); }, []);

  async function pedir() {
    setError(null); setTrabajando(true);
    const r = await pedirVerificacion('transferencia').catch(() => ({ ok: false as const, error: 'No se ha podido enviar. Vuelve a intentarlo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setHecho(true); refrescar();
  }

  // Cada dato con su botón de copiar (usuario, 2026-11-27).
  const fila = (k: string, val: React.ReactNode, id?: string, copia?: string) => (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px dashed var(--gray-200)' }}>
      <span style={{ flex: '0 0 6.5rem', color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>{k}</span>
      <strong id={id} style={{ wordBreak: 'break-all', flex: '1 1 auto' }}>{val}</strong>
      {copia && <BotonCopiar texto={copia} que={k.toLowerCase()} id={id ? `copiar-${id}` : undefined} />}
    </div>
  );

  // Los datos de la transferencia (para hacerla, o para verlos otra vez si ya está pedida).
  const datosTransferencia = (v: MiVerificacion) => (<>
    {fila('Importe', <>0,01 € <Tip id="tip-centimo" aria="Cómo hacer la transferencia" texto="Pon solo el código en el concepto. El céntimo es a fondo perdido: no se devuelve." /></>)}
    {fila('Concepto', v.codigo, 'verificacion-codigo', v.codigo)}
    {fila('Beneficiario', v.banco.titular || 'Dynamo', 'verificacion-beneficiario', v.banco.titular || 'Dynamo')}
    {v.banco.banco && fila('Banco', v.banco.banco, 'verificacion-banco', v.banco.banco)}
    {v.banco.iban ? fila('IBAN', v.banco.iban, 'verificacion-iban', v.banco.iban.replace(/\s+/g, '')) : fila('IBAN', <>Pídenoslo al {CONTACTO.telefono}</>)}
    {v.banco.bic && fila('BIC', v.banco.bic, 'verificacion-bic', v.banco.bic)}
    <div style={{ marginTop: '0.55rem' }}>
      <BotonCopiar id="copiar-verificacion-todo" conTexto que="todos los datos" texto={[
        'Importe: 0,01 €', `Concepto: ${v.codigo}`, `Beneficiario: ${v.banco.titular || 'Dynamo'}`,
        v.banco.banco ? `Banco: ${v.banco.banco}` : '', v.banco.iban ? `IBAN: ${v.banco.iban.replace(/\s+/g, '')}` : '', v.banco.bic ? `BIC: ${v.banco.bic}` : '',
      ].filter(Boolean).join('\n')} />
    </div>
  </>);

  return (
    <Modal abierto titulo="Verifica tu empresa" sub={v ? `${v.razon_social} · ${v.cif}` : undefined} onCerrar={onCerrar} ancho={620}>
      {!v ? <p>Cargando…</p> : hecho ? (
        <div className="pt-aviso ok" id="verificacion-enviada"><div>
          <strong>✓ Recibido.</strong> Lo revisamos y te avisamos por email. Mientras tanto sigues pudiendo pedir envíos con pago por adelantado.
        </div></div>
      ) : v.solicitada === 'transferencia' ? (
        // UNA SOLA PETICIÓN A LA VEZ (usuario, 2026-11-27): ya pedida, no se ofrece otra vía (la
        // nueva pisaba a la anterior). Se puede volver a pedir si Dynamo la rechaza. Una petición antigua
        // por documento no cuenta: se le ofrece la transferencia.
        <>
          <div className="pt-aviso info" id="verificacion-ya-pedida" style={{ marginTop: 0 }}><div>
            <strong>Ya nos has pedido verificar tu empresa</strong> por {VIA[v.solicitada] ?? v.solicitada}{v.solicitada_en ? <> el {fecha(v.solicitada_en)}</> : null}. La estamos revisando y te avisamos por email: no hace falta pedirlo otra vez.
          </div></div>
          <p style={{ margin: '0.8rem 0 0.3rem' }}>Los datos de la transferencia, por si los necesitas:</p>
          {datosTransferencia(v)}
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginBottom: 0 }}>¿La necesitas ya o quieres cambiar algo? Llámanos al {CONTACTO.telefono}.</p>
          <div style={{ marginTop: '0.8rem' }}><button type="button" className="btn-ghost" onClick={onCerrar}>Cerrar</button></div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>Se hace <strong>una sola vez</strong> y vale para todos los usuarios de tu empresa. Haz una transferencia de <strong>0,01 €</strong> desde una <strong>cuenta bancaria a nombre de la empresa</strong> ({v.razon_social}) con estos datos:</p>
          {datosTransferencia(v)}
          <div className="pt-aviso" style={{ margin: '0.8rem 0', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.45)', color: '#7a5c00' }}><div>
            Comprobamos que el código coincide y que quien envía es {v.razon_social}: si todo cuadra, tu empresa queda verificada sola en <strong>24 horas como máximo</strong> (normalmente, antes). ¿La necesitas ya? Llámanos al {CONTACTO.telefono}: lo comprobamos con el banco y la activamos al momento.
          </div></div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" id="btn-transferencia-hecha" disabled={trabajando} onClick={pedir}>{trabajando ? 'Enviando…' : 'Ya la he hecho'}</button>
          </div>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginBottom: 0 }}>¿Tienes dudas o no puedes hacer la transferencia? Llámanos al {CONTACTO.telefono}.</p>
        </>
      )}
      {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {error}</div>}
    </Modal>
  );
}
