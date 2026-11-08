// Tarifador BORRADOR (v1, 2026-11-08): el motor de precio sugerido del mockup
// (public/dashboard.html), portado tal cual a la plataforma. TODOS los números son
// PROVISIONALES (MOCK) hasta que llegue la tarifa real del usuario; entonces los
// coeficientes pasarán a la carpeta `tarifa` de la base de datos y aquí quedará solo
// el cálculo. El precio sugerido SOLO rellena por defecto los precios internos de
// Dynamo (editables) y, al cliente, se le enseña como orientativo: el que vale es el
// que confirma Dynamo.
//
// Esquema del cálculo (mockup):
//   envío base   = 220 + km × 1,35 × ocupación   (mínimo 320 completo / 190 grupaje, redondeo a 10)
//   ocupación    = max(coef. metros, peso/máx, palets/máx)   (palets = metros × 2,5)
//   + paradas extra (40 € cada una) + recargo por tipo de sitio (% del envío base, por punto)
//   + suplementos (no paletizada, techo, plataforma, NIMA, ADR) + suplemento de fecha fija
//   − descuento por peso bajo en tráiler completo
import { sumarHabiles } from '@/lib/fechasCarga';

export type EntradaTarifa = {
  km: number;                          // suma de los tramos de la ruta (estimada si no hay caché)
  puntos: number;                      // nº de puntos de la ruta (2 a 4)
  tiposSitio: string[];                // tipo de cada punto (almacen_nave, obra_zona_amplia, obra_zona_urbana, finca)
  ml: number; peso: number;            // metros lineales y toneladas elegidos
  mlMax: number; pesoMax: number;      // máximos del camión (13,3/24 tráiler · 8/14 rígido)
  paletizada: boolean;
  techo: boolean;                      // la carga entra o sale por el techo
  plataforma: boolean;                 // plataforma elevadora (rígido)
  nima: boolean; adr: boolean;
  urgencia: 'dia' | 'estandar';
  fecha: string | null;                // YYYY-MM-DD elegida (null: aún sin fecha)
  primerDia: string;                   // primer día disponible para ese tipo de fecha
  hoy: string;
  festivos: string[];
};

export type LineaTarifa = { k: string; v: number };
export type AlternativaTarifa = {
  titulo: string; detalle: string; ahorro: number; recomendada: boolean;
  urgencia: 'dia' | 'estandar'; fecha: string;                  // lo que hay que poner al pulsar «Elegir»
};
export type Tarifa = {
  neto: number;                        // base imponible sugerida (sin IVA)
  lineas: LineaTarifa[];               // desglose en orden (el importe del envío primero)
  grupaje: boolean;
  alternativas: AlternativaTarifa[];   // más baratas, con su ahorro («Elegir» cambia fecha/tipo)
  etaDesde: string | null; etaHasta: string | null; diasTransito: number;   // entrega estimada
};

const r10 = (n: number) => Math.round(n / 10) * 10;

// Ocupación por metros: tabla escalonada aproximada del cliente (0,8 ml→25 % … 10,4 ml→100 %
// sobre 13,2 m). PROVISIONAL: afinar con la tabla exacta cuando llegue la tarifa.
function coefMetros(ml: number, mlMax: number): number {
  const r = ml / mlMax;
  const tramos: [number, number][] = [
    [0.061, 0.25], [0.076, 0.33], [0.15, 0.40], [0.23, 0.50], [0.30, 0.55],
    [0.38, 0.62], [0.45, 0.68], [0.53, 0.75], [0.61, 0.82], [0.68, 0.88], [0.79, 1.0],
  ];
  for (const [hasta, c] of tramos) if (r <= hasta) return c;
  return 1;
}

// Recargo por tipo de sitio (% sobre el envío base, POR PUNTO). PROVISIONAL: cuando se
// decida, saldrá de recargos_tipo_sitio (la tabla ya existe con vigencias).
const RECARGO_SITIO: Record<string, [number, string]> = {
  obra_zona_amplia: [5, 'Obra · zona amplia'],
  obra_zona_urbana: [20, 'Obra · zona urbana'],
  finca: [25, 'Finca / agrícola'],
};

// Temporada de calor (15 jun – 15 sep): cargar por techo cuesta más (lona + horas de sol).
function esVerano(f: string): boolean {
  const [, m, d] = f.split('-').map(Number);
  return (m === 6 && d >= 15) || m === 7 || m === 8 || (m === 9 && d <= 15);
}

export function calcularTarifa(e: EntradaTarifa): Tarifa {
  const fest = new Set(e.festivos);
  const lineas: LineaTarifa[] = [];
  const grupaje = e.ml < e.mlMax - 0.01;

  // 1. El importe del envío: 220 de salida + km por ocupación.
  const palets = Math.round(e.ml * 2.5);
  const ocupacion = Math.max(coefMetros(e.ml, e.mlMax), e.peso / e.pesoMax, palets / Math.round(e.mlMax * 2.5));
  let envioBase = r10(220 + e.km * 1.35 * ocupacion);
  envioBase = Math.max(envioBase, grupaje ? 190 : 320);
  lineas.push({ k: 'Importe del envío', v: envioBase });

  // 2. Paradas extra (la ruta normal son 2 puntos).
  const extras = Math.max(0, e.puntos - 2);
  if (extras > 0) lineas.push({ k: `Paradas extra (${extras})`, v: extras * 40 });

  // 3. Recargo por tipo de sitio, por punto, sobre el envío base.
  for (const t of e.tiposSitio) {
    const rec = RECARGO_SITIO[t];
    if (rec) lineas.push({ k: `Recargo ${rec[1]} (${rec[0]} %)`, v: r10(envioBase * rec[0] / 100) });
  }

  // 4. Suplementos de la mercancía.
  if (!e.paletizada) lineas.push({ k: 'Mercancía no paletizada', v: 70 });
  if (e.techo) lineas.push({ k: 'Carga/descarga por techo', v: e.fecha && esVerano(e.fecha) ? 90 : 50 });
  if (e.plataforma) lineas.push({ k: 'Plataforma elevadora', v: 60 });
  if (e.nima) lineas.push({ k: 'Residuos · NIMA', v: 50 });
  if (e.adr) {
    const sub = lineas.reduce((a, l) => a + l.v, 0);
    lineas.push({ k: 'Mercancía peligrosa (ADR)', v: r10(sub * 0.5) });
  }

  // 5. Suplemento de fecha fija: 100 si es el primer día disponible (urgente), 50 el resto;
  //    una fecha pasada (registro a posteriori del Admin Master) no lleva.
  const pasada = !!e.fecha && e.fecha < e.hoy;
  const fijaUrgente = e.urgencia === 'dia' && !!e.fecha && !pasada && e.fecha <= e.primerDia;
  if (e.urgencia === 'dia' && e.fecha && !pasada) {
    lineas.push({ k: fijaUrgente ? 'Fecha fija (urgente)' : 'Fecha fija', v: fijaUrgente ? 100 : 50 });
  }

  // 6. Descuento por peso bajo en tráiler completo (va bien de contrapeso para otro grupaje).
  if (!e.plataforma && !grupaje && e.peso > 0 && e.peso <= 20) {
    const pct = e.peso <= 4 ? 3.5 : e.peso <= 8 ? 3 : e.peso <= 12 ? 2.5 : e.peso <= 16 ? 2 : 1;
    const dto = Math.ceil(envioBase * pct / 100 / 10) * 10;
    lineas.push({ k: `Descuento peso (${String(pct).replace('.', ',')} %)`, v: -dto });
  }

  const neto = lineas.reduce((a, l) => a + l.v, 0);

  // 7. Alternativas más baratas («Elegir» cambia el tipo de fecha / la fecha y recalcula).
  const alternativas: AlternativaTarifa[] = [];
  if (e.urgencia === 'dia' && e.fecha && !pasada) {
    if (fijaUrgente) {
      const sig = sumarHabiles(e.fecha, 1, fest);
      alternativas.push({ titulo: 'Fecha fija, un día más tarde', detalle: 'El siguiente día hábil, sin la urgencia del primero', ahorro: 50, recomendada: false, urgencia: 'dia', fecha: sig });
      alternativas.push({ titulo: 'Recogida de 1 a 3 días', detalle: 'El 80 % de las veces cargamos en los 2 primeros días', ahorro: 100, recomendada: true, urgencia: 'estandar', fecha: e.fecha });
    } else {
      alternativas.push({ titulo: 'Recogida de 1 a 3 días', detalle: 'Mismo primer día, sin suplemento de fecha fija', ahorro: 50, recomendada: true, urgencia: 'estandar', fecha: e.fecha });
    }
  }

  // 8. Entrega estimada: ~600 km por día de conducción, saltando fines de semana y festivos.
  const diasTransito = Math.max(1, Math.ceil(e.km / 600));
  let etaDesde: string | null = null, etaHasta: string | null = null;
  if (e.fecha) {
    etaDesde = sumarHabiles(e.fecha, diasTransito, fest);
    etaHasta = e.urgencia === 'estandar' ? sumarHabiles(sumarHabiles(e.fecha, 2, fest), diasTransito, fest) : etaDesde;
  }
  return { neto, lineas, grupaje, alternativas, etaDesde, etaHasta, diasTransito };
}

// Precio del transportista sugerido: margen objetivo PROVISIONAL del 15 %.
export const precioTransportistaSugerido = (neto: number) => r10(neto * 0.85);
