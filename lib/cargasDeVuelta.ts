import { fecha, euros, metros, pesoTn } from './formato';
import { lugarCorto, PROVINCIAS_ES } from './provinciasEs';
import { botonEmail } from './emailBoton';

// ---- Cargas de vuelta al final del email de la orden (usuario, 2026-11-19) -------------
// Envíos de Dynamo libres que salen de la provincia donde descarga el transportista, el
// mismo día de la descarga (los da envios_de_vuelta en la base de datos), en 4 grupos:
// hacia su base, hacia donde venía, hacia provincias limítrofes de su base y, desde provincias
// limítrofes de donde descarga, hacia esos mismos destinos.
// Segundo bloque (tramo «regreso»): lo mismo desde el ORIGEN del envío 2 días hábiles después
// de la carga; ahí el grupo 2 es la misma ruta que el envío.
// Primero las del mismo tipo que el envío (completo o grupaje), luego las del otro. Máximo 25
// por bloque. Cada una con su botón «Ver carga».
type Lugar = { codigo_postal?: string | null; provincia?: string | null; pais?: string | null };
export type CargaVuelta = { token: string; referencia: string; criterio: number; precio: number | null; tipo_carga: string | null;
  metros_lineales: number | null; toneladas: number | null; mercancia: string | null; paletizado: boolean | null; origen: Lugar; destino: Lugar };
type Prov = { cp2?: string | null; pais?: string | null };
export type DatosVuelta = { tramo?: 'descarga' | 'regreso'; dia: string; desde: Lugar; tipo_envio?: string | null;
  base?: Prov | null; previa?: Prov | null; cargas: CargaVuelta[] };

// Nombre de la provincia por sus 2 primeras cifras (fuera de España, «CP 75…»).
const nombreProv = (p?: Prov | null) => !p?.cp2 ? null : ((p.pais ?? 'ES') === 'ES' ? PROVINCIAS_ES[p.cp2] ?? null : `CP ${p.cp2}… (${p.pais})`);
const conProv = (t: string, p: string | null) => p ? `${t} (${p})` : t;

// Títulos de los 4 grupos (usuario, 2026-11-19). En el bloque de regreso, el grupo 2 es la
// misma ruta que el envío. Ya no hay «el resto».
export function titulosGrupos(r: DatosVuelta, provDesde: string): Record<number, string> {
  const base = nombreProv(r.base), previa = nombreProv(r.previa);
  return {
    1: conProv('Hacia la provincia de tu base', base),
    2: r.tramo === 'regreso' ? conProv('La misma ruta que este envío', previa ? `${provDesde} → ${previa}` : null)
                             : conProv('Hacia la provincia de donde vienes', previa),
    3: conProv('Hacia provincias limítrofes de tu base', base),
    4: `Desde provincias limítrofes de ${provDesde}`,
  };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Cuántas se enseñan en el email: hasta 6 del MISMO tipo que el envío de la orden (quien lleva
// completos suele volver con completos; quien lleva un grupaje se dedica a grupajes) y hasta 4
// del otro. Cada lista, con un botón «Ver más» si hay más (usuario, 2026-11-19).
export const VUELTA_MISMO_TIPO = 6;
export const VUELTA_OTRO_TIPO = 4;
type TipoCarga = 'completa' | 'grupaje';
export type OpcionesVuelta = {
  mismo?: number; otro?: number;               // límites (por defecto 6 y 4; Infinity = todas)
  soloTipo?: TipoCarga | null;                 // la página «Ver todas» enseña un solo tipo
  verTodas?: ((tipo: TipoCarga) => string) | null;   // enlace del botón «Ver todas»
};

const nombreTipo = (t: TipoCarga, n: number) => t === 'completa' ? 'Cargas completas'
  : n > 1 ? 'Grupajes <span style="text-transform:none;font-weight:600">(puedes combinar varios)</span>' : 'Grupajes';

// Tarjeta de cada carga (usuario, 2026-11-19: diseño «tipo Uber/Cabify», con botones): la
// fecha arriba aunque se repita, el precio grande, la etiqueta Completo/Grupaje, origen y
// destino con su punto de color y el botón «Ver carga» (a todo el ancho en el móvil).
function tarjeta(c: CargaVuelta, origen: string, dia?: string): string {
  const completo = c.tipo_carga === 'completa';
  const carga = [c.metros_lineales != null ? metros(c.metros_lineales) : null, c.toneladas != null ? pesoTn(c.toneladas) : null,
    c.mercancia || (c.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');
  const punto = (color: string) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>`;
  const chip = `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;${completo ? 'background:#ede9fe;color:#3300cc' : 'background:#dcfce7;color:#166534'}">${completo ? 'Completo' : 'Grupaje'}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ecebf3;border-radius:14px;margin:10px 0;background:#ffffff"><tr><td style="padding:14px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:13px;font-weight:800;color:#0b0b45;letter-spacing:.02em">${dia ? esc(fecha(dia)) : ''}</td>
<td align="right">${chip}</td></tr></table>
<div style="margin:6px 0 2px;font-size:20px;font-weight:800;color:#0b0b45">${c.precio != null ? `${esc(euros(c.precio))} <span style="font-size:13px;font-weight:600;color:#6b7280">+ IVA</span>` : 'Precio a consultar'}</div>
<div style="font-size:14px;color:#4b5563;margin-bottom:8px">${esc(carga)}</div>
<div style="font-size:14px;line-height:1.7">${punto('#f97316')}<strong>Origen:</strong> ${esc(lugarCorto(c.origen))}<br>${punto('#16a34a')}<strong>Destino:</strong> ${esc(lugarCorto(c.destino))}</div>
<p style="margin:12px 0 0">${botonEmail('Ver carga', `${origen}/carga/${encodeURIComponent(c.token)}`)}</p>
</td></tr></table>`;
}

export function htmlCargasDeVuelta(r: DatosVuelta | null, origen: string, op: OpcionesVuelta = {}): string {
  if (!r?.cargas?.length) return '';
  const prov = r.desde.provincia || ((r.desde.pais ?? 'ES') === 'ES' && r.desde.codigo_postal ? PROVINCIAS_ES[r.desde.codigo_postal.slice(0, 2)] : null)
    || `CP ${r.desde.codigo_postal ?? ''}`;
  const regreso = r.tramo === 'regreso';
  const grupos = titulosGrupos(r, prov);
  // El tipo del envío de la orden manda: su lista primero (hasta 20) y luego la del otro (hasta 5).
  const suyo: TipoCarga = (r.tipo_envio ?? r.cargas[0].tipo_carga) === 'grupaje' ? 'grupaje' : 'completa';
  const otro: TipoCarga = suyo === 'completa' ? 'grupaje' : 'completa';
  const listas = ([[suyo, op.mismo ?? VUELTA_MISMO_TIPO], [otro, op.otro ?? VUELTA_OTRO_TIPO]] as [TipoCarga, number][])
    .filter(([t]) => !op.soloTipo || op.soloTipo === t);
  const secciones = listas.map(([t, max]) => {
    const todas = r.cargas.filter((c) => (c.tipo_carga === 'grupaje' ? 'grupaje' : 'completa') === t);
    if (!todas.length) return '';
    const vistas = todas.slice(0, max);
    let grupo = 0;
    const filas = vistas.map((c) => {
      const cab = c.criterio !== grupo ? `<p style="margin:16px 0 2px;font-size:13px;font-weight:800;color:#3300cc">${esc(grupos[c.criterio] ?? '')}</p>` : '';
      grupo = c.criterio;
      return cab + tarjeta(c, origen, r.dia);
    }).join('');
    const enlace = op.verTodas && todas.length > vistas.length ? op.verTodas(t) : null;
    const boton = enlace ? `<p style="margin:12px 0 6px">${botonEmail(`Ver más ${t === 'completa' ? 'cargas completas' : 'grupajes'} (${todas.length})`, enlace, 'borde')}</p>` : '';
    return `<p style="margin:22px 0 4px;font-size:16px;font-weight:800;color:#0b0b45">${nombreTipo(t, vistas.length)}</p>${filas}${boton}`;
  }).join('');
  if (!secciones) return '';
  return `<div style="margin:28px 0 12px;padding:18px 16px 8px;background:#f7f6fc;border-radius:16px">
${regreso
    ? `<p style="margin:0 0 6px;font-size:19px;line-height:1.3;font-weight:800;color:#0b0b45">Y de nuevo en ${esc(prov)}: cargas el ${esc(fecha(r.dia))}</p>
<p style="margin:0 0 6px;color:#555">Para cuando vuelvas al origen: envíos de Dynamo libres que salen de ${esc(prov)} 2 días hábiles después de esta carga.</p>`
    : `<p style="margin:0 0 6px;font-size:19px;line-height:1.3;font-weight:800;color:#0b0b45">¿Ya tienes carga en ${esc(prov)} cuando descargues el ${esc(fecha(r.dia))}?</p>
<p style="margin:0 0 6px;color:#555">Envíos de Dynamo libres que salen de donde descargas, el mismo día. Pulsa «Ver carga» para ver los datos y aceptarla.</p>`}
${secciones}</div>`;
}
