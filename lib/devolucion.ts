// Las cuentas de una devolución (usuario, 2026-11-23: «que saque cuánto sería total y bases
// imponibles que se devuelven y/o quedan en Dynamo, para saber bien»). Todo en euros con IVA;
// las bases salen de quitar el IVA del envío. Trabaja en céntimos para no perder ninguno.
export type CuentasDevolucion = {
  devuelto: number; baseDevuelta: number; ivaDevuelto: number;
  retenido: number; baseRetenida: number; ivaRetenido: number;
};

const cent = (x: number) => Math.round(x * 100);

/** `disponible`: lo que queda por devolver de ese pago. `importe`: lo que se devuelve. */
export function cuentasDevolucion(disponible: number, importe: number, ivaPct: number): CuentasDevolucion {
  const total = cent(disponible), dev = Math.min(Math.max(cent(importe), 0), total), ret = total - dev;
  const base = (c: number) => Math.round(c / (1 + ivaPct / 100));
  const bd = base(dev), br = base(ret);
  return { devuelto: dev / 100, baseDevuelta: bd / 100, ivaDevuelto: (dev - bd) / 100,
    retenido: ret / 100, baseRetenida: br / 100, ivaRetenido: (ret - br) / 100 };
}

/** El importe escrito a mano («1.000,50», «1000.5»…) como número, o null si no vale. */
export function importeEscrito(t: string): number | null {
  const s = t.trim().replace(/\s|€/g, '');
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;
  // Con coma decimal a la española: los puntos son de millar. Sin coma: «1.000» y «12.500»
  // son miles (aquí se escribe así); cualquier otro punto es decimal («1000.5», «12.50»).
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** El importe con IVA que corresponde a una base (lo que se escribe en la ventana: «en las
 *  empresas se habla de costes sin IVA», usuario 2026-11-23). Si por el redondeo se pasa un
 *  céntimo de lo disponible, se queda en lo disponible (es devolverlo todo). */
export function totalDesdeBase(base: number, ivaPct: number, disponible: number): number {
  const c = Math.round(Math.round(base * 100) * (1 + ivaPct / 100));
  const tope = cent(disponible);
  return (c > tope && c - tope <= 1 ? tope : c) / 100;
}
