'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearPack, deshacerPack, infoPack, quitarDePack, type InfoPack, type PartidaPack } from '@/app/panel/(app)/packs/acciones';
import { metros, pesoTn, ventana, numero } from '@/lib/formato';
import { SIN_CONEXION } from '@/lib/mensajeError';

// PACKS DE GRUPAJE en la ficha de Dynamo (usuario, 2026-11-23): un recuadro propio que dice
// en qué pack va el envío o con qué partidas se puede juntar (misma ruta de provincias o al
// paso, con un día de carga en común). Nunca deja pasar del tráiler: 13,30 m y 24 t.
export const ML_MAX = 13.3;
export const TN_MAX = 24;

const n = (x: number | null | undefined) => Number(x ?? 0);

export function BarraCapacidad({ ml, tn }: { ml: number; tn: number }) {
  const pm = Math.min(100, (ml / ML_MAX) * 100), pt = Math.min(100, (tn / TN_MAX) * 100);
  return (
    <div className="pack-cap">
      <div><span>Metros</span><i><em style={{ width: `${pm}%` }} className={ml > ML_MAX ? 'mal' : ''} /></i><b>{numero(ml, 2)} / 13,30 m</b></div>
      <div><span>Peso</span><i><em style={{ width: `${pt}%` }} className={tn > TN_MAX ? 'mal' : ''} /></i><b>{numero(tn, 2)} / 24 Tn</b></div>
    </div>
  );
}

export function FilaPartida({ p, actual, extra }: { p: PartidaPack; actual?: boolean; extra?: React.ReactNode }) {
  return (
    <div className={`pack-partida${actual ? ' actual' : ''}`}>
      <div className="pp-1">
        <a href={`/panel/envios?ver=${p.id}`}>#{p.referencia_gx}</a>
        {p.tipo === 'misma_ruta' && <span className="pack-chip ruta">Misma ruta</span>}
        {p.tipo === 'al_paso' && <span className="pack-chip paso">Al paso</span>}
        {actual && <span className="pack-chip">Este envío</span>}
        <span className="pp-cli">{p.cliente}</span>
      </div>
      <div className="pp-2">{p.origen} → {p.destino}</div>
      <div className="pp-3">{metros(p.metros_lineales)} · {pesoTn(p.toneladas)} · Carga {ventana(p.desde, p.hasta)}</div>
      {extra}
    </div>
  );
}

export function PackGrupaje({ envioId, puedeEditar }: { envioId: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [info, setInfo] = useState<InfoPack | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    infoPack(envioId).then((i) => { setInfo(i); setMarcadas(new Set()); }).catch(() => setInfo(null));
  }, [envioId]);
  useEffect(() => { cargar(); }, [cargar]);

  // Lo que suman el pack (o este envío) más las marcadas, y el día común: no se deja marcar
  // una partida que haría pasar del tráiler o dejaría sin día en común.
  const base = useMemo(() => {
    const ps = info?.partidas ?? [];
    return { ml: ps.reduce((a, p) => a + n(p.metros_lineales), 0), tn: ps.reduce((a, p) => a + n(p.toneladas), 0) };
  }, [info]);
  const suma = useMemo(() => {
    const ms = (info?.compatibles ?? []).filter((c) => marcadas.has(c.id));
    let desde = info?.desde ?? '', hasta = info?.hasta ?? '';
    for (const c of ms) { if ((c.desde ?? '') > desde) desde = c.desde ?? ''; if ((c.hasta ?? '') < hasta) hasta = c.hasta ?? ''; }
    return { ml: base.ml + ms.reduce((a, p) => a + n(p.metros_lineales), 0), tn: base.tn + ms.reduce((a, p) => a + n(p.toneladas), 0), desde, hasta };
  }, [info, marcadas, base]);
  const puedeMarcar = (c: PartidaPack) => {
    if (marcadas.has(c.id)) return true;
    if (suma.ml + n(c.metros_lineales) > ML_MAX + 1e-9 || suma.tn + n(c.toneladas) > TN_MAX + 1e-9) return false;
    return (c.desde ?? '') <= suma.hasta && (c.hasta ?? '') >= suma.desde;
  };

  if (!info) return null;
  const enPack = !!info.pack;
  if (!enPack && (info.motivo || info.compatibles.length === 0)) return null;

  async function hacer(f: () => Promise<{ ok: boolean; error?: string }>) {
    setTrabajando(true); setAviso(null);
    try {
      const r = await f();
      if (!r.ok) { setAviso(r.error ?? 'No se ha podido guardar.'); return; }
      cargar(); router.refresh();
    } catch { setAviso(SIN_CONEXION); } finally { setTrabajando(false); }
  }

  const abierto = !enPack || info.pack!.estado === 'abierto';
  return (
    <section className="pack-box" data-pack-box>
      <div className="pack-cab">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>
        {enPack
          ? <span>Pack de grupaje <b>{info.pack!.codigo}</b>{info.pack!.estado === 'asignado' ? ' · asignado' : ''}</span>
          : <span>Se puede agrupar: <b>{info.compatibles.length}</b> {info.compatibles.length === 1 ? 'partida compatible' : 'partidas compatibles'}</span>}
        <span className="pack-ruta">{info.ruta?.origen} → {info.ruta?.destino}</span>
      </div>
      {enPack && <>
        <BarraCapacidad ml={base.ml} tn={base.tn} />
        <div className="pack-dias">Día de carga común a todas: <b>{ventana(info.desde, info.hasta)}</b></div>
        {(info.partidas ?? []).map((p) => (
          <FilaPartida key={p.id} p={p} actual={p.id === envioId}
            extra={puedeEditar && abierto ? <button type="button" className="pack-quitar" disabled={trabajando} onClick={() => hacer(() => quitarDePack(p.id))}>Quitar del pack</button> : null} />
        ))}
        {info.pack!.estado === 'abierto' && <p className="pack-nota">Al asignar un transportista a una partida, se le asignan todas (mismo camión, mismo día). Si un transportista acepta una partida suelta, esa sale del pack.</p>}
      </>}
      {abierto && info.compatibles.length > 0 && <>
        <div className="pack-sub">{enPack ? 'Se pueden añadir' : 'Partidas con la misma ruta de provincias (o al paso) y un día de carga en común'}</div>
        {info.compatibles.map((c) => {
          const ok = puedeMarcar(c);
          return (
            <FilaPartida key={c.id} p={c} extra={puedeEditar ? (
              <label className={`pack-marca${ok ? '' : ' no'}`}>
                <input type="checkbox" checked={marcadas.has(c.id)} disabled={!ok || trabajando}
                  onChange={(ev) => setMarcadas((s) => { const x = new Set(s); if (ev.target.checked) x.add(c.id); else x.delete(c.id); return x; })} />
                {ok ? (enPack ? 'Añadir al pack' : 'Juntar') : (c.cabe === false || suma.ml + n(c.metros_lineales) > ML_MAX || suma.tn + n(c.toneladas) > TN_MAX ? 'No cabe en el tráiler' : 'Sin día en común')}
              </label>
            ) : null} />
          );
        })}
        {puedeEditar && marcadas.size > 0 && <>
          <BarraCapacidad ml={suma.ml} tn={suma.tn} />
          <div className="pack-dias">Día de carga común: <b>{ventana(suma.desde, suma.hasta)}</b></div>
          <button type="button" className="btn-primary" disabled={trabajando}
            onClick={() => hacer(() => crearPack(enPack ? [...marcadas] : [envioId, ...marcadas], enPack ? info.pack!.id : null))}>
            {enPack ? `Añadir ${marcadas.size} al pack` : `Crear pack con ${marcadas.size + 1} partidas`}
          </button>
        </>}
      </>}
      {enPack && puedeEditar && abierto && (
        <button type="button" className="btn-ghost pack-deshacer" disabled={trabajando} onClick={() => hacer(() => deshacerPack(info.pack!.id))}>Deshacer el pack</button>
      )}
      {aviso && <div className="pt-aviso error" role="alert" style={{ marginTop: '0.6rem' }}><div>{aviso}</div></div>}
    </section>
  );
}
