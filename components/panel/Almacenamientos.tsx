'use client';

// Almacenamientos (solo Dynamo): tabla y ficha con el diseño de #sec-almacenes de
// dashboard.html (pestañas por estado; columnas Almacenamiento · Almacén · Entrada ·
// Salida · Reparto urbano · Total sin IVA · Estado; precio con la caja .alm-price).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Historial from './Historial';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { guardarAlmacenamiento, cambiarEstadoAlmacenamiento, marcarPagadoAlmacenamiento, sitiosDelCliente, pedirAlmacenamiento, cancelarMiAlmacenamiento, type AlmacenamientoDatos, type EstadoAlm } from '@/app/panel/(app)/almacenamientos/acciones';
import { precioAlmacenamiento, diasAlmacen } from '@/lib/almacenamiento';
import { euros, fecha } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';

export type AlmacenamientoFila = AlmacenamientoDatos & {
  id: string; codigo: string; cliente: string | null; almacen: string; almacen_provincia: string; almacen_dir: string; entrega: string | null;
  importe_almacenaje: number | null; importe_reparto: number | null; importe_total: number; iva_pct: number;
  requiere_pago_previo: boolean; pagado_en: string | null; estado: EstadoAlm; creado_en: string; modificado_en: string | null;
  descripcion: string; referencia_cliente: string; anotaciones: string;
};
export type AlmacenOpcion = { id: string; nombre: string; provincia: string; dir: string; disponible: boolean; semana: number; reparto: number };
type Cliente = { id: string; nombre_visible: string; riesgo_efectivo_euros: number | null };
// Cuando la pantalla la abre un CLIENTE: sus sitios para el reparto y si tiene crédito.
type ModoCliente = { sitios: { id: string; nombre: string; linea: string }[]; conCredito: boolean };

const ESTADOS: [EstadoAlm, string, string, string][] = [
  ['pendiente_confirmar', 'Pendiente confirmar almacén', 'Pendiente de confirmar', 'orange'],
  ['confirmado', 'Programados', 'Programado', 'prog'],
  ['en_almacen', 'En almacén', 'En almacén', 'blue'],
  ['finalizado', 'Finalizados', 'Finalizado', 'entregado'],
  ['cancelado', 'Cancelados', 'Cancelado', 'cancelada'],
];
const REPARTOS: [number, string][] = [
  [0, 'No — lo recoge el cliente o se pide un transporte aparte'], [1, '1 camión de 4 m · 4 metros total'], [2, '2 camiones de 4 m · 8 metros total'],
  [3, '3 camiones de 4 m · 12 metros total (casi tráiler completo 13,30 m)'], [4, '4 camiones de 4 m · 16 metros (tráiler completo 13,30 m)'],
];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const diaMadrid = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ts));
const masDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const IcoAlm = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-5 9 5v12" /><path d="M3 21h18" /><rect x="8" y="13" width="8" height="8" /></svg>;
// Pago por adelantado sin validar (lo cancelado no cuenta).
const sinPagar = (f: AlmacenamientoFila) => f.requiere_pago_previo && !f.pagado_en && f.estado !== 'cancelado';
const diasTxt = (n: number) => (n === 0 ? 'mismo día' : `${n} día${n > 1 ? 's' : ''}`);

export default function Almacenamientos({ filas, almacenes, clientes, error, abrir, pestanaInicial, modoCliente }: {
  abrir?: boolean; filas: AlmacenamientoFila[]; almacenes: AlmacenOpcion[]; clientes: Cliente[]; error: string | null; pestanaInicial?: 'pago';
  modoCliente?: ModoCliente;
}) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState<EstadoAlm | 'todos' | 'pago'>(pestanaInicial ?? 'pendiente_confirmar');
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<{ fila: AlmacenamientoFila | null } | null>(abrir ? { fila: null } : null);

  const cuenta = useMemo(() => {
    const c: Record<string, number> = { todos: filas.length };
    ESTADOS.forEach(([k]) => { c[k] = 0; });
    c.pago = 0;
    filas.forEach((f) => { c[f.estado]++; if (sinPagar(f)) c.pago++; });
    return c;
  }, [filas]);
  const lista = useMemo(() => {
    const w = norm(q.trim()).split(/\s+/).filter(Boolean);
    return filas.filter((f) => (pestana === 'todos' || (pestana === 'pago' ? sinPagar(f) : f.estado === pestana))
      && (!w.length || (() => { const b = norm([f.codigo, f.cliente, f.almacen, f.almacen_provincia, f.almacen_dir, f.entrega, f.descripcion, f.referencia_cliente, f.anotaciones].filter(Boolean).join(' ')); return w.every((t) => b.includes(t)); })()))
      // Lo vivo primero, por fecha de entrada; lo finalizado al final.
      .sort((a, b) => (Number(a.estado === 'finalizado') - Number(b.estado === 'finalizado')) || (a.fecha_entrada < b.fecha_entrada ? -1 : 1));
  }, [filas, pestana, q]);

  return (
    <section className="section active" id="sec-almacenes">
      <div className="sec-header">
        <h2>Almacenamientos</h2>
        <button className="btn-primary" onClick={() => setFicha({ fila: null })}>{modoCliente ? '+ Pedir almacenamiento' : '+ Nuevo almacenamiento'}</button>
      </div>
      {modoCliente && <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)', margin: '-0.4rem 0 0.9rem' }}>Almacenamiento de corta estancia (1 a 7 días) en un almacén Dynamo, con reparto urbano posterior si lo necesitas. Lo pides aquí y te lo confirmamos.</p>}
      <div className="tabs">
        {ESTADOS.map(([k, t]) => <button key={k} className={`tab${pestana === k ? ' active' : ''}`} onClick={() => setPestana(k)}>{t} ({cuenta[k] ?? 0})</button>)}
        <button className={`tab${pestana === 'pago' ? ' active' : ''}`} onClick={() => setPestana('pago')}>Pendiente de pago ({cuenta.pago})</button>
        <button className={`tab${pestana === 'todos' ? ' active' : ''}`} onClick={() => setPestana('todos')}>Todos ({cuenta.todos})</button>
      </div>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={modoCliente ? 'Buscar por nº, almacén, dirección, referencia…' : 'Buscar por nº, cliente, almacén, dirección, referencia…'} />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los almacenamientos: {error}</div>}
      <div className="table-wrap">
        <table className="data data-almacenes">
          <thead><tr><th>Almacenamiento</th><th>Almacén</th><th>Entrada</th><th>Salida</th><th>Reparto urbano</th><th>Total (sin IVA)</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'Sin almacenamientos que coincidan con el filtro.' : modoCliente ? 'Aún no has pedido ningún almacenamiento. Pídelo con «+ Pedir almacenamiento».' : 'Aún no hay almacenamientos. Crea uno con «+ Nuevo almacenamiento».'}
              </td></tr>
            ) : lista.map((f) => {
              const est = ESTADOS.find(([k]) => k === f.estado)!;
              const dias = diasAlmacen(f.fecha_entrada, f.fecha_salida);
              return (
                <tr key={f.id} onClick={() => setFicha({ fila: f })} style={{ cursor: 'pointer' }}>
                  <td className="ref"><strong>#{f.codigo}</strong><div className="meta">{f.cliente ?? ''}{f.referencia_cliente ? ` · ${f.referencia_cliente}` : ''}</div></td>
                  <td><strong>Dynamo · {f.almacen_provincia}</strong><div className="meta">{f.almacen_dir}</div></td>
                  <td>{fecha(f.fecha_entrada)}<div className="meta">{f.num_trailers} tráiler{f.num_trailers > 1 ? 'es' : ''}</div></td>
                  <td>{fecha(f.fecha_salida)}<div className="meta" style={dias > 7 ? { color: '#b45309', fontWeight: 700 } : undefined}>{diasTxt(dias)}</div></td>
                  <td>{f.num_repartos > 0 ? <>Sí · {f.num_repartos} {f.num_repartos > 1 ? 'camiones' : 'camión'}{f.entrega && <div className="meta">{f.entrega.length > 40 ? `${f.entrega.slice(0, 40)}…` : f.entrega}</div>}</> : 'No'}</td>
                  <td><strong>{euros(f.importe_total)}</strong>{f.requiere_pago_previo && (f.pagado_en
                    ? <div className="meta" style={{ color: '#0f6b3a', fontWeight: 700 }}>Pagado el {fecha(diaMadrid(f.pagado_en))}</div>
                    : <div className="meta" style={{ color: 'var(--red)', fontWeight: 700 }}>Pendiente de pago</div>)}</td>
                  <td><span className={`badge badge-${est[3]}`}>{est[2]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ficha && <FichaAlmacenamiento fila={ficha.fila} almacenes={almacenes} clientes={clientes} modoCliente={modoCliente} onCerrar={() => { setFicha(null); if (abrir) router.replace('/panel/almacenamientos'); }}
        onHecho={() => { setFicha(null); if (abrir) router.replace('/panel/almacenamientos'); refrescar(); }} />}
    </section>
  );
}

function FichaAlmacenamiento({ fila, almacenes, clientes, modoCliente, onCerrar, onHecho }: {
  fila: AlmacenamientoFila | null; almacenes: AlmacenOpcion[]; clientes: Cliente[]; modoCliente?: ModoCliente; onCerrar: () => void; onHecho: () => void;
}) {
  const inicio = useMemo<AlmacenamientoDatos>(() => fila ? {
    cliente_id: fila.cliente_id, almacen_id: fila.almacen_id, fecha_entrada: fila.fecha_entrada, fecha_salida: fila.fecha_salida,
    num_trailers: fila.num_trailers, num_repartos: fila.num_repartos, sitio_entrega_id: fila.sitio_entrega_id,
    descripcion: fila.descripcion ?? '', referencia_cliente: fila.referencia_cliente ?? '', anotaciones: fila.anotaciones ?? '',
  } : {
    cliente_id: '', almacen_id: '', fecha_entrada: masDias(hoy(), 1), fecha_salida: masDias(hoy(), 4),
    num_trailers: 1, num_repartos: 0, sitio_entrega_id: null, descripcion: '', referencia_cliente: '', anotaciones: '',
  }, [fila]);
  const [d, setD] = useState<AlmacenamientoDatos>(inicio);
  const [sitios, setSitios] = useState<{ id: string; nombre: string; linea: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  const set = <K extends keyof AlmacenamientoDatos>(k: K, v: AlmacenamientoDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let vivo = true;
    if (modoCliente) setSitios(modoCliente.sitios);
    else if (d.cliente_id) sitiosDelCliente(d.cliente_id).then((l) => { if (vivo) setSitios(l); }); else setSitios([]);
    return () => { vivo = false; };
  }, [d.cliente_id, modoCliente]);

  const alm = almacenes.find((a) => a.id === d.almacen_id) ?? null;
  const cli = clientes.find((c) => c.id === d.cliente_id) ?? null;
  const cambiaPrecio = !fila || (['almacen_id', 'fecha_entrada', 'fecha_salida', 'num_trailers', 'num_repartos'] as const).some((k) => d[k] !== inicio[k]);
  const precio = alm ? precioAlmacenamiento(d, alm) : null;
  // En una ficha ya creada se enseña el precio congelado, salvo que cambie algo que lo mueve.
  const base = cambiaPrecio ? precio : { semanas: 0, almacenaje: fila!.importe_almacenaje ?? 0, reparto: fila!.importe_reparto ?? 0, total: fila!.importe_total };
  const iva = fila?.iva_pct ?? 21;
  const dias = diasAlmacen(d.fecha_entrada, d.fecha_salida);
  // El cliente solo cambia lo suyo mientras Dynamo no lo ha confirmado.
  const editable = !fila || (modoCliente ? fila.estado === 'pendiente_confirmar' : ['pendiente_confirmar', 'confirmado'].includes(fila.estado));
  const sinCredito = modoCliente ? !modoCliente.conCredito : !!cli && !(Number(cli.riesgo_efectivo_euros) > 0);

  async function guardar() {
    setError(null);
    if (!modoCliente && !d.cliente_id) { setError('Elige el cliente.'); return; }
    if (!d.almacen_id) { setError('Elige el almacén Dynamo.'); return; }
    if (!fila && alm && !alm.disponible) { setError('Este almacén está COMPLETO y no admite entradas.'); return; }
    if (d.fecha_salida < d.fecha_entrada) { setError('La fecha de salida no puede ser anterior a la de entrada.'); return; }
    if (d.num_repartos > 0 && !d.sitio_entrega_id) { setError('Con reparto urbano hay que elegir la dirección de entrega.'); return; }
    setTrabajando(fila ? 'Guardando almacenamiento' : modoCliente ? 'Pidiendo almacenamiento' : 'Creando almacenamiento');
    const r = modoCliente
      ? await pedirAlmacenamiento(fila?.id ?? null, { almacen_id: d.almacen_id, fecha_entrada: d.fecha_entrada, fecha_salida: d.fecha_salida, num_trailers: d.num_trailers,
          num_repartos: d.num_repartos, sitio_entrega_id: d.sitio_entrega_id, descripcion: d.descripcion, referencia_cliente: d.referencia_cliente })
      : await guardarAlmacenamiento(fila?.id ?? null, d, cambiaPrecio);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  async function pagado(si: boolean) {
    if (!fila) return;
    setError(null); setTrabajando(si ? 'Marcando como pagado' : 'Deshaciendo el pago');
    const r = await marcarPagadoAlmacenamiento(fila.id, si);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  async function estado(e: EstadoAlm, txt: string) {
    if (!fila) return;
    setError(null); setTrabajando(txt);
    const r = modoCliente && e === 'cancelado' ? await cancelarMiAlmacenamiento(fila.id) : await cambiarEstadoAlmacenamiento(fila.id, e);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }

  if (preguntaCancelar && fila) {
    return (
      <Modal abierto titulo={`Cancelar almacenamiento #${fila.codigo}`} sub="Se conserva en el histórico como Cancelado" icono={<IcoAlm />} onCerrar={() => setPreguntaCancelar(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setPreguntaCancelar(false)}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={() => estado('cancelado', 'Cancelando almacenamiento')}>Sí, cancelar almacenamiento</button>
        </>}>
        <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>¿Seguro que quieres cancelar este almacenamiento? Se libera el sitio en el almacén y queda en el listado como <strong>Cancelado</strong>.</p>
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  const est = fila ? ESTADOS.find(([k]) => k === fila.estado)! : null;
  const siguiente: Partial<Record<EstadoAlm, [EstadoAlm, string, string]>> = {
    pendiente_confirmar: ['confirmado', 'Confirmar almacén', 'Confirmando'],
    confirmado: ['en_almacen', 'Ha entrado la mercancía', 'Marcando la entrada'],
    en_almacen: ['finalizado', 'Ha salido la mercancía', 'Marcando la salida'],
  };
  const paso = fila && !modoCliente ? siguiente[fila.estado] : undefined;

  return (
    <Modal abierto titulo={fila ? `Almacenamiento #${fila.codigo}` : modoCliente ? 'Pedir almacenamiento' : 'Nuevo almacenamiento'}
      sub={fila ? <>{alm ? `Dynamo · ${alm.provincia}` : fila.almacen} — <span className={`badge badge-${est![3]}`}>{est![2]}</span></> : 'Almacenamiento de corta estancia (1 a 7 días) en un almacén Dynamo'}
      icono={<IcoAlm />} onCerrar={onCerrar}
      acciones={fila ? <>
        {paso && <button className="btn-primary" onClick={() => estado(paso[0], paso[2])} disabled={!!trabajando}>{paso[1]}</button>}
        {!modoCliente && fila.estado === 'cancelado' && <button className="btn-primary" onClick={() => estado('pendiente_confirmar', 'Reactivando')} disabled={!!trabajando}>Reactivar</button>}
        {fila.requiere_pago_previo && fila.estado !== 'cancelado' && <>
          <a className="btn-secondary" href={`/panel/almacenamientos/${fila.id}/proforma`} target="_blank" rel="noopener">Proforma (PDF)</a>
          {modoCliente ? (fila.pagado_en && <span className="badge badge-entregado" style={{ alignSelf: 'center' }}>Pagado el {fecha(diaMadrid(fila.pagado_en))}</span>) : fila.pagado_en
            ? <button className="btn-secondary" onClick={() => pagado(false)} disabled={!!trabajando}>Pagado el {fecha(diaMadrid(fila.pagado_en))} · deshacer</button>
            : <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={() => pagado(true)} disabled={!!trabajando}>Marcar como pagado</button>}
        </>}
        {(modoCliente ? fila.estado === 'pendiente_confirmar' : !['cancelado', 'finalizado'].includes(fila.estado)) && <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setPreguntaCancelar(true)} disabled={!!trabajando}>Cancelar almacenamiento</button>}
      </> : undefined}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        {editable && <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>{fila ? 'Guardar cambios' : modoCliente ? 'Pedir almacenamiento' : 'Crear almacenamiento'}</button>}
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creado: {creadoTxt(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${creadoTxt(fila.modificado_en)}` : ''}
        </div>
      )}
      {!editable && <div className="alm-note" style={{ margin: '0 0 0.8rem' }}>{modoCliente ? 'Ya está confirmado: para cambiar algo, escríbenos o llámanos.' : 'Con la mercancía ya en el almacén (o el servicio cerrado) los datos quedan fijos.'}</div>}
      <div className="ptar-sitio-grid">
        {!modoCliente && <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="alm-cli">Cliente</label>
          <select id="alm-cli" className="ptar-select" value={d.cliente_id} disabled={!!fila} onChange={(e) => { set('cliente_id', e.target.value); set('sitio_entrega_id', null); }}>
            <option value="">Selecciona el cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible}</option>)}
          </select>
        </div>}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="alm-alm">Almacén Dynamo</label>
          <select id="alm-alm" className="ptar-select" value={d.almacen_id} disabled={!editable || !!fila} onChange={(e) => set('almacen_id', e.target.value)}>
            <option value="">Selecciona el almacén…</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{`Dynamo · ${a.provincia} — ${a.dir}${a.disponible ? '' : ' · COMPLETO'}`}</option>)}
          </select>
          {fila && <div className="alm-note">El almacén no se puede cambiar. Si hace falta otra ubicación, se crea un nuevo almacenamiento.</div>}
          {!fila && alm && !alm.disponible && <div className="wiz-warn show" style={{ marginTop: '0.4rem' }}>⚠ Este almacén está COMPLETO y no admite entradas.</div>}
        </div>
        <div>
          <label htmlFor="alm-ent">Fecha de entrada</label>
          <input id="alm-ent" type="date" value={d.fecha_entrada} min={modoCliente && !fila ? hoy() : undefined} disabled={!editable} onChange={(e) => set('fecha_entrada', e.target.value)} />
        </div>
        <div>
          <label htmlFor="alm-sal">Fecha de salida <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· {diasTxt(Math.max(dias, 0))}</span></label>
          <input id="alm-sal" type="date" value={d.fecha_salida} min={d.fecha_entrada} disabled={!editable} onChange={(e) => set('fecha_salida', e.target.value)} />
        </div>
        {dias > 7 && <div style={{ gridColumn: '1/-1' }} className="pt-aviso"><div>El servicio es de <strong>1 a 7 días</strong>. Si se alarga, cada semana empezada se cobra entera.</div></div>}
        <div>
          <label htmlFor="alm-tr">Tráileres <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· 33 europalets máx. cada uno</span></label>
          <select id="alm-tr" className="ptar-select" value={d.num_trailers} disabled={!editable} onChange={(e) => set('num_trailers', Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} tráiler{n > 1 ? 'es' : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="alm-rep">Reparto urbano posterior</label>
          <select id="alm-rep" className="ptar-select" value={d.num_repartos} disabled={!editable} onChange={(e) => set('num_repartos', Number(e.target.value))}>
            {REPARTOS.map(([n, t]) => <option key={n} value={n}>{n === 0 && modoCliente ? 'No — lo recojo yo o pido un transporte aparte' : t}</option>)}
            {d.num_repartos > 4 && <option value={d.num_repartos}>{d.num_repartos} camiones de 4 m</option>}
          </select>
        </div>
        {d.num_repartos > 0 && (
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="alm-dest">Dirección de entrega del reparto <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· radio máx. 20 km del almacén</span></label>
            <select id="alm-dest" className="ptar-select" value={d.sitio_entrega_id ?? ''} disabled={!editable || (!modoCliente && !d.cliente_id)} onChange={(e) => set('sitio_entrega_id', e.target.value || null)}>
              <option value="">{modoCliente ? (sitios.length ? 'Elige uno de tus sitios…' : 'No tienes sitios: créalo antes en Sitios') : d.cliente_id ? (sitios.length ? 'Elige uno de sus sitios…' : 'Este cliente no tiene sitios: créalo en Sitios') : 'Elige antes el cliente'}</option>
              {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre} — {s.linea}</option>)}
            </select>
            <div className="alm-note">La entrega se hace el <strong>día de salida</strong> de la mercancía. (La distancia la comprobará Google Maps cuando esté conectado.)</div>
          </div>
        )}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="alm-desc">Mercancía</label>
          <input id="alm-desc" type="text" value={d.descripcion} disabled={!editable} onChange={(e) => set('descripcion', e.target.value)} placeholder="Ej. 22 palets de material eléctrico" />
        </div>
        <div>
          <label htmlFor="alm-ref">{modoCliente ? 'Tu referencia' : 'Referencia del cliente'}</label>
          <input id="alm-ref" type="text" value={d.referencia_cliente} disabled={!editable} onChange={(e) => set('referencia_cliente', e.target.value)} placeholder="Su nº de pedido o albarán" />
        </div>
        {!modoCliente && <div>
          <label htmlFor="alm-not">Notas internas</label>
          <input id="alm-not" type="text" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} placeholder="Solo para el equipo de Dynamo" />
        </div>}
        {fila && !modoCliente && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>Documentos</label>
            <Documentos dueno={{ campo: 'almacenamiento_id', id: fila.id }} conVisibleCliente tipos={['albaran', 'proforma', 'foto_incidencia', 'otro']}
              ayuda={<>Albaranes de entrada o salida, proforma, fotos de la mercancía… Marca «Lo ve el cliente» en los que deba ver.</>} />
          </div>
        )}
      </div>

      {base && (
        <div className="alm-price" style={{ marginTop: '0.9rem' }}>
          <div className="alm-price-row"><span className="k">Almacenamiento{cambiaPrecio && precio ? ` · ${d.num_trailers} tráiler${d.num_trailers > 1 ? 'es' : ''} × ${precio.semanas} semana${precio.semanas > 1 ? 's' : ''}` : ''}</span><span className="v">{euros(base.almacenaje)}</span></div>
          {base.reparto > 0 && <div className="alm-price-row"><span className="k">Reparto urbano · {d.num_repartos} camión{d.num_repartos > 1 ? 'es' : ''}</span><span className="v">{euros(base.reparto)}</span></div>}
          <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{euros(base.total)}</span></div>
          <div className="alm-price-row alm-price-sub"><span className="k">IVA ({iva} %)</span><span className="v">{euros(base.total * iva / 100)}</span></div>
          <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros(base.total * (1 + iva / 100))}</span></div>
        </div>
      )}
      {!fila && sinCredito && (
        <div className="pt-aviso" style={{ marginTop: '0.6rem' }}><div><strong>Pago por adelantado:</strong> {modoCliente
          ? 'te enviaremos la proforma y el espacio se reserva al recibir el pago.'
          : 'este cliente no tiene crédito (CESCE ni de Dynamo), así que se le envía proforma y no se reserva el espacio hasta recibir el pago.'}</div></div>
      )}
      {!fila && modoCliente && <div className="alm-note">El precio queda fijado al pedirlo. Te confirmamos el almacén en cuanto lo revisemos.</div>}
      {fila && !cambiaPrecio && editable && <div className="alm-note">Precio congelado al crear el almacenamiento. Si cambias fechas, tráileres o reparto, se recalcula con la tarifa del almacén.</div>}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {fila?.id && <Historial tabla="almacenamientos" id={fila.id} />}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
