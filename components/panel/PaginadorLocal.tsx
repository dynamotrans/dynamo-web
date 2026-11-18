'use client';
// Paginación de las listas que ya están enteras en el navegador (las que se filtran con
// pestañas y buscador sin volver a la base de datos). Mismo aspecto que `Paginador`, que
// es el de las listas que pagina la base de datos por la URL. Ninguna tabla del panel
// se pinta entera: como mucho, una página.
import { useRef, useState } from 'react';
import { numero } from '@/lib/formato';

export type Paginas<T> = { visibles: T[]; total: number; pagina: number; porPagina: number; ir: (p: number) => void };

/** Trocea `filas` en páginas. `reinicio` es el texto de los filtros puestos (pestaña,
 *  buscador…): al cambiar, se vuelve a la primera página. Si la lista encoge (en vivo, o
 *  al borrar una fila), la página se queda en la última que exista. */
export function usePaginas<T>(filas: T[], reinicio = '', porPagina = 20): Paginas<T> {
  const [estado, setEstado] = useState({ pagina: 1, reinicio });
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const pagina = Math.min(estado.reinicio === reinicio ? estado.pagina : 1, paginas);
  return {
    visibles: filas.length > porPagina ? filas.slice((pagina - 1) * porPagina, pagina * porPagina) : filas,
    total: filas.length, pagina, porPagina,
    ir: (p) => setEstado({ pagina: p, reinicio }),
  };
}

export default function PaginadorLocal<T>({ p, nombre, nombreUno, soloSiHace = false }: {
  p: Paginas<T>; nombre: string; nombreUno?: string;
  /** En cajas pequeñas: no pintar nada mientras todo quepa en una página. */
  soloSiHace?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const paginas = Math.max(1, Math.ceil(p.total / p.porPagina));
  if (soloSiHace && paginas < 2) return null;
  const ir = (n: number) => {
    p.ir(n);
    // Al pasar de página, la tabla vuelve a su principio (si se había bajado hasta el pie).
    const tabla = caja.current?.previousElementSibling;
    if (tabla && tabla.getBoundingClientRect().top < 0) tabla.scrollIntoView({ block: 'start' });
  };
  return (
    <div className="pagination" ref={caja}>
      <div className="pagination-left">
        <span>{p.total
          ? `Mostrando ${numero((p.pagina - 1) * p.porPagina + 1, 0)}–${numero(Math.min(p.pagina * p.porPagina, p.total), 0)} de ${numero(p.total, 0)} ${p.total === 1 ? (nombreUno ?? nombre) : nombre}`
          : `Sin ${nombre}`}</span>
      </div>
      {paginas > 1 && (
        <div className="pagination-pages">
          {p.pagina > 1 && <button type="button" onClick={() => ir(p.pagina - 1)} aria-label="Anterior">‹</button>}
          {Array.from({ length: paginas }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === paginas || Math.abs(n - p.pagina) <= 2)
            .map((n, i, arr) => (
              <span key={n} style={{ display: 'contents' }}>
                {i > 0 && n - arr[i - 1] > 1 && <span style={{ padding: '0 0.3rem', color: 'var(--gray-500)' }}>…</span>}
                <button type="button" onClick={() => ir(n)} className={n === p.pagina ? 'active' : ''} aria-current={n === p.pagina ? 'page' : undefined}
                  aria-label={`Página ${n}`}>{n}</button>
              </span>
            ))}
          {p.pagina < paginas && <button type="button" onClick={() => ir(p.pagina + 1)} aria-label="Siguiente">›</button>}
        </div>
      )}
    </div>
  );
}
