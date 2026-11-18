'use client';

// Buscador de UNA empresa (transportista o cliente) escribiendo: pide a la base de datos
// las que casan (12 como mucho) y deja elegir una. Sustituye a los <select> con miles de
// opciones, que con 20.000 transportistas pesaban megas y no se podían usar.
import { useEffect, useRef, useState } from 'react';
import ListaFlotante from './ListaFlotante';

export type Opcion = { id: string; nombre: string; cif: string; detalle?: string | null; deshabilitada?: boolean };

export default function Buscador<T extends Opcion>({ id, valor, buscar, onElegir, placeholder = 'Escribe el nombre o el CIF…', vacio = 'Ninguna empresa coincide.', autoFoco, extra }: {
  id?: string;
  valor: T | null;                       // la elegida (o nada)
  buscar: (q: string) => Promise<T[]>;   // acción del servidor
  onElegir: (o: T | null) => void;
  placeholder?: string; vacio?: string; autoFoco?: boolean;
  // Última opción FIJA de la lista, salga lo que salga (usuario, 2026-11-16): «+ Crear
  // nuevo cliente» cuando el que se busca no está.
  extra?: { texto: string; onClick: () => void };
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<T[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const ultima = useRef(0);
  // LA LISTA FLOTA FUERA DE LA VENTANA (usuario, 2026-11-17): la pinta ListaFlotante colgada
  // del cuerpo de la página, en la posición del campo (en Safari, dentro de una ventana
  // emergente salía con la letra dentada).

  // Busca al escribir (con una pequeña espera) y también al abrir con la caja vacía
  // (las primeras por nombre), para que se vea que hay empresas.
  useEffect(() => {
    if (!abierto) return;
    const n = ++ultima.current;
    setCargando(true);
    const t = setTimeout(() => {
      buscar(q.trim()).then((r) => { if (ultima.current === n) { setOpciones(r); setCargando(false); } })
        .catch(() => { if (ultima.current === n) { setOpciones([]); setCargando(false); } });
    }, q ? 220 : 0);
    return () => clearTimeout(t);
  }, [q, abierto, buscar]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => { const t = ev.target as Node; if (caja.current && !caja.current.contains(t) && !lista.current?.contains(t)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  if (valor && !abierto) {
    return (
      <div className="buscador-elegido">
        <span><strong>{valor.nombre}</strong> · {valor.cif}{valor.detalle ? <span style={{ color: 'var(--gray-500)' }}> · {valor.detalle}</span> : null}</span>
        <button type="button" className="btn-ghost" style={{ padding: '0.15rem 0.6rem', flex: 'none', whiteSpace: 'nowrap' }} onClick={() => { setQ(''); setAbierto(true); }}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="buscador" ref={caja} data-envivo-ignorar="">
      <input id={id} type="search" value={q} autoFocus={autoFoco} placeholder={placeholder} autoComplete="off"
        onChange={(ev) => setQ(ev.target.value)} onFocus={() => setAbierto(true)}
        onKeyDown={(ev) => { if (ev.key === 'Escape') { setAbierto(false); (ev.target as HTMLInputElement).blur(); } }} />
      {abierto && (
        <ListaFlotante ancla={caja} lista={lista}>
          {cargando && !opciones && <div className="buscador-nada">Buscando…</div>}
          {opciones && opciones.length === 0 && !cargando && <div className="buscador-nada">{vacio}</div>}
          {opciones?.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={valor?.id === o.id} disabled={o.deshabilitada}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { onElegir(o); setAbierto(false); setQ(''); }}>
              <strong>{o.nombre}</strong> <span>· {o.cif}</span>{o.detalle ? <span className="buscador-detalle"> · {o.detalle}</span> : null}
            </button>
          ))}
          {opciones && opciones.length >= 12 && <div className="buscador-nada">Hay más: escribe algo más del nombre o del CIF.</div>}
          {extra && (
            <button type="button" className="buscador-extra" onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { setAbierto(false); setQ(''); extra.onClick(); }}>
              <strong>{extra.texto}</strong>
            </button>
          )}
        </ListaFlotante>
      )}
    </div>
  );
}
