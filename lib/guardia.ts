// Quién puede usar cada acción del servidor: UN solo sitio para las comprobaciones de
// rol que repetía cada fichero de acciones. Devuelven la sesión (o null si no puede).
// Es la primera barrera; la de verdad sigue en la base de datos (reglas de acceso y
// funciones que comprueban el rol), que no se fía de la web.
import { sesion, esGestor } from '@/lib/sesion';

type Quien = 'gestor' | 'admin' | 'cliente' | 'transportista';

/** Sesión activa con alguno de esos roles. «gestor» = Admin Master o empleado gestor. */
export async function conRol(...quienes: Quien[]) {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return null;
  const rol = s.perfil.rol;
  const vale = quienes.some((q) => (q === 'gestor' ? esGestor(rol) : rol === q));
  return vale ? s : null;
}

export const soloGestor = () => conRol('gestor');
export const soloAdminMaster = () => conRol('admin');
export const soloCliente = () => conRol('cliente');
export const soloTransportista = () => conRol('transportista');
export const gestorOCliente = () => conRol('gestor', 'cliente');
