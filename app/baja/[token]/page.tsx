import type { Metadata } from 'next';
import { supabasePublico } from '@/lib/supabase/publico';
import { CONTACTO } from '@/lib/atencion';
import { darseDeBaja } from './acciones';
import '../../carga/carga.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Baja del resumen mensual · Dynamo', robots: { index: false, follow: false } };

// La baja del RESUMEN MENSUAL a los sitios (usuario, 2026-11-17). El enlace del email trae
// aquí; la baja se confirma con un botón (un enlace que diera de baja solo lo pulsarían
// los filtros de correo). Solo corta el resumen: los avisos de recogida y entrega de cada
// envío siguen llegando, porque son operativos.
export default async function PaginaBaja({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = supabasePublico();
  let r: { resultado?: string; email?: string } | null = null;
  if (sb && /^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await sb.rpc('baja_resumen_sitio', { p_token: token, p_confirmar: false });
    r = data as { resultado?: string; email?: string } | null;
  }
  const estado = r?.resultado ?? 'enlace_no_valido';
  return (
    <div className="carga-page">
      <div className="card">
        <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>
        {estado === 'pendiente' && (
          <form action={darseDeBaja}>
            <input type="hidden" name="token" value={token} />
            <h1>Baja del resumen mensual</h1>
            <p className="sub">Dejaremos de enviar el resumen mensual a <strong>{r?.email}</strong>. Los avisos de recogida y entrega de cada envío os seguirán llegando.</p>
            <button type="submit" className="btn">Darme de baja</button>
          </form>
        )}
        {(estado === 'ok' || estado === 'ya_de_baja') && (
          <>
            <h1>Baja hecha</h1>
            <p className="sub"><strong>{r?.email}</strong> ya no recibirá el resumen mensual. Si ha sido un error, escríbenos a {CONTACTO.email}.</p>
          </>
        )}
        {estado === 'enlace_no_valido' && (
          <>
            <h1>Este enlace no es válido</h1>
            <p className="sub">Revisa que lo has copiado entero, o escríbenos a {CONTACTO.email} y te damos de baja nosotros.</p>
          </>
        )}
      </div>
      <p className="foot">Dynamo Operador Logístico, S.L.</p>
    </div>
  );
}
