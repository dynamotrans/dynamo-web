// Mensajes de error que se enseñan al usuario. Los de las reglas de la base de datos ya
// vienen en castellano y se dejan tal cual; los técnicos (nombres de restricciones,
// columnas, tablas, SQL) se cambian por uno genérico para no dar pistas del esquema.
const TECNICO = /violates|constraint|duplicate key|column|relation|syntax|operator|function .*does not exist|null value|invalid input|out of range|JWT|PGRST|schema cache|could not|unexpected/i;
export function mensajeError(msg: string | null | undefined, generico = 'No se ha podido guardar. Vuelve a intentarlo o avísanos.'): string {
  const m = String(msg ?? '');
  if (/permission denied|42501|row-level security/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (!m || TECNICO.test(m)) {
    if (m) console.error('[error técnico]', m.slice(0, 300));
    return generico;
  }
  return m;
}

// Cuando una acción del servidor ni siquiera responde (sin conexión, o se acaba de publicar una
// versión nueva de la web y la pantalla abierta es la vieja).
export const SIN_CONEXION = 'No se ha podido conectar. Recarga la página y vuelve a intentarlo.';
