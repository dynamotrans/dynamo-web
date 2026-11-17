'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { buscarPorCodigo, type EstadoCodigo } from './acciones';
import Turnstile from '@/components/Turnstile';
import CajasCodigo, { SIN_CIFRAS } from '@/components/CajasCodigo';
import { CONTACTO } from '@/lib/atencion';

// El código de aceptación, en las mismas 6 cajitas que el código de recuperar la contraseña:
// solo cifras y nunca más de seis. Al completar la sexta se comprueba solo (el botón sigue
// ahí por si acaso); si el código vale, la acción lleva sola a la pantalla de la carga, y si
// no, las cajitas se vacían para volver a intentarlo.
export default function CodigoCarga() {
  const [estado, accion, comprobando] = useActionState(buscarPorCodigo, { error: null } as EstadoCodigo);
  const [cifras, setCifras] = useState<string[]>(SIN_CIFRAS);
  const [intento, setIntento] = useState(0);   // cada respuesta pide una comprobación nueva del captcha
  const [tic, setTic] = useState(0);           // para volver a mirar si el captcha ya ha terminado
  const cajas = useRef<(HTMLInputElement | null)[]>([]);
  const formulario = useRef<HTMLFormElement>(null);
  const enviado = useRef('');                  // el último código que se mandó solo (para no mandarlo dos veces)
  const esperando = useRef(0);                 // cuántas veces se ha esperado al captcha con este código

  useEffect(() => { cajas.current[0]?.focus(); }, []);
  useEffect(() => {
    if (estado.error) { setCifras(SIN_CIFRAS); setIntento((n) => n + 1); cajas.current[0]?.focus(); }
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
    <form ref={formulario} action={accion} noValidate>
      <h1>Acceder a la carga</h1>
      <p className="sub">Escribe el <strong>código de la carga</strong> que aparece en la oferta.</p>
      <label htmlFor="codigo-carga" style={{ textAlign: 'center' }}>Código de la carga</label>
      <input type="hidden" name="codigo" value={cifras.join('')} />
      <CajasCodigo cifras={cifras} setCifras={setCifras} cajas={cajas} bloqueado={comprobando} idPrimera="codigo-carga" autoCompletar="off" />
      {estado.error && !comprobando && <div className="id-nofound show" role="alert">{estado.error}</div>}
      {comprobando && <div className="id-nofound show" role="status" aria-live="polite">Comprobando si la carga sigue disponible…</div>}
      <Turnstile reinicio={intento} />
      <button type="submit" className="btn" disabled={comprobando}>{comprobando ? 'Comprobando…' : 'Ver la carga'}</button>
      <p className="aviso">¿Dudas? Llámanos al <strong>{CONTACTO.telefono}</strong> o escribe a <strong>{CONTACTO.email}</strong>.</p>
    </form>
  );
}
