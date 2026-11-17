'use client';

// Las 6 cajitas del código, COMPARTIDAS por el alta y por «¿Olvidaste tu contraseña?»
// (usuario, 2026-11-11: «doble vía para garantizar servicio» — el enlace a veces lo
// quema el escáner del correo; el código tecleado es inmune). Avanza sola al escribir,
// retrocede con la tecla de borrar y reparte lo que se pega. Al completar las 6 cifras se
// comprueba solo, sin pulsar el botón. Debajo, «Reenviar código»
// con cuenta atrás. Las acciones (comprobar y reenviar) las pone cada flujo.
import { useActionState, useEffect, useRef, useState } from 'react';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';
import CajasCodigo, { SIN_CIFRAS } from '@/components/CajasCodigo';

export type EstadoOtp = { error: string | null; reenviado?: boolean };
type Accion = (prev: EstadoOtp, f: FormData) => Promise<EstadoOtp>;

export default function CodigoOtp({ email, comprobar, reenviar: reenviarAccion }: { email: string; comprobar: Accion; reenviar: Accion }) {
  const [estado, accion, comprobando] = useActionState(comprobar, { error: null } as EstadoOtp);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarAccion, { error: null } as EstadoOtp);
  const [cifras, setCifras] = useState<string[]>(SIN_CIFRAS);
  const [espera, setEspera] = useState(60);
  const cajas = useRef<(HTMLInputElement | null)[]>([]);
  const formulario = useRef<HTMLFormElement>(null);
  const enviado = useRef('');   // el último código que se mandó solo (para no mandarlo dos veces)

  useEffect(() => { cajas.current[0]?.focus(); }, []);
  useEffect(() => { if (reenvio.reenviado) setEspera(60); }, [reenvio]);
  // Código erróneo o caducado: las cajitas se VACÍAN y el foco vuelve a la primera
  // (usuario, 2026-11-13) — dejar el código malo puesto solo invitaba a re-verificarlo.
  useEffect(() => {
    if (estado.error) { setCifras(SIN_CIFRAS); cajas.current[0]?.focus(); }
  }, [estado]);
  // AL COMPLETAR LAS 6 CIFRAS, ENTRA SOLO (usuario, 2026-11-17): tecleando la última o
  // pegando el código entero, sin tener que pulsar el botón. El botón sigue ahí por si
  // acaso. Si el código falla, las cajitas se vacían y se puede volver a intentar.
  useEffect(() => {
    const codigo = cifras.join('');
    if (codigo.length < 6) { enviado.current = ''; return; }
    if (comprobando || enviado.current === codigo) return;
    enviado.current = codigo;
    formulario.current?.requestSubmit();
  }, [cifras, comprobando]);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  return (
    <>
      <form ref={formulario} action={accion} noValidate>
        {comprobando && <Cargando texto="Comprobando el código" />}
        {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="codigo" value={cifras.join('')} />
        <CajasCodigo cifras={cifras} setCifras={setCifras} cajas={cajas} bloqueado={comprobando} />
        <button type="submit" className="portal-submit" disabled={comprobando}>{comprobando ? 'Comprobando…' : 'Verificar y continuar'}</button>
      </form>
      <form action={reenviar} style={{ textAlign: 'center', marginTop: '0.8rem' }}>
        <input type="hidden" name="email" value={email} />
        {reenvio.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{reenvio.error}</div></div>}
        {reenvio.reenviado && !reenvio.error && <p className="reg-helper">Te hemos enviado otro código. Mira también en spam.</p>}
        <button type="submit" className="otp-reenviar" disabled={espera > 0 || reenviando}>
          {espera > 0 ? `Reenviar código en ${espera} s` : reenviando ? 'Enviando…' : 'Reenviar código'}
        </button>
      </form>
    </>
  );
}
