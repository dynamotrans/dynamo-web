// Paginación por la URL (la base de datos ya ha filtrado y contado): la misma que usa la
// lista de Envíos. Cada número es un enlace, así que la página se puede compartir y volver
// atrás funciona. `url(p)` la pone quien lo usa (conserva sus propios filtros).
import Link from 'next/link';
import { numero } from '@/lib/formato';

export default function Paginador({ total, pagina, porPagina, url, nombre, nombreUno }: {
  total: number; pagina: number; porPagina: number; url: (p: number) => string; nombre: string; nombreUno?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pag = Math.min(Math.max(1, pagina), paginas);
  return (
    <div className="pagination">
      <div className="pagination-left">
        <span>{total
          ? `Mostrando ${numero((pag - 1) * porPagina + 1, 0)}–${numero(Math.min(pag * porPagina, total), 0)} de ${numero(total, 0)} ${total === 1 ? (nombreUno ?? nombre) : nombre}`
          : `Sin ${nombre}`}</span>
      </div>
      {paginas > 1 && (
        <div className="pagination-pages">
          {pag > 1 && <Link href={url(pag - 1)} aria-label="Anterior">‹</Link>}
          {Array.from({ length: paginas }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === paginas || Math.abs(n - pag) <= 2)
            .map((n, i, arr) => (
              <span key={n} style={{ display: 'contents' }}>
                {i > 0 && n - arr[i - 1] > 1 && <span style={{ padding: '0 0.3rem', color: 'var(--gray-500)' }}>…</span>}
                <Link href={url(n)} className={n === pag ? 'active' : ''}>{n}</Link>
              </span>
            ))}
          {pag < paginas && <Link href={url(pag + 1)} aria-label="Siguiente">›</Link>}
        </div>
      )}
    </div>
  );
}

/** Buscador que manda el texto por la URL (?q=) al pulsar Intro, para que busque la base de datos. */
export function BuscadorUrl({ valor, placeholder, campos, accion, id }: { valor: string; placeholder: string; campos?: React.ReactNode; accion: string; id?: string }) {
  return (
    <form id={id} className="filters" action={accion} method="get" data-envivo-ignorar="">
      <input type="search" name="q" defaultValue={valor} placeholder={placeholder} aria-label="Buscar" />
      {campos}
      <button type="submit" className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>Buscar</button>
    </form>
  );
}

/** Página y tamaño de página de la URL, acotados. */
export function paginaDe(sp: Record<string, string | undefined>, porDefecto = 20): { pagina: number; porPagina: number } {
  const porPagina = [10, 20, 50, 100].includes(Number(sp.n)) ? Number(sp.n) : porDefecto;
  const pagina = Math.max(1, Math.floor(Number(sp.p) || 1));
  return { pagina, porPagina };
}
