// Provincias de España por los 2 primeros dígitos del código postal (para textos cortos:
// «CP 41001 · Sevilla (ES)»). Fuera de España no se usa.
export const PROVINCIAS_ES: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares',
  '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba',
  '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva',
  '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga',
  '30': 'Murcia', '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla', '42': 'Soria',
  '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora',
  '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

// «CP 41001 · Sevilla (ES)»: la provincia guardada en la parada o, en España, la del código postal.
export function lugarCorto(p: { codigo_postal?: string | null; provincia?: string | null; pais?: string | null }): string {
  const pais = (p.pais ?? 'ES').toUpperCase();
  const prov = p.provincia || (pais === 'ES' && p.codigo_postal ? PROVINCIAS_ES[p.codigo_postal.slice(0, 2)] : null);
  return [`CP ${p.codigo_postal ?? '—'}`, prov].filter(Boolean).join(' · ') + ` (${pais})`;
}
