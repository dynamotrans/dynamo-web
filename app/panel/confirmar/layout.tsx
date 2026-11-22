// La página de los enlaces de Supabase (invitación, contraseña olvidada) es de navegador: este
// marco hace que se genere en cada visita, para que lleve la llave de un solo uso de la CSP y
// sus scripts no se bloqueen (CSP en modo bloquear desde el 2026-11-22).
export const dynamic = 'force-dynamic';

export default function MarcoConfirmar({ children }: { children: React.ReactNode }) {
  return children;
}
