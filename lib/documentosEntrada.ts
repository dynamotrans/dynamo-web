// Verificación de albaranes (usuario, 2026-11-22): lo que se lee del NOMBRE que pone la tarea de
// clasificación de los emails de transportistas, p. ej.
//   GX66081_ALB_20261030_08185-LLICADEVALL_28936-MOSTOLES_2299LCW-R2252BDK.pdf
//   referencia · tipo · fecha · CP-origen · CP-destino · matrículas (tractora-semirremolque)
// Sin red: se prueba con pruebas unitarias. Lo que no se entienda se deja vacío.
export type DatosNombre = {
  referencia: string | null; tipo: 'albaran' | 'cmr_firmado' | 'otro'; fecha: string | null;
  origen: string | null; destino: string | null; matriculas: string | null;
};

const lugar = (s: string | undefined) => {
  const m = /^(\d{4,5})-(.+)$/.exec(s ?? '');
  return m ? `${m[1]} ${m[2].replace(/([a-z])([A-Z])/g, '$1 $2')}` : null;
};

export function leerNombreAlbaran(nombre: string): DatosNombre {
  const base = (nombre ?? '').replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const ref = /(GX\d{4,}[A-Z]?)/i.exec(base)?.[1]?.toUpperCase() ?? null;
  const partes = base.split('_');
  const tipoTxt = (partes[1] ?? '').toUpperCase();
  const tipo = tipoTxt === 'CMR' ? 'cmr_firmado' : ['ALB', 'DECA', 'ALBARAN'].includes(tipoTxt) ? 'albaran' : 'albaran';
  const f = /^(\d{4})(\d{2})(\d{2})$/.exec(partes[2] ?? '');
  const fecha = f ? `${f[1]}-${f[2]}-${f[3]}` : null;
  const mat = partes[5] && /^[A-Z0-9-]{4,}$/i.test(partes[5]) ? partes[5].toUpperCase().replace(/-/g, ' / ') : null;
  return { referencia: ref, tipo, fecha, origen: lugar(partes[3]), destino: lugar(partes[4]), matriculas: mat };
}

/** Comparación de la clave en tiempo constante (sin cortar en el primer carácter distinto). */
export function mismaClave(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
