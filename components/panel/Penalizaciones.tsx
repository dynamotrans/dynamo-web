'use client';

// Penalizaciones (solo Dynamo): tabla y ficha con el diseño de #sec-penalizaciones de
// dashboard.html (pestañas Pendientes de confirmar · Confirmadas · Canceladas · Todas;
// columnas Penalización · Envío · Tipo · Transportista · P. cliente · P. transportista ·
// Margen · Fecha; ventana con «Envío referenciado» y su resumen).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import CajaSubir from './CajaSubir';
import Cargando from '@/components/Cargando';
import BuscaEnvio from './BuscaEnvio';
import BarraFiltros from './BarraFiltros';
import Documentos, { subirDocumentoDirecto, tamano, ACEPTA, MAX_BYTES } from './Documentos';
import type { EnvioLigero } from '@/lib/enviosLigeros';
import { guardarPenalizacion, cambiarEstadoPenalizacion } from '@/app/panel/(app)/penalizaciones/acciones';
import { euros, numero, fechaHora } from '@/lib/formato';
import { descargarCsv } from '@/lib/exportaciones';
// Etiquetas y faltas según el criterio único (usuario, 2026-11-09).
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

export type PenalizacionFila = {
  id: string; codigo: string; envio_id: string; tipo_id: string; tipo: string; descripcion: string | null;
  importe_cliente: number | null; importe_transportista: number | null;
  estado: 'pendiente_confirmar' | 'confirmada' | 'cancelada'; generada_auto: boolean; editada_a_mano: boolean;
  creado_en: string; modificado_en: string | null;
  envio: string; referencia_cliente: string | null; cliente: string | null; transportista: string | null;
};
type Tipo = { id: string; nombre: string; activo: boolean };

const PESTANAS: [string, string][] = [['pendiente_confirmar', 'Pendientes de confirmar'], ['confirmada', 'Confirmadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']];
const ESTADO: Record<string, [string, string]> = { pendiente_confirmar: ['Pendiente de confirmar', 'orange'], confirmada: ['Confirmada', 'green'], cancelada: ['Cancelada', 'cancelada'] };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const aNum = (t: string) => { const v = t.trim(); if (!v) return null; const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const sub = (t: string) => <><br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>{t}</span></>;
const Margen = ({ c, t }: { c: number | null; t: number | null }) => {
  if (c == null && t == null) return <>—</>;
  const m = (c ?? 0) - (t ?? 0);
  return <strong style={{ color: m >= 0 ? '#0f6b3a' : 'var(--red)' }}>{euros(m)}</strong>;
};
const IcoAlerta = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;

export default function Penalizaciones({ filas, tipos, envios, nuevaPara, error }: {
  filas: PenalizacionFila[]; tipos: Tipo[]; envios: EnvioLigero[]; nuevaPara: string | null; error: string | null;
}) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState('pendiente_confirmar');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [ficha, setFicha] = useState<{ fila: PenalizacionFila | null; envio?: string | null } | null>(
    nuevaPara ? { fila: null, envio: nuevaPara } : null);

  const cuenta = useMemo(() => {
    const c: Record<string, number> = { todas: filas.length, pendiente_confirmar: 0, confirmada: 0, cancelada: 0 };
    filas.forEach((p) => { c[p.estado]++; });
    return c;
  }, [filas]);
  const lista = useMemo(() => {
    const w = norm(q.trim());
    return filas.filter((p) => (pestana === 'todas' || p.estado === pestana) && (!tipo || p.tipo_id === tipo)
      && (!w || norm([p.codigo, p.envio, p.referencia_cliente, p.tipo, p.transportista, p.cliente, p.descripcion].filter(Boolean).join(' ')).includes(w)));
  }, [filas, pestana, q, tipo]);
  // El CSV con lo que se ve (filtros puestos), columnas calcadas de la tabla.
  const exportar = () => descargarCsv('Penalizaciones', ['Penalización', 'Descripción', 'Envío', 'Ref. cliente', 'Tipo', 'Estado', 'Transportista', 'Cliente', 'P. cliente (sin IVA)', 'P. transportista (sin IVA)', 'Margen (sin IVA)', 'Fecha'],
    lista.map((p) => ({ 'Penalización': p.codigo, 'Descripción': p.descripcion ?? '', 'Envío': `#${p.envio}`, 'Ref. cliente': p.referencia_cliente ?? '',
      Tipo: p.tipo, Estado: ESTADO[p.estado][0], Transportista: p.transportista ?? '', Cliente: p.cliente ?? '',
      'P. cliente (sin IVA)': p.importe_cliente, 'P. transportista (sin IVA)': p.importe_transportista,
      'Margen (sin IVA)': p.importe_cliente == null && p.importe_transportista == null ? null : (p.importe_cliente ?? 0) - (p.importe_transportista ?? 0),
      Fecha: fechaHora(p.creado_en) })));
  const cerrar = () => { setFicha(null); if (nuevaPara) router.replace('/panel/penalizaciones'); };

  return (
    <section className="section active" id="sec-penalizaciones">
      <div className="sec-header">
        <h2>Penalizaciones</h2>
        <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Crear penalización</button>
      </div>
      <div className="tabs">
        {PESTANAS.map(([k, t]) => (
          <button key={k} className={`tab${pestana === k ? ' active' : ''}`} onClick={() => setPestana(k)}>{t} ({cuenta[k] ?? 0})</button>
        ))}
      </div>
      <BarraFiltros q={q} onQ={setQ} activos={[q.trim(), tipo].filter(Boolean).length} onExportar={exportar}
        placeholder="Buscar por código, envío, tipo, transportista, cliente…">
        <select className="filter-estado" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </BarraFiltros>
      {error && <div className="pt-aviso error">No se han podido cargar las penalizaciones: {error}</div>}
      <div className="table-wrap">
        <table className="data data-penalizaciones">
          <thead><tr>
            <th>Penalización</th><th>Envío</th><th>Tipo</th><th>Transportista</th>
            <th>P. cliente{sub('base sin IVA')}</th><th>P. transportista{sub('base sin IVA')}</th><th>Margen{sub('base sin IVA')}</th><th>Fecha</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'No hay penalizaciones que coincidan con el filtro.' : 'Aún no hay penalizaciones. Crea una con «+ Crear penalización».'}
              </td></tr>
            ) : lista.map((p) => {
              const est = ESTADO[p.estado];
              const desc = p.descripcion ?? '';
              return (
                <tr key={p.id} onClick={() => setFicha({ fila: p })} style={{ cursor: 'pointer' }}>
                  <td className="ref"><strong>{p.codigo}</strong><div className="meta">{desc.slice(0, 60)}{desc.length > 60 ? '…' : ''}</div></td>
                  <td><strong>#{p.envio}</strong>{p.referencia_cliente && <div className="meta">{p.referencia_cliente}</div>}</td>
                  <td><span className="badge badge-prog">{p.tipo}</span> <span className={`badge badge-${est[1]}`}>{est[0]}</span>
                    {p.generada_auto && <div className="meta" style={{ color: 'var(--purple)', fontWeight: 700 }}>Generada automáticamente{p.editada_a_mano ? ' · renegociada' : ''}</div>}</td>
                  <td>{p.transportista ?? '—'}<div className="meta">{p.cliente ?? ''}</div></td>
                  <td className="amount"><strong>{p.importe_cliente != null ? euros(p.importe_cliente) : '—'}</strong></td>
                  <td className="amount"><strong>{p.importe_transportista != null ? euros(p.importe_transportista) : '—'}</strong></td>
                  <td className="amount"><Margen c={p.importe_cliente} t={p.importe_transportista} /></td>
                  <td>{fechaHora(p.creado_en)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ficha && <FichaPenalizacion fila={ficha.fila} envioInicial={ficha.envio ?? null} tipos={tipos} envios={envios}
        onCerrar={cerrar} onHecho={() => { cerrar(); refrescar(); }} />}
    </section>
  );
}

function FichaPenalizacion({ fila, envioInicial, tipos, envios, onCerrar, onHecho }: {
  fila: PenalizacionFila | null; envioInicial: string | null; tipos: Tipo[]; envios: EnvioLigero[]; onCerrar: () => void; onHecho: () => void;
}) {
  const [envio, setEnvio] = useState<string | null>(fila?.envio_id ?? envioInicial);
  const [tipo, setTipo] = useState(fila?.tipo_id ?? '');
  const [desc, setDesc] = useState(fila?.descripcion ?? '');
  const [ic, setIc] = useState(numero(fila?.importe_cliente ?? null, 2));
  const [it, setIt] = useState(numero(fila?.importe_transportista ?? null, 2));
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  // Adjuntos elegidos ANTES de crear la penalización (usuario, 2026-11-10): foto con la
  // cámara o galería/archivos; se suben nada más crearla. Si una subida falla, la
  // penalización ya existe: idCreada hace que el reintento actualice en vez de duplicar.
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [idCreada, setIdCreada] = useState<string | null>(null);
  const anadirPendientes = (lista: FileList) => {
    setError(null);
    const nuevos: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > MAX_BYTES) { setError(`«${f.name}» pasa de 25 MB.`); continue; }
      if (!ACEPTA.split(',').includes(f.type)) { setError(`«${f.name}»: solo PDF o imágenes (JPG, PNG, WEBP, HEIC).`); continue; }
      nuevos.push(f);
    }
    if (nuevos.length) setPendientes((l) => [...l, ...nuevos]);
  };
  const cancelada = fila?.estado === 'cancelada';

  async function guardar() {
    setError(null);
    const c = aNum(ic), t = aNum(it);
    if (Number.isNaN(c) || Number.isNaN(t)) { setError('Algún importe no es un número.'); return; }
    if (!envio) { setError('Elige el envío al que corresponde la penalización.'); avisaFaltas(['pen-envio']); return; }
    if (!tipo) { setError('Elige el tipo de penalización.'); avisaFaltas(['pen-tipo']); return; }
    if (c == null && t == null) { setError('Pon al menos un importe (al cliente o al transportista).'); avisaFaltas(['pen-ic', 'pen-it']); return; }
    setTrabajando(fila ? 'Guardando penalización' : 'Creando penalización');
    const r = await guardarPenalizacion(fila?.id ?? idCreada, { envio_id: envio, tipo_id: tipo, descripcion: desc, importe_cliente: c, importe_transportista: t });
    if (!r.ok) { setTrabajando(null); setError(r.error); return; }
    // Los adjuntos elegidos antes de guardar se suben ahora, contra la penalización recién
    // creada. Los que fallen se quedan en la lista para reintentar (ya existe, sin duplicar).
    if (!fila && pendientes.length) {
      setIdCreada(r.id);
      const fallos: File[] = [];
      let ultimoError = '';
      for (const f of pendientes) {
        setTrabajando(`Subiendo «${f.name}»`);
        const g = await subirDocumentoDirecto({ campo: 'penalizacion_id', id: r.id }, f, f.type.startsWith('image/') ? 'foto_incidencia' : 'otro');
        if (!g.ok) { fallos.push(f); ultimoError = g.error; }
      }
      setPendientes(fallos);
      if (fallos.length) {
        setTrabajando(null);
        setError(`La penalización se ha creado, pero no se ha podido subir ${fallos.map((f) => `«${f.name}»`).join(', ')} (${ultimoError}). Vuelve a pulsar el botón para reintentarlo, o quítalos de la lista.`);
        return;
      }
    }
    setTrabajando(null);
    onHecho();
  }
  async function estado(e: 'pendiente_confirmar' | 'confirmada' | 'cancelada', txt: string) {
    if (!fila) return;
    setError(null); setTrabajando(txt);
    const r = await cambiarEstadoPenalizacion(fila.id, e);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }

  if (preguntaCancelar && fila) {
    return (
      <Modal abierto titulo={`Cancelar penalización ${fila.codigo}`} sub="Quedará anulada (se conserva en el histórico)" icono={<IcoAlerta />} onCerrar={() => setPreguntaCancelar(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setPreguntaCancelar(false)}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => estado('cancelada', 'Anulando penalización')} disabled={!!trabajando}>Sí, anular penalización</button>
        </>}>
        <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>¿Seguro que quieres anular esta penalización? Dejará de tener efecto, pero seguirá visible en el listado como <strong>Cancelada</strong>.</p>
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  return (
    <Modal abierto titulo={fila ? `Editar penalización ${fila.codigo}` : 'Crear penalización'}
      sub={fila ? <><span className={`badge badge-${ESTADO[fila.estado][1]}`}>{ESTADO[fila.estado][0]}</span>{fila.generada_auto ? ' · generada automáticamente al cancelar fuera de plazo' : ''}</> : 'Asóciala a un envío y su transportista'}
      icono={<IcoAlerta />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        {fila && !cancelada && <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setPreguntaCancelar(true)} disabled={!!trabajando}>Cancelar penalización</button>}
        {fila && fila.estado === 'pendiente_confirmar' && <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={() => estado('confirmada', 'Confirmando penalización')} disabled={!!trabajando}>Confirmar penalización</button>}
        {fila && fila.estado !== 'pendiente_confirmar' && <button className="btn-secondary" onClick={() => estado('pendiente_confirmar', 'Volviendo a pendiente')} disabled={!!trabajando}>Volver a pendiente</button>}
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar penalización</button>
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creada: {fechaHora(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${fechaHora(fila.modificado_en)}` : ''}
        </div>
      )}
      <div className="modal-form-row">
        <label>Envío referenciado <Req /></label>
        <div id="pen-envio"><BuscaEnvio envios={envios} valor={envio} onCambio={setEnvio} remoto /></div>
      </div>
      <div className="modal-form-row">
        <label htmlFor="pen-tipo">Tipo de penalización <Req /></label>
        <select id="pen-tipo" className="ptar-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Selecciona el tipo…</option>
          {tipos.filter((t) => t.activo || t.id === tipo).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>
      <div className="modal-form-row">
        <label htmlFor="pen-desc">Descripción <Req si={false} /></label>
        <textarea id="pen-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe el motivo de la penalización…" />
      </div>
      <div className="ptar-sitio-grid">
        <div>
          <label htmlFor="pen-ic">Importe al cliente <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· sin IVA · al menos uno de los dos</span></label>
          <input id="pen-ic" type="text" inputMode="decimal" value={ic} onChange={(e) => setIc(e.target.value)} placeholder="Lo que se le cobra" />
        </div>
        <div>
          <label htmlFor="pen-it">Importe al transportista <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· sin IVA · al menos uno de los dos</span></label>
          <input id="pen-it" type="text" inputMode="decimal" value={it} onChange={(e) => setIt(e.target.value)} placeholder="Lo que se le paga" />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.5rem 0 0', lineHeight: 1.45 }}>
        Una <strong>paralización</strong> la pide el transportista y Dynamo la repercute al cliente: rellena los dos importes. El cliente solo ve el suyo.
        {fila?.generada_auto ? ' Si cambias los importes de una automática, queda marcada como renegociada y ya no se retira sola al deshacer la cancelación.' : ''}
      </p>
      <div className="modal-form-row" style={{ marginTop: '0.8rem' }}>
        <label>Adjuntar fotos / documentos</label>
        {fila ? <Documentos dueno={{ campo: 'penalizacion_id', id: fila.id }} tipos={['gps_tacografo', 'albaran', 'cmr_firmado', 'foto_incidencia', 'otro']}
          ayuda={<>P. ej. el <strong>GPS o tacógrafo del camión</strong> para justificar esperas en carga o descarga, fotos, albaranes u otros documentos.</>} />
          : <>
            <CajaSubir onFiles={(f) => anadirPendientes(f)} accept={ACEPTA} />
            {pendientes.length > 0 && (
              <ul className="modal-file-list">
                {pendientes.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="modal-file-item">
                    <span className="mfi-ico"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
                    <span className="mfi-name">{f.name}</span>
                    <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{tamano(f.size)}</span>
                    <button type="button" className="mfi-del" aria-label={`Quitar ${f.name}`} onClick={() => setPendientes((l) => l.filter((_, j) => j !== i))}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.35rem 0 0' }}>P. ej. el GPS o tacógrafo, fotos o albaranes · PDF, JPG, PNG, WEBP o HEIC · máx. 25 MB cada uno · se adjuntan al crear la penalización.</p>
          </>}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
