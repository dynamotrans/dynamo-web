'use client';

// «Envío referenciado» del mockup (.pen-ac): con el campo vacío salen los últimos 4; al
// escribir busca en todo (nº, pedido, cliente, ruta, matrícula, transportista, fecha). Al
// elegirlo, debajo sale su resumen (.pen-envio-sum), con los precios solo para Dynamo.
import { useMemo, useRef, useState, useEffect } from 'react';
import type { EnvioLigero } from '@/lib/enviosLigeros';
import { euros, fecha, ventana, ESTADO_ENVIO, pesoTn, metros } from '@/lib/formato';
import { buscarEnviosLigeros, envioLigero } from '@/lib/enviosLigerosAcciones';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const blob = (e: EnvioLigero) => norm([e.referencia_gx, e.referencia_cliente, e.cliente, e.transportista, e.origen, e.destino,
  e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.descripcion_mercancia, fecha(e.fecha_carga_desde), ESTADO_ENVIO[e.estado]].filter(Boolean).join(' '));

// Sin cliente_id = lista del propio CLIENTE (etapa B): sin transportista ni datos internos.
export function ResumenEnvio({ e }: { e: EnvioLigero }) {
  const fila = (k: string, v: React.ReactNode) => (v ? <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v}</span></div> : null);
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null, pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  const mat = [e.matricula_camion, e.matricula_remolque && `R: ${e.matricula_remolque}`, e.conductor_nombre].filter(Boolean).join(' · ');
  return (
    <div className="pen-envio-sum" style={{ marginTop: '0.5rem' }}>
      {fila('Envío', <><strong>#{e.referencia_gx}</strong>{e.referencia_cliente ? ` · ${e.referencia_cliente}` : ''}</>)}
      {fila('Estado', `${ESTADO_ENVIO[e.estado] ?? e.estado}${e.es_manual ? ' · con su operador' : ''}`)}
      {fila('Cliente', e.cliente)}
      {e.cliente_id && fila('Transportista', e.transportista ?? 'Sin asignar / pendiente')}
      {fila('Matrícula', mat)}
      {fila('Fecha / días de recogida', ventana(e.fecha_carga_desde, e.fecha_carga_hasta))}
      {fila('Fecha de carga real', e.fecha_carga_real ? fecha(e.fecha_carga_real) : null)}
      {fila('Entrega estimada', e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : null)}
      {fila('Ruta', `${e.origen || '—'} → ${e.destino || '—'}`)}
      {fila('Mercancía', [e.descripcion_mercancia, e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && pesoTn(e.toneladas)].filter(Boolean).join(' · '))}
      {pc != null && fila(e.cliente_id ? 'P. cliente · base sin IVA' : 'Precio · base sin IVA', euros(pc))}
      {pt != null && fila('P. transportista · base sin IVA', euros(pt))}
      {pc != null && pt != null && fila('Margen · base sin IVA', <span style={{ color: pc - pt >= 0 ? '#0f6b3a' : 'var(--red)', fontWeight: 700 }}>{euros(pc - pt)}</span>)}
    </div>
  );
}

// `remoto` (Dynamo): con el campo vacío salen los recientes; al escribir busca en la base
// de datos (da igual que haya miles). Sin `remoto` (cliente, transportista): busca en su
// propia lista, que ya viene entera.
export default function BuscaEnvio({ envios, valor, onCambio, disabled, placeholder, remoto = false }: {
  envios: EnvioLigero[]; valor: string | null; onCambio: (id: string | null) => void; disabled?: boolean; placeholder?: string; remoto?: boolean;
}) {
  const [extra, setExtra] = useState<EnvioLigero[]>([]);   // traídos del servidor (búsquedas y el elegido)
  const elegido = useMemo(() => envios.find((e) => e.id === valor) ?? extra.find((e) => e.id === valor) ?? null, [envios, extra, valor]);
  const [q, setQ] = useState(elegido ? `#${elegido.referencia_gx}` : '');
  const [abierto, setAbierto] = useState(false);
  const [remotos, setRemotos] = useState<EnvioLigero[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const indice = useMemo(() => envios.map((e) => ({ e, b: blob(e) })), [envios]);

  useEffect(() => { setQ(elegido ? `#${elegido.referencia_gx}` : ''); }, [elegido]);
  // El elegido no está entre los recientes (ficha antigua): se trae él solo.
  useEffect(() => {
    if (!remoto || !valor || elegido) return;
    let vivo = true;
    envioLigero(valor).then((e) => { if (vivo && e) setExtra((x) => [...x, e]); });
    return () => { vivo = false; };
  }, [remoto, valor, elegido]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => { if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const texto = q.replace(/^#/, '').trim();
  const sinBuscar = !texto || (elegido != null && q === `#${elegido.referencia_gx}`);
  useEffect(() => {
    if (!remoto || sinBuscar) { setRemotos(null); return; }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarEnviosLigeros(texto);
      if (!vivo) return;
      setRemotos(r); setBuscando(false);
      setExtra((x) => [...x.filter((e) => !r.some((n) => n.id === e.id)), ...r]);
    }, 280);
    return () => { vivo = false; clearTimeout(t); };
  }, [remoto, texto, sinBuscar]);

  const lista = useMemo(() => {
    if (sinBuscar) return envios.slice(0, 4);
    if (remoto) return remotos ?? [];
    const tokens = norm(texto).split(/\s+/);
    return indice.filter(({ b }) => tokens.every((t) => b.includes(t))).slice(0, 8).map(({ e }) => e);
  }, [sinBuscar, remoto, remotos, texto, indice, envios]);

  return (
    <>
      <div className="pen-ac" ref={caja}>
        <input type="text" value={q} disabled={disabled} autoComplete="off" placeholder={placeholder ?? 'Busca por nº, pedido, cliente, ruta, matrícula, fecha…'}
          onFocus={() => setAbierto(true)}
          onChange={(ev) => { setQ(ev.target.value); setAbierto(true); if (valor) onCambio(null); }} />
        {abierto && !disabled && (
          <div className="pen-ac-sug">
            {remoto && !sinBuscar && (buscando || remotos === null) ? <div className="pen-ac-empty">Buscando…</div>
              : lista.length === 0 ? <div className="pen-ac-empty">Sin envíos que coincidan</div> : lista.map((e) => (
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
