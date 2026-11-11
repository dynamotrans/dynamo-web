'use client';

// Lo que comparten la ficha y sus partes (iconos, celdas, nombres, ayudantes).
import { paisDe } from '@/lib/paises';
import { HORARIO_POR_DEFECTO, HORARIO_VERANO_POR_DEFECTO, VERANO_GENERICO, type GrupoHorario, type Verano } from '@/lib/horarios';

// principal_id: el sitio con la estrella en Sitios (se pone solo como primera recogida).
export type ClienteOpcion = { id: string; nombre: string; cif: string; principal_id?: string | null; iva?: number | null; nima?: boolean };   // iva: % del cliente · nima: NIMA por defecto (su ficha)
export type SitioOpcion = {
  id: string; cliente_id: string | null; nombre_empresa: string; tipo: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null;
  provincia: string | null; pais_codigo_iso: string; horarios: string | null;
  es_almacen_dynamo: boolean; disponible: boolean;
};
export type SitioNuevo = {
  nombre_empresa: string; direccion: string; codigo_postal: string; poblacion: string;
  provincia: string; pais_codigo_iso: string; tipo_sitio: string; horarios: string; guardar: boolean;
  contacto: string; telefono: string;
  horario: GrupoHorario[] | null;   // null = el de por defecto
};
export type Punto = { k: number; tipo: 'carga' | 'descarga'; sitio: SitioOpcion | null; nuevo: SitioNuevo | null; parada_id?: string };
// Envío de partida: «Repetir envío» (todo relleno salvo la fecha) o «Cambiar ruta».
export type Base = {
  modo: 'repetir' | 'ruta' | 'editar';   // editar = modificarlo entero desde el asistente
  envio: { id: string; referencia_gx: string; cliente_id: string; estado: string; metros_lineales: number | null; toneladas: number | null;
    paletizado: boolean | null; carga_lateral: boolean; carga_trasera: boolean; carga_techo: boolean; requiere_plataforma_elevadora: boolean;
    requiere_nima: boolean; adr: boolean; anotaciones_cliente: string | null; importe_cliente: number | null; importe_transportista: number | null;
    discrecion_comercial: boolean; negociacion_pct?: number | null;
    // Solo para «editar»: lo que el asistente deja precargado tal cual estaba.
    referencia_cliente?: string | null; fecha_carga_desde?: string | null; fecha_carga_hasta?: string | null };
  paradas: { id: string; tipo: 'carga' | 'descarga'; sitio_id: string | null; nombre_empresa: string | null; direccion: string | null;
    codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null }[];
};

// ---- Fichas editables de los sitios en el paso de confirmar (como en el mockup) --------
// Lo que la base de datos trae de un sitio de la agenda para poder rellenar/corregir en la
// confirmación lo que falte (horario, teléfono de contacto, notas…). Se pide solo de los
// sitios que se usan en la ruta al llegar al paso 4.
export type SitioEditable = {
  es_almacen_dynamo: boolean; tipo: string | null;
  anotaciones: string | null; url_google_maps: string | null; emails_avisos: string[];
  mercancia_defecto: string | null;   // prerrellena el «detalle de mercancía» del paso 4
  contacto: { id: string | null; nombre: string; telefono: string; email: string };   // el contacto principal
  contactos: { id: string; nombre: string; telefono: string }[];   // TODOS los que tienen teléfono (principal primero): se listan en la tarjeta del paso 4
  horario: GrupoHorario[];                                             // temporada general
  verano: Verano;                                                      // horario de verano (activo, fechas y tramos)
};
export type DatosSitios = Record<string, SitioEditable>;
// Lo que el usuario cambia en una ficha de la confirmación (solo lo tocado; lo demás se
// resuelve con lo que ya tenía el sitio o el sitio nuevo del paso 1).
// cita/citaHora/citaDetalle: CITA PREVIA por sitio (usuario, 2026-11-09): se elige en la
// tarjeta del paso 4 y va como texto a las anotaciones de ESA parada del envío.
// mercancia: detalle de mercancía de ESA parada (usuario, 2026-11-09): plegable al pie de
// la tarjeta del paso 4; también va a las anotaciones de la parada.
// extra: contactos ADICIONALES añadidos desde la tarjeta (usuario, 2026-11-10): se crean
// en la agenda del sitio al guardar (no principales).
export type CardEdit = { horario?: GrupoHorario[]; verano?: Verano; contacto?: string; telefono?: string; contactoEmail?: string; notas?: string; emails?: string; maps?: string; empresa?: string; cita?: boolean; citaHora?: string; citaDetalle?: string; mercancia?: string; extra?: ContactoExtra[] };
export type ContactoExtra = { nombre: string; telefono: string; email: string };
// Lo que se manda al servidor para guardar en la ficha del sitio al crear el envío.
export type EdicionSitio = {
  sitio_id: string; contacto_id: string | null; contacto_nombre: string; contacto_telefono: string; contacto_email: string;
  anotaciones: string; emails_avisos: string[]; url_google_maps: string | null; mercancia_defecto?: string | null;
  horario_tramos: { dia: number; abre: string; cierra: string }[];
  verano?: { activo: boolean; desde: string; hasta: string; tramos: { dia: number; abre: string; cierra: string }[] };
  contactos_extra?: ContactoExtra[];
};
// Valores efectivos de una ficha: lo que trae el sitio (o el sitio nuevo) con lo tocado encima.
export type FichaResuelta = {
  empresa: string; tipo: string | null; horario: GrupoHorario[]; verano: Verano; contacto: string; telefono: string; contactoEmail: string;
  notas: string; emails: string; maps: string; mercancia: string; dynamo: boolean; nuevo: boolean; contacto_id: string | null;
};
const VERANO_VACIO: Verano = { activo: false, desde: VERANO_GENERICO.desde, hasta: VERANO_GENERICO.hasta, horario: HORARIO_VERANO_POR_DEFECTO };
export function resolverFicha(p: Punto, datos: DatosSitios, edic?: CardEdit, mercanciaDefecto = ''): FichaResuelta {
  let base: FichaResuelta;
  if (p.sitio) {
    const d = datos[p.sitio.id];
    base = {
      empresa: p.sitio.nombre_empresa, tipo: d?.tipo ?? p.sitio.tipo, nuevo: false, dynamo: !!p.sitio.es_almacen_dynamo,
      horario: d?.horario.length ? d.horario : HORARIO_POR_DEFECTO, verano: d?.verano ?? VERANO_VACIO,
      contacto: d?.contacto.nombre ?? '', telefono: d?.contacto.telefono ?? '', contactoEmail: d?.contacto.email ?? '', contacto_id: d?.contacto.id ?? null,
      notas: d?.anotaciones ?? '', emails: (d?.emails_avisos ?? []).join(', '), maps: d?.url_google_maps ?? '', mercancia: [mercanciaDefecto, d?.mercancia_defecto ?? ''].filter(Boolean).join('\n'),
    };
  } else if (p.nuevo) {
    const n = p.nuevo;
    base = { empresa: n.nombre_empresa, tipo: n.tipo_sitio, nuevo: true, dynamo: false, contacto_id: null,
      horario: n.horario ?? HORARIO_POR_DEFECTO, verano: VERANO_VACIO, contacto: n.contacto, telefono: n.telefono, contactoEmail: '', notas: '', emails: '', maps: '', mercancia: mercanciaDefecto };
  } else {
    // Punto aún sin sitio (ruta a medio rellenar): ficha vacía y SIN horario, para que
    // ningún aviso salte ni nada reviente (antes p.nuevo! con null tumbaba la pantalla).
    base = { empresa: '', tipo: 'almacen_nave', nuevo: true, dynamo: false, contacto_id: null,
      horario: [], verano: VERANO_VACIO, contacto: '', telefono: '', contactoEmail: '', notas: '', emails: '', maps: '', mercancia: mercanciaDefecto };
  }
  if (!edic) return base;
  return {
    ...base,
    empresa: edic.empresa ?? base.empresa, horario: edic.horario ?? base.horario, verano: edic.verano ?? base.verano,
    contacto: edic.contacto ?? base.contacto, telefono: edic.telefono ?? base.telefono, contactoEmail: edic.contactoEmail ?? base.contactoEmail,
    notas: edic.notas ?? base.notas, emails: edic.emails ?? base.emails, maps: edic.maps ?? base.maps, mercancia: edic.mercancia ?? base.mercancia,
  };
}

export const FORMAS = ['Lateral', 'Trasera', 'Techo', 'Lateral y trasera', 'Lateral y techo', 'Trasera y techo', 'Lateral, trasera y techo'];
export const VACIO: SitioNuevo = { nombre_empresa: '', direccion: '', codigo_postal: '', poblacion: '', provincia: '', pais_codigo_iso: 'ES', tipo_sitio: 'almacen_nave', horarios: '', guardar: true, contacto: '', telefono: '', horario: null };

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const num = (s: string) => { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

export { iso, habil, sumarHabiles, primerDia, corteDe } from '@/lib/fechasCarga';
export type { CortesCarga } from '@/lib/fechasCarga';

export function textoSitio(s: SitioOpcion | SitioNuevo): string {
  const lin = [s.codigo_postal, s.poblacion].filter(Boolean).join(' ');
  return [s.nombre_empresa, lin].filter(Boolean).join(' · ');
}
export function direccionCompleta(s: SitioOpcion | SitioNuevo): string {
  const pais = paisDe(s.pais_codigo_iso);
  const prov = s.provincia && s.provincia !== s.poblacion ? s.provincia : '';
  return [s.direccion, [s.codigo_postal, s.poblacion].filter(Boolean).join(' '), prov, pais].filter(Boolean).join(', ');
}

// Iconos SVG de línea (regla 0-ter).
export const IcoPin = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
export const IcoFlecha = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>);
export const IcoMas = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
export const IcoMenos = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>);
export const IcoCliente = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const IcoEscudo = () => (<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>);

// esCliente: lo usa el propio CLIENTE (etapa B). Pide una SOLICITUD sin precio: Dynamo
// se lo pone y él lo acepta después desde la ficha del envío.
export type Props = { clientes: ClienteOpcion[]; sitios: SitioOpcion[]; festivos: string[]; nombresFestivos?: Record<string, string>; error: string | null; base?: Base | null; esCliente?: boolean;
  clienteFijo?: boolean;                              // «Ver como» un cliente: el cliente ya viene decidido y el campo no se enseña
  operadores?: { id: string; nombre: string; cif?: string | null; contacto?: string | null }[];   // el catálogo de transportistas del cliente (envío manual)
  esMaster?: boolean;                                 // Admin Master: cualquier fecha, también pasada
  fechaInicial?: string | null;                       // fecha de recogida ya elegida (p. ej. al pulsar un día en la vista calendario)
  autosusp?: MiAutosusp | null;                       // lo que el cliente lleva contra los límites de uso (mi_autosuspension)
  reglas?: ReglasPrecio | null };                     // antelación máxima y precio provisional (parámetros)
// Lo que devuelve mi_autosuspension(): límites de uso vigentes y lo que lleva el cliente.
export type MiAutosusp = { activa: boolean;
  consultas: { hoy: number; max_hoy: number; semana: number; max_semana: number; mes: number; max_mes: number };
  envios_dia?: { hoy: number; max_hoy: number | null };   // límite individual de envíos (regla 6); null = sin tope
  cancelaciones: { propias: number; envios: number; max_pct: number; min_envios: number;
    recientes: number; max_recientes: number; dias_recientes: number } };
export type ReglasPrecio = { antelacion_max_dias: number; cerrado_dias: number; revision_dias_habiles: number; margen_pct: number;
  // Horas de corte: la de fecha fija y una POR VENTANA (1-2, 1-3 y 1-4 días; usuario, 2026-11-10).
  corte_fija_hora?: number; corte_ventana_1_2_hora?: number; corte_ventana_1_3_hora?: number; corte_ventana_1_4_hora?: number };

// Del valor guardado a la opción más cercana del desplegable (que va por tramos).
export const opcionCercana = (v: number | null | undefined, opciones: string[], defecto: string) =>
  v == null ? defecto : opciones.find((o) => Number(o) >= Number(v) - 1e-9) ?? opciones[opciones.length - 1];
export const decimal = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
