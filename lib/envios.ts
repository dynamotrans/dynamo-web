// Lógica de presentación de la tabla de envíos, traducida de dashboard.html
// (getEstadoVisual, getAsignacionEstado, highlightInfo, rutaFechasCell…) a los datos
// reales de la base de datos.
import { fecha } from './formato';
import { paisDe } from './paises';

export type Parada = {
  orden: number; tipo: 'carga' | 'descarga'; nombre_empresa: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null;
  provincia: string | null; pais_codigo_iso: string | null;
};
export type EnvioFila = {
  id: string; referencia_gx: string; referencia_cliente: string | null;
  estado: string; estado_asignacion: string | null;
  es_manual: boolean | null; operador: string | null;
  transportista_asignado: boolean;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null;
  fecha_carga_real: string | null; fecha_entrega_estimada: string | null;
  descripcion_mercancia: string | null; toneladas: number | null; metros_lineales: number | null;
  tipo_carga: string | null; paletizado: boolean | null;
  poblacion_origen: string | null; codigo_postal_origen: string | null;
  poblacion_destino: string | null; codigo_postal_destino: string | null;
  importe_cliente: number | null; importe_transportista: number | null;
  precio_acordado_operador: number | null; precio_fijado_a_mano: boolean | null;
  matricula_camion: string | null; matricula_remolque: string | null;
  cliente: string | null; cliente_cif: string | null;
  creado_en: string | null; modificado_en: string | null; creado_por: string | null;
  paradas: Parada[];
  solicitud_estado?: string | null;   // envío pedido por el cliente: pendiente_precio / precio_propuesto / …
};

// Solicitud del cliente esperando precio (de Dynamo) o respuesta (del cliente).
export const esSolicitudAbierta = (e: { estado: string; solicitud_estado?: string | null }) =>
  e.estado === 'borrador' && (e.solicitud_estado === 'pendiente_precio' || e.solicitud_estado === 'precio_propuesto');

// Estado del envío (badge de la 1ª columna).
export function estadoVisual(e: EnvioFila): { label: string; color: string } {
  switch (e.estado) {
    case 'entregado': return { label: 'Entregado', color: 'entregado' };
    case 'cancelado': return { label: 'Cancelada', color: 'cancelada' };
    case 'hacia_la_carga': return { label: 'Llegando recogida', color: 'hacia' };
    case 'cargando': return { label: 'Cargando', color: 'cargando' };
    case 'en_ruta': return { label: 'En ruta', color: 'enruta' };
    case 'borrador':
      if (e.solicitud_estado === 'pendiente_precio') return { label: 'Pendiente de precio', color: 'cargando' };
      if (e.solicitud_estado === 'precio_propuesto') return { label: 'Precio por aceptar', color: 'hacia' };
      return { label: 'Borrador', color: 'prog' };
    default: return { label: 'Programado', color: 'prog' };
  }
}

// Estado de asignación del transportista (columna Vehículo).
export function asignacion(e: EnvioFila): { key: string; label: string } | null {
  if (e.es_manual || e.estado === 'borrador') return null;
  if (e.estado === 'entregado' || e.estado === 'cancelado') return null;
  if (e.transportista_asignado || e.estado_asignacion === 'confirmada' || e.estado === 'en_ruta')
    return { key: 'confirmado', label: 'Confirmado transportista' };
  return { key: 'asignandose', label: 'Asignándose transportista' };
}

// Pestañas de la tabla (las del mockup).
export type Pestana = 'solicitudes' | 'sin-asignar' | 'programada' | 'entregada' | 'cancelada' | 'todas';
const VIVOS = ['borrador', 'programado', 'hacia_la_carga', 'cargando', 'en_ruta'];
export function enPestana(e: EnvioFila, p: Pestana): boolean {
  if (p === 'todas') return true;
  if (p === 'entregada') return e.estado === 'entregado';
  if (p === 'cancelada') return e.estado === 'cancelado';
  if (p === 'solicitudes') return esSolicitudAbierta(e);
  if (p === 'sin-asignar') return e.estado === 'programado' && !e.es_manual && !e.transportista_asignado;
  return VIVOS.includes(e.estado) && !esSolicitudAbierta(e);
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
  const ref = e.fecha_carga_real || e.fecha_carga_hasta || e.fecha_carga_desde;
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

export function fechaCarga(e: EnvioFila): string {
  if (e.fecha_carga_real) return fecha(e.fecha_carga_real);
  if (!e.fecha_carga_desde) return 'Sin fecha';
  if (!e.fecha_carga_hasta || e.fecha_carga_hasta === e.fecha_carga_desde) return fecha(e.fecha_carga_desde);
  return `${fecha(e.fecha_carga_desde)} – ${fecha(e.fecha_carga_hasta)}`;
}
export function fechaEntrega(e: EnvioFila): string {
  return e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : 'Sin programar';
}

// "03/11/26 · 09:41", en hora de Madrid (regla 12).
export function creadoTxt(iso: string | null): string {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} · ${v('hour')}:${v('minute')}`;
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
const num1 = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
export function medidas(e: EnvioFila): string {
  const m = e.metros_lineales != null ? `${num1(Number(e.metros_lineales))} m` : null;
  const t = e.toneladas != null ? `${num1(Number(e.toneladas))} Tn` : null;
  return [m, t].filter(Boolean).join(' · ');
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
