'use client';

// La parte que habla con Supabase desde el navegador: dar de alta el móvil (código QR) y
// comprobar el código de 6 cifras. Al acertar, la sesión sube de nivel y se entra al panel.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';

type Alta = { id: string; qr: string; clave: string };

const traducir = (m: string) =>
  /invalid totp|invalid code|code.*invalid|expired/i.test(m) ? 'Ese código no vale. Mira el que sale ahora en la aplicación (cambia cada 30 segundos) y escríbelo de nuevo.'
    : /disabled|not enabled/i.test(m) ? 'El doble paso no está encendido en Supabase (Authentication → Multi-Factor → aplicación de códigos, TOTP). Avisa al administrador.'
    : /rate|too many/i.test(m) ? 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
    : /network|fetch/i.test(m) ? 'No se ha podido conectar. Comprueba la conexión y vuelve a intentarlo.'
    : 'No se ha podido comprobar el código. Vuelve a intentarlo.';

export default function DoblePaso({ movil, obligatorio, email }: { movil: string | null; obligatorio: boolean; email: string }) {
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(movil ? null : 'Preparando el código');
  const [verClave, setVerClave] = useState(false);
  const empezado = useRef(false);
  const campo = useRef<HTMLInputElement>(null);

  // Sin móvil dado de alta: se pide a Supabase una clave nueva y su código QR. Antes se
  // retiran las altas que se quedaron a medias (una recarga de esta misma pantalla).
  useEffect(() => {
    if (movil || empezado.current) return;
    empezado.current = true;
    (async () => {
      const sb = supabaseNavegador();
      if (!sb) { setTrabajando(null); setError('La plataforma no está conectada.'); return; }
      try {
        const { data: lista } = await sb.auth.mfa.listFactors();
        for (const f of lista?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data, error: e } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Dynamo ${new Date().toISOString().slice(0, 19)}`, issuer: 'Dynamo' });
        if (e || !data) { setError(/disabled|not enabled/i.test(e?.message ?? '') ? traducir(e!.message) : 'No se ha podido preparar el doble paso. Recarga la página; si sigue igual, avísanos.'); setTrabajando(null); return; }
        setAlta({ id: data.id, qr: data.totp.qr_code, clave: data.totp.secret });
      } catch {
        setError('No se ha podido preparar el doble paso. Recarga la página; si sigue igual, avísanos.');
      }
      setTrabajando(null);
    })();
  }, [movil]);

  useEffect(() => { if (!trabajando) campo.current?.focus(); }, [trabajando, alta]);

  async function comprobar(valor: string) {
    const factor = movil ?? alta?.id;
    const sb = supabaseNavegador();
    if (!factor || !sb || valor.length !== 6) return;
    setError(null); setTrabajando('Comprobando el código');
    const { error: e } = await sb.auth.mfa.challengeAndVerify({ factorId: factor, code: valor });
    if (e) { setTrabajando(null); setCodigo(''); setError(traducir(e.message)); return; }
    // Recarga completa: la sesión ya lleva el segundo paso y el panel se pide de cero.
    setTrabajando('Entrando');
    window.location.assign('/panel');
  }

  const escribir = (v: string) => {
    const limpio = v.replace(/\D/g, '').slice(0, 6);
    setCodigo(limpio);
    if (limpio.length === 6) comprobar(limpio);   // al escribir la última cifra se comprueba solo
  };

  return (
    <div>
      {trabajando && <Cargando texto={trabajando} />}
      {error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{error}</div></div>}

      {!movil && alta && (
        <ol style={{ margin: '0 0 1rem', paddingLeft: '1.2rem', display: 'grid', gap: '0.7rem', fontSize: '0.95rem', lineHeight: 1.45, color: '#0a0230' }}>
          <li>Abre <strong>Google Authenticator</strong> en tu móvil y pulsa <strong>+</strong> → <strong>Escanear un código QR</strong>.</li>
          <li>
            Apunta la cámara a este código:
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.6rem 0 0.3rem' }}>
              <img id="doble-paso-qr" src={alta.qr} alt="Código QR para dar de alta el doble paso en tu aplicación" width={190} height={190}
                style={{ background: '#fff', padding: 8, borderRadius: 12, border: '1px solid #e8eaed' }} />
            </div>
            <button type="button" onClick={() => setVerClave((v) => !v)} aria-expanded={verClave}
              style={{ background: 'none', border: 0, padding: 0, color: '#3300cc', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
              ¿No puedes escanearlo? {verClave ? 'Ocultar la clave' : 'Escribe la clave a mano'}
            </button>
            {verClave && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
                En la aplicación elige <strong>Introducir clave de configuración</strong>. Cuenta: <strong>{email || 'Dynamo'}</strong>. Clave:
                <code id="doble-paso-clave" style={{ display: 'block', marginTop: '0.3rem', padding: '0.5rem 0.6rem', background: '#f3f4f6', borderRadius: 8, wordBreak: 'break-all', fontWeight: 700, letterSpacing: '0.04em' }}>{alta.clave}</code>
              </div>
            )}
          </li>
          <li>Escribe aquí el <strong>código de 6 cifras</strong> que te sale.</li>
        </ol>
      )}

      {(movil || alta) && (
        <div className="portal-field">
          <label className="portal-label" htmlFor="doble-paso-codigo">Código de 6 cifras <span className="campo-oblig">· obligatorio</span></label>
          <div className="portal-input-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18" /></svg>
            <input ref={campo} id="doble-paso-codigo" className="portal-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
              placeholder="Ej. 123456" value={codigo} onChange={(e) => escribir(e.target.value)} disabled={!!trabajando}
              style={{ letterSpacing: '0.3em', fontWeight: 700 }} />
          </div>
          <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.4 }}>
            El código cambia cada 30 segundos. Al escribir la sexta cifra se comprueba solo.
          </p>
        </div>
      )}

      {!movil && alta && (
        <div className="pt-aviso info" role="note" style={{ marginTop: '0.9rem' }}><div>
          <strong>Si cambias o pierdes el móvil</strong>, el Admin Master te quita el doble paso desde tu ficha de usuario y lo vuelves a dar de alta aquí.
        </div></div>
      )}
      {movil && (
        <p style={{ margin: '0.9rem 0 0', fontSize: '0.88rem', color: '#6b7280', lineHeight: 1.45 }}>
          ¿Has cambiado o perdido el móvil? Pide al Admin Master que te quite el doble paso desde tu ficha de usuario.
        </p>
      )}
      {!obligatorio && !movil && (
        <Link href="/panel" className="portal-back" style={{ marginTop: '1rem' }}>Ahora no, volver al panel</Link>
      )}
      <form action="/panel/salir" method="post" style={{ marginTop: '0.8rem', textAlign: 'center' }}>
        <button type="submit" style={{ background: 'none', border: 0, color: '#6b7280', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>Salir y entrar con otra cuenta</button>
      </form>
    </div>
  );
}
