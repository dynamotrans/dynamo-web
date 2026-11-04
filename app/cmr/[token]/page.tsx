import type { Metadata } from 'next';
import { RefrescoProvider } from '@/lib/useRefrescar';
import { supabasePublico } from '@/lib/supabase/publico';
import SelectorIdioma from '@/components/SelectorIdioma';
import FirmarCmr from './FirmarCmr';
import '../cmr.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'CMR digital · Firma de la carta de porte', robots: { index: false, follow: false } };

// CMR digital: página PÚBLICA (sin cuenta) donde firman cargador, transportista y
// destinatario. Diseño de firmar-cmr.html. Solo usa la puerta pública de la base de datos.
export default async function PaginaCmr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = supabasePublico();
  let cmr: any = { resultado: 'error' };
  const trazos: Record<string, string> = {};
  if (sb && /^[0-9a-f-]{36}$/i.test(token)) {
    const { data: mant } = await sb.rpc('mantenimiento_activo');
    if (mant) cmr = { resultado: 'mantenimiento' };
    else {
      const { data, error } = await sb.rpc('cmr_publico', { p_token: token });
      if (!error && data) cmr = data;
      if (cmr) { const { data: rs } = await sb.rpc('reservas_cmr_publico', { p_token: token }); cmr = { ...cmr, reservas: rs ?? [] }; }
      // Las imágenes de las firmas ya hechas: enlaces firmados de 10 minutos.
      const rutas: string[] = (cmr.firmas ?? []).map((f: any) => f.ruta);
      if (rutas.length) {
        const { data: urls } = await sb.storage.from('documentos').createSignedUrls(rutas, 600);
        (urls ?? []).forEach((u: any) => { if (u.signedUrl && u.path) trazos[u.path] = u.signedUrl; });
      }
    }
  } else if (sb) cmr = { resultado: 'enlace_no_valido' };
  return (
    <div className="cmr-page">
      <SelectorIdioma />
      <RefrescoProvider><FirmarCmr token={token} cmr={cmr} trazos={trazos} /></RefrescoProvider>
    </div>
  );
}
