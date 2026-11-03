import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Altas, { type AltaFila } from '@/components/panel/Altas';

export const dynamic = 'force-dynamic';

// Altas pendientes (solo Dynamo): diseño de #sec-altas de dashboard.html.
export default async function PaginaAltas() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [altas, clientes] = await Promise.all([
    supabase.rpc('altas_pendientes'),
    supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible').limit(10000),
  ]);
  const filas: AltaFila[] = ((altas.data ?? []) as any[]).map((a) => {
    const m = a.datos ?? {};
    const t = (k: string) => (typeof m[k] === 'string' ? m[k] : '') as string;
    return {
      id: a.id, email: a.email, nombre: a.nombre ?? t('nombre'), telefono: a.telefono ?? t('telefono'), documento: a.documento ?? t('dni'),
      solicitada_en: a.solicitada_en, confirmado_email: a.confirmado_email,
      empresa: t('empresa') || t('razon_social'), cif: t('cif'), direccion: t('direccion'), codigo_postal: t('codigo_postal'),
      poblacion: t('poblacion'), provincia: t('provincia'), pais: t('pais') || 'ES',
    };
  });
  return <Altas filas={filas} clientes={(clientes.data ?? []) as any} error={altas.error?.message ?? null} />;
}
