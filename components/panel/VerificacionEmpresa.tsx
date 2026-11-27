'use client';

// VERIFICACIÓN DE EMPRESA (usuario, 2026-11-26), lado del CLIENTE.
// · Aviso de arriba: solo si la empresa está sin verificar y tiene crédito esperándole
//   (check verde, sin importes ni nada de CESCE), o si ya ha pedido la verificación.
// · Tarjeta en Mi cuenta: el estado y el botón para verificar.
// · Ventana: dos vías (transferencia de 0,01 € con su código, o documento); el certificado
//   digital, más adelante. Las revisa Dynamo.
import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import Documentos from './Documentos';
import { fecha } from '@/lib/formato';
import { CONTACTO } from '@/lib/atencion';
import { useRefrescar } from '@/lib/useRefrescar';
import { miVerificacion, pedirVerificacion, type MiVerificacion } from '@/app/panel/(app)/verificacion/acciones';

const VIA: Record<string, string> = { transferencia: 'transferencia de 0,01 €', documento: 'documento', manual: 'comprobación de Dynamo', certificado: 'certificado digital' };

export function AvisoVerificacion({ avisoCredito, solicitada }: { avisoCredito: boolean; solicitada: string | null }) {
  const [abierta, setAbierta] = useState(false);
  if (solicitada) {
    return (
      <div className="pt-aviso info" id="aviso-verificacion-revision" style={{ marginBottom: '0.9rem' }}><div>
        <strong>Estamos revisando la verificación de tu empresa</strong> ({VIA[solicitada] ?? solicitada}). Te avisamos por email en cuanto esté. Mientras tanto, tus envíos se pagan por adelantado.
      </div></div>
    );
  }
  if (!avisoCredito) return null;
  return (
    <>
      <div className="pt-aviso ok" id="aviso-verificacion-credito" style={{ marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}><strong>✓ Tu empresa tiene crédito disponible para trabajar sin pagar por adelantado.</strong></div>
        <button type="button" className="btn-primary" id="btn-verificar-empresa" onClick={() => setAbierta(true)}>Verifica tu empresa para activarlo</button>
      </div>
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
      {!ok && <button type="button" className="btn-ghost account-edit" id="btn-abrir-verificacion" onClick={() => setAbierta(true)}>{v.solicitada ? 'Ver o cambiar la vía' : 'Verificar mi empresa'}</button>}
      {abierta && <VentanaVerificacion onCerrar={() => { setAbierta(false); cargar(); }} />}
    </div>
  );
}

export function VentanaVerificacion({ onCerrar }: { onCerrar: () => void }) {
  const refrescar = useRefrescar();
  const [v, setV] = useState<MiVerificacion | null>(null);
  const [via, setVia] = useState<'transferencia' | 'documento' | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  useEffect(() => { miVerificacion().then((x) => { setV(x); }).catch(() => setV(null)); }, []);

  async function pedir(m: 'transferencia' | 'documento') {
    setError(null); setTrabajando(true);
    const r = await pedirVerificacion(m).catch(() => ({ ok: false as const, error: 'No se ha podido enviar. Vuelve a intentarlo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setHecho(true); refrescar();
  }

  const caja: React.CSSProperties = { border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '0.8rem 0.95rem', textAlign: 'left', background: '#fff', cursor: 'pointer', width: '100%' };
  const fila = (k: string, val: React.ReactNode, id?: string) => (
    <div style={{ display: 'flex', gap: '0.6rem', padding: '0.3rem 0', borderBottom: '1px dashed var(--gray-200)' }}>
      <span style={{ flex: '0 0 7.5rem', color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>{k}</span>
      <strong id={id} style={{ wordBreak: 'break-all' }}>{val}</strong>
    </div>
  );

  return (
    <Modal abierto titulo="Verifica tu empresa" sub={v ? `${v.razon_social} · ${v.cif}` : undefined} onCerrar={onCerrar} ancho={620}>
      {!v ? <p>Cargando…</p> : hecho ? (
        <div className="pt-aviso ok" id="verificacion-enviada"><div>
          <strong>✓ Recibido.</strong> Lo revisamos y te avisamos por email. Mientras tanto sigues pudiendo pedir envíos con pago por adelantado.
        </div></div>
      ) : !via ? (
        <>
          <p style={{ marginTop: 0 }}>Se hace <strong>una sola vez</strong> y vale para todos los usuarios de tu empresa. Elige cómo:</p>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <button type="button" style={caja} id="via-transferencia" onClick={() => setVia('transferencia')}>
              <strong>Transferencia de 0,01 €</strong><br />
              <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-600)' }}>Desde la cuenta bancaria de la empresa, con un código en el concepto. La más rápida.</span>
            </button>
            <button type="button" style={caja} id="via-documento" onClick={() => setVia('documento')}>
              <strong>Subir un documento</strong><br />
              <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-600)' }}>La tarjeta del CIF o un documento oficial de la empresa. Lo revisa nuestro equipo y puede que te llamemos.</span>
            </button>
            <div style={{ ...caja, cursor: 'default', opacity: 0.6 }}>
              <strong>Certificado digital de la empresa</strong> <span className="badge badge-gray">Próximamente</span><br />
              <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-600)' }}>Con el certificado de representante de la empresa, al momento.</span>
            </div>
          </div>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginBottom: 0 }}>¿Prefieres hacerlo por teléfono? Llámanos al {CONTACTO.telefono}.</p>
        </>
      ) : via === 'transferencia' ? (
        <>
          <p style={{ marginTop: 0 }}>Haz una transferencia de <strong>0,01 €</strong> desde una <strong>cuenta bancaria a nombre de la empresa</strong> ({v.razon_social}) con estos datos:</p>
          {fila('Importe', '0,01 €')}
          {fila('Concepto', v.codigo, 'verificacion-codigo')}
          {fila('Beneficiario', v.banco.titular || 'Dynamo')}
          {v.banco.banco && fila('Banco', v.banco.banco)}
          {v.banco.iban ? fila('IBAN', v.banco.iban) : fila('IBAN', <>Pídenoslo al {CONTACTO.telefono}</>)}
          {v.banco.bic && fila('BIC', v.banco.bic)}
          <div className="pt-aviso" style={{ margin: '0.8rem 0', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.45)', color: '#7a5c00' }}><div>
            Pon <strong>solo el código</strong> en el concepto. El céntimo es <strong>a fondo perdido: no se devuelve</strong>. Comprobamos que el código coincide y que quien envía es {v.razon_social}: si todo cuadra, tu empresa queda verificada sola, normalmente en 1 o 2 días laborables (lo que tarda en llegarnos el movimiento del banco).
          </div></div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" id="btn-transferencia-hecha" disabled={trabajando} onClick={() => pedir('transferencia')}>{trabajando ? 'Enviando…' : 'Ya la he hecho'}</button>
            <button type="button" className="btn-ghost" onClick={() => setVia(null)}>Volver</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>Sube la <strong>tarjeta del CIF</strong> u otro documento oficial donde se vean la razón social y el CIF (PDF o foto). Lo revisamos a mano; puede que te llamemos para confirmarlo.</p>
          {/* El documento va a nombre de quien lo sube (como en el alta); Dynamo lo ve en la ficha de la empresa. */}
          <Documentos dueno={{ campo: 'usuario_id', id: v.usuario_id }} tipos={['hoja_cif']} sinQuitar />
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" id="btn-documento-enviar" disabled={trabajando} onClick={() => pedir('documento')}>{trabajando ? 'Enviando…' : 'Enviar para revisar'}</button>
            <button type="button" className="btn-ghost" onClick={() => setVia(null)}>Volver</button>
          </div>
        </>
      )}
      {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {error}</div>}
    </Modal>
  );
}
