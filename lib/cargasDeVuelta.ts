import { fecha, euros, metros, pesoTn } from './formato';
import { lugarCorto, PROVINCIAS_ES } from './provinciasEs';

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

export function htmlCargasDeVuelta(r: DatosVuelta | null, origen: string): string {
  if (!r?.cargas?.length) return '';
  const prov = r.desde.provincia || ((r.desde.pais ?? 'ES') === 'ES' && r.desde.codigo_postal ? PROVINCIAS_ES[r.desde.codigo_postal.slice(0, 2)] : null)
    || `CP ${r.desde.codigo_postal ?? ''}`;
  const regreso = r.tramo === 'regreso';
  const grupos = titulosGrupos(r, prov);
  const nGrupajes = r.cargas.filter((c) => c.tipo_carga !== 'completa').length;
  // Vienen ya ordenadas: primero las del mismo tipo que el envío (completo o grupaje) con sus
  // grupos, luego las del otro tipo. Un título por tipo y un subtítulo por grupo.
  let tipo: string | null | undefined, grupo = 0;
  const filas = r.cargas.map((c) => {
    const completo = c.tipo_carga === 'completa';
    const tit = c.tipo_carga !== tipo
      ? `<p style="margin:16px 0 2px;font-size:15px;font-weight:800;color:#0b0b45;text-transform:uppercase">${completo ? 'Cargas completas' : nGrupajes > 1 ? 'Grupajes <span style="text-transform:none;font-weight:600">(puedes combinar varios)</span>' : 'Grupajes'}</p>` : '';
    const cab = tit || c.criterio !== grupo ? `<p style="margin:8px 0 4px;font-weight:700;color:#3300cc">${esc(grupos[c.criterio] ?? '')}</p>` : '';
    tipo = c.tipo_carga; grupo = c.criterio;
    const carga = [c.metros_lineales != null ? metros(c.metros_lineales) : null, c.toneladas != null ? pesoTn(c.toneladas) : null,
      c.mercancia || (c.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');
    return `${tit}${cab}<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin:6px 0">
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
