// Reglas de la contraseña: las mismas en la pantalla (medidor) y en el servidor.
export const REGLAS_CLAVE: [string, (s: string) => boolean][] = [
  ['Mínimo 8 caracteres', (s) => s.length >= 8],
  ['Una mayúscula', (s) => /[A-ZÁÉÍÓÚÑ]/.test(s)],
  ['Una minúscula', (s) => /[a-záéíóúñ]/.test(s)],
  ['Un número', (s) => /\d/.test(s)],
  ['Un símbolo', (s) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(s)],
];
// Vale con 8 caracteres y al menos 3 de las 5 reglas (y no absurdamente larga).
export const claveValida = (s: string) => s.length >= 8 && s.length <= 128 && REGLAS_CLAVE.filter(([, f]) => f(s)).length >= 3;
