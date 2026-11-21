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
import { crearEnvio, crearEnvioCliente, sitiosDelCliente, kmRuta, factorTarifa, registrarConsultaPrecio, type ParadaNueva } from '@/app/panel/(app)/nuevo-envio/acciones';
import { calcularTarifa, aplicarDescuentoTarifa } from '@/lib/tarifador';
import { fecha as fmtFecha, euros, hoyMadrid } from '@/lib/formato';
import { FORMAS, decimal, num, primerDia, sumarHabiles, type ClienteOpcion, type Punto, type ReglasPrecio, type SitioOpcion } from './nuevoEnvio/comun';
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
  const [filas, setFilas] = useState<Fila[]>(() => [1, 2, 3].map(() => nuevaFila(cliente, sitiosIni)));
  const [infos, setInfos] = useState<Record<number, Info>>({});
  // Envíos ya creados: salen de la tabla (usuario, 2026-11-21: «no vuelvas a poner ese listado
  // con las funciones bloqueadas»); quedan solo los que no se pudieron crear.
  const [hechas, setHechas] = useState<{ ref: string; id: string | null; pago: boolean }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [marcar, setMarcar] = useState(false);   // se intentó crear con filas incompletas: se marcan en rojo
  const [confirmar, setConfirmar] = useState(false);
  const [acepta, setAcepta] = useState(true);
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
    let n = 0;
    const ok: { ref: string; id: string | null; pago: boolean }[] = [];
    const okK = new Set<number>();
    for (const f of cola) {
      n++;
      setTrabajando(`Creando envío ${n} de ${cola.length}`);
      const info = infos[f.k];
      const fo = f.forma.toLowerCase();
      const paradas: ParadaNueva[] = f.puntos.map((p, i) => ({ tipo: p.tipo, sitio_id: p.sitio!.id,
        referencia: i === 0 && f.ref ? f.ref : undefined, anotaciones: info.merc ? `MERCANCÍA: ${info.merc}` : undefined }));
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
              onClick={() => { setHechas([]); setInfos({}); setMarcar(false); setFilas([1, 2, 3].map(() => nuevaFila(cliente, sitios))); }}>Crear otros envíos</button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="section active" id="sec-varios">
      <div className="sec-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
        <h2>Crear varios envíos</h2>
        <Link className="btn-ghost" href="/panel/nuevo-envio">Crear uno solo</Link>
      </div>
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
          <button type="button" className="btn-primary" id="varios-confirmar" disabled={!acepta} onClick={crearTodos}>Confirmar {listas.length === 1 ? 'el envío' : `los ${listas.length} envíos`}</button></>}>
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
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>He leído y acepto las condiciones generales de transporte y los costes de cancelación de estos envíos.</span>
          </label>
        </div>
      </Modal>
    </section>
  );
}

function FilaEnvio({ f, n, cliente, sitios, fest, festivos, reglas, factor, esCliente, marcar, onCambio, onInfo, onQuitar, onDuplicar, onSitioCreado }: {
  f: Fila; n: number; cliente: ClienteOpcion | null; sitios: SitioOpcion[]; fest: Set<string>; festivos: string[]; reglas: ReglasPrecio | null;
  factor: number | undefined; esCliente: boolean; marcar: boolean;
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
  const error = hecha ? null
    : !cliente ? 'Elige el cliente.'
    : !rutaCompleta ? 'Falta la recogida o la entrega.'
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
      <div className="varios-c varios-checks">
        <label><input type="checkbox" disabled={hecha} checked={f.plataforma} onChange={(e) => {
          const v = e.target.checked;
          onCambio({ plataforma: v, ...(v ? { ml: Number(f.ml) > 8 ? '8' : f.ml, peso: Number(f.peso) > 14 ? '14' : f.peso } : { ml: f.ml, peso: f.peso === '14' ? '15' : f.peso }) });
        }} /> Plataforma</label>
        <label><input type="checkbox" disabled={hecha} checked={f.nima} onChange={(e) => onCambio({ nima: e.target.checked })} /> NIMA</label>
        <label><input type="checkbox" disabled={hecha} checked={f.adr} onChange={(e) => onCambio({ adr: e.target.checked })} /> ADR</label>
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
    </div>
  );
}
