'use client';

// Almacenes Dynamo (solo Dynamo): diseño de #sec-almacenes-cat de dashboard.html. Mismas
// columnas que Sitios + los precios de cada almacén, y la fila teñida de verde si está
// disponible o de rojo si está completo. La ficha es la de Sitios en modo almacén.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { FichaSitio, type SitioFila } from './Sitios';
import { IconoTipo } from './TipoSitio';
import { euros } from '@/lib/formato';
import { paisDe, telBonito } from '@/lib/paises';
import { principal } from '@/lib/contactos';

export type PreciosAlmacen = { precioSemana: number; precioReparto: number };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Almacenes({ filas, precios, error }: { filas: SitioFila[]; precios: PreciosAlmacen; error: string | null }) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<{ fila: SitioFila | null } | null>(null);

  const lista = useMemo(() => {
    const w = norm(q.trim());
    return filas.filter((f) => !w || norm([f.nombre_empresa, f.direccion, f.codigo_postal, f.poblacion, f.provincia,
      f.horarios, f.anotaciones, ...f.contactos.flatMap((k) => [k.nombre, k.telefono, k.email])].filter(Boolean).join(' ')).includes(w))
      .sort((a, b) => (a.provincia || a.poblacion).localeCompare(b.provincia || b.poblacion, 'es') || a.nombre_empresa.localeCompare(b.nombre_empresa, 'es'));
  }, [filas, q]);

  return (
    <section className="section active" id="sec-almacenes-cat">
      <div className="sec-header">
        <h2>Almacenes Dynamo ({lista.length})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Nuevo almacén</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Catálogo interno de almacenes Dynamo. Se usan en el desplegable al crear un almacenamiento y salen en el buscador de recogidas y entregas de todos los clientes.
        Precio por defecto: almacenamiento <strong>{euros(precios.precioSemana)}</strong> la semana y reparto <strong>{euros(precios.precioReparto)}</strong> (base sin IVA).
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por provincia, ciudad, CP, dirección…" />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los almacenes: {error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Empresa</th><th>Dirección</th><th>Horario</th>
            <th>Almacenamiento<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>7 días / 1 semana</span></th>
            <th>Reparto 4 m<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>por reparto</span></th>
            <th>Contacto</th><th>Notas</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length === 0 ? 'Todavía no hay almacenes. Da de alta el primero con «+ Nuevo almacén».' : 'Sin almacenes que coincidan'}
              </td></tr>
            ) : lista.map((f) => {
              const completo = f.almacen?.disponible === false;
              const k = principal(f.contactos);
              const propio = (v: number | null | undefined, def: number) => v == null
                ? <><strong>{euros(def)}</strong><div className="meta">por defecto</div></>
                : <strong>{euros(Number(v))}</strong>;
              const notas = f.anotaciones.trim();
              return (
                <tr key={f.id} className={completo ? 'alm-cat-row-full' : 'alm-cat-row-ok'} onClick={() => setFicha({ fila: f })} style={{ cursor: 'pointer' }}>
                  <td><IconoTipo tipo={f.tipo} /><strong>{f.nombre_empresa}</strong>{' '}
                    {completo ? <span className="alm-combo-full">Completo</span> : <span className="alm-combo-ok">Disponible</span>}
                    {f.url_google_maps && <div className="meta"><a href={f.url_google_maps} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--purple)', fontWeight: 600, textDecoration: 'none' }}>Ver en Maps</a></div>}
                  </td>
                  <td>{f.direccion || '—'}<div className="meta">{[f.codigo_postal, f.poblacion, f.provincia && f.provincia !== f.poblacion ? f.provincia : '', paisDe(f.pais_codigo_iso)].filter(Boolean).join(', ')}</div></td>
                  <td>{f.horarios || '—'}</td>
                  <td>{propio(f.almacen?.precio_almacenamiento_semana, precios.precioSemana)}</td>
                  <td>{propio(f.almacen?.precio_reparto, precios.precioReparto)}</td>
                  <td>{telBonito(k?.telefono ?? '') || k?.email || '—'}{k?.nombre && <div className="meta">{k.nombre}</div>}</td>
                  <td>{notas ? <span style={{ color: '#b45309' }}>⚠ {notas.slice(0, 60)}{notas.length > 60 ? '…' : ''}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ficha && (
        <FichaSitio fila={ficha.fila} clientes={[]} dynamo almacen={precios}
          onCerrar={() => setFicha(null)}
          onAbrir={(id) => { const f = filas.find((x) => x.id === id); if (f) setFicha({ fila: f }); }}
          onGuardado={() => { setFicha(null); refrescar(); }} />
      )}
    </section>
  );
}
