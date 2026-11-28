'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CambioPendiente } from '@/lib/envios';

// ---- Contadores agrupados (usuario, 2026-11-28) ---------------------------------------------
// «Si confirmo 400 penalizaciones, ¿salen 400 filas con el contador? ¿Podemos agrupar y
// desplegable? Podría haber 20 o más alguna vez.» Con UN cambio corriendo se ve su barra, como
// siempre. Con DOS O MÁS, una sola barra resumen («N cambios… se confirman en X s») que despliega
// la lista de cada uno (cada cual con su «anular») y un botón para anularlos todos. Las barras de
// cada cambio siguen montadas aunque estén plegadas: así su cuenta y su ventana de resultado no
// se pierden.

type Item = { id: string; vivo: CambioPendiente | null };
type ResAnular = { ok: true; aviso?: string } | { ok: false; error: string };

const segundos = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

export default function GrupoContadores<T extends Item>({ items, pinta, anular, nombre }: {
  items: T[]; pinta: (x: T) => ReactNode; anular: (x: T) => Promise<ResAnular>; nombre: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const vivos = ahora ? items.filter((x) => x.vivo && segundos(x.vivo.vence_en) > 0) : items.filter((x) => x.vivo);
  const varios = vivos.length > 1;
  useEffect(() => {
    if (!varios) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [varios]);
  useEffect(() => { if (!varios) setConfirmar(false); }, [varios]);

  const lista = <>{items.map((x) => <div key={x.id}>{pinta(x)}</div>)}</>;
  const maxSeg = varios ? Math.max(...vivos.map((x) => segundos(x.vivo!.vence_en))) : 0;
  const anulables = vivos.filter((x) => x.vivo!.puede_anular);
  async function anularTodos() {
    setTrabajando(true);
    let bien = 0; let mal = 0;
    for (const x of anulables) {
      const r = await anular(x).catch(() => ({ ok: false as const, error: '' }));
      if (r.ok) bien++; else mal++;
    }
    setTrabajando(false); setConfirmar(false);
    setResultado(`${bien} ${bien === 1 ? 'cambio anulado' : 'cambios anulados'}${mal ? ` · ${mal} no se ${mal === 1 ? 'ha' : 'han'} podido anular (su plazo ya había terminado)` : ''}.`);
    router.refresh();
  }

  // La misma estructura siempre (con uno o con varios): así las barras no se vuelven a montar al
  // pasar de varios a uno y no se pierde la ventana con el resultado de anular.
  return (
    <div className={varios ? 'cc-grupo' : undefined} data-abierto={abierto ? '1' : '0'}>
      {varios && (
        <button type="button" className="cc-barra cc-grupo-cab" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls="cc-grupo-lista">
          <span className="cc-grupo-n" aria-hidden="true">{vivos.length}</span>
          <span className="cc-barra-txt">
            <strong>{vivos.length} cambios en {nombre}: se confirman en <span suppressHydrationWarning>{maxSeg} s</span></strong>
            <span>{abierto ? 'Pulsa para plegar la lista.' : '¿Te has equivocado? Pulsa para ver la lista y anular uno o todos.'}</span>
          </span>
          <svg className="cc-grupo-flecha" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
      <div id="cc-grupo-lista" className={varios ? 'cc-grupo-lista' : undefined} hidden={varios && !abierto}>
        {varios && anulables.length > 1 && (
          <div className="cc-grupo-todos">
            {confirmar
              ? <>
                  <span>¿Anular los {anulables.length} cambios? Cada {nombre === 'incidencias' ? 'incidencia' : 'penalización'} vuelve a como estaba y no se avisa a nadie.</span>
                  <button type="button" className="btn-ghost" onClick={() => setConfirmar(false)} disabled={trabajando}>No</button>
                  <button type="button" className="btn-primary" style={{ background: 'var(--red)' }} onClick={anularTodos} disabled={trabajando}>{trabajando ? 'Anulando…' : `Sí, anular los ${anulables.length}`}</button>
                </>
              : <button type="button" className="btn-secondary" onClick={() => setConfirmar(true)}>Anular todos ({anulables.length})</button>}
          </div>
        )}
        {lista}
      </div>
      {resultado && <div className="pt-aviso info" role="status" style={{ margin: '0 0 0.8rem' }}>{resultado}</div>}
    </div>
  );
}
