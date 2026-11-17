'use client';

// Las 6 cajitas de un código de 6 cifras, UNA sola pieza para todo el sitio: el código del
// alta, el de «¿Olvidaste tu contraseña?» y el de aceptación de carga. Solo admiten cifras
// y nunca más de seis; avanzan solas al escribir, retroceden con la tecla de borrar y
// reparten lo que se pega. Quien las usa guarda las cifras y decide qué hacer al completarlas.
import type { Dispatch, RefObject, SetStateAction } from 'react';

export const SIN_CIFRAS: string[] = ['', '', '', '', '', ''];

export default function CajasCodigo({ cifras, setCifras, cajas, idPrimera, autoCompletar = 'one-time-code', bloqueado = false }: {
  cifras: string[];
  setCifras: Dispatch<SetStateAction<string[]>>;
  cajas: RefObject<(HTMLInputElement | null)[]>;
  idPrimera?: string;
  autoCompletar?: string;
  bloqueado?: boolean;   // mientras se comprueba el código no se puede cambiar
}) {
  const poner = (desde: number, texto: string) => {
    const d = texto.replace(/\D/g, '').slice(0, 6 - desde).split('');
    if (!d.length) return;
    setCifras((c) => { const n = [...c]; d.forEach((x, i) => { n[desde + i] = x; }); return n; });
    cajas.current[Math.min(desde + d.length, 5)]?.focus();
  };
  return (
    <div className="otp-row" role="group" aria-label="Código de 6 cifras">
      {cifras.map((c, i) => (
        <input key={i} ref={(el) => { cajas.current[i] = el; }} id={i === 0 ? idPrimera : undefined}
               className={`otp-box${c ? ' filled' : ''}`} value={c}
               inputMode="numeric" autoComplete={i === 0 ? autoCompletar : 'off'} maxLength={6} aria-label={`Cifra ${i + 1}`}
               onChange={(e) => {
                 if (bloqueado) return;
                 const v = e.target.value.replace(/\D/g, '');
                 // Con las seis puestas, en la última no entra ninguna cifra más.
                 if (i === 5 && c && v.length > 1) return;
                 if (!v) { setCifras((x) => { const n = [...x]; n[i] = ''; return n; }); return; }
                 poner(i, v.length > 1 && c ? v.replace(c, '') || v : v);
               }}
               onKeyDown={(e) => {
                 if (bloqueado) return;
                 if (e.key === 'Backspace' && !c && i > 0) { cajas.current[i - 1]?.focus(); setCifras((x) => { const n = [...x]; n[i - 1] = ''; return n; }); }
                 if (e.key === 'ArrowLeft' && i > 0) cajas.current[i - 1]?.focus();
                 if (e.key === 'ArrowRight' && i < 5) cajas.current[i + 1]?.focus();
               }}
               onPaste={(e) => { e.preventDefault(); if (!bloqueado) poner(i, e.clipboardData.getData('text')); }} />
      ))}
    </div>
  );
}
