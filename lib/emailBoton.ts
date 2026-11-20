// Botones de los emails (usuario, 2026-11-19: «evita enlaces, pon botones donde sean
// clicables, con el nombre de cada acción»). En el móvil ocupan todo el ancho: lo hace el
// envoltorio común de los emails (email_con_diseno en la base de datos), que reconoce los
// enlaces con «display:inline-block».
// El margen de abajo separa dos botones cuando no caben en una fila.
const BASE = 'display:inline-block;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:15px;margin:0 6px 8px 0';
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

// Nombre del botón según la dirección (los mensajes que se escriben en pantalla, como la
// orden compartida a mano, llevan las direcciones en el texto; en el email salen como botón).
export function nombreAccion(url: string): string {
  if (/\/matriculas\//.test(url)) return 'Proporcionar matrículas del envío';
  if (/\/cmr\/[^/?]+\/orden/.test(url)) return 'Ver la orden de carga';
  if (/\/cmr\/[^/?]+\/pdf/.test(url)) return 'Descargar el PDF';
  if (/\/cmr\//.test(url)) return 'Firmar el e-CMR';
  if (/\/deca\//.test(url)) return 'Ver el DeCA';
  if (/\/cargas-de-vuelta\//.test(url)) return 'Ver más cargas';
  if (/\/carga\//.test(url)) return 'Ver la carga';
  if (/\/panel\/envios/.test(url)) return 'Ver el envío';
  return 'Abrir';
}

// Un mensaje de texto (línea a línea) en HTML de email: cada línea con una dirección web se
// queda con su texto y, debajo, el botón con el nombre de la acción.
export function htmlDeMensaje(mensaje: string): string {
  return mensaje.split('\n').map((ln) => {
    if (ln.trim() === '') return '<br>';
    const urls = ln.match(/https?:\/\/[^\s<]+/g) ?? [];
    const textoLinea = ln.replace(/https?:\/\/[^\s<]+/g, '').replace(/[\s:·-]+$/, '').trim();
    const p = textoLinea ? `<p style="margin:0 0 2px">${txt(textoLinea)}</p>` : '';
    return p + (urls.length ? botonesEmail(urls.map((u, i) => [nombreAccion(u), u, i ? 'borde' : 'morado'] as [string, string, TonoBoton])) : '');
  }).join('');
}

// Direcciones de prueba (dominio .invalid, que no existe) fuera de una lista de destinatarios
// (usuario, 2026-11-20: «no me llegó nada»). Antes, si UNA sola dirección era de prueba, el
// email entero se quedaba sin mandar —también a las reales y la copia a Dynamo—. Ahora solo
// se quitan esas; '' si no queda ninguna real.
export function sinDireccionesDePrueba(para: string): string {
  return para.split(/[,;]/).map((x) => x.trim()).filter((x) => x && !/\.invalid\s*>?\s*$/i.test(x)).join(', ');
}
