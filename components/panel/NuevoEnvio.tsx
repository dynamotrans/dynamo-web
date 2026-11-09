'use client';

// "Nuevo envío": asistente de 4 pasos con el diseño de dashboard.html (#sec-nueva-carga):
// Ruta · Mercancía · Fecha y precio · Confirmar. Mismas clases del mockup (ptar-*, wiz-*,
// sum2-*, alm-price). Etapa A: lo usa Dynamo para un cliente y pone el precio a mano;
// el tarifador llega al final (y el precio lo calculará el servidor, nunca el navegador).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import { crearEnvio, cambiarRuta, crearEnvioCliente, crearEnvioManual, guardarEdicionEnvio, diasAbiertosDe, comprobarCobertura, sitiosDelCliente, datosEditablesDeSitios, guardarEdicionesSitios, kmRuta, ultimosPreciosRuta, type UltimoPrecioRuta, type ParadaNueva, type HorarioSitioAviso } from '@/app/panel/(app)/nuevo-envio/acciones';
import { calcularTarifa, compraTarifador, tablaInterna } from '@/lib/tarifador';
import { BloquePrecio, PreciosInternosTabla } from './nuevoEnvio/PrecioSugerido';
import { fecha as fmtFecha, euros as eur, hoyMadrid, porcentaje } from '@/lib/formato';
import Cargando from '@/components/Cargando';
import { NEGOCIACION } from '@/lib/envios';
import { HORARIO_POR_DEFECTO, VERANO_GENERICO, tramosDe, enTemporada, mmddTxt } from '@/lib/horarios';
import { CONTACTO } from '@/lib/atencion';
import { Base, CardEdit, ClienteOpcion, DatosSitios, EdicionSitio, FORMAS, IcoCliente, IcoEscudo, Props, Punto, SitioNuevo, VACIO, decimal, iso, num, opcionCercana, primerDia, resolverFicha, sumarHabiles } from './nuevoEnvio/comun';
export type { ClienteOpcion, SitioOpcion, Base, ReglasPrecio } from './nuevoEnvio/comun';
import { Interruptor } from './nuevoEnvio/Interruptor';
import AvisoCorte from './nuevoEnvio/AvisoCorte';
import PistaScroll from './nuevoEnvio/PistaScroll';
import { CampoCliente } from './nuevoEnvio/CampoCliente';
import CampoOperador from './nuevoEnvio/CampoOperador';
import { CampoSitio } from './nuevoEnvio/CampoSitio';
import { FichasSitios } from './nuevoEnvio/FichasSitios';
import AvisoCierreSitio from './nuevoEnvio/AvisoCierreSitio';
import { SelectorUrgencia } from './nuevoEnvio/SelectorUrgencia';
import Modal from './Modal';
import CondicionesGenerales from '@/components/CondicionesGenerales';
import Req from '@/components/Req';

export default function NuevoEnvio({ clientes: clientesIni, sitios: sitiosIni, festivos, nombresFestivos = {}, error: errorCarga, base, esCliente = false, clienteFijo = false, operadores = [], esMaster = false, reglas = null }: Props) {
  // El campo «Cliente» solo tiene sentido en la vista de gestión de Dynamo: un cliente,
  // o el equipo con «Ver como» un cliente, ya tiene el cliente decidido y no lo ve.
  const sinCampoCliente = esCliente || clienteFijo;
  // Fechas libres (cualquier fecha, también hoy, pasada o saltándose las horas de corte;
  // urgencias e imprevistos): SOLO el Admin Master, también en la vista de un cliente
  // (usuario, 2026-11-09). Los clientes y los empleados siguen con los cortes. Al elegir
  // una fecha fuera de las reglas sale el aviso ámbar de abajo.
  const fechaLibre = esMaster && !esCliente;
  const be = base?.envio;
  const enRuta = base?.modo === 'ruta';       // solo la ruta (queda para los envíos manuales)
  const editar = base?.modo === 'editar';     // modificarlo ENTERO con el asistente (ficha → «Modificar»)
  const puntoDe = (p: Base['paradas'][number], k: number): Punto => {
    const s = p.sitio_id ? sitios.find((x) => x.id === p.sitio_id) ?? null : null;
    const nuevo: SitioNuevo | null = s ? null : { ...VACIO, nombre_empresa: p.nombre_empresa ?? '', direccion: p.direccion ?? '', codigo_postal: p.codigo_postal ?? '',
      poblacion: p.poblacion ?? '', provincia: p.provincia ?? '', pais_codigo_iso: p.pais_codigo_iso ?? 'ES', guardar: false };
    return { k, tipo: p.tipo, sitio: s, nuevo, parada_id: enRuta || editar ? p.id : undefined };
  };
  const router = useRouter();
  const refrescar = useRefrescar();
  const fest = useMemo(() => new Set(festivos), [festivos]);
  // Los sitios que hay en pantalla: los almacenes de Dynamo y los del cliente elegido (los
  // de cada cliente se piden al elegirlo; en la vista del cliente ya vienen todos los suyos).
  const [sitios, setSitios] = useState(sitiosIni);
  const sitiosRef = useRef(sitiosIni); sitiosRef.current = sitios;
  const [paso, setPaso] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);

  // ---- Paso 1: cliente y ruta
  const [clientes, setClientes] = useState(clientesIni);
  const [cliente, setCliente] = useState<ClienteOpcion | null>(esCliente || (!be && clientesIni.length === 1) ? clientesIni[0] ?? null : be ? clientesIni.find((c) => c.id === be.cliente_id) ?? null : null);
  const sigK = useRef(10);
  const calRef = useRef<HTMLInputElement>(null);   // campo de calendario que aparece al elegir «otra fecha»
  const [modoCal, setModoCal] = useState(false);   // true mientras se elige la fecha en el calendario
  useEffect(() => { if (modoCal && calRef.current) { calRef.current.focus(); try { calRef.current.showPicker(); } catch { /* en iPhone el usuario toca el campo para abrirlo */ } } }, [modoCal]);
  // La ruta es UNA sola lista ordenada (usuario, 2026-11-08): recogidas y entregas pueden
  // ALTERNARSE libremente por el medio (recojo, entrego, recojo, entrego…). Las dos únicas
  // reglas, las mismas que impone la base de datos (validar_ruta_envio): la primera parada
  // siempre es una RECOGIDA y la última siempre una ENTREGA.
  const [puntos, setPuntos] = useState<Punto[]>(() => {
    const l = (base?.paradas ?? []).map((p, i) => puntoDe(p, 100 + i));   // en su orden real (admite intercaladas)
    // El sitio principal del cliente (la estrella de Sitios) entra solo como primera recogida
    // SIEMPRE que el cliente ya venga elegido al cargar: en la vista del propio cliente y
    // también cuando Dynamo crea el envío desde «Ver como» (si el gestor elige el cliente a
    // mano, lo hace el onCambio del buscador de clientes).
    const cliIni = esCliente || (!be && clientesIni.length === 1) ? clientesIni[0] : null;
    const prin = cliIni?.principal_id ? sitios.find((x) => x.id === cliIni.principal_id && x.cliente_id === cliIni.id) ?? null : null;
    return l.length >= 2 ? l : [{ k: 1, tipo: 'carga', sitio: prin, nuevo: null }, { k: 2, tipo: 'descarga', sitio: null, nuevo: null }];
  });
  const recogidas = puntos.filter((p) => p.tipo === 'carga');   // derivadas (avisos de horario, etc.)
  const total = puntos.length;

  // ---- Paso 2: mercancía
  const [paletizada, setPaletizada] = useState(be ? be.paletizado !== false : true);
  const [plataforma, setPlataforma] = useState(!!be?.requiere_plataforma_elevadora);
  const mlMax = plataforma ? 8 : 13;
  const pesoMax = plataforma ? 14 : 24;
  const [ml, setMl] = useState(() => opcionCercana(be?.metros_lineales, be?.requiere_plataforma_elevadora ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13.3'], be?.requiere_plataforma_elevadora ? '8' : '13.3'));
  const [peso, setPeso] = useState(() => opcionCercana(be?.toneladas, ['0.2', '0.4', '0.6', '0.8', '1', '3', '5', '7', '9', '11', '13', ...(be?.requiere_plataforma_elevadora ? ['14'] : ['15', '17', '19', '21', '23', '24'])], be?.requiere_plataforma_elevadora ? '14' : '24'));
  const [forma, setForma] = useState(() => {
    if (!be) return 'Lateral';
    const t = [be.carga_lateral && 'lateral', be.carga_trasera && 'trasera', be.carga_techo && 'techo'].filter(Boolean) as string[];
    return FORMAS.find((f) => { const fl = f.toLowerCase(); return t.length > 0 && t.every((x) => fl.includes(x)) && fl.split(/,| y /).length === t.length; }) ?? 'Lateral';
  });
  // NIMA por defecto del cliente (su ficha): los envíos de ese cliente nacen con el
  // conmutador activado; al editar manda lo que tenga el envío (usuario, 2026-11-09).
  const [nima, setNima] = useState(be ? !!be.requiere_nima : !!((esCliente || clientesIni.length === 1) && clientesIni[0]?.nima));
  const [adr, setAdr] = useState(!!be?.adr);
  const [refCli, setRefCli] = useState(editar ? (be?.referencia_cliente ?? '') : '');
  // Sin campo propio desde 2026-11-08 (decisión del usuario): se conserva lo que el envío
  // ya tuviera en anotaciones al editar, y lo nuevo va en Notas/Nº de pedido o en la cita.
  const [notas] = useState(be?.anotaciones_cliente ?? '');
  // La CITA PREVIA vive ahora POR SITIO en el paso 4 (usuario, 2026-11-09): su texto va
  // a las anotaciones de esa parada, no a las del envío.
  const notasEnvio = notas;
  const [notasAbiertas, setNotasAbiertas] = useState(!!(be && (be.requiere_plataforma_elevadora || be.requiere_nima || be.adr || be.anotaciones_cliente)));

  // ---- Paso 3: fecha y precio
  // Al EDITAR, el tipo de fecha sale de la ventana guardada (un día → fija; 2 días hábiles
  // en grupaje → corta; el resto → estándar); si no se toca nada, las fechas no cambian.
  const urgenciaIni = useMemo<'dia' | 'estandar' | 'corta'>(() => {
    if (!editar || !be?.fecha_carga_desde) return 'estandar';
    const hasta = be.fecha_carga_hasta;
    if (!hasta || hasta <= be.fecha_carga_desde) return 'dia';
    const fst = new Set(festivos);
    let n = 1;
    for (let d = be.fecha_carga_desde; d < hasta && n < 6; n++) d = sumarHabiles(d, 1, fst);
    const grup = (be.metros_lineales ?? 13.3) < 13 - 0.01;
    return n === 2 && grup ? 'corta' : 'estandar';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [urgencia, setUrgencia] = useState<'dia' | 'estandar' | 'corta'>(urgenciaIni);
  const [fecha, setFecha] = useState(editar ? (be?.fecha_carga_desde ?? '') : '');
  const [faltaFecha, setFaltaFecha] = useState(false);   // se intentó avanzar sin elegir fecha → marca el campo en rojo
  // El precio SUGERIDO del tarifador (borrador) rellena estos campos por defecto; en cuanto
  // Dynamo teclea uno a mano, ese ya no se vuelve a pisar.
  const [pc, setPc] = useState(esCliente ? '' : (be ? decimal(be.importe_cliente) : ''));
  const [pt, setPt] = useState(esCliente ? '' : (be ? decimal(be.importe_transportista) : ''));
  const [pcTocado, setPcTocado] = useState(!!be);
  const [ptTocado, setPtTocado] = useState(!!be);
  const [neg, setNeg] = useState<number>(be?.negociacion_pct ?? 10);

  // ---- Envío MANUAL (el cliente, o Dynamo en su vista): con un operador propio del
  // cliente, Dynamo no interviene.
  const [operador, setOperador] = useState('');
  const [precioOp, setPrecioOp] = useState('');
  const manual = sinCampoCliente && !!operador;
  const nombreOp = operadores.find((o) => o.id === operador)?.nombre ?? '';

  // ---- Paso 4
  const [discrecion, setDiscrecion] = useState(!!be?.discrecion_comercial);
  // Doble confirmación al crear un envío (Dynamo): modal con costes de cancelación +
  // condiciones generales, como en el mockup. Hay que marcar el check para confirmar.
  const [revisarLegal, setRevisarLegal] = useState(false);
  const [aceptaLegal, setAceptaLegal] = useState(false);
  // Se pulsó «Confirmar envío» sin marcar la casilla: la casilla y su texto se ponen en rojo.
  const [faltaLegal, setFaltaLegal] = useState(false);
  useEffect(() => { if (!revisarLegal) setFaltaLegal(false); }, [revisarLegal]);
  const [verCondiciones, setVerCondiciones] = useState(false);
  // Días que abre cada sitio de la agenda que se usa de recogida (se piden al llegar al paso 4).
  const [abiertosSitio, setAbiertosSitio] = useState<Record<string, HorarioSitioAviso>>({});
  const [veranoGen, setVeranoGen] = useState(VERANO_GENERICO);
  const idsRecogida = recogidas.map((p) => p.sitio?.id).filter(Boolean).join(',');
  useEffect(() => {
    if (paso < 3) return;
    let vivo = true;
    diasAbiertosDe(idsRecogida ? idsRecogida.split(',') : []).then((r) => { if (vivo) { setAbiertosSitio(r.sitios); setVeranoGen(r.generico); } }).catch(() => {});
    return () => { vivo = false; };
  }, [paso, idsRecogida]);
  const [enviando, setEnviando] = useState(false);

  // Aviso flotante breve (~3 s): p. ej. el cambio de capacidad al activar/desactivar la
  // plataforma elevadora (tráiler 13,3 m / 24 Tn ↔ rígido 8 m / 14 Tn).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function avisar(txt: string) {
    setToast(txt);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ---- Fichas de sitio editables en la confirmación (como el mockup): se piden los datos
  // de los sitios de la agenda que hay en la ruta al llegar al paso 4, para poder corregir
  // ahí lo que falte (horario, teléfono de contacto…). Lo tocado va en `edicSitios`.
  const [datosSitios, setDatosSitios] = useState<DatosSitios>({});
  const [edicSitios, setEdicSitios] = useState<Record<number, CardEdit>>({});
  // Puntos con datos obligatorios del sitio sin rellenar (teléfono, email; empresa si es
  // nuevo). Se marca al intentar crear: las tarjetas se abren solas y pintan en rojo.
  const [faltasSitios, setFaltasSitios] = useState<Set<number>>(new Set());
  const idsSitios = puntos.map((p) => p.sitio?.id).filter(Boolean).join(',');
  useEffect(() => {
    if (paso !== 4 || !idsSitios) return;
    let vivo = true;
    datosEditablesDeSitios(idsSitios.split(',')).then((r) => { if (vivo) setDatosSitios(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [paso, idsSitios]);

  // El aviso de "falta tal dato" se borra en cuanto se toca cualquier cosa.
  useEffect(() => { setAviso(null); }, [cliente, puntos, ml, peso, fecha, pc, pt, urgencia]);

  // GRUPAJE (no llega al tráiler completo): sin fecha fija; ventanas de 1 a 4 (estándar)
  // o 1 a 2 (corta, más cara). Carga COMPLETA: 1 a 3 o fecha fija. Si al cambiar los
  // metros la opción elegida deja de existir, vuelve a la estándar.
  const esGrupaje = (Number(ml) || 0) < mlMax - 0.01;
  useEffect(() => {
    if ((esGrupaje && urgencia === 'dia') || (!esGrupaje && urgencia === 'corta')) setUrgencia('estandar');
  }, [esGrupaje]); // eslint-disable-line react-hooks/exhaustive-deps
  const ventanaDias = urgencia === 'dia' ? 1 : urgencia === 'corta' ? 2 : esGrupaje ? 4 : 3;
  const fechaHasta = fecha ? (ventanaDias > 1 ? sumarHabiles(fecha, ventanaDias - 1, fest) : fecha) : '';
  const dias = useMemo(() => {
    const out: string[] = []; let d = primerDia(urgencia, fest, { fija: reglas?.corte_fija_hora, ventana: reglas?.corte_ventana_hora });
    for (let i = 0; i < 10; i++) { out.push(d); d = sumarHabiles(d, 1, fest); }
    return out;
  }, [urgencia, fest, reglas]);
  // La fecha SIEMPRE válida respecto al corte (usuario, 2026-11-09): al abrir el formulario
  // ya viene puesto el primer día posible (con la ventana estándar por defecto), y si al
  // cambiar el tipo de fecha (fija/ventana/corta) la elegida ya no llega, salta sola al
  // primer día hábil del tipo nuevo. Al editar no se toca (la fecha del envío manda), y el
  // Master con fechas libres solo recibe el prerrelleno inicial.
  useEffect(() => {
    if (editar) return;
    if (!fecha) { setFecha(dias[0]); return; }
    if (!fechaLibre && fecha < dias[0]) setFecha(dias[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corrige solo cuando cambia el primer día posible (tipo de fecha), no al teclear la fecha
  }, [dias[0], editar, fechaLibre]);

  const sitiosCliente = useMemo(
    () => sitios.filter((s) => s.es_almacen_dynamo || (cliente && s.cliente_id === cliente.id)),
    [sitios, cliente]);

  const importe = num(pc);
  const importeT = pt.trim() ? num(pt) : null;

  // ---- Precio sugerido (tarifador en BORRADOR, números provisionales) ----------------
  // Los km de la ruta se piden al servidor (caché de km reales → coordenadas → 300/tramo)
  // con un pequeño retardo para no pedir en cada tecla; el precio se calcula aquí.
  const [kmInfo, setKmInfo] = useState<{ km: number; estimado: boolean } | null>(null);
  const [ultimos, setUltimos] = useState<{ mismo: UltimoPrecioRuta; todos: UltimoPrecioRuta } | null>(null);
  const puntosRuta = puntos;
  const rutaCompleta = puntosRuta.length >= 2 && puntosRuta.every((p) => p.sitio || p.nuevo);
  const claveRuta = puntosRuta.map((p) => p.sitio?.id ?? `${p.nuevo?.codigo_postal ?? ''}·${p.nuevo?.pais_codigo_iso ?? ''}`).join('|');
  const cpDe = (p?: Punto) => p ? (p.sitio?.codigo_postal ?? p.nuevo?.codigo_postal ?? '') : '';
  const paisDe = (p?: Punto) => p ? (p.sitio?.pais_codigo_iso ?? p.nuevo?.pais_codigo_iso ?? '') : '';
  const cpO = cpDe(puntos[0]), paisO = paisDe(puntos[0]);
  const cpD = cpDe(puntos[puntos.length - 1]), paisD = paisDe(puntos[puntos.length - 1]);
  useEffect(() => {
    if (!rutaCompleta) { setKmInfo(null); setUltimos(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      kmRuta(puntosRuta.map((p) => ({ sitio_id: p.sitio?.id ?? null,
        cp: p.sitio?.codigo_postal ?? p.nuevo?.codigo_postal ?? null,
        pais: p.sitio?.pais_codigo_iso ?? p.nuevo?.pais_codigo_iso ?? null, lat: null, lon: null })))
        .then((r) => { if (vivo) setKmInfo(r); })
        .catch(() => { if (vivo) setKmInfo({ km: 300 * (puntosRuta.length - 1), estimado: true }); });
      // La tabla de precios internos (últimos de esta ruta): solo Dynamo, nunca el cliente.
      if (!esCliente && cpO && cpD) {
        ultimosPreciosRuta(cliente?.id ?? null, cpO, paisO, cpD, paisD)
          .then((r) => { if (vivo) setUltimos(r); }).catch(() => { if (vivo) setUltimos(null); });
      }
    }, 600);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRuta, rutaCompleta, cliente?.id]);
  const tarifa = useMemo(() => {
    if (!kmInfo || !rutaCompleta || manual) return null;
    return calcularTarifa({ km: kmInfo.km, puntos: puntosRuta.length,
      tiposSitio: puntosRuta.map((p) => p.sitio?.tipo ?? p.nuevo?.tipo_sitio ?? 'almacen_nave'),
      ml: Number(ml) || 0, peso: Number(peso) || 0, mlMax, pesoMax,
      paletizada, techo: forma.toLowerCase().includes('techo'), plataforma, nima, adr,
      urgencia, fecha: fecha || null, primerDia: dias[0], hoy: hoyMadrid(), festivos });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kmInfo, claveRuta, rutaCompleta, manual, ml, peso, mlMax, pesoMax, paletizada, forma, plataforma, nima, adr, urgencia, fecha, dias, festivos]);
  // Tabla «Precios internos» (mockup): compra del tarifador (mock 72-84 % por hash de la
  // ruta), «Aplicado · media auto» y margen. Y el autorrelleno: venta = Aplicado, compra =
  // la más baja de la tabla; lo tecleado a mano no se pisa.
  const hoyStr = hoyMadrid();
  const tarCompra = tarifa ? compraTarifador(tarifa.neto) : 0;
  const interna = useMemo(() => (!esCliente && tarifa && ultimos)
    ? tablaInterna(tarifa.neto, tarCompra, ultimos.mismo, ultimos.todos, hoyStr) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarifa?.neto, tarCompra, ultimos, hoyStr, esCliente]);
  useEffect(() => {
    if (esCliente || !tarifa) return;
    const v = interna?.vApl || tarifa.neto;
    const c = interna?.compraMin || tarCompra;
    if (!pcTocado && v > 0) setPc(decimal(v));
    if (!ptTocado && c > 0) setPt(decimal(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifa?.neto, interna?.vApl, interna?.compraMin, esCliente]);
  const fechaPasada = !!fecha && fecha < hoyStr && urgencia === 'dia';
  const elegirAlternativa = (u: 'dia' | 'estandar' | 'corta', f: string) => { setUrgencia(u); setFecha(f); setModoCal(false); };

  // El + de una fila añade otra parada JUSTO DEBAJO, del mismo tipo (luego se puede
  // alternar con la pastilla). Añadir tras la última entrega deja la nueva como destino.
  function nuevaParada(tras: Punto) {
    if (total >= 4) return;
    setPuntos((l) => {
      const i = l.findIndex((x) => x.k === tras.k);
      if (i < 0) return l;
      const c = [...l]; c.splice(i + 1, 0, { k: sigK.current++, tipo: tras.tipo, sitio: null, nuevo: null }); return c;
    });
  }
  function cambiar(p: Punto, cambios: Partial<Punto>) {
    // Si se cambia el sitio, ya no es la parada que había (en «Cambiar ruta»).
    setPuntos((l) => l.map((x) => (x.k === p.k ? { ...x, ...cambios, ...('sitio' in cambios || 'nuevo' in cambios ? { parada_id: undefined } : {}) } : x)));
  }
  function quitar(p: Punto) {
    setPuntos((l) => {
      const i = l.findIndex((x) => x.k === p.k);
      return i > 0 && i < l.length - 1 ? l.filter((x) => x.k !== p.k) : l;   // la 1.ª y la última no se quitan
    });
  }
  // Pulsar la pastilla del nº alterna la parada entre recogida y entrega EN SU SITIO.
  // Solo las intermedias: la primera siempre es recogida y la última siempre entrega.
  function alternarTipo(p: Punto) {
    setPuntos((l) => {
      const i = l.findIndex((x) => x.k === p.k);
      if (i <= 0 || i >= l.length - 1) return l;
      return l.map((x, j) => (j === i ? { ...x, tipo: x.tipo === 'carga' ? 'descarga' as const : 'carga' as const, parada_id: undefined } : x));
    });
  }
  // Reordenar la ruta arrastrando el asa ≡ (Pointer Events: vale con ratón y con el dedo),
  // por TODA la ruta. La lista se reordena en vivo; un movimiento que dejara la primera
  // parada sin ser recogida o la última sin ser entrega no se aplica.
  const [arrastrando, setArrastrando] = useState<number | null>(null);   // k del punto en el aire
  function empezarArrastre(e: React.PointerEvent, p: Punto) {
    e.preventDefault();
    setArrastrando(p.k);
    const mover = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-parada]') as HTMLElement | null;
      if (!el) return;
      const k = Number(el.dataset.parada);
      if (!Number.isFinite(k) || k === p.k) return;
      setPuntos((l) => {
        const a = l.findIndex((x) => x.k === p.k), b = l.findIndex((x) => x.k === k);
        if (a < 0 || b < 0 || a === b) return l;
        const c = [...l]; c.splice(b, 0, ...c.splice(a, 1));
        return c[0].tipo === 'carga' && c[c.length - 1].tipo === 'descarga' ? c : l;
      });
    };
    const soltar = () => {
      setArrastrando(null);
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar); window.addEventListener('pointercancel', soltar);
  }
  const asaDe = (p: Punto) => puntos.length > 2 ? (
    <span className="ptar-asa" title="Arrastra para cambiar el orden" aria-label="Arrastra para cambiar el orden"
      onPointerDown={(e) => empezarArrastre(e, p)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
    </span>
  ) : undefined;

  // ---- Validación por paso
  function errorPaso(n: number): string | null {
    if (n === 1) {
      if (!cliente) return 'Elige el cliente del envío.';
      const todos = puntos;
      if (todos.some((p) => !p.sitio && !p.nuevo)) return 'Elige la recogida y la entrega (de la lista o creando el sitio).';
    }
    if (n === 2 && (!ml || !peso)) return 'Indica los metros lineales y el peso.';
    if (n === 3) {
      if (!fecha) return 'Elige la fecha de recogida.';
      // La hora de corte manda: nadie elige un primer día que ya no llega. Quedan fuera el
      // envío manual (lo mueve el operador del cliente, sin cortes de Dynamo), las fechas
      // libres del Master y, al editar, una fecha que no se ha tocado.
      if (!manual && !fechaLibre && fecha < dias[0] && !(editar && fecha === (be?.fecha_carga_desde ?? ''))) {
        const corteTxt = urgencia === 'estandar' ? (reglas?.corte_ventana_hora ?? 14) : (reglas?.corte_fija_hora ?? 12);
        return `Esa fecha ya no llega (el corte de las ${corteTxt}:00 ha pasado): el primer día de carga posible es el ${fmtFecha(dias[0])}. Elige otra fecha.`;
      }
      if (!esCliente && !manual && !(importe > 0)) return 'Pon el precio del cliente (base sin IVA).';
      if (!esCliente && !manual && importeT !== null && !(importeT >= 0)) return 'El precio del transportista no es un número válido.';
    }
    return null;
  }
  // Cobertura: tras la ruta (paso 1) y tras la mercancía (paso 2, que ya dice si es
  // completo o grupaje: hay sitios a los que solo vamos con camión completo).
  const [comprobando, setComprobando] = useState(false);
  async function coberturaError(n: number): Promise<string | null> {
    if (n !== 1 && n !== 2) return null;
    const paradas = puntos.map((p, i) => {
      const x = p.sitio ?? p.nuevo;
      return { orden: i + 1, tipo: p.tipo, pais: x?.pais_codigo_iso || 'ES', codigo_postal: x?.codigo_postal ?? '', nombre: x?.nombre_empresa ?? '' };
    });
    setComprobando(true);
    const r = await comprobarCobertura(paradas, n === 2 ? (ml === '13.3' ? 'completa' : 'grupaje') : null).catch(() => []);
    setComprobando(false);
    const malos = r.filter((x) => x.efecto === 'bloquea' || (x.efecto === 'solo_admin' && esCliente));
    if (!malos.length) return null;
    return `Esta ruta no la podemos hacer: ${[...new Set(malos.map((x) => `${x.punto}: ${x.mensaje}`))].join(' · ')}`;
  }
  async function siguiente() {
    const e = errorPaso(paso) ?? await coberturaError(paso);
    if (e) { setAviso(e); if (paso === 3 && !fecha) setFaltaFecha(true); return; }
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
    const r = await cambiarRuta(base.envio.id, puntos.map((p) => {
      if (p.parada_id) return { tipo: p.tipo, id: p.parada_id };
      if (p.sitio) return { tipo: p.tipo, sitio_id: p.sitio.id };
      const n = p.nuevo!;
      return { tipo: p.tipo, nombre_empresa: n.nombre_empresa, direccion: n.direccion, codigo_postal: n.codigo_postal, poblacion: n.poblacion,
        provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso, tipo_sitio: n.tipo_sitio, horarios: n.horarios, guardar_en_agenda: n.guardar,
        contacto_nombre: n.contacto, contacto_telefono: n.telefono, horario_tramos: n.horario ? tramosDe(n.horario) : undefined };
    }));
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    router.push(`/panel/envios?ver=${base.envio.id}`);
    refrescar();
  }

  // Guardar la MODIFICACIÓN de un envío (modo editar): mismos datos que al crear, pero
  // sobre el envío que ya existe. La ruta solo se reenvía si CAMBIÓ (paradas intactas
  // conservan referencia y notas); si no se toca la fecha ni el tipo de ventana, las
  // fechas guardadas no se mueven; y el precio va tal cual está en pantalla (prefijado
  // con el actual: solo cambia si lo cambias tú).
  async function guardarEdicion() {
    if (!base || !cliente) return;
    for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
    setEnviando(true); setAviso(null);
    const edicExist: EdicionSitio[] = puntos
      .filter((p) => p.sitio && !p.sitio.es_almacen_dynamo && edicSitios[p.k] && datosSitios[p.sitio.id])
      .map((p) => {
        const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
        return {
          sitio_id: p.sitio!.id, contacto_id: f.contacto_id, contacto_nombre: f.contacto, contacto_telefono: f.telefono, contacto_email: f.contactoEmail,
          anotaciones: f.notas, emails_avisos: f.emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
          url_google_maps: f.maps || null, horario_tramos: tramosDe(f.horario),
        };
      });
    if (edicExist.length) {
      const g = await guardarEdicionesSitios(edicExist);
      if (!g.ok) { setEnviando(false); setAviso(g.error); return; }
    }
    const rutaCambiada = puntos.map((p) => p.parada_id ?? 'nueva').join(',') !== base.paradas.map((p) => p.id).join(',');
    const paradas = !rutaCambiada ? null : puntos.map((p) => {
      if (p.parada_id) return { tipo: p.tipo, id: p.parada_id };
      if (p.sitio) return { tipo: p.tipo, sitio_id: p.sitio.id };
      const n = p.nuevo!;
      const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
      const hr = edicSitios[p.k]?.horario ?? n.horario;
      return {
        tipo: p.tipo, nombre_empresa: f.empresa, direccion: n.direccion, codigo_postal: n.codigo_postal,
        poblacion: n.poblacion, provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso,
        tipo_sitio: n.tipo_sitio, horarios: n.horarios, guardar_en_agenda: n.guardar,
        contacto_nombre: f.contacto, contacto_telefono: f.telefono, contacto_email: f.contactoEmail, horario_tramos: hr ? tramosDe(hr) : undefined,
      };
    });
    const fechasIguales = fecha === (be!.fecha_carga_desde ?? '') && urgencia === urgenciaIni;
    const f = forma.toLowerCase();
    const r = await guardarEdicionEnvio(base.envio.id, {
      referencia_cliente: refCli,
      fecha_carga_desde: fechasIguales ? (be!.fecha_carga_desde ?? '') : fecha,
      fecha_carga_hasta: fechasIguales ? (be!.fecha_carga_hasta ?? '') : fechaHasta,
      descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
      metros_lineales: Number(ml), toneladas: Number(peso),
      paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'), carga_techo: f.includes('techo'),
      requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
      importe_cliente: importe, importe_transportista: importeT, negociacion_pct: neg,
      discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
    }, paradas);
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    router.push(`/panel/envios?ver=${base.envio.id}`);
    refrescar();
  }

  // Teléfono y email del contacto de cada sitio son OBLIGATORIOS (usuario, 2026-11-09):
  // sin ellos no se crea el envío. Los almacenes Dynamo y las fichas aún sin cargar no
  // se exigen (sus datos no se editan aquí / no se conocen todavía).
  function sitiosConFaltas(): Set<number> {
    const s = new Set<number>();
    for (const p of puntos) {
      if (p.sitio?.es_almacen_dynamo) continue;
      if (p.sitio && !datosSitios[p.sitio.id]) continue;
      const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
      if (f.dynamo) continue;
      if ((f.nuevo && !f.empresa.trim()) || !f.telefono.trim()) s.add(p.k);
    }
    return s;
  }
  function avisarFaltasSitios(faltas: Set<number>) {
    setFaltasSitios(faltas);
    setAviso('Faltan datos obligatorios de los sitios: teléfono de contacto (y la empresa en los sitios nuevos). Revisa las tarjetas marcadas en rojo.');
    setTimeout(() => document.querySelector('.ptar-sitio-card.falta')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  async function crear() {
    if (!cliente) return;
    const faltas = sitiosConFaltas();
    if (faltas.size) { setRevisarLegal(false); avisarFaltasSitios(faltas); return; }
    for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
    setEnviando(true); setAviso(null);
    // Guarda en la ficha de cada sitio de la AGENDA lo que se corrigió en la confirmación
    // (los almacenes de Dynamo los ignora el servidor). Si algo no es válido, se corta aquí.
    const edicExist: EdicionSitio[] = puntos
      // Solo si sus datos ya se cargaron (si no, no pisamos la ficha con valores por defecto).
      .filter((p) => p.sitio && !p.sitio.es_almacen_dynamo && edicSitios[p.k] && datosSitios[p.sitio.id])
      .map((p) => {
        const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
        return {
          sitio_id: p.sitio!.id, contacto_id: f.contacto_id, contacto_nombre: f.contacto, contacto_telefono: f.telefono, contacto_email: f.contactoEmail,
          anotaciones: f.notas, emails_avisos: f.emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
          url_google_maps: f.maps || null, horario_tramos: tramosDe(f.horario),
        };
      });
    if (edicExist.length) {
      const g = await guardarEdicionesSitios(edicExist);
      if (!g.ok) { setEnviando(false); setAviso(g.error); return; }
    }
    const citaTxt = (k: number) => {
      const c = edicSitios[k];
      return c?.cita ? ['CITA PREVIA' + (c.citaHora ? ` a las ${c.citaHora}` : ''), (c.citaDetalle ?? '').trim()].filter(Boolean).join(' · ') : undefined;
    };
    const paradas: ParadaNueva[] = puntos.map((p, i) => {
      const ref = i === 0 && refCli ? refCli : undefined;
      if (p.sitio) return { tipo: p.tipo, sitio_id: p.sitio.id, referencia: ref, anotaciones: citaTxt(p.k) };
      const n = p.nuevo!;
      // Datos del sitio nuevo con lo corregido en la confirmación encima.
      const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
      const hr = edicSitios[p.k]?.horario ?? n.horario;
      return {
        tipo: p.tipo, nombre_empresa: f.empresa, direccion: n.direccion, codigo_postal: n.codigo_postal,
        poblacion: n.poblacion, provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso,
        tipo_sitio: n.tipo_sitio, horarios: n.horarios, guardar_en_agenda: n.guardar, referencia: ref, anotaciones: citaTxt(p.k),
        contacto_nombre: f.contacto, contacto_telefono: f.telefono, contacto_email: f.contactoEmail, horario_tramos: hr ? tramosDe(hr) : undefined,
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
        carga_techo: f.includes('techo'), requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
        discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
      }, paradas);
      if (!rm.ok) { setEnviando(false); setAviso(rm.error); return; }
      router.push(`/panel/envios?f=programada&nuevo=${encodeURIComponent(rm.referencia_gx)}&manual=1`);
      refrescar();
      return;
    }
    if (esCliente) {
      // El precio es el del tarifador automático que el cliente tiene en pantalla.
      if (!tarifa) { setEnviando(false); setAviso('El precio aún se está calculando: espera un momento y vuelve a pulsar.'); setPaso(3); return; }
      const rs = await crearEnvioCliente({
        referencia_cliente: refCli, fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        toneladas: Number(peso), metros_lineales: Number(ml),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
        carga_techo: f.includes('techo'), requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
        importe_cliente: tarifa.neto,
        discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
      }, paradas);
      if (!rs.ok) { setEnviando(false); setAviso(rs.error); return; }
      router.push(`/panel/envios?f=programada&nuevo=${encodeURIComponent(rs.referencia_gx)}`);
      refrescar();
      return;
    }
    const r = await crearEnvio({
      cliente_id: cliente.id, referencia_cliente: refCli,
      fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
      descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
      toneladas: Number(peso), metros_lineales: Number(ml),
      paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
      carga_techo: f.includes('techo'), requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
      importe_cliente: importe, importe_transportista: importeT,
      discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio, negociacion_pct: neg,
    }, paradas);
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    router.push(`/panel/envios?f=sin-asignar&nuevo=${encodeURIComponent(r.referencia_gx)}`);
    refrescar();
  }

  // ---- Opciones de los desplegables (las del mockup)
  const optsMl: [string, string][] = [];
  for (let i = 1; i <= mlMax; i++) optsMl.push([String(i), `${i} ${i === 1 ? 'metro' : 'metros'} (equivale a ${Math.floor(i * 2.5)} europalets o ${Math.floor(i * 2)} palets americanos)`]);
  if (mlMax === 13) optsMl.push(['13.3', '13,30 metros — tráiler completo (equivale a 33 europalets o 26 palets americanos)']);
  const optsPeso: [string, string][] = [['0.2', 'De 0 a 200 kg'], ['0.4', 'De 200 a 400 kg'], ['0.6', 'De 400 a 600 kg'], ['0.8', 'De 600 a 800 kg'], ['1', 'De 800 kg a 1 tonelada']];
  for (let lo = 1, hi = 3; lo < pesoMax; hi += 2) { if (hi > pesoMax) hi = pesoMax; optsPeso.push([String(hi), `De ${lo} a ${hi} toneladas${hi === pesoMax ? ' (máximo)' : ''}`]); if (hi === pesoMax) break; lo = hi; }
  const mlTxt = optsMl.find(([v]) => v === ml)?.[1] ?? '';
  const pesoTxt = optsPeso.find(([v]) => v === peso)?.[1] ?? '';
  const camionTxt = plataforma ? 'Camión rígido con plataforma elevadora (8 m · 14 Tn)' : 'Tráiler tauliner (lona corredera)';
  // Precio provisional: si la carga está a más de N días, se revisa antes (parámetros).
  const diasHasta = fecha ? Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())}T12:00:00Z`)) / 86400000) : 0;
  const provisional = !!reglas && !!fecha && diasHasta > reglas.cerrado_dias;
  const maxFecha = esCliente && reglas && reglas.antelacion_max_dias > 0
    ? hoyMadrid(reglas.antelacion_max_dias) : undefined;
  const avisoProvisional = provisional && reglas ? (
    <div className="pt-aviso" style={{ marginTop: '0.6rem' }}><div>
      <strong>Precio provisional:</strong> como faltan más de {reglas.cerrado_dias} días, el precio se revisa <strong>{reglas.revision_dias_habiles} días hábiles antes de la carga</strong>.
    </div></div>) : null;
  const fechaTxt = fecha ? (fechaHasta && fechaHasta !== fecha ? `del ${fmtFecha(fecha)} al ${fmtFecha(fechaHasta)}` : fmtFecha(fecha)) : '';
  // Carga hoy para hoy: fecha fija y el día elegido es hoy (para el aviso de la confirmación).
  const esHoy = urgencia === 'dia' && !!fecha && diasHasta === 0;
  // La carga EMPIEZA hoy (fija hoy o ventana desde hoy): avisa si el sitio cierra pronto.
  const cargaHoy = !!fecha && fecha === hoyStr;
  // Resaltar en rojo el campo de fecha si se intentó avanzar sin elegirla (hasta que se ponga).
  const marcarFecha = faltaFecha && !fecha;
  const bordeFecha = marcarFecha ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.12)' } : undefined;

  // ---- Avisos del paso 4 (los del mockup) --------------------------------------------
  // Recogida en un día que el sitio no abre (según su horario en Sitios o el del sitio nuevo).
  const diasCarga = (() => {
    if (!fecha) return [] as string[];
    const out: string[] = []; const [a, m, d] = fecha.split('-').map(Number); const x = new Date(a, m - 1, d);
    while (iso(x) <= (fechaHasta || fecha)) { const k = iso(x); const w = x.getDay(); if (w !== 0 && w !== 6 && !fest.has(k)) out.push(k); x.setDate(x.getDate() + 1); }
    return out;
  })();
  // Cada día, el horario que toca: el de verano si el sitio lo tiene activo y cae en sus fechas.
  const diaSemana = (d: string) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
  const recogidasCerradas = recogidas.flatMap((p) => {
    const h = p.sitio ? abiertosSitio[p.sitio.id] : null;
    const nuevos = p.nuevo ? (p.nuevo.horario ?? HORARIO_POR_DEFECTO).flatMap((g) => (g.tramos.length ? g.dias : [])) : null;
    if (p.sitio && (!h || !h.general.length)) return [];
    if (!p.sitio && !nuevos?.length) return [];
    const cerrados = diasCarga.filter((d) => {
      const abiertos = h ? (h.verano.activo && h.verano.desde && h.verano.hasta && enTemporada(d, h.verano.desde, h.verano.hasta) && h.verano.dias.length ? h.verano.dias : h.general) : nuevos!;
      return !abiertos.includes(diaSemana(d));
    });
    if (!cerrados.length) return [];
    const nombre = p.sitio?.nombre_empresa ?? p.nuevo?.nombre_empresa ?? 'El punto de recogida';
    return [{ nombre, todos: cerrados.length === diasCarga.length, dias: cerrados }];
  });
  // Verano de los almacenes (fechas genéricas de Dynamo, en Parámetros): los sitios de la
  // agenda con horario de verano activo lo enseñan; los que no lo tienen, se piden revisar.
  const enVerano = !!fecha && (enTemporada(fecha, veranoGen.desde, veranoGen.hasta) || enTemporada(fechaHasta || fecha, veranoGen.desde, veranoGen.hasta));
  const veranoSitios = recogidas.flatMap((p) => {
    const h = p.sitio ? abiertosSitio[p.sitio.id] : null;
    const nombre = p.sitio?.nombre_empresa ?? p.nuevo?.nombre_empresa ?? 'El punto de recogida';
    if (h?.verano.activo && h.verano.desde && h.verano.hasta && fecha && enTemporada(fecha, h.verano.desde, h.verano.hasta)) return [{ nombre, con: true, resumen: h.verano.resumen }];
    return enVerano ? [{ nombre, con: false, resumen: null }] : [];
  });
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
      {!plataforma && (
        <div className="pt-aviso" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
          <strong>Envío en tráiler</strong>, asegúrate de que hay <strong>medios de carga</strong>. Si requieres plataforma elevadora (<strong>más caro y solo en camión rígido de 8 metros</strong>), añádela en el{' '}
          <a href="#" style={{ color: 'inherit', fontWeight: 800, textDecoration: 'underline' }} onClick={(ev) => { ev.preventDefault(); setNotasAbiertas(true); setPaso(2); window.scrollTo({ top: 0 }); }}>paso 2</a>.
        </div></div>
      )}
      {veranoSitios.some((x) => x.con) && (
        <div className="pt-aviso info" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoSol /><div>
          <strong>Horario de verano:</strong> {veranoSitios.filter((x) => x.con).map((x) => `${x.nombre}: ${x.resumen ?? 'horario de verano'}`).join(' · ')}.
        </div></div>
      )}
      {enVerano && (veranoSitios.some((x) => !x.con) || !veranoSitios.length) && (
        <div className="pt-aviso" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoSol /><div>
          <strong>Revisa horarios de verano</strong>{veranoSitios.some((x) => !x.con) ? <> de {veranoSitios.filter((x) => !x.con).map((x) => x.nombre).join(', ')}</> : ' de los almacenes'}:
          entre el {mmddTxt(veranoGen.desde)} y el {mmddTxt(veranoGen.hasta)} muchos cambian de horario (la mayoría hacen <strong>7:00–15:00</strong>).
          {veranoSitios.some((x) => !x.con) && <> Puedes ponerle su horario de verano en Sitios.</>}
        </div></div>
      )}
      {recogidasCerradas.map((r) => (
        <div key={r.nombre} className={`pt-aviso${r.todos ? ' error' : ''}`} style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
          {r.todos
            ? <><strong>{r.nombre} está cerrado</strong> {r.dias.length > 1 ? 'todos los días de carga' : 'el día de carga'} ({r.dias.map((d) => fmtFecha(d)).join(', ')}) según su horario. Cambia la fecha o revisa su horario en Sitios.</>
            : <><strong>{r.nombre} no abre</strong> el {r.dias.map((d) => fmtFecha(d)).join(', ')} según su horario: la carga tendrá que hacerse otro día de la ventana.</>}
        </div></div>
      ))}
      {festivosEnVentana.length > 0 && (
        <div className="pt-aviso error" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
          <strong>Festivo nacional en la fecha de carga.</strong> {festivosEnVentana.join(' · ')}. Puede que el almacén esté <strong>cerrado</strong> ese día: confírmalo con el punto de recogida.
        </div></div>
      )}
    </>
  );

  // IVA de la ficha del cliente (21 % en España, 0 % fuera); el que se guarda lo pone la base de datos.
  const ivaPct = Number(cliente?.iva ?? 21);
  const cajaPrecio = (
    <div className="ptar-confirm-price">
      <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{importe > 0 ? eur(importe) : '—'}</span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">IVA ({porcentaje(ivaPct)})</span><span className="v">{importe > 0 ? eur(importe * ivaPct / 100) : '—'}</span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{importe > 0 ? eur(importe * (1 + ivaPct / 100)) : '—'}</span></div>
    </div>
  );

  // Botonera del asistente (usuario, 2026-11-09): en el paso 3 va DENTRO de la columna
  // del precio, justo debajo de la caja «Precio sugerido»; en los pasos 1-2, al fondo.
  const navBotones = (
    <div className="wiz-navwrap">
      <div className="wiz-nav">
        <button type="button" className="btn-ghost" onClick={enRuta || (editar && paso === 1) ? () => router.push(`/panel/envios?ver=${be!.id}`) : atras}>{paso === 1 ? 'Cancelar' : '← Atrás'}</button>
        {enRuta
          ? <button type="button" className="btn-primary" onClick={guardarRuta} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar ruta'}</button>
          : <button type="button" className="btn-primary" data-pista-accion onClick={siguiente} disabled={comprobando}>{comprobando ? 'Comprobando la ruta…' : paso === 3 ? 'Ver resumen →' : 'Siguiente →'}</button>}
      </div>
      {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
    </div>
  );

  return (
    <section className={`section active wiz-v2 wiz-s${Math.min(paso, 3)}`} id="sec-nueva-carga">
      <div className="sec-header"><h2>{enRuta ? `Cambiar ruta · #${be!.referencia_gx}` : editar ? `Modificar envío · #${be!.referencia_gx}` : base ? `Repetir envío · #${be!.referencia_gx}` : 'Nuevo envío'}</h2></div>
      {enviando && <Cargando texto={enRuta ? 'Guardando la ruta' : editar ? 'Guardando cambios' : 'Creando envío'} />}
      {/* Pista flotante «Desliza…» (mockup): cuando el botón de acción del paso queda
          por debajo del pliegue. En Fecha y precio y en Confirmar, que son los largos. */}
      {(paso === 3 || paso === 4) && !revisarLegal && !enviando && (
        <PistaScroll selector="[data-pista-accion]"
          texto={editar ? 'Desliza para guardar los cambios' : 'Desliza para crear el envío'} />
      )}
      {editar && paso === 1 && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Estás <strong>modificando el envío #{be!.referencia_gx}</strong>: cambia lo que haga falta en cualquier paso y pulsa <strong>«Guardar cambios»</strong> al final. Si no tocas nada que afecte al precio (ruta, mercancía, fechas), <strong>el precio se queda como está</strong> — el tarifador solo sugiere, no lo pisa.</div></div>
      )}
      {base?.modo === 'repetir' && paso === 1 && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Se ha copiado todo del envío <strong>#{be!.referencia_gx}</strong> (ruta{esCliente ? ' y mercancía' : ', mercancía y precios'}) salvo la <strong>fecha</strong>. Revísalo y cambia lo que haga falta: se creará un envío <strong>nuevo</strong>.</div></div>
      )}
      {enRuta && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Cambia, quita o añade paradas y pulsa <strong>«Guardar ruta»</strong>. Las paradas que no cambies conservan su referencia y sus notas. {be!.estado !== 'programado' && be!.estado !== 'borrador' ? 'El transportista ya va hacia la carga: avísale del cambio. ' : ''}La mercancía, la fecha y el precio se cambian en «Modificar».</div></div>
      )}

      {errorCarga && <div className="pt-aviso error">No se han podido cargar los datos: {errorCarga}</div>}

      {!enRuta && <div className="wiz-bar">
        {['Ruta', 'Mercancía', 'Fecha y precio', 'Confirmar'].map((t, i) => (
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
                  {!sinCampoCliente && <>
                  <div className="ptar-section-head">Cliente</div>
                  <div className="ptar-field ptar-field-full">
                    {enRuta || editar ? <div className="ptar-input-wrap ptar-picked"><IcoCliente /><input type="text" readOnly value={cliente ? `${cliente.nombre} · ${cliente.cif}` : ''} /></div> : <CampoCliente clientes={clientes} valor={cliente}
                      onElegir={async (c) => {
                        setCliente(c);
                        setNima(!!c?.nima);   // la preferencia NIMA del cliente elegido
                        setPuntos((l) => l.map((p) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : null })));
                        if (!c) return;
                        // Sus sitios se piden ahora; su almacén principal pasa a la primera recogida.
                        const suyos = sitiosRef.current.some((x) => x.cliente_id === c.id) ? [] : await sitiosDelCliente(c.id).catch(() => [] as typeof sitiosIni);
                        if (suyos.length) setSitios((l) => [...l.filter((x) => x.cliente_id !== c.id), ...suyos]);
                        const todos = suyos.length ? [...sitiosRef.current, ...suyos] : sitiosRef.current;
                        const prin = c.principal_id ? todos.find((x) => x.id === c.principal_id && x.cliente_id === c.id) ?? null : null;
                        if (prin) setPuntos((l) => l.map((p, i) => (i === 0 && !p.nuevo && !p.sitio?.es_almacen_dynamo ? { ...p, sitio: prin } : p)));
                      }}
                      onNuevo={(c) => { setClientes((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre))); setCliente(c); setNima(false); }} />}
                  </div>
                  </>}

                  {sinCampoCliente && !base && (<>
                    <div className="ptar-section-head">Transportista / operador{' '}
                      <span className="ptar-prin-info" tabIndex={0} title="¿Trabajas también con transportistas propios? Dalos de alta en Transportistas y podrás registrar aquí esos envíos (Dynamo no interviene) y tenerlo todo unificado." aria-label="Ayuda sobre transportistas propios">ⓘ</span>
                    </div>
                    <div className="ptar-field ptar-field-full">
                      <CampoOperador operadores={operadores} valor={operador} onCambio={setOperador} />
                      {manual && <p className="ptar-admin-precio-note" style={{ marginTop: '0.4rem' }}>Envío con <strong>tu propio transportista</strong>: Dynamo no interviene en nada. La plataforma te sirve para organizarlo y sacar la <strong>orden de carga</strong> en PDF.</p>}
                    </div>
                  </>)}
                  <div className="ptar-section-head">Ruta</div>
                  {puntos.map((p, i) => (
                    <div key={p.k} data-parada={p.k} className={`ptar-field ptar-field-full${arrastrando === p.k ? ' ptar-dragging' : ''}`}>
                      <CampoSitio punto={p} numero={i + 1} sitios={sitiosCliente} deshabilitado={!cliente} asa={asaDe(p)}
                        placeholder={i === 0 ? (esCliente ? 'Recogida · busca en tus sitios' : 'Recogida · busca en la agenda del cliente')
                          : i === puntos.length - 1 ? (esCliente ? 'Entrega · busca en tus sitios' : 'Entrega · busca en la agenda del cliente')
                          : p.tipo === 'carga' ? 'Otra recogida · busca en la agenda' : 'Otra entrega · busca en la agenda'}
                        onCambio={(c) => cambiar(p, c)}
                        onQuitar={i > 0 && i < puntos.length - 1 ? () => quitar(p) : undefined}
                        onAnadir={total < 4 ? () => nuevaParada(p) : undefined}
                        onAlternar={i > 0 && i < puntos.length - 1 ? () => alternarTipo(p) : undefined} />
                      {i === 0 && p.sitio && cliente?.principal_id === p.sitio.id && (
                        <p className="ptar-prin-badge"><span className="ptar-prin-star" aria-hidden="true">★</span> {esCliente ? 'Tu almacén principal' : 'Almacén principal del cliente'} · origen por defecto
                          <span className="ptar-prin-info" tabIndex={0} title={esCliente
                            ? 'Se preselecciona como recogida en cada envío nuevo. Puedes cambiar cuál es tu sitio principal con la estrella en Sitios.'
                            : 'Se preselecciona como recogida en cada envío nuevo. El sitio principal se cambia con la estrella en Sitios.'}>ⓘ</span>
                        </p>
                      )}
                    </div>
                  ))}
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
                      <strong>Añadir notas/nº de pedido, plataforma elevadora o NIMA</strong> (opcional)
                    </button>
                    {notasAbiertas && (
                      <div className="ptar-notes-body">
                        <div className="ptar-pair">
                          <Interruptor titulo="Plataforma elevadora" valor={plataforma}
                            onCambio={(v) => {
                              setPlataforma(v); setMl(v ? '8' : '13.3'); setPeso(v ? '14' : '24');
                              avisar(v
                                ? 'Con plataforma elevadora el camión pasa a RÍGIDO: máximo 8 m y 14 Tn (metros y peso ajustados).'
                                : 'Sin plataforma vuelves a TRÁILER completo: máximo 13,3 m y 24 Tn. Si tu carga ocupa menos, ajústalo en metros y peso.');
                            }} />
                          <Interruptor titulo="Requiere NIMA" valor={nima} onCambio={setNima} />
                          <Interruptor titulo="Mercancía ADR" valor={adr} onCambio={setAdr} />
                        </div>
                        <div className="ptar-field" style={{ marginTop: '0.9rem' }}>
                          <label className="ptar-label" htmlFor="ne-ref">Notas/Nº de pedido <Req si={false} /></label>
                          <input id="ne-ref" type="text" className="ptar-select" placeholder="Ej. PED-0426 / ALB-1234, instrucciones breves…" value={refCli} onChange={(e) => setRefCli(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                </>)}

                {paso === 3 && (<>
                  <div className="ptar-section-head ptar-sh-fecha">Fecha de recogida</div>
                  <div className="ptar-field-full">
                    {/* Al cambiar de tipo NO se borra el día ya elegido: la ventana se recalcula sola
                        (fija → el día; 1 a 3 días → de ese día al rango). */}
                    <SelectorUrgencia valor={urgencia} grupaje={esGrupaje} onCambio={(v) => { setUrgencia(v); setModoCal(false); }} />
                  </div>
                  <div className="ptar-field-full">
                    {!modoCal ? (
                      // Lista de fechas; la última opción abre el calendario.
                      <select className="ptar-select ptar-dia-naranja" aria-label="Fecha de recogida" style={bordeFecha} value={dias.includes(fecha) ? fecha : (fecha ? 'elegida' : '')}
                        onChange={(e) => { const v = e.target.value; if (v === '__cal__') setModoCal(true); else if (v !== 'elegida') setFecha(v); }}>
                        <option value="" disabled>Elige la fecha de recogida</option>
                        {dias.map((d) => (
                          <option key={d} value={d}>{urgencia !== 'dia' ? `Del ${fmtFecha(d)} al ${fmtFecha(sumarHabiles(d, ventanaDias - 1, fest))}` : fmtFecha(d)}</option>
                        ))}
                        {fecha && !dias.includes(fecha) && <option value="elegida">{fechaTxt ? fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1) : fmtFecha(fecha)}</option>}
                        <option value="__cal__">Elegir otra fecha en el calendario…</option>
                      </select>
                    ) : (
                      // Calendario: se toca para abrirlo (en iPhone no se puede abrir solo). Al elegir el
                      // primer día, la ventana (1 a 3 días) calcula el rango sola.
                      <div className="ptar-cal-fila">
                        <input ref={calRef} type="date" className="ptar-select ptar-dia-naranja" aria-label="Elige el día en el calendario" style={bordeFecha}
                          min={fechaLibre ? undefined : dias[0]} max={maxFecha} value={fecha && !dias.includes(fecha) ? fecha : ''}
                          onChange={(e) => { setFecha(e.target.value); if (e.target.value) setModoCal(false); }} />
                        <button type="button" className="ptar-cal-volver" onClick={() => setModoCal(false)}>Volver a la lista</button>
                      </div>
                    )}
                    {marcarFecha && <div className="pt-aviso error" style={{ marginTop: '0.5rem', marginBottom: 0 }}><IcoAviso /><div><strong>Elige la fecha de recogida</strong> (es el campo que falta).</div></div>}
                  </div>
                  {!manual && !fechaPasada && (
                    <div className="ptar-field-full">
                      <AvisoCorte urgencia={urgencia} festivos={festivos} ventana={ventanaDias} grupaje={esGrupaje}
                        cortes={{ fija: reglas?.corte_fija_hora, ventana: reglas?.corte_ventana_hora }} />
                    </div>
                  )}
                  {fechaLibre && <div className="ptar-field-full"><p className="ptar-admin-precio-note">Como <strong>Admin Master</strong> puedes poner cualquier fecha: también hoy, una pasada (un envío gestionado por teléfono) o saltándote las horas de corte. Nadie más puede.</p></div>}
                  {fechaLibre && fecha && dias[0] && fecha < dias[0] && (
                    <div className="ptar-field-full"><div className="wiz-warn show" role="alert">⚠ <strong>Fuera de las reglas de corte:</strong> esta fecha no se podría elegir normalmente (fija desde mañana con su corte · ventana con corte de las {reglas?.corte_ventana_hora ?? 14}:00). Úsalo solo para urgencias o imprevistos: la recogida dependerá de encontrar camión a tiempo.</div></div>
                  )}
                </>)}
              </div>
            </div>

            {paso === 3 && (
              <div className="form-2col-side">
                {/* La fecha elegida ya se ve en el desplegable; aquí solo los avisos si los hay. */}
                {((maxFecha && fecha > maxFecha) || avisoProvisional) && (
                  <div className="ptar-field ptar-field-full">
                    {maxFecha && fecha > maxFecha && <div className="pt-aviso error"><div>Como mucho se puede programar con <strong>{reglas!.antelacion_max_dias} días</strong> de antelación. Para más, llámanos al {CONTACTO.telefono}.</div></div>}
                    {avisoProvisional}
                  </div>
                )}
                {manual ? (<>
                  <div className="ptar-field ptar-field-full ptar-admin-precio">
                    <div className="ptar-admin-precio-head">Precio con {nombreOp}</div>
                    <label className="ptar-admin-precio-lbl" htmlFor="ne-pop">Precio acordado con tu transportista (sin IVA) <Req si={false} /></label>
                    <input id="ne-pop" type="text" inputMode="decimal" placeholder="Ej. 450,00" value={precioOp} onChange={(ev) => setPrecioOp(ev.target.value)} />
                    <p className="ptar-admin-precio-note">Solo para tu control y para la orden de carga. Dynamo no lo ve en ningún precio suyo.</p>
                  </div>
                  {navBotones}
                  </>
                ) : esCliente ? (<>
                  <BloquePrecio tarifa={tarifa} km={kmInfo?.km ?? null} kmEstimado={!!kmInfo?.estimado} ivaPct={ivaPct}
                    cargando={rutaCompleta && !kmInfo} paraCliente pasada={false} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'} onElegir={elegirAlternativa} />
                  <div className="pt-aviso info" style={{ marginTop: '0.6rem' }}><div><strong>Te pasamos el precio en firme en menos de 25 minutos</strong> (en horario de oficina). Te llegará a tu panel y, hasta que lo aceptes, no hay ningún compromiso.</div></div>
                  {navBotones}
                </>) : <>
                <BloquePrecio tarifa={tarifa} km={kmInfo?.km ?? null} kmEstimado={!!kmInfo?.estimado} ivaPct={ivaPct}
                  cargando={rutaCompleta && !kmInfo} paraCliente={false} pasada={fechaPasada} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'} onElegir={elegirAlternativa} />
                {navBotones}
                <div className="ptar-field ptar-field-full ptar-admin-precio">
                  <div className="ptar-admin-precio-head">Precios internos <span>· solo administración</span></div>
                  {tarifa && ultimos && interna
                    ? <PreciosInternosTabla tarVenta={tarifa.neto} tarCompra={tarCompra} mismo={ultimos.mismo} todos={ultimos.todos} interna={interna} hoy={hoyStr} />
                    : <p className="ptar-admin-precio-note" style={{ marginBottom: '0.5rem' }}>Ventas, compras y márgenes de esta ruta: se mostrarán al elegir origen y destino.</p>}
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-pc">Cliente manual (base sin IVA)</label>
                  <input id="ne-pc" type="text" inputMode="decimal" placeholder="Se autorrellena con el precio Aplicado" value={pc} onChange={(e) => { setPc(e.target.value); setPcTocado(true); }} />
                  <p className="ptar-admin-precio-note">Se autorrellena con el precio <strong>Aplicado</strong> (media auto de la venta) y es editable. Si tecleas otro, manda ese; si no lo tocas, el envío usa el Aplicado. Queda como precio <strong>«fijado a mano»</strong>.</p>
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-pt" style={{ marginTop: '0.6rem' }}>Transportista manual (base sin IVA)</label>
                  <input id="ne-pt" type="text" inputMode="decimal" placeholder="Se autorrellena con la compra más baja" value={pt} onChange={(e) => { setPt(e.target.value); setPtTocado(true); }} />
                  <p className="ptar-admin-precio-note">Se autorrellena con la compra <strong>más baja</strong> de la tabla (tarifador o último envío más barato de esta ruta, sea del transportista que sea) y es editable. Al guardar queda como <strong>P. transportista provisional</strong> del envío — de ahí sale el margen provisional — y se ajusta al cerrar la negociación.</p>
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-neg" style={{ marginTop: '0.6rem' }}>Negociación del precio (transportista)</label>
                  <select id="ne-neg" className="ptar-select" value={neg} onChange={(e) => setNeg(Number(e.target.value))}>
                    {NEGOCIACION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                  <p className="ptar-admin-precio-note">Sale ya puesta al ofrecer la carga (se puede cambiar ahí). El transportista nunca ve el %, solo el rango en euros.</p>
                </div>
                </>}
              </div>
            )}
          </div>

          {paso !== 3 && navBotones}
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
                </div>
                <h4 className="ptar-section-head" style={{ margin: '1rem 0 0.5rem', fontSize: 'var(--fs-l)' }}>
                  Datos de los lugares <span style={{ color: 'var(--gray-500)', fontWeight: 600, fontSize: 'var(--fs-m)' }}>· revisa y completa lo que falte</span>
                </h4>
                <FichasSitios puntos={puntos} datos={datosSitios} edic={edicSitios} setEdic={setEdicSitios} fechaCargaTxt={fechaTxt} esCliente={esCliente} faltas={faltasSitios} cargaHoy={cargaHoy} />
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
                  {notasEnvio && <div className="sum2-cell sum2-full"><div className="sum2-k">Anotaciones de la mercancía</div><div style={{ fontSize: 'var(--fs-m)', fontWeight: 600, color: 'var(--gray-700)', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{notasEnvio}</div></div>}
                </div>
                {/* El cajetín de fecha + P. transportista + margen salió de aquí (usuario,
                    2026-11-09): el resumen de precios y margen va al modal de Confirmar
                    envío, solo en la vista de admin. */}
                {refCli && <div className="sum2-box" style={{ marginTop: '0.6rem' }}><div className="sum2-grid">
                  <div className="sum2-cell"><div className="sum2-k">Notas / nº de pedido</div><div className="sum2-v">{refCli}</div></div>
                </div></div>}
                {avisosPaso4}
              </div>
            </div>
            <div className="form-2col-side">
              {manual
                ? <div className="pt-aviso info" style={{ marginBottom: 0 }}><div><strong>Transporte con {nombreOp}.</strong>{precioOp.trim() ? <> Precio acordado: <strong>{eur(num(precioOp))}</strong> (sin IVA).</> : null} Dynamo no interviene.</div></div>
                : esCliente
                ? <BloquePrecio tarifa={tarifa} km={kmInfo?.km ?? null} kmEstimado={!!kmInfo?.estimado} ivaPct={ivaPct}
                    cargando={rutaCompleta && !kmInfo} paraCliente pasada={false} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'} onElegir={elegirAlternativa} />
                : cajaPrecio}
              {avisoProvisional}
              <div className="ptar-discrecion">
                <label className="ptar-confirm-check">
                  <input type="checkbox" checked={discrecion} onChange={(e) => setDiscrecion(e.target.checked)} />
                  <span><strong>Discreción comercial</strong> (opcional): el conductor no dirá en la carga a quién va la mercancía ni en la entrega de dónde viene.</span>
                </label>
              </div>
              <div className="ptar-terms-box">
                {editar
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Guardar cambios»</strong> se actualiza el envío #{be!.referencia_gx}. Si no has tocado nada que afecte al precio (ruta, mercancía, fechas), <strong>el precio se queda como está</strong>: solo cambia si lo cambias tú.</p>
                  : manual
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> queda programado con tu operador y puedes sacar la <strong>orden de carga</strong> desde el envío.</p>
                  : esCliente
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> revisas las condiciones y queda <strong>programado con este precio</strong> (base sin IVA). Si tu cuenta paga por adelantado, el camión se asigna al recibir el pago.</p>
                  : <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> el envío queda <strong>programado</strong> y pasa a la pestaña <strong>Sin asignar transportista</strong>.</p>}
              </div>
              {aviso && !revisarLegal && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
              <div className="ptar-actions ptar-actions-confirm">
                {/* Doble confirmación con los costes de cancelación y las condiciones generales:
                    la llevan Dynamo y también el CLIENTE (su envío nace ya con precio y compromiso;
                    la base de datos apunta condiciones_aceptadas_en). Al editar se guarda directo:
                    no hay nada nuevo que aceptar. */}
                <button type="button" className="btn-primary"
                  onClick={() => {
                    const faltas = sitiosConFaltas();
                    if (faltas.size) { avisarFaltasSitios(faltas); return; }
                    if (editar) { guardarEdicion(); return; }
                    for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
                    setAviso(null); setAceptaLegal(false); setVerCondiciones(false); setRevisarLegal(true);
                  }}
                  data-pista-accion disabled={enviando}>{enviando ? (editar ? 'Guardando cambios…' : 'Creando envío…') : editar ? 'Guardar cambios' : 'Crear envío'}</button>
                <button type="button" className="btn-ghost" onClick={() => { setAviso(null); setPaso(3); }} disabled={enviando}>← Editar datos</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doble confirmación (Dynamo): costes de cancelación + condiciones generales. */}
      <Modal abierto={revisarLegal} onCerrar={() => { if (!enviando) setRevisarLegal(false); }} ancho={620}
        titulo="Confirmar envío" sub="Revisa los costes de cancelación antes de crear el envío."
        pie={<>
          <button type="button" className="btn-ghost" onClick={() => setRevisarLegal(false)} disabled={enviando}>← Volver</button>
          <button type="button" className="btn-primary" disabled={enviando}
            onClick={() => { if (!aceptaLegal) { setFaltaLegal(true); return; } crear(); }}>{enviando ? 'Creando envío…' : 'Confirmar envío'}</button>
        </>}>
        {esHoy && (
          <div className="pt-aviso" style={{ marginTop: 0 }}><IcoAviso /><div>
            <strong>Carga hoy para hoy:</strong> no se garantiza poder cargar en el día. Nos ponemos a ello y te avisamos en breve. La cancelación de una carga para hoy (menos de 24&nbsp;h) conlleva cargos una vez asignado el transportista. <strong>Recomendación:</strong> amplía la ventana de carga para tener margen los días siguientes.
          </div></div>
        )}
        {/* El resumen de fecha/precios/margen se quitó de aquí también (usuario, 2026-11-09):
            los precios internos ya se ven y ajustan en el paso 3. */}
        {/* Carga hoy y el sitio de recogida cierra pronto (o ya cerró): el aviso se repite
            aquí, con la línea de repercusión al cliente (usuario, 2026-11-09). */}
        {cargaHoy && puntos.filter((pt) => pt.tipo === 'carga').map((pt) => {
          const fs = resolverFicha(pt, datosSitios, edicSitios[pt.k]);
          return fs.horario.length > 0 ? <AvisoCierreSitio key={pt.k} empresa={fs.empresa || 'El sitio de recogida'} horario={fs.horario} repercusion /> : null;
        })}
        <div className="pt-aviso ok" style={{ marginTop: esHoy ? '0.6rem' : 0, marginBottom: 0 }}><div>
          ✅ <strong>Cancelación y cambios gratis.</strong> Mientras el envío <strong>no tenga camión asignado</strong> puedes <strong>cancelarlo o modificarlo sin coste</strong>. Una vez asignemos transportista, cancelar <strong>después de las 9:00 del día hábil anterior a la carga</strong> puede conllevar el <strong>coste completo</strong> del servicio.
        </div></div>
        <div style={{ marginTop: '0.7rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)', lineHeight: 1.5 }}>
          La <strong>cancelación o modificación reiterada</strong> de envíos puede conllevar la <strong>suspensión</strong> temporal o definitiva de la cuenta si se detecta un uso abusivo (por encima de 3 cancelaciones en los últimos 10 envíos confirmados).
        </div>
        <div style={{ marginTop: '0.7rem' }}>
          <button type="button" onClick={() => setVerCondiciones((v) => !v)} aria-expanded={verCondiciones}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--purple)', fontWeight: 700, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
            {verCondiciones ? '▾' : '▸'} {verCondiciones ? 'Ocultar' : 'Ver'} condiciones generales de transporte
          </button>
          {verCondiciones && <div className="ptar-terms-scroll" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.6rem 0.8rem', marginTop: '0.4rem' }}><CondicionesGenerales /></div>}
        </div>
        <label className={`ptar-confirm-check${faltaLegal && !aceptaLegal ? ' ptar-check-err' : ''}`} style={{ marginTop: '0.9rem' }}>
          <input type="checkbox" checked={aceptaLegal} onChange={(e) => { setAceptaLegal(e.target.checked); if (e.target.checked) setFaltaLegal(false); }} />
          <span>He leído los <strong>costes de cancelación</strong> y las <strong>condiciones generales de transporte</strong>.</span>
        </label>
        {faltaLegal && !aceptaLegal && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.5rem' }}>⚠ Marca la casilla de arriba para poder confirmar el envío.</div>}
        {aviso && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {aviso}</div>}
      </Modal>

      {/* Aviso flotante breve (cambio de capacidad por la plataforma elevadora). */}
      {toast && <div className="ne-toast" role="status">{toast}</div>}
    </section>
  );
}
