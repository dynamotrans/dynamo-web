'use client';

import { useCallback, useEffect, useState } from 'react';
import { crearPack, packsDeGrupaje, type InfoPack, type PackPosible } from '@/app/panel/(app)/packs/acciones';
import { BarraCapacidad, FilaPartida } from './ficha/PackGrupaje';
import { ventana } from '@/lib/formato';
import { SIN_CONEXION } from '@/lib/mensajeError';
import Cargando from '@/components/Cargando';

// Pantalla «Packs de grupaje» (usuario, 2026-11-23): arriba los packs posibles (partidas
// libres por la misma ruta de provincias, con un día de carga en común y que caben en el
// tráiler) para crearlos con un botón; debajo los ya creados.
export default function PacksGrupaje() {
  const [datos, setDatos] = useState<{ creados: InfoPack[]; posibles: PackPosible[] } | null | undefined>(undefined);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const cargar = useCallback(() => { packsDeGrupaje().then(setDatos).catch(() => setDatos(null)); }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear(i: number, p: PackPosible) {
    setTrabajando(i); setAviso(null);
    try {
      const r = await crearPack(p.partidas.map((x) => x.id), null);
      setAviso(r.ok ? { ok: true, txt: `Pack ${r.codigo ?? ''} creado.` } : { ok: false, txt: r.error });
      if (r.ok) cargar();
    } catch { setAviso({ ok: false, txt: SIN_CONEXION }); } finally { setTrabajando(null); }
  }

  return (
    <section className="section active">
      <div className="section-header"><h2>Packs de grupaje</h2></div>
      <p style={{ maxWidth: 760, color: 'var(--gray-600)', margin: '0 0 1rem' }}>
        Grupajes programados y sin transportista que van de la misma provincia a la misma provincia, con al menos un día de carga
        en común y que caben juntos en un tráiler (13,30 m y 24 Tn). Para añadir partidas que le pillan al paso, abre una partida del pack.
      </p>
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} role="status" style={{ maxWidth: 880, marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {datos === undefined && <Cargando />}
      {datos === null && <div className="pt-aviso error"><div>No se han podido cargar los packs. Recarga la página.</div></div>}
      {datos && <div className="packs-lista">
        <h3 style={{ margin: '0.4rem 0 0' }}>Packs posibles ({datos.posibles.length})</h3>
        {datos.posibles.length === 0 && <p style={{ color: 'var(--gray-600)' }}>Ahora mismo no hay partidas que se puedan juntar.</p>}
        {datos.posibles.map((p, i) => (
          <div key={p.partidas.map((x) => x.id).join()} className="pack-box" data-pack-posible>
            <div className="pack-cab"><span><b>{p.partidas.length} partidas</b> · {p.origen} → {p.destino}</span></div>
            <BarraCapacidad ml={Number(p.metros_lineales)} tn={Number(p.toneladas)} />
            <div className="pack-dias">Día de carga común: <b>{ventana(p.desde, p.hasta)}</b></div>
            {p.partidas.map((x) => <FilaPartida key={x.id} p={x} />)}
            <button type="button" className="btn-primary" disabled={trabajando !== null} onClick={() => crear(i, p)}>
              {trabajando === i ? 'Creando…' : 'Crear pack'}
            </button>
          </div>
        ))}
        <h3 style={{ margin: '0.8rem 0 0' }}>Packs creados ({datos.creados.length})</h3>
        {datos.creados.length === 0 && <p style={{ color: 'var(--gray-600)' }}>Aún no hay packs.</p>}
        {datos.creados.map((k) => (
          <div key={k.pack?.id} className="pack-box" data-pack-creado>
            <div className="pack-cab"><span>Pack <b>{k.pack?.codigo}</b>{k.pack?.estado === 'asignado' ? ' · asignado' : ''}</span><span className="pack-ruta">{k.ruta?.origen} → {k.ruta?.destino}</span></div>
            <BarraCapacidad ml={Number(k.metros_lineales ?? 0)} tn={Number(k.toneladas ?? 0)} />
            <div className="pack-dias">Día de carga común: <b>{ventana(k.desde, k.hasta)}</b></div>
            {(k.partidas ?? []).map((x) => <FilaPartida key={x.id} p={x} />)}
          </div>
        ))}
      </div>}
    </section>
  );
}
