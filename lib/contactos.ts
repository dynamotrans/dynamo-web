// Personas de contacto (tabla `contactos`, 1-N): las usan las fichas de clientes,
// transportistas y sitios. Tipo y utilidades comunes a navegador y servidor.
export type Funcion = 'trafico' | 'contabilidad' | 'conductor' | 'general';
export type ContactoDatos = {
  id?: string; nombre: string; cargo: string; funcion: Funcion;
  telefono: string; email: string; recibe_avisos: boolean;
  // Solo en los contactos de SITIOS (usuario, 2026-11-26): `telefono` es el móvil (WhatsApp) y
  // este, el fijo. En clientes y transportistas no se usa.
  telefono_fijo?: string;
};
export const FUNCIONES: [Funcion, string][] = [
  ['general', 'General'], ['trafico', 'Tráfico'], ['contabilidad', 'Contabilidad'], ['conductor', 'Conductor'],
];
export const CONTACTO_VACIO = (funcion: Funcion = 'general', recibe_avisos = true): ContactoDatos =>
  ({ nombre: '', cargo: '', funcion, telefono: '', email: '', recibe_avisos });

// Filas de la base de datos → lo que usa la ficha (el principal de cada función primero).
export type FilaContacto = {
  id?: string; nombre?: string | null; cargo?: string | null; funcion?: Funcion | null; telefono?: string | null; telefono_fijo?: string | null;
  email?: string | null; recibe_avisos?: boolean | null; es_principal?: boolean | null; creado_en?: string | null;
};
export function contactosDe(filas: FilaContacto[]): ContactoDatos[] {
  return [...filas]
    .sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || String(a.creado_en).localeCompare(String(b.creado_en)))
    .map((c) => ({ id: c.id, nombre: c.nombre ?? '', cargo: c.cargo ?? '', funcion: c.funcion ?? 'general',
                   telefono: c.telefono ?? '', telefono_fijo: c.telefono_fijo ?? '', email: c.email ?? '', recibe_avisos: !!c.recibe_avisos }));
}
/** El teléfono que se enseña de un contacto: el móvil y, si no tiene, el fijo. */
export const telDe = (c: { telefono?: string | null; telefono_fijo?: string | null } | null | undefined): string => (c?.telefono || c?.telefono_fijo || '');
// El contacto que se enseña en las tablas: el principal (el primero) de la función pedida.
export const principal = (l: ContactoDatos[], f?: Funcion) => (f ? l.find((c) => c.funcion === f) : l[0]) ?? null;
