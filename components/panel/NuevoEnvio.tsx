'use client';

// "Nuevo envío": asistente de 4 pasos con el diseño de dashboard.html (#sec-nueva-carga):
// Ruta · Mercancía · Fecha y precio · Confirmar. Mismas clases del mockup (ptar-*, wiz-*,
// sum2-*, alm-price). Etapa A: lo usa Dynamo para un cliente y pone el precio a mano;
// el tarifador llega al final (y el precio lo calculará el servidor, nunca el navegador).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import { crearEnvio, cambiarRuta, crearSolicitud, crearEnvioManual, diasAbiertosDe, comprobarCobertura, sitiosDelCliente, datosEditablesDeSitios, guardarEdicionesSitios, type ParadaNueva, type HorarioSitioAviso } from '@/app/panel/(app)/nuevo-envio/acciones';
import { fecha as fmtFecha, euros as eur, hoyMadrid, porcentaje } from '@/lib/formato';
import Cargando from '@/components/Cargando';
import { NEGOCIACION } from '@/lib/envios';
import { HORARIO_POR_DEFECTO, VERANO_GENERICO, tramosDe, enTemporada, mmddTxt } from '@/lib/horarios';
import { CONTACTO } from '@/lib/atencion';
import { Base, CardEdit, ClienteOpcion, DatosSitios, EdicionSitio, FORMAS, IcoCliente, IcoEscudo, IcoMas, Props, Punto, SitioNuevo, VACIO, decimal, iso, num, opcionCercana, primerDia, resolverFicha, sumarHabiles } from './nuevoEnvio/comun';
export type { ClienteOpcion, SitioOpcion, Base, ReglasPrecio } from './nuevoEnvio/comun';
import { Interruptor } from './nuevoEnvio/Interruptor';
import { CampoCliente } from './nuevoEnvio/CampoCliente';
import { CampoSitio } from './nuevoEnvio/CampoSitio';
import { FichasSitios } from './nuevoEnvio/FichasSitios';

export default function NuevoEnvio({ clientes: clientesIni, sitios: sitiosIni, festivos, nombresFestivos = {}, error: errorCarga, base, esCliente = false, operadores = [], esMaster = false, reglas = null }: Props) {
  const be = base?.envio;
  const enRuta = base?.modo === 'ruta';
  const puntoDe = (p: Base['paradas'][number], k: number): Punto => {
    const s = p.sitio_id ? sitios.find((x) => x.id === p.sitio_id) ?? null : null;
    const nuevo: SitioNuevo | null = s ? null : { ...VACIO, nombre_empresa: p.nombre_empresa ?? '', direccion: p.direccion ?? '', codigo_postal: p.codigo_postal ?? '',
      poblacion: p.poblacion ?? '', provincia: p.provincia ?? '', pais_codigo_iso: p.pais_codigo_iso ?? 'ES', guardar: false };
    return { k, tipo: p.tipo, sitio: s, nuevo, parada_id: enRuta ? p.id : undefined };
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
  const [nima, setNima] = useState(!!be?.requiere_nima);
  const [adr, setAdr] = useState(!!be?.adr);
  const [refCli, setRefCli] = useState('');
  const [notas, setNotas] = useState(be?.anotaciones_cliente ?? '');
  const [notasAbiertas, setNotasAbiertas] = useState(!!(be && (be.requiere_plataforma_elevadora || be.requiere_nima || be.adr || be.anotaciones_cliente)));

  // ---- Paso 3: fecha y precio
  const [urgencia, setUrgencia] = useState<'dia' | 'estandar'>('estandar');
  const [fecha, setFecha] = useState('');
  const [pc, setPc] = useState(esCliente ? '' : decimal(be?.importe_cliente));
  const [pt, setPt] = useState(esCliente ? '' : decimal(be?.importe_transportista));
  const [neg, setNeg] = useState<number>(be?.negociacion_pct ?? 10);

  // ---- Envío MANUAL (solo el cliente): con su propio operador, Dynamo no interviene.
  const [operador, setOperador] = useState('');
  const [precioOp, setPrecioOp] = useState('');
  const manual = esCliente && !!operador;
  const nombreOp = operadores.find((o) => o.id === operador)?.nombre ?? '';

  // ---- Paso 4
  const [discrecion, setDiscrecion] = useState(!!be?.discrecion_comercial);
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

  // ---- Fichas de sitio editables en la confirmación (como el mockup): se piden los datos
  // de los sitios de la agenda que hay en la ruta al llegar al paso 4, para poder corregir
  // ahí lo que falte (horario, teléfono de contacto…). Lo tocado va en `edicSitios`.
  const [datosSitios, setDatosSitios] = useState<DatosSitios>({});
  const [edicSitios, setEdicSitios] = useState<Record<number, CardEdit>>({});
  const idsSitios = [...recogidas, ...entregas].map((p) => p.sitio?.id).filter(Boolean).join(',');
  useEffect(() => {
    if (paso !== 4 || !idsSitios) return;
    let vivo = true;
    datosEditablesDeSitios(idsSitios.split(',')).then((r) => { if (vivo) setDatosSitios(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [paso, idsSitios]);

  // El aviso de "falta tal dato" se borra en cuanto se toca cualquier cosa.
  useEffect(() => { setAviso(null); }, [cliente, recogidas, entregas, ml, peso, fecha, pc, pt, urgencia]);

  const ventanaDias = urgencia === 'estandar' ? 3 : 1;
  const fechaHasta = fecha ? (ventanaDias > 1 ? sumarHabiles(fecha, ventanaDias - 1, fest) : fecha) : '';
  const dias = useMemo(() => {
    const out: string[] = []; let d = primerDia(urgencia, fest, { fija: reglas?.corte_fija_hora, ventana: reglas?.corte_ventana_hora });
    for (let i = 0; i < 10; i++) { out.push(d); d = sumarHabiles(d, 1, fest); }
    return out;
  }, [urgencia, fest, reglas]);

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
  // Cobertura: tras la ruta (paso 1) y tras la mercancía (paso 2, que ya dice si es
  // completo o grupaje: hay sitios a los que solo vamos con camión completo).
  const [comprobando, setComprobando] = useState(false);
  async function coberturaError(n: number): Promise<string | null> {
    if (n !== 1 && n !== 2) return null;
    const paradas = [...recogidas, ...entregas].map((p, i) => {
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

  async function crear() {
    if (!cliente) return;
    for (const n of [1, 2, 3]) { const e = errorPaso(n); if (e) { setAviso(e); setPaso(n); return; } }
    setEnviando(true); setAviso(null);
    // Guarda en la ficha de cada sitio de la AGENDA lo que se corrigió en la confirmación
    // (los almacenes de Dynamo los ignora el servidor). Si algo no es válido, se corta aquí.
    const puntos = [...recogidas, ...entregas];
    const edicExist: EdicionSitio[] = puntos
      // Solo si sus datos ya se cargaron (si no, no pisamos la ficha con valores por defecto).
      .filter((p) => p.sitio && !p.sitio.es_almacen_dynamo && edicSitios[p.k] && datosSitios[p.sitio.id])
      .map((p) => {
        const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
        return {
          sitio_id: p.sitio!.id, contacto_id: f.contacto_id, contacto_nombre: f.contacto, contacto_telefono: f.telefono,
          anotaciones: f.notas, emails_avisos: f.emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
          url_google_maps: f.maps || null, horario_tramos: tramosDe(f.horario),
        };
      });
    if (edicExist.length) {
      const g = await guardarEdicionesSitios(edicExist);
      if (!g.ok) { setEnviando(false); setAviso(g.error); return; }
    }
    const paradas: ParadaNueva[] = puntos.map((p, i) => {
      const ref = i === 0 && refCli ? refCli : undefined;
      if (p.sitio) return { tipo: p.tipo, sitio_id: p.sitio.id, referencia: ref };
      const n = p.nuevo!;
      // Datos del sitio nuevo con lo corregido en la confirmación encima.
      const f = resolverFicha(p, datosSitios, edicSitios[p.k]);
      const hr = edicSitios[p.k]?.horario ?? n.horario;
      return {
        tipo: p.tipo, nombre_empresa: f.empresa, direccion: n.direccion, codigo_postal: n.codigo_postal,
        poblacion: n.poblacion, provincia: n.provincia, pais_codigo_iso: n.pais_codigo_iso,
        tipo_sitio: n.tipo_sitio, horarios: n.horarios, guardar_en_agenda: n.guardar, referencia: ref,
        contacto_nombre: f.contacto, contacto_telefono: f.telefono, horario_tramos: hr ? tramosDe(hr) : undefined,
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
        discrecion_comercial: discrecion, anotaciones_cliente: notas,
      }, paradas);
      if (!rm.ok) { setEnviando(false); setAviso(rm.error); return; }
      router.push(`/panel/envios?f=programada&nuevo=${encodeURIComponent(rm.referencia_gx)}&manual=1`);
      refrescar();
      return;
    }
    if (esCliente) {
      const rs = await crearSolicitud({
        referencia_cliente: refCli, fecha_carga_desde: fecha, fecha_carga_hasta: fechaHasta,
        descripcion_mercancia: paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        toneladas: Number(peso), metros_lineales: Number(ml),
        paletizado: paletizada, carga_lateral: f.includes('lateral'), carga_trasera: f.includes('trasera'),
        carga_techo: f.includes('techo'), requiere_plataforma_elevadora: plataforma, requiere_nima: nima, adr,
        discrecion_comercial: discrecion, anotaciones_cliente: notas,
      }, paradas);
      if (!rs.ok) { setEnviando(false); setAviso(rs.error); return; }
      router.push(`/panel/envios?f=solicitudes&nuevo=${encodeURIComponent(rs.referencia_gx)}`);
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
      discrecion_comercial: discrecion, anotaciones_cliente: notas, negociacion_pct: neg,
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
      Si se mueve menos de un {String(reglas.margen_pct).replace('.', ',')} %, se queda igual; si baja, se baja; si sube, {esCliente ? 'podrás aceptarlo o cancelar sin coste' : 'el cliente lo acepta o cancela sin coste'}.
      Hasta entonces no se asigna camión{esCliente ? '' : ' ni se oferta'}.
    </div></div>) : null;
  const fechaTxt = fecha ? (fechaHasta && fechaHasta !== fecha ? `del ${fmtFecha(fecha)} al ${fmtFecha(fechaHasta)}` : fmtFecha(fecha)) : '';

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
                      onElegir={async (c) => {
                        setCliente(c);
                        setRecogidas((l) => l.map((p) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : null }))); setEntregas((l) => l.map((p) => ({ ...p, sitio: p.sitio?.es_almacen_dynamo ? p.sitio : null })));
                        if (!c) return;
                        // Sus sitios se piden ahora; su almacén principal pasa a la primera recogida.
                        const suyos = sitiosRef.current.some((x) => x.cliente_id === c.id) ? [] : await sitiosDelCliente(c.id).catch(() => [] as typeof sitiosIni);
                        if (suyos.length) setSitios((l) => [...l.filter((x) => x.cliente_id !== c.id), ...suyos]);
                        const todos = suyos.length ? [...sitiosRef.current, ...suyos] : sitiosRef.current;
                        const prin = c.principal_id ? todos.find((x) => x.id === c.principal_id && x.cliente_id === c.id) ?? null : null;
                        if (prin) setRecogidas((l) => l.map((p, i) => (i === 0 && !p.nuevo && !p.sitio?.es_almacen_dynamo ? { ...p, sitio: prin } : p)));
                      }}
                      onNuevo={(c) => { setClientes((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre))); setCliente(c); }} />}
                  </div>

                  {esCliente && !base && operadores.length > 0 && (<>
                    <div className="ptar-section-head">¿Quién hace el transporte?</div>
                    <div className="ptar-field ptar-field-full">
                      <select className="ptar-select" aria-label="Quién hace el transporte" value={operador} onChange={(ev) => setOperador(ev.target.value)}>
                        <option value="">Dynamo (te pasamos el precio)</option>
                        {operadores.map((o) => <option key={o.id} value={o.id}>Mi operador: {o.nombre}</option>)}
                      </select>
                      {manual && <p className="ptar-admin-precio-note" style={{ marginTop: '0.4rem' }}>Envío con <strong>tu propio transportista</strong>: Dynamo no interviene en nada. La plataforma te sirve para organizarlo y sacar la <strong>orden de carga</strong> en PDF.</p>}
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
                      <strong>Añadir detalle de mercancía, nº de albarán/pedido, plataforma elevadora o NIMA</strong> (opcional)
                    </button>
                    {notasAbiertas && (
                      <div className="ptar-notes-body">
                        <div className="ptar-pair">
                          <Interruptor titulo="Plataforma elevadora" valor={plataforma}
                            onCambio={(v) => { setPlataforma(v); setMl(v ? '8' : '13.3'); setPeso(v ? '14' : '24'); }} />
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
                      onChange={(e) => { setUrgencia(e.target.value as 'dia' | 'estandar'); setFecha(''); setModoCal(false); }}>
                      <option value="dia">Fecha fija (un día concreto, más caro)</option>
                      <option value="estandar">Recogida de 1 a 3 días (más económica)</option>
                    </select>
                  </div>
                  <div className="ptar-field-full">
                    {!modoCal ? (
                      // Lista de fechas; la última opción abre el calendario.
                      <select className="ptar-select ptar-dia-naranja" aria-label="Fecha de recogida" value={dias.includes(fecha) ? fecha : (fecha ? 'elegida' : '')}
                        onChange={(e) => { const v = e.target.value; if (v === '__cal__') setModoCal(true); else if (v !== 'elegida') setFecha(v); }}>
                        <option value="" disabled>Elige la fecha de recogida</option>
                        {dias.map((d) => (
                          <option key={d} value={d}>{urgencia === 'estandar' ? `Del ${fmtFecha(d)} al ${fmtFecha(sumarHabiles(d, 2, fest))}` : fmtFecha(d)}</option>
                        ))}
                        {fecha && !dias.includes(fecha) && <option value="elegida">{fechaTxt ? fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1) : fmtFecha(fecha)}</option>}
                        <option value="__cal__">Elegir otra fecha en el calendario…</option>
                      </select>
                    ) : (
                      // Calendario: se toca para abrirlo (en iPhone no se puede abrir solo). Al elegir el
                      // primer día, la ventana (1 a 3 días) calcula el rango sola.
                      <div className="ptar-cal-fila">
                        <input ref={calRef} type="date" className="ptar-select ptar-dia-naranja" aria-label="Elige el día en el calendario"
                          min={esMaster ? undefined : dias[0]} max={maxFecha} value={fecha && !dias.includes(fecha) ? fecha : ''}
                          onChange={(e) => { setFecha(e.target.value); if (e.target.value) setModoCal(false); }} />
                        <button type="button" className="ptar-cal-volver" onClick={() => setModoCal(false)}>Volver a la lista</button>
                      </div>
                    )}
                  </div>
                  {esMaster && <div className="ptar-field-full"><p className="ptar-admin-precio-note">Como <strong>Admin Master</strong> puedes poner cualquier fecha, también pasada (p. ej. un envío que se gestionó por teléfono). Nadie más puede.</p></div>}
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
                {manual ? (
                  <div className="ptar-field ptar-field-full ptar-admin-precio">
                    <div className="ptar-admin-precio-head">Precio con {nombreOp}</div>
                    <label className="ptar-admin-precio-lbl" htmlFor="ne-pop">Precio acordado con tu transportista (sin IVA) · opcional</label>
                    <input id="ne-pop" type="text" inputMode="decimal" placeholder="Ej. 450,00" value={precioOp} onChange={(ev) => setPrecioOp(ev.target.value)} />
                    <p className="ptar-admin-precio-note">Solo para tu control y para la orden de carga. Dynamo no lo ve en ningún precio suyo.</p>
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
                  <label className="ptar-admin-precio-lbl" htmlFor="ne-neg" style={{ marginTop: '0.6rem' }}>Negociación con el transportista</label>
                  <select id="ne-neg" className="ptar-select" value={neg} onChange={(e) => setNeg(Number(e.target.value))}>
                    {NEGOCIACION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                  <p className="ptar-admin-precio-note">Sale ya puesta al ofrecer la carga (se puede cambiar ahí). El transportista nunca ve el %, solo el rango en euros.</p>
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
                : <button type="button" className="btn-primary" onClick={siguiente} disabled={comprobando}>{comprobando ? 'Comprobando la ruta…' : paso === 3 ? 'Ver resumen →' : 'Siguiente →'}</button>}
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
                </div>
                <h4 className="ptar-section-head" style={{ margin: '1rem 0 0.5rem', fontSize: 'var(--fs-l)' }}>
                  Datos de los lugares <span style={{ color: 'var(--gray-500)', fontWeight: 600, fontSize: 'var(--fs-m)' }}>· revisa y completa lo que falte</span>
                </h4>
                <FichasSitios puntos={[...recogidas, ...entregas]} datos={datosSitios} edic={edicSitios} setEdic={setEdicSitios} fechaCargaTxt={fechaTxt} esCliente={esCliente} />
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
                    {refCli && <div className="sum2-cell"><div className="sum2-k">Tu referencia</div><div className="sum2-v">{refCli}</div></div>}
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
              {avisoProvisional}
              <div className="ptar-discrecion">
                <label className="ptar-confirm-check">
                  <input type="checkbox" checked={discrecion} onChange={(e) => setDiscrecion(e.target.checked)} />
                  <span><strong>Discreción comercial</strong> (opcional): el conductor no dirá en la carga a quién va la mercancía ni en la entrega de dónde viene.</span>
                </label>
              </div>
              <div className="ptar-terms-box">
                {manual
                  ? <p className="ptar-terms-line">Al pulsar <strong>«Crear envío»</strong> queda programado con tu operador y puedes sacar la <strong>orden de carga</strong> desde el envío.</p>
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
