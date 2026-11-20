// A dónde volver tras entrar (usuario, 2026-11-20: «si clican el botón del email, ¿entran
// directo a la info?»). Quien pulsa «Ver el envío» en un email sin la sesión abierta pasa por
// la entrada y, al poner su contraseña, vuelve a ESE envío. Solo rutas del propio panel: nada
// de otras webs (evita que un enlace trucado mande a una página falsa tras entrar).
export function volverSeguro(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null;
  return /^\/panel\/[A-Za-z0-9_\-/]*(\?[A-Za-z0-9_\-=&%.]*)?$/.test(v) && !v.includes('//') && !v.startsWith('/panel/entrar') ? v : null;
}
