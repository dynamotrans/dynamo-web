'use client';

// La barra de filtros de Envíos, calcada del mockup: buscador EN VIVO «por cualquier
// dato», desplegables Operador · Creado por · Fecha · Estado (este último solo en la
// pestaña Programadas) y Exportar. En móvil (≤768px) todo menos el buscador se pliega
// tras el botón «Filtros ▾», con un globito con el nº de filtros activos.
// Todo viaja por la URL y filtra LA BASE DE DATOS (envios_pagina / buscar_envios_pagina).
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import FiltroFechas from './FiltroFechas';

export type OpcionFiltro = { id: string; nombre: string };

export default function FiltrosEnvios({ f, q, op, por, est, fr, fd, fh, vistaCal, mes, placeholder, operadores, creadores, mostrarEstado }: {
  f: string; q: string; op: string; por: string; est: string; fr: string; fd: string; fh: string;
  vistaCal: boolean; mes: string; placeholder: string;
  operadores: OpcionFiltro[]; creadores: OpcionFiltro[];
  mostrarEstado: boolean;   // el desplegable de Estado solo vive en la pestaña Programadas
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const [abierto, setAbierto] = useState(false);   // «Filtros ▾» (solo pliega en móvil, por CSS)
  const [buscando, empezar] = useTransition();
  const primera = useRef(true);
  const escribiendo = useRef(false);
  useEffect(() => { if (!escribiendo.current) setTexto(q); }, [q]);

  function ir(cambios: Record<string, string>) {
    const v = { f: vistaCal ? '' : f, q: texto.trim().length >= 2 ? texto.trim() : '', op, por, est: mostrarEstado ? est : '', fr: vistaCal ? '' : fr, fd: vistaCal || fr !== 'entre' ? '' : fd, fh: vistaCal || fr !== 'entre' ? '' : fh,
      vista: vistaCal ? 'calendario' : '', mes: vistaCal ? mes : '', ...cambios };
    const u = new URLSearchParams();
    Object.entries(v).forEach(([k, x]) => { if (x) u.set(k, x); });
    empezar(() => router.replace(`/panel/envios${u.toString() ? `?${u}` : ''}`, { scroll: false }));
  }
  // El texto busca solo al dejar de escribir (una letra sola no busca: daría casi todo).
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const limpio = texto.trim();
    if (limpio === q || (limpio.length === 1 && !q)) return;
    const t = setTimeout(() => { escribiendo.current = false; ir({ q: limpio.length >= 2 ? limpio : '' }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const activos = [op, por, mostrarEstado ? est : '', vistaCal ? '' : fr, q].filter(Boolean).length;
  const sel = (valor: string, campo: string, etiqueta: string, opciones: { v: string; t: string }[]) => (
    <select className="filter-estado" value={valor} aria-label={`Filtrar por ${etiqueta.toLowerCase()}`}
      onChange={(ev) => ir({ [campo]: ev.target.value })}>
      <option value="">{etiqueta}</option>
      {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  );
  return (
    <div className={`filters filters-collapsible${abierto ? ' filters-open' : ''}`}>
      <input type="search" value={texto} placeholder={placeholder} aria-label="Buscar envíos" autoComplete="off"
        onChange={(ev) => { escribiendo.current = true; setTexto(ev.target.value); }}
        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); escribiendo.current = false; ir({ q: texto.trim() }); } }} />
      <button type="button" className="filters-toggle" aria-expanded={abierto} aria-label="Mostrar u ocultar filtros" onClick={() => setAbierto((v) => !v)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        Filtros
        {activos > 0 && <span className="filters-toggle-count">{activos}</span>}
        <svg className="filters-toggle-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {operadores.length > 0 && sel(op, 'op', 'Operador', [{ v: 'dynamo', t: 'Dynamo' }, ...operadores.map((o) => ({ v: o.id, t: o.nombre }))])}
      {creadores.length > 0 && sel(por, 'por', 'Creado por', creadores.map((o) => ({ v: o.id, t: o.nombre })))}
      {!vistaCal && <FiltroFechas futuro valor={fr} desde={fd} hasta={fh} etiqueta="Filtrar por fecha de carga"
        onCambio={(v, d, h) => ir({ fr: v, fd: v === 'entre' ? d : '', fh: v === 'entre' ? h : '' })} />}
      {!vistaCal && mostrarEstado && sel(est, 'est', 'Estado', [
        { v: 'programado', t: 'Programado' }, { v: 'hacia_la_carga', t: 'Hacia la carga' },
        { v: 'cargando', t: 'Cargando' }, { v: 'en_ruta', t: 'En ruta' },
        { v: 'veh:confirmada', t: 'Confirmado transportista' }, { v: 'veh:sin_asignar', t: 'Sin transportista' },
      ])}
      <Link href="/panel/exportaciones" className="btn-export" title="Exportar envíos (pantalla de Exportaciones, con todos los filtros y columnas)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        Exportar
      </Link>
      <span aria-live="polite" style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{buscando ? 'Buscando…' : ''}</span>
    </div>
  );
}
