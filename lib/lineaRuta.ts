// La LÍNEA de una ruta por carretera (la da Google Routes, codificada): descifrarla, medirla y
// partirla donde va el camión. Sin red ni pantalla: se prueba con pruebas unitarias.
export type PuntoLinea = [number, number];   // [latitud, longitud]

/** Descifra la línea de una ruta de Google (formato «encoded polyline», precisión 5). */
export function descifrarLinea(t: string | null | undefined): PuntoLinea[] {
  const s = t ?? '', pts: PuntoLinea[] = [];
  let i = 0, lat = 0, lon = 0;
  const leer = (): number | null => {
    let r = 0, d = 0, b: number;
    do {
      if (i >= s.length) return null;
      b = s.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      r |= (b & 0x1f) << d; d += 5;
    } while (b >= 0x20);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < s.length) {
    const a = leer(); if (a === null) break;
    const b = leer(); if (b === null) break;
    lat += a; lon += b;
    if (Math.abs(lat) > 9e6 || Math.abs(lon) > 18e6) break;   // fuera del mapa: línea estropeada
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

// Distancia entre dos puntos cercanos (aproximación plana: de sobra para repartir un tramo).
const largo = (a: PuntoLinea, b: PuntoLinea) => {
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180), y = b[0] - a[0];
  return Math.sqrt(x * x + y * y);
};

/** Parte una línea en la fracción recorrida (0–1): lo hecho, lo que falta y el punto de corte. */
export function partirLinea(linea: PuntoLinea[], fraccion: number): { hecho: PuntoLinea[]; falta: PuntoLinea[]; punto: PuntoLinea } | null {
  if (linea.length < 2) return null;
  const f = Math.min(Math.max(Number.isFinite(fraccion) ? fraccion : 0, 0), 1);
  const tramos = linea.slice(1).map((p, i) => largo(linea[i], p));
  const total = tramos.reduce((a, b) => a + b, 0);
  if (total <= 0) return { hecho: [linea[0]], falta: [...linea], punto: linea[0] };
  let resto = total * f;
  for (let i = 0; i < tramos.length; i++) {
    if (resto <= tramos[i] || i === tramos.length - 1) {
      const k = tramos[i] > 0 ? Math.min(resto / tramos[i], 1) : 0;
      const a = linea[i], b = linea[i + 1];
      const punto: PuntoLinea = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      return { hecho: [...linea.slice(0, i + 1), punto], falta: [punto, ...linea.slice(i + 1)], punto };
    }
    resto -= tramos[i];
  }
  return null;
}

/** El trazado de un tramo, empezando y acabando EXACTAMENTE en sus dos paradas (el de Google
 *  acaba en la carretera más cercana, y el guardado por código postal, en su centro). */
export function trazadoEntre(a: PuntoLinea, b: PuntoLinea, linea: PuntoLinea[] | undefined): PuntoLinea[] {
  if (!linea || linea.length < 2) return [a, b];
  return [a, ...linea, b];
}

// Kilómetros en línea recta entre dos puntos (haversine).
export function kmRectos(a: PuntoLinea, b: PuntoLinea): number {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** ¿La línea guardada es la de ESTE tramo? Tiene que empezar cerca de una parada y acabar cerca
 *  de la otra (`invertida`: se guardó en el sentido contrario). El margen deja sitio a que el
 *  trazado sea el de los códigos postales (acaba en su centro) y no el de la puerta exacta. Una
 *  línea que no encaja no se pinta: es de una ruta calculada sobre otro sitio. */
export function lineaEncaja(linea: string | null | undefined, a: PuntoLinea, b: PuntoLinea, invertida = false, margenKm = 40): boolean {
  const p = descifrarLinea(linea);
  if (p.length < 2) return false;
  const [ini, fin] = invertida ? [p[p.length - 1], p[0]] : [p[0], p[p.length - 1]];
  return kmRectos(ini, a) <= margenKm && kmRectos(fin, b) <= margenKm;
}

/** Lo que devuelve el servidor (trazadosDeEnvios): las líneas sin repetir y qué tramo usa cuál. */
// `alreves`: la línea guardada es la del sentido contrario (la vuelta): se pinta invertida.
export type Trazados = { lineas: string[]; tramos: { envio: string; desde: number; hasta: number; linea: number; alreves?: boolean }[] };
/** Lo reparte por envío y tramo («1-2»), descifrando cada línea una sola vez. */
export function repartirTrazados(t: Trazados): Record<string, Record<string, PuntoLinea[]>> {
  const puntos = t.lineas.map((l) => descifrarLinea(l));
  const vuelta: (PuntoLinea[] | undefined)[] = [];
  const r: Record<string, Record<string, PuntoLinea[]>> = {};
  for (const x of t.tramos) {
    const ida = puntos[x.linea];
    if (!ida || ida.length < 2) continue;
    const p = x.alreves ? (vuelta[x.linea] ??= [...ida].reverse()) : ida;
    (r[x.envio] ??= {})[`${x.desde}-${x.hasta}`] = p;
  }
  return r;
}
