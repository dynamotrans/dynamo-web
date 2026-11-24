import { sesion, esDynamo } from '@/lib/sesion';
import { leerHoldedPdf } from '@/lib/servidor/holded';

// GET /api/facturas/{id}/pdf: el PDF de una factura emitida, leído del programa de facturación
// en el momento (SOLO LECTURA). De momento solo para el equipo de Dynamo; cuando el cliente
// vea sus facturas, aquí se comprobará además que la factura es suya.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{24}$/i.test(id)) return new Response('Factura no válida.', { status: 400 });
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return new Response('Sin permiso.', { status: 403 });
  const r = await leerHoldedPdf(`/invoices/${id}/pdf`);
  if (!r.ok) return new Response(r.error, { status: r.estado === 404 ? 404 : 502, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(r.pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="factura-${id}.pdf"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
