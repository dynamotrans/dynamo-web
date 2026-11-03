// Países y prefijos telefónicos de la operativa (una sola copia para todo el panel).
export const PAISES: [string, string][] = [
  ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'], ['DE', 'Alemania'], ['IT', 'Italia'],
  ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['LU', 'Luxemburgo'], ['AT', 'Austria'],
  ['PL', 'Polonia'], ['CZ', 'Rep. Checa'], ['CH', 'Suiza'], ['DK', 'Dinamarca'], ['GB', 'Reino Unido'],
];
export const PREFIJOS: [string, string][] = [
  ['+34', 'España'], ['+351', 'Portugal'], ['+33', 'Francia'], ['+49', 'Alemania'], ['+39', 'Italia'],
  ['+44', 'R. Unido'], ['+31', 'P. Bajos'], ['+32', 'Bélgica'], ['+352', 'Luxemburgo'], ['+43', 'Austria'],
  ['+48', 'Polonia'], ['+420', 'Chequia'], ['+41', 'Suiza'], ['+40', 'Rumanía'], ['+212', 'Marruecos'],
  ['+380', 'Ucrania'], ['+86', 'China'], ['+1', 'EE. UU.'],
];
export const paisDe = (c: string) => PAISES.find(([k]) => k === c)?.[1] ?? c;

export function partirTel(t: string): { pref: string; num: string } {
  const v = (t || '').replace(/\s/g, '');
  const p = [...PREFIJOS].sort((a, b) => b[0].length - a[0].length).find(([k]) => v.startsWith(k));
  return p ? { pref: p[0], num: v.slice(p[0].length) } : { pref: '+34', num: v.replace(/^\+/, '') };
}
export function telBonito(t: string) {
  if (!t) return '';
  const { pref, num: n } = partirTel(t);
  return `${pref} ${n.replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
}
