import { sesion } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import ProteccionDatos from '@/components/panel/ProteccionDatos';

export const dynamic = 'force-dynamic';

// Protección de datos (RGPD): atender las peticiones de acceso y de borrado. Solo el Admin Master.
export default async function PaginaProteccionDatos() {
  const s = await sesion();
  if (!s) return null;
  const { perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (perfil.rol !== 'admin') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del administrador (Admin Master).</div></div></section>;
  }
  return <ProteccionDatos />;
}
