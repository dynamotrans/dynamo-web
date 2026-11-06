// Comprobación de la entrada de cada acción del servidor (su esquema está en esquemas.ts,
// generado de los tipos). Si no cuadra, se corta antes de tocar la base de datos: así una
// llamada a mano con datos raros da un error limpio en vez de un fallo a medias.
import 'server-only';
import { ESQUEMAS } from './esquemas';

export class EntradaNoValida extends Error {
  constructor(public accion: string, public detalle: string) { super('Los datos enviados no son válidos. Recarga la página y vuelve a intentarlo.'); }
}

export function comprobarEntrada(accion: keyof typeof ESQUEMAS, args: unknown[]): void {
  // Los argumentos opcionales que no se pasan llegan como undefined al final: se igualan al tamaño.
  const esquema = ESQUEMAS[accion];
  const n = esquema.items.length;
  const valores = [...args, ...Array(Math.max(0, n - args.length)).fill(undefined)].slice(0, n);
  const r = esquema.safeParse(valores);
  if (!r.success) {
    const d = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.warn(`[entrada] ${accion} rechazada: ${d}`);
    throw new EntradaNoValida(accion, d);
  }
}
