import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import PacksGrupaje from '@/components/panel/PacksGrupaje';

export const dynamic = 'force-dynamic';

// Packs de grupaje (usuario, 2026-11-23): los packs creados y los posibles. Solo Dynamo.
export default async function PaginaPacks() {
  const s = await sesion();
  if (!s) return null;
  const { perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es del equipo de Dynamo.</div></div></section>;
  }
  return <PacksGrupaje />;
}
