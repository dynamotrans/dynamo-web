'use client';

import { useEffect, useState } from 'react';
import { PROVINCIAS_LISTA } from '@/lib/provinciasEs';
import { supabaseNavegador } from '@/lib/supabase/navegador';

// Provincia (usuario, 2026-11-22): en España, desplegable con las 52 provincias, para que nadie
// escriba la misma de tres maneras; fuera de España, texto libre. Un valor antiguo que no esté
// en la lista se conserva como una opción más, para no perderlo al guardar. Fuera de España,
// al escribir se sugieren las provincias que ya usan las fichas de ese país (salen de las fichas
// vivas: si una deja de usarse en todas, ya no se sugiere).
export default function CampoProvincia({ id, pais, valor, onCambio, placeholder = 'Provincia o región', style, className, disabled, ariaInvalid }: {
  id: string; pais: string | null | undefined; valor: string; onCambio: (v: string) => void;
  placeholder?: string; style?: React.CSSProperties; className?: string; disabled?: boolean; ariaInvalid?: boolean;
}) {
  const codigo = (pais || 'ES').toUpperCase();
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  useEffect(() => {
    if (codigo === 'ES') { setSugeridas([]); return; }
    let vivo = true;
    const sb = supabaseNavegador();
    if (!sb) return;
    sb.rpc('provincias_en_uso', { p_pais: codigo }).then(({ data }) => {
      // Cada fila llega como { provincia } (o como texto suelto, según la versión del cliente).
      if (vivo) setSugeridas(((data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : (x as { provincia?: string })?.provincia ?? '')).filter(Boolean));
    });
    return () => { vivo = false; };
  }, [codigo]);
  if (codigo !== 'ES') {
    return <>
      <input id={id} type="text" value={valor} placeholder={placeholder} disabled={disabled} style={style} className={className}
        list={`${id}-sugerencias`} autoComplete="off" aria-invalid={ariaInvalid || undefined} onChange={(e) => onCambio(e.target.value)} />
      <datalist id={`${id}-sugerencias`}>{sugeridas.map((p) => <option key={p} value={p} />)}</datalist>
    </>;
  }
  const antiguo = valor && !PROVINCIAS_LISTA.includes(valor) ? valor : null;
  return (
    <select id={id} className={`ptar-select${className ? ` ${className}` : ''}`} value={valor} disabled={disabled} style={style}
      aria-invalid={ariaInvalid || undefined} onChange={(e) => onCambio(e.target.value)}>
      <option value="">Elige la provincia…</option>
      {antiguo && <option value={antiguo}>{antiguo}</option>}
      {PROVINCIAS_LISTA.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}
