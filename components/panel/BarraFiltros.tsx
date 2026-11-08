'use client';

// La barra de filtros de las listas que viven en memoria (Incidencias, Penalizaciones,
// Almacenamientos): buscador + los desplegables de cada lista + Exportar CSV de lo que
// se ve, con el mismo plegado móvil que la barra de Envíos («Filtros ▾» y el globito
// con el nº de filtros activos). Aquí todo filtra en el navegador: estas listas llegan
// enteras del servidor, así que el CSV sale completo, no solo la página visible.
import { useState, type ReactNode } from 'react';

export default function BarraFiltros({ q, onQ, placeholder, activos, onExportar, children }: {
  q: string; onQ: (v: string) => void; placeholder: string;
  activos: number;              // nº de filtros con valor (buscador incluido), para el globito
  onExportar?: () => void;      // descarga el CSV con los filtros puestos
  children?: ReactNode;         // los desplegables propios de cada lista
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={`filters filters-collapsible${abierto ? ' filters-open' : ''}`}>
      <input type="search" value={q} placeholder={placeholder} aria-label="Buscar" autoComplete="off" onChange={(e) => onQ(e.target.value)} />
      <button type="button" className="filters-toggle" aria-expanded={abierto} aria-label="Mostrar u ocultar filtros" onClick={() => setAbierto((v) => !v)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        Filtros
        {activos > 0 && <span className="filters-toggle-count">{activos}</span>}
        <svg className="filters-toggle-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {children}
      {onExportar && (
        <button type="button" className="btn-export" onClick={onExportar} title="Descargar en CSV lo que se ve, con los filtros puestos">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Exportar
        </button>
      )}
    </div>
  );
}
