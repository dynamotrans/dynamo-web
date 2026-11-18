// QUÉ ES DE VERDAD un fichero, mirando sus primeros bytes (su «firma»), y no lo que dice
// ser: el tipo que declara quien lo sube y la extensión del nombre los elige él, así que
// cualquier cosa puede llamarse «albaran.pdf» y decir que es un PDF. El almacén solo admite
// PDF e imágenes, y aquí se comprueba que el contenido LO SEA (usuario, 2026-11-18).
//
// No es un antivirus: no mira dentro de un PDF o de una foto de verdad. Corta lo que NO es
// ni una cosa ni otra (un programa, una página web, un Word, un ZIP…) disfrazado de ellas.
//
// Vale igual en el navegador (aviso inmediato a quien se equivoca de fichero) y en el
// servidor (que es donde cuenta: al registrar el fichero y, sobre todo, al ABRIRLO).

export type TipoReal = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

/** Bytes del principio que hacen falta para decidir. */
export const BYTES_CABECERA = 64;

const ascii = (b: Uint8Array, desde: number, n: number) => String.fromCharCode(...b.subarray(desde, desde + n));
const empieza = (b: Uint8Array, firma: number[], desde = 0) => b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x);
// Familias de HEIC/HEIF (las fotos del iPhone y de muchos Android): van en una caja «ftyp».
const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif']);

export function tipoReal(b: Uint8Array): TipoReal | null {
  if (!b || b.length < 4) return null;
  if (empieza(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(b, 0, 4) === 'RIFF' && b.length >= 12 && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    // La marca principal y, detrás, las compatibles (de 4 en 4 hasta el final de la caja).
    const fin = Math.min(b.length, Math.max(16, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0));
    const marcas = [ascii(b, 8, 4)];
    for (let i = 16; i + 4 <= fin; i += 4) marcas.push(ascii(b, i, 4));
    if (marcas.some((m) => MARCAS_HEIC.has(m))) return 'image/heic';
    return null;
  }
  // PDF: «%PDF-» al principio. Algunos programas dejan delante la marca de UTF-8 o un salto
  // de línea: se toleran esos pocos bytes y nada más (no vale «en algún sitio del fichero»).
  let i = empieza(b, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (i < 8 && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0d || b[i] === 0x0a)) i++;
  if (b.length >= i + 5 && ascii(b, i, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** En el navegador: el tipo real de un fichero elegido por el usuario. */
export async function tipoRealDeArchivo(f: Blob): Promise<TipoReal | null> {
  try { return tipoReal(new Uint8Array(await f.slice(0, BYTES_CABECERA).arrayBuffer())); }
  catch { return null; }
}

export const esImagenReal = (t: TipoReal | null) => !!t && t.startsWith('image/');
/** El aviso a quien ha elegido un fichero que no es lo que dice. */
export const avisoNoValido = (nombre: string, soloImagen = false) =>
  `«${nombre}» no es ${soloImagen ? 'una imagen' : 'una imagen ni un PDF'} de verdad (aunque el nombre lo diga): no se ha subido. Haz una foto o guarda el documento como PDF.`;
