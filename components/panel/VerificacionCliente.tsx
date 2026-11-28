'use client';

// VERIFICACIÓN DE EMPRESA en la ficha del cliente, para DYNAMO (usuario, 2026-11-26).
// Sin verificar, su crédito es 0 (pago previo siempre), tenga lo que tenga en CESCE o a mano.
// Aquí se ve si lo está, cómo, quién y por qué; la petición del cliente (con su código de
// transferencia); el resultado de CESCE; los documentos que han subido; y el registro.
// Verificar, rechazar y quitar piden motivo y la contraseña.
import { useCallback, useEffect, useState } from 'react';
import Documentos from './Documentos';
import { fecha, fechaHora } from '@/lib/formato';
import { verificacionDeCliente, verificarEmpresa, rechazarVerificacion, quitarVerificacion, type VerificacionCliente as Datos } from '@/app/panel/(app)/verificacion/acciones';

const VIA: Record<string, string> = { transferencia: 'Transferencia de 0,01 €', documento: 'Documento', manual: 'A mano (Dynamo)', certificado: 'Certificado digital' };
const ACCION: Record<string, string> = { solicitud: 'Pedida por el cliente', verificada: 'Verificada', rechazada: 'Rechazada', retirada: 'Verificación quitada' };
const CESCE: Record<string, string> = { sin_consultar: 'Sin consultar', positivo: 'Positivo', cero: 'Cero', denegado: 'Denegado' };

export default function VerificacionCliente({ clienteId, editable }: { clienteId: string; editable: boolean }) {
  const [d, setD] = useState<Datos | null | undefined>(undefined);
  const [que, setQue] = useState<null | 'verificar' | 'rechazar' | 'quitar'>(null);
  const [metodo, setMetodo] = useState<'transferencia' | 'documento' | 'manual'>('manual');
  const [motivo, setMotivo] = useState(''); const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const cargar = useCallback(() => { verificacionDeCliente(clienteId).then(setD).catch(() => setD(null)); }, [clienteId]);
  useEffect(() => { cargar(); }, [cargar]);

  function abrir(q: 'verificar' | 'rechazar' | 'quitar') {
    setQue(q); setMotivo(''); setClave(''); setAviso(null);
    if (q === 'verificar') setMetodo(d?.solicitada === 'transferencia' || d?.solicitada === 'documento' ? d.solicitada : 'manual');
  }
  async function hacer() {
    setTrabajando(true); setAviso(null);
    const r = que === 'verificar' ? await verificarEmpresa(clienteId, metodo, motivo, clave)
      : que === 'rechazar' ? await rechazarVerificacion(clienteId, motivo, clave)
      : await quitarVerificacion(clienteId, motivo, clave);
    setTrabajando(false);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: que === 'verificar' ? '✓ Empresa verificada: su crédito ya cuenta.' : que === 'rechazar' ? '✓ Petición rechazada; se le ha avisado por email.' : '✓ Verificación quitada: desde ahora, pago previo.' });
    setQue(null); cargar();
  }

  if (d === undefined) return <div className="meta" style={{ gridColumn: '1/-1' }}>Cargando la verificación…</div>;
  if (d === null) return null;
  const ok = d.estado === 'verificada';
  return (
    <div style={{ gridColumn: '1/-1', border: `1.5px solid ${ok ? '#86efac' : '#fcd34d'}`, borderRadius: 12, padding: '0.8rem 0.95rem', background: ok ? 'rgba(22,163,74,0.05)' : 'rgba(245,158,11,0.06)' }} id="cli-verificacion">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <strong>Verificación de la empresa</strong>
        {ok ? <span className="badge badge-green" id="cli-verificacion-estado">✓ Verificada</span> : <span className="badge badge-orange" id="cli-verificacion-estado">Sin verificar · crédito 0</span>}
        {!ok && d.solicitada && <span className="badge badge-blue">Pide verificar: {VIA[d.solicitada]}{d.solicitada_en ? ` · ${fechaHora(d.solicitada_en)}` : ''}</span>}
      </div>
      <div className="meta" style={{ marginTop: '0.35rem' }}>
        {ok ? <>{VIA[d.metodo ?? ''] ?? d.metodo}{d.verificada_en ? ` · ${fecha(d.verificada_en)}` : ''}{d.verificada_por ? ` · por ${d.verificada_por}` : ''}{d.motivo ? ` · «${d.motivo}»` : ''}</>
          : <>Sin verificar, todos sus envíos van con <strong>pago previo</strong> aunque tenga crédito de CESCE o de Dynamo.{d.motivo ? ` Último motivo: «${d.motivo}».` : ''}</>}
      </div>
      <div className="meta" style={{ marginTop: '0.2rem' }}>
        Concepto de la transferencia de 0,01 €: <strong>su CIF</strong> (o el código <strong id="cli-verificacion-codigo">{d.codigo}</strong>) · CESCE: <strong>{CESCE[d.cesce] ?? d.cesce}</strong>{d.cesce_en ? ` (${fecha(d.cesce_en)})` : ''}
      </div>
      {d.conDocumentos.length > 0 && (
        <div style={{ marginTop: '0.6rem' }}>
          <div className="meta" style={{ fontWeight: 700 }}>Documentos que ha subido la empresa</div>
          {d.conDocumentos.map((u) => (
            <div key={u.id} style={{ marginTop: '0.3rem' }}>
              <div className="meta">{u.nombre}</div>
              <Documentos dueno={{ campo: 'usuario_id', id: u.id }} tipos={['hoja_cif', 'dni']} editable={false} />
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
          {!ok && <button type="button" className="btn-primary" id="btn-cli-verificar" onClick={() => abrir('verificar')}>Verificar empresa</button>}
          {!ok && d.solicitada && <button type="button" className="btn-ghost" id="btn-cli-rechazar" onClick={() => abrir('rechazar')}>Rechazar la petición</button>}
          {ok && <button type="button" className="btn-ghost" id="btn-cli-quitar-verificacion" style={{ color: 'var(--red)' }} onClick={() => abrir('quitar')}>Quitar la verificación</button>}
        </div>
      )}
      {que && (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.5rem', maxWidth: 520 }}>
          {que === 'verificar' && (
            <label className="meta">Cómo se ha comprobado
              <select id="cli-verificar-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }}>
                <option value="transferencia">Transferencia de 0,01 € (código y ordenante comprobados)</option>
                <option value="documento">Documento revisado</option>
                <option value="manual">A mano: llamada, cliente conocido, comprobación…</option>
              </select>
            </label>
          )}
          <label className="meta">{que === 'verificar' ? 'Qué has comprobado (queda en el registro)' : 'Motivo (queda en el registro)'}
            <textarea id="cli-verificar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <label className="meta">Tu contraseña
            <input id="cli-verificar-clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" id="btn-cli-verificar-confirmar" disabled={trabajando} onClick={hacer}>{trabajando ? 'Guardando…' : que === 'verificar' ? 'Verificar' : que === 'rechazar' ? 'Rechazar' : 'Quitar la verificación'}</button>
            <button type="button" className="btn-ghost" onClick={() => setQue(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
      {d.registro.length > 0 && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary className="meta" style={{ cursor: 'pointer' }}>Registro ({d.registro.length})</summary>
          <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
            {d.registro.map((r, i) => (
              <li key={i} className="meta">{fechaHora(r.creado_en)} · {ACCION[r.accion] ?? r.accion}{r.metodo ? ` (${VIA[r.metodo] ?? r.metodo})` : ''}{r.quien ? ` · ${r.quien}` : ''}{r.motivo ? ` · «${r.motivo}»` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
