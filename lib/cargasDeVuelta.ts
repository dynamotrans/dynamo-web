import { fecha, euros, metros, pesoTn } from './formato';
import { lugarCorto, PROVINCIAS_ES } from './provinciasEs';

// ---- Cargas de vuelta al final del email de la orden (usuario, 2026-11-19) -------------
// Envíos de Dynamo libres que salen de la provincia donde descarga el transportista, el
// mismo día de la descarga (los da envios_de_vuelta en la base de datos), en 4 grupos:
// hacia su base, hacia donde venía, hacia provincias limítrofes de su base y el resto.
// Segundo bloque (tramo «regreso»): lo mismo desde el ORIGEN del envío 2 días hábiles después
// de la carga; ahí el grupo 2 es la misma ruta que el envío.
// Completos primero dentro de cada grupo. Máximo 15. Cada uno con su botón «Ver carga».
type Lugar = { codigo_postal?: string | null; provincia?: string | null; pais?: string | null };
export type CargaVuelta = { token: string; referencia: string; criterio: number; precio: number | null; tipo_carga: string | null;
  metros_lineales: number | null; toneladas: number | null; mercancia: string | null; paletizado: boolean | null; origen: Lugar; destino: Lugar };
export type DatosVuelta = { tramo?: 'descarga' | 'regreso'; dia: string; desde: Lugar; cargas: CargaVuelta[] };

export const GRUPOS_VUELTA: Record<number, string> = {
  1: 'Hacia la provincia de tu base', 2: 'Hacia la provincia de donde vienes', 3: 'Hacia provincias limítrofes de tu base', 4: 'Otras desde la misma provincia',
};

// En el bloque de regreso al origen, el grupo 2 («de donde vienes») es la misma ruta del envío.
const GRUPOS_REGRESO: Record<number, string> = { ...GRUPOS_VUELTA, 2: 'La misma ruta que este envío' };

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlCargasDeVuelta(r: DatosVuelta | null, origen: string): string {
  if (!r?.cargas?.length) return '';
  const prov = r.desde.provincia || ((r.desde.pais ?? 'ES') === 'ES' && r.desde.codigo_postal ? PROVINCIAS_ES[r.desde.codigo_postal.slice(0, 2)] : null)
    || `CP ${r.desde.codigo_postal ?? ''}`;
  const regreso = r.tramo === 'regreso';
  const grupos = regreso ? GRUPOS_REGRESO : GRUPOS_VUELTA;
  let grupo = 0;
  const filas = r.cargas.map((c) => {
    const cab = c.criterio !== grupo ? `<p style="margin:14px 0 4px;font-weight:700;color:#3300cc">${esc(grupos[c.criterio] ?? '')}</p>` : '';
    grupo = c.criterio;
    const completo = c.tipo_carga === 'completa';
    const carga = [c.metros_lineales != null ? metros(c.metros_lineales) : null, c.toneladas != null ? pesoTn(c.toneladas) : null,
      c.mercancia || (c.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');
    return `${cab}<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin:6px 0">
<div><strong style="font-size:16px">${c.precio != null ? `${esc(euros(c.precio))} + IVA` : 'Precio a consultar'}</strong>
 <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700;${completo ? 'background:#ede9fe;color:#3300cc' : 'background:#ecfdf5;color:#047857'}">${completo ? 'Completo' : 'Grupaje'}</span></div>
<div style="margin-top:2px">${esc(carga)}</div>
<div style="margin-top:2px"><strong>Origen:</strong> ${esc(lugarCorto(c.origen))}</div>
<div><strong>Destino:</strong> ${esc(lugarCorto(c.destino))}</div>
<p style="margin:8px 0 0"><a href="${origen}/carga/${encodeURIComponent(c.token)}" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:8px">Ver carga</a></p>
</div>`;
  }).join('');
  return `<div style="margin:22px 0 10px;padding-top:12px;border-top:2px solid #3300cc">
${regreso
    ? `<p style="margin:0 0 4px;font-size:17px;font-weight:800;color:#0b0b45">Y de nuevo en ${esc(prov)}: cargas el ${esc(fecha(r.dia))}</p>
<p style="margin:0 0 6px;color:#555">Para cuando vuelvas al origen: envíos de Dynamo libres que salen de ${esc(prov)} 2 días hábiles después de esta carga.</p>`
    : `<p style="margin:0 0 4px;font-size:17px;font-weight:800;color:#0b0b45">¿Vuelves cargado? Cargas desde ${esc(prov)} el ${esc(fecha(r.dia))}</p>
<p style="margin:0 0 6px;color:#555">Envíos de Dynamo libres que salen de donde descargas, el mismo día. Pulsa «Ver carga» para ver los datos y aceptarla.</p>`}
${filas}</div>`;
}
