import { redirect } from 'next/navigation';

// /panel → la pantalla de envíos (la primera ya pasada a datos reales).
export default function Inicio() {
  redirect('/panel/envios');
}
