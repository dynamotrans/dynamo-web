import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sesion } from '@/lib/sesion';
import { tituloDe } from '@/lib/menu';

export const dynamic = 'force-dynamic';

// Pantallas del menú que aún no están pasadas a datos reales: se ven en el mockup
// (dashboard.html) y se irán pasando una a una (patrón estrangulador).
export default async function SeccionPendiente({ params }: { params: Promise<{ seccion: string }> }) {
  const { seccion } = await params;
  const s = await sesion();
  if (!s) return null;
  const titulo = tituloDe(seccion, s.perfil?.rol ?? 'cliente');
  if (!titulo) notFound();
  return (
    <section className="section active">
      <div className="sec-header"><h2>{titulo}</h2></div>
      <div className="pt-aviso info" style={{ maxWidth: 640 }}>
        <div>
          <strong>Esta pantalla se está pasando a la plataforma real.</strong> De momento ya funcionan
          con datos de verdad la entrada y la lista de <Link href="/panel/envios" style={{ color: 'var(--purple)', fontWeight: 700 }}>Envíos</Link>.
        </div>
      </div>
    </section>
  );
}
