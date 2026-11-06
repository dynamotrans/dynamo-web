'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { crearClienteRapido } from '@/app/panel/(app)/nuevo-envio/acciones';
import { buscarClientes } from '@/app/panel/(app)/sitios/acciones';
import SelectorPais from '@/components/SelectorPais';
import { ClienteOpcion, IcoCliente, norm } from './comun';

// ---- Buscador de cliente (con alta rápida) ----------------------------------------
export function CampoCliente({ clientes, valor, onElegir, onNuevo }: {
  clientes: ClienteOpcion[]; valor: ClienteOpcion | null;
  onElegir: (c: ClienteOpcion | null) => void; onNuevo: (c: ClienteOpcion) => void;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [alta, setAlta] = useState(false);
  const [rs, setRs] = useState(''); const [cif, setCif] = useState(''); const [pais, setPais] = useState('ES');
  const [error, setError] = useState<string | null>(null); const [guardando, setGuardando] = useState(false);
  // Los clientes que casan con lo escrito los busca la base de datos (buscar_clientes:
  // nombre, CIF, población, contactos…); mientras no se escribe, los pocos que ya vienen
  // con la pantalla (el de la vista o del envío base, o los dados de alta aquí).
  const [encontrados, setEncontrados] = useState<ClienteOpcion[] | null>(null);
  const ultima = useRef(0);
  useEffect(() => {
    const w = q.trim();
    if (!w) { setEncontrados(null); return; }
    const n = ++ultima.current;
    const t = setTimeout(() => {
      buscarClientes(w).then((r) => { if (ultima.current === n) setEncontrados(r.map((c) => ({ id: c.id, nombre: c.nombre, cif: c.cif, principal_id: c.principal_id, iva: c.iva_pct }))); })
        .catch(() => { if (ultima.current === n) setEncontrados([]); });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const lista = useMemo(() => {
    const w = norm(q.trim());
    const locales = clientes.filter((c) => !w || norm(c.nombre + ' ' + c.cif).includes(w));
    if (!w || !encontrados) return locales.slice(0, 8);
    const ids = new Set(locales.map((c) => c.id));
    return [...locales, ...encontrados.filter((c) => !ids.has(c.id))].slice(0, 12);
  }, [clientes, q, encontrados]);

  async function guardar() {
    setGuardando(true); setError(null);
    const r = await crearClienteRapido(rs, cif, pais);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onNuevo(r.cliente); setAlta(false); setRs(''); setCif('');
  }

  return (
    <>
      <div className={`ptar-input-wrap${valor ? ' ptar-picked' : ''}`}>
        <IcoCliente />
        <input type="text" placeholder="Cliente · busca por nombre o CIF" autoComplete="off" readOnly={!!valor}
          value={valor ? `${valor.nombre} · ${valor.cif}` : q}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
          onFocus={() => !valor && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
        {valor && <button type="button" className="ptar-clear" aria-label="Cambiar cliente" onClick={() => { onElegir(null); setQ(''); }}>✕</button>}
        {abierto && !valor && (
          <ul className="ptar-sug">
            {lista.map((c) => (
              <li key={c.id} onMouseDown={(e) => { e.preventDefault(); onElegir(c); setAbierto(false); }}>
                <strong>{c.nombre}</strong><span className="sug-dir">{c.cif}</span>
              </li>
            ))}
            {lista.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>No hay clientes con ese nombre o CIF.</li>}
            <li onMouseDown={(e) => { e.preventDefault(); setAlta(true); setRs(q); setAbierto(false); }}>
              <strong style={{ color: 'var(--purple)' }}>+ Dar de alta un cliente nuevo</strong>
            </li>
          </ul>
        )}
      </div>
      {alta && !valor && (
        <div className="ptar-admin-precio" style={{ marginTop: '0.6rem' }}>
          <div className="ptar-admin-precio-head">Cliente nuevo <span>· la ficha completa se rellena en Clientes</span></div>
          <label className="ptar-admin-precio-lbl" htmlFor="ne-rs">Razón social</label>
          <input id="ne-rs" type="text" value={rs} onChange={(e) => setRs(e.target.value)} placeholder="Ej. Marbex Industrial S.L." />
          <label className="ptar-admin-precio-lbl" htmlFor="ne-cif" style={{ marginTop: '0.6rem' }}>CIF / NIF</label>
          <input id="ne-cif" type="text" value={cif} onChange={(e) => setCif(e.target.value)} placeholder="Ej. B12345678" />
          <label className="ptar-admin-precio-lbl" htmlFor="ne-pais" style={{ marginTop: '0.6rem' }}>País</label>
          <SelectorPais id="ne-pais" valor={pais} onCambio={setPais} />
          {error && <div className="wiz-warn show">⚠ {error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Dar de alta'}</button>
            <button type="button" className="btn-ghost" onClick={() => { setAlta(false); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}
