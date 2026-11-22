import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import MapaGeneral from '@/components/panel/MapaGeneral';

export const dynamic = 'force-dynamic';

// Mapa de envíos (Dynamo: todos; cliente: los suyos). Los datos los carga la propia pantalla y
// se actualizan solos; quién ve qué lo decide la base de datos (mapa_envios_en_curso).
export default async function PaginaMapa() {
  const s = await sesion();
  if (!s) return null;
  const { perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (perfil.rol === 'transportista') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es del equipo de Dynamo y de los clientes.</div></div></section>;
  }
  return <MapaGeneral dynamo={esDynamo(perfil.rol)} />;
}
