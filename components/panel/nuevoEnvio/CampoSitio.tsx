'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconoTipo } from '../TipoSitio';
import { FichaSitio, buscarDireccionesOSM, type DirOSM } from '../Sitios';
import { ClienteOpcion, IcoMenos, Punto, SitioOpcion, VACIO, direccionCompleta, norm, textoSitio } from './comun';

// ---- Buscador de sitio de la agenda del cliente (con sitio nuevo) -----------------
// «+ Crear nuevo sitio» abre LA MISMA ventana que Crear sitio de la sección Sitios
// (usuario, 2026-11-12: «lo veo muy extenso… hazlo igual que crear sitio»): una sola
// ficha de sitio en toda la plataforma. El sitio se guarda en la agenda al momento
// (ya no hay casilla: siempre se guarda) y queda elegido en la parada.
// `modoDireccion` (usuario, 2026-11-14): SIN cliente elegido, el campo no se bloquea —
// se escribe la dirección y se autocompleta con OpenStreetMap (gratis, sin clave, el
// mismo de Crear sitio y del tarifador público) para poder CALCULAR EL PRECIO. Cuando
// haya GOOGLE_MAPS_API_KEY, este mismo nivel pasará a Google Places (tarea 79).
export function CampoSitio({ punto, numero, sitios, deshabilitado, placeholder, cliente = null, dynamo = false, modoDireccion = false, onCreado, onCambio, onQuitar, onAnadir, onAlternar, asa }: {
  punto: Punto; numero: number; sitios: SitioOpcion[]; deshabilitado: boolean; placeholder: string;
  cliente?: ClienteOpcion | null; dynamo?: boolean; modoDireccion?: boolean; onCreado?: (id: string) => void;
  onCambio: (c: Partial<Punto>) => void; onQuitar?: () => void; onAnadir?: () => void; onAlternar?: () => void; asa?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [crear, setCrear] = useState(false);
  const [dirs, setDirs] = useState<DirOSM[]>([]);
  useEffect(() => {
    if (!modoDireccion) return;
    const texto = q.trim();
    if (texto.length < 3) { setDirs([]); return; }
    const t = setTimeout(() => { buscarDireccionesOSM(texto).then(setDirs).catch(() => {}); }, 350);
    return () => clearTimeout(t);
  }, [q, modoDireccion]);
  const elegido = punto.sitio ?? punto.nuevo;
  const lista = useMemo(() => {
    const w = norm(q.trim());
    return sitios.filter((s) => !w || norm([s.nombre_empresa, s.direccion, s.codigo_postal, s.poblacion, s.provincia].filter(Boolean).join(' ')).includes(w)).slice(0, 8);
  }, [sitios, q]);
  const rec = punto.tipo === 'carga';
  // Al elegir un sitio (o abrir «Crear nuevo sitio») el buscador suelta el foco: si no,
  // en el móvil el teclado se queda abierto tapando media pantalla (usuario, 2026-11-12).
  const soltarFoco = () => setTimeout(() => (document.activeElement as HTMLElement | null)?.blur?.(), 0);
  // Icono del TIPO de sitio en blanco dentro de la pastilla (usuario, 2026-11-10):
  // fábrica · cono de obra · edificios · espiga, tras «Recogida»/«Entrega».
  const tipoSel = punto.sitio ? punto.sitio.tipo : punto.nuevo?.tipo_sitio;
  const icoTipo = elegido ? <IconoTipo tipo={tipoSel} blanco /> : null;

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
            value={elegido ? textoSitio(elegido) + (punto.parada_id || !punto.nuevo ? '' : ' (nuevo)') : q}
            onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
            onFocus={() => !elegido && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
            onClick={() => {
              // Pulsar ENCIMA del sitio elegido = la ✕ y además abre el desplegable para
              // elegir otro (usuario, 2026-11-10).
              if (elegido && !deshabilitado) { onCambio({ sitio: null, nuevo: null }); setQ(''); setAbierto(true); }
            }} />
          {elegido && <button type="button" className="ptar-clear" aria-label="Cambiar sitio" onClick={() => { onCambio({ sitio: null, nuevo: null }); setQ(''); }}>✕</button>}
          {abierto && !elegido && !deshabilitado && modoDireccion && (
            <ul className="ptar-sug">
              {q.trim().length < 3 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Escribe la dirección o la población (mínimo 3 letras)…</li>}
              {dirs.map((x, i) => (
                <li key={i} onMouseDown={(e) => {
                  e.preventDefault();
                  onCambio({ sitio: null, nuevo: { ...VACIO, nombre_empresa: x.poblacion || x.etiqueta, direccion: x.direccion,
                    codigo_postal: x.codigo_postal, poblacion: x.poblacion, provincia: x.provincia,
                    pais_codigo_iso: (x.pais || 'ES').toUpperCase(), guardar: false } });
                  setAbierto(false); soltarFoco();
                }}>
                  <span className="sug-chip sug-chip-addr">Dirección</span>
                  <strong>{[x.codigo_postal, x.poblacion].filter(Boolean).join(' ') || x.etiqueta}</strong>
                  <span className="sug-dir">{x.etiqueta}</span>
                </li>
              ))}
              {q.trim().length >= 3 && dirs.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Sin resultados: prueba con «población» o «calle, población».</li>}
            </ul>
          )}
          {abierto && !elegido && !deshabilitado && !modoDireccion && (
            <ul className="ptar-sug">
              {lista.map((s) => (
                <li key={s.id} onMouseDown={(e) => { e.preventDefault(); onCambio({ sitio: s, nuevo: null }); setAbierto(false); soltarFoco(); }}>
                  {s.es_almacen_dynamo
                    ? <span className="sug-chip sug-chip-dynamo">Almacén</span>
                    : <span className="sug-chip sug-chip-saved">Guardado</span>}
                  <strong>{s.nombre_empresa}</strong>
                  <span className="sug-dir">{direccionCompleta(s)}</span>
                </li>
              ))}
              {lista.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Este cliente aún no tiene sitios con ese nombre.</li>}
              <li onMouseDown={(e) => { e.preventDefault(); setCrear(true); setAbierto(false); soltarFoco(); }}>
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

      {crear && cliente && (
        <FichaSitio fila={null} dynamo={dynamo} clienteFijo
          clientes={[{ id: cliente.id, nombre: cliente.nombre, cif: cliente.cif ?? '', principal_id: cliente.principal_id ?? null }]}
          onCerrar={() => setCrear(false)}
          onAbrir={(id) => { setCrear(false); onCreado?.(id); }}
          onGuardado={(id) => { setCrear(false); if (id) onCreado?.(id); }} />
      )}
    </>
  );
}
