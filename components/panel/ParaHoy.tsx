// «Para hoy»: lo que espera respuesta de Dynamo, por bloques y por urgencia. Lo que está
// al día no ocupa sitio: sale en una línea al final.
import Link from 'next/link';
import { creadoTxt } from '@/lib/envios';

export type Fila = { href: string; t: string; s?: string; desde: string | null; urgente?: boolean };
export type Bloque = { id: string; nivel: 'urgente' | 'aviso' | 'info'; titulo: string; total: number; todo: string; filas: Fila[] };

// «hace 25 min», «hace 3 h», «hace 2 días»: cuánto lleva esperando.
function espera(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

export default function ParaHoy({ bloques, error }: { bloques: Bloque[]; error: string | null }) {
  const conCosas = bloques.filter((b) => b.total > 0);
  const vacios = bloques.filter((b) => b.total === 0);
  const total = conCosas.reduce((n, b) => n + b.total, 0);
  return (
    <section className="section active" id="sec-para-hoy">
      <div className="sec-header"><h2>Para hoy</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        Todo lo que espera una respuesta del equipo, lo más urgente arriba. Cada línea abre su ficha.
        {total > 0 ? <> Ahora mismo: <strong style={{ color: 'var(--navy)' }}>{total} pendiente{total === 1 ? '' : 's'}</strong>.</> : null}
      </p>
      {error && <div className="pt-aviso error"><div>No se ha podido cargar todo: {error}</div></div>}
      {conCosas.length === 0 && !error && <div className="pt-aviso info"><div><strong>Todo al día.</strong> No hay nada esperando respuesta.</div></div>}
      <div className="ph-grid">
        {conCosas.map((b) => (
          <div key={b.id} className={`table-wrap ph-bloque ph-${b.nivel}`}>
            <div className="ph-cab">
              <span className={`ph-num ph-${b.nivel}`}>{b.total}</span>
              <span className="ph-titulo">{b.titulo}</span>
              <Link href={b.todo} className="ph-todo">Ver todo →</Link>
            </div>
            <ul className="ph-lista">
              {b.filas.map((f, i) => (
                <li key={i}>
                  <Link href={f.href} className={`ph-fila${f.urgente ? ' urgente' : ''}`}>
                    <span className="ph-t">{f.t}</span>
                    {f.s && <span className="ph-s">{f.s}</span>}
                    {f.desde && <span className="ph-h" title={creadoTxt(f.desde)}>{espera(f.desde)}</span>}
                  </Link>
                </li>
              ))}
              {b.total > b.filas.length && <li className="ph-mas">y {b.total - b.filas.length} más…</li>}
            </ul>
          </div>
        ))}
      </div>
      {vacios.length > 0 && (
        <p className="ph-vacios">Al día: {vacios.map((b) => b.titulo.toLowerCase()).join(' · ')}.</p>
      )}
    </section>
  );
}
