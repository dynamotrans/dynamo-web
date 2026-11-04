'use client';

// «Ver como», arriba a la izquierda (solo equipo de Dynamo): en qué perfil estás y, al
// pulsarlo, cambiar a la vista de gestión interna o a la de un cliente o un transportista
// concreto. Al cambiar, el menú lateral pasa a ser el de ese perfil y se ven solo sus datos.
// Colores: gestión interna morado · cliente azul · transportista naranja.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarVista } from '@/app/panel/vista';
import { inicioDe, type OpcionVista, type Vista } from '@/lib/vistaTipo';
import Cargando from '@/components/Cargando';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ICO = {
  admin: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  cliente: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>,
  transportista: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
};
export const VISTA_TXT = { admin: 'Gestión interna', cliente: 'Cliente', transportista: 'Transportista' } as const;

export default function SelectorVista({ vista, rolTxt, clientes, transportistas, abierto, onAbrir }: {
  vista: Vista; rolTxt: string; clientes: OpcionVista[]; transportistas: OpcionVista[];
  abierto: boolean; onAbrir: (v: boolean) => void;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<null | 'cliente' | 'transportista'>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const lista = useMemo(() => {
    const w = norm(q.trim()).split(/\s+/).filter(Boolean);
    const base = paso === 'cliente' ? clientes : paso === 'transportista' ? transportistas : [];
    return base.filter((o) => w.every((t) => norm(o.nombre).includes(t))).slice(0, 60);
  }, [paso, q, clientes, transportistas]);

  function elegir(tipo: Vista['tipo'], id?: string) {
    setError(null);
    start(async () => {
      const r = await cambiarVista(tipo, id);
      if (!r.ok) { setError(r.error); return; }
      onAbrir(false); setPaso(null); setQ('');
      router.push(inicioDe(tipo)); router.refresh();
    });
  }
  const etiqueta = vista.tipo === 'admin' ? rolTxt : vista.nombre;
  const opcion = (tipo: Vista['tipo'], titulo: string, sub: string, activo: boolean, accion: () => void) => (
    <button type="button" role="menuitem" className={`topbar-contact-item vista-op vista-${tipo}${activo ? ' activa' : ''}`} onClick={accion}>
      <span className={`vista-ico vista-${tipo}`}>{ICO[tipo]}</span>
      <div className="topbar-contact-text"><span className="t">{titulo}</span><span className="h">{sub}</span></div>
      {activo && <span className="vista-check" aria-label="Vista actual">✓</span>}
    </button>
  );

  return (
    <div className="topbar-contact-wrap">
      <button type="button" className={`topbar-contact-btn vista-btn vista-${vista.tipo}`} aria-haspopup="menu" aria-expanded={abierto}
              aria-label={`Vista: ${VISTA_TXT[vista.tipo]} ${etiqueta}. Cambiar de vista`}
              onClick={(e) => { e.stopPropagation(); onAbrir(!abierto); setPaso(null); setQ(''); }}>
        <span className={`vista-ico vista-${vista.tipo}`}>{ICO[vista.tipo]}</span>
        <span className="topbar-contact-label"><span className="t-pre">Viendo como: {VISTA_TXT[vista.tipo]}</span> <span className="t-name vista-nombre">{etiqueta}</span></span>
        <svg className="topbar-contact-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <div className={`topbar-contact-menu vista-menu${abierto ? ' open' : ''}`} role="menu" aria-hidden={!abierto} onClick={(e) => e.stopPropagation()}>
        {!paso ? (
          <>
            <div className="vista-titulo">Ver la plataforma como…</div>
            {opcion('admin', `${VISTA_TXT.admin} · ${rolTxt}`, 'Tu menú de Dynamo, con todo', vista.tipo === 'admin', () => elegir('admin'))}
            {opcion('cliente', vista.tipo === 'cliente' ? `Cliente · ${vista.nombre}` : 'Un cliente…', vista.tipo === 'cliente' ? 'Pulsa para elegir otro' : 'Su menú y solo sus datos', vista.tipo === 'cliente', () => { setPaso('cliente'); setQ(''); })}
            {opcion('transportista', vista.tipo === 'transportista' ? `Transportista · ${vista.nombre}` : 'Un transportista…', vista.tipo === 'transportista' ? 'Pulsa para elegir otro' : 'Su menú y solo sus viajes', vista.tipo === 'transportista', () => { setPaso('transportista'); setQ(''); })}
            <div className="topbar-contact-sep" />
            <div className="vista-nota">Cambiar de vista no cambia tus permisos: sigues siendo {rolTxt}.</div>
          </>
        ) : (
          <>
            <button type="button" className="vista-volver" onClick={() => setPaso(null)}>← Volver</button>
            <div className="vista-titulo">Elige {paso === 'cliente' ? 'el cliente' : 'el transportista'}</div>
            <input type="search" className="param-input vista-buscar" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder={paso === 'cliente' ? 'Buscar cliente…' : 'Buscar transportista…'} aria-label="Buscar" />
            <div className="vista-lista">
              {lista.length === 0 && <div className="vista-nota">Ninguno coincide.</div>}
              {lista.map((o) => (
                <button key={o.id} type="button" role="menuitem" className={`vista-fila vista-${paso}${vista.id === o.id ? ' activa' : ''}`} onClick={() => elegir(paso, o.id)}>
                  {o.nombre}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <div className="vista-nota" style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
      </div>
      {pendiente && <Cargando texto="Cambiando de vista" />}
    </div>
  );
}
