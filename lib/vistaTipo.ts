// «Ver como»: el equipo de Dynamo puede ver la plataforma como la ve un cliente o un
// transportista concreto (sus menús y solo sus datos), o en su vista de gestión interna.
// Tipos sin nada del servidor: los usa también el marco (navegador).
export type Vista =
  | { tipo: 'admin'; id: null; nombre: null }
  | { tipo: 'cliente' | 'transportista'; id: string; nombre: string };
export const VISTA_ADMIN: Vista = { tipo: 'admin', id: null, nombre: null };
export type OpcionVista = { id: string; nombre: string };
/** Pantalla de inicio de cada vista. */
export const inicioDe = (tipo: Vista['tipo']) =>
  tipo === 'transportista' ? '/panel/envios' : tipo === 'cliente' ? '/panel/dashboard' : '/panel/dashboard-admin';
