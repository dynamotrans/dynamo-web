import type { Metadata } from 'next';
import { supabasePublico } from '@/lib/supabase/publico';
import SelectorIdioma from '@/components/SelectorIdioma';
import { htmlCargasDeVuelta, type DatosVuelta } from '@/lib/cargasDeVuelta';
import { CONTACTO } from '@/lib/atencion';
import { telBonito } from '@/lib/paises';
import '../../carga/carga.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cargas de vuelta · Dynamo', robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false, date: false } };

// PÁGINA PÚBLICA «Ver todas las cargas de vuelta» (usuario, 2026-11-19): el botón del email de
// la orden. Todas las cargas de un tipo (completas o grupajes) de un tramo (donde descarga o
// de regreso al origen), con el mismo diseño que el email. La llave es la del enlace de la
// orden: el token del CMR y la clave del transportista asignado; la comprueba la base de datos.
export default async function PaginaCargasDeVuelta({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ clave?: string; tramo?: string; tipo?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const tramo = sp.tramo === 'regreso' ? 'regreso' : 'descarga';
  const tipo = sp.tipo === 'grupaje' ? 'grupaje' : sp.tipo === 'completa' ? 'completa' : null;
  const sb = supabasePublico();
  let estado: 'ok' | 'no_valido' | 'error' | 'mantenimiento' = 'no_valido';
  let datos: (DatosVuelta & { referencia?: string }) | null = null;
  if (!sb) estado = 'error';
  else if (/^[0-9a-f-]{36}$/i.test(token) && sp.clave && /^[0-9a-f-]{36}$/i.test(sp.clave)) {
    const { data: mant } = await sb.rpc('mantenimiento_activo');
    if (mant) estado = 'mantenimiento';
    else {
      const { data, error } = await sb.rpc('envios_de_vuelta_enlace', { p_token: token, p_clave: sp.clave, p_tramo: tramo });
      const r = data as (DatosVuelta & { resultado?: string; referencia?: string }) | null;
      if (error) estado = 'error'; else if (r?.resultado === 'ok') { estado = 'ok'; datos = r; }
    }
  }
  const html = datos ? htmlCargasDeVuelta(datos, '', { mismo: Infinity, otro: Infinity, soloTipo: tipo }) : '';
  return (
    <div className="carga-page">
      <SelectorIdioma />
      <div className="card" id="vuelta-pagina">
        <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>
        {estado === 'ok' ? (
          <div style={{ textAlign: 'left' }}>
            <p className="sub" style={{ margin: 0, textAlign: 'center' }}>Para tu envío #{datos?.referencia}</p>
            {html
              ? <div id="vuelta-lista" dangerouslySetInnerHTML={{ __html: html }} />
              : <p id="vuelta-vacia" style={{ textAlign: 'center' }}>Ahora mismo no hay cargas {tipo === 'grupaje' ? 'de grupaje' : tipo === 'completa' ? 'completas' : ''} libres para este tramo. Vuelve a mirarlo más tarde.</p>}
          </div>
        ) : (
          <div id="vuelta-parar" style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 0.5rem' }}>{estado === 'mantenimiento' ? 'Plataforma en mantenimiento' : estado === 'error' ? 'No se puede conectar ahora mismo' : 'Este enlace no es válido'}</h1>
            <p className="sub">{estado === 'no_valido' ? 'Ha caducado, se ha retirado o el envío ya no está con vosotros.' : 'Vuelve a intentarlo en un rato.'}</p>
            <p className="sub">¿Dudas? Llámanos al <a href={CONTACTO.telHref}>{telBonito(CONTACTO.telefono)}</a>.</p>
          </div>
        )}
      </div>
      <p className="foot">Dynamo Operador Logístico, S.L.</p>
    </div>
  );
}
