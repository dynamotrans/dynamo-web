// Tarifador BORRADOR (v1, 2026-11-08): el motor de precio sugerido del mockup
// (public/dashboard.html), portado tal cual a la plataforma. TODOS los números son
// PROVISIONALES (MOCK) hasta que llegue la tarifa real del usuario; entonces los
// coeficientes pasarán a la carpeta `tarifa` de la base de datos y aquí quedará solo
// el cálculo. El precio sugerido SOLO rellena por defecto los precios internos de
// Dynamo (editables) y, al cliente, se le enseña como orientativo: el que vale es el
// que confirma Dynamo.
//
// Esquema del cálculo:
//   envío base   = 700 € FIJO para todos (venta) y 600 € (compra) — relleno plano a propósito
//                  hasta la tarifa real; el motor por km y ocupación del mockup queda abajo listo
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
  urgencia: 'dia' | 'estandar' | 'corta';   // corta = ventana de 1 a 2 días (solo grupaje)
  fecha: string | null;                // YYYY-MM-DD elegida (null: aún sin fecha)
  primerDia: string;                   // primer día disponible para ese tipo de fecha
  hoy: string;
  festivos: string[];
};

export type LineaTarifa = { k: string; v: number };
export type AlternativaTarifa = {
  titulo: string; detalle: string; ahorro: number; recomendada: boolean;
  urgencia: 'dia' | 'estandar' | 'corta'; fecha: string;       // lo que hay que poner al pulsar «Elegir»
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
// sobre 13,2 m). HOY NO SE USA (importe fijo 700 €): queda lista para la tarifa real.
export function coefMetros(ml: number, mlMax: number): number {
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

// Días de la ventana de recogida: fecha fija 1 · corta 2 · estándar 4 en grupaje y 3 en
// carga completa (el grupaje necesita más margen para completar el camión).
export function ventanaDias(urgencia: 'dia' | 'estandar' | 'corta', grupaje: boolean): number {
  return urgencia === 'dia' ? 1 : urgencia === 'corta' ? 2 : grupaje ? 4 : 3;
}

export function calcularTarifa(e: EntradaTarifa): Tarifa {
  const fest = new Set(e.festivos);
  const lineas: LineaTarifa[] = [];
  const grupaje = e.ml < e.mlMax - 0.01;

  // 1. El importe del envío: FIJO 700 € para TODOS los envíos, completos y grupajes
  //    (decisión del usuario 2026-11-08: mejor un número plano reconocible como relleno
  //    que el mock por km, que parecía un precio de verdad). Cuando entre la tarifa real,
  //    aquí vuelve el cálculo por distancia y ocupación (ocupacionCamion, abajo).
  const envioBase = 700;
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

  // 4-bis. Ventana CORTA de grupaje (1 a 2 días): +10 % del subtotal o 80 €, el mayor
  //        (en carga completa no existe la opción: ahí la corta es la fecha fija).
  if (e.urgencia === 'corta' && grupaje) {
    const sub = lineas.reduce((a, l) => a + l.v, 0);
    lineas.push({ k: 'Ventana corta (1 a 2 días)', v: Math.max(r10(sub * 0.10), 80) });
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
      alternativas.push({ titulo: `Recogida de 1 a ${grupaje ? 4 : 3} días`, detalle: 'El 80 % de las veces cargamos en los 2 primeros días', ahorro: 100, recomendada: true, urgencia: 'estandar', fecha: e.fecha });
    } else {
      alternativas.push({ titulo: `Recogida de 1 a ${grupaje ? 4 : 3} días`, detalle: 'Mismo primer día, sin suplemento de fecha fija', ahorro: 50, recomendada: true, urgencia: 'estandar', fecha: e.fecha });
    }
  }
  if (e.urgencia === 'corta' && grupaje && e.fecha && !pasada) {
    const ahorroCorta = lineas.find((l) => l.k.startsWith('Ventana corta'))?.v ?? 0;
    if (ahorroCorta > 0) alternativas.push({ titulo: 'Recogida de 1 a 4 días', detalle: 'Más margen para completar el camión: lo más económico', ahorro: ahorroCorta, recomendada: true, urgencia: 'estandar', fecha: e.fecha });
  }

  // 8. Entrega estimada: ~600 km por día de conducción, saltando fines de semana y festivos.
  const diasTransito = Math.max(1, Math.ceil(e.km / 600));
  let etaDesde: string | null = null, etaHasta: string | null = null;
  if (e.fecha) {
    etaDesde = sumarHabiles(e.fecha, diasTransito, fest);
    const vDias = ventanaDias(e.urgencia, grupaje);
    etaHasta = vDias > 1 ? sumarHabiles(sumarHabiles(e.fecha, vDias - 1, fest), diasTransito, fest) : etaDesde;
  }
  return { neto, lineas, grupaje, alternativas, etaDesde, etaHasta, diasTransito };
}

// Precio del transportista sugerido: margen objetivo PROVISIONAL del 15 %.
export const precioTransportistaSugerido = (neto: number) => r10(neto * 0.85);

// ---- Tabla «Precios internos» del mockup (Dynamo) -----------------------------------
// Compra del tarifador: MOCK determinista del mockup (72-84 % de la venta según un hash
// djb2 de la ruta «CP origen>CP destino», a la decena). PROVISIONAL hasta la tarifa real
// de compra.
export function compraTarifador(venta: number): number {
  // FIJO 600 € para todos (decisión del usuario 2026-11-08), como la venta a 700 €.
  // Con la tarifa real volverá el cálculo (el mockup usaba un 72-84 % de la venta).
  return venta > 0 ? 600 : 0;
}

export type UltimoRuta = { venta: number | null; compra: number | null; fecha: string | null; ref: string | null };
export type TablaInterna = {
  vApl: number; cApl: number;              // «Aplicado · media auto» (venta ↑decena, compra ↓decena)
  compraMin: number;                       // la compra más baja de la tabla (rellena «Transportista manual»)
  margenMin: number | null; margenMax: number | null;   // peor y mejor caso combinando la tabla entera
};
export const diasDesde = (fecha: string | null, hoy: string): number | null => {
  if (!fecha) return null;
  const a = new Date(fecha + 'T00:00:00'), b = new Date(hoy + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};
// Reglas del mockup: la MEDIA solo usa los «Último» con ≤ 15 días (el tarifador de hoy
// siempre cuenta); venta a la decena superior, compra a la inferior. El MARGEN y la compra
// más baja usan la tabla entera, también los viejos.
export function tablaInterna(tarVenta: number, tarCompra: number, mismo: UltimoRuta, todos: UltimoRuta, hoy: string): TablaInterna {
  const vig = (imp: number | null, f: string | null) => {
    if (!imp) return 0;
    const d = diasDesde(f, hoy);
    return d != null && d <= 15 ? imp : 0;
  };
  const media = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
  const ventasApl = [tarVenta, vig(mismo.venta, mismo.fecha), vig(todos.venta, todos.fecha)].filter((v) => v > 0);
  const comprasApl = [tarCompra, vig(mismo.compra, mismo.fecha), vig(todos.compra, todos.fecha)].filter((v) => v > 0);
  const vApl = ventasApl.length ? Math.ceil(media(ventasApl) / 10) * 10 : 0;
  const cApl = comprasApl.length ? Math.floor(media(comprasApl) / 10) * 10 : 0;
  const ventas = [tarVenta, mismo.venta ?? 0, todos.venta ?? 0].filter((v) => v > 0);
  const compras = [tarCompra, mismo.compra ?? 0, todos.compra ?? 0].filter((v) => v > 0);
  const hayMargen = ventas.length > 0 && compras.length > 0;
  return {
    vApl, cApl,
    compraMin: compras.length ? Math.min(...compras) : 0,
    margenMin: hayMargen ? Math.min(...ventas) - Math.max(...compras) : null,
    margenMax: hayMargen ? Math.max(...ventas) - Math.min(...compras) : null,
  };
}
