// Botones de los emails (usuario, 2026-11-19: «evita enlaces, pon botones donde sean
// clicables, con el nombre de cada acción»). En el móvil ocupan todo el ancho: lo hace el
// envoltorio común de los emails (email_con_diseno en la base de datos), que reconoce los
// enlaces con «display:inline-block».
const BASE = 'display:inline-block;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:15px';
const TONOS = {
  morado: 'background:#3300cc;color:#ffffff',
  rojo: 'background:#dc2626;color:#ffffff',
  borde: 'background:#ffffff;color:#3300cc;border:1.5px solid #3300cc;padding:11px 22px',
} as const;
export type TonoBoton = keyof typeof TONOS;

const attr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const txt = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function botonEmail(texto: string, url: string, tono: TonoBoton = 'morado'): string {
  return `<a href="${attr(url)}" style="${BASE};${TONOS[tono]}">${txt(texto)}</a>`;
}

// Varios botones seguidos (en el móvil, uno debajo de otro).
export function botonesEmail(botones: ([string, string] | [string, string, TonoBoton] | null | false | undefined)[]): string {
  const b = botones.filter(Boolean) as ([string, string] | [string, string, TonoBoton])[];
  if (!b.length) return '';
  return `<p style="margin:18px 0 20px">${b.map(([t, u, k]) => botonEmail(t, u, k)).join('&nbsp; ')}</p>`;
}
