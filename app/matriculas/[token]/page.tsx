import type { Metadata } from 'next';
import { supabasePublico } from '@/lib/supabase/publico';
import SelectorIdioma from '@/components/SelectorIdioma';
import FormMatriculas, { type DatosMatriculas } from './FormMatriculas';
import '../../carga/carga.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Matrículas del envío · Dynamo', robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false, date: false } };

// PÁGINA PÚBLICA «Proporcionar matrículas» (usuario, 2026-11-19): la abre el botón del email
// de la orden sin direcciones. Un mini resumen del envío (solo códigos postales) y los
// campos de matrículas, conductor y teléfono. Sin iniciar sesión: la llave es el token del
// CMR y la clave del transportista asignado, y las comprueba la base de datos.
export default async function PaginaMatriculas({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ clave?: string }> }) {
  const { token } = await params;
  const { clave } = await searchParams;
  const sb = supabasePublico();
  let datos: DatosMatriculas = { resultado: 'no_valido' };
  if (!sb) datos = { resultado: 'error' };
  else if (/^[0-9a-f-]{36}$/i.test(token) && clave && /^[0-9a-f-]{36}$/i.test(clave)) {
    const { data: mant } = await sb.rpc('mantenimiento_activo');
    if (mant) datos = { resultado: 'mantenimiento' };
    else {
      const { data, error } = await sb.rpc('matriculas_enlace_datos', { p_token: token, p_clave: clave });
      datos = error ? { resultado: 'error' } : (data as DatosMatriculas);
    }
  }
  return (
    <div className="carga-page">
      <SelectorIdioma />
      <div className="card">
        <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>
        <FormMatriculas token={token} clave={clave ?? ''} d={datos} />
      </div>
      <p className="foot">Dynamo Operador Logístico, S.L.</p>
    </div>
  );
}
