// Huella de CO₂ de un envío (usuario, 2026-11-21): orientativa, para enseñar al cliente
// antes de crear el envío y en su ficha, con su equivalencia en árboles.
//
// Método (simplificado de ISO 14083 / GLEC, el estándar del transporte de mercancías):
//   km de la ruta × consumo del camión (litros/km) × factor del gasóleo (kg CO₂e por litro,
//   «del pozo a la rueda»: fabricar y quemar el combustible).
// En GRUPAJE solo cuenta la parte del camión que ocupa la mercancía: la mayor entre metros
// lineales y peso (como el tarifador), con un mínimo del 5 %.
// Árboles: lo que absorbe de media un árbol adulto en un año (~22 kg de CO₂).
// Valores de referencia para un tráiler de 40 t y un rígido de 18 t en carretera.
export const CO2_REF = {
  litrosKmTrailer: 0.32,     // ~32 L / 100 km
  litrosKmRigido: 0.25,      // ~25 L / 100 km (camión rígido con plataforma elevadora)
  kgPorLitro: 3.17,          // gasóleo de automoción, del pozo a la rueda
  kgArbolAnio: 22,
};

export type HuellaCo2 = { kg: number; arboles: number; parte: number };

export function huellaCo2(p: { km: number | null | undefined; ml?: number | null; toneladas?: number | null; plataforma?: boolean | null }): HuellaCo2 | null {
  const km = Number(p.km);
  if (!Number.isFinite(km) || km <= 0) return null;
  const rigido = !!p.plataforma;
  const mlMax = rigido ? 8 : 13.3, tMax = rigido ? 14 : 24;
  const parte = Math.min(1, Math.max(0.05, Number(p.ml ?? mlMax) / mlMax, Number(p.toneladas ?? 0) / tMax));
  const kg = km * (rigido ? CO2_REF.litrosKmRigido : CO2_REF.litrosKmTrailer) * CO2_REF.kgPorLitro * parte;
  return { kg: Math.round(kg), arboles: Math.max(1, Math.round(kg / CO2_REF.kgArbolAnio)), parte };
}

// Km de la ruta a partir de las etapas del seguimiento (cada tramo trae sus km).
export const kmDeEtapas = (etapas: { km?: number | null }[]) => etapas.reduce((s, x) => s + (Number(x.km) || 0), 0);
