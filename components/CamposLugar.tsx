'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import CampoSugerido from '@/components/CampoSugerido';

// Código postal ↔ localidad ↔ provincia (usuario, 2026-11-22). Sale de las fichas que ya
// existen (direcciones_en_uso: las propias + las que han escrito dos empresas o Dynamo).
//  - Al escribir el CP: si en las fichas ese CP tiene UNA localidad y la localidad está vacía,
//    se rellena (y la provincia, si está vacía). Si tiene varias, se sugieren en la localidad.
//  - Al elegir una localidad sugerida: se rellena la provincia (si vacía) y el CP si esa
//    localidad tiene un solo CP en las fichas; si tiene varios, se sugieren en el CP.
// Nunca pisa lo que ya está escrito. En España la provincia la pone el CP (conProvinciaDelCp).

export type Lugar = { codigo_postal: string; poblacion: string; provincia: string };
// Los tres datos de una ficha (vacíos si faltan).
export const lugarDe = (x: { codigo_postal?: string | null; poblacion?: string | null; provincia?: string | null }): Lugar =>
  ({ codigo_postal: x.codigo_postal ?? '', poblacion: x.poblacion ?? '', provincia: x.provincia ?? '' });
type Fila = { codigo_postal: string; poblacion: string; provincia: string | null };

const comparable = (s: string) => (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cpComparable = (s: string) => (s ?? '').toUpperCase().replace(/[\s-]/g, '');

async function buscar(pais: string, cp: string | null, pob: string | null): Promise<Fila[]> {
  const sb = supabaseNavegador();
  if (!sb) return [];
  const { data } = await sb.rpc('direcciones_en_uso', { p_pais: pais, p_codigo_postal: cp, p_poblacion: pob });
  return ((data ?? []) as Fila[]).filter((f) => f && f.codigo_postal && f.poblacion);
}

// Espera un poco a que se deje de escribir antes de preguntar.
function useRetardo<T>(v: T, ms = 300): T {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

type Comun = {
  id: string; pais: string | null | undefined; lugar: Lugar; onCambio: (c: Partial<Lugar>) => void;
  placeholder?: string; disabled?: boolean; style?: React.CSSProperties; className?: string;
};

export function CampoCodigoPostal({ id, pais, lugar, onCambio, placeholder, disabled, style, className }: Comun) {
  const codigo = (pais || 'ES').toUpperCase();
  const cp = useRetardo(lugar.codigo_postal);
  const pob = useRetardo(lugar.poblacion);
  const [cps, setCps] = useState<string[]>([]);
  const rellenadoPara = useRef<string>(cpComparable(lugar.codigo_postal));   // no rellenar al abrir una ficha
  // Con el CP escrito: localidad (y provincia) si las fichas dan una sola.
  useEffect(() => {
    const k = cpComparable(cp);
    if (k.length < 3 || k === rellenadoPara.current) return;
    let vivo = true;
    buscar(codigo, cp, null).then((r) => {
      if (!vivo) return;
      rellenadoPara.current = k;
      const locs = [...new Map(r.map((f) => [comparable(f.poblacion), f])).values()];
      const c: Partial<Lugar> = {};
      if (locs.length === 1 && !lugar.poblacion.trim()) c.poblacion = locs[0].poblacion;
      const conProv = (locs.length === 1 ? locs : r.filter((f) => comparable(f.poblacion) === comparable(lugar.poblacion)))[0];
      if (conProv?.provincia && !lugar.provincia.trim() && codigo !== 'ES') c.provincia = conProv.provincia;
      if (Object.keys(c).length) onCambio(c);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el CP (ya esperado)
  }, [cp, codigo]);
  // Sin CP y con la localidad escrita: sus CP de las fichas, como sugerencias.
  useEffect(() => {
    if (cpComparable(cp).length > 0 || comparable(pob).length < 2) { setCps([]); return; }
    let vivo = true;
    buscar(codigo, null, pob).then((r) => {
      if (vivo) setCps([...new Set(r.filter((f) => comparable(f.poblacion) === comparable(pob)).map((f) => f.codigo_postal))]);
    });
    return () => { vivo = false; };
  }, [cp, pob, codigo]);
  return <CampoSugerido id={id} valor={lugar.codigo_postal} placeholder={placeholder} disabled={disabled} style={style} className={className}
    inputMode={codigo === 'ES' ? 'numeric' : undefined} sugerencias={cps} onCambio={(v) => onCambio({ codigo_postal: v })} />;
}

export function CampoPoblacion({ id, pais, lugar, onCambio, placeholder, disabled, style, className }: Comun) {
  const codigo = (pais || 'ES').toUpperCase();
  const cp = useRetardo(lugar.codigo_postal);
  const pob = useRetardo(lugar.poblacion);
  const [filas, setFilas] = useState<Fila[]>([]);
  // Sugerencias: al escribir, las localidades que empiezan así; sin escribir y con CP, las de ese CP.
  useEffect(() => {
    const porNombre = comparable(pob).length >= 2;
    if (!porNombre && cpComparable(cp).length < 3) { setFilas([]); return; }
    let vivo = true;
    buscar(codigo, porNombre ? null : cp, porNombre ? pob : null).then((r) => { if (vivo) setFilas(r); });
    return () => { vivo = false; };
  }, [cp, pob, codigo]);
  const locs = [...new Map(filas.map((f) => [comparable(f.poblacion), f])).values()];
  function cambiar(v: string) {
    const c: Partial<Lugar> = { poblacion: v };
    // Elegida una localidad sugerida: provincia y, si tiene un solo CP, también el CP.
    const suyas = filas.filter((f) => comparable(f.poblacion) === comparable(v));
    if (suyas.length) {
      const cpsSuyos = [...new Set(suyas.map((f) => cpComparable(f.codigo_postal)))];
      if (!lugar.codigo_postal.trim() && cpsSuyos.length === 1) c.codigo_postal = suyas[0].codigo_postal;
      const prov = suyas.find((f) => f.provincia)?.provincia;
      if (prov && !lugar.provincia.trim() && (codigo !== 'ES' || !c.codigo_postal)) c.provincia = prov;
    }
    onCambio(c);
  }
  return <CampoSugerido id={id} valor={lugar.poblacion} placeholder={placeholder} disabled={disabled} style={style} className={className}
    sugerencias={locs.map((f) => ({ valor: f.poblacion, detalle: [f.provincia, f.codigo_postal].filter(Boolean).join(' · ') }))} onCambio={cambiar} />;
}
