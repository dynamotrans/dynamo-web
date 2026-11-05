// Roles de la plataforma y qué puede hacer cada uno (sin nada del servidor: lo usan
// también los componentes del navegador, como el marco y el menú).
// En pantalla: admin = «Admin Master», empleado = «Empleado gestor»; los de lectura lo
// ven todo y no tocan nada (lo impone la base de datos: ve_todo() / es_equipo_dynamo()).
export type Rol = 'admin' | 'empleado' | 'admin_lectura' | 'empleado_lectura' | 'cliente' | 'transportista';
/** Cualquier usuario de Dynamo, también los de solo lectura: para VER. */
export const esDynamo = (rol?: string | null) =>
  rol === 'admin' || rol === 'empleado' || rol === 'admin_lectura' || rol === 'empleado_lectura';
/** Admin Master o Empleado gestor: los que pueden CAMBIAR cosas. */
export const esGestor = (rol?: string | null) => rol === 'admin' || rol === 'empleado';
/** Admin lectura o Empleado lectura: lo ven todo, no tocan nada. */
export const esSoloLectura = (rol?: string | null) => rol === 'admin_lectura' || rol === 'empleado_lectura';
export const AVISO_SOLO_LECTURA = 'Tu usuario es de solo lectura: puedes verlo todo, pero no cambiar nada.';
