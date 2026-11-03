'use client';

// "Nuevo envío": asistente de 4 pasos con el diseño de dashboard.html (#sec-nueva-carga):
// Ruta · Mercancía · Fecha y precio · Confirmar. Mismas clases del mockup (ptar-*, wiz-*,
// sum2-*, alm-price). Etapa A: lo usa Dynamo para un cliente y pone el precio a mano;
// el tarifador llega al final (y el precio lo calculará el servidor, nunca el navegador).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearEnvio, crearClienteRapido, cambiarRuta, crearSolicitud, crearEnvioManual, type ParadaNueva } from '@/app/panel/(app)/nuevo-envio/acciones';
import { fecha as fmtFecha, euros as eur } from '@/lib/formato';
import Cargando from '@/components/Cargando';
import { paisDe } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import { TIPOS_LUGAR } from './TipoSitio';
import EditorHorario from './EditorHorario';
import { HORARIO_POR_DEFECTO, validarHorario, tramosDe, type GrupoHorario } from '@/lib/horarios';
import CampoTelefono from '@/components/CampoTelefono';

// principal_id: el sitio con la estrella en Sitios (se pone solo como primera recogida).
export type ClienteOpcion = { id: string; nombre: string; cif: string; principal_id?: string | null };
export type SitioOpcion = {
  id: string; cliente_id: string | null; nombre_empresa: string; tipo: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null;
  provincia: string | null; pais_codigo_iso: string; horarios: string | null;
  es_almacen_dynamo: boolean; disponible: boolean;
};
type SitioNuevo = {
  nombre_empresa: string; direccion: string; codigo_postal: string; poblacion: string;
  provincia: string; pais_codigo_iso: string; tipo_lugar: string; horarios: string; guardar: boolean;
  contacto: string; telefono: string;
  horario: GrupoHorario[] | null;   // null = el de por defecto
};
type Punto = { k: number; tipo: 'carga' | 'descarga'; sitio: SitioOpcion | null; nuevo: SitioNuevo | null; parada_id?: string };
// Envío de partida: «Repetir envío» (todo relleno salvo la fecha) o «Cambiar ruta».
export type Base = {
  modo: 'repetir' | 'ruta';
  envio: { id: string; referencia_gx: string; cliente_id: string; estado: string; metros_lineales: number | null; toneladas: number | null;
    paletizado: boolean | null; carga_lateral: boolean; carga_trasera: boolean; carga_superior: boolean; plataforma_elevadora: boolean;
    nima_requerido: boolean; adr: boolean; anotaciones_cliente: string | null; importe_cliente: number | null; importe_transportista: number | null;
    discrecion_comercial: boolean };
  paradas: { id: string; tipo: 'carga' | 'descarga'; lugar_id: string | null; nombre_empresa: string | null; direccion: string | null;
    codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null }[];
};

const FORMAS = ['Lateral', 'Trasera', 'Techo', 'Lateral y trasera', 'Lateral y techo', 'Trasera y techo', 'Lateral, trasera y techo'];
const VACIO: SitioNuevo = { nombre_empresa: '', direccion: '', codigo_postal: '', poblacion: '', provincia: '', pais_codigo_iso: 'ES', tipo_lugar: 'almacen_nave', horarios: '', guardar: true, contacto: '', telefono: '', horario: null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s: string) => { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

// ---- Fechas (días hábiles: sin fines de semana ni festivos nacionales) -------------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function habil(d: Date, fest: Set<string>) { return d.getDay() !== 0 && d.getDay() !== 6 && !fest.has(iso(d)); }
function sumarHabiles(desde: string, n: number, fest: Set<string>): string {
  const [a, m, d] = desde.split('-').map(Number); const x = new Date(a, m - 1, d); let k = 0;
  while (k < n) { x.setDate(x.getDate() + 1); if (habil(x, fest)) k++; }
  return iso(x);
}
// Primer día de recogida posible: el siguiente día hábil, si se pide antes del corte de
// hoy (fecha fija 12:00, ventana 14:00, hora de Madrid); si no, el siguiente.
function primerDia(urg: 'dia' | 'estandar', fest: Set<string>): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hoy = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  const corte = urg === 'dia' ? 12 : 14;
  return sumarHabiles(hoy, v('hour') < corte ? 1 : 2, fest);
}

function textoSitio(s: SitioOpcion | SitioNuevo): string {
  const lin = [s.codigo_postal, s.poblacion].filter(Boolean).join(' ');
  return [s.nombre_empresa, lin].filter(Boolean).join(' · ');
}
function direccionCompleta(s: SitioOpcion | SitioNuevo): string {
  const pais = paisDe(s.pais_codigo_iso);
  const prov = s.provincia && s.provincia !== s.poblacion ? s.provincia : '';
  return [s.direccion, [s.codigo_postal, s.poblacion].filter(Boolean).join(' '), prov, pais].filter(Boolean).join(', ');
}

// Iconos SVG de línea (regla 0-ter).
const IcoPin = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const IcoFlecha = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>);
const IcoMas = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IcoMenos = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IcoCliente = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
const IcoEscudo = () => (<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>);

// esCliente: lo usa el propio CLIENTE (etapa B). Pide una SOLICITUD sin precio: Dynamo
// se lo pone y él lo acepta después desde la ficha del envío.
type Props = { clientes: ClienteOpcion[]; sitios: SitioOpcion[]; festivos: string[]; nombresFestivos?: Record<string, string>; error: string | null; base?: Base | null; esCliente?: boolean;
  operadores?: { id: string; nombre: string }[] };   // los operadores de transporte del cliente (envío manual)

// Del valor guardado a la opción más cercana del desplegable (que va por tramos).
const opcionCercana = (v: number | null | undefined, opciones: string[], defecto: string) =>
  v == null ? defecto : opciones.find((o) => Number(o) >= Number(v) - 1e-9) ?? opciones[opciones.length - 1];
const decimal = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

export default function NuevoEnvio({ clientes: clientesIni, sitios, festivos, nombresFestivos = {}, error: errorCarga, base, esCliente = false, operadores = [] }: Props) {
  const be = base?.envio;
  const enRuta = base?.modo === 'ruta';
  const puntoDe = (p: Base['paradas'][number], k: number): Punto => {
    const s = p.lugar_id ? sitios.find((x) => x.id === p.lugar_id) ?? null : null;
    const nuevo: SitioNuevo | null = s ? null : { ...VACIO, nombre_empresa: p.nombre_empresa ?? '', direccion: p.direccion ?? '', codigo_postal: p.codigo_postal ?? '',
      poblacion: p.poblacion ?? '', provincia: p.provincia ?? '', pais_codigo_iso: p.pais_codigo_iso ?? 'ES', guardar: false };
    return { k, tipo: p.tipo, sitio: s, nuevo, parada_id: enRuta ? p.id : undefined };
  };
  const router = useRouter();
  const fest = useMemo(() => new Set(festivos), [festivos]);
  const [paso, setPaso] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);

  // ---- Paso 1: cliente y ruta
  const [clientes, setClientes] = useState(clientesIni);
  const [cliente, setCliente] = useState<ClienteOpcion | null>(esCliente ? clientesIni[0] ?? null : be ? clientesIni.find((c) => c.id === be.cliente_id) ?? null : null);
  const sigK = useRef(10);
  const [recogidas, setRecogidas] = useState<Punto[]>(() => {
    const l = (base?.paradas ?? []).filter((p) => p.tipo === 'carga').map((p, i) => puntoDe(p, 100 + i));
    // El cliente: su sitio principal (la estrella de Sitios) como primera recogida.
    const prin = esCliente && clientesIni[0]?.principal_id ? sitios.find((x) => x.id === clientesIni[0].principal_id) ?? null : null;
    return l.length ? l : [{ k: 1, tipo: 'carga', sitio: prin, nuevo: null }];
  });
  const [entregas, setEntregas] = useState<Punto[]>(() => {
    const l = (base?.paradas ?? []).filter((p) => p.tipo === 'descarga').map((p, i) => puntoDe(p, 200 + i));
    return l.length ? l : [{ k: 2, tipo: 'descarga', sitio: null, nuevo: null }];
  });
  const total = recogidas.length + entregas.length;

  // ---- Paso 2: mercancía
  const [paletizada, setPaletizada] = useState(be ? be.paletizado !== false : true);
  const [trampilla, setTrampilla] = useState(!!be?.plataforma_elevadora);
  const mlMax = trampilla ? 8 : 13;
  const pesoMax = trampilla ? 14 : 24;
  const [ml, setMl] = useState(() => opcionCercana(be?.metros_lineales, be?.plataforma_elevadora ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13.3'], be?.plataforma_elevadora ? '8' : '13.3'));
  const [peso, setPeso] = useState(() => opcionCercana(be?.toneladas, ['0.2', '0.4', '0.6', '0.8', '1', '3', '5', '7', '9', '11', '13', ...(be?.plataforma_elevadora ? ['14'] : ['15', '17', '19', '21', '23', '24'])], be?.plataforma_elevadora ? '14' : '24'));
  const [forma, setForma] = useState(() => {
    if (!be) return 'Lateral';
    const t = [be.carga_lateral && 'lateral', be.carga_trasera && 'trasera', be.carga_superior && 'techo'].filter(Boolean) as string[];
    return FORMAS.find((f) => { const fl = f.toLowerCase(); return t.length > 0 && t.every((x) => fl.includes(x)) && fl.split(/,| y /).length === t.length; }) ?? 'Lateral';
  });
  const [nima, setNima] = useState(!!be?.nima_requerido);
  const [adr, setAdr] = useState(!!be?.adr);
  const [refCli, setRefCli] = useState('');
  const [notas, setNotas] = useState(be?.anotaciones_cliente ?? '');
  const [notasAbiertas, setNotasAbiertas] = useState(!!(be && (be.plataforma_elevadora || be.nima_requerido || be.adr || be.anotaciones_cliente)));

  // ---- Paso 3: fecha y precio
  const [urgencia, setUrgencia] = useState<'dia' | 'estandar'>('estandar');
  const [fecha, setFecha] = useState('');
  const [pc, setPc] = useState(esCliente ? '' : decimal(be?.importe_cliente));
  const [pt, setPt] = useState(esCliente ? '' : decimal(be?.importe_transportista));

  // ---- Envío MANUAL (solo el cliente): con su propio operador, Dynamo no interviene.
  const [operador, setOperador] = useState('');
  const [precioOp, setPrecioOp] = useState('');
  const manual = esCliente && !!operador;
  const nombreOp = operadores.find((o) => o.id === operador)?.nombre ?? '';

  // ---- Paso 4
  const [discrecion, setDiscrecion] = useState(!!be?.discrecion_comercial);
  const [enviando, setEnviando] = useState(false);

  // El aviso de "falta tal dato" se borra en cuanto se toca cualquier cosa.
  useEffect(() => { setAviso(null); }, [cliente, recogidas, entregas, ml, peso, fecha, pc, pt, urgencia]);

  const ventanaDias = urgencia === 'estandar' ? 3 : 1;
  const fechaHasta = fecha ? (ventanaDias > 1 ? sumarHabiles(fecha, ventanaDias - 1, fest) : fecha) : '';
  const dias = useMemo(() => {
    const out: string[] = []; let d = primerDia(urgencia, fest);
    for (let i = 0; i < 10; i++) { out.push(d); d = sumarHabiles(d, 1, fest); }
    return out;
  }, [urgencia, fest]);

  const sitiosCliente = useMemo(
    () => sitios.filter((s) => s.es_almacen_dynamo || (cliente && s.cliente_id === cliente.id)),
    [sitios, cliente]);

  const importe = num(pc);
  const importeT = pt.trim() ? num(pt) : null;

  function nuevaParada(tipo: 'carga' | 'descarga') {
    if (total >= 4) return;
    const p: Punto = { k: sigK.current++, tipo, sitio: null, nuevo: null };
    if (tipo === 'carga') setRecogidas((r) => [...r, p]);
    else setEntregas((e) => [p, ...e]);   // las entregas extra van antes del destino
  }
  function cambiar(p: Punto, cambios: Partial<Punto>) {
    // Si se cambia el sitio, ya no es la parada que había (en «Cambiar ruta»).
    const f = (l: Punto[]) => l.map((x) => (x.k === p.k ? { ...x, ...cambios, ...('sitio' in cambios || 'nuevo' in cambios ? { parada_id: undefined } : {}) } : x));
    if (p.tipo === 'carga') setRecogidas(f); else setEntregas(f);
  }
  function quitar(p: Punto) {
    if (p.tipo === 'carga') setRecogidas((l) => l.filter((x) => x.k !== p.k));
    else setEntregas((l) => l.filter((x) => x.k !== p.k));
  }

  // ---- Validación por paso
  function errorPaso(n: number): string | null {
    if (n === 1) {
      if (!cliente) return 'Elige el cliente del envío.';
      const todos = [...recogidas, ...entregas];
      if (todos.some((p) => !p.sitio && !p.nuevo)) return 'Elige la recogida y la entrega (de la lista o creando el sitio).';
    }
    if (n === 2 && (!ml || !peso)) return 'Indica los metros lineales y el peso.';
    if (n === 3) {
      if (!fecha) return 'Elige la fecha de recogida.';
      if (!esCliente && !(importe > 0)) return 'Pon el precio del cliente (base sin IVA).';
      if (!esCliente && importeT !== null && !(importeT >= 0)) return 'El precio del transportista no es un número válido.';
    }
    return null;
  }
  function siguiente() {
    const e = errorPaso(paso);
    if (e) { setAviso(e); return; }
    setAviso(null); setPaso((p) => Math.min(4, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function atras() {
    setAviso(null);
    if (paso === 1) router.push('/panel/envios'); else { setPaso((p) => p - 1); window.scrollTo({ top: 0 }); }
  }

  async function guardarRuta() {
    if (!base) return;
    const e = errorPaso(1);
    if (e) { setAviso(e); return; }
    setEnviando(true); setAviso(null);
    const r = await cambiarRuta(base.envio.id, [...recogidas, ...entregas].map((p) => {
      if (p.parada_id) return { tipo: p.tipo, id: p.parada_id };
      if (p.sitio) return { tipo: p.tipo, lugar_id: p.sitio.id };
      const n = p.nuevo!;
      return { tipo: p.tipo, nombre_empresa: n.nombre_empresa, direccion: n.direccion, codigo_postal: n.codigo_postal, poblacion: n.poblacion,
        provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso, tipo_lugar: n.tipo_lugar, horarios: n.horarios, guardar_en_agenda: n.guardar,
        contacto_nombre: n.contacto, contacto_telefono: n.telefono, horario_tramos: n.horario ? tramosDe(n.horario) : undefined };
    }));
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    router.push(`/panel/envios?ver=${base.envio.id}`);
    router.refresh();
  }

  async function crear() {
    if (!cliente) return;
    for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
    setEnviando(true); setAviso(null);
    const paradas: ParadaNueva[] = [...recogidas, ...entregas].map((p, i) => {
      const ref = i === 0 && refCli ? refCli : undefined;
      if (p.sitio) return { tipo: p.tipo, lugar_id: p.sitio.id, referencia: ref };
      const n = p.nuevo!;
      return {
        tipo: p.tipo, nombre_empresa: n.nombre_empresa, direccion: n.direccion, codigo_postal: n.codigo_postal,
        poblacion: n.poblacion, provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso,
        tipo_lugar: n.tipo_lugar, horarios: n.horarios, guardar_en_agenda: n.guardar, referencia: ref,
        contacto_nombre: n.contacto, contacto_telefono: n.telefono, horario_tramos: n.horario ? tramosDe(n.horario) : undefined,
      };
    });
    const f = forma.toLowerCase();
    if (manual) {
      const po = precioOp.trim() ? num(precioOp) : null;
      if (po != null && !(po >= 0)) { setEnviando(false); setAviso('El precio acordado no es un número válido.'); setPaso(3); return; }
      const rm = await crearEnvioManual({
        operador_id: operador, precio_acordado_operador: po,
        referencia_cliente: refCli, fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        toneladas: Number(peso), metros_lineales: Number(ml),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
        carga_superior: f.includes('techo'), plataforma_elevadora: trampilla, nima_requerido: nima, adr,
        discrecion_comercial: discrecion, anotaciones_cliente: notas,
      }, paradas);
      if (!rm.ok) { setEnviando(false); setAviso(rm.error); return; }
      router.push(`/panel/envios?f=programada&nuevo=${encodeURIComponent(rm.referencia_gx)}&manual=1`);
      router.refresh();
      return;
    }
    if (esCliente) {
      const rs = await crearSolicitud({
        referencia_cliente: refCli, fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        toneladas: Number(peso), metros_lineales: Number(ml),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
        carga_superior: f.includes('techo'), plataforma_elevadora: trampilla, nima_requerido: nima, adr,
        discrecion_comercial: discrecion, anotaciones_cliente: notas,
      }, paradas);
      if (!rs.ok) { setEnviando(false); setAviso(rs.error); return; }
      router.push(`/panel/envios?f=solicitudes&nuevo=${encodeURIComponent(rs.referencia_gx)}`);
      router.refresh();
      return;
    }
    const r = await crearEnvio({
      cliente_id: cliente.id, referencia_cliente: refCli,
      fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
      descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
      toneladas: Number(peso), metros_lineales: Number(ml),
      paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
      carga_superior: f.includes('techo'), plataforma_elevadora: trampilla, nima_requerido: nima, adr,
      importe_cliente: importe, importe_transportista: importeT,
      discrecion_comercial: discrecion, anotaciones_cliente: notas,
    }, paradas);
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    router.push(`/panel/envios?f=sin-asignar&nuevo=${encodeURIComponent(r.referencia_gx)}`);
    router.refresh();
  }

  // ---- Opciones de los desplegables (las del mockup)
  const optsMl: [string, string][] = [];
  for (let i = 1; i <= mlMax; i++) optsMl.push([String(i), `${i} ${i === 1 ? 'metro' : 'metros'} (equivale a ${Math.floor(i * 2.5)} europalets o ${Math.floor(i * 2)} americanos)`]);
  if (mlMax === 13) optsMl.push(['13.3', '13,3 metros — carga completa (equivale a 33 europalets o 26 americanos)']);
  const optsPeso: [string, string][] = [['0.2', 'De 0 a 200 kg'], ['0.4', 'De 200 a 400 kg'], ['0.6', 'De 400 a 600 kg'], ['0.8', 'De 600 a 800 kg'], ['1', 'De 800 kg a 1 tonelada']];
  for (let lo = 1, hi = 3; lo < pesoMax; hi += 2) { if (hi > pesoMax) hi = pesoMax; optsPeso.push([String(hi), `De ${lo} a ${hi} toneladas${hi === pesoMax ? ' (máximo)' : ''}`]); if (hi === pesoMax) break; lo = hi; }
  const mlTxt = optsMl.find(([v]) => v === ml)?.[1] ?? '';
  const pesoTxt = optsPeso.find(([v]) => v === peso)?.[1] ?? '';
  const camionTxt = trampilla ? 'Camión rígido con trampilla elevadora (8 m · 14 Tn)' : 'Tráiler tauliner (lona corredera)';
  const fechaTxt = fecha ? (fechaHasta && fechaHasta !== fecha ? `del ${fmtFecha(fecha)} al ${fmtFecha(fechaHasta)}` : fmtFecha(fecha)) : '';

  // ---- Avisos del paso 4 (los del mockup) --------------------------------------------
  // Verano (25 may – 15 sep): muchos almacenes hacen jornada intensiva.
  const enVerano = (() => { if (!fecha) return false; const [, m, d] = fecha.split('-').map(Number); return (m > 5 || (m === 5 && d >= 25)) && (m < 9 || (m === 9 && d <= 15)); })();
  // Festivo nacional dentro de los días de recogida (con el calendario se puede elegir uno).
  const festivosEnVentana = (() => {
    if (!fecha) return [] as string[];
    const out: string[] = []; const [a, m, d] = fecha.split('-').map(Number); const x = new Date(a, m - 1, d);
    while (iso(x) <= (fechaHasta || fecha)) { const k = iso(x); if (fest.has(k)) out.push(`${fmtFecha(k)} · ${nombresFestivos[k] ?? 'festivo'}`); x.setDate(x.getDate() + 1); }
    return out;
  })();
  const IcoAviso = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
  const IcoSol = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><line x1="12" y1="2.5" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="21.5" /><line x1="4.6" y1="4.6" x2="6" y2="6" /><line x1="18" y1="18" x2="19.4" y2="19.4" /><line x1="2.5" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="21.5" y2="12" /><line x1="4.6" y1="19.4" x2="6" y2="18" /><line x1="18" y1="6" x2="19.4" y2="4.6" /></svg>);
  const avisosPaso4 = (
    <>
      {!trampilla && (
        <div className="pt-aviso" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
          <strong>Envío en tráiler</strong>, asegúrate de que hay <strong>medios de carga</strong>. Si requieres trampilla (<strong>más caro y solo en camión rígido de 8 metros</strong>), añádela en el{' '}
          <a href="#" style={{ color: 'inherit', fontWeight: 800, textDecoration: 'underline' }} onClick={(ev) => { ev.preventDefault(); setNotasAbiertas(true); setPaso(2); window.scrollTo({ top: 0 }); }}>paso 2</a>.
        </div></div>
      )}
      {enVerano && (
        <div className="pt-aviso" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoSol /><div><strong>Revisa horarios de verano</strong> de los almacenes: la mayoría hacen <strong>7:00–15:00</strong>.</div></div>
      )}
      {festivosEnVentana.length > 0 && (
        <div className="pt-aviso error" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
          <strong>Festivo nacional en la fecha de carga.</strong> {festivosEnVentana.join(' · ')}. Puede que el almacén esté <strong>cerrado</strong> ese día: confírmalo con el punto de recogida.
        </div></div>
      )}
    </>
  );

  const cajaPrecio = (
    <div className="ptar-confirm-price">
      <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{importe > 0 ? eur(importe) : '—'}</span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">IVA (21%)</span><span className="v">{importe > 0 ? eur(importe * 0.21) : '—'}</span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{importe > 0 ? eur(importe * 1.21) : '—'}</span></div>
    </div>
  );

  return (
    <section className={`section active wiz-v2 wiz-s${Math.min(paso, 3)}`} id="sec-nueva-carga">
      <div className="sec-header"><h2>{enRuta ? `Cambiar ruta · #${be!.referencia_gx}` : base ? `Repetir envío · #${be!.referencia_gx}` : 'Nuevo envío'}</h2></div>
      {enviando && <Cargando texto={enRuta ? 'Guardando la ruta' : esCliente ? 'Enviando la solicitud' : 'Creando envío'} />}
      {base?.modo === 'repetir' && paso === 1 && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Se ha copiado todo del envío <strong>#{be!.referencia_gx}</strong> (ruta{esCliente ? ' y mercancía' : ', mercancía y precios'}) salvo la <strong>fecha</strong>. Revísalo y cambia lo que haga falta: se creará un envío <strong>nuevo</strong>.</div></div>
      )}
      {enRuta && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Cambia, quita o añade paradas y pulsa <strong>«Guardar ruta»</strong>. Las paradas que no cambies conservan su referencia y sus notas. {be!.estado !== 'programado' && be!.estado !== 'borrador' ? 'El transportista ya va hacia la carga: avísale del cambio. ' : ''}La mercancía, la fecha y el precio se cambian en «Modificar».</div></div>
      )}

      {errorCarga && <div className="pt-aviso error">No se han podido cargar los datos: {errorCarga}</div>}

      {!enRuta && <div className="wiz-bar">
        {['Ruta', 'Mercancía', esCliente ? 'Fecha' : 'Fecha y precio', 'Confirmar'].map((t, i) => (
          <div key={t} className={`wiz-step${paso === i + 1 ? ' act' : ''}${paso > i + 1 ? ' done' : ''}`}
               onClick={() => { if (paso > i + 1) { setAviso(null); setPaso(i + 1); } }}>
            <span className="wiz-n">{i + 1}</span><span>{t}</span>
          </div>
        ))}
      </div>}

      {paso < 4 && (
        <div className="ptar-card" data-ptar-mode="carga">
          <div className="form-2col">
            <div className="form-2col-main">
              <div className="ptar-grid">

                {paso === 1 && (<>
                  <div className="ptar-section-head">Cliente</div>
                  <div className="ptar-field ptar-field-full">
                    {enRuta || esCliente ? <div className="ptar-input-wrap ptar-picked"><IcoCliente /><input type="text" readOnly value={cliente ? `${cliente.nombre} · ${cliente.cif}` : ''} /></div> : <CampoCliente clientes={clientes} valor={cliente}
                      onElegir={(c) => { setCliente(c); const prin = c?.principal_id ? sitios.find((x) => x.id === c.principal_id && x.cliente_id === c.id) ?? null : null; setRecogidas((l) => l.map((p, i) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : (i === 0 && prin && !p.nuevo ? prin : null) }))); setEntregas((l) => l.map((p) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : null }))); }}
                      onNuevo={(c) => { setClientes((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre))); setCliente(c); }} />}
                  </div>

                  {esCliente && !base && operadores.length > 0 && (<>
                    <div className="ptar-section-head">¿Quién hace el transporte?</div>
                    <div className="ptar-field ptar-field-full">
                      <select className="ptar-select" aria-label="Quién hace el transporte" value={operador} onChange={(ev) => setOperador(ev.target.value)}>
                        <option value="">Dynamo (te pasamos el precio)</option>
                        {operadores.map((o) => <option key={o.id} value={o.id}>Mi operador: {o.nombre}</option>)}
                      </select>
                      {manual && <p className="ptar-admin-precio-note" style={{ marginTop: '0.4rem' }}>Envío con <strong>tu propio transportista</strong>: Dynamo no interviene en nada. La plataforma te sirve para organizarlo y sacar la <strong>orden de transporte</strong> en PDF.</p>}
                    </div>
                  </>)}
                  <div className="ptar-section-head">Ruta</div>
                  {recogidas.map((p, i) => (
                    <div key={p.k} className="ptar-field ptar-field-full">
                      <CampoSitio punto={p} numero={i + 1} sitios={sitiosCliente} deshabilitado={!cliente}
                        placeholder={i === 0 ? (esCliente ? 'Recogida · busca en tus sitios' : 'Recogida · busca en la agenda del cliente') : 'Otra recogida · busca en la agenda'}
                        onCambio={(c) => cambiar(p, c)} onQuitar={i > 0 ? () => quitar(p) : undefined} />
                    </div>
                  ))}
                  {entregas.map((p, i) => (
                    <div key={p.k} className="ptar-field ptar-field-full">
                      <CampoSitio punto={p} numero={recogidas.length + i + 1} sitios={sitiosCliente} deshabilitado={!cliente}
                        placeholder={i === entregas.length - 1 ? (esCliente ? 'Entrega · busca en tus sitios' : 'Entrega · busca en la agenda del cliente') : 'Otra entrega · busca en la agenda'}
                        onCambio={(c) => cambiar(p, c)} onQuitar={i < entregas.length - 1 ? () => quitar(p) : undefined} />
                    </div>
                  ))}
                  {total < 4 && (
                    <div className="ptar-field-full ptar-add-paradas-row">
                      <button type="button" className="ptar-add-parada" onClick={() => nuevaParada('carga')}><IcoMas /> Añadir recogida</button>
                      <button type="button" className="ptar-add-parada" onClick={() => nuevaParada('descarga')}><IcoMas /> Añadir entrega</button>
                    </div>
                  )}
                  {!manual && <div className="ptar-verif-note" style={{ marginTop: '0.5rem' }}>
                    <IcoEscudo />
                    <span>Todos nuestros transportistas están <strong>verificados</strong> y con la <strong>documentación en vigor</strong>.</span>
                  </div>}
                </>)}

                {paso === 2 && (<>
                  <div className="ptar-section-head ptar-sh-merca">Mercancía</div>
                  <div className="ptar-field-full">
                    <label className="ptar-mlabel" htmlFor="ne-merca">Tipo de mercancía</label>
                    <select id="ne-merca" className="ptar-select" value={paletizada ? 'p' : 'n'} onChange={(e) => setPaletizada(e.target.value === 'p')}>
                      <option value="p">Paletizada (mercancía general)</option>
                      <option value="n">No paletizada (maquinaria, perfiles, tubos, balas, paquetes…)</option>
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    <label className="ptar-mlabel" htmlFor="ne-ml">Metros lineales de la mercancía</label>
                    <select id="ne-ml" className="ptar-select" value={ml} onChange={(e) => setMl(e.target.value)}>
                      {optsMl.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    <label className="ptar-mlabel" htmlFor="ne-peso">Peso de la mercancía</label>
                    <select id="ne-peso" className="ptar-select" value={peso} onChange={(e) => setPeso(e.target.value)}>
                      {optsPeso.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    <label className="ptar-mlabel" htmlFor="ne-forma">Forma de carga</label>
                    <select id="ne-forma" className="ptar-select" value={forma} onChange={(e) => setForma(e.target.value)}>
                      {FORMAS.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="ptar-notes-wrap ptar-field-full">
                    <button type="button" className="ptar-notes-toggle" aria-expanded={notasAbiertas} onClick={() => setNotasAbiertas((v) => !v)}>
                      <span className="pnt-icon" aria-hidden="true">{notasAbiertas ? '−' : '+'}</span>
                      <strong>Añadir detalle de mercancía, nº de albarán/pedido, trampilla elevadora o NIMA</strong> (opcional)
                    </button>
                    {notasAbiertas && (
                      <div className="ptar-notes-body">
                        <div className="ptar-pair">
                          <Interruptor titulo="Trampilla elevadora" valor={trampilla}
                            onCambio={(v) => { setTrampilla(v); setMl(v ? '8' : '13.3'); setPeso(v ? '14' : '24'); }} />
                          <Interruptor titulo="Requiere NIMA" valor={nima} onCambio={setNima} />
                          <Interruptor titulo="Mercancía ADR" valor={adr} onCambio={setAdr} />
                        </div>
                        <div className="ptar-field" style={{ marginTop: '0.9rem' }}>
                          <label className="ptar-label" htmlFor="ne-ref">Nº de albarán/pedido del cliente</label>
                          <input id="ne-ref" type="text" className="ptar-select" placeholder="Ej. PED-0426 / ALB-1234" value={refCli} onChange={(e) => setRefCli(e.target.value)} />
                        </div>
                        <textarea maxLength={1000} rows={3} style={{ marginTop: '0.9rem' }} value={notas} onChange={(e) => setNotas(e.target.value)}
                          placeholder="Detalles que debamos saber (tipo de mercancía, acceso, dimensiones especiales, instrucciones de entrega…)" />
                        <div className="ptar-notes-counter"><span>{notas.length}</span> / 1000</div>
                      </div>
                    )}
                  </div>
                </>)}

                {paso === 3 && (<>
                  <div className="ptar-section-head ptar-sh-fecha">Fecha de recogida</div>
                  <div className="ptar-field-full">
                    <select className="ptar-select" aria-label="Días de recogida" value={urgencia}
                      onChange={(e) => { setUrgencia(e.target.value as 'dia' | 'estandar'); setFecha(''); }}>
                      <option value="dia">Fecha fija (un día concreto, más caro)</option>
                      <option value="estandar">Recogida de 1 a 3 días (más económica)</option>
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    <select className="ptar-select ptar-dia-naranja" aria-label="Fecha de recogida" value={dias.includes(fecha) ? fecha : (fecha ? 'otra' : '')}
                      onChange={(e) => { if (e.target.value !== 'otra') setFecha(e.target.value); }}>
                      <option value="" disabled>Elige la fecha de recogida</option>
                      {dias.map((d) => (
                        <option key={d} value={d}>{urgencia === 'estandar' ? `Del ${fmtFecha(d)} al ${fmtFecha(sumarHabiles(d, 2, fest))}` : fmtFecha(d)}</option>
                      ))}
                      {fecha && !dias.includes(fecha) && <option value="otra">{fechaTxt}</option>}
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    <label className="ptar-mlabel" htmlFor="ne-otra">¿Otro día? Elígelo en el calendario</label>
                    <input id="ne-otra" type="date" className="ptar-select" min={dias[0]} value={fecha && !dias.includes(fecha) ? fecha : ''}
                      onChange={(e) => setFecha(e.target.value)} />
                  </div>
                </>)}
              </div>
            </div>

            {paso === 3 && (
              <div className="form-2col-side">
                <div className="ptar-field ptar-field-full ptar-eta-field">
                  <div className="ptar-eta-box">
                    {fecha
                      ? <span><strong>Fecha de recogida:</strong> {fechaTxt}</span>
                      : <span className="ptar-eta-placeholder">Elige la fecha de recogida.</span>}
                  </div>
                </div>
                {manual ? (
                  <div className="ptar-field ptar-field-full ptar-admin-precio">
                    <div className="ptar-admin-precio-head">Precio con {nombreOp}</div>
                    <label className="ptar-admin-precio-lbl" htmlFor="ne-pop">Precio acordado con tu transportista (sin IVA) · opcional</label>
                    <input id="ne-pop" type="text" inputMode="decimal" placeholder="Ej. 450,00" value={precioOp} onChange={(ev) => setPrecioOp(ev.target.value)} />
                    <p className="ptar-admin-precio-note">Solo para tu control y para la orden de transporte. Dynamo no lo ve en ningún precio suyo.</p>
                  </div>
                ) : esCliente ? (
                  <div className="pt-aviso info" style={{ marginTop: '0.6rem' }}><div><strong>Te pasamos el precio en menos de 25 minutos</strong> (en horario de oficina). Te llegará a tu panel y, hasta que lo aceptes, no hay ningún compromiso.</div></div>
                ) : <>
                <div className="ptar-field ptar-field-full ptar-admin-precio">
                  <div className="ptar-admin-precio-head">Precios internos <span>· solo administración</span></div>
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-pc">Cliente (base sin IVA)</label>
                  <input id="ne-pc" type="text" inputMode="decimal" placeholder="Ej. 1.230,00" value={pc} onChange={(e) => setPc(e.target.value)} />
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-pt" style={{ marginTop: '0.6rem' }}>Transportista (base sin IVA) · opcional</label>
                  <input id="ne-pt" type="text" inputMode="decimal" placeholder="Ej. 1.050,00" value={pt} onChange={(e) => setPt(e.target.value)} />
                  <p className="ptar-admin-precio-note">Hasta que llegue el tarifador, el precio lo pone Dynamo a mano y queda marcado como <strong>fijado a mano</strong>.</p>
                </div>
                {cajaPrecio}
                </>}
              </div>
            )}
          </div>

          <div className="wiz-navwrap">
            <div className="wiz-nav">
              <button type="button" className="btn-ghost" onClick={enRuta ? () => router.push(`/panel/envios?ver=${be!.id}`) : atras}>{paso === 1 ? 'Cancelar' : '← Atrás'}</button>
              {enRuta
                ? <button type="button" className="btn-primary" onClick={guardarRuta} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar ruta'}</button>
                : <button type="button" className="btn-primary" onClick={siguiente}>{paso === 3 ? 'Ver resumen →' : 'Siguiente →'}</button>}
            </div>
            {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
          </div>
        </div>
      )}

      {paso === 4 && cliente && (
        <div className="ptar-confirm-card">
          <h3 className="ptar-section-head ptar-sh-conf">{esCliente ? 'Revisión' : 'Revisión y precio'}</h3>
          <div className="form-2col">
            <div className="form-2col-main">
              <div className="sum2">
                <div className="sum2-box">
                  <div className="sum2-cell sum2-full"><div className="sum2-k">Cliente</div><div className="sum2-v">{cliente.nombre} · {cliente.cif}</div></div>
                  {[...recogidas, ...entregas].map((p, i) => {
                    const s = (p.sitio ?? p.nuevo)!;
                    return (
                      <div key={p.k} className="sum2-cell sum2-full">
                        <div className="sum2-k">{i + 1}. {p.tipo === 'carga' ? 'Recogida' : 'Entrega'}{p.nuevo ? (p.nuevo.guardar ? ' · sitio nuevo (se guarda en la agenda)' : ' · dirección suelta') : ''}</div>
                        <div className="sum2-v">{s.nombre_empresa}</div>
                        <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>{direccionCompleta(s)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="sum2-box" style={{ marginTop: '0.6rem' }}>
                  <div className="sum2-cell sum2-full"><div className="sum2-k">Tipo de camión</div><div className="sum2-v">{camionTxt}</div></div>
                  <div className="sum2-grid">
                    <div className="sum2-cell"><div className="sum2-k">Metros lineales</div><div className="sum2-v">{mlTxt.split(' (')[0]}</div></div>
                    <div className="sum2-cell"><div className="sum2-k">Peso</div><div className="sum2-v">{pesoTxt}</div></div>
                    <div className="sum2-cell"><div className="sum2-k">Tipo de carga</div><div className="sum2-v">{forma}</div></div>
                    <div className="sum2-cell"><div className="sum2-k">Tipo</div><div className="sum2-v">{paletizada ? 'Paletizada' : 'No paletizada'}</div></div>
                    {nima && <div className="sum2-cell"><div className="sum2-k">Requiere NIMA</div><div className="sum2-v">Sí</div></div>}
                    {adr && <div className="sum2-cell"><div className="sum2-k">Mercancía ADR</div><div className="sum2-v">Sí</div></div>}
                  </div>
                  {notas && <div className="sum2-cell sum2-full"><div className="sum2-k">Anotaciones de la mercancía</div><div style={{ fontSize: 'var(--fs-m)', fontWeight: 600, color: 'var(--gray-700)', lineHeight: 1.4 }}>{notas}</div></div>}
                </div>
                <div className="sum2-box" style={{ marginTop: '0.6rem' }}>
                  <div className="sum2-grid">
                    <div className="sum2-cell"><div className="sum2-k">Fecha de recogida</div><div className="sum2-v">{fechaTxt}</div></div>
                    {refCli && <div className="sum2-cell"><div className="sum2-k">Su referencia</div><div className="sum2-v">{refCli}</div></div>}
                    {importeT !== null && <div className="sum2-cell"><div className="sum2-k">P. transportista</div><div className="sum2-v">{eur(importeT)}</div></div>}
                    {importeT !== null && <div className="sum2-cell"><div className="sum2-k">Margen</div><div className="sum2-v">{eur(importe - importeT)}</div></div>}
                  </div>
                </div>
                {avisosPaso4}
              </div>
            </div>
            <div className="form-2col-side">
              {manual
                ? <div className="pt-aviso info" style={{ marginBottom: 0 }}><div><strong>Transporte con {nombreOp}.</strong>{precioOp.trim() ? <> Precio acordado: <strong>{eur(num(precioOp))}</strong> (sin IVA).</> : null} Dynamo no interviene.</div></div>
                : esCliente
                ? <div className="pt-aviso info" style={{ marginBottom: 0 }}><div><strong>Precio:</strong> te lo pasamos en menos de 25 minutos (en horario de oficina) y lo aceptas desde el envío.</div></div>
                : cajaPrecio}
              <div className="ptar-discrecion">
                <label className="ptar-confirm-check">
                  <input type="checkbox" checked={discrecion} onChange={(e) => setDiscrecion(e.target.checked)} />
                  <span><strong>Discreción comercial</strong> (opcional): el conductor no dirá en la carga a quién va la mercancía ni en la entrega de dónde viene.</span>
                </label>
              </div>
              <div className="ptar-terms-box">
                {manual
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> queda programado con tu operador y puedes sacar la <strong>orden de transporte</strong> desde el envío.</p>
                  : esCliente
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Enviar solicitud»</strong> nos llega tu envío para ponerle precio. <strong>No hay compromiso</strong> hasta que aceptes el precio (y las condiciones generales).</p>
                  : <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> el envío queda <strong>programado</strong> y pasa a la pestaña <strong>Sin asignar transportista</strong>.</p>}
              </div>
              {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
              <div className="ptar-actions ptar-actions-confirm">
                <button type="button" className="btn-primary" onClick={crear} disabled={enviando}>{enviando ? (esCliente && !manual ? 'Enviando…' : 'Creando envío…') : esCliente && !manual ? 'Enviar solicitud' : 'Crear envío'}</button>
                <button type="button" className="btn-ghost" onClick={() => { setAviso(null); setPaso(3); }} disabled={enviando}>← Editar datos</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- Interruptor Sí/No (el de Trampilla/NIMA del mockup, regla 0-quater) --------
function Interruptor({ titulo, valor, onCambio }: { titulo: string; valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="ptar-field">
      <label className="ptar-label">{titulo}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No (más económico)</span><span className="tramp-on">Sí (más caro)</span></span>
      </label>
    </div>
  );
}

// ---- Buscador de cliente (con alta rápida) ----------------------------------------
function CampoCliente({ clientes, valor, onElegir, onNuevo }: {
  clientes: ClienteOpcion[]; valor: ClienteOpcion | null;
  onElegir: (c: ClienteOpcion | null) => void; onNuevo: (c: ClienteOpcion) => void;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [alta, setAlta] = useState(false);
  const [rs, setRs] = useState(''); const [cif, setCif] = useState(''); const [pais, setPais] = useState('ES');
  const [error, setError] = useState<string | null>(null); const [guardando, setGuardando] = useState(false);
  const lista = useMemo(() => {
    const w = norm(q.trim());
    return clientes.filter((c) => !w || norm(c.nombre + ' ' + c.cif).includes(w)).slice(0, 8);
  }, [clientes, q]);

  async function guardar() {
    setGuardando(true); setError(null);
    const r = await crearClienteRapido(rs, cif, pais);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onNuevo(r.cliente); setAlta(false); setRs(''); setCif('');
  }

  return (
    <>
      <div className={`ptar-input-wrap${valor ? ' ptar-picked' : ''}`}>
        <IcoCliente />
        <input type="text" placeholder="Cliente · busca por nombre o CIF" autoComplete="off" readOnly={!!valor}
          value={valor ? `${valor.nombre} · ${valor.cif}` : q}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
          onFocus={() => !valor && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
        {valor && <button type="button" className="ptar-clear" aria-label="Cambiar cliente" onClick={() => { onElegir(null); setQ(''); }}>✕</button>}
        {abierto && !valor && (
          <ul className="ptar-sug">
            {lista.map((c) => (
              <li key={c.id} onMouseDown={(e) => { e.preventDefault(); onElegir(c); setAbierto(false); }}>
                <strong>{c.nombre}</strong><span className="sug-dir">{c.cif}</span>
              </li>
            ))}
            {lista.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>No hay clientes con ese nombre o CIF.</li>}
            <li onMouseDown={(e) => { e.preventDefault(); setAlta(true); setRs(q); setAbierto(false); }}>
              <strong style={{ color: 'var(--purple)' }}>+ Dar de alta un cliente nuevo</strong>
            </li>
          </ul>
        )}
      </div>
      {alta && !valor && (
        <div className="ptar-admin-precio" style={{ marginTop: '0.6rem' }}>
          <div className="ptar-admin-precio-head">Cliente nuevo <span>· la ficha completa se rellena en Clientes</span></div>
          <label className="ptar-admin-precio-lbl" htmlFor="ne-rs">Razón social</label>
          <input id="ne-rs" type="text" value={rs} onChange={(e) => setRs(e.target.value)} placeholder="Ej. Marbex Industrial S.L." />
          <label className="ptar-admin-precio-lbl" htmlFor="ne-cif" style={{ marginTop: '0.6rem' }}>CIF / NIF</label>
          <input id="ne-cif" type="text" value={cif} onChange={(e) => setCif(e.target.value)} placeholder="Ej. B12345678" />
          <label className="ptar-admin-precio-lbl" htmlFor="ne-pais" style={{ marginTop: '0.6rem' }}>País</label>
          <SelectorPais id="ne-pais" valor={pais} onCambio={setPais} />
          {error && <div className="wiz-warn show">⚠ {error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Dar de alta'}</button>
            <button type="button" className="btn-ghost" onClick={() => { setAlta(false); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Buscador de sitio de la agenda del cliente (con sitio nuevo) -----------------
function CampoSitio({ punto, numero, sitios, deshabilitado, placeholder, onCambio, onQuitar }: {
  punto: Punto; numero: number; sitios: SitioOpcion[]; deshabilitado: boolean; placeholder: string;
  onCambio: (c: Partial<Punto>) => void; onQuitar?: () => void;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<SitioNuevo | null>(null);
  const elegido = punto.sitio ?? punto.nuevo;
  const lista = useMemo(() => {
    const w = norm(q.trim());
    return sitios.filter((s) => !w || norm([s.nombre_empresa, s.direccion, s.codigo_postal, s.poblacion, s.provincia].filter(Boolean).join(' ')).includes(w)).slice(0, 8);
  }, [sitios, q]);
  const rec = punto.tipo === 'carga';
  const malHorario = form?.horario ? validarHorario(form.horario) : null;
  const listo = form && form.nombre_empresa.trim() && form.poblacion.trim() && form.codigo_postal.trim() && !malHorario;

  return (
    <>
      <div className="ptar-route-row">
        <div className={`ptar-input-wrap${elegido ? ' ptar-picked' : ''}`}>
          <span className={`ptar-route-num ${rec ? 'rec' : 'ent'}`}>{numero}</span>
          {rec ? <IcoPin /> : <IcoFlecha />}
          <input type="text" autoComplete="off" placeholder={deshabilitado ? 'Elige antes el cliente' : placeholder}
            disabled={deshabilitado} readOnly={!!elegido}
            value={elegido ? textoSitio(elegido) + (punto.parada_id || !punto.nuevo ? '' : punto.nuevo.guardar ? ' (nuevo)' : ' (dirección suelta)') : q}
            onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
            onFocus={() => !elegido && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
          {elegido && <button type="button" className="ptar-clear" aria-label="Cambiar sitio" onClick={() => { onCambio({ sitio: null, nuevo: null }); setQ(''); }}>✕</button>}
          {abierto && !elegido && !deshabilitado && (
            <ul className="ptar-sug">
              {lista.map((s) => (
                <li key={s.id} onMouseDown={(e) => { e.preventDefault(); onCambio({ sitio: s, nuevo: null }); setAbierto(false); }}>
                  {s.es_almacen_dynamo
                    ? <span className="sug-chip sug-chip-dynamo">Almacén</span>
                    : <span className="sug-chip sug-chip-saved">Guardado</span>}
                  <strong>{s.nombre_empresa}</strong>
                  <span className="sug-dir">{direccionCompleta(s)}</span>
                </li>
              ))}
              {lista.length === 0 && <li style={{ cursor: 'default', color: 'var(--gray-500)' }}>Este cliente aún no tiene sitios con ese nombre.</li>}
              <li onMouseDown={(e) => { e.preventDefault(); setForm({ ...VACIO, nombre_empresa: q }); setAbierto(false); }}>
                <strong style={{ color: 'var(--purple)' }}>+ Crear nuevo sitio</strong>
              </li>
            </ul>
          )}
        </div>
        {onQuitar && <button type="button" className="ptar-parada-del" aria-label="Quitar esta parada" onClick={onQuitar}><IcoMenos /></button>}
      </div>

      {form && !elegido && (
        <div className="ptar-admin-precio" style={{ marginTop: '0.6rem' }}>
          <div className="ptar-admin-precio-head">Sitio nuevo de {rec ? 'recogida' : 'entrega'}</div>
          <Campo l="Empresa" v={form.nombre_empresa} on={(v) => setForm({ ...form, nombre_empresa: v })} ph="Ej. Cerámicas del Sur S.L." />
          <Campo l="Dirección (calle y número)" v={form.direccion} on={(v) => setForm({ ...form, direccion: v })} ph="Ej. C/ Industria, 4" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
            <Campo l="Código postal" v={form.codigo_postal} on={(v) => setForm({ ...form, codigo_postal: v })} ph="41016" />
            <Campo l="Población" v={form.poblacion} on={(v) => setForm({ ...form, poblacion: v })} ph="Sevilla" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <Campo l="Provincia" v={form.provincia} on={(v) => setForm({ ...form, provincia: v })} ph="Sevilla" />
            <div>
              <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>País</label>
              <SelectorPais valor={form.pais_codigo_iso} onCambio={(v) => setForm({ ...form, pais_codigo_iso: v })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <Campo l="Persona de contacto · opcional" v={form.contacto} on={(v) => setForm({ ...form, contacto: v })} ph="Ej. Lucía (muelle)" />
            <div>
              <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem', display: 'block' }}>Teléfono · opcional</label>
              <CampoTelefono valor={form.telefono} onCambio={(v) => setForm({ ...form, telefono: v })} />
            </div>
          </div>
          <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>Tipo de lugar</label>
          <select className="ptar-select" value={form.tipo_lugar} onChange={(e) => setForm({ ...form, tipo_lugar: e.target.value })}>
            {TIPOS_LUGAR.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem' }}>Horario</label>
          {form.horario ? (
            <>
              <EditorHorario valor={form.horario} onCambio={(g) => setForm({ ...form, horario: g })} />
              <button type="button" className="btn-ghost" style={{ marginTop: '0.3rem' }} onClick={() => setForm({ ...form, horario: null })}>Usar el de por defecto</button>
              {!form.guardar && <p className="ptar-admin-precio-note">El horario solo se guarda si el sitio se guarda en la agenda.</p>}
            </>
          ) : (
            <p className="ptar-admin-precio-note" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              El de por defecto: L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00.
              <button type="button" className="btn-ghost" style={{ padding: '0.2rem 0.6rem' }} onClick={() => setForm({ ...form, horario: HORARIO_POR_DEFECTO.map((g) => ({ dias: [...g.dias], tramos: g.tramos.map((t) => ({ ...t })) })) })}>Cambiarlo</button>
            </p>
          )}
          <label className="ptar-confirm-check" style={{ marginTop: '0.7rem' }}>
            <input type="checkbox" checked={form.guardar} onChange={(e) => setForm({ ...form, guardar: e.target.checked })} />
            <span>Guardarlo en la <strong>agenda de sitios</strong> del cliente</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" disabled={!listo}
              onClick={() => { if (listo) { onCambio({ sitio: null, nuevo: form }); setForm(null); } }}>Usar este sitio</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
          {!listo && <p className="ptar-admin-precio-note">{malHorario ?? 'Empresa, código postal y población son obligatorios.'}</p>}
        </div>
      )}
    </>
  );
}

function Campo({ l, v, on, ph }: { l: string; v: string; on: (v: string) => void; ph?: string }) {
  return (
    <div>
      <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem', display: 'block' }}>{l}</label>
      <input type="text" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
