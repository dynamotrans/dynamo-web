import { redirect } from 'next/navigation';

// «Para hoy» ya no es una sección: sus bloques viven como cajas con contador en el
// Dashboard admin (usuario, 2026-11-09). La ruta se queda para marcadores viejos.
export default function PaginaParaHoy() {
  redirect('/panel/dashboard-admin');
}
