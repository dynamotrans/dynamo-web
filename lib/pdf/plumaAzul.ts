// Trazo de firma SIEMPRE en azul bolígrafo al imprimir (usuario, 2026-11-14).
// Recolorea el PNG del trazo antes de incrustarlo en el PDF: cuanto más oscuro el
// píxel (la tinta), más azul; el blanco del fondo se queda blanco y el canal alfa
// no se toca. Así también las firmas antiguas guardadas en negro salen azules.
// Solo trata el formato que produce un <canvas> (8 bits, RGB o RGBA, sin
// entrelazado); ante cualquier otro, devuelve el PNG tal cual.
import { inflateSync, deflateSync } from 'node:zlib';

const AZUL = [27, 63, 160] as const; // azul bolígrafo

const TABLA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function plumaAzul(png: Uint8Array): Uint8Array {
  try {
    const d = Buffer.from(png);
    if (d.length < 45 || d.readUInt32BE(0) !== 0x89504e47) return png;
    // Trocea los chunks: nos quedamos con IHDR y los IDAT concatenados.
    let ancho = 0, alto = 0, bits = 0, tipo = -1, entrelazado = 1;
    const idats: Buffer[] = [];
    for (let p = 8; p + 8 <= d.length;) {
      const lon = d.readUInt32BE(p), nombre = d.toString('latin1', p + 4, p + 8);
      if (p + 12 + lon > d.length) return png;
      const cuerpo = d.subarray(p + 8, p + 8 + lon);
      if (nombre === 'IHDR') {
        ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4);
        bits = cuerpo[8]; tipo = cuerpo[9]; entrelazado = cuerpo[12];
      } else if (nombre === 'IDAT') idats.push(Buffer.from(cuerpo));
      else if (nombre === 'IEND') break;
      p += 12 + lon;
    }
    if (bits !== 8 || (tipo !== 2 && tipo !== 6) || entrelazado !== 0 || !ancho || !alto || !idats.length) return png;
    const bpp = tipo === 6 ? 4 : 3, paso = 1 + ancho * bpp;
    const crudo = inflateSync(Buffer.concat(idats));
    if (crudo.length < paso * alto) return png;
    // Desfiltra línea a línea (filtros PNG 0-4) para poder tocar los píxeles.
    const img = Buffer.alloc(ancho * bpp * alto);
    for (let y = 0; y < alto; y++) {
      const f = crudo[y * paso], fila = y * ancho * bpp, arriba = fila - ancho * bpp;
      for (let i = 0; i < ancho * bpp; i++) {
        const x = crudo[y * paso + 1 + i];
        const izq = i >= bpp ? img[fila + i - bpp] : 0, sup = y > 0 ? img[arriba + i] : 0,
          diag = y > 0 && i >= bpp ? img[arriba + i - bpp] : 0;
        img[fila + i] = (x + (f === 1 ? izq : f === 2 ? sup : f === 3 ? (izq + sup) >> 1 : f === 4 ? paeth(izq, sup, diag) : 0)) & 0xff;
      }
    }
    // Tinta → azul: mezcla blanco↔azul según lo oscuro del píxel (respeta el
    // antialias del borde del trazo); el alfa se conserva tal cual.
    for (let p = 0; p < img.length; p += bpp) {
      const t = 1 - (0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2]) / 255;
      img[p] = Math.round(255 + (AZUL[0] - 255) * t);
      img[p + 1] = Math.round(255 + (AZUL[1] - 255) * t);
      img[p + 2] = Math.round(255 + (AZUL[2] - 255) * t);
    }
    // Vuelve a montar el PNG (filtro 0 en todas las líneas; IHDR + IDAT + IEND).
    const sinFiltro = Buffer.alloc(paso * alto);
    for (let y = 0; y < alto; y++) img.copy(sinFiltro, y * paso + 1, y * ancho * bpp, (y + 1) * ancho * bpp);
    const chunk = (nombre: string, cuerpo: Buffer) => {
      const c = Buffer.alloc(12 + cuerpo.length);
      c.writeUInt32BE(cuerpo.length, 0); c.write(nombre, 4, 'latin1'); cuerpo.copy(c, 8);
      c.writeUInt32BE(crc32(c.subarray(4, 8 + cuerpo.length)), 8 + cuerpo.length);
      return c;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = tipo;
    return Buffer.concat([d.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(sinFiltro)), chunk('IEND', Buffer.alloc(0))]);
  } catch {
    return png; // mejor la firma en negro que sin firma
  }
}
