// "Recordarme" (pantalla de entrada). Si se desmarca, las cookies de la sesión pasan a ser
// de sesión del navegador: al cerrarlo, hay que volver a entrar. Marcado (por defecto),
// la sesión se conserva. La marca vive en su propia cookie para que el middleware, que
// renueva la sesión en cada visita, respete la misma elección.
export const COOKIE_RECORDAR = 'dyn_recordar';
type OpcionesCookie = { maxAge?: number; expires?: Date | number | string } & Record<string, unknown>;
// En producción, además, las cookies de la sesión solo viajan por HTTPS (secure).
export function duracionSegunRecordar<T extends OpcionesCookie>(options: T, recordar: boolean): T {
  const o = (process.env.NODE_ENV === 'production' ? { ...options, secure: true } : options) as T;
  if (recordar) return o;
  const { maxAge: _m, expires: _e, ...resto } = o;
  return resto as T;
}
