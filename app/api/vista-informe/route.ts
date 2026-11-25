import { supabaseServidor } from '@/lib/supabase/server';
import { navegadorCorto } from '@/lib/vistaPantalla';

// Apunta un «descuadre de pantalla» que el navegador ha detectado y recolocado solo (el hueco
// vacío al final en el iPhone: ver lib/vistaPantalla.ts). Solo medidas de la pantalla, la
// ruta y el navegador; nada de lo que el usuario estaba viendo o escribiendo. Con sesión se
// guarda en la base de datos (Mantenimiento → Descuadres de pantalla); sin ella solo queda en
// los registros de Vercel («[Vista]»). Nunca devuelve datos ni rompe nada.
export const dynamic = 'force-dynamic';

const MAX = 4 * 1024;
const CAUSAS = ['pasado_del_final', 'zona_desplazada', 'scroll_de_mas', 'pagina_larga'];
const CLAVES = ['y', 'alto', 'doc', 'contenido', 'vvAlto', 'vvArriba', 'vvPagina', 'escala'] as const;

function medidas(o: unknown): Record<string, number> | null {
  if (!o || typeof o !== 'object') return null;
  const r: Record<string, number> = {};
  for (const k of CLAVES) { const v = (o as Record<string, unknown>)[k]; if (typeof v === 'number' && Number.isFinite(v)) r[k] = Math.round(v * 100) / 100; }
  return r;
}
// Las direcciones con llave (/carga/<llave>, /cmr/<llave>…) o con identificadores no se guardan enteras.
const rutaLimpia = (u: unknown) => String(u ?? '').split(/[?#]/)[0]
  .replace(/\/(carga|cmr|deca|baja|matriculas|cargas-de-vuelta|pago)\/[^/]+/g, '/$1/…')
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '…').slice(0, 120) || '/';

export async function POST(req: Request) {
  try {
    const d = JSON.parse((await req.text()).slice(0, MAX));
    const causa = CAUSAS.includes(d?.causa) ? (d.causa as string) : null;
    if (!causa) return new Response(null, { status: 204 });
    const ruta = rutaLimpia(d.ruta);
    const navegador = navegadorCorto(req.headers.get('user-agent') ?? '');
    const corregido = d.corregido === true;
    const datos = { motivo: String(d.motivo ?? '').replace(/[^a-z_]/g, '').slice(0, 20), antes: medidas(d.antes), despues: medidas(d.despues) };
    console.warn('[Vista]', JSON.stringify({ causa, ruta, navegador, corregido, ...datos }));
    const supabase = await supabaseServidor();
    if (supabase) await supabase.rpc('pantalla_descuadre_anotar', { p_causa: causa, p_ruta: ruta, p_navegador: navegador, p_corregido: corregido, p_datos: datos });
  } catch { /* informe roto o sin sesión: se ignora */ }
  return new Response(null, { status: 204 });
}
