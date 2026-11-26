import { sesion, esDynamo } from '@/lib/sesion';
import { leerHoldedPdf } from '@/lib/servidor/holded';
import { apuntarConsultas } from '@/lib/servidor/holdedUso';

// GET /api/facturas/{id}/pdf: el PDF de una factura emitida, leído del programa de facturación
// en el momento (SOLO LECTURA). El equipo de Dynamo, cualquiera; el cliente, solo las SUYAS:
// lo decide la base de datos (factura_visible) mirando la copia de facturas, nunca un dato del
// navegador. A quien no puede verla se le contesta igual que si no existiera.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const texto = (t: string, status: number) => new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{24}$/i.test(id)) return texto('Factura no válida.', 400);
  const s = await sesion();
  if (!s?.perfil) return texto('Sin permiso.', 403);
  const dynamo = esDynamo(s.perfil.rol) && s.perfil.estado === 'activa';
  if (!dynamo && !(s.perfil.rol === 'cliente' && ['activa', 'suspendida'].includes(s.perfil.estado))) return texto('Sin permiso.', 403);
  const { data: numero } = await s.supabase.rpc('factura_visible', { p_ref: id.toLowerCase() });
  if (!numero && !dynamo) return texto('No se encuentra la factura.', 404);
  const r = await leerHoldedPdf(`/invoices/${id.toLowerCase()}/pdf`);
  await apuntarConsultas();
  if (!r.ok) return texto(dynamo ? r.error : 'No se ha podido abrir la factura. Prueba otra vez en un momento.', r.estado === 404 ? 404 : 502);
  const nombre = String(numero ?? id).replace(/[^\w.-]+/g, '-').slice(0, 60) || 'factura';
  return new Response(r.pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="factura-${nombre}.pdf"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
