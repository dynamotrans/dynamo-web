import Cargando from '@/components/Cargando';

// Se enseña al instante al pulsar cualquier opción del menú o enlace del panel, mientras
// el servidor prepara la pantalla (Next.js lo usa solo).
export default function CargandoPanel() {
  return <Cargando />;
}
