import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { datosDynamo, nombrePais } from '@/lib/pdf/datos';
import { proforma } from '@/lib/pdf/proforma';
import type { Tabla } from '@/lib/supabase/tipos';

// Proforma ORIENTATIVA de la calculadora de Nuevo envío (usuario, 2026-11-11): el precio
// calculado, en PDF, ANTES de crear el envío. NO crea nada, NO reserva nada y va SIN
// datos de pago (no es pagadera): es solo un papel para ver precios. La proforma real,
// con los datos de la transferencia, es la del envío ya creado pendiente de pago — y
// solo cuando su precio ya está fijado (a N días o menos de la carga).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ClienteProforma = Pick<Tabla<'clientes'>, 'razon_social' | 'cif' | 'direccion' | 'codigo_postal' | 'poblacion' | 'pais_codigo_iso'> & { iva_pct?: number | null };
const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request) {
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  const u = new URL(req.url);
  const base = Number((u.searchParams.get('base') ?? '').replace(',', '.'));
  if (!Number.isFinite(base) || base <= 0 || base > 100000) return texto('Falta el importe del cálculo.', 400);
  const ruta = (u.searchParams.get('ruta') ?? '').slice(0, 160);
  const det = (u.searchParams.get('det') ?? '').slice(0, 240);

  // El cliente siempre es ÉL MISMO; Dynamo pasa el cliente elegido en el asistente.
  let c: ClienteProforma | null = null;
  if (esDynamo(yo.rol)) {
    const cid = u.searchParams.get('cliente') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(cid)) return texto('Falta el cliente del cálculo.', 400);
    c = (await sb.from('clientes').select('razon_social, cif, direccion, codigo_postal, poblacion, pais_codigo_iso, iva_pct').eq('id', cid).maybeSingle<ClienteProforma>()).data;
  } else {
    c = (await sb.rpc('mi_empresa').maybeSingle()).data as ClienteProforma | null;
  }
  if (!c) return texto('Ese cliente no existe.', 404);

  const { data: reg } = await sb.rpc('reglas_precio_envio');
  const cerrado = Number((reg as { cerrado_dias?: number } | null)?.cerrado_dias ?? 7);
  const bytes = await proforma({
    codigo: 'CALCULO', referencia_cliente: null, creado_en: new Date().toISOString(),
    cliente: { razon_social: c.razon_social ?? '—', cif: c.cif ?? '—', direccion: c.direccion ?? null,
      codigo_postal: c.codigo_postal ?? null, poblacion: c.poblacion ?? null, pais: nombrePais(c.pais_codigo_iso) },
    conceptos: [{ titulo: `Transporte${ruta ? ` · ${ruta}` : ''}`, sub: det, importe: base }],
    iva: Number(c.iva_pct ?? 21),
    sinPago: { aviso: 'Este documento NO crea ningún envío ni reserva: es solo el precio calculado hoy, para que lo veas. '
      + 'Por eso no lleva datos de pago. La proforma pagadera, con los datos de la transferencia, sale al crear el envío '
      + 'y quedar pendiente de pago, con el precio ya fijado.' },
    condiciones: `Precio válido al crear y confirmar el envío ahora. Las tarifas son dinámicas: el precio se fija al `
      + `confirmar el envío a menos de ${cerrado} días de la carga. Con más antelación, el precio se actualizará al llegar a `
      + `${cerrado} días de la primera parada, con el precio válido para el día de carga.`,
    dynamo: await datosDynamo(sb),
  });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': 'inline; filename="Proforma-calculo.pdf"', 'cache-control': 'private, no-store' } });
}
