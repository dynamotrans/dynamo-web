'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { buscarPorCodigo, type EstadoCodigo } from './acciones';
import Turnstile from '@/components/Turnstile';
import CajasCodigo, { SIN_CIFRAS } from '@/components/CajasCodigo';
import { CONTACTO } from '@/lib/atencion';

// El código de la carga, en las mismas 6 cajitas que el código de recuperar la contraseña:
// solo cifras y nunca más de seis. Al completar la sexta ENTRA: pasa a la pantalla de
// comprobación (la rueda girando) y es ahí donde se sabe el resultado — si la carga está
// libre, sigue sola a su pantalla; si no, lo dice ahí mismo, con un botón para probar con
// otro código (usuario, 2026-11-17: «que deje entrar y dentro salga el verificador, no
// frenar antes»). El formulario no se desmonta nunca: solo se esconde, porque dentro vive
// el captcha.
export default function CodigoCarga() {
  const [estado, accion, comprobando] = useActionState(buscarPorCodigo, { error: null } as EstadoCodigo);
  const [cifras, setCifras] = useState<string[]>(SIN_CIFRAS);
  const [intento, setIntento] = useState(0);   // cada respuesta pide una comprobación nueva del captcha
  const [tic, setTic] = useState(0);           // para volver a mirar si el captcha ya ha terminado
  const cajas = useRef<(HTMLInputElement | null)[]>([]);
  const formulario = useRef<HTMLFormElement>(null);
  const enviado = useRef('');                  // el último código que se mandó solo (para no mandarlo dos veces)
  const esperando = useRef(0);                 // cuántas veces se ha esperado al captcha con este código

  const [visto, setVisto] = useState<EstadoCodigo | null>(null);   // el resultado que ya se ha cerrado con «Probar con otro código»
  const resultado = !comprobando && estado.error && estado !== visto ? estado : null;
  const enCodigo = !comprobando && !resultado;

  // El cursor va a la primera cajita al llegar y al volver de un resultado.
  useEffect(() => { if (enCodigo) cajas.current[0]?.focus(); }, [enCodigo]);
  useEffect(() => {
    if (estado.error) { setCifras(SIN_CIFRAS); setIntento((n) => n + 1); }
  }, [estado]);
  // Con las 6 cifras puestas entra solo, pero espera a que el captcha haya terminado (lo
  // normal es que ya lo esté). Si el captcha no llega a cargar (bloqueador de anuncios), a
  // los pocos segundos se manda igual: decide el servidor.
  useEffect(() => {
    const codigo = cifras.join('');
    if (codigo.length < 6) { enviado.current = ''; esperando.current = 0; return; }
    if (comprobando || enviado.current === codigo) return;
    const prueba = formulario.current?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
    if (!prueba?.value && esperando.current < 14) {
      esperando.current += 1;
      const t = setTimeout(() => setTic((n) => n + 1), 300);
      return () => clearTimeout(t);
    }
    enviado.current = codigo;
    formulario.current?.requestSubmit();
  }, [cifras, comprobando, tic]);

  return (
    <>
      {comprobando && (
        <div className="stop-screen show" id="carga-comprobando" role="status" aria-live="polite">
          <div className="spin spin-lg" />
          <h1>Comprobando si la carga está disponible</h1>
          <p className="sub">Un momento…</p>
        </div>
      )}
      {resultado && (
        <div className="stop-screen show" id="carga-resultado" role="alert">
          {resultado.motivo === 'no_disponible'
            ? <><div className="stop-ico">✕</div><h1 style={{ color: 'var(--red)' }}>Esta carga ya no está disponible</h1></>
            : <><div className="stop-ico amber">!</div><h1>{resultado.motivo === 'codigo_incorrecto' ? 'El código no es correcto' : resultado.motivo === 'tope' ? 'Demasiados intentos' : 'No hemos podido comprobarlo'}</h1></>}
          <p className="sub">{resultado.error}</p>
          {resultado.motivo !== 'tope' && (
            <button type="button" className="btn" onClick={() => setVisto(estado)}>
              {resultado.motivo === 'codigo_incorrecto' ? 'Volver a escribirlo' : resultado.motivo === 'no_disponible' ? 'Probar con otro código' : 'Volver a intentarlo'}
            </button>
          )}
          <p className="aviso">¿Dudas? Llámanos al <strong>{CONTACTO.telefono}</strong> o escribe a <strong>{CONTACTO.email}</strong>.</p>
        </div>
      )}
      <form ref={formulario} action={accion} noValidate hidden={!enCodigo}>
        <h1>Acceder a la carga</h1>
        <p className="sub">Escribe el <strong>código de la carga</strong> que aparece en la oferta.</p>
        <label htmlFor="codigo-carga" style={{ textAlign: 'center' }}>Código de la carga</label>
        <input type="hidden" name="codigo" value={cifras.join('')} />
        <CajasCodigo cifras={cifras} setCifras={setCifras} cajas={cajas} bloqueado={comprobando} idPrimera="codigo-carga" autoCompletar="off" />
        <Turnstile reinicio={intento} />
        <button type="submit" className="btn" disabled={comprobando}>Ver la carga</button>
        <p className="aviso">¿Dudas? Llámanos al <strong>{CONTACTO.telefono}</strong> o escribe a <strong>{CONTACTO.email}</strong>.</p>
      </form>
    </>
  );
}
