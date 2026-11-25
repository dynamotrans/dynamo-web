'use client';

import { useEffect, useState } from 'react';
import { PROVINCIAS_LISTA } from '@/lib/provinciasEs';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import SelectorBuscable from '@/components/SelectorBuscable';

// Provincia (usuario, 2026-11-22): en España, las 52 provincias, para que nadie escriba la misma
// de tres maneras; fuera de España, texto libre con las provincias que ya usan las fichas de ese
// país como sugerencias (salen de las fichas vivas: si una deja de usarse en todas, ya no sale).
// Un valor antiguo que no esté en la lista se conserva como una opción más, para no perderlo.
//
// Siempre con el desplegable con buscador de la plataforma, el mismo que el de país (usuario,
// 2026-11-25: «así no», al ver el desplegable del navegador y su lista de sugerencias).
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
  const espana = codigo === 'ES';
  return (
    <SelectorBuscable id={id} nombre="provincia" valor={valor} onCambio={onCambio} opciones={espana ? PROVINCIAS_LISTA : sugeridas}
      libre={!espana} vacio={espana ? 'Elige la provincia…' : placeholder} disabled={disabled} ariaInvalid={ariaInvalid} className={className} style={style} />
  );
}
