// Lógica de presentación de la tabla de envíos, traducida de dashboard.html
// (getEstadoVisual, getAsignacionEstado, highlightInfo, rutaFechasCell…) a los datos
// reales de la base de datos.
import { fecha, ventana, medidasTxt } from './formato';
import { paisDe } from './paises';
import { ESTADOS_ENVIO, ESTADO_ASIGNANDO, ESTADO_CONFIRMADO, etiquetaEtapa } from './estados';

export type Parada = {
  orden: number; tipo: 'carga' | 'descarga'; nombre_empresa: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null;
  provincia: string | null; pais_codigo_iso: string | null;
  tipo_sitio?: string | null;   // almacen_nave, obra_…, finca (para el icono de la pastilla)
};
// Lo que espera para salir de un envío (usuario, 2026-11-20): todos los emails esperan 30 s
// por si hay que anular el cambio. tipo: creado / modificado / cancelado / asignado / email.
export type CambioPendiente = { vence_en: string; tipo: string; autor: string | null; puede_anular: boolean; emails: number };

export type EnvioFila = {
  id: string; referencia_gx: string; referencia_cliente: string | null;
  estado: string; estado_asignacion: string | null;
  es_manual: boolean | null; operador: string | null;
  transportista_asignado: boolean;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null;
  fecha_carga_real: string | null; fecha_entrega_estimada: string | null;
  // Entrega estimada (entregas_estimadas): la fijada al asignar o, sin ella, la ventana de la
  // recogida más los días de viaje (usuario, 2026-11-19).
  entrega_desde?: string | null; entrega_hasta?: string | null;
  // Cambio reciente o email esperando sus 30 s (pendientes_envios): el contador para anular.
  pendiente?: CambioPendiente | null;
  descripcion_mercancia: string | null; toneladas: number | null; metros_lineales: number | null;
  tipo_carga: string | null; paletizado: boolean | null;
  poblacion_origen: string | null; codigo_postal_origen: string | null;
  poblacion_destino: string | null; codigo_postal_destino: string | null;
  importe_cliente: number | null; importe_transportista: number | null;
  precio_acordado_operador: number | null; precio_fijado_a_mano: boolean | null;
  matricula_camion: string | null; matricula_remolque: string | null;
  // Solo en la lista de Dynamo (el cliente no ve qué transportista lleva su envío).
  transportista?: string | null; conductor_nombre?: string | null; conductor_telefono?: string | null;
  cliente: string | null; cliente_cif: string | null;
  creado_en: string | null; modificado_en: string | null; creado_por: string | null;
  paradas: Parada[];
  estado_solicitud?: string | null;   // envío pedido por el cliente: pendiente_precio / precio_propuesto / …
  requiere_plataforma_elevadora?: boolean | null;   // completo con plataforma = rígido completo
  estado_pago_previo?: string | null;        // no_requerido / pendiente / pagado / exento (previo pago)
  pago_limite?: string | null;               // pendiente de pago: hasta cuándo se puede pagar (temporizador de la lista)
  pago_avisado_en?: string | null;           // pendiente de pago: el cliente avisó de su transferencia (plazo parado)
  estado_cambio_cliente?: string | null;   // el cliente ha pedido un cambio (pendiente / aplicado / …)
  requiere_revision_precio?: boolean | null;         // la ruta ha cambiado y el precio no se ha revisado
  // Seguimiento (seguimiento_envios): parada en la que está o a la que va, su tipo, y si
  // un programado sin camión ya se ve como «Asignando transportista» (a menos de 36 h).
  parada_actual?: number | null; tipo_parada?: string | null; asignando?: boolean | null;
  fecha_carga_prevista?: string | null; automatico?: boolean | null;
};

// Envío confirmado esperando el pago previo: no se oferta ni se asigna todavía.
export const esPendientePago = (e: { estado: string; estado_pago_previo?: string | null }) =>
  e.estado === 'programado' && e.estado_pago_previo === 'pendiente';

// Estado del envío (badge de la 1ª columna).
export function estadoVisual(e: EnvioFila): { label: string; color: string } {
  switch (e.estado) {
    case 'entregado': return ESTADOS_ENVIO.entregado;
    // Sin pagar el pago previo: lo anula el sistema al pasar el plazo (o el cliente antes).
    case 'cancelado': return e.estado_pago_previo === 'pendiente' ? { label: 'Anulado sin pago', color: 'cancelada' } : ESTADOS_ENVIO.cancelado;
    case 'hacia_la_carga': case 'cargando': case 'en_ruta': return etiquetaEtapa(e.estado, e.parada_actual, e.tipo_parada);
    case 'borrador':
      if (e.estado_solicitud === 'pendiente_precio') return { label: 'Pendiente de precio', color: 'cargando' };
      if (e.estado_solicitud === 'precio_propuesto') return { label: 'Precio por aceptar', color: 'hacia' };
      if (e.estado_solicitud === 'contraoferta') return { label: 'Contraoferta del cliente', color: 'cargando' };
      return ESTADOS_ENVIO.borrador;
    default:
      if (esPendientePago(e)) return { label: 'Pendiente de pago', color: 'cargando' };
      if (e.es_manual) return ESTADOS_ENVIO.programado;
      if (e.transportista_asignado || e.estado_asignacion === 'confirmada') return ESTADO_CONFIRMADO;
      return e.asignando ? ESTADO_ASIGNANDO : ESTADOS_ENVIO.programado;
  }
}

// Estado de asignación del transportista (columna Vehículo).
export function asignacion(e: EnvioFila): { key: string; label: string } | null {
  if (e.es_manual || e.estado === 'borrador') return null;
  if (esPendientePago(e)) return { key: 'espera', label: 'Se asigna al pagar' };
  // Lo demás ya lo dice el estado (Programado / Asignando transportista / Confirmado…).
  return null;
}

// Pestañas de la tabla (las del mockup).
export type Pestana = 'sin-pagar' | 'sin-asignar' | 'programada' | 'entregada' | 'cancelada' | 'todas';
const VIVOS = ['borrador', 'programado', 'hacia_la_carga', 'cargando', 'en_ruta'];
export function enPestana(e: EnvioFila, p: Pestana): boolean {
  if (p === 'todas') return true;
  if (p === 'entregada') return e.estado === 'entregado';
  if (p === 'cancelada') return e.estado === 'cancelado';
  if (p === 'sin-pagar') return esPendientePago(e);
  if (p === 'sin-asignar') return e.estado === 'programado' && !e.es_manual && !e.transportista_asignado && !esPendientePago(e);
  // «Programados»: los vivos que NO esperan el pago (esos tienen su pestaña; usuario, 2026-11-16).
  return VIVOS.includes(e.estado) && !esPendientePago(e);
}

// --- Fechas -------------------------------------------------------------------------
function dia(iso: string): Date { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); }
function hoyMadrid(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return dia(s);
}
const finde = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

// Color de urgencia de la fila (rampa del mockup): retrasada / hoy / +1 / +2 días hábiles.
export function urgencia(e: EnvioFila): string {
  if (e.estado !== 'programado' && e.estado !== 'borrador') return '';
  const ref = e.fecha_carga_real || e.fecha_carga_prevista || e.fecha_carga_hasta || e.fecha_carga_desde;   // con fecha asignada, la urgencia es la de ESE día
  if (!ref) return '';
  const d = dia(ref), hoy = hoyMadrid();
  if (d < hoy) return 'row-overdue';
  if (finde(d)) return '';
  const ancla = new Date(hoy); while (finde(ancla)) ancla.setDate(ancla.getDate() + 1);
  if (d < ancla) return '';
  let nivel = 0; const c = new Date(ancla);
  while (c < d && nivel <= 3) { c.setDate(c.getDate() + 1); if (!finde(c)) nivel++; }
  return ['row-today', 'row-tomorrow', 'row-aftertomorrow'][nivel] ?? '';
}

// La fecha de carga que se enseña en las listas: la REAL si ya cargó; si no, la ASIGNADA
// (la que se fijó al confirmar el transportista); y solo sin asignar, la ventana pedida
// (usuario, 2026-11-18: un envío confirmado para el viernes no debe seguir diciendo «del
// miércoles al viernes»).
export function fechaCarga(e: EnvioFila): string {
  if (e.fecha_carga_real) return fecha(e.fecha_carga_real);
  if (e.fecha_carga_prevista) return fecha(e.fecha_carga_prevista);
  return ventana(e.fecha_carga_desde, e.fecha_carga_hasta);
}
export function fechaEntrega(e: Pick<EnvioFila, 'fecha_entrega_estimada' | 'entrega_desde' | 'entrega_hasta'>): string {
  if (e.fecha_entrega_estimada) return fecha(e.fecha_entrega_estimada);
  // Sin fecha fijada: la ventana estimada desde la recogida (usuario, 2026-11-19: «si recoge
  // del miércoles al viernes, entrega estimada del jueves al lunes»).
  if (e.entrega_desde) return ventana(e.entrega_desde, e.entrega_hasta ?? e.entrega_desde);
  return 'Por confirmar';
}

// --- Paradas ------------------------------------------------------------------------
// "CP, población, provincia, país" (formato de la tabla del mockup).
export function dirParada(p: Parada): string {
  const prov = p.provincia && p.provincia !== p.poblacion ? p.provincia : null;
  return [p.codigo_postal, p.poblacion, prov, paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ');
}
export function paradasDe(e: EnvioFila): { recogidas: Parada[]; entregas: Parada[] } {
  if (e.paradas?.length) {
    const ps = [...e.paradas].sort((a, b) => a.orden - b.orden);
    return { recogidas: ps.filter((p) => p.tipo === 'carga'), entregas: ps.filter((p) => p.tipo === 'descarga') };
  }
  const p = (cp: string | null, pob: string | null, tipo: 'carga' | 'descarga'): Parada =>
    ({ orden: 0, tipo, nombre_empresa: null, direccion: null, codigo_postal: cp, poblacion: pob, provincia: null, pais_codigo_iso: 'ES' });
  return { recogidas: [p(e.codigo_postal_origen, e.poblacion_origen, 'carga')], entregas: [p(e.codigo_postal_destino, e.poblacion_destino, 'descarga')] };
}

// --- Mercancía ----------------------------------------------------------------------
export function medidas(e: EnvioFila): string {
  return medidasTxt(e.metros_lineales, e.toneladas);
}

// Buscador: "cualquier dato" del envío.
export function coincide(e: EnvioFila, q: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const txt = n([
    e.referencia_gx, e.referencia_cliente, e.cliente, e.cliente_cif, e.operador, e.descripcion_mercancia,
    e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino, e.matricula_camion, e.matricula_remolque,
    ...e.paradas.flatMap((p) => [p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia]),
  ].filter(Boolean).join(' '));
  return n(q).split(/\s+/).filter(Boolean).every((w) => txt.includes(w));
}

// Negociación del precio del transportista (misma lista en Nuevo envío, Modificar y
// Ofrecer carga). El transportista nunca ve el %, solo el rango en euros.
export const NEGOCIACION: [number, string][] = [
  [0, 'NO negociable · precio fijo'],
  [5, 'Negociable ±5 % · lo decide el sistema'],
  [10, 'Negociable ±10 % · lo decide el sistema'],
  [30, 'Negociable ±30 % · lo revisa un agente'],
];

// «Fecha» rápida de la barra de filtros (mockup): hoy/mañana/ayer, semanas de lunes a
// domingo y meses «YYYY-MM». Devuelve el rango en días (ambos incluidos) o null.
export function rangoRapido(fr: string, hoy: string): { desde: string; hasta: string } | null {
  const suma = (s: string, n: number) => {
    const [a, m, dd] = s.split('-').map(Number); const x = new Date(a, m - 1, dd + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  if (fr === 'hoy') return { desde: hoy, hasta: hoy };
  if (fr === 'manana') return { desde: suma(hoy, 1), hasta: suma(hoy, 1) };
  if (fr === 'ayer') return { desde: suma(hoy, -1), hasta: suma(hoy, -1) };
  const lunes = suma(hoy, -((new Date(hoy + 'T12:00:00').getDay() + 6) % 7));
  if (fr === 'esta-semana') return { desde: lunes, hasta: suma(lunes, 6) };
  if (fr === 'proxima-semana') return { desde: suma(lunes, 7), hasta: suma(lunes, 13) };
  if (fr === 'semana-pasada') return { desde: suma(lunes, -7), hasta: suma(lunes, -1) };
  const m = /^(\d{4})-(\d{2})$/.exec(fr);
  if (m) return { desde: `${fr}-01`, hasta: `${fr}-${String(new Date(Number(m[1]), Number(m[2]), 0).getDate()).padStart(2, '0')}` };
  return null;
}
