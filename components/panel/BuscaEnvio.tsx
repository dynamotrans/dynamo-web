'use client';

// «Envío referenciado» del mockup (.pen-ac): con el campo vacío salen los últimos 4; al
// escribir busca en todo (nº, pedido, cliente, ruta, matrícula, transportista, fecha). Al
// elegirlo, debajo sale su resumen (.pen-envio-sum), con los precios solo para Dynamo.
import { useMemo, useRef, useState, useEffect } from 'react';
import type { EnvioLigero } from '@/lib/enviosLigeros';
import { euros, fecha, ventana, ESTADO_ENVIO } from '@/lib/formato';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const blob = (e: EnvioLigero) => norm([e.referencia_gx, e.referencia_cliente, e.cliente, e.transportista, e.origen, e.destino,
  e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.descripcion_mercancia, fecha(e.fecha_carga_desde), ESTADO_ENVIO[e.estado]].filter(Boolean).join(' '));

export function ResumenEnvio({ e }: { e: EnvioLigero }) {
  const fila = (k: string, v: React.ReactNode) => (v ? <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v}</span></div> : null);
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null, pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  const mat = [e.matricula_camion, e.matricula_remolque && `R: ${e.matricula_remolque}`, e.conductor_nombre].filter(Boolean).join(' · ');
  return (
    <div className="pen-envio-sum" style={{ marginTop: '0.5rem' }}>
      {fila('Envío', <><strong>#{e.referencia_gx}</strong>{e.referencia_cliente ? ` · ${e.referencia_cliente}` : ''}</>)}
      {fila('Estado', `${ESTADO_ENVIO[e.estado] ?? e.estado}${e.es_manual ? ' · con su operador' : ''}`)}
      {fila('Cliente', e.cliente)}
      {fila('Transportista', e.transportista ?? 'Sin asignar / pendiente')}
      {fila('Matrícula', mat)}
      {fila('Fecha / días de recogida', ventana(e.fecha_carga_desde, e.fecha_carga_hasta))}
      {fila('Fecha de carga real', e.fecha_carga_real ? fecha(e.fecha_carga_real) : null)}
      {fila('Entrega estimada', e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : null)}
      {fila('Ruta', `${e.origen || '—'} → ${e.destino || '—'}`)}
      {fila('Mercancía', [e.descripcion_mercancia, e.metros_lineales != null && `${String(e.metros_lineales).replace('.', ',')} m`, e.toneladas != null && `${String(e.toneladas).replace('.', ',')} Tn`].filter(Boolean).join(' · '))}
      {pc != null && fila('P. cliente · base sin IVA', euros(pc))}
      {pt != null && fila('P. transportista · base sin IVA', euros(pt))}
      {pc != null && pt != null && fila('Margen · base sin IVA', <span style={{ color: pc - pt >= 0 ? '#0f6b3a' : 'var(--red)', fontWeight: 700 }}>{euros(pc - pt)}</span>)}
    </div>
  );
}

export default function BuscaEnvio({ envios, valor, onCambio, disabled, placeholder }: {
  envios: EnvioLigero[]; valor: string | null; onCambio: (id: string | null) => void; disabled?: boolean; placeholder?: string;
}) {
  const elegido = useMemo(() => envios.find((e) => e.id === valor) ?? null, [envios, valor]);
  const [q, setQ] = useState(elegido ? `#${elegido.referencia_gx}` : '');
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const indice = useMemo(() => envios.map((e) => ({ e, b: blob(e) })), [envios]);

  useEffect(() => { setQ(elegido ? `#${elegido.referencia_gx}` : ''); }, [elegido]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => { if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const lista = useMemo(() => {
    const w = norm(q.replace(/^#/, '').trim());
    if (!w || (elegido && q === `#${elegido.referencia_gx}`)) return envios.slice(0, 4);
    const tokens = w.split(/\s+/);
    return indice.filter(({ b }) => tokens.every((t) => b.includes(t))).slice(0, 8).map(({ e }) => e);
  }, [q, indice, envios, elegido]);

  return (
    <>
      <div className="pen-ac" ref={caja}>
        <input type="text" value={q} disabled={disabled} autoComplete="off" placeholder={placeholder ?? 'Busca por nº, pedido, cliente, ruta, matrícula, fecha…'}
          onFocus={() => setAbierto(true)}
          onChange={(ev) => { setQ(ev.target.value); setAbierto(true); if (valor) onCambio(null); }} />
        {abierto && !disabled && (
          <div className="pen-ac-sug">
            {lista.length === 0 ? <div className="pen-ac-empty">Sin envíos que coincidan</div> : lista.map((e) => (
              <button type="button" key={e.id} className="pen-ac-item" onClick={() => { onCambio(e.id); setQ(`#${e.referencia_gx}`); setAbierto(false); }}>
                <strong>#{e.referencia_gx}</strong>{e.referencia_cliente ? <> <span className="pen-ac-cli">{e.referencia_cliente}</span></> : null}
                {e.cliente ? <> <span className="pen-ac-cli">· {e.cliente}</span></> : null}
                <div className="pen-ac-route">{e.origen || '—'} → {e.destino || '—'} · {fecha(e.fecha_carga_desde)} · {e.transportista ?? 'sin transportista'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {elegido && <ResumenEnvio e={elegido} />}
    </>
  );
}
