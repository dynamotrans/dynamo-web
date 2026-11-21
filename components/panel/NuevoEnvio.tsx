'use client';

// "Nuevo envío": asistente de 4 pasos con el diseño de dashboard.html (#sec-nueva-carga):
// Ruta · Mercancía · Fecha y precio · Confirmar. Mismas clases del mockup (ptar-*, wiz-*,
// sum2-*, alm-price). Etapa A: lo usa Dynamo para un cliente y pone el precio a mano;
// el tarifador llega al final (y el precio lo calculará el servidor, nunca el navegador).
import { avisarNavegando, avisarNavegandoA } from './CargandoNavegacion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import { plazoPagoPrevisto, crearEnvio, cambiarRuta, crearEnvioCliente, crearEnvioManual, guardarEdicionEnvio, guardarEdicionEnvioCliente, diasAbiertosDe, comprobarCobertura, sitiosDelCliente, datosEditablesDeSitios, guardarEdicionesSitios, kmRuta, ultimosPreciosRuta, emailDeCliente, registrarConsultaPrecio, factorTarifa, guardarEdicionEnvioManual, enviarProformaCalculo, type UltimoPrecioRuta, type ParadaNueva, type HorarioSitioAviso } from '@/app/panel/(app)/nuevo-envio/acciones';
import { calcularTarifa, aplicarDescuentoTarifa, compraTarifador, tablaInterna } from '@/lib/tarifador';
import { BloquePrecio, PreciosInternosTabla } from './nuevoEnvio/PrecioSugerido';
import MedidasCamion, { altoAncho } from './nuevoEnvio/MedidasCamion';
import { fecha as fmtFecha, euros as eur, hoyMadrid, porcentaje, fechaHora } from '@/lib/formato';
import CuentaAtras from './CuentaAtras';
import { duracionTxt } from '@/lib/cuentaAtras';
import Cargando from '@/components/Cargando';
import { NEGOCIACION } from '@/lib/envios';
import { HORARIO_POR_DEFECTO, VERANO_GENERICO, tramosDe, enTemporada, mmddTxt } from '@/lib/horarios';
import { CONTACTO } from '@/lib/atencion';
import { SIGLAS } from '@/lib/siglas';
import { paisDe as nombrePais } from '@/lib/paises';
import { nombreTipo } from './TipoSitio';
import { Base, CardEdit, ClienteOpcion, DatosSitios, EdicionSitio, FORMAS, IcoCliente, IcoEscudo, Props, Punto, SitioNuevo, VACIO, corteDe, decimal, iso, num, opcionCercana, primerDia, resolverFicha, sumarHabiles } from './nuevoEnvio/comun';
import { diaCierrePrecio } from '@/lib/fechasCarga';
export type { ClienteOpcion, SitioOpcion, Base, ReglasPrecio, MiAutosusp } from './nuevoEnvio/comun';
import { Interruptor } from './nuevoEnvio/Interruptor';
import AvisoCorte from './nuevoEnvio/AvisoCorte';
import PistaScroll from './nuevoEnvio/PistaScroll';
import { CampoCliente } from './nuevoEnvio/CampoCliente';
import CampoOperador from './nuevoEnvio/CampoOperador';
import { ALMACENAMIENTOS } from '@/lib/modulos';
import { CampoSitio } from './nuevoEnvio/CampoSitio';
import { FichasSitios } from './nuevoEnvio/FichasSitios';
import AvisoCierreSitio from './nuevoEnvio/AvisoCierreSitio';
import { SelectorUrgencia } from './nuevoEnvio/SelectorUrgencia';
import Modal from './Modal';
import CajaCo2 from './CajaCo2';
import CondicionesGenerales from '@/components/CondicionesGenerales';
import { AVISO_DIAS_HABILES } from '@/lib/fechasCarga';
import Req from '@/components/Req';
import Tip from '@/components/Tip';
import CampoFecha from '@/components/CampoFecha';

export default function NuevoEnvio({ clientes: clientesIni, sitios: sitiosIni, festivos, nombresFestivos = {}, error: errorCarga, base, esCliente = false, clienteFijo = false, operadores = [], esMaster = false, fechaInicial = null, pagoPrevio = false, reglas = null, emailPropio = null }: Props) {
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
  // Navegar por código SIEMPRE con el cargador al instante: el botón responde al pulsarlo.
  const ir = (href: string) => { avisarNavegandoA(href); router.push(href); };
  const refrescar = useRefrescar();
  // Una CONSULTA DE PRECIO por ruta enseñada (usuario, 2026-11-14): alimenta «Uso de
  // Dynamo» y los límites de uso. Solo cuentan los clientes (la BD ignora al equipo), y
  // la firma de la ruta evita contar cada ajuste de mercancía, fecha o ventana.
  const consultaReg = useRef<string | null>(null);
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
  const [modoCal, setModoCal] = useState(false);   // true mientras se elige la fecha en el calendario
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
  const [verMedidas, setVerMedidas] = useState(false);   // ventana «Medidas y peso máximo»
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
  const [notasAbiertas, setNotasAbiertas] = useState(!!(be && (be.requiere_plataforma_elevadora || be.requiere_nima || be.adr || be.anotaciones_cliente || be.discrecion_comercial)));

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
  // La fecha puede venir ya elegida desde fuera (pulsar un día en la vista calendario);
  // si no cumple las reglas (muy pronto, festivo…), el ajuste automático de abajo la corrige.
  const [fecha, setFecha] = useState(editar ? (be?.fecha_carga_desde ?? '') : (fechaInicial ?? ''));
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
  // Al MODIFICAR un envío propio (usuario, 2026-11-16) llegan su transportista y su precio
  // acordado, y se puede cambiar todo libremente: es suyo, no aplica ninguna regla de Dynamo.
  const editarManual = editar && !!be?.operador_id;
  const [operador, setOperador] = useState(editarManual ? be!.operador_id! : '');
  const [precioOp, setPrecioOp] = useState(editarManual && be?.precio_acordado_operador != null ? decimal(Number(be.precio_acordado_operador)) : '');
  const manual = sinCampoCliente && !!operador;
  const nombreOp = operadores.find((o) => o.id === operador)?.nombre ?? '';

  // ---- Paso 4
  const [discrecion, setDiscrecion] = useState(!!be?.discrecion_comercial);
  // Doble confirmación al crear un envío (Dynamo): modal con costes de cancelación +
  // condiciones generales, como en el mockup. Hay que marcar el check para confirmar.
  const [revisarLegal, setRevisarLegal] = useState(false);
  // Con pago por adelantado: hasta cuándo se podría pagar si se confirma ahora (se pide al
  // abrir la ventana de confirmar; si no llega, la ventana sale igual sin esa línea).
  const [plazoPago, setPlazoPago] = useState<{ limite: string; minutos: number } | null>(null);
  const [verProforma, setVerProforma] = useState(false);   // proforma orientativa del cálculo (sin crear el envío)
  // Email del cliente para el botón «Enviar por email a:» de la proforma (usuario,
  // 2026-11-13). Se pide YA al elegir el cliente — pedirlo al abrir la ventana hacía
  // que el botón tardara 2-4 s en aparecer — y se recuerda por cliente. Sin email, no sale.
  const [emailCli, setEmailCli] = useState<string | null>(null);
  // Al CLIENTE se le propone su propio email (el de su usuario), con el mismo botón que ve
  // Dynamo con el email del cliente (usuario, 2026-11-18: «para no tener tantas
  // diferencias»); debajo sigue «Enviar a otro email» por si quiere cambiarlo.
  const emailBoton = esCliente ? (emailPropio?.trim() || null) : emailCli;
  // Enviar la proforma del cálculo por email, con el PDF adjunto (lo manda la plataforma).
  const [profOtro, setProfOtro] = useState<string | null>(null);   // null = caja cerrada; texto = el email que se está escribiendo
  const [profEnviando, setProfEnviando] = useState(false);
  const [profMsg, setProfMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const emailsCli = useRef(new Map<string, string | null>());
  useEffect(() => {
    if (esCliente || !cliente) { setEmailCli(null); return; }
    const id = cliente.id;
    const visto = emailsCli.current.get(id);
    if (visto !== undefined) { setEmailCli(visto); return; }
    setEmailCli(null);
    let vivo = true;
    emailDeCliente(id).then((e) => { emailsCli.current.set(id, e); if (vivo) setEmailCli(e); }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id, esCliente]);
  // PANTALLA DE ÉXITO (tarea 81, usuario 2026-11-13): al confirmar un envío no se suelta
  // al usuario en la lista — se le dice QUÉ PASA AHORA y a dónde ir.
  const [creado, setCreado] = useState<{ ref: string; id: string | null; modo: 'cliente' | 'admin' | 'manual'; pago?: boolean; pagoLimite?: string | null; razon?: 'primero' | 'primeros' | 'credito' | null } | null>(null);
  // Adónde lleva el botón principal de esa pantalla. Mientras el usuario lee «qué pasa
  // ahora», la ficha del envío y la lista se van PIDIENDO POR DETRÁS: al pulsar ya están
  // (usuario, 2026-11-18: «cuando pulso botones tarda»).
  const destinoCreado = creado ? (creado.id ? `/panel/envios?ver=${creado.id}` : `/panel/envios?nuevo=${encodeURIComponent(creado.ref)}`) : null;
  useEffect(() => {
    if (!destinoCreado) return;
    // Un momento DESPUÉS de crear: al guardar el envío la página se pone al día sola, y ese
    // refresco tira todo lo adelantado antes de él (medido: sin esperar, no servía de nada).
    const t = setTimeout(() => {
      try { router.prefetch(destinoCreado); router.prefetch('/panel/envios'); } catch { /* sin adelanto: se pide al pulsar */ }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoCreado]);
  // La casilla nace MARCADA (usuario, 2026-11-16): la aceptación es pulsar «Confirmar envío»
  // con el texto y las condiciones delante. Si la desmarca, no puede confirmar.
  const [aceptaLegal, setAceptaLegal] = useState(true);
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
  // Cada ventana con SU hora de corte de Parámetros (usuario, 2026-11-10).
  const cortes = { fija: reglas?.corte_fija_hora, v12: reglas?.corte_ventana_1_2_hora,
    v13: reglas?.corte_ventana_1_3_hora, v14: reglas?.corte_ventana_1_4_hora };
  const primerDiaDe = (u: 'dia' | 'estandar' | 'corta') => primerDia(u, esGrupaje, fest, cortes);
  useEffect(() => {
    if ((esGrupaje && urgencia === 'dia') || (!esGrupaje && urgencia === 'corta')) {
      // El tipo cambia solo → la fecha salta también al primer día viable del tipo nuevo.
      setUrgencia('estandar'); setFecha(primerDiaDe('estandar'));
    }
  }, [esGrupaje]); // eslint-disable-line react-hooks/exhaustive-deps
  const ventanaDias = urgencia === 'dia' ? 1 : urgencia === 'corta' ? 2 : esGrupaje ? 4 : 3;
  const fechaHasta = fecha ? (ventanaDias > 1 ? sumarHabiles(fecha, ventanaDias - 1, fest) : fecha) : '';
  const dias = useMemo(() => {
    const out: string[] = []; let d = primerDia(urgencia, esGrupaje, fest,
      { fija: reglas?.corte_fija_hora, v12: reglas?.corte_ventana_1_2_hora, v13: reglas?.corte_ventana_1_3_hora, v14: reglas?.corte_ventana_1_4_hora });
    for (let i = 0; i < 10; i++) { out.push(d); d = sumarHabiles(d, 1, fest); }
    return out;
  }, [urgencia, esGrupaje, fest, reglas]);
  // La fecha SIEMPRE válida respecto al corte (usuario, 2026-11-09): al abrir el formulario
  // ya viene puesto el primer día posible (con la ventana estándar por defecto). Al CAMBIAR
  // el tipo de fecha (fija/ventana/corta) es el propio selector quien pone el primer día
  // viable del tipo nuevo — también para el Admin Master con fechas libres, que después
  // puede cambiarla a mano (usuario, 2026-11-09). Este efecto queda de red de seguridad:
  // si reglas o festivos llegan después y el primer día se mueve, corrige. Al editar no se
  // toca (la fecha del envío manda) salvo que se cambie el tipo a mano.
  useEffect(() => {
    if (editar) return;
    if (!fecha) { setFecha(dias[0]); return; }
    if (!fechaLibre && fecha < dias[0]) setFecha(dias[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corrige solo cuando cambia el primer día posible (tipo de fecha), no al teclear la fecha
  }, [dias[0], editar, fechaLibre]);

  const sitiosCliente = useMemo(
    // Los almacenes Dynamo no se pueden elegir mientras el módulo esté apagado (lib/modulos.ts).
    () => sitios.filter((s) => (ALMACENAMIENTOS && s.es_almacen_dynamo) || (!s.es_almacen_dynamo && cliente && s.cliente_id === cliente.id)),
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
  // FACTOR DEL CLIENTE (%): va DENTRO del precio y no se enseña (usuario, 2026-11-16: «como
  // si fuera un precio normal»). El de bienvenida en sus primeros envíos, después 0 %, o el
  // que Dynamo le haya fijado. Al MODIFICAR un envío manda el factor de ese envío, para que
  // no le cambie el precio si entretanto se le acabó el descuento. undefined = aún cargando
  // (mientras, no se da precio: nunca se enseña uno sin su factor).
  const [factorCli, setFactorCli] = useState<number | undefined>(undefined);
  const clienteId = cliente?.id ?? null;
  useEffect(() => {
    setFactorCli(undefined);
    if (!clienteId) return;
    let vivo = true;
    factorTarifa(clienteId, editar && be ? be.id : null)
      .then((f) => { if (vivo) setFactorCli(f ?? 0); }).catch(() => { if (vivo) setFactorCli(0); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);
  // El TIPO de cada sitio mueve el precio (recargos de obra, finca…): va en las dependencias
  // del cálculo. Antes solo estaba la ruta (códigos postales), y al cambiar el tipo de un
  // sitio el precio no se recalculaba hasta tocar otra cosa (usuario, 2026-11-17: «con
  // fecha fija me muestra el recargo de finca y con ventana no»).
  const claveTipos = puntosRuta.map((p) => p.sitio?.tipo ?? p.nuevo?.tipo_sitio ?? 'almacen_nave').join('|');
  const tarifa = useMemo(() => {
    if (!kmInfo || !rutaCompleta || manual) return null;
    if (cliente && factorCli === undefined) return null;
    const t = calcularTarifa({ km: kmInfo.km, puntos: puntosRuta.length,
      tiposSitio: claveTipos.split('|'),
      ml: Number(ml) || 0, peso: Number(peso) || 0, mlMax, pesoMax,
      paletizada, techo: forma.toLowerCase().includes('techo'), plataforma, nima, adr,
      urgencia, fecha: fecha || null, primerDia: dias[0], hoy: hoyMadrid(), festivos });
    // CON cliente: su factor. SIN cliente elegido (solo pasa en la vista de Dynamo): el
    // precio que se da es el del tarifador público — con el descuento de bienvenida de
    // Parámetros (usuario, 2026-11-13: para dar precio a quien llama a preguntar, sin alta).
    return aplicarDescuentoTarifa(t, cliente ? (factorCli ?? 0) : Number(reglas?.bienvenida_pct ?? -7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kmInfo, claveRuta, claveTipos, rutaCompleta, manual, ml, peso, mlMax, pesoMax, paletizada, forma, plataforma, nima, adr, urgencia, fecha, dias, festivos, cliente, factorCli]);
  // El precio de tarifa de antes del factor: se anota en el envío (solo para Dynamo).
  const tarifaBase = tarifa ? (tarifa.netoBase ?? tarifa.neto) : null;
  // EL CLIENTE MODIFICA SU ENVÍO (usuario, 2026-11-16: «es como un nuevo envío, no
  // liemos»): el precio es SIEMPRE el que el tarifador calcula ahora, como al crear uno.
  const editarCliente = editar && esCliente && !editarManual;
  const precioAntesCli = editarCliente && be?.importe_cliente != null ? Number(be.importe_cliente) : null;
  const precioEdicionCli = tarifa?.neto ?? null;
  useEffect(() => {
    // Registrar la consulta cuando el tarifador ENSEÑA precio a un cliente: al llegar al
    // paso 3 «Fecha y precio», que es donde lo ve (usuario, 2026-11-21: en los pasos 1 y 2
    // aún no ha visto precio y no cuenta). Una por ruta (claveRuta), nunca al editar un
    // envío ya creado.
    if (!esCliente || editar || paso < 3 || !tarifa || !rutaCompleta) return;
    if (consultaReg.current === claveRuta) return;
    consultaReg.current = claveRuta;
    void registrarConsultaPrecio().catch(() => { /* contar la consulta nunca rompe el tarifador */ });
  }, [esCliente, editar, paso, tarifa, rutaCompleta, claveRuta]);
  // Tabla «Precios internos» (mockup): compra del tarifador (mock 72-84 % por hash de la
  // ruta), «Aplicado · media auto» y margen. Y el autorrelleno: venta = Aplicado, compra =
  // la más baja de la tabla; lo tecleado a mano no se pisa.
  const hoyStr = hoyMadrid();
  // El precio del transportista sale de la tarifa SIN el factor del cliente (usuario, 2026-11-15):
  // el descuento lo asume Dynamo y el recargo se lo queda Dynamo.
  const tarCompra = tarifa ? compraTarifador(tarifaBase ?? tarifa.neto) : 0;
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
  // Cambiar el TIPO de fecha pone SOLO el primer día viable del tipo nuevo (usuario,
  // 2026-11-09) — también para el Master con fechas libres, que después puede cambiarla.
  // Al editar, volver al tipo original del envío recupera su fecha («si no se toca nada,
  // las fechas no cambian»). Pulsar el tipo ya elegido no toca la fecha.
  const cambiarTipoFecha = (v: 'dia' | 'estandar' | 'corta') => {
    if (v !== urgencia) setFecha(editar && v === urgenciaIni && be?.fecha_carga_desde ? be.fecha_carga_desde : primerDiaDe(v));
    setUrgencia(v); setModoCal(false);
  };

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
  // Una parada se puede quitar siempre que quede al menos otra de su tipo y la ruta siga
  // empezando en recogida y acabando en entrega (usuario, 2026-11-11: también la última
  // entrega, si hay dos o más; la única recogida o la única entrega, nunca).
  const quitable = (p: Punto) => {
    if (puntos.filter((x) => x.tipo === p.tipo).length < 2) return false;
    const c = puntos.filter((x) => x.k !== p.k);
    return c.length >= 2 && c[0].tipo === 'carga' && c[c.length - 1].tipo === 'descarga';
  };
  function quitar(p: Punto) {
    setPuntos((l) => {
      if (l.filter((x) => x.tipo === p.tipo).length < 2) return l;
      const c = l.filter((x) => x.k !== p.k);
      return c.length >= 2 && c[0].tipo === 'carga' && c[c.length - 1].tipo === 'descarga' ? c : l;
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
      // Dynamo puede avanzar SIN cliente para calcular solo el precio (usuario,
      // 2026-11-13); crear el envío sí lo exige (aviso en el propio botón).
      if (!cliente && sinCampoCliente) return 'Elige el cliente del envío.';
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
        const corteTxt = corteDe(urgencia, esGrupaje, cortes);
        return `Esa fecha ya no llega (el corte de las ${corteTxt}:00 ha pasado): el primer día de carga posible es el ${fmtFecha(dias[0])}. Elige otra fecha.`;
      }
      if (!esCliente && !manual && !(importe > 0)) return 'Pon el precio del cliente (base sin IVA).';
      if (!esCliente && !manual && importeT !== null && !(importeT >= 0)) return 'El precio del transportista no es un número válido.';
      // Sin cliente se puede llegar hasta aquí para CALCULAR el precio (2026-11-13), pero
      // Confirmar ya es crear el envío: sin este freno, el paso 4 salía en blanco
      // (usuario, 2026-11-14).
      if (!esCliente && !cliente) return 'Para pasar a Confirmar, elige el cliente del envío (está en el paso 1 · Ruta). Sin cliente puedes calcular el precio, pero no crear el envío.';
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
    // Países fuera de cobertura en UN solo aviso claro (usuario, 2026-11-14): «Envío no
    // disponible con origen/destino: Panamá. Trabajamos en España, …» — el país ofensor
    // una vez (con su nombre, no el código ISO) y la lista de países una sola vez. Las
    // restricciones con mensaje propio (zonas, islas, solo completo…) siguen como antes.
    const fuera: string[] = []; let lista = ''; const otros: string[] = [];
    for (const x of malos) {
      const m = x.mensaje.match(/^No trabajamos en (.+?)\. Trabajamos en (.+)\. Escríbenos/);
      if (m) {
        let n = m[1];
        if (/^[A-Z]{2}$/.test(n)) { try { n = new Intl.DisplayNames(['es'], { type: 'region' }).of(n) ?? n; } catch { /* el código tal cual */ } }
        if (!fuera.includes(n)) fuera.push(n);
        lista = m[2];
      } else otros.push(`${x.punto}: ${x.mensaje}`);
    }
    const partes: string[] = [];
    if (fuera.length) {
      const quien = fuera.length > 1 ? `${fuera.slice(0, -1).join(', ')} y ${fuera[fuera.length - 1]}` : fuera[0];
      partes.push(`Envío no disponible con origen/destino: ${quien}.\n\nTrabajamos en ${lista}.`);
    }
    if (otros.length) partes.push(`Esta ruta no la podemos hacer: ${[...new Set(otros)].join(' · ')}`);
    return partes.join('\n\n');
  }
  async function siguiente() {
    const e = errorPaso(paso) ?? await coberturaError(paso);
    if (e) { setAviso(e); if (paso === 3 && !fecha) setFaltaFecha(true); return; }
    setAviso(null); setPaso((p) => Math.min(4, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function atras() {
    setAviso(null);
    if (paso === 1) ir('/panel/envios'); else { setPaso((p) => p - 1); window.scrollTo({ top: 0 }); }
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
    ir(`/panel/envios?ver=${base.envio.id}`);
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
          url_google_maps: f.maps || null,
          horario_tramos: tramosDe(f.horario),
          // El horario de VERANO solo se manda si se tocó en la tarjeta (usuario, 2026-11-10).
          verano: edicSitios[p.k]?.verano ? { activo: f.verano.activo, desde: f.verano.desde, hasta: f.verano.hasta, tramos: tramosDe(f.verano.horario) } : undefined,
          contactos_extra: (edicSitios[p.k]?.extra ?? []).filter((x) => x.nombre.trim() || x.telefono.trim() || x.email.trim()),
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
    if (editarManual) {
      // Envío con SU transportista: se guarda tal cual, sin reglas ni avisos.
      if (!operador) { setEnviando(false); setAviso('Elige tu transportista.'); setPaso(1); return; }
      const po = precioOp.trim() ? num(precioOp) : null;
      if (po !== null && !(po >= 0)) { setEnviando(false); setAviso('El precio acordado no es un número válido.'); setPaso(3); return; }
      const rm = await guardarEdicionEnvioManual(base.envio.id, {
        referencia_cliente: refCli,
        fecha_carga_desde: fechasIguales ? (be!.fecha_carga_desde ?? '') : fecha,
        fecha_carga_hasta: fechasIguales ? (be!.fecha_carga_hasta ?? be!.fecha_carga_desde ?? '') : fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        metros_lineales: Number(ml), toneladas: Number(peso),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'), carga_techo: f.includes('techo'),
        requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
        operador_id: operador, precio_acordado_operador: po,
        discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
      }, paradas);
      if (!rm.ok) { setEnviando(false); setAviso(rm.error); return; }
      ir(`/panel/envios?ver=${base.envio.id}`);
      refrescar();
      return;
    }
    if (esCliente) {
      // El cliente guarda con el precio que tiene en pantalla: el del tarifador.
      if (precioEdicionCli == null) { setEnviando(false); setAviso('El precio aún se está calculando: espera un momento y vuelve a pulsar.'); setPaso(3); return; }
      const rc = await guardarEdicionEnvioCliente(base.envio.id, {
        referencia_cliente: refCli,
        fecha_carga_desde: fechasIguales ? (be!.fecha_carga_desde ?? '') : fecha,
        fecha_carga_hasta: fechasIguales ? (be!.fecha_carga_hasta ?? be!.fecha_carga_desde ?? '') : fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        metros_lineales: Number(ml), toneladas: Number(peso),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'), carga_techo: f.includes('techo'),
        requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
        importe_cliente: precioEdicionCli, importe_tarifa: tarifaBase,
        discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
      }, paradas);
      if (!rc.ok) { setEnviando(false); setAviso(rc.error); return; }
      ir(`/panel/envios?ver=${base.envio.id}`);
      refrescar();
      return;
    }
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
    ir(`/panel/envios?ver=${base.envio.id}`);
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
          url_google_maps: f.maps || null,
          horario_tramos: tramosDe(f.horario),
          // El horario de VERANO solo se manda si se tocó en la tarjeta (usuario, 2026-11-10).
          verano: edicSitios[p.k]?.verano ? { activo: f.verano.activo, desde: f.verano.desde, hasta: f.verano.hasta, tramos: tramosDe(f.verano.horario) } : undefined,
          contactos_extra: (edicSitios[p.k]?.extra ?? []).filter((x) => x.nombre.trim() || x.telefono.trim() || x.email.trim()),
        };
      });
    if (edicExist.length) {
      const g = await guardarEdicionesSitios(edicExist);
      if (!g.ok) { setEnviando(false); setAviso(g.error); return; }
    }
    // Anotaciones de ESA parada: la cita previa y el detalle de mercancía del paso 4.
    const anotParada = (p: (typeof puntos)[number]) => {
      const c = edicSitios[p.k];
      const cita = c?.cita ? ['CITA PREVIA' + (c.citaHora ? ` a las ${c.citaHora}` : ''), (c.citaDetalle ?? '').trim()].filter(Boolean).join(' · ') : '';
      // El detalle de mercancía RESUELTO: lo editado en el paso 4 o, si no se tocó, el
      // por defecto del sitio (usuario, 2026-11-10).
      const merc = resolverFicha(p, datosSitios, c, mercResumen).mercancia.trim().replace(/\s*\n+\s*/g, ' · ');
      return [cita, merc ? `MERCANCÍA: ${merc}` : ''].filter(Boolean).join(' · ') || undefined;
    };
    const paradas: ParadaNueva[] = puntos.map((p, i) => {
      const ref = i === 0 && refCli ? refCli : undefined;
      if (p.sitio) return { tipo: p.tipo, sitio_id: p.sitio.id, referencia: ref, anotaciones: anotParada(p) };
      const n = p.nuevo!;
      // Datos del sitio nuevo con lo corregido en la confirmación encima.
      const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
      const hr = edicSitios[p.k]?.horario ?? n.horario;
      return {
        tipo: p.tipo, nombre_empresa: f.empresa, direccion: n.direccion, codigo_postal: n.codigo_postal,
        poblacion: n.poblacion, provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso,
        tipo_sitio: n.tipo_sitio, horarios: n.horarios, guardar_en_agenda: n.guardar, referencia: ref, anotaciones: anotParada(p),
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
      setEnviando(false); setRevisarLegal(false);
      setCreado({ ref: rm.referencia_gx, id: rm.id, modo: 'manual' });
      router.refresh();   // sin el velo «Actualizando»: taparía la pantalla de éxito (usuario, 2026-11-14)
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
        importe_cliente: tarifa.neto, importe_tarifa: tarifaBase,
        discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio,
      }, paradas);
      if (!rs.ok) { setEnviando(false); setAviso(rs.error); return; }
      setEnviando(false); setRevisarLegal(false);
      setCreado({ ref: rs.referencia_gx, id: rs.id, modo: 'cliente', pago: rs.pagoPendiente, pagoLimite: rs.pagoLimite, razon: rs.pagoRazon });
      router.refresh();   // sin el velo «Actualizando»: taparía la pantalla de éxito (usuario, 2026-11-14)
      return;
    }
    const r = await crearEnvio({
      cliente_id: cliente.id, referencia_cliente: refCli,
      fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
      descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
      toneladas: Number(peso), metros_lineales: Number(ml),
      paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
      carga_techo: f.includes('techo'), requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
      importe_cliente: importe, importe_transportista: importeT, importe_tarifa: tarifaBase,
      discrecion_comercial: discrecion, anotaciones_cliente: notasEnvio, negociacion_pct: neg,
    }, paradas);
    if (!r.ok) { setEnviando(false); setAviso(r.error); return; }
    setEnviando(false); setRevisarLegal(false);
    setCreado({ ref: r.referencia_gx, id: r.id, modo: 'admin' });
    router.refresh();   // sin el velo «Actualizando»: taparía la pantalla de éxito (usuario, 2026-11-14)
  }

  // ---- Opciones de los desplegables (las del mockup)
  const optsMl: [string, string][] = [];
  // Con las palabras ENTERAS «europalets / americanos» (usuario, 2026-11-12: las
  // abreviaturas «euro / amer.» no se entendían).
  for (let i = 1; i <= mlMax; i++) optsMl.push([String(i), `${i} ${i === 1 ? 'metro' : 'metros'} · Grupaje ≈${Math.floor(i * 2.5)} europalets / ${Math.floor(i * 2)} americanos`]);
  if (mlMax === 13) optsMl.push(['13.3', '13,30 metros · Tráiler completo (33 europalets / 26 americanos)']);
  const optsPeso: [string, string][] = [['0.2', 'De 0 a 200 kg'], ['0.4', 'De 200 a 400 kg'], ['0.6', 'De 400 a 600 kg'], ['0.8', 'De 600 a 800 kg'], ['1', 'De 800 kg a 1 tonelada']];
  for (let lo = 1, hi = 3; lo < pesoMax; hi += 2) { if (hi > pesoMax) hi = pesoMax; optsPeso.push([String(hi), `De ${lo} a ${hi} toneladas${hi === pesoMax ? ' (máximo)' : ''}`]); if (hi === pesoMax) break; lo = hi; }
  const mlTxt = optsMl.find(([v]) => v === ml)?.[1] ?? '';
  const pesoTxt = optsPeso.find(([v]) => v === peso)?.[1] ?? '';
  // Resumen de la mercancía del paso 2 en UNA línea (usuario, 2026-11-10): prerrellena el
  // «detalle de mercancía» de cada parada del paso 4 (editable/borrable allí).
  // Formato elegido por el usuario (2026-11-10): «6 metros · Grupaje · De 800 kg a 1
  // tonelada» / «13,30 metros · Tráiler completo · De 23 a 24 toneladas (máximo)».
  const mercResumen = [mlTxt.split(' ·')[0], ml === '13.3' ? 'Tráiler completo' : 'Grupaje', pesoTxt].filter(Boolean).join(' · ');
  const camionTxt = plataforma ? 'Camión rígido con plataforma elevadora (8 m · 14 Tn · altura máx. 2,40 m)' : 'Tráiler tauliner (lona corredera · altura máx. 2,70 m)';
  // Precio provisional: si para la carga faltan más de N días HÁBILES, se revisa y queda
  // cerrado justo N días hábiles antes (un solo parámetro; usuario, 2026-11-16).
  const diasHasta = fecha ? Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())}T12:00:00Z`)) / 86400000) : 0;
  const diaCierre = reglas && fecha ? diaCierrePrecio(fecha, reglas.cerrado_dias_habiles, hoyMadrid(), fest) : null;
  const provisional = !!diaCierre;
  const maxFecha = esCliente && reglas && reglas.antelacion_max_dias > 0
    ? hoyMadrid(reglas.antelacion_max_dias) : undefined;
  const avisoProvisional = provisional && reglas ? (
    <div className="pt-aviso" style={{ marginTop: '0.6rem' }}><div>
      <strong>Precio provisional:</strong> como faltan más de {reglas.cerrado_dias_habiles} días hábiles para la carga, el precio se revisa y queda cerrado <strong>{reglas.cerrado_dias_habiles} días hábiles antes{diaCierre ? ` (el ${fmtFecha(diaCierre)})` : ''}</strong>.
    </div></div>) : null;
  const fechaTxt = fecha ? (fechaHasta && fechaHasta !== fecha ? `del ${fmtFecha(fecha)} al ${fmtFecha(fechaHasta)}` : fmtFecha(fecha)) : '';
  // Fecha ESTIMADA por parada (usuario, 2026-11-10): SOLO la 1.ª parada lleva la fecha
  // de carga elegida (fija/ventana); el resto —recogidas y entregas— va en CASCADA por
  // etapas: «Recogida/Entrega estimada · …» según su posición en la ruta (tránsito
  // proporcional a ~600 km por día hábil; una parada cercana cae en el mismo día). La
  // última parada usa la ETA del tarifador.
  const fechasParada = useMemo(() => {
    const out: Record<number, string> = {};
    if (!fecha || !kmInfo) return out;
    const n = puntos.length;
    puntos.forEach((p, i) => {
      if (i === 0) return;   // la 1.ª es la fecha de carga elegida (la pinta la tarjeta)
      let d1: string, d2: string;
      if (i === n - 1 && tarifa?.etaDesde) { d1 = tarifa.etaDesde; d2 = tarifa.etaHasta ?? tarifa.etaDesde; }
      else {
        const tr = Math.ceil((kmInfo.km * (i / (n - 1))) / 600);
        d1 = tr > 0 ? sumarHabiles(fecha, tr, fest) : fecha;
        d2 = fechaHasta && fechaHasta !== fecha ? (tr > 0 ? sumarHabiles(fechaHasta, tr, fest) : fechaHasta) : d1;
      }
      out[p.k] = `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} estimada · ${d1 === d2 ? fmtFecha(d1) : `del ${fmtFecha(d1)} al ${fmtFecha(d2)}`}`;
    });
    return out;
  }, [puntos, fecha, fechaHasta, fest, kmInfo, tarifa]);
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
    // Solo los de lunes a viernes: un festivo en sábado o domingo no cambia nada (esos días
    // nunca son de carga) y el aviso solo despistaba (2026-11-19).
    while (iso(x) <= (fechaHasta || fecha)) { const k = iso(x); if (fest.has(k) && x.getDay() !== 0 && x.getDay() !== 6) out.push(`${fmtFecha(k)} · ${nombresFestivos[k] ?? 'festivo'}`); x.setDate(x.getDate() + 1); }
    return out;
  })();
  const IcoAviso = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
  const IcoSol = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><line x1="12" y1="2.5" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="21.5" /><line x1="4.6" y1="4.6" x2="6" y2="6" /><line x1="18" y1="18" x2="19.4" y2="19.4" /><line x1="2.5" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="21.5" y2="12" /><line x1="4.6" y1="19.4" x2="6" y2="18" /><line x1="18" y1="6" x2="19.4" y2="4.6" /></svg>);
  // Tarjeta azul del camión y la mercancía: en el paso 3 va DEBAJO del bloque de la fecha
  // de recogida y en el paso 4 (Revisión) encima del precio — usuario, 2026-11-11: lo que
  // se cotiza, a la vista.
  const tarjetaMercancia = (
    <div className="sum2-box sum2-azul" style={{ marginBottom: '0.6rem' }}>
      <div className="sum2-cell sum2-full"><div className="sum2-k">Tipo de camión</div><div className="sum2-v">{camionTxt}</div></div>
      <div className="sum2-grid">
        <div className="sum2-cell"><div className="sum2-k">Metros lineales</div><div className="sum2-v">{ml === '13.3' ? '13,30 metros · Tráiler completo' : mlTxt.split(' ·')[0]}</div></div>
        <div className="sum2-cell"><div className="sum2-k">Peso</div><div className="sum2-v">{pesoTxt}</div></div>
        <div className="sum2-cell"><div className="sum2-k">Tipo de carga</div><div className="sum2-v">{forma}</div></div>
        <div className="sum2-cell"><div className="sum2-k">Tipo</div><div className="sum2-v">{paletizada ? 'Paletizada' : 'No paletizada'}</div></div>
        {nima && <div className="sum2-cell"><div className="sum2-k">Requiere NIMA</div><div className="sum2-v">Sí</div></div>}
        {adr && <div className="sum2-cell"><div className="sum2-k">Mercancía ADR</div><div className="sum2-v">Sí</div></div>}
      </div>
      {notasEnvio && <div className="sum2-cell sum2-full"><div className="sum2-k">Anotaciones de la mercancía</div><div className="sum2-notas">{notasEnvio}</div></div>}
      {/* Aviso en color cuando la discreción está activada (usuario, 2026-11-13). */}
      {discrecion && (
        <div className="modal-warn-box" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          <strong>Discreción comercial activada:</strong> el conductor no dirá en la carga a quién va la mercancía ni en la entrega de dónde viene — la orden de carga se lo recuerda en su idioma.
        </div>
      )}
    </div>
  );
  // Festivo en los días de recogida: en el paso 3, debajo de las fechas (usuario, 2026-11-19;
  // antes salía con los avisos de los sitios en el paso 4).
  const avisoFestivo = festivosEnVentana.length > 0 ? (
    <div className="pt-aviso error aviso-festivo" style={{ marginTop: '0.6rem', marginBottom: 0 }}><IcoAviso /><div>
      <strong>Festivo nacional en la fecha de carga.</strong> {festivosEnVentana.join(' · ')}. Puede que el almacén esté <strong>cerrado</strong> ese día: confírmalo con el punto de recogida.
    </div></div>
  ) : null;
  const avisosPaso4 = (
    <>
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

  // ---- MODIFICAR: mini-resumen del precio ANTES → AHORA (usuario, 2026-11-10) --------
  // Solo lectura: el precio del transportista se edita en «Precios internos» (paso 3),
  // no hace falta repetir el campo aquí (usuario, 2026-11-10).
  const pcAnt = editar && be?.importe_cliente != null ? Number(be.importe_cliente) : null;
  const ptAnt = editar && be?.importe_transportista != null ? Number(be.importe_transportista) : null;
  const margenAnt = pcAnt != null && ptAnt != null ? pcAnt - ptAnt : null;
  const margenAhora = importe > 0 && importeT != null ? importe - importeT : null;
  const Delta = ({ antes, ahora }: { antes: number | null; ahora: number | null }) => {
    if (antes == null || ahora == null || antes === ahora) return null;
    const d = ahora - antes;
    return <span style={{ marginLeft: '0.4rem', fontWeight: 800, color: d > 0 ? 'var(--green-dark)' : '#b42318' }}>({d > 0 ? '+' : '−'}{eur(Math.abs(d))})</span>;
  };
  const resumenCambioPrecio = !editar ? null : (
    <div className="ptar-confirm-price" style={{ marginTop: '0.6rem' }}>
      <div className="alm-price-row alm-price-sub" style={{ fontWeight: 800, color: 'var(--navy)' }}><span className="k">Antes → ahora</span><span className="v" /></div>
      <div className="alm-price-row alm-price-sub"><span className="k">Cliente</span>
        <span className="v">{pcAnt != null ? eur(pcAnt) : '—'} → <strong>{importe > 0 ? eur(importe) : '—'}</strong><Delta antes={pcAnt} ahora={importe > 0 ? importe : null} /></span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">Transportista</span>
        <span className="v">{ptAnt != null ? eur(ptAnt) : '—'} → <strong>{importeT != null ? eur(importeT) : '—'}</strong><Delta antes={ptAnt} ahora={importeT} /></span></div>
      <div className="alm-price-row alm-price-sub"><span className="k">Margen</span>
        <span className="v">{margenAnt != null ? eur(margenAnt) : '—'} → <strong style={{ color: margenAhora == null ? undefined : margenAhora >= 0 ? 'var(--green-dark)' : '#b42318' }}>{margenAhora != null ? eur(margenAhora) : '—'}</strong><Delta antes={margenAnt} ahora={margenAhora} /></span></div>
      {importe > 0 && pcAnt != null && importe !== pcAnt && (
        <p style={{ margin: '0.45rem 0 0', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4 }}>
          El precio del cliente {importe > pcAnt ? 'SUBE' : 'BAJA'}: si toca negociar el del transportista, ajústalo en «Precios internos» (paso anterior) antes de guardar.</p>
      )}
    </div>
  );

  // Botonera del asistente (usuario, 2026-11-09): en el paso 3 va DENTRO de la columna
  // del precio, justo debajo de la caja «Precio sugerido»; en los pasos 1-2, al fondo.
  const navBotones = (
    <div className="wiz-navwrap">
      <div className="wiz-nav">
        <button type="button" className="btn-ghost" onClick={enRuta || (editar && paso === 1) ? () => ir(`/panel/envios?ver=${be!.id}`) : atras}>{paso === 1 ? 'Cancelar' : '← Atrás'}</button>
        {enRuta
          ? <button type="button" className="btn-primary" onClick={guardarRuta} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar ruta'}</button>
          // SIN cliente no hay paso Confirmar (solo se calcula el precio): en el paso 3 el
          // botón pasa a «Ver proforma» y abre su ventana (usuario, 2026-11-15), en vez de
          // chocar con el aviso rojo de «elige el cliente».
          : paso === 3 && !esCliente && !cliente
          ? <button type="button" className="btn-primary" data-pista-accion disabled={comprobando}
              onClick={() => { if (importe > 0) { setAviso(null); setVerProforma(true); } else setAviso('Falta el precio del envío: ponlo en «Precios internos» o usa el sugerido.'); }}>
              Ver proforma</button>
          : <button type="button" className="btn-primary" data-pista-accion onClick={siguiente} disabled={comprobando}>{comprobando ? 'Comprobando la ruta…' : paso === 3 ? 'Ver resumen →' : 'Siguiente →'}</button>}
      </div>
      {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
    </div>
  );

  // Pantalla de éxito: sustituye al asistente entero una vez creado el envío.
  if (creado) {
    const pasosExito = creado.modo === 'cliente' ? [
      <>Tu envío está <strong>programado con el precio cerrado</strong> que acabas de confirmar.</>,
      <>Dynamo asigna el camión: la <strong>matrícula y el conductor</strong> aparecerán en la ficha del envío y te avisaremos por <strong>email</strong>.</>,
      <>El día de la carga podrás seguir el <strong>estado en vivo</strong>; al finalizar el envío subiremos la <strong>documentación firmada</strong> a los documentos del envío o a la sección Administración / Albaranes.</>,
    ] : creado.modo === 'manual' ? [
      <>El envío queda <strong>programado con tu operador</strong>: Dynamo no interviene en nada.</>,
      <>Desde la ficha puedes sacar la <strong>orden de carga en PDF</strong> y apuntar matrícula y conductor.</>,
      <>El seguimiento funciona igual que en cualquier envío.</>,
    ] : [
      <>El envío queda <strong>programado y pendiente de transportista</strong>.</>,
      <>Asígnalo desde la ficha: a mano, por <strong>enlace</strong> o con la <strong>oferta escalonada por email</strong>.</>,
      <>Con transportista y día de carga, la <strong>orden de carga</strong> le llega sola por email y el almacén de entrega recibe su aviso.</>,
    ];
    const btnAncho = { width: '100%', minHeight: 52, justifyContent: 'center' } as const;
    return (
      <section className="section active" id="sec-nueva-carga">
        <div className="ptar-card" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div aria-hidden style={{ width: 64, height: 64, margin: '0.4rem auto 0.8rem', borderRadius: '50%', background: 'rgba(34,165,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 style={{ margin: '0 0 0.25rem', textAlign: 'center' }}>¡Envío #{creado.ref} creado!</h2>
          <p style={{ margin: '0 0 1.1rem', color: 'var(--gray-500)', textAlign: 'center' }}>Esto es lo que pasa ahora:</p>
          {/* SOLO cuentas con pago por adelantado (usuario, 2026-11-14): caja roja; si
              no aplica, no se dice nada del pago. */}
          {(creado.pago ?? pagoPrevio) && creado.modo === 'cliente' && (
            <div className="pt-aviso error" role="alert" style={{ marginBottom: '1rem' }}><div>
              <strong>Pendiente de pago.</strong> Hasta que no se abone, <strong>no se procesa ninguna reserva de
              transporte</strong>. La <strong>fecha y la ventana de carga empiezan a contar a partir del pago</strong>
              {' '}(te mandamos la proforma por email).
              {creado.pagoLimite && (
                <div id="exito-pago-plazo" style={{ marginTop: '0.45rem' }}>
                  <CuentaAtras grande hasta={creado.pagoLimite} vencidoTxt="Plazo vencido: el envío se anula en breve" />
                  <strong>Tienes hasta el {fechaHora(creado.pagoLimite)} para pagar</strong>: con tarjeta, o por transferencia inmediata avisándonos después con el botón «Ya he hecho la transferencia» de la ficha del envío (el plazo se para mientras la validamos).
                  {' '}Pasado el plazo sin pago ni aviso, el envío y su proforma <strong>se anulan solos</strong> y tendrás que crear un envío nuevo, con el precio de ese momento.
                </div>
              )}
              {creado.razon && (
                <div id="exito-pago-razon" style={{ marginTop: '0.45rem' }}>
                  <strong>¿Por qué?</strong>{' '}
                  {creado.razon === 'primero' ? <>Es tu <strong>primer envío</strong> con nosotros y el primero se paga por adelantado. Tu cuenta tiene crédito: los siguientes irán a crédito.</>
                    : creado.razon === 'primeros' ? <>Es uno de tus <strong>primeros envíos</strong> con nosotros y esos se pagan por adelantado. Tu cuenta tiene crédito: los siguientes irán a crédito.</>
                    : <>Tu cuenta tiene crédito, pero <strong>con este envío superas el que te queda disponible</strong>, así que este se paga por adelantado. Si crees que es un error, contáctanos y lo revisamos.</>}
                </div>
              )}
            </div></div>
          )}
          <ol style={{ margin: '0 0 1.3rem', padding: 0, listStyle: 'none', display: 'grid', gap: '0.65rem' }}>
            {pasosExito.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                <span aria-hidden style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-s)' }}>{i + 1}</span>
                <span style={{ fontSize: 'var(--fs-m)', color: 'var(--navy)', lineHeight: 1.45 }}>{t}</span>
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <button type="button" className="btn-primary" style={btnAncho}
              onClick={() => ir(destinoCreado!)}>
              {creado.modo === 'admin' ? 'Abrir el envío (asignar transportista)' : 'Ver mi envío'}</button>
            <button type="button" className="btn-secondary" style={btnAncho} onClick={() => { avisarNavegando(); window.location.assign('/panel/nuevo-envio'); }}>Crear otro envío</button>
            <button type="button" className="btn-ghost" style={{ ...btnAncho, minHeight: 48 }} onClick={() => ir('/panel/envios')}>Ir a la lista de envíos</button>
          </div>
        </div>
      </section>
    );
  }

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
      {editar && paso === 1 && (editarManual
        ? <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Estás <strong>modificando tu envío #{be!.referencia_gx}</strong>, que llevas con <strong>tu propio transportista</strong>: cambia lo que quieras en cualquier paso (ruta, fechas, mercancía, transportista, precio) y pulsa <strong>«Guardar cambios»</strong> al final. Es tuyo: no se aplica ninguna condición ni se avisa a nadie.</div></div>
        : editarCliente
        ? <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Estás <strong>modificando tu envío #{be!.referencia_gx}</strong>: cambia lo que haga falta en cualquier paso y pulsa <strong>«Guardar cambios»</strong> al final. <strong>El precio se vuelve a calcular</strong> como en un envío nuevo.</div></div>
        : <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Estás <strong>modificando el envío #{be!.referencia_gx}</strong>: cambia lo que haga falta en cualquier paso y pulsa <strong>«Guardar cambios»</strong> al final. Si no tocas nada que afecte al precio (ruta, mercancía, fechas), <strong>el precio se queda como está</strong> — el tarifador solo sugiere, no lo pisa.</div></div>
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
                        // Al elegir cliente se limpian también las DIRECCIONES sueltas del modo
                        // sin cliente (nuevo con guardar:false): la ruta pasa a ser de su agenda.
                        setPuntos((l) => l.map((p) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : null, nuevo: null })));
                        if (!c) return;
                        // Sus sitios se piden ahora; su almacén principal pasa a la primera recogida.
                        const suyos = sitiosRef.current.some((x) => x.cliente_id === c.id) ? [] : await sitiosDelCliente(c.id).catch(() => [] as typeof sitiosIni);
                        if (suyos.length) setSitios((l) => [...l.filter((x) => x.cliente_id !== c.id), ...suyos]);
                        const todos = suyos.length ? [...sitiosRef.current, ...suyos] : sitiosRef.current;
                        const prin = c.principal_id ? todos.find((x) => x.id === c.principal_id && x.cliente_id === c.id) ?? null : null;
                        if (prin) setPuntos((l) => l.map((p, i) => (i === 0 && !p.nuevo && !p.sitio?.es_almacen_dynamo ? { ...p, sitio: prin } : p)));
                      }}
                      onNuevo={(c) => { setClientes((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre))); setCliente(c); setNima(false); }} />}
                    {!cliente && !enRuta && !editar && <p className="ptar-admin-precio-note" style={{ marginTop: '0.4rem' }}>Sin cliente también puedes seguir y <strong>calcular el precio</strong>: escribe las direcciones en la ruta (se autocompletan solas) y se aplica el <strong>descuento de bienvenida</strong> (el de cliente nuevo, el mismo del tarifador público). Para <strong>crear el envío</strong> sí hay que elegirlo.</p>}
                  </div>
                  </>}

                  {sinCampoCliente && (!base || editarManual) && (<>
                    <div className="ptar-section-head">Transportista / operador{' '}
                      <Tip texto="¿Trabajas también con transportistas propios? Dalos de alta en Transportistas y podrás registrar aquí esos envíos (Dynamo no interviene) y tenerlo todo unificado." aria="Ayuda sobre transportistas propios" />
                    </div>
                    <div className="ptar-field ptar-field-full">
                      <CampoOperador operadores={operadores} valor={operador} onCambio={setOperador} />
                      {manual && <p className="ptar-admin-precio-note" style={{ marginTop: '0.4rem' }}>Envío con <strong>tu propio transportista</strong>: Dynamo no interviene en nada. La plataforma te sirve para organizarlo y sacar la <strong>orden de carga</strong> en PDF.</p>}
                    </div>
                  </>)}
                  <div className="ptar-section-head">Ruta</div>
                  {puntos.map((p, i) => (
                    <div key={p.k} data-parada={p.k} className={`ptar-field ptar-field-full${arrastrando === p.k ? ' ptar-dragging' : ''}`}>
                      <CampoSitio punto={p} numero={i + 1} sitios={sitiosCliente} deshabilitado={false} modoDireccion={!cliente} asa={asaDe(p)}
                        cliente={cliente} dynamo={!esCliente}
                        onCreado={async (id) => {
                          // El sitio recién creado en la ventana de Crear sitio: recargar la
                          // agenda del cliente y dejarlo elegido en ESTA parada.
                          if (!cliente) return;
                          const suyos = await sitiosDelCliente(cliente.id).catch(() => [] as typeof sitiosIni);
                          if (suyos.length) setSitios((l) => [...l.filter((x) => x.cliente_id !== cliente.id), ...suyos]);
                          const sit = suyos.find((x) => x.id === id);
                          if (sit) cambiar(p, { sitio: sit, nuevo: null });
                        }}
                        placeholder={!cliente ? (p.tipo === 'carga' ? 'Recogida · escribe la dirección o población' : 'Entrega · escribe la dirección o población')
                          : i === 0 ? (esCliente ? 'Recogida · busca en tus sitios' : 'Recogida · busca en la agenda del cliente')
                          : i === puntos.length - 1 ? (esCliente ? 'Entrega · busca en tus sitios' : 'Entrega · busca en la agenda del cliente')
                          : p.tipo === 'carga' ? 'Otra recogida · busca en la agenda' : 'Otra entrega · busca en la agenda'}
                        onCambio={(c) => cambiar(p, c)}
                        onQuitar={quitable(p) ? () => quitar(p) : undefined}
                        onAnadir={total < 4 ? () => nuevaParada(p) : undefined}
                        onAlternar={i > 0 && i < puntos.length - 1 ? () => alternarTipo(p) : undefined} />
                      {i === 0 && p.sitio && cliente?.principal_id === p.sitio.id && (
                        <p className="ptar-prin-badge"><span className="ptar-prin-star" aria-hidden="true">★</span> {esCliente ? 'Tu almacén principal' : 'Almacén principal del cliente'} · origen por defecto{' '}
                          <Tip texto={esCliente
                            ? 'Se preselecciona como recogida en cada envío nuevo. Puedes cambiar cuál es tu sitio principal con la estrella en Sitios.'
                            : 'Se preselecciona como recogida en cada envío nuevo. El sitio principal se cambia con la estrella en Sitios.'} aria="Ayuda sobre el almacén principal" />
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
                    {/* Altura máxima SIEMPRE visible (usuario, 2026-11-12): que el cliente sepa
                        el espacio que contrata. Tráiler 2,70 m; con plataforma elevadora va en
                        camión rígido y baja a 2,40 m. */}
                    {/* Es un ENLACE (usuario, 2026-11-16): abre la ventana con las medidas y el
                        peso máximo de los dos camiones, ya en el de este envío. Sin el tipo de
                        camión al lado: se ve dentro de la ventana. */}
                    <button type="button" onClick={() => setVerMedidas(true)} title="Ver medidas y peso máximo del camión"
                      style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: '0.25rem', font: 'inherit', fontSize: 'var(--fs-s)', fontWeight: 600, color: 'var(--purple)', textAlign: 'left', textDecoration: 'underline', cursor: 'pointer' }}>
                      {/* Alto Y ANCHO del camión de ESTE envío (usuario, 2026-11-17), de la misma tabla que la ventana. */}
                      Altura máxima: <strong>{altoAncho(plataforma ? 'rigido' : 'trailer').alto}</strong> / Ancho máximo: <strong>{altoAncho(plataforma ? 'rigido' : 'trailer').ancho}</strong>
                    </button>
                    {verMedidas && <MedidasCamion inicial={plataforma ? 'rigido' : 'trailer'} onCerrar={() => setVerMedidas(false)} />}
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
                      <strong>Añadir notas/nº de pedido, plataforma elevadora, NIMA o discreción comercial</strong> (opcional)
                    </button>
                    {notasAbiertas && (
                      <div className="ptar-notes-body">
                        <div className="ptar-field">
                          <label className="ptar-label" htmlFor="ne-ref">Nº de pedido / Anotaciones <Req si={false} /></label>
                          <input id="ne-ref" type="text" className="ptar-select" placeholder="Ej. PED-0426 / ALB-1234, instrucciones breves…" value={refCli} onChange={(e) => setRefCli(e.target.value)} />
                        </div>
                        <div className="ptar-pair" style={{ marginTop: '0.9rem' }}>
                          <Interruptor titulo="Plataforma elevadora" valor={plataforma}
                            onCambio={(v) => {
                              // Los metros y el peso elegidos SE MANTIENEN (usuario, 2026-11-11):
                              // solo se recortan si superan el máximo del rígido (8 m / 14 Tn);
                              // al quitarla no se toca nada (el 14 Tn pasa a su tramo de tráiler).
                              setPlataforma(v);
                              const mlN = Number(ml) || 0, pesoN = Number(peso) || 0;
                              const recorta = v && (mlN > 8 || pesoN > 14);
                              if (v) { if (mlN > 8) setMl('8'); if (pesoN > 14) setPeso('14'); }
                              else if (peso === '14') setPeso('15');
                              avisar(v
                                ? `Con plataforma elevadora el camión pasa a RÍGIDO: máximo 8 m, 14 Tn y 2,40 m de altura${recorta ? ' (metros y peso ajustados a ese máximo)' : ''}.`
                                : 'Sin plataforma vuelves a TRÁILER: máximo 13,3 m, 24 Tn y 2,70 m de altura. Tus metros y peso se mantienen.');
                            }} />
                          <Interruptor titulo="Requiere NIMA" valor={nima} onCambio={setNima} tip={SIGLAS.NIMA} />
                          <Interruptor titulo="Mercancía ADR" valor={adr} onCambio={setAdr} tip={SIGLAS.ADR} />
                        </div>
                        {/* Discreción comercial DENTRO del desplegable (usuario, 2026-11-12);
                            antes iba suelta en el paso 1. */}
                        <div className="ptar-discrecion" style={{ marginTop: '0.9rem' }}>
                          <label className="ptar-confirm-check">
                            <input type="checkbox" checked={discrecion} onChange={(e) => setDiscrecion(e.target.checked)} />
                            <span><strong>Discreción comercial</strong> (opcional): el conductor no dirá en la carga a quién va la mercancía ni en la entrega de dónde viene.</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>)}

                {paso === 3 && (<>
                  <div className="ptar-section-head ptar-sh-fecha">Fecha de recogida <Tip id="tip-habiles-recogida" texto={AVISO_DIAS_HABILES} aria="Días que cuentan para la recogida" /></div>
                  <div className="ptar-field-full">
                    {/* Al cambiar de tipo, la fecha salta SOLA al primer día viable del tipo nuevo
                        (usuario, 2026-11-09) — también para el Master con fechas libres y al editar;
                        después se puede cambiar a mano (lista o calendario). */}
                    <SelectorUrgencia valor={urgencia} grupaje={esGrupaje} onCambio={cambiarTipoFecha} />
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
                        {/* El calendario propio (usuario, 2026-11-19): pasar de mes ya no elige día ni
                            cierra nada; solo se elige pulsando un día hábil. */}
                        <CampoFecha className="ptar-dia-naranja" aria-label="Elige el día en el calendario" style={bordeFecha} abiertoAlInicio
                          min={fechaLibre ? undefined : dias[0]} max={maxFecha} value={fecha && !dias.includes(fecha) ? fecha : ''}
                          soloHabiles={!fechaLibre} festivos={fest} permitirBorrar={false}
                          onChange={(v) => { setFecha(v); if (v) setModoCal(false); }} />
                        <button type="button" className="ptar-cal-volver" onClick={() => setModoCal(false)}>Volver a la lista</button>
                      </div>
                    )}
                    {marcarFecha && <div className="pt-aviso error" style={{ marginTop: '0.5rem', marginBottom: 0 }}><IcoAviso /><div><strong>Elige la fecha de recogida</strong> (es el campo que falta).</div></div>}
                  </div>
                  {/* ENTREGA ESTIMADA y trayecto, en su caja gris suave, ANTES del aviso de la
                      hora de corte (usuario, 2026-11-18: estaban sueltos encima del precio).
                      Solo en la vista del cliente, como antes. */}
                  {esCliente && !manual && tarifa && (
                    <div className="ptar-field-full ptar-entrega-caja" id="caja-entrega-estimada">
                      <div>
                        <span className="k">Fecha de entrega estimada <Tip id="tip-habiles-entrega" texto={AVISO_DIAS_HABILES} aria="Días que cuentan para la entrega" /></span>
                        {tarifa.etaDesde
                          ? <span className="v verde">{tarifa.etaHasta && tarifa.etaHasta !== tarifa.etaDesde
                              ? <>del {fmtFecha(tarifa.etaDesde)} al {fmtFecha(tarifa.etaHasta)}</> : fmtFecha(tarifa.etaDesde)}</span>
                          : <span className="v gris">Elige la fecha de recogida para verla</span>}
                      </div>
                      {/* Solo la fecha: la línea del trayecto («Camión completo · km») se quitó
                          (usuario, 2026-11-18). */}
                    </div>
                  )}
                  {avisoFestivo && <div className="ptar-field-full">{avisoFestivo}</div>}
                  {/* El aviso del corte solo cuando influye (usuario, 2026-11-21): sin fecha aún o con
                      el primer día posible elegido. Con una fecha posterior, el corte ya no le afecta. */}
                  {!manual && !fechaPasada && (!fecha || !dias[0] || fecha <= dias[0]) && (
                    <div className="ptar-field-full">
                      <AvisoCorte urgencia={urgencia} festivos={festivos} ventana={ventanaDias} grupaje={esGrupaje} cortes={cortes} />
                    </div>
                  )}
                  {fechaLibre && fecha && dias[0] && fecha < dias[0] && (
                    <div className="ptar-field-full"><div className="wiz-warn show" role="alert">⚠ <strong>Fuera de las reglas de corte:</strong> esta fecha no se podría elegir normalmente (fija desde mañana con su corte · cada ventana con su hora de corte — la elegida, las {corteDe(urgencia, esGrupaje, cortes)}:00). Úsalo solo para urgencias o imprevistos: la recogida dependerá de encontrar camión a tiempo.</div></div>
                  )}
                </>)}
              </div>
            </div>

            {paso === 3 && (
              <div className="form-2col-side">
                {/* La fecha elegida ya se ve en el desplegable; aquí solo el aviso de antelación
                    máxima. El de «Precio provisional» ya no sale en este paso (usuario, 2026-11-19);
                    queda en la ventana de confirmar. */}
                {maxFecha && fecha > maxFecha && (
                  <div className="ptar-field ptar-field-full">
                    <div className="pt-aviso error"><div>Como mucho se puede programar con <strong>{reglas!.antelacion_max_dias} días</strong> de antelación. Para más, llámanos al {CONTACTO.telefono}.</div></div>
                  </div>
                )}
                {manual ? (<>
                  <div className="ptar-field ptar-field-full ptar-admin-precio">
                    <div className="ptar-admin-precio-head">Precio con {nombreOp}</div>
                    <label className="ptar-admin-precio-lbl" htmlFor="ne-pop">Precio acordado con tu transportista (sin IVA) <Req si={false} /></label>
                    <input id="ne-pop" type="text" inputMode="decimal" placeholder="Ej. 450,00" value={precioOp} onChange={(ev) => setPrecioOp(ev.target.value)} />
                    <p className="ptar-admin-precio-note">Solo para tu control y para la orden de carga. Dynamo no interviene.</p>
                  </div>
                  {navBotones}
                  </>
                ) : esCliente ? (<>
                  {/* La tarjeta del camión/mercancía y el aviso del tráiler, ENCIMA del
                      desglose del importe (usuario, 2026-11-11): lo que se cotiza, a la vista. */}
                  <BloquePrecio tarifa={tarifa} ivaPct={ivaPct}
                    cargando={rutaCompleta && !kmInfo} paraCliente pasada={false} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'}
                    encima={tarjetaMercancia} onElegir={elegirAlternativa} />
                  {/* Fuera la caja de «precio en firme en 25 minutos» (usuario, 2026-11-12):
                      el precio del tarifador ya es el definitivo, igual que en admin. */}
                  {navBotones}
                </>) : <>
                <BloquePrecio tarifa={tarifa} ivaPct={ivaPct}
                  cargando={rutaCompleta && !kmInfo} paraCliente={false} pasada={fechaPasada} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'}
                  encima={tarjetaMercancia} onElegir={elegirAlternativa} />
                {navBotones}
                <div className="ptar-field ptar-field-full ptar-admin-precio">
                  <div className="ptar-admin-precio-head">Precios internos <span>· solo administración</span></div>
                  {tarifa && ultimos && interna
                    ? <PreciosInternosTabla tarVenta={tarifa.neto} tarCompra={tarCompra} mismo={ultimos.mismo} todos={ultimos.todos} interna={interna} hoy={hoyStr} />
                    : <p className="ptar-admin-precio-note" style={{ marginBottom: '0.5rem' }}>Ventas, compras y márgenes de esta ruta: se mostrarán al elegir origen y destino.</p>}
                  {cliente && tarifa && tarifa.netoBase != null && !!factorCli && (
                    <p className="ptar-admin-precio-note" style={{ marginBottom: '0.5rem' }}>
                      <strong>Factor de este cliente: {factorCli > 0 ? '+' : ''}{String(factorCli).replace('.', ',')} %</strong>, ya dentro del precio del tarifador
                      ({eur(tarifa.netoBase)} de tarifa → {eur(tarifa.neto)}). El cliente no lo ve: para él es su precio normal.
                    </p>)}
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
          {/* El cliente (y Dynamo en «Ver como cliente») no ve «Revisión» ni el nombre del cliente:
              es su cuenta, sobra (usuario, 2026-11-21). */}
          {!sinCampoCliente && <h3 className="ptar-section-head ptar-sh-conf">Revisión y precio</h3>}
          <div className="form-2col">
            <div className="form-2col-main">
              <div className="sum2">
                {!sinCampoCliente && <div className="sum2-box">
                  <div className="sum2-cell sum2-full"><div className="sum2-k">Cliente</div><div className="sum2-v">{cliente.nombre} · {cliente.cif}</div></div>
                </div>}
                <h4 className="ptar-section-head" style={{ margin: sinCampoCliente ? '0 0 0.5rem' : '1rem 0 0.5rem', fontSize: 'var(--fs-l)' }}>
                  Datos de los lugares <span style={{ color: 'var(--gray-500)', fontWeight: 600, fontSize: 'var(--fs-m)' }}>· revisa y completa lo que falte</span>
                </h4>
                <FichasSitios puntos={puntos} datos={datosSitios} edic={edicSitios} setEdic={setEdicSitios} fechaCargaTxt={fechaTxt} faltas={faltasSitios} cargaHoy={cargaHoy} mercanciaDefecto={mercResumen} fechasParada={fechasParada} />
                {/* Aviso del tráiler debajo de los sitios (usuario, 2026-11-19; antes iba en la
                    ventana de confirmar). Solo sin plataforma elevadora; el enlace lleva al paso 2. */}
                {!manual && !plataforma && <div id="aviso-trailer-sitios" className="pt-aviso" style={{ marginTop: '0.8rem', marginBottom: 0 }}><IcoAviso /><div>
                  <strong>Envío en tráiler</strong>, asegúrate de que los sitios son <strong>accesibles</strong> y de que hay <strong>medios de carga/descarga</strong>. Si requieres plataforma elevadora (<strong>más caro, menor disponibilidad y solo en camión rígido de 8 metros</strong>), añádela en el{' '}
                  <button type="button" className="enlace-paso" onClick={() => { setNotasAbiertas(true); setPaso(2); window.scrollTo({ top: 0 }); }}>paso 2</button>.
                </div></div>}
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
              {/* La tarjeta del camión/mercancía, encima del precio (usuario,
                  2026-11-11): lo que se confirma, a la vista junto a la base
                  imponible. El aviso del tráiler pasó junto a las paradas. */}
              {tarjetaMercancia}
              {/* Huella de CO₂ orientativa antes de crear el envío (usuario, 2026-11-21). */}
              <CajaCo2 km={kmInfo?.km} ml={Number(ml)} toneladas={Number(peso)} plataforma={plataforma} />
              {manual
                ? <div className="pt-aviso info" style={{ marginBottom: 0 }}><div><strong>Transporte con {nombreOp}.</strong>{precioOp.trim() ? <> Precio acordado: <strong>{eur(num(precioOp))}</strong> (sin IVA).</> : null} Dynamo no interviene.</div></div>
                : esCliente
                ? <>
                  <BloquePrecio tarifa={tarifa} ivaPct={ivaPct}
                    cargando={rutaCompleta && !kmInfo} paraCliente pasada={false} fechaFija={urgencia === 'dia' ? fecha || null : null} corta={urgencia === 'corta'} soloImportes onElegir={elegirAlternativa} />
                  {editarCliente && precioAntesCli != null && tarifa && (
                    <div className="ptar-confirm-price" style={{ marginTop: '0.6rem' }}>
                      <div className="alm-price-row alm-price-sub"><span className="k">Precio antes → ahora (sin IVA)</span>
                        <span className="v">{eur(precioAntesCli)} → <strong>{eur(tarifa.neto)}</strong></span></div>
                    </div>
                  )}
                </>
                : <>{cajaPrecio}{resumenCambioPrecio}</>}
              {avisoProvisional}
              {/* En la vista de administración normal no hace falta explicar qué hace el
                  botón (usuario, 2026-11-10): solo quedan los textos de editar, manual
                  y cliente. */}
              {/* El texto genérico de «Al pulsar Crear envío…» del cliente se quitó
                  (usuario, 2026-11-14): las condiciones y, si procede, el pago por
                  adelantado se avisan en la ventana de confirmación. */}
              {(editar || manual) && <div className="ptar-terms-box">
                {editarManual
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Guardar cambios»</strong> se actualiza tu envío #{be!.referencia_gx} con tu transportista. No se avisa a nadie: si hace falta, avísale tú.</p>
                  : editarCliente
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Guardar cambios»</strong> se actualiza tu envío #{be!.referencia_gx} con lo que ves aquí. <strong>El precio se recalcula</strong> como en un envío nuevo. Se aplican las mismas condiciones generales que aceptaste al crearlo.</p>
                  : editar
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Guardar cambios»</strong> se actualiza el envío #{be!.referencia_gx}. Si no has tocado nada que afecte al precio (ruta, mercancía, fechas), <strong>el precio se queda como está</strong>: solo cambia si lo cambias tú.</p>
                  : <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> queda programado con tu operador y puedes sacar la <strong>orden de carga</strong> desde el envío.</p>}
              </div>}
              {aviso && !revisarLegal && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}
              {(() => {
                // Proforma ORIENTATIVA del cálculo. Botonera (usuario, 2026-11-11, «al
                // revés»): «Crear envío» ARRIBA, grande y en azul (principal), y «Ver
                // proforma» debajo, discreto en blanco.
                const hayProforma = !manual && !editar && (esCliente ? (tarifa?.neto ?? 0) : importe) > 0;
                return (
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
                        if (!cliente) { setAviso('Para crear el envío hace falta el cliente: elígelo o dalo de alta en el paso 1. Sin cliente, esta pantalla solo calcula el precio.'); setPaso(1); return; }
                        for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
                        setAviso(null); setAceptaLegal(true); setVerCondiciones(false); setRevisarLegal(true);
                        if (esCliente && pagoPrevio && !manual) { setPlazoPago(null); plazoPagoPrevisto(fecha || null).then(setPlazoPago).catch(() => setPlazoPago(null)); }
                      }}
                      data-pista-accion disabled={enviando}>{enviando ? (editar ? 'Guardando cambios…' : 'Creando envío…') : editar ? 'Guardar cambios' : 'Crear envío'}</button>
                    {hayProforma && (
                      <button type="button" className="btn-secondary" onClick={() => setVerProforma(true)} disabled={enviando}>Ver proforma</button>
                    )}
                    <button type="button" className="btn-ghost" onClick={() => { setAviso(null); setPaso(3); }} disabled={enviando}>← Editar datos</button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Ventana de la proforma del cálculo: en la RAÍZ del componente, como los demás
          modales (2026-11-11: anidada en la tarjeta del paso 4, un ancestro con contexto
          de apilamiento la dejaba DEBAJO de los círculos del asistente). */}
      <Modal abierto={verProforma} onCerrar={() => setVerProforma(false)} titulo="Proforma del cálculo" ancho={580}
        sub="Un documento con el precio, para verlo o guardarlo. No crea ningún envío."
        pie={(() => {
          const baseP = esCliente ? (tarifa?.neto ?? 0) : importe;
          // RUTA una parada por línea (cp población, país y tipo de sitio) y DETALLE en
          // 3 líneas — fecha con su ventana, camión, y metros y peso —, el mismo estilo
          // en el email y en el PDF de la proforma (usuario, 2026-11-13).
          const lineasRuta = puntos.map((p) => {
            const cp = p.sitio?.codigo_postal ?? p.nuevo?.codigo_postal ?? '';
            const pob = p.sitio?.poblacion ?? p.nuevo?.poblacion ?? '';
            if (!cp && !pob) return '';
            const pais = nombrePais(p.sitio?.pais_codigo_iso ?? p.nuevo?.pais_codigo_iso ?? '');
            const tipo = nombreTipo(p.sitio?.tipo ?? p.nuevo?.tipo_sitio);
            return `${[[cp, pob].filter(Boolean).join(' '), pais].filter(Boolean).join(', ')} (${tipo})`;
          }).filter(Boolean);
          const notaVentana = urgencia === 'dia' ? 'fecha fija' : urgencia === 'corta' ? 'ventana corta de 1 a 2 días' : 'ventana flexible, la más económica';
          const lineasDetalle = [
            fechaTxt ? `Carga ${fechaTxt} (${notaVentana})` : '',
            camionTxt,
            `${mlTxt.split(' ·')[0]} · ${pesoTxt}`,
          ].filter(Boolean);
          const url = `/panel/nuevo-envio/proforma?base=${encodeURIComponent(baseP)}&ruta=${encodeURIComponent(lineasRuta.join('\n'))}&det=${encodeURIComponent(lineasDetalle.join('\n'))}`
            + (esCliente || !cliente ? '' : `&cliente=${cliente.id}`);
          // Botones a lo ancho, grandes y apilados (usuario, 2026-11-12): el principal
          // (descargar) arriba y Cerrar debajo, los dos del mismo tamaño.
          // Enviar por EMAIL: lo manda la PLATAFORMA con la proforma en PDF ADJUNTA (usuario,
          // 2026-11-16; antes abría el correo del dispositivo, que no puede adjuntar). Un botón
          // con el email del cliente ya puesto y otro para escribir cualquier dirección.
          const enviarA = async (a: string) => {
            setProfMsg(null); setProfEnviando(true);
            const r = await enviarProformaCalculo(a, baseP, lineasRuta.join('\n'), lineasDetalle.join('\n'), esCliente || !cliente ? null : cliente.id)
              .catch(() => ({ ok: false as const, error: 'No se ha podido enviar: revisa la conexión y vuelve a intentarlo.' }));
            setProfEnviando(false);
            setProfMsg(r.ok ? { ok: true, txt: `Sale en unos segundos hacia ${a.trim()}, con la proforma en PDF adjunta.` } : { ok: false, txt: r.error });
            if (r.ok) setProfOtro(null);
          };
          const btnAncho = { width: '100%', minHeight: 52, justifyContent: 'center' } as const;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', width: '100%' }}>
              <a className="btn-primary" style={btnAncho} href={url} target="_blank" rel="noreferrer">Descargar la proforma en PDF</a>
              {emailBoton && <button type="button" id="prof-enviar-a" className="btn-secondary" style={btnAncho} disabled={profEnviando} onClick={() => enviarA(emailBoton)}>{profEnviando && profOtro === null ? 'Enviando…' : `Enviar por email a ${emailBoton}`}</button>}
              {profOtro === null
                ? <button type="button" className="btn-secondary" style={btnAncho} disabled={profEnviando} onClick={() => { setProfMsg(null); setProfOtro(''); }}>Enviar a otro email</button>
                : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input type="email" inputMode="email" autoFocus placeholder="nombre@empresa.com" aria-label="Email al que enviar la proforma" value={profOtro}
                      onChange={(ev) => setProfOtro(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && profOtro.trim() && !profEnviando) enviarA(profOtro); }}
                      style={{ flex: '1 1 220px', minWidth: 0, minHeight: 52 }} />
                    <button type="button" className="btn-secondary" style={{ minHeight: 52, justifyContent: 'center', flex: '0 0 auto' }}
                      disabled={profEnviando || !profOtro.trim()} onClick={() => enviarA(profOtro)}>{profEnviando ? 'Enviando…' : 'Enviar con el PDF'}</button>
                  </div>
                )}
              {profMsg && <div className={`pt-aviso ${profMsg.ok ? 'ok' : 'error'}`} role="status" style={{ margin: 0 }}><div>{profMsg.txt}</div></div>}
              <button type="button" className="btn-secondary" style={btnAncho} onClick={() => setVerProforma(false)}>Cerrar</button>
            </div>
          );
        })()}>
        <p style={{ margin: 0 }}>
          Este precio es <strong>el que se aplica al crear y confirmar el envío ahora</strong>. Las tarifas son
          dinámicas: el precio <strong>se fija al confirmar el envío a {reglas?.cerrado_dias_habiles ?? 12} días hábiles o menos de la
          carga</strong>. Con más antelación, se actualizará al llegar a {reglas?.cerrado_dias_habiles ?? 12} días hábiles de la primera
          parada, con el precio válido para el día de carga.
        </p>
        <p style={{ margin: '0.6rem 0 0', color: 'var(--gray-500)' }}>
          El PDF va <strong>sin datos de pago</strong>: no es pagadero y no genera ningún envío ni reserva. La proforma
          pagadera, con la transferencia, sale al crear el envío y quedar pendiente de pago, con el precio ya fijado.
        </p>
      </Modal>

      {/* Doble confirmación (Dynamo): costes de cancelación + condiciones generales. */}
      <Modal abierto={revisarLegal} onCerrar={() => { if (!enviando) setRevisarLegal(false); }} ancho={620}
        titulo="Confirmar envío" sub={manual ? 'Confirma los datos antes de crear el envío.' : 'Revisa los costes de cancelación antes de crear el envío.'}
        pie={<>
          <button type="button" className="btn-ghost" onClick={() => setRevisarLegal(false)} disabled={enviando}>← Volver</button>
          <button type="button" className="btn-primary btn-confirmar-xl" disabled={enviando}
            onClick={() => { if (!manual && !aceptaLegal) { setFaltaLegal(true); return; } crear(); }}>{enviando ? 'Creando envío…' : 'Confirmar envío'}</button>
        </>}>
        <div className="confirm-fino">
        {esHoy && (
          <div className="pt-aviso" style={{ marginTop: 0 }}><IcoAviso /><div>
            <strong>Carga hoy para hoy:</strong> no se garantiza poder cargar en el día. <strong>Nos ponemos a ello y te avisamos en breve.</strong> La cancelación de una carga para hoy (menos de 24&nbsp;h) conlleva cargos una vez asignado el transportista. <strong>Recomendación:</strong>{' '}
            {/* Vínculo verde (usuario, 2026-11-10): vuelve al paso 3 con la ventana amplia
                ya seleccionada (y la fecha en su primer día viable, como siempre). */}
            <button type="button" onClick={() => { setRevisarLegal(false); cambiarTipoFecha('estandar'); setPaso(3); }}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: 'var(--green)', fontWeight: 800, textDecoration: 'underline' }}>
              amplía la ventana de carga (más económica)</button>{' '}
            para tener margen los días siguientes.
          </div></div>
        )}
        {/* El resumen de fecha/precios/margen se quitó de aquí también (usuario, 2026-11-09):
            los precios internos ya se ven y ajustan en el paso 3. */}
        {/* Carga hoy y el sitio de recogida cierra pronto (o ya cerró): el aviso se repite
            aquí, con la línea de repercusión al cliente (usuario, 2026-11-09). */}
        {/* Solo paradas CON sitio elegido: nada más abrir el formulario, con ventana antes
            del corte, la fecha ya es HOY y la ruta aún está vacía — resolverFicha sobre un
            punto vacío tumbaba la pantalla entera (CI roto tras medianoche, 2026-11-10). */}
        {cargaHoy && puntos.filter((pt) => pt.tipo === 'carga' && (pt.sitio || pt.nuevo)).map((pt) => {
          const fs = resolverFicha(pt, datosSitios, edicSitios[pt.k]);
          return fs.horario.length > 0 ? <AvisoCierreSitio key={pt.k} empresa={fs.empresa || 'El sitio de recogida'} horario={fs.horario} repercusion /> : null;
        })}
        {/* Con transportista PROPIO del cliente (manual) el modal es BÁSICO (usuario,
            2026-11-14): nada de costes de cancelación, suspensión ni condiciones de
            Dynamo — Dynamo no interviene en ese transporte. */}
        {manual && (
          <div className="pt-aviso info" style={{ marginTop: 0, marginBottom: 0 }}><div>
            El envío queda <strong>programado con tu transportista</strong>{nombreOp ? <> (<strong>{nombreOp}</strong>)</> : null}. Dynamo no interviene:
            es solo para tu control y podrás sacar la <strong>orden de carga</strong> desde el envío.
          </div></div>
        )}
        {!manual && <div className="pt-aviso ok" style={{ marginTop: esHoy ? '0.6rem' : 0, marginBottom: 0 }}><div>
          ✅ <strong>Cancelación y cambios gratis.</strong> Mientras el envío <strong>no tenga camión asignado</strong> puedes <strong>cancelarlo o modificarlo sin coste</strong>. Una vez asignemos transportista, cancelar <strong>después de las 9:00 del día hábil anterior a la carga</strong> puede conllevar el <strong>coste completo</strong> del servicio.{' '}
          {/* La frase del uso abusivo va DENTRO de la caja verde y SEGUIDA, en el mismo párrafo
              (usuario, 2026-11-18); en su sitio queda la caja del tráiler. */}
          La <strong>cancelación o modificación reiterada</strong> de envíos, <strong>con o sin transportista asignado</strong>, puede conllevar la <strong>suspensión</strong> temporal o definitiva de la cuenta si se detecta un uso abusivo.
        </div></div>}
        {/* SOLO cuentas con pago por adelantado (usuario, 2026-11-14): si no aplica, no
            se dice nada. */}
        {esCliente && pagoPrevio && !manual && (
          <div className="modal-warn-box" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
            <strong>Pago por adelantado.</strong> Tu cuenta opera con pago previo: al confirmar, el envío queda
            <strong> pendiente de pago</strong> y te mandamos la <strong>proforma</strong>. El camión se asigna al
            <strong> recibir el pago</strong> y la fecha de carga se calcula desde ese momento.
            {plazoPago && (
              <div id="conf-pago-plazo" style={{ marginTop: '0.4rem' }}>
                <strong>Tienes {duracionTxt(plazoPago.minutos)} para pagar</strong> desde que confirmes (si confirmas ahora, hasta el <strong>{fechaHora(plazoPago.limite)}</strong>).
                {' '}Con <strong>tarjeta</strong> queda pagado al momento. Por <strong>transferencia inmediata</strong>, hazla dentro de ese plazo y pulsa «Ya he hecho la transferencia» en el envío: el plazo se para mientras la validamos.
                {' '}Si se pasa el plazo sin pago ni aviso, el envío y su proforma <strong>se anulan solos</strong> y hay que crear un envío nuevo.
              </div>
            )}
          </div>
        )}
        {/* Los avisos del tráiler (accesos y medios de carga) y de los días hábiles ya no van
            en cajas aquí (usuario, 2026-11-19): están en las condiciones generales, apartados 9 y 15. */}
        {!manual && <div style={{ marginTop: '0.6rem' }}>
          <button type="button" onClick={() => setVerCondiciones((v) => !v)} aria-expanded={verCondiciones}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--purple)', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-m)', textDecoration: 'underline' }}>
            {verCondiciones ? '▾' : '▸'} {verCondiciones ? 'Ocultar' : 'Ver'} condiciones generales de transporte
          </button>
          {verCondiciones && <div className="ptar-terms-scroll" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.6rem 0.8rem', marginTop: '0.4rem' }}><CondicionesGenerales /></div>}
        </div>}
        {!manual && <label className={`ptar-confirm-check${faltaLegal && !aceptaLegal ? ' ptar-check-err' : ''}`} style={{ marginTop: '0.9rem' }}>
          <input type="checkbox" checked={aceptaLegal} onChange={(e) => { setAceptaLegal(e.target.checked); if (e.target.checked) setFaltaLegal(false); }} />
          <span>He leído los <strong>costes de cancelación</strong> y las <strong>condiciones generales de transporte</strong>.</span>
        </label>}
        {!manual && faltaLegal && !aceptaLegal && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.5rem' }}>⚠ Marca la casilla de arriba para poder confirmar el envío.</div>}
        {aviso && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {aviso}</div>}
        </div>
      </Modal>

      {/* Aviso flotante breve (cambio de capacidad por la plataforma elevadora). */}
      {toast && <div className="ne-toast" role="status">{toast}</div>}
    </section>
  );
}
