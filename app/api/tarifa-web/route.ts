import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabasePublico } from '@/lib/supabase/publico';
import { calcularTarifa } from '@/lib/tarifador';
import { primerDia } from '@/lib/fechasCarga';

// TARIFADOR DE LA WEB PÚBLICA (usuario, 2026-11-19): precio orientativo para quien no tiene
// cuenta, con el MISMO tarifador del panel, como mucho N veces al día por IP (parámetro
// tarifador_web_max_ip_dia); pasado el límite, la web invita a crear cuenta. Nace apagado
// (tarifador_web_con_precio): apagado, la web sigue como siempre (email / WhatsApp).
// Solo se devuelve el TOTAL y la entrega estimada: nunca el desglose (no se dice qué tipos
// de sitio llevan recargo). La IP no se guarda: solo su huella.
export const dynamic = 'force-dynamic';

const Punto = z.object({ lat: z.number().min(-90).max(90).nullable(), lon: z.number().min(-180).max(180).nullable(), tipo: z.string().max(40) });
const Entrada = z.object({
  puntos: z.array(Punto).min(2).max(4),
  ml: z.number().min(0.5).max(13.3), peso: z.number().min(0.5).max(24),
  rigido: z.boolean(), nima: z.boolean(), paletizada: z.boolean(), techo: z.boolean(),
  urgencia: z.enum(['dia', 'estandar', 'corta', 'larga']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

// Tipos de sitio de la web (desplegable «Almacén / Nave», «Obra»…) → los del panel.
const TIPO: Record<string, string> = {
  'Almacén / Nave': 'almacen_nave', Obra: 'obra_zona_amplia', 'Zona urbana': 'obra_zona_urbana',
  Evento: 'obra_zona_urbana', 'Finca / Agrícola': 'finca', Finca: 'finca',
};

function ipDe(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  return (xf ? xf.split(',')[0] : req.headers.get('x-real-ip') ?? '').trim() || 'desconocida';
}

function kmEstimados(p: z.infer<typeof Punto>[]): number {
  let km = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
    const rad = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    km += Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25);   // línea recta × 1,25 (como el panel sin caché)
  }
  return km;
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  let d: z.infer<typeof Entrada>;
  try { d = Entrada.parse(await req.json()); } catch { return json({ resultado: 'datos' }, 400); }
  const sb = supabasePublico();
  if (!sb) return json({ resultado: 'error' }, 503);
  const huella = createHash('sha256').update(`${ipDe(req)}|${process.env.TARIFA_WEB_SAL ?? 'dynamo-tarifa-web'}`).digest('hex');
  const { data, error } = await sb.rpc('tarifa_web_apuntar', { p_ip_huella: huella });
  if (error || !data) return json({ resultado: 'error' }, 503);
  const r = data as { resultado: string; max?: number; quedan?: number; festivos?: string[] };
  if (r.resultado !== 'ok') return json({ resultado: r.resultado, max: r.max ?? null });

  const festivos = r.festivos ?? [];
  const mlMax = d.rigido ? 8 : 13.3, pesoMax = d.rigido ? 14 : 24;
  const ml = Math.min(d.ml, mlMax), peso = Math.min(d.peso, pesoMax);
  const grupaje = ml < mlMax - 0.01;
  const urgencia = d.urgencia === 'larga' ? 'estandar' : d.urgencia === 'corta' && !grupaje ? 'estandar' : d.urgencia;
  const primero = primerDia(urgencia, grupaje, new Set(festivos));
  const fecha = d.fecha && d.fecha >= primero ? d.fecha : primero;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const t = calcularTarifa({
    km: kmEstimados(d.puntos), puntos: d.puntos.length, tiposSitio: d.puntos.map((p) => TIPO[p.tipo] ?? 'almacen_nave'),
    ml, peso, mlMax, pesoMax, paletizada: d.paletizada, techo: d.techo, plataforma: d.rigido, nima: d.nima, adr: false,
    urgencia, fecha, primerDia: primero, hoy, festivos,
  });
  return json({ resultado: 'ok', neto: t.neto, fecha, etaDesde: t.etaDesde, etaHasta: t.etaHasta, max: r.max, quedan: r.quedan });
}
