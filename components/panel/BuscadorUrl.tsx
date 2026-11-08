'use client';

// Buscador de las listas paginadas (Clientes, Transportistas, Sitios, Usuarios, Riesgos…):
// busca EN VIVO al dejar de escribir (0,4 s), como el de Envíos, sin pulsar nada. El texto
// y los filtros van por la URL (?q=…), así que la búsqueda se puede compartir y «atrás»
// funciona; la base de datos filtra y pagina (una letra sola no busca: daría casi todo).
// Los filtros extra (`campos`) disparan el formulario con requestSubmit() y entran aquí.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function BuscadorUrl({ valor, placeholder, campos, accion, id }: {
  valor: string; placeholder: string; campos?: React.ReactNode; accion: string; id?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(valor);
  const [buscando, empezar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const primera = useRef(true);
  const escribiendo = useRef(false);

  // Si la URL cambia desde fuera (paginación, «quitar búsqueda»), el campo se refleja.
  useEffect(() => { if (!escribiendo.current) setQ(valor); }, [valor]);

  function ir() {
    const f = form.current; if (!f) return;
    const sp = new URLSearchParams();
    new FormData(f).forEach((v, k) => {
      const s = String(v).trim();
      if (!s || (k === 'q' && s.length === 1)) return;
      sp.set(k, s);
    });
    empezar(() => router.replace(`${accion}${sp.size ? `?${sp}` : ''}`, { scroll: false }));
  }

  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const limpio = q.trim();
    if (limpio === valor || (limpio.length === 1 && !valor)) return;
    const t = setTimeout(() => { escribiendo.current = false; ir(); }, 400);
    return () => clearTimeout(t);
    // Solo al cambiar el texto; los filtros se leen del formulario tal cual estén.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <form id={id} ref={form} className="filters" action={accion} method="get" data-envivo-ignorar=""
      onSubmit={(ev) => { ev.preventDefault(); ir(); }}>
      <input type="search" name="q" value={q} placeholder={placeholder} aria-label="Buscar" autoComplete="off"
        onChange={(ev) => { escribiendo.current = true; setQ(ev.target.value); }} />
      {campos}
      <button type="submit" className="btn-secondary" style={{ whiteSpace: 'nowrap' }} aria-live="polite">{buscando ? 'Buscando…' : 'Buscar'}</button>
    </form>
  );
}
