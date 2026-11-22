'use client';

import { useEffect, useState } from 'react';
import { autorrellenoActivo, buscarEnRegistro } from '@/app/panel/(app)/autorrelleno/acciones';
import type { EmpresaRegistro } from '@/lib/apiEmpresas';

// Buscador del Registro (APIEmpresas.es) para rellenar los datos de una empresa nueva
// (usuario, 2026-11-22). No sale nada si el autorrelleno está apagado. Se busca al pulsar
// «Buscar» o Intro (cada búsqueda puede costar una consulta del bono). Al elegir una empresa se
// rellenan los campos, que siguen siendo editables.
export default function BuscarEnRegistro({ onElegir, id = 'registro-q' }: { onElegir: (e: EmpresaRegistro) => void; id?: string }) {
  const [activo, setActivo] = useState(false);
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<EmpresaRegistro[] | null>(null);
  useEffect(() => { autorrellenoActivo().then(setActivo).catch(() => {}); }, []);
  if (!activo) return null;
  async function buscar() {
    if (buscando || !q.trim()) return;
    setBuscando(true); setError(null); setLista(null);
    const r = await buscarEnRegistro(q).catch(() => ({ ok: false as const, error: 'Ahora no se puede buscar en el Registro. Rellena los datos a mano.' }));
    setBuscando(false);
    if (!r.ok) { if (r.error) setError(r.error); return; }
    if (r.empresas.length === 1) { onElegir(r.empresas[0]); setLista(null); setQ(''); return; }
    setLista(r.empresas);
  }
  return (
    <div style={{ gridColumn: '1/-1', padding: '0.7rem 0.8rem', border: '1px dashed var(--gray-300)', borderRadius: 10, background: 'var(--gray-50)' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '0.3rem' }}>
        Rellenar desde el Registro Mercantil (opcional)
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input id={id} type="text" value={q} placeholder="Nombre de la empresa o CIF" autoComplete="off" style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
        <button type="button" className="btn-secondary" onClick={buscar} disabled={buscando || !q.trim()}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {error && <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-s)', color: 'var(--gray-700)' }}>{error}</div>}
      {lista && (
        <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'grid', gap: '0.3rem' }}>
          {lista.map((e) => (
            <li key={e.cif}>
              <button type="button" className="btn-ghost" style={{ width: '100%', textAlign: 'left' }} onClick={() => { onElegir(e); setLista(null); setQ(''); }}>
                <strong>{e.razon_social}</strong> · {e.cif}{e.poblacion ? ` · ${e.poblacion}` : ''}{e.estado && !/activ/i.test(e.estado) ? ` · ${e.estado}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: '0.35rem', fontSize: 'var(--fs-xs, 0.75rem)', color: 'var(--gray-500)' }}>Los datos se rellenan abajo y los puedes cambiar.</div>
    </div>
  );
}
