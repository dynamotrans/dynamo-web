'use client';

// Administración → Facturas con los datos de verdad (usuario, 2026-11-24: «ayúdame a montar la
// API»). Al abrir la pestaña se leen las facturas emitidas del programa de facturación (solo
// lectura) y se pintan con la lista de siempre. Sin clave en el entorno, queda como estaba:
// el aviso de «llegarán aquí al conectar».
import { useEffect, useState } from 'react';
import FacturasDynamo from './FacturasDynamo';
import { facturasEmitidas, type FacturasEmitidas } from '@/app/panel/(app)/administracion/acciones';

export default function FacturasDynamoVivo() {
  const [r, setR] = useState<FacturasEmitidas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let res: FacturasEmitidas;
      try { res = await facturasEmitidas(); }
      catch { res = { ok: false, conectado: true, error: 'No se han podido leer las facturas. Prueba otra vez en un momento.' }; }
      if (vivo) { setR(res); setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [vuelta]);

  const actualizar = () => { setCargando(true); setVuelta((n) => n + 1); };
  const conectado = !r || r.ok || r.conectado;

  return (
    <>
      {cargando && <p className="meta" id="facturas-cargando" role="status" style={{ margin: '0 0 0.6rem' }}>Leyendo las facturas…</p>}
      {r && !r.ok && r.conectado && (
        <div className="pt-aviso error" id="facturas-error" role="alert" style={{ marginBottom: '0.8rem' }}><div>
          <strong>No se han podido leer las facturas.</strong> {r.error}{' '}
          <button type="button" className="enlace-paso" onClick={actualizar} disabled={cargando}>Reintentar</button>
        </div></div>
      )}
      {r?.ok && (
        <p className="meta" id="facturas-nota" style={{ margin: '0 0 0.6rem' }}>
          Facturas emitidas ya aprobadas, las {r.facturas.length} más recientes{r.hayMas ? ' (hay más antiguas, que aún no se traen)' : ''}. Las recibidas llegarán en el siguiente paso.{' '}
          <button type="button" className="enlace-paso" id="facturas-actualizar" onClick={actualizar} disabled={cargando}>Actualizar</button>
        </p>
      )}
      <FacturasDynamo facturas={r?.ok ? r.facturas : []} conectado={conectado} />
    </>
  );
}
