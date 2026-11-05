// Menú lateral del panel: el mismo de dashboard.html (orden, nombres e iconos).
// `listo` = pantalla ya pasada a datos reales; el resto lleva a un aviso de
// "se está pasando a la plataforma real" hasta que toque (patrón estrangulador).
import { esDynamo, type Rol } from './roles';

export const ICONOS: Record<string, string> = {
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/>',
  camion: '<rect x="1" y="3" width="15" height="13" rx="1.5"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  sitios: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  capas: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  facturas: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/>',
  incidencias: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  penalizaciones: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  almacenes: '<path d="M3 21V9l9-5 9 5v12"/><path d="M3 21h18"/><rect x="8" y="13" width="8" height="8"/>',
  recursos: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  almacenesCat: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35"/><path d="M2 8.35 12 2l10 6.35"/><path d="M6 22V12h12v10"/>',
  clientes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  usuarios: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/><path d="M19 8h4M21 6v4"/>',
  altas: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
  mantenimiento: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  exportar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  ajustes: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  bandeja: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};

export type Enlace = { slug: string; titulo: string; icono: keyof typeof ICONOS; listo?: boolean; destacado?: boolean };
export type Grupo = { grupo: string; titulo: string; icono: keyof typeof ICONOS; enlaces: Enlace[] };
export type Bloque = { sep?: string; items: (Enlace | Grupo)[] };

// Menú lateral. El equipo de Dynamo elige VISTA («Ver como», arriba): en la de gestión
// interna ve su menú; en la de un cliente o un transportista, exactamente el menú de ese
// perfil. Así nunca se mezclan los dos menús.
export function menuDe(rol: Rol, vista: 'admin' | 'cliente' | 'transportista' = 'admin'): Bloque[] {
  if (esDynamo(rol) && vista !== 'admin') return menuDe(vista);
  if (rol === 'transportista') {
    return [{ items: [
      { slug: 'envios', titulo: 'Mis viajes', icono: 'camion', listo: true, destacado: true },
      { slug: 'penalizaciones', titulo: 'Penalizaciones', icono: 'penalizaciones' },
      { slug: 'incidencias', titulo: 'Incidencias', icono: 'incidencias' },
    ] }];
  }
  if (rol === 'cliente') {
    return [{ items: [
      { slug: 'dashboard', titulo: 'Dashboard cliente', icono: 'dashboard' },
      { slug: 'envios', titulo: 'Envíos', icono: 'camion', listo: true, destacado: true },
      { slug: 'sitios', titulo: 'Sitios', icono: 'sitios' },
      { grupo: 'otras', titulo: 'Otras gestiones', icono: 'capas', enlaces: [
        { slug: 'administracion', titulo: 'Administración', icono: 'facturas' },
        { slug: 'incidencias', titulo: 'Incidencias', icono: 'incidencias' },
        { slug: 'penalizaciones', titulo: 'Penalizaciones', icono: 'penalizaciones' },
        { slug: 'almacenamientos', titulo: 'Almacenamientos', icono: 'almacenes' },
        { slug: 'recursos', titulo: 'Recursos', icono: 'recursos' },
      ] },
    ] }];
  }
  // Equipo de Dynamo, vista de gestión interna.
  return [
    { items: [
      { slug: 'dashboard-admin', titulo: 'Dashboard admin', icono: 'dashboard' },
      { slug: 'para-hoy', titulo: 'Para hoy', icono: 'bandeja', listo: true },
      { slug: 'envios', titulo: 'Envíos', icono: 'camion', listo: true, destacado: true },
      { grupo: 'otras', titulo: 'Operativa', icono: 'capas', enlaces: [
        { slug: 'administracion', titulo: 'Administración', icono: 'facturas' },
        { slug: 'incidencias', titulo: 'Incidencias', icono: 'incidencias' },
        { slug: 'penalizaciones', titulo: 'Penalizaciones', icono: 'penalizaciones' },
        { slug: 'almacenamientos', titulo: 'Almacenamientos', icono: 'almacenes' },
        { slug: 'sitios', titulo: 'Sitios de los clientes', icono: 'sitios' },
        { slug: 'recursos', titulo: 'Recursos', icono: 'recursos' },
      ] },
    ] },
    { sep: 'Gestión interna · Admin', items: [
      { grupo: 'admin', titulo: 'Gestión interna', icono: 'capas', enlaces: [
        { slug: 'clientes', titulo: 'Clientes', icono: 'clientes' },
        { slug: 'riesgos', titulo: 'CESCE - Riesgos', icono: 'escudo' },
        { slug: 'transportistas', titulo: 'Transportistas', icono: 'camion' },
        { slug: 'operadores', titulo: 'Transportistas de clientes', icono: 'camion' },
        { slug: 'almacenes', titulo: 'Almacenes Dynamo', icono: 'almacenesCat' },
        { slug: 'usuarios', titulo: 'Usuarios', icono: 'usuarios' },
        { slug: 'altas', titulo: 'Altas pendientes', icono: 'altas' },
        { slug: 'exportaciones', titulo: 'Exportaciones', icono: 'exportar' },
        { slug: 'parametros', titulo: 'Parámetros', icono: 'ajustes' },
        { slug: 'mantenimiento', titulo: 'Modo mantenimiento', icono: 'mantenimiento' },
      ] },
    ] },
  ];
}

// Títulos de las pantallas que aún no están pasadas (para el aviso).
export function tituloDe(slug: string, rol: Rol): string | null {
  if (slug === 'mi-cuenta') return 'Mi cuenta';
  if (slug === 'nuevo-envio') return 'Nuevo envío';
  const menus = esDynamo(rol) ? [...menuDe(rol), ...menuDe('cliente'), ...menuDe('transportista')] : menuDe(rol);
  for (const b of menus) for (const it of b.items) {
    if ('grupo' in it) { for (const e of it.enlaces) if (e.slug === slug) return e.titulo; }
    else if (it.slug === slug) return it.titulo;
  }
  return null;
}
