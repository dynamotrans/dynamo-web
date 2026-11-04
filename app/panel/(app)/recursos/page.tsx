import { sesion } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Recursos from '@/components/panel/Recursos';

export const dynamic = 'force-dynamic';

// Recursos: diseño de #sec-recursos de dashboard.html. Documentos y herramientas de apoyo.
export default async function PaginaRecursos() {
  const s = await sesion();
  if (!s) return null;
  if (!s.perfil || s.perfil.estado !== 'activa') return <AvisoCuenta perfil={s.perfil} />;
  return <Recursos />;
}
