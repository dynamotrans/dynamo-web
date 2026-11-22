import 'server-only';
import { leerRespuesta, rutaPorCif, rutaPorNombre, type EmpresaRegistro } from '@/lib/apiEmpresas';

// La llamada a APIEmpresas.es, SOLO desde el servidor (la clave nunca llega al navegador).
// Sin la variable APIEMPRESAS_API_KEY (Vercel, Sensitive) no se llama a nada: autorrelleno apagado.
// Antes de crear la clave: TOPE DE GASTO en su panel si lo permite (regla del proyecto).
export const hayClaveApiEmpresas = () => !!process.env.APIEMPRESAS_API_KEY;

export type RespuestaApi =
  | { ok: true; empresas: EmpresaRegistro[] }
  | { ok: false; motivo: 'sin_clave' | 'no_encontrada' | 'sin_saldo' | 'fallo' };

export async function consultarApiEmpresas(tipo: 'cif' | 'nombre', texto: string): Promise<RespuestaApi> {
  const clave = process.env.APIEMPRESAS_API_KEY;
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  try {
    const r = await fetch(tipo === 'cif' ? rutaPorCif(texto) : rutaPorNombre(texto), {
      headers: { 'X-API-KEY': clave, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (r.status === 404) return { ok: false, motivo: 'no_encontrada' };
    // 402 / 429: sin saldo o demasiadas peticiones.
    if (r.status === 402 || r.status === 429) return { ok: false, motivo: 'sin_saldo' };
    if (!r.ok) return { ok: false, motivo: 'fallo' };
    const empresas = leerRespuesta(await r.json()).slice(0, 10);
    return empresas.length ? { ok: true, empresas } : { ok: false, motivo: 'no_encontrada' };
  } catch {
    return { ok: false, motivo: 'fallo' };
  }
}
