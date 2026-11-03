'use client';

// Las 6 cajitas del código (verificar.html): avanza sola al escribir, retrocede con la
// tecla de borrar y reparte lo que se pega. Debajo, «Reenviar código» con cuenta atrás.
import { useActionState, useEffect, useRef, useState } from 'react';
import { comprobarCodigo, reenviarCodigo, type EstadoCodigo } from '../acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';

export default function FormCodigo({ email }: { email: string }) {
  const [estado, accion, comprobando] = useActionState(comprobarCodigo, { error: null } as EstadoCodigo);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarCodigo, { error: null } as EstadoCodigo);
  const [cifras, setCifras] = useState<string[]>(['', '', '', '', '', '']);
  const [espera, setEspera] = useState(60);
  const cajas = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { cajas.current[0]?.focus(); }, []);
  useEffect(() => { if (reenvio.reenviado) setEspera(60); }, [reenvio]);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const poner = (desde: number, texto: string) => {
    const d = texto.replace(/\D/g, '').slice(0, 6 - desde).split('');
    if (!d.length) return;
    setCifras((c) => { const n = [...c]; d.forEach((x, i) => { n[desde + i] = x; }); return n; });
    cajas.current[Math.min(desde + d.length, 5)]?.focus();
  };

  return (
    <>
      <form action={accion} noValidate>
        {comprobando && <Cargando texto="Comprobando el código" />}
        {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="codigo" value={cifras.join('')} />
        <div className="otp-row" role="group" aria-label="Código de 6 cifras">
          {cifras.map((c, i) => (
            <input key={i} ref={(el) => { cajas.current[i] = el; }} className={`otp-box${c ? ' filled' : ''}`} value={c}
                   inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} aria-label={`Cifra ${i + 1}`}
                   onChange={(e) => {
                     const v = e.target.value.replace(/\D/g, '');
                     if (!v) { setCifras((x) => { const n = [...x]; n[i] = ''; return n; }); return; }
                     poner(i, v.length > 1 && c ? v.replace(c, '') || v : v);
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Backspace' && !c && i > 0) { cajas.current[i - 1]?.focus(); setCifras((x) => { const n = [...x]; n[i - 1] = ''; return n; }); }
                     if (e.key === 'ArrowLeft' && i > 0) cajas.current[i - 1]?.focus();
                     if (e.key === 'ArrowRight' && i < 5) cajas.current[i + 1]?.focus();
                   }}
                   onPaste={(e) => { e.preventDefault(); poner(i, e.clipboardData.getData('text')); }} />
          ))}
        </div>
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
