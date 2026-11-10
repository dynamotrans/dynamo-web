'use client';

import { useMemo, useState } from 'react';
import SelectorPais from '@/components/SelectorPais';
import { IconoTipo, TIPOS_SITIO } from '../TipoSitio';
import EditorHorario from '../EditorHorario';
import { HORARIO_POR_DEFECTO, validarHorario } from '@/lib/horarios';
import CampoTelefono from '@/components/CampoTelefono';
import { IcoMenos, Punto, SitioNuevo, SitioOpcion, VACIO, direccionCompleta, norm, textoSitio } from './comun';
import { Campo } from './Campo';
import Req from '@/components/Req';

// ---- Buscador de sitio de la agenda del cliente (con sitio nuevo) -----------------
export function CampoSitio({ punto, numero, sitios, deshabilitado, placeholder, onCambio, onQuitar, onAnadir, onAlternar, asa }: {
  punto: Punto; numero: number; sitios: SitioOpcion[]; deshabilitado: boolean; placeholder: string;
  onCambio: (c: Partial<Punto>) => void; onQuitar?: () => void; onAnadir?: () => void; onAlternar?: () => void; asa?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<SitioNuevo | null>(null);
  const elegido = punto.sitio ?? punto.nuevo;
  const lista = useMemo(() => {
    const w = norm(q.trim());
    return sitios.filter((s) => !w || norm([s.nombre_empresa, s.direccion, s.codigo_postal, s.poblacion, s.provincia].filter(Boolean).join(' ')).includes(w)).slice(0, 8);
  }, [sitios, q]);
  const rec = punto.tipo === 'carga';
  // Icono del TIPO de sitio en blanco dentro de la pastilla (usuario, 2026-11-10):
  // fábrica · cono de obra · edificios · espiga, tras «Recogida»/«Entrega».
  const tipoSel = punto.sitio ? punto.sitio.tipo : punto.nuevo?.tipo_sitio;
  const icoTipo = elegido ? <IconoTipo tipo={tipoSel} blanco /> : null;
  const malHorario = form?.horario ? validarHorario(form.horario) : null;
  const listo = form && form.nombre_empresa.trim() && form.poblacion.trim() && form.codigo_postal.trim() && !malHorario;

  return (
    <>
      <div className="ptar-route-row">
        <div className={`ptar-input-wrap${elegido ? ' ptar-picked' : ''}`}>
          {/* Pastilla con el nº y el tipo (naranja recogida · verde entrega). Al pulsarla,
              la parada ALTERNA entre recogida y entrega (si no es la única de su grupo). */}
          {onAlternar
            ? <button type="button" className={`ptar-route-tag ${rec ? 'rec' : 'ent'}`} onClick={onAlternar}
                title={rec ? 'Cambiar a entrega' : 'Cambiar a recogida'} aria-label={`Parada ${numero}, ${rec ? 'recogida' : 'entrega'}. Pulsa para cambiarla a ${rec ? 'entrega' : 'recogida'}`}>
                {numero} · {rec ? 'Recogida' : 'Entrega'}{icoTipo}
              </button>
            : <span className={`ptar-route-tag ${rec ? 'rec' : 'ent'}`}>{numero} · {rec ? 'Recogida' : 'Entrega'}{icoTipo}</span>}
          <input type="text" autoComplete="off" placeholder={deshabilitado ? 'Elige antes el cliente' : placeholder}
            disabled={deshabilitado} readOnly={!!elegido}
            value={elegido ? textoSitio(elegido) + (punto.parada_id || !punto.nuevo ? '' : punto.nuevo.guardar ? ' (nuevo)' : ' (dirección suelta)') : q}
            onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
            onFocus={() => !elegido && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
          {elegido && <button type="button" className="ptar-clear" aria-label="Cambiar sitio" onClick={() => { onCambio({ sitio: null, nuevo: null }); setQ(''); }}>✕</button>}
          {abierto && !elegido && !deshabilitado && (
            <ul className="ptar-sug">
              {lista.map((s) => (
                <li key={s.id} onMouseDown={(e) => { e.preventDefault(); onCambio({ sitio: s, nuevo: null }); setAbierto(false); }}>
                  {s.es_almacen_dynamo
                    ? <span className="sug-chip sug-chip-dynamo">Almacén</span>
                    : <span className="sug-chip sug-chip-saved">Guardado</span>}
                  <strong>{s.nombre_empresa}</strong>
                  <span className="sug-dir">{direccionCompleta(s)}</span>
                </li>
              ))}
              {lista.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Este cliente aún no tiene sitios con ese nombre.</li>}
              <li onMouseDown={(e) => { e.preventDefault(); setForm({ ...VACIO, nombre_empresa: q }); setAbierto(false); }}>
                <strong style={{ color: 'var(--purple)' }}>+ Crear nuevo sitio</strong>
              </li>
            </ul>
          )}
        </div>
        {onQuitar && <button type="button" className="ptar-parada-del" aria-label="Quitar esta parada" onClick={onQuitar}><IcoMenos /></button>}
        {onAnadir && <button type="button" className="ptar-parada-add" aria-label={rec ? 'Añadir otra recogida' : 'Añadir otra entrega'} title={rec ? 'Añadir otra recogida' : 'Añadir otra entrega'} onClick={onAnadir}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>}
        {asa}
      </div>

      {form && !elegido && (
        <div className="ptar-admin-precio" style={{ marginTop: '0.6rem' }}>
          <div className="ptar-admin-precio-head">Sitio nuevo de {rec ? 'recogida' : 'entrega'}</div>
          <Campo l="Empresa" req v={form.nombre_empresa} on={(v) => setForm({ ...form, nombre_empresa: v })} ph="Ej. Cerámicas del Sur S.L." />
          <Campo l="Dirección (calle y número)" req={false} v={form.direccion} on={(v) => setForm({ ...form, direccion: v })} ph="Ej. C/ Industria, 4" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
            <Campo l="Código postal" req v={form.codigo_postal} on={(v) => setForm({ ...form, codigo_postal: v })} ph="41016" />
            <Campo l="Población" req v={form.poblacion} on={(v) => setForm({ ...form, poblacion: v })} ph="Sevilla" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <Campo l="Provincia" req={false} v={form.provincia} on={(v) => setForm({ ...form, provincia: v })} ph="Sevilla" />
            <div>
              <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>País</label>
              <SelectorPais valor={form.pais_codigo_iso} onCambio={(v) => setForm({ ...form, pais_codigo_iso: v })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem', display: 'block' }}>Teléfono <Req si={false} /></label>
              <CampoTelefono valor={form.telefono} onCambio={(v) => setForm({ ...form, telefono: v })} />
            </div>
            <Campo l="Nombre y apellidos" req={false} v={form.contacto} on={(v) => setForm({ ...form, contacto: v })} ph="Ej. Lucía (muelle)" />
          </div>
          <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>Tipo de sitio</label>
          <select className="ptar-select" value={form.tipo_sitio} onChange={(e) => setForm({ ...form, tipo_sitio: e.target.value })}>
            {TIPOS_SITIO.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>Horario</label>
          {form.horario ? (
            <>
              <EditorHorario valor={form.horario} onCambio={(g) => setForm({ ...form, horario: g })} />
              <button type="button" className="btn-ghost" style={{ marginTop: '0.3rem' }} onClick={() => setForm({ ...form, horario: null })}>Usar el de por defecto</button>
              {!form.guardar && <p className="ptar-admin-precio-note">El horario solo se guarda si el sitio se guarda en la agenda.</p>}
            </>
          ) : (
            <p className="ptar-admin-precio-note" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              El de por defecto: L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00.
              <button type="button" className="btn-ghost" style={{ padding: '0.2rem 0.6rem' }} onClick={() => setForm({ ...form, horario: HORARIO_POR_DEFECTO.map((g) => ({ dias: [...g.dias], tramos: g.tramos.map((t) => ({ ...t })) })) })}>Cambiarlo</button>
            </p>
          )}
          <label className="ptar-confirm-check" style={{ marginTop: '0.7rem' }}>
            <input type="checkbox" checked={form.guardar} onChange={(e) => setForm({ ...form, guardar: e.target.checked })} />
            <span>Guardarlo en la <strong>agenda de sitios</strong> del cliente</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" disabled={!listo}
              onClick={() => { if (listo) { onCambio({ sitio: null, nuevo: form }); setForm(null); } }}>Usar este sitio</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
          {!listo && <p className="ptar-admin-precio-note">{malHorario ?? 'Empresa, código postal y población son obligatorios.'}</p>}
        </div>
      )}
    </>
  );
}
