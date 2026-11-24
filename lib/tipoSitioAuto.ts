// TIPO DE SITIO AUTOMÁTICO (usuario, 2026-11-24: «por defecto auto; si el cliente o yo queremos
// cambiarlo, lo cambiamos»). Al crear un sitio desde el buscador de Google se propone su tipo:
//   1. por lo que dice Google del negocio (una granja → finca; cualquier otra empresa → nave);
//   2. por las palabras de la dirección o del nombre (polígono industrial, nave, finca,
//      cortijo, «polígono 12 parcela 5» del catastro rústico…);
//   3. y, si es una dirección sin empresa y nada de lo anterior lo aclara, por el TIPO DE
//      SUELO del punto (industrial o agrícola), que Google no da y se mira aparte.
// Una OBRA no la conoce nadie más que quien crea el sitio: nunca se propone sola. Y una
// dirección en zona de viviendas tampoco se decide sola (puede ser una obra, una tienda…).
// Sin red: se prueba con pruebas unitarias.
export type TipoPropuesto = { tipo: 'almacen_nave' | 'finca'; por: 'google' | 'direccion' | 'suelo' };

const limpio = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// «Polígono 12, parcela 5»: así se nombran las fincas rústicas en el catastro.
const CATASTRO_RUSTICO = /\bpoligono\s+\d+[\s,.-]+parcela\s+\d+|\bparcela\s+\d+[\s,.-]+poligono\s+\d+/;
const NAVE = /\b(?:poligono|pol\.?\s?ind|parque\s+(?:empresarial|industrial|logistico|tecnologico|comercial)|(?:zona|area)\s+industrial|naves?|almacen(?:es)?|plataforma\s+logistica|centro\s+(?:logistico|de\s+transportes?)|puerto|muelle|merca(?:madrid|barna|sevilla|valencia|zaragoza|bilbao|malaga|murcia|granada|cordoba|palma|asturias|salamanca|alicante|leon|jerez|badajoz|irun|galicia|santander|tenerife)|campa)\b|\bpol\.\s|\bp\.\s?i\.(?:\s|$)/;
const RUSTICO = /\b(finca|cortijo|hacienda|dehesa|granja|huerta|invernaderos?|paraje|explotacion\s+(agricola|ganadera))\b/;
// Tipos de negocio de Google que son campo (se comparan por nombre: si Google añade o cambia
// alguno, lo desconocido simplemente no cuenta).
const GOOGLE_RUSTICO = /^(farm|ranch|agricultur\w*|orchard|vineyard|greenhouse|plant_nursery|stable|livestock\w*)$/;

/** Por las palabras del nombre y de la dirección. */
export function tipoPorTexto(...textos: (string | null | undefined)[]): TipoPropuesto['tipo'] | null {
  const t = limpio(textos.filter(Boolean).join(' · '));
  if (!t.trim()) return null;
  if (CATASTRO_RUSTICO.test(t)) return 'finca';
  if (NAVE.test(t)) return 'almacen_nave';
  if (RUSTICO.test(t)) return 'finca';
  return null;
}

/** Lo que se sabe sin salir de la ficha de Google. `esDireccion`: es una calle, no una empresa. */
export function tipoPorGoogle(o: { tipos?: string[] | null; empresa?: string | null; direccion?: string | null; esDireccion?: boolean }): TipoPropuesto | null {
  const texto = tipoPorTexto(o.esDireccion ? null : o.empresa, o.direccion);
  if (o.esDireccion) return texto ? { tipo: texto, por: 'direccion' } : null;
  if (texto === 'almacen_nave') return { tipo: texto, por: 'direccion' };
  if ((o.tipos ?? []).some((x) => GOOGLE_RUSTICO.test(x))) return { tipo: 'finca', por: 'google' };
  if (texto) return { tipo: texto, por: 'direccion' };
  // Una empresa con ficha en Google: lo normal es que se cargue en su nave o almacén.
  return { tipo: 'almacen_nave', por: 'google' };
}

const SUELO_NAVE = ['industrial', 'commercial', 'retail', 'port', 'railway', 'depot', 'logistics'];
const SUELO_RUSTICO = ['farmland', 'farmyard', 'orchard', 'vineyard', 'meadow', 'forest', 'greenhouse_horticulture', 'plant_nursery', 'animal_keeping', 'aquaculture'];
/** Por el tipo de suelo del punto. Si hay de los dos, o es zona de viviendas, no se decide. */
export function tipoPorSuelo(usos: string[]): TipoPropuesto | null {
  const nave = usos.some((u) => SUELO_NAVE.includes(u)), rustico = usos.some((u) => SUELO_RUSTICO.includes(u));
  if (nave === rustico) return null;
  return { tipo: nave ? 'almacen_nave' : 'finca', por: 'suelo' };
}

/** Los tipos de suelo de la respuesta del servicio (ver lib/servidor/usoSuelo). */
export function usosDeRespuesta(j: { elements?: { tags?: Record<string, string> }[] } | null): string[] {
  return [...new Set((j?.elements ?? []).map((e) => e.tags?.landuse).filter((x): x is string => !!x))];
}
