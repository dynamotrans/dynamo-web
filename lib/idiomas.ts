// LOS IDIOMAS DE LOS AVISOS — UNA SOLA LISTA para toda la plataforma (usuario, 2026-11-18).
// El usuario elige el suyo en «Mi cuenta» y el equipo de Dynamo lo ve y lo cambia en su ficha
// de Usuarios. Cada pantalla tenía su propia lista: la de Usuarios no traía catalán, euskera
// ni árabe, así que a quien elegía uno de esos el admin le veía «Español» (el desplegable
// caía en su primera opción, aunque el dato guardado era el bueno).
// Los mismos que el selector de idiomas de la web. El código es el que se guarda en
// usuarios.idioma.
export const IDIOMAS_AVISOS: [codigo: string, nombre: string][] = [
  ['es', 'Español'], ['ca', 'Català'], ['eu', 'Euskara'], ['pt', 'Português'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română'], ['uk', 'Українська'], ['zh-CN', '中文'], ['ar', 'العربية'],
];
export const nombreIdioma = (codigo: string | null | undefined) =>
  IDIOMAS_AVISOS.find(([k]) => k === codigo)?.[1] ?? codigo ?? '';
