'use client';

// «Crear varios envíos» (usuario, 2026-11-21): en vez del asistente de 4 pasos, una TABLA
// con un envío por fila (hasta 20 por subida, para que nadie meta cientos de golpe). Cada
// fila lleva lo mismo que Nuevo envío — ruta con sus paradas (+ / −), mercancía, metros,
// peso, tipo de fecha y día de recogida, referencia — y su PRECIO al momento, que se
// recalcula al tocar cualquier cosa de la fila. Se pueden quitar filas (✕), duplicarlas y
// añadir más; al final, «Crear N envíos» los crea todos (con la misma aceptación de las
// condiciones que el asistente) o «Proforma de precios» saca la lista en un PDF.
// Manual por ahora: más adelante la IA rellenará esta misma tabla desde un Excel o un email.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMenuFuera } from './BotonNuevoEnvio';
import { crearEnvio, crearEnvioCliente, sitiosDelCliente, kmRuta, factorTarifa, registrarConsultaPrecio, datosEditablesDeSitios, guardarEdicionesSitios, type ParadaNueva } from '@/app/panel/(app)/nuevo-envio/acciones';
import { tramosDe } from '@/lib/horarios';
import { calcularTarifa, aplicarDescuentoTarifa } from '@/lib/tarifador';
import { fecha as fmtFecha, euros, hoyMadrid } from '@/lib/formato';
import { FORMAS, decimal, num, primerDia, resolverFicha, sumarHabiles, type CardEdit, type ClienteOpcion, type DatosSitios, type EdicionSitio, type Punto, type ReglasPrecio, type SitioOpcion, useEdicionesSitios } from './nuevoEnvio/comun';
import { nombreParada } from '@/lib/edicionesSitios';
import { FichasSitios } from './nuevoEnvio/FichasSitios';
import { CampoSitio } from './nuevoEnvio/CampoSitio';
import { CampoCliente } from './nuevoEnvio/CampoCliente';
import CondicionesGenerales from '@/components/CondicionesGenerales';
import Cargando from '@/components/Cargando';
import Modal from './Modal';

const MAX_FILAS = 20;
type Urg = 'dia' | 'estandar' | 'corta';
type Resultado = { ok: true; ref: string; id: string | null; pago: boolean } | { ok: false; error: string };
type Fila = {
  k: number; puntos: Punto[];
  paletizada: boolean; forma: string; plataforma: boolean; ml: string; peso: string; nima: boolean; adr: boolean;
  urgencia: Urg; fecha: string; ref: string;
  precio: string; precioTocado: boolean;     // solo Dynamo: el precio del cliente, editable
  res?: Resultado;
};
// Lo que cada fila calcula y la tabla necesita para los totales, la proforma y crear.
type Info = { error: string | null; neto: number | null; base: number | null; hasta: string; lineas: string[]; merc: string };

const optsMl = (max: number): [string, string][] => {
  const o: [string, string][] = [];
  for (let i = 1; i <= max; i++) o.push([String(i), `${i} ${i === 1 ? 'metro' : 'metros'} · grupaje`]);
  if (max === 13) o.push(['13.3', '13,30 m · completo']);
  return o;
};
const optsPeso = (max: number): [string, string][] => {
  const o: [string, string][] = [['0.2', 'De 0 a 200 kg'], ['0.4', 'De 200 a 400 kg'], ['0.6', 'De 400 a 600 kg'], ['0.8', 'De 600 a 800 kg'], ['1', 'De 800 kg a 1 t']];
  for (let lo = 1, hi = 3; lo < max; hi += 2) { if (hi > max) hi = max; o.push([String(hi), `De ${lo} a ${hi} t${hi === max ? ' (máximo)' : ''}`]); if (hi === max) break; lo = hi; }
  return o;
};
const optsUrg = (grupaje: boolean): [Urg, string][] => grupaje
  ? [['estandar', '1 a 4 días · económica'], ['corta', '1 a 2 días · más cara']]
  : [['estandar', '1 a 3 días · económica'], ['dia', 'Fecha fija · más cara']];
// «Lun 23/11» (sin el año) para que la ventana quepa en el desplegable.
const corta = (d: string) => fmtFecha(d).replace(/\/\d{2,4}$/, '');

export default function CrearVariosEnvios({ clientes: clientesIni, sitios: sitiosIni, festivos, reglas, error, esCliente = false, clienteFijo = false }: {
  clientes: ClienteOpcion[]; sitios: SitioOpcion[]; festivos: string[]; reglas: ReglasPrecio | null; error: string | null;
  esCliente?: boolean; clienteFijo?: boolean;
}) {
  const router = useRouter();
  const fest = useMemo(() => new Set(festivos), [festivos]);
  const [clientes, setClientes] = useState(clientesIni);
  const [cliente, setCliente] = useState<ClienteOpcion | null>(esCliente || clienteFijo || clientesIni.length === 1 ? clientesIni[0] ?? null : null);
  const [sitios, setSitios] = useState(sitiosIni);
  const sigK = useRef(1);
  const nuevaFila = (cli: ClienteOpcion | null, lista: SitioOpcion[]): Fila => {
    const prin = cli?.principal_id ? lista.find((x) => x.id === cli.principal_id && x.cliente_id === cli.id) ?? null : null;
    const k = sigK.current++;
    return { k, puntos: [{ k: k * 10 + 1, tipo: 'carga', sitio: prin, nuevo: null }, { k: k * 10 + 2, tipo: 'descarga', sitio: null, nuevo: null }],
      paletizada: true, forma: 'Lateral', plataforma: false, ml: '13.3', peso: '24', nima: !!cli?.nima, adr: false,
      urgencia: 'estandar', fecha: '', ref: '', precio: '', precioTocado: false };
  };
  const [filas, setFilas] = useState<Fila[]>(() => [1, 2].map(() => nuevaFila(cliente, sitiosIni)));   // dos filas de entrada (usuario, 2026-11-24)
  const [infos, setInfos] = useState<Record<number, Info>>({});
  // Envíos ya creados: salen de la tabla (usuario, 2026-11-21: «no vuelvas a poner ese listado
  // con las funciones bloqueadas»); quedan solo los que no se pudieron crear.
  const [hechas, setHechas] = useState<{ ref: string; id: string | null; pago: boolean }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [marcar, setMarcar] = useState(false);   // se intentó crear con filas incompletas: se marcan en rojo
  const [confirmar, setConfirmar] = useState(false);
  const [acepta, setAcepta] = useState(true);
  // Sin la casilla, el botón no se bloquea en silencio: avisa de qué falta (como en Nuevo envío).
  const [faltaAcepta, setFaltaAcepta] = useState(false);
  const [verCond, setVerCond] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  // El factor del cliente va dentro del precio (como en Nuevo envío); sin él no se da precio.
  const [factor, setFactor] = useState<number | undefined>(undefined);
  useEffect(() => {
    setFactor(undefined);
    if (!cliente) return;
    let vivo = true;
    factorTarifa(cliente.id, null).then((f) => { if (vivo) setFactor(f ?? 0); }).catch(() => { if (vivo) setFactor(0); });
    return () => { vivo = false; };
  }, [cliente]);

  const sitiosCliente = useMemo(() => sitios.filter((s) => !s.es_almacen_dynamo && cliente && s.cliente_id === cliente.id), [sitios, cliente]);
  const cambiarFila = (k: number, c: Partial<Fila>) => setFilas((l) => l.map((f) => (f.k === k ? { ...f, ...c } : f)));
  // Datos obligatorios de cada sitio (usuario, 2026-11-21: «si falta un teléfono de sitio,
  // ¿se controla?»): igual que en Nuevo envío, sin teléfono de contacto no se crea. Se piden
  // los datos de los sitios que hay en la tabla (de 20 en 20) y se pueden completar en la fila.
  const [datosSit, setDatosSit] = useState<DatosSitios>({});
  const idsSitios = [...new Set(filas.flatMap((f) => f.puntos.map((p) => p.sitio?.id).filter((x): x is string => !!x)))].sort().join(',');
  useEffect(() => {
    const faltan = idsSitios ? idsSitios.split(',').filter((id) => !datosSit[id]) : [];
    if (!faltan.length) return;
    let vivo = true;
    (async () => {
      for (let i = 0; i < faltan.length; i += 20) {
        const r = await datosEditablesDeSitios(faltan.slice(i, i + 20)).catch(() => ({}));
        if (vivo) setDatosSit((d) => ({ ...d, ...r }));
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSitios]);
  // FICHAS DE LOS SITIOS EN CADA FILA (usuario, 2026-11-22): «Ver sitios» abre debajo de la
  // fila las mismas fichas desplegables de Nuevo envío (horario, contacto, emails,
  // indicaciones, cita y detalle de la parada). Lo tocado se guarda en el sitio al crear; con
  // un dato obligatorio sin rellenar, al pulsar «Crear» se abren solas y salen en rojo.
  const [edicSit, setEdicSit] = useEdicionesSitios(filas.flatMap((f) => f.puntos));
  const [conFichas, setConFichas] = useState<Set<number>>(new Set());      // filas con las fichas abiertas
  const [faltasSit, setFaltasSit] = useState<Set<number>>(new Set());      // paradas con datos obligatorios por rellenar
  // Sin teléfono de contacto (con lo escrito en su ficha encima): no se crea.
  const faltaTel = (p: Punto) => !!p.sitio && !p.sitio.es_almacen_dynamo && !!datosSit[p.sitio.id] && !resolverFicha(p, datosSit, edicSit[p.k]).telefono.trim();
  // Los sitios de una fila sin teléfono, cada uno con las paradas EXACTAS en las que falta.
  const sinTelefono = (puntos: Punto[]): SinTel[] => {
    const m = new Map<string, SinTel>();
    puntos.forEach((p, i) => {
      if (!faltaTel(p)) return;
      const e = m.get(p.sitio!.id) ?? { sitio: p.sitio!, donde: '' };
      e.donde = [e.donde, nombreParada(i, p.tipo)].filter(Boolean).join(' y ');
      m.set(p.sitio!.id, e);
    });
    return [...m.values()];
  };
  async function ponerTelefono(sitio: SitioOpcion, tel: string): Promise<string | null> {
    if (tel.replace(/\D/g, '').length < 6) return 'Escribe un teléfono válido.';
    const fch = resolverFicha({ k: 0, tipo: 'carga', sitio, nuevo: null }, datosSit, { telefono: tel.trim() });
    const g = await guardarEdicionesSitios([{ sitio_id: sitio.id, contacto_id: fch.contacto_id, contacto_nombre: fch.contacto, contacto_telefono: tel.trim(),
      contacto_email: fch.contactoEmail, anotaciones: fch.notas, emails_avisos: fch.emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
      url_google_maps: fch.maps || null, horario_tramos: tramosDe(fch.horario) }]).catch(() => ({ ok: false as const, error: 'No se ha podido guardar.' }));
    if (!g.ok) return g.error;
    const r = await datosEditablesDeSitios([sitio.id]).catch(() => ({}));
    setDatosSit((d) => ({ ...d, ...r }));
    return null;
  }
  const ponInfo = (k: number, i: Info) => setInfos((x) => (JSON.stringify(x[k]) === JSON.stringify(i) ? x : { ...x, [k]: i }));
  const recargarSitios = async (id?: string) => {
    if (!cliente) return null;
    const suyos = await sitiosDelCliente(cliente.id).catch(() => [] as SitioOpcion[]);
    if (suyos.length) setSitios((l) => [...l.filter((x) => x.cliente_id !== cliente.id), ...suyos]);
    return id ? suyos.find((x) => x.id === id) ?? null : null;
  };

  const pendientes = filas.filter((f) => !f.res?.ok);
  const listas = pendientes.filter((f) => infos[f.k] && !infos[f.k].error);
  const total = listas.reduce((s, f) => s + (infos[f.k]?.neto ?? 0), 0);
  const creadas = hechas;
  const iva = Number(cliente?.iva ?? 21);

  async function proforma() {
    setAviso(null);
    if (!listas.length) { setAviso('Completa al menos un envío (ruta, fecha y precio) para sacar la proforma.'); return; }
    setTrabajando('Preparando la proforma');
    try {
      const r = await fetch('/panel/nuevo-envio/varios/proforma', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cliente: esCliente ? null : cliente?.id ?? null,
          envios: listas.map((f) => ({ titulo: `Envío ${filas.indexOf(f) + 1}${f.ref ? ` · ref. ${f.ref}` : ''}`, lineas: infos[f.k].lineas, base: infos[f.k].neto })) }) });
      if (!r.ok) { setAviso(await r.text()); return; }
      const url = URL.createObjectURL(await r.blob());
      const w = window.open(url, '_blank');
      if (!w) location.href = url;
    } catch { setAviso('No se ha podido preparar la proforma. Vuelve a intentarlo.'); }
    finally { setTrabajando(null); }
  }

  function abrirConfirmar() {
    setAviso(null);
    if (!cliente) { setAviso('Elige primero el cliente.'); return; }
    const malas = pendientes.filter((f) => infos[f.k]?.error);
    if (!pendientes.length) { setAviso('No queda ningún envío por crear.'); return; }
    if (malas.length) {
      setMarcar(true);
      // Las fichas de los sitios a los que les falta algo obligatorio se abren solas, en rojo.
      const faltas = malas.flatMap((f) => f.puntos.filter(faltaTel).map((p) => p.k));
      if (faltas.length) {
        setFaltasSit(new Set(faltas));
        setConFichas((x) => new Set([...x, ...malas.filter((f) => f.puntos.some(faltaTel)).map((f) => f.k)]));
      }
      setAviso(`Revisa ${malas.length === 1 ? 'el envío marcado' : `los ${malas.length} envíos marcados`} en rojo antes de crear (o quítalo${malas.length === 1 ? '' : 's'} con ✕).`);
      setTimeout(() => document.querySelector('.varios-fila.con-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      return;
    }
    if (listas.length !== pendientes.length) { setAviso('Aún se están calculando precios: espera un momento y vuelve a pulsar.'); return; }
    setAcepta(true); setConfirmar(true);
  }

  async function crearTodos() {
    if (!cliente || !acepta) return;
    setConfirmar(false); setAviso(null);
    const cola = filas.filter((f) => !f.res?.ok && infos[f.k] && !infos[f.k].error);
    // Primero se guarda en cada sitio lo corregido en sus fichas (una vez por sitio; si el
    // mismo sitio se tocó en varias filas, manda la última). Si algo no vale, no se crea nada.
    const porSitio = new Map<string, EdicionSitio>();
    for (const f of cola) for (const p of f.puntos) {
      if (!p.sitio || p.sitio.es_almacen_dynamo || !edicSit[p.k] || !datosSit[p.sitio.id]) continue;
      const x = resolverFicha(p, datosSit, edicSit[p.k]);
      porSitio.set(p.sitio.id, {
        sitio_id: p.sitio.id, contacto_id: x.contacto_id, contacto_nombre: x.contacto, contacto_telefono: x.telefono, contacto_email: x.contactoEmail,
        anotaciones: x.notas, emails_avisos: x.emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
        url_google_maps: x.maps || null, horario_tramos: tramosDe(x.horario),
        verano: edicSit[p.k]?.verano ? { activo: x.verano.activo, desde: x.verano.desde, hasta: x.verano.hasta, tramos: tramosDe(x.verano.horario) } : undefined,
        contactos_extra: (edicSit[p.k]?.extra ?? []).filter((c) => c.nombre.trim() || c.telefono.trim() || c.email.trim()),
      });
    }
    if (porSitio.size) {
      setTrabajando('Guardando los datos de los sitios');
      const g = await guardarEdicionesSitios([...porSitio.values()]).catch(() => ({ ok: false as const, error: 'No se han podido guardar los datos de los sitios.' }));
      if (!g.ok) { setTrabajando(null); setAviso(g.error); return; }
    }
    // Anotaciones de cada parada: la cita previa y el detalle de mercancía de su ficha (o el
    // resumen de la fila si no se tocó).
    const anotParada = (p: Punto, merc: string) => {
      const c = edicSit[p.k];
      const cita = c?.cita ? ['CITA PREVIA' + (c.citaHora ? ` a las ${c.citaHora}` : ''), (c.citaDetalle ?? '').trim()].filter(Boolean).join(' · ') : '';
      const m = resolverFicha(p, datosSit, c, merc).mercancia.trim().replace(/\s*\n+\s*/g, ' · ');
      return [cita, m ? `MERCANCÍA: ${m}` : ''].filter(Boolean).join(' · ') || undefined;
    };
    let n = 0;
    const ok: { ref: string; id: string | null; pago: boolean }[] = [];
    const okK = new Set<number>();
    for (const f of cola) {
      n++;
      setTrabajando(`Creando envío ${n} de ${cola.length}`);
      const info = infos[f.k];
      const fo = f.forma.toLowerCase();
      const paradas: ParadaNueva[] = f.puntos.map((p, i) => ({ tipo: p.tipo, sitio_id: p.sitio!.id,
        referencia: i === 0 && f.ref ? f.ref : undefined, anotaciones: anotParada(p, info.merc) }));
      const datos = {
        referencia_cliente: f.ref, fecha_carga_desde: f.fecha, fecha_carga_hasta: info.hasta,
        descripcion_mercancia: f.paletizada ? 'Paletizada (mercancía general)' : 'No paletizada',
        toneladas: Number(f.peso), metros_lineales: Number(f.ml),
        paletizado: f.paletizada, carga_lateral: fo.includes('lateral'), carga_trasera: fo.includes('trasera'), carga_techo: fo.includes('techo'),
        requiere_plataforma_elevadora: f.plataforma, requiere_nima: f.nima, adr: f.adr,
        importe_cliente: info.neto ?? 0, importe_tarifa: info.base, discrecion_comercial: false, anotaciones_cliente: '',
      };
      let res: Resultado;
      try {
        if (esCliente) {
          const r = await crearEnvioCliente(datos, paradas);
          res = r.ok ? { ok: true, ref: r.referencia_gx, id: r.id, pago: r.pagoPendiente } : { ok: false, error: r.error };
        } else {
          const r = await crearEnvio({ ...datos, cliente_id: cliente.id, importe_transportista: null, negociacion_pct: 10 }, paradas);
          res = r.ok ? { ok: true, ref: r.referencia_gx, id: r.id, pago: false } : { ok: false, error: r.error };
        }
      } catch { res = { ok: false, error: 'No se ha podido crear. Vuelve a intentarlo.' }; }
      cambiarFila(f.k, { res });
      if (res.ok) { okK.add(f.k); ok.push({ ref: res.ref, id: res.id, pago: res.pago }); }
    }
    setHechas((h) => [...h, ...ok]);
    setFilas((l) => l.filter((x) => !okK.has(x.k)));
    setTrabajando(null);
    router.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const bloqueado = !cliente;
  // Todos creados: la MISMA pantalla de éxito que al crear un envío solo, corta (usuario,
  // 2026-11-21: «algo corto y simple… y ver mis envíos»).
  if (creadas.length > 0 && pendientes.length === 0) {
    const pagos = creadas.filter((c) => c.pago).length;
    const btnAncho = { width: '100%', minHeight: 52, justifyContent: 'center' } as const;
    return (
      <section className="section active" id="sec-varios">
        <div className="ptar-card" id="varios-creados" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div aria-hidden style={{ width: 64, height: 64, margin: '0.4rem auto 0.8rem', borderRadius: '50%', background: 'rgba(34,165,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 style={{ margin: '0 0 0.6rem', textAlign: 'center' }}>{creadas.length === 1 ? '¡Envío creado!' : `¡${creadas.length} envíos creados!`}</h2>
          <div className="varios-hecho-refs" style={{ justifyContent: 'center', marginBottom: '0.9rem' }}>
            {creadas.map((c) => <Link key={c.ref} href={c.id ? `/panel/envios?ver=${c.id}` : '/panel/envios'}>#{c.ref}</Link>)}
          </div>
          <p style={{ margin: '0 0 1.1rem', color: 'var(--gray-500)', textAlign: 'center', fontSize: 'var(--fs-m)', lineHeight: 1.5 }}>
            {esCliente
              ? <>Quedan programados con su precio. Te avisaremos por email cuando tengan camión.</>
              : <>Quedan programados y pendientes de transportista: asígnalos desde la ficha de cada uno.</>}
            {pagos > 0 && <><br /><strong style={{ color: '#b91c1c' }}>{pagos === 1 ? '1 está pendiente de pago' : `${pagos} están pendientes de pago`}</strong>: no se reserva transporte hasta pagarlo (proforma por email y plazo en su ficha).</>}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <Link className="btn-primary" style={btnAncho} href="/panel/envios" id="varios-ver-envios">Ver mis envíos</Link>
            <button type="button" className="btn-secondary" style={btnAncho} id="varios-otra-vez"
              onClick={() => { setHechas([]); setInfos({}); setMarcar(false); setFilas([1, 2].map(() => nuevaFila(cliente, sitios))); }}>Crear otros envíos</button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={`section active${esCliente ? ' varios-de-cliente' : ''}`} id="sec-varios">
      <div className="sec-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <h2>Crear varios envíos</h2>
        <Link className="btn-ghost" href="/panel/nuevo-envio">Crear uno solo</Link>
      </div>
      {/* En el MÓVIL, los clientes no tienen esta pantalla (usuario, 2026-11-24: la tabla ancha
          se usa mal en el teléfono): se les dice y se les manda a «Nuevo envío». El equipo de
          Dynamo sí la tiene también en el móvil. Lo decide la hoja de estilos por el ancho. */}
      {esCliente && (
        <div className="pt-aviso info varios-movil" id="varios-movil"><div>
          <strong>Crear varios envíos a la vez está disponible desde el ordenador.</strong> En el móvil, crea los envíos de uno en uno.
          <div style={{ marginTop: '0.7rem' }}><Link className="btn-primary" href="/panel/nuevo-envio">+ Nuevo envío</Link></div>
        </div></div>
      )}
      <p style={{ margin: '-0.4rem 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 860, lineHeight: 1.5 }}>
        Un envío por fila, <strong>hasta {MAX_FILAS} de una vez</strong>. Cada fila calcula su precio al momento; quita con <strong>✕</strong> las que no quieras y, al terminar, pulsa <strong>«Crear envíos»</strong> o saca la <strong>proforma de precios</strong>.
      </p>
      {error && <div className="pt-aviso error"><div>No se han podido cargar tus sitios: {error}</div></div>}

      {!esCliente && !clienteFijo && (
        <div className="varios-cliente">
          <label>Cliente de estos envíos</label>
          <CampoCliente clientes={clientes} valor={cliente}
            onNuevo={(c) => { setClientes((l) => [...l, c]); setCliente(c); }}
            onElegir={async (c) => {
              setCliente(c); setInfos({});
              if (!c) { setFilas((l) => l.map((f) => ({ ...f, puntos: f.puntos.map((p) => ({ ...p, sitio: null })) }))); return; }
              const suyos = await sitiosDelCliente(c.id).catch(() => [] as SitioOpcion[]);
              setSitios(suyos);
              setFilas((l) => l.filter((f) => f.res?.ok).concat(l.filter((f) => !f.res?.ok).map(() => nuevaFila(c, suyos))));
            }} />
        </div>
      )}

      {/* Sin cliente la tabla está bloqueada: que se vea por qué (usuario, 2026-11-24: «no
          funcionaban los botones… era que no había puesto el cliente»). */}
      {bloqueado && !esCliente && (
        <div className="pt-aviso info" id="varios-elige-cliente" style={{ margin: '0 0 0.8rem' }}><div>
          <strong>Elige primero el cliente.</strong> Hasta entonces la tabla y sus botones están bloqueados.
        </div></div>
      )}

      {creadas.length > 0 && (
        <div className="varios-hecho parcial" id="varios-parcial">
          <div className="varios-hecho-tit">✓ {creadas.length === 1 ? 'Se ha creado 1 envío' : `Se han creado ${creadas.length} envíos`}
            <span> · {pendientes.length === 1 ? 'uno no se ha podido crear' : `${pendientes.length} no se han podido crear`}: revísalo{pendientes.length === 1 ? '' : 's'} abajo.</span></div>
          <div className="varios-hecho-refs">
            {creadas.map((c) => <Link key={c.ref} href={c.id ? `/panel/envios?ver=${c.id}` : '/panel/envios'}>#{c.ref}</Link>)}
          </div>
        </div>
      )}

      {/* Tabla ancha: en pantallas pequeñas se desliza hacia los lados, como el listado de envíos. */}
      <div className="varios-scroll" tabIndex={0}>
      <div className={`varios-tabla${bloqueado ? ' bloqueada' : ''}`} id="varios-tabla">
        <div className="varios-cab" aria-hidden="true">
          <span>#</span><span>Recogida</span><span>Entrega</span><span>Mercancía</span><span>Metros</span><span>Peso</span><span>Forma de carga</span>
          <span>Requisitos</span><span>Tipo de fecha</span><span>Día de recogida</span><span>Tu referencia</span><span className="der">Precio (sin IVA)</span>
        </div>
        {filas.map((f, i) => (
          <FilaEnvio key={f.k} f={f} n={i + 1} cliente={cliente} sitios={sitiosCliente} fest={fest} festivos={festivos} reglas={reglas}
            factor={factor} esCliente={esCliente} marcar={marcar}
            sinTel={sinTelefono(f.puntos)} onTelefono={ponerTelefono}
            fichas={{ abiertas: conFichas.has(f.k), datos: datosSit, edic: edicSit, setEdic: setEdicSit, faltas: faltasSit,
              alternar: () => setConFichas((x) => { const c = new Set(x); if (c.has(f.k)) c.delete(f.k); else c.add(f.k); return c; }) }}
            onCambio={(c) => cambiarFila(f.k, c)} onInfo={(x) => ponInfo(f.k, x)}
            onQuitar={filas.length > 1 ? () => { setFilas((l) => l.filter((x) => x.k !== f.k)); setInfos((x) => { const c = { ...x }; delete c[f.k]; return c; }); } : undefined}
            onDuplicar={filas.length < MAX_FILAS ? () => setFilas((l) => {
              const j = l.findIndex((x) => x.k === f.k); const k = sigK.current++;
              const copia: Fila = { ...f, k, res: undefined, ref: '', puntos: f.puntos.map((p, m) => ({ ...p, k: k * 10 + m + 1, parada_id: undefined })) };
              const c = [...l]; c.splice(j + 1, 0, copia); return c;
            }) : undefined}
            onSitioCreado={async (pk, id) => {
              const sit = await recargarSitios(id);
              if (sit) setFilas((l) => l.map((x) => (x.k === f.k ? { ...x, puntos: x.puntos.map((p) => (p.k === pk ? { ...p, sitio: sit, nuevo: null } : p)) } : x)));
            }} />
        ))}
      </div>

      </div>
      <div className="varios-pie">
        <button type="button" className="btn-secondary" id="varios-anadir" disabled={bloqueado || filas.length >= MAX_FILAS}
          onClick={() => setFilas((l) => [...l, nuevaFila(cliente, sitios)])}>+ Añadir envío</button>
        {filas.length >= MAX_FILAS && <span className="meta">Máximo {MAX_FILAS} envíos por subida.</span>}
        <div className="varios-total" id="varios-total">
          {listas.length} {listas.length === 1 ? 'envío listo' : 'envíos listos'} · Total <strong>{euros(total)}</strong> <span className="meta">+ IVA</span>
        </div>
      </div>
      {aviso && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {aviso}</div>}
      <div className="varios-acciones">
        <button type="button" className="btn-ghost" id="varios-proforma" onClick={proforma} disabled={bloqueado || !!trabajando}>Proforma de precios (PDF)</button>
        <button type="button" className="btn-primary" id="varios-crear" onClick={abrirConfirmar} disabled={bloqueado || !!trabajando || !pendientes.length}>
          {pendientes.length > 1 ? `Crear ${pendientes.length} envíos` : 'Crear envío'}
        </button>
      </div>
      {trabajando && <Cargando texto={trabajando} />}

      <Modal abierto={confirmar} onCerrar={() => setConfirmar(false)} ancho={560} titulo={`Crear ${listas.length === 1 ? '1 envío' : `${listas.length} envíos`}`}
        sub="Revisa la lista antes de confirmar"
        pie={<><button type="button" className="btn-ghost" onClick={() => setConfirmar(false)}>Volver a la tabla</button>
          <button type="button" className="btn-primary" id="varios-confirmar" onClick={() => { if (!acepta) { setFaltaAcepta(true); return; } crearTodos(); }}>Confirmar {listas.length === 1 ? 'el envío' : `los ${listas.length} envíos`}</button></>}>
        {/* Ordenada (usuario, 2026-11-21): la lista de envíos con su precio, los totales con
            IVA y, debajo, las condiciones; todo con los tamaños de texto del panel. */}
        <div className="varios-conf">
          <ul className="varios-conf-lista" id="varios-conf-lista">
            {listas.map((f) => {
              const pob = (t: 'carga' | 'descarga') => f.puntos.filter((p) => p.tipo === t).map((p) => p.sitio?.poblacion || p.sitio?.nombre_empresa).filter(Boolean).join(', ');
              return (
                <li key={f.k}>
                  <span className="varios-conf-n">{filas.indexOf(f) + 1}</span>
                  <span className="varios-conf-ruta"><strong>{pob('carga') || '—'} → {pob('descarga') || '—'}</strong>
                    <span className="meta">{f.urgencia === 'dia' ? fmtFecha(f.fecha) : `${corta(f.fecha)} a ${corta(infos[f.k]?.hasta || f.fecha)}`}{f.ref ? ` · ref. ${f.ref}` : ''}</span></span>
                  <span className="varios-conf-precio">{euros(infos[f.k]?.neto ?? 0)}</span>
                </li>
              );
            })}
          </ul>
          <div className="varios-conf-totales">
            <div><span>Base imponible</span><span>{euros(total)}</span></div>
            <div><span>IVA ({iva} %)</span><span>{euros(total * iva / 100)}</span></div>
            <div className="total"><span>Total</span><span>{euros(total * (1 + iva / 100))}</span></div>
          </div>
          <p className="varios-conf-nota">Cada envío sigue sus condiciones como si lo crearas uno a uno: costes de cancelación una vez asignado el transportista y, si tu cuenta paga por adelantado, su plazo de pago.</p>
          <button type="button" className="varios-conf-enlace" onClick={() => setVerCond((v) => !v)}>{verCond ? 'Ocultar' : 'Ver'} condiciones generales de transporte</button>
          {verCond && <div className="ptar-terms-scroll" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.6rem 0.8rem' }}><CondicionesGenerales /></div>}
          <label className="ptar-confirm-check varios-conf-check">
            <input type="checkbox" checked={acepta} onChange={(e) => { setAcepta(e.target.checked); if (e.target.checked) setFaltaAcepta(false); }} />
            <span>He leído y acepto las condiciones generales de transporte y los costes de cancelación de estos envíos.</span>
          </label>
          {faltaAcepta && !acepta && <div className="wiz-warn show" role="alert" id="varios-falta-acepta" style={{ marginTop: '0.5rem' }}>⚠ Marca la casilla de arriba para poder confirmar los envíos.</div>}
        </div>
      </Modal>
    </section>
  );
}

type SinTel = { sitio: SitioOpcion; donde: string };   // donde: «1 · Recogida y 2 · Entrega»
function FilaEnvio({ f, n, cliente, sitios, fest, festivos, reglas, factor, esCliente, marcar, sinTel, onTelefono, fichas, onCambio, onInfo, onQuitar, onDuplicar, onSitioCreado }: {
  f: Fila; n: number; cliente: ClienteOpcion | null; sitios: SitioOpcion[]; fest: Set<string>; festivos: string[]; reglas: ReglasPrecio | null;
  factor: number | undefined; esCliente: boolean; marcar: boolean;
  sinTel: SinTel[]; onTelefono: (s: SitioOpcion, tel: string) => Promise<string | null>;
  fichas: { abiertas: boolean; alternar: () => void; datos: DatosSitios; edic: Record<number, CardEdit>;
    setEdic: React.Dispatch<React.SetStateAction<Record<number, CardEdit>>>; faltas: Set<number> };
  onCambio: (c: Partial<Fila>) => void; onInfo: (i: Info) => void; onQuitar?: () => void; onDuplicar?: () => void;
  onSitioCreado: (puntoK: number, id: string) => void;
}) {
  const hecha = !!f.res?.ok;
  const mlMax = f.plataforma ? 8 : 13, pesoMax = f.plataforma ? 14 : 24;
  const esGrupaje = (Number(f.ml) || 0) < mlMax - 0.01;
  const cortes = { fija: reglas?.corte_fija_hora, v12: reglas?.corte_ventana_1_2_hora, v13: reglas?.corte_ventana_1_3_hora, v14: reglas?.corte_ventana_1_4_hora };
  const dias = useMemo(() => {
    const out: string[] = []; let d = primerDia(f.urgencia, esGrupaje, fest, cortes);
    for (let i = 0; i < 10; i++) { out.push(d); d = sumarHabiles(d, 1, fest); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.urgencia, esGrupaje, fest, reglas]);
  const ventanaDias = f.urgencia === 'dia' ? 1 : f.urgencia === 'corta' ? 2 : esGrupaje ? 4 : 3;
  const hasta = f.fecha ? (ventanaDias > 1 ? sumarHabiles(f.fecha, ventanaDias - 1, fest) : f.fecha) : '';

  // Tipo de fecha que deja de existir al cambiar los metros → la estándar; fecha siempre
  // en un día posible (como en el asistente).
  useEffect(() => {
    if (hecha) return;
    if ((esGrupaje && f.urgencia === 'dia') || (!esGrupaje && f.urgencia === 'corta')) onCambio({ urgencia: 'estandar' });
    else if (!f.fecha || f.fecha < dias[0]) onCambio({ fecha: dias[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esGrupaje, f.urgencia, dias[0], hecha]);

  // Kilómetros de la ruta (con un pequeño retardo para no pedir en cada cambio).
  const rutaCompleta = f.puntos.length >= 2 && f.puntos.every((p) => p.sitio);
  const conSitio = useMemo(() => f.puntos.filter((p) => p.sitio), [f.puntos]);
  const claveRuta = f.puntos.map((p) => p.sitio?.id ?? '').join('|');
  const [km, setKm] = useState<number | null>(null);
  useEffect(() => {
    if (!rutaCompleta) { setKm(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      kmRuta(f.puntos.map((p) => ({ sitio_id: p.sitio!.id, cp: p.sitio!.codigo_postal ?? null, pais: p.sitio!.pais_codigo_iso ?? null, lat: null, lon: null })))
        .then((r) => { if (vivo) setKm(r.km); }).catch(() => { if (vivo) setKm(300 * (f.puntos.length - 1)); });
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRuta, rutaCompleta]);

  const tarifa = useMemo(() => {
    if (km == null || !rutaCompleta || factor === undefined || !f.fecha) return null;
    const t = calcularTarifa({ km, puntos: f.puntos.length, tiposSitio: f.puntos.map((p) => p.sitio?.tipo ?? 'almacen_nave'),
      ml: Number(f.ml) || 0, peso: Number(f.peso) || 0, mlMax, pesoMax, paletizada: f.paletizada, techo: f.forma.toLowerCase().includes('techo'),
      plataforma: f.plataforma, nima: f.nima, adr: f.adr, urgencia: f.urgencia, fecha: f.fecha, primerDia: dias[0], hoy: hoyMadrid(), festivos });
    return aplicarDescuentoTarifa(t, factor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [km, rutaCompleta, factor, f.fecha, f.ml, f.peso, f.paletizada, f.forma, f.plataforma, f.nima, f.adr, f.urgencia, f.puntos, dias[0]]);

  // Cada ruta con precio enseñado cuenta como una consulta de precio (como en Nuevo envío).
  const consulta = useRef<string | null>(null);
  useEffect(() => {
    if (!esCliente || !tarifa || hecha || consulta.current === claveRuta) return;
    consulta.current = claveRuta;
    void registrarConsultaPrecio().catch(() => {});
  }, [esCliente, tarifa, claveRuta, hecha]);

  const precioDynamo = f.precioTocado ? f.precio : (tarifa ? decimal(tarifa.neto) : '');
  const neto = esCliente ? (tarifa?.neto ?? null) : (precioDynamo.trim() ? num(precioDynamo) : null);
  const mlTxt = f.ml === '13.3' ? '13,30 metros · tráiler completo' : `${f.ml.replace('.', ',')} ${f.ml === '1' ? 'metro' : 'metros'} · grupaje`;
  const pesoTxt = optsPeso(pesoMax).find(([v]) => v === f.peso)?.[1] ?? '';
  const merc = [mlTxt, pesoTxt].filter(Boolean).join(' · ');
  const sinSitio = f.puntos.map((p, i) => (p.sitio ? '' : nombreParada(i, p.tipo))).filter(Boolean);   // el aviso dice en qué parada
  const error = hecha ? null
    : !cliente ? 'Elige el cliente.'
    : !rutaCompleta ? (sinSitio.length ? `Falta elegir el sitio de ${sinSitio.join(' y ')}.` : 'Falta la recogida o la entrega.')
    : sinTel.length ? `Falta el teléfono de contacto de ${sinTel.map((x) => `${x.donde}: «${x.sitio.nombre_empresa}»`).join('; ')}.`
    : !f.fecha ? 'Elige la fecha de recogida.'
    : f.fecha < dias[0] ? `El primer día posible es el ${fmtFecha(dias[0])}.`
    : !esCliente && !(neto && neto > 0) && tarifa ? 'Pon el precio del cliente.'
    : neto == null ? 'Calculando el precio…' : null;
  useEffect(() => {
    onInfo({ error, neto, base: tarifa ? (tarifa.netoBase ?? tarifa.neto) : null, hasta, merc,
      lineas: [
        ...f.puntos.map((p) => `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'}: ${[p.sitio?.nombre_empresa, [p.sitio?.codigo_postal, p.sitio?.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}`),
        `${f.urgencia === 'dia' ? `Recogida el ${fmtFecha(f.fecha)}` : `Recogida del ${fmtFecha(f.fecha)} al ${fmtFecha(hasta)}`} · ${merc}`,
        [f.paletizada ? 'Paletizada' : 'No paletizada', `carga ${f.forma.toLowerCase()}`, f.plataforma && 'plataforma elevadora', f.nima && 'NIMA', f.adr && 'ADR'].filter(Boolean).join(' · '),
      ] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, neto, tarifa, hasta, merc, claveRuta, f.urgencia, f.fecha, f.paletizada, f.forma, f.plataforma, f.nima, f.adr]);

  const sigParada = useRef(100);
  const total = f.puntos.length;
  const quitable = (p: Punto) => {
    if (f.puntos.filter((x) => x.tipo === p.tipo).length < 2) return false;
    const c = f.puntos.filter((x) => x.k !== p.k);
    return c.length >= 2 && c[0].tipo === 'carga' && c[c.length - 1].tipo === 'descarga';
  };
  // Los avisos de la fila salen al intentar crear (marcar) o cuando la ruta ya está puesta.
  const mostrarError = !hecha && !!error && error !== 'Calculando el precio…' && (marcar || rutaCompleta);
  return (
    <div className={`varios-fila${hecha ? ' hecha' : ''}${mostrarError ? ' con-error' : ''}`} data-fila={n}>
      <div className="varios-num">
        <strong>{n}</strong>
        {!hecha && onQuitar && <button type="button" className="varios-quitar" aria-label={`Quitar el envío ${n}`} title="Quitar este envío" onClick={onQuitar}>✕</button>}
        {!hecha && onDuplicar && <button type="button" className="varios-dup" aria-label={`Duplicar el envío ${n}`} title="Duplicar esta fila" onClick={onDuplicar}>⧉</button>}
      </div>
      {/* Recogidas y entregas en su columna cada una (usuario, 2026-11-21: «en filas, como el
          listado de envíos, y cada columna desplegables»). La ruta va recogidas → entregas. */}
      {(['carga', 'descarga'] as const).map((tipo) => (
        <div key={tipo} className={`varios-c varios-${tipo === 'carga' ? 'rec' : 'ent'}`}>
          {f.puntos.map((p, i) => ({ p, i })).filter(({ p }) => p.tipo === tipo).map(({ p, i }) => (
            <div key={p.k} className="ptar-field ptar-field-full" data-parada={p.k}>
              <CampoSitio punto={p} numero={i + 1} sitios={sitios} deshabilitado={hecha || !cliente} cliente={cliente} dynamo={!esCliente}
                placeholder={tipo === 'carga' ? 'Busca la recogida' : 'Busca la entrega'}
                onCreado={(id) => onSitioCreado(p.k, id)}
                onCambio={(c) => onCambio({ puntos: f.puntos.map((x) => (x.k === p.k ? { ...x, ...c } : x)) })}
                onQuitar={!hecha && quitable(p) ? () => onCambio({ puntos: f.puntos.filter((x) => x.k !== p.k) }) : undefined}
                onAnadir={!hecha && total < 4 ? () => { const j = f.puntos.findIndex((x) => x.k === p.k); const c = [...f.puntos];
                  c.splice(j + 1, 0, { k: f.k * 1000 + sigParada.current++, tipo, sitio: null, nuevo: null }); onCambio({ puntos: c }); } : undefined} />
            </div>
          ))}
        </div>
      ))}
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Mercancía del envío ${n}`} disabled={hecha} value={f.paletizada ? 'p' : 'n'} onChange={(e) => onCambio({ paletizada: e.target.value === 'p' })}>
          <option value="p">Paletizada</option><option value="n">No paletizada</option>
        </select>
      </div>
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Metros lineales del envío ${n}`} disabled={hecha} value={f.ml} onChange={(e) => onCambio({ ml: e.target.value })}>
          {optsMl(mlMax).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Peso del envío ${n}`} disabled={hecha} value={f.peso} onChange={(e) => onCambio({ peso: e.target.value })}>
          {optsPeso(pesoMax).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Forma de carga del envío ${n}`} disabled={hecha} value={f.forma} onChange={(e) => onCambio({ forma: e.target.value })}>
          {FORMAS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <div className="varios-c">
        <RequisitosMulti n={n} disabled={hecha} plataforma={f.plataforma} nima={f.nima} adr={f.adr} onCambio={(c) => {
          if (c.plataforma === undefined) { onCambio(c); return; }
          const v = c.plataforma;
          onCambio({ plataforma: v, ...(v ? { ml: Number(f.ml) > 8 ? '8' : f.ml, peso: Number(f.peso) > 14 ? '14' : f.peso } : { ml: f.ml, peso: f.peso === '14' ? '15' : f.peso }) });
        }} />
      </div>
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Tipo de fecha del envío ${n}`} disabled={hecha} value={f.urgencia}
          onChange={(e) => { const u = e.target.value as Urg; onCambio({ urgencia: u, fecha: primerDia(u, esGrupaje, fest, cortes) }); }}>
          {optsUrg(esGrupaje).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div className="varios-c">
        <select className="ptar-select" aria-label={`Día de recogida del envío ${n}`} disabled={hecha} value={dias.includes(f.fecha) ? f.fecha : ''}
          onChange={(e) => onCambio({ fecha: e.target.value })}>
          {!dias.includes(f.fecha) && <option value="" disabled>Elige el día</option>}
          {dias.map((d) => <option key={d} value={d}>{ventanaDias > 1 ? `${corta(d)} a ${corta(sumarHabiles(d, ventanaDias - 1, fest))}` : fmtFecha(d)}</option>)}
        </select>
      </div>
      <div className="varios-c varios-ref">
        <input type="text" maxLength={60} disabled={hecha} value={f.ref} placeholder="Opcional" aria-label={`Referencia del envío ${n}`} onChange={(e) => onCambio({ ref: e.target.value })} />
      </div>
      <div className="varios-c varios-precio">
        {hecha ? <strong>{f.res && f.res.ok ? '✓' : ''}</strong>
          : esCliente ? (tarifa ? <strong className="varios-importe">{euros(tarifa.neto)}</strong>
              : <span className="meta varios-sin-precio">{rutaCompleta ? 'Calculando…' : 'Pon la ruta'}</span>)
          : <>
              <input type="text" inputMode="decimal" className="varios-importe-input" aria-label={`Precio del cliente del envío ${n}`} value={precioDynamo}
                placeholder={rutaCompleta ? 'Calculando…' : '—'} onChange={(e) => onCambio({ precio: e.target.value, precioTocado: true })} />
              {tarifa && f.precioTocado && <span className="meta">Tarifa: {euros(tarifa.neto)}</span>}
            </>}
      </div>
      {f.res?.ok && (
        <div className="varios-res ok">
          ✓ Creado <Link href={f.res.id ? `/panel/envios?ver=${f.res.id}` : '/panel/envios'}><strong>#{f.res.ref}</strong></Link>
          {f.res.pago && <span className="badge badge-cargando" style={{ marginLeft: 6 }}>Pendiente de pago</span>}
        </div>
      )}
      {f.res && !f.res.ok && <div className="varios-res error">No se ha creado: {f.res.error}</div>}
      {!f.res && mostrarError && error && <div className="varios-res error">{error}</div>}
      {!hecha && sinTel.map((x) => <TelefonoSitio key={x.sitio.id} sitio={x.sitio} donde={x.donde} onGuardar={onTelefono} />)}
      {!hecha && conSitio.length > 0 && (
        <button type="button" className="varios-sitios-btn" aria-expanded={fichas.abiertas} onClick={fichas.alternar}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          <span>{fichas.abiertas ? 'Ocultar sitios' : 'Ver sitios'}<span className="vs-que"> · horario, contacto, indicaciones y cita</span></span>
        </button>
      )}
      {!hecha && conSitio.length > 0 && fichas.abiertas && (
        <div className="varios-sitios">
          <FichasSitios puntos={conSitio} datos={fichas.datos} edic={fichas.edic} setEdic={fichas.setEdic}
            fechaCargaTxt={f.fecha ? fmtFecha(f.fecha) : ''} faltas={fichas.faltas} cargaHoy={f.fecha === hoyMadrid()} mercanciaDefecto={merc} />
        </div>
      )}
    </div>
  );
}

// Completar en la misma fila el teléfono que le falta a un sitio (se guarda en su ficha).
function TelefonoSitio({ sitio, donde, onGuardar }: { sitio: SitioOpcion; donde: string; onGuardar: (s: SitioOpcion, tel: string) => Promise<string | null> }) {
  const [tel, setTel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  return (
    <div className="varios-tel">
      <span>Teléfono de contacto de <strong>{donde}: {sitio.nombre_empresa}</strong></span>
      <input type="tel" inputMode="tel" value={tel} placeholder="Ej. 600 000 000" aria-label={`Teléfono de ${donde}: ${sitio.nombre_empresa}`}
        onChange={(e) => { setTel(e.target.value); setErr(null); }} />
      <button type="button" className="btn-secondary" disabled={guardando || !tel.trim()}
        onClick={async () => { setGuardando(true); setErr(await onGuardar(sitio, tel)); setGuardando(false); }}>{guardando ? 'Guardando…' : 'Guardar en el sitio'}</button>
      {err && <span className="varios-tel-err">{err}</span>}
    </div>
  );
}

// Requisitos del envío (usuario, 2026-11-22): un desplegable de selección múltiple en vez de
// tres casillas sueltas, para que la fila no crezca. Enseña lo marcado o «Ninguno».
function RequisitosMulti({ n, disabled, plataforma, nima, adr, onCambio }: {
  n: number; disabled: boolean; plataforma: boolean; nima: boolean; adr: boolean;
  onCambio: (c: { plataforma?: boolean; nima?: boolean; adr?: boolean }) => void;
}) {
  const m = useMenuFuera();
  const ops = [
    { k: 'plataforma' as const, t: 'Plataforma elevadora', corto: 'Plataforma', v: plataforma },
    { k: 'nima' as const, t: 'Requiere NIMA', corto: 'NIMA', v: nima },
    { k: 'adr' as const, t: 'Mercancía ADR', corto: 'ADR', v: adr },
  ];
  const marcados = ops.filter((o) => o.v).map((o) => o.corto);
  const texto = marcados.length ? marcados.join(', ') : 'Ninguno';
  return (
    <div className="varios-req" ref={m.ref}>
      <button type="button" className="ptar-select varios-req-btn" disabled={disabled} aria-haspopup="true" aria-expanded={m.abierto}
        aria-label={`Requisitos del envío ${n}: ${texto}`} title={texto} onClick={() => m.setAbierto(!m.abierto)}>
        <span className={marcados.length ? '' : 'vacio'}>{texto}</span>
      </button>
      {m.abierto && (
        <div className="varios-req-menu" role="group" aria-label={`Requisitos del envío ${n}`}>
          {ops.map((o) => (
            <label key={o.k}><input type="checkbox" checked={o.v} onChange={(e) => onCambio({ [o.k]: e.target.checked })} /> {o.t}</label>
          ))}
        </div>
      )}
    </div>
  );
}
