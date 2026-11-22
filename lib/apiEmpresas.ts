// Autorrelleno de datos fiscales con APIEmpresas.es (usuario, 2026-11-22; construido y apagado
// hasta que haya clave). Aquí solo lo que no toca la red: las direcciones de la API y cómo se
// lee lo que devuelve, para poder probarlo sin conexión. La llamada va en
// lib/servidor/apiEmpresas.ts (solo en el servidor: la clave nunca llega al navegador).
//
// ⚠️ Las rutas y los nombres de los campos salen del ticket de Gemini y de la web pública de
// APIEmpresas; COMPROBARLOS con su documentación al encenderlo. Por eso el lector acepta varios
// nombres para cada dato y nunca falla: lo que no entienda, se deja vacío (se rellena a mano).
import { provinciaDeCodigoPostal } from './provinciasEs';

export const API_EMPRESAS_BASE = 'https://apiempresas.es/api/v1';
export const rutaPorCif = (cif: string) => `${API_EMPRESAS_BASE}/companies?cif=${encodeURIComponent(cif)}`;
export const rutaPorNombre = (q: string) => `${API_EMPRESAS_BASE}/companies/search?q=${encodeURIComponent(q)}`;

// Lo que rellena el formulario. Todo texto; vacío si la API no lo trae.
export type EmpresaRegistro = {
  cif: string; razon_social: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; estado: string;
};

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
function primero(o: Record<string, unknown>, claves: string[]): string {
  for (const k of claves) { const v = txt(o[k]); if (v) return v; }
  return '';
}
export const cifNormal = (v: string) => (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// «CALLE EJEMPLO 1, 28001 MADRID» → calle «CALLE EJEMPLO 1», CP «28001», población «MADRID».
// Si no hay un CP de 5 cifras, todo va a la calle.
export function partirDireccion(s: string): { direccion: string; codigo_postal: string; poblacion: string } {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[,\s]*\b(\d{5})\b\s*[,-]?\s*(.*)$/);
  if (!m) return { direccion: t, codigo_postal: '', poblacion: '' };
  const pob = m[3].replace(/\s*\(.*\)\s*$/, '').replace(/[,.\s]+$/, '').trim();
  return { direccion: m[1].replace(/[,\s]+$/, '').trim(), codigo_postal: m[2], poblacion: pob };
}

// Una empresa tal como venga (los nombres de campo pueden ser en inglés o en español).
export function leerEmpresa(x: unknown): EmpresaRegistro | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const cif = cifNormal(primero(o, ['cif', 'nif', 'tax_id', 'vat']));
  const razon = primero(o, ['name', 'razon_social', 'nombre', 'company_name', 'denominacion']);
  if (!cif || !razon) return null;
  // La dirección puede venir en un solo texto o por partes (o dentro de «address»).
  const dir = o.address && typeof o.address === 'object' ? (o.address as Record<string, unknown>) : null;
  const plano = primero(o, ['address', 'direccion', 'domicilio', 'domicilio_social']);
  const partes = plano ? partirDireccion(plano) : { direccion: '', codigo_postal: '', poblacion: '' };
  const fuente = dir ?? o;
  const codigo_postal = primero(fuente, ['postal_code', 'zip', 'codigo_postal', 'cp']) || partes.codigo_postal;
  const poblacion = primero(fuente, ['city', 'town', 'municipality', 'poblacion', 'localidad', 'municipio']) || partes.poblacion;
  const direccion = (dir ? primero(dir, ['street', 'line1', 'direccion', 'address']) : '') || partes.direccion;
  // En España la provincia la pone el código postal; si no, la que traiga.
  const provincia = provinciaDeCodigoPostal(codigo_postal) ?? primero(fuente, ['province', 'provincia', 'region', 'state']);
  return { cif, razon_social: razon, direccion, codigo_postal, poblacion, provincia: provincia ?? '', estado: primero(o, ['status', 'estado', 'situacion']) };
}

// Lo que devuelve la API: una empresa, una lista, o {data: …} / {results: …} / {companies: …}.
export function leerRespuesta(j: unknown): EmpresaRegistro[] {
  if (Array.isArray(j)) return j.map(leerEmpresa).filter((e): e is EmpresaRegistro => !!e);
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    for (const k of ['data', 'results', 'companies', 'items', 'company']) {
      if (o[k] != null) return leerRespuesta(o[k]);
    }
    const una = leerEmpresa(o);
    return una ? [una] : [];
  }
  return [];
}
