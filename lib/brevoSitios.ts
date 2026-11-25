// Sitios de la plataforma → Brevo (usuario, 2026-11-25): qué se manda de cada email de sitio.
// Los nombres de los campos son los que ya existen en su cuenta de Brevo (NOMBRE, PROVINCIA…:
// los mismos que usan sus plantillas), así que aquí no se inventa ninguno.

export type SitioParaBrevo = {
  email: string; nombre: string | null; cargo: string | null; empresa: string | null; cif: string | null;
  telefono: string | null; direccion: string | null; codigo_postal: string | null; localidad: string | null;
  provincia: string | null; pais: string | null; google_maps: string | null; sitio_id: string | null; huella: string;
};

/** Marca de dónde sale el contacto, para poder filtrarlo en Brevo. */
export const TIPO_CONTACTO_SITIO = 'Sitio de la plataforma';

const limpio = (v: string | null | undefined, max = 250) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Los campos de Brevo de un email de sitio; los vacíos no se mandan (no pisan lo que ya hubiera). */
export function atributosBrevo(f: SitioParaBrevo): Record<string, string> {
  const empresa = limpio(f.empresa);
  const campos: Record<string, string> = {
    // El saludo de sus plantillas usa NOMBRE: la persona si se conoce; si no, la empresa.
    NOMBRE: limpio(f.nombre) || empresa,
    COMPANY_NAME: empresa,
    JOB_TITLE: limpio(f.cargo),
    CIF: limpio(f.cif, 40),
    TELEFONO: limpio(f.telefono, 40),
    DIRECCION: limpio(f.direccion),
    CP: limpio(f.codigo_postal, 20),
    LOCALIDAD: limpio(f.localidad),
    PROVINCIA: limpio(f.provincia),
    PAIS: limpio(f.pais, 10).toUpperCase(),
    GOOGLE_MAPS: limpio(f.google_maps, 500),
    TIPO_CONTACTO: TIPO_CONTACTO_SITIO,
  };
  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== ''));
}

/** Lo que contesta Brevo cuando rechaza un contacto, en corto y sin datos de más. */
export function errorBrevo(estado: number, cuerpo: unknown): string {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { code?: unknown; message?: unknown };
  const codigo = typeof c.code === 'string' ? c.code : '';
  const mensaje = typeof c.message === 'string' ? c.message : '';
  return `Brevo ${estado}${codigo ? ` · ${codigo}` : ''}${mensaje ? `: ${mensaje}` : ''}`.slice(0, 300);
}
