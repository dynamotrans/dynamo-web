import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BYTES_CABECERA, tipoReal, type TipoReal } from '@/lib/contenidoArchivo';
import { supabaseServicio } from '@/lib/supabase/servicio';

// La comprobación del CONTENIDO REAL de un fichero del almacén, en el servidor (la del
// navegador es solo cortesía: quien quiera colar algo se la salta). Lee los primeros bytes
// del fichero —no lo baja entero— y dice qué es. Ver lib/contenidoArchivo.ts.
//
// Dónde se usa:
//   · al ABRIR un documento (/panel/documentos/<id>): es la que protege a quien lo abre, y
//     vale para todo, también para lo subido por un enlace público o antes de este cambio;
//   · al REGISTRAR lo recién subido, si está la clave de servicio (sin fila en `documentos`
//     nadie más puede leer el fichero): lo que no es imagen ni PDF se rechaza y se borra.

export type Contenido = { estado: 'ok'; tipo: TipoReal } | { estado: 'malo' } | { estado: 'sin_leer' };

/** Los primeros bytes de lo que hay en una dirección firmada del almacén. */
export async function contenidoDeUrl(url: string): Promise<Contenido> {
  try {
    const r = await fetch(url, { headers: { Range: `bytes=0-${BYTES_CABECERA - 1}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (r.status === 416) return { estado: 'malo' };          // fichero vacío
    if (!r.ok || !r.body) return { estado: 'sin_leer' };
    // Si el almacén no hiciera caso del rango y mandara el fichero entero, se lee solo el
    // principio y se corta.
    const lector = r.body.getReader();
    const trozos: Uint8Array[] = []; let n = 0;
    while (n < BYTES_CABECERA) {
      const { done, value } = await lector.read();
      if (done) break;
      if (value?.length) { trozos.push(value); n += value.length; }
    }
    lector.cancel().catch(() => {});
    const b = new Uint8Array(Math.min(n, BYTES_CABECERA)); let o = 0;
    for (const t of trozos) { const c = t.subarray(0, b.length - o); b.set(c, o); o += c.length; if (o >= b.length) break; }
    const tipo = tipoReal(b);
    return tipo ? { estado: 'ok', tipo } : { estado: 'malo' };
  } catch { return { estado: 'sin_leer' }; }
}

export async function contenidoDeRuta(sb: Pick<SupabaseClient, 'storage'>, ruta: string, bucket = 'documentos'): Promise<Contenido> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, 30);
  if (error || !data?.signedUrl) return { estado: 'sin_leer' };
  return contenidoDeUrl(data.signedUrl);
}

/**
 * Al registrar ficheros recién subidos: ¿alguno NO es una imagen ni un PDF de verdad?
 * Devuelve las rutas malas, ya BORRADAS del almacén. Sin la clave de servicio, o si el
 * almacén no contesta, no rechaza nada: la comprobación al abrir sigue ahí.
 *
 * Las rutas las manda el navegador, y esta función BORRA con la clave de servicio, así que
 * va atada en corto para que nadie la use contra un fichero ajeno:
 *   · `carpeta` es la única donde quien llama ha podido subir (la suya, la del enlace…): lo
 *     que no esté dentro cuenta como no válido y NO se toca;
 *   · nunca se borra un fichero que ya tiene su fila (`documentos`) o es el trazo de una
 *     firma: esos son prueba y no los ha subido esta llamada.
 */
export async function ficherosNoValidos(rutas: string[], carpeta: string, soloImagen = false): Promise<string[]> {
  if (!rutas.length) return [];
  const fuera = rutas.filter((r) => !r.startsWith(carpeta) || r.includes('..'));
  if (fuera.length) return fuera;
  const sv = supabaseServicio();
  if (!sv) return [];
  const vistos = await Promise.all(rutas.map(async (ruta) => ({ ruta, c: await contenidoDeRuta(sv, ruta) })));
  const malas = vistos.filter(({ c }) => c.estado === 'malo' || (soloImagen && c.estado === 'ok' && !c.tipo.startsWith('image/'))).map((x) => x.ruta);
  if (malas.length) {
    console.error('[archivos] contenido no válido al registrar: se rechaza', { rutas: malas });
    const [{ data: conFila }, { data: trazos }] = await Promise.all([
      sv.from('documentos').select('storage_ruta').in('storage_ruta', malas),
      sv.from('firmas_cmr').select('firma_storage_ruta').in('firma_storage_ruta', malas),
    ]);
    const intocables = new Set([...(conFila ?? []).map((x) => x.storage_ruta), ...(trazos ?? []).map((x) => x.firma_storage_ruta)]);
    const borrar = malas.filter((r) => !intocables.has(r));
    if (borrar.length) await sv.storage.from('documentos').remove(borrar).catch(() => {});
  }
  return malas;
}
