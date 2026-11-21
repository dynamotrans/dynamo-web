'use client';

// El filtro de fecha de todos los listados (ver lib/filtroFechas.ts): un desplegable con los
// periodos y, en «Entre dos fechas…», dos calendarios (desde y hasta). Va dentro de la barra
// de filtros de cada lista.
import { useMemo, useState } from 'react';
import CampoFecha from '@/components/CampoFecha';
import { opcionesFiltroFecha, rangoFiltroFecha, hoyMadrid } from '@/lib/filtroFechas';

/** Estado del filtro en las listas que filtran en el navegador. `rango` = null si no filtra. */
export function useFiltroFechas() {
  const [f, setF] = useState({ valor: '', desde: '', hasta: '' });
  const rango = useMemo(() => rangoFiltroFecha(f.valor, hoyMadrid(), f.desde, f.hasta), [f]);
  return { ...f, rango, clave: `${f.valor}|${f.desde}|${f.hasta}`, onCambio: (valor: string, desde: string, hasta: string) => setF({ valor, desde, hasta }) };
}

export default function FiltroFechas({ valor, desde, hasta, onCambio, futuro = false, etiqueta = 'Filtrar por fecha', id }: {
  valor: string; desde: string; hasta: string;
  onCambio: (valor: string, desde: string, hasta: string) => void;
  futuro?: boolean;     // con mañana, la semana y el mes que vienen
  etiqueta?: string;    // para lectores de pantalla («Filtrar por fecha de registro»…)
  id?: string;
}) {
  return <>
    <select className="filter-estado filtro-fecha" id={id} value={valor} aria-label={etiqueta}
      onChange={(e) => onCambio(e.target.value, e.target.value === 'entre' ? desde : '', e.target.value === 'entre' ? hasta : '')}>
      <option value="">Todas las fechas</option>
      {opcionesFiltroFecha(futuro).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
    {valor === 'entre' && <span className="filtro-fecha-entre" style={{ display: 'contents' }}>
      <CampoFecha className="param-input" value={desde} onChange={(v) => onCambio('entre', v, hasta)} aria-label="Desde" max={hasta || undefined} permitirBorrar style={{ width: 'auto', minWidth: 160 }} />
      <CampoFecha className="param-input" value={hasta} onChange={(v) => onCambio('entre', desde, v)} aria-label="Hasta" min={desde || undefined} permitirBorrar style={{ width: 'auto', minWidth: 160 }} />
    </span>}
  </>;
}
