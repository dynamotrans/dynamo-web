import { noEsMovil } from './whatsapp';

// Personas de contacto (tabla `contactos`, 1-N): las usan las fichas de clientes,
// transportistas y sitios. Tipo y utilidades comunes a navegador y servidor.
export type Funcion = 'trafico' | 'contabilidad' | 'conductor' | 'general';
export type ContactoDatos = {
  id?: string; nombre: string; cargo: string; funcion: Funcion;
  telefono: string; email: string; recibe_avisos: boolean;
};
export const FUNCIONES: [Funcion, string][] = [
  ['general', 'General'], ['trafico', 'Tráfico'], ['contabilidad', 'Contabilidad'], ['conductor', 'Conductor'],
];
// Roles de un contacto de CLIENTE (usuario, 2026-11-27): una persona puede hacer las dos cosas
// (empresa pequeña): «general» = Logística y Contabilidad, recibe lo de los dos. Es el de por defecto.
export const ROLES_CONTACTO_CLIENTE: [Funcion, string][] = [['general', 'Logística y Contabilidad'], ['trafico', 'Logística'], ['contabilidad', 'Contabilidad']];
export const CONTACTO_VACIO = (funcion: Funcion = 'general', recibe_avisos = true): ContactoDatos =>
  ({ nombre: '', cargo: '', funcion, telefono: '', email: '', recibe_avisos });

// Filas de la base de datos → lo que usa la ficha (el principal de cada función primero).
export type FilaContacto = {
  id?: string; nombre?: string | null; cargo?: string | null; funcion?: Funcion | null; telefono?: string | null;
  email?: string | null; recibe_avisos?: boolean | null; es_principal?: boolean | null; creado_en?: string | null;
};
export function contactosDe(filas: FilaContacto[]): ContactoDatos[] {
  return [...filas]
    .sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || String(a.creado_en).localeCompare(String(b.creado_en)))
    .map((c) => ({ id: c.id, nombre: c.nombre ?? '', cargo: c.cargo ?? '', funcion: c.funcion ?? 'general',
                   telefono: c.telefono ?? '', email: c.email ?? '', recibe_avisos: !!c.recibe_avisos }));
}
/** El teléfono que se enseña de un contacto: el móvil y, si no tiene, el fijo. */
export const telDe = (c: { telefono?: string | null; telefono_fijo?: string | null } | null | undefined): string => (c?.telefono || c?.telefono_fijo || '');
/** Los teléfonos de un sitio, cada uno con su nombre: el móvil es el de WhatsApp. Desde el 2026-11-27
 *  un sitio lleva UN teléfono; si lo que hay en el del móvil es un fijo, sale como «Tfno» (no se
 *  llama «Móvil» a un fijo). Si llega solo «telefono» (dato sin separar), sale como «Tfno». */
export function telefonosSitio(c: { telefono?: string | null; movil?: string | null; fijo?: string | null } | null | undefined): { que: 'Móvil' | 'Fijo' | 'Tfno'; tel: string }[] {
  if (!c) return [];
  const out: { que: 'Móvil' | 'Fijo' | 'Tfno'; tel: string }[] = [];
  if (c.movil) out.push({ que: noEsMovil(c.movil) ? 'Tfno' : 'Móvil', tel: c.movil });
  if (c.fijo) out.push({ que: 'Fijo', tel: c.fijo });
  if (!out.length && c.telefono) out.push({ que: 'Tfno', tel: c.telefono });
  return out;
}
// El contacto que se enseña en las tablas: el principal (el primero) de la función pedida.
export const principal = (l: ContactoDatos[], f?: Funcion) => (f ? l.find((c) => c.funcion === f) : l[0]) ?? null;
