// Lo que se toca en las fichas de los sitios (Nuevo envío y Crear varios envíos) se guarda por
// PARADA, pero hay datos que son del SITIO (teléfono, contacto, horario, indicaciones…) y datos
// que son de esa parada (cita previa, detalle de la mercancía). Reglas (usuario, 2026-11-24:
// el mismo sitio en la recogida y en la entrega; puso el teléfono en una ficha y la otra seguía
// vacía y el aviso decía que faltaba en las dos):
//   1. Lo que se cambia de un SITIO en una ficha vale para todas las paradas de ese mismo sitio
//      (también en otras filas de «Crear varios envíos»).
//   2. Una parada que estrena sitio hereda lo ya tocado de ese sitio en otra parada.
//   3. Si en una parada se cambia de sitio, lo tocado del sitio anterior no se arrastra al nuevo.

export const CAMPOS_DE_SITIO = ['horario', 'verano', 'contacto', 'telefono', 'contactoEmail', 'notas', 'emails', 'maps', 'empresa', 'extra'] as const;
// De la parada, pero ligado al sitio (la cita es CON ese sitio): se pierde al cambiar de sitio.
const CAMPOS_DE_CITA = ['cita', 'citaHora', 'citaDetalle'] as const;

type Edicion = Record<string, unknown>;
type PuntoMin = { k: number; sitio: { id: string } | null };

const deSitio = (e: Edicion | undefined) => !!e && CAMPOS_DE_SITIO.some((c) => e[c] !== undefined);

/** Regla 1: los campos de sitio que cambian en una parada se copian a las demás paradas del mismo sitio. */
export function extenderAlSitio<E extends Edicion>(antes: Record<number, E>, despues: Record<number, E>, puntos: PuntoMin[]): Record<number, E> {
  if (antes === despues) return despues;
  let out = despues;
  for (const p of puntos) {
    const id = p.sitio?.id;
    const a: Edicion | undefined = antes[p.k], d: Edicion | undefined = despues[p.k];
    if (!id || !d || a === d) continue;
    const cambios: Edicion = {};
    for (const c of CAMPOS_DE_SITIO) if (d[c] !== a?.[c]) cambios[c] = d[c];
    if (!Object.keys(cambios).length) continue;
    for (const q of puntos) {
      if (q.k === p.k || q.sitio?.id !== id) continue;
      if (out === despues) out = { ...despues };
      out[q.k] = { ...out[q.k], ...cambios } as E;
    }
  }
  return out;
}

/** Reglas 2 y 3. `sitioAntes`: el sitio que tenía cada parada la vez anterior ('' = ninguno). */
export function ajustarAPuntos<E extends Edicion>(edic: Record<number, E>, puntos: PuntoMin[], sitioAntes: Map<number, string>): Record<number, E> {
  let out = edic;
  const copia = () => { if (out === edic) out = { ...edic }; };
  for (const p of puntos) {
    const antes = sitioAntes.get(p.k);
    const e: Edicion | undefined = out[p.k];
    if (antes === undefined || antes === (p.sitio?.id ?? '') || !e) continue;
    const limpio: Edicion = { ...e };
    for (const c of [...CAMPOS_DE_SITIO, ...CAMPOS_DE_CITA]) delete limpio[c];
    copia();
    if (Object.keys(limpio).length) out[p.k] = limpio as E; else delete out[p.k];
  }
  for (const p of puntos) {
    const id = p.sitio?.id;
    if (!id) continue;
    const fuente = puntos.find((q) => q.k !== p.k && q.sitio?.id === id && deSitio(out[q.k]));
    if (!fuente) continue;
    const f: Edicion = out[fuente.k], e: Edicion = out[p.k] ?? {};
    const heredado: Edicion = {};
    for (const c of CAMPOS_DE_SITIO) if (e[c] === undefined && f[c] !== undefined) heredado[c] = f[c];
    if (!Object.keys(heredado).length) continue;
    copia();
    out[p.k] = { ...e, ...heredado } as E;
  }
  return out;
}

/** «2 · Entrega» de cada parada de una ruta, para decir en los avisos DÓNDE falta algo. */
export const nombreParada = (i: number, tipo: 'carga' | 'descarga') => `${i + 1} · ${tipo === 'carga' ? 'Recogida' : 'Entrega'}`;
