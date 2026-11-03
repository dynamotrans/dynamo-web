import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { supabasePublico } from '@/lib/supabase/publico';
import { cookieReserva } from '@/lib/cargaPublica';
import CargaPublica from './CargaPublica';
import SelectorIdioma from '@/components/SelectorIdioma';
import '../carga.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Aceptar carga · Dynamo', robots: { index: false, follow: false } };

// Página PÚBLICA del transportista (sin iniciar sesión): ver la oferta, reservarla 3 min y
// aceptarla. Diseño de aceptar-carga.html. Solo usa la puerta pública de la base de datos.
export default async function PaginaCarga({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = supabasePublico();
  const valido = /^[0-9a-f-]{36}$/i.test(token);
  let oferta: any = null, reserva: any = null, error = false;
  // En modo mantenimiento la página se para (sale el aviso de mantenimiento).
  const { data: mant } = sb ? await sb.rpc('mantenimiento_activo') : { data: false };
  if (mant) error = true;
  else if (sb && valido) {
    const { data, error: e } = await sb.rpc('oferta_publica', { p_token: token });
    if (e) error = true; else oferta = data;
    const id = (await cookies()).get(cookieReserva(token))?.value;
    if (id) {
      const { data: r } = await sb.rpc('carga_aceptada_publica', { p_reserva: id });
      reserva = r;
    }
  }
  return (
    <div className="carga-page">
      <SelectorIdioma />
      <div className="card">
        <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>
        <CargaPublica token={token} oferta={!sb || error ? { resultado: 'error' } : valido ? oferta : { resultado: 'enlace_no_valido' }} reserva={reserva} />
      </div>
      <p className="foot">Dynamo Operador Logístico, S.L.</p>
    </div>
  );
}
