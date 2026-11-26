'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { euros, numero, fecha, diasEntre } from '@/lib/formato';
import type { TransportistaOpcion } from '@/lib/fichaEnvio';
import CampoTelefono from '@/components/CampoTelefono';
import { asignarTransportista, quitarTransportista, infoTransportista, sugerirFlota, flotaTransportista, buscarTransportistas, sugerirEntrega, usosFlota, type UsoFlota } from '@/app/panel/(app)/envios/acciones';
import Buscador from '../Buscador';
import ListaFlotante from '../ListaFlotante';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';
import { I, ICO, SubProps, aNum } from './comun';
import CampoFecha from '@/components/CampoFecha';
import { notaTxt, notaColor, piezasNota } from '@/lib/notaTransportista';

// Etiquetas y faltas según el criterio único (usuario, 2026-11-09).

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---- Asignar / cambiar transportista ------------------------------------------------
export function Asignar({ ficha, onVolver, hacer, trabajando, fallo }: SubProps) {
  const e = ficha.envio;
  // El transportista elegido, con sus datos (estado, NIMA, contacto de tráfico). El ya
  // asignado se pinta con lo que trae la ficha y se completa pidiéndolo a la base de datos.
  const [t, setT] = useState<TransportistaOpcion | null>(ficha.transportista
    ? { id: ficha.transportista.id, nombre: ficha.transportista.nombre, cif: ficha.transportista.cif, estado: 'activo', nima: null, telefono: null, email: null } : null);
  const tid = t?.id ?? '';
  useEffect(() => {
    const id = ficha.transportista?.id;
    if (!id) return;
    let vivo = true;
    buscarTransportistas('', id).then((r) => { const x = r.find((o) => o.id === id); if (vivo && x) setT(x); }).catch(() => {});
    return () => { vivo = false; };
  }, [ficha.transportista?.id]);
  const opciones = (q: string) => buscarTransportistas(q, ficha.transportista?.id ?? null).then((r) => r.map((o) => ({
    ...o, detalle: o.estado === 'suspendido' ? 'SUSPENDIDO' : o.estado === 'no_ofertar' ? 'no ofertar' : null })));
  // Estado del elegido (usuario, 2026-11-20): uno suspendido se puede asignar a mano, pero
  // solo tras ver el aviso rojo y confirmarlo; y se ve cuántas veces nos ha dejado tirados.
  const [info, setInfo] = useState<Awaited<ReturnType<typeof infoTransportista>>>(null);
  const [forzar, setForzar] = useState(false);
  useEffect(() => {
    setInfo(null); setForzar(false);
    if (!tid) return;
    let vivo = true;
    infoTransportista(tid).then((x) => { if (vivo) setInfo(x); }).catch(() => {});
    return () => { vivo = false; };
  }, [tid]);
  // Cambiar de transportista: ¿el anterior nos deja tirados? (cuenta para sus reglas).
  const cambiando = !!ficha.transportista && !!tid && tid !== ficha.transportista.id;
  const [cambioPor, setCambioPor] = useState<'' | 'deja_tirado' | 'cambio_dynamo'>('');
  // Quitar el transportista: primero se pregunta el motivo.
  const [pideQuitar, setPideQuitar] = useState(false);
  const suspendido = (info?.estado ?? t?.estado) === 'suspendido';
  const [precio, setPrecio] = useState(numero(e.importe_transportista, 2));
  const [motivo, setMotivo] = useState('');
  const [camion, setCamion] = useState<string>(e.matricula_camion ?? '');
  const [remolque, setRemolque] = useState<string>(e.matricula_remolque ?? '');
  const [conductor, setConductor] = useState<string>(e.conductor_nombre ?? '');
  const [tel, setTel] = useState<string>(e.conductor_telefono ?? '');
  const [error, setError] = useState<string | null>(null);
  // Día en que carga (usuario, 2026-11-06): con ventana es obligatorio y es el que usa el
  // seguimiento automático; con fecha fija es esa fecha.
  const dias = useMemo(() => diasEntre(e.fecha_carga_desde, e.fecha_carga_hasta), [e.fecha_carga_desde, e.fecha_carga_hasta]);
  const conVentana = dias.length > 1 || !e.fecha_carga_desde;
  const [diaCarga, setDiaCarga] = useState<string>(e.fecha_carga_prevista ?? (dias.length === 1 ? dias[0] : ''));
  // Día de entrega (SIEMPRE estimado; usuario, 2026-11-09): obligatorio al asignar, del
  // mismo día de carga a +7 días hábiles (sábados y domingos fuera; un festivo nacional
  // aquí no se filtra — la base de datos solo exige que no sea anterior a la carga).
  const [entrega, setEntrega] = useState<string>(e.fecha_entrega_estimada ?? '');
  const baseEntrega = conVentana ? diaCarga : (dias[0] ?? '');
  // SUGERENCIA AUTOMÁTICA, pisable a mano (usuario, 2026-11-09): al elegir el día de
  // carga, el motor del seguimiento (tacógrafo, velocidad y minutos por parada de
  // Parámetros, km entre paradas, apertura de los sitios) calcula la llegada a la
  // última parada y se preselecciona. Si el admin ya eligió otra a mano, no se pisa.
  const sugRef = useRef<string | null>(null);
  // «A mano» solo cuenta mientras no cambie el día de carga (usuario, 2026-11-10): al
  // cambiarlo, la estimación anterior (guardada o elegida) es de OTRO día y se recalcula
  // y aplica siempre. La fecha ya guardada del envío se respeta al abrir.
  const manualRef = useRef<boolean>(!!e.fecha_entrega_estimada);
  useEffect(() => {
    if (!baseEntrega) return;
    let vivo = true;
    sugerirEntrega(e.id, baseEntrega).then((s) => {
      if (!vivo || !s) return;
      sugRef.current = s;
      setEntrega((prev) => (manualRef.current && prev) ? prev : s);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [baseEntrega, e.id]);
  const diasEntrega = useMemo(() => {
    if (!baseEntrega) return [] as string[];
    const out = [baseEntrega];
    const [a, m, d] = baseEntrega.split('-').map(Number);
    const x = new Date(a, m - 1, d);
    while (out.length < 8) {
      x.setDate(x.getDate() + 1);
      if (x.getDay() === 0 || x.getDay() === 6) continue;
      out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
    }
    return out;
  }, [baseEntrega]);
  // Si la sugerencia cae fuera de los 7 hábiles (rutas largas), entra igual en la lista.
  const opcionesEntrega = useMemo(() => (!entrega || diasEntrega.includes(entrega)) ? diasEntrega : [...diasEntrega, entrega].sort(), [diasEntrega, entrega]);
  // (Sábado y domingo no se pueden elegir: los camiones no circulan. Un festivo nacional lo pasa
  // la base de datos al siguiente día hábil.)
  // Su flota se pide al elegirlo (no viaja con la ficha la de todos los transportistas).
  const [flota, setFlota] = useState<{ id: string; vehiculos: { matricula: string; tipo: string }[]; conductores: { nombre: string; telefono: string | null }[] } | null>(null);
  useEffect(() => {
    if (!tid) return;
    let vivo = true;
    flotaTransportista(tid).then((f) => { if (vivo) setFlota({ id: tid, ...f }); }).catch(() => {});
    return () => { vivo = false; };
  }, [tid]);
  const fl = flota?.id === tid ? flota : null;
  // Camión nuevo → su chófer de otras veces (o vacío). Chófer nuevo → su teléfono (o vacío),
  // nunca los datos del chófer anterior (usuario, 2026-11-05).
  const [base, setBase] = useState({ camion: camion, conductor: conductor });
  const sinEsp = (x: string) => x.replace(/[^0-9a-z]/gi, '').toUpperCase();
  const norm = (x: string) => x.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  async function alSalirCamion() {
    if (!tid || !camion.trim() || sinEsp(camion) === sinEsp(base.camion)) return;
    const s = await sugerirFlota(tid, { matricula: camion });
    if (!s) return;
    setConductor(s.conductor ?? ''); setTel(s.telefono ?? '');
    setBase({ camion, conductor: s.conductor ?? '' });
  }
  async function alSalirConductor() {
    if (!tid || !conductor.trim() || norm(conductor) === norm(base.conductor)) return;
    const s = await sugerirFlota(tid, { conductor });
    if (!s) return;
    setTel(s.telefono ?? '');
    setBase((b) => ({ ...b, conductor }));
  }
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pv = aNum(precio);
  const margen = pc != null && pv != null && !Number.isNaN(pv) ? pc - pv : null;
  const camiones = useMemo(() => (fl?.vehiculos ?? []).filter((v) => v.tipo !== 'remolque'), [fl]);
  const remolques = useMemo(() => (fl?.vehiculos ?? []).filter((v) => v.tipo === 'remolque'), [fl]);

  // Composiciones recientes del transportista (usuario, 2026-11-15): sugerir por PARES
  // (tractora + su remolque de la última vez), la más reciente arriba, y al elegir una
  // se autorrellena el bloque entero (remolque, conductor y teléfono).
  const [usos, setUsos] = useState<UsoFlota[]>([]);
  useEffect(() => {
    if (!tid) { setUsos([]); return; }
    let vivo = true;
    usosFlota(tid).then((u) => { if (vivo) setUsos(u); }).catch(() => {});
    return () => { vivo = false; };
  }, [tid]);
  // SUGERENCIAS EN LOS CUATRO CAMPOS (usuario, 2026-11-18): tractora, remolque, conductor y
  // teléfono del conductor. Se busca por cualquiera de ellos y, al elegir, se rellenan LOS
  // CUATRO con los datos del último envío en que salió ese dato («un camión suele llevar la
  // misma tractora, conductor y móvil»). Después se puede cambiar a mano lo que haga falta.
  type Campo = 'camion' | 'remolque' | 'conductor' | 'tel';
  const [abre, setAbre] = useState<Campo | null>(null);
  const camCaja = useRef<HTMLDivElement>(null);
  const remCaja = useRef<HTMLDivElement>(null);
  const conCaja = useRef<HTMLDivElement>(null);
  const telCaja = useRef<HTMLDivElement>(null);
  const cajaDe = { camion: camCaja, remolque: remCaja, conductor: conCaja, tel: telCaja };
  const sugLista = useRef<HTMLDivElement>(null);   // la lista flota fuera de la ventana
  useEffect(() => {
    if (!abre) return;
    const caja = { camion: camCaja, remolque: remCaja, conductor: conCaja, tel: telCaja }[abre];
    const fuera = (ev: MouseEvent) => { const t = ev.target as Node; if (caja.current && !caja.current.contains(t) && !sugLista.current?.contains(t)) setAbre(null); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abre]);
  const cifras = (x: string) => x.replace(/\D/g, '');
  const CAMPOS: Campo[] = ['camion', 'remolque', 'conductor', 'tel'];
  const valorDe = (u: UsoFlota, c: Campo) => (c === 'camion' ? u.camion : c === 'remolque' ? u.remolque : c === 'conductor' ? u.conductor : u.telefono) ?? '';
  const claveDe = (c: Campo, v: string) => (c === 'conductor' ? norm(v) : c === 'tel' ? cifras(v) : sinEsp(v));
  const escrito = { camion, remolque, conductor, tel };
  // Los usos que casan con lo escrito en ese campo, sin repetir su valor (el más reciente
  // de cada uno) y como mucho 8.
  const usosDe = (c: Campo): UsoFlota[] => {
    const q = claveDe(c, escrito[c]);
    const vistos = new Set<string>(); const out: UsoFlota[] = [];
    for (const u of usos) {
      const k = claveDe(c, valorDe(u, c));
      if (!k || vistos.has(k)) continue;
      // Si lo más reciente de ese dato es justo lo que ya hay puesto, no hay nada que
      // ofrecer (y la lista no se queda abierta encima de lo de abajo).
      if (CAMPOS.every((x) => claveDe(x, valorDe(u, x)) === claveDe(x, escrito[x]))) { vistos.add(k); continue; }
      // En la tractora también vale escribir la matrícula del remolque (como hasta ahora).
      if (q && !k.includes(q) && !(c === 'camion' && !!u.remolque && sinEsp(u.remolque).includes(q))) continue;
      vistos.add(k); out.push(u);
      if (out.length >= 8) break;
    }
    return out;
  };
  const enUsos = (c: Campo, v: string) => { const k = claveDe(c, v); return usos.some((u) => claveDe(c, valorDe(u, c)) === k); };
  const q = abre ? claveDe(abre, escrito[abre]) : '';
  const usosVisibles = abre ? usosDe(abre) : [];
  // Lo de su FICHA que aún no ha salido en ningún envío (sin fecha de último uso).
  const camionesFicha = abre === 'camion' ? camiones.filter((v) => !enUsos('camion', v.matricula) && (!q || sinEsp(v.matricula).includes(q))) : [];
  const remolquesFicha = abre === 'remolque' ? remolques.filter((v) => !enUsos('remolque', v.matricula) && (!q || sinEsp(v.matricula).includes(q))) : [];
  const conductoresFicha = abre === 'conductor' ? (fl?.conductores ?? []).filter((c) => !enUsos('conductor', c.nombre) && (!q || norm(c.nombre).includes(q))) : [];
  const haySugerencias = usosVisibles.length + camionesFicha.length + remolquesFicha.length + conductoresFicha.length > 0;
  function elegirUso(u: UsoFlota) {
    setCamion(u.camion ?? ''); setRemolque(u.remolque ?? '');
    setConductor(u.conductor ?? ''); setTel(u.telefono ?? '');
    setBase({ camion: u.camion ?? '', conductor: u.conductor ?? '' });
    setAbre(null);
  }
  async function elegirVehiculo(v: { matricula: string; tipo: string }) {
    setCamion(v.matricula);
    if (v.tipo === 'rigido') setRemolque('');
    setAbre(null);
    // Sin uso previo registrado: el chófer conocido de ese camión, si lo hay (regla de 2026-11-05).
    const s = tid ? await sugerirFlota(tid, { matricula: v.matricula }) : null;
    if (s) { setConductor(s.conductor ?? ''); setTel(s.telefono ?? ''); }
    setBase({ camion: v.matricula, conductor: s?.conductor ?? '' });
  }
  const cerrarCon = (ev: React.KeyboardEvent) => { if (ev.key === 'Escape' || ev.key === 'Tab') setAbre(null); };
  // Una fila de la lista: delante, el dato del campo en el que se está; detrás, lo demás.
  const filaUso = (c: Campo, u: UsoFlota) => {
    const resto = CAMPOS.filter((x) => x !== c).map((x) => valorDe(u, x)).filter(Boolean);
    return (
      <button key={`u-${c}-${claveDe(c, valorDe(u, c))}`} type="button" role="option" aria-selected={claveDe(c, escrito[c]) === claveDe(c, valorDe(u, c))}
        onMouseDown={(ev) => ev.preventDefault()} onClick={() => elegirUso(u)}>
        <strong>{valorDe(u, c)}</strong>{resto.length > 0 && <span> · {resto.join(' · ')}</span>}
        <span className="buscador-detalle"> · último {u.cuando ? fecha(u.cuando) : '—'}</span>
      </button>
    );
  };

  async function guardar() {
    setError(null);
    if (!tid) { setError('Elige el transportista.'); avisaFaltas(['as-tra']); return; }
    if (Number.isNaN(pv)) { setError('El precio del transportista no es un número.'); avisaFaltas(['as-precio']); return; }
    // Sin precio no se asigna: la orden de carga nunca sale a 0 € (usuario, 2026-11-15).
    if (pv == null || !(pv > 0)) { setError('Pon el precio del transportista (mayor que 0): sin precio no se puede asignar.'); avisaFaltas(['as-precio']); return; }
    if (conVentana && !diaCarga) { setError('Elige el día en que carga.'); avisaFaltas(['as-dia']); return; }
    if (!entrega) { setError('Elige el día de entrega (estimado).'); avisaFaltas(['as-ent']); return; }
    if (cambiando && !cambioPor) { setError('Di por qué cambias de transportista.'); avisaFaltas(['as-cambio-por']); return; }
    if (suspendido && !forzar) { setError('Este transportista está SUSPENDIDO: marca la casilla roja si se lo das igualmente.'); avisaFaltas(['as-forzar']); return; }
    await hacer('Asignando el transportista', () => asignarTransportista(e.id, {
      transportista_id: tid, importe_transportista: pv, matricula_camion: camion, matricula_remolque: remolque,
      conductor_nombre: conductor, conductor_telefono: tel, fecha_carga_prevista: diaCarga || null,
      fecha_entrega_estimada: entrega, motivo,
      forzar_suspendido: suspendido && forzar, cambio_por: cambiando ? (cambioPor || undefined) : undefined,
    }), `Transportista asignado: ${t?.nombre ?? ''}.`);
  }
  return (
    <Modal abierto ancho={680} onCerrar={onVolver} titulo={`${ficha.transportista ? 'Editar / Cambiar' : 'Asignar'} transportista · #${e.referencia_gx}`}
      sub="Uso interno · el transportista y su vehículo para este envío" icono={<I d={ICO.camion} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        {ficha.transportista && <button className="btn-ghost" style={{ color: '#dc2626' }} disabled={!!trabajando}
          onClick={() => { setPideQuitar(true); setTimeout(() => document.getElementById('as-quitar')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0); }}>Quitar transportista</button>}
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar asignación</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="as-tra">Transportista <Req /></label>
          <Buscador id="as-tra" valor={t} buscar={opciones} onElegir={setT} placeholder="Busca por nombre, CIF, código de bolsa, teléfono o matrícula…"
            vacio="Ningún transportista coincide. Si es nuevo, dalo de alta en «Transportistas», en el menú." />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="as-dia">Día en que carga {conVentana ? <Req /> : null}</label>
          {conVentana && dias.length > 0 ? (
            <select id="as-dia" value={diaCarga} onChange={(ev) => { manualRef.current = false; setDiaCarga(ev.target.value); }}>
              <option value="">Elige el día de la ventana…</option>
              {dias.map((d) => { const w = new Date(`${d}T12:00:00`).getDay(); return <option key={d} value={d} disabled={w === 0 || w === 6}>{fecha(d)} · {DIAS[w]}{w === 0 || w === 6 ? ' (no circula)' : ''}</option>; })}
            </select>
          ) : conVentana ? (
            <CampoFecha id="as-dia" value={diaCarga} onChange={(v) => { manualRef.current = false; setDiaCarga(v); }} />
          ) : <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 700 }}>{fecha(dias[0])} (fecha fija)</div>}
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Con este día va el seguimiento automático: sale hacia la carga y llega a la 1.ª parada a la hora de Parámetros.</div>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="as-ent">Día entrega (estimado) <Req /></label>
          <select id="as-ent" value={opcionesEntrega.includes(entrega) ? entrega : ''} disabled={!baseEntrega} onChange={(ev) => { manualRef.current = true; setEntrega(ev.target.value); }}>
            <option value="">{baseEntrega ? 'Elige el día de entrega…' : 'Elige antes el día en que carga'}</option>
            {opcionesEntrega.map((d) => { const w = new Date(`${d}T12:00:00`).getDay(); return <option key={d} value={d}>{fecha(d)} · {DIAS[w]}{d === baseEntrega ? ' (mismo día de carga)' : ''}{d === sugRef.current ? ' · sugerido' : ''}</option>; })}
          </select>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Se sugiere sola con el plan del seguimiento (horas legales de conducción, km entre paradas, tiempos de parada y horarios de los sitios) y puedes cambiarla. Siempre es una estimación (el cliente la ve como «Entrega estimada»); también marca hasta cuándo ve el teléfono del conductor.</div>
        </div>
        <div>
          <label htmlFor="as-precio">Precio del transportista (€ sin IVA) <Req si /></label>
          <input id="as-precio" type="text" inputMode="decimal" value={precio} placeholder="Ej. 720" onChange={(ev) => setPrecio(ev.target.value)} />
        </div>
        <div>
          <label>Margen</label>
          <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 800, color: margen == null ? 'var(--gray-500)' : margen >= 0 ? '#0f6b3a' : '#dc2626' }}>
            {margen == null ? '—' : `${euros(margen)}${pc ? ` (${Math.round((margen / pc) * 100)} %)` : ''}`}
          </div>
        </div>
        <div>
          <label htmlFor="as-camion">Matrícula camión / tractora <Req si={false} /></label>
          <div className="buscador" ref={camCaja} data-envivo-ignorar="">
            <input id="as-camion" type="text" value={camion} placeholder="Ej. 1234ABC" autoComplete="off"
              onChange={(ev) => { setCamion(ev.target.value); setAbre('camion'); }}
              onFocus={() => setAbre('camion')} onBlur={alSalirCamion} onKeyDown={cerrarCon} />
          </div>
        </div>
        <div>
          <label htmlFor="as-remolque">Matrícula remolque (si es tráiler) <Req si={false} /></label>
          <div className="buscador" ref={remCaja} data-envivo-ignorar="">
            <input id="as-remolque" type="text" value={remolque} placeholder="Ej. R1234BCD" autoComplete="off"
              onChange={(ev) => { setRemolque(ev.target.value); setAbre('remolque'); }}
              onFocus={() => setAbre('remolque')} onKeyDown={cerrarCon} />
          </div>
        </div>
        <div>
          <label htmlFor="as-conductor">Conductor <Req si={false} /></label>
          <div className="buscador" ref={conCaja} data-envivo-ignorar="">
            <input id="as-conductor" type="text" value={conductor} placeholder="Nombre y apellidos" autoComplete="off"
              onChange={(ev) => { setConductor(ev.target.value); setAbre('conductor'); }}
              onFocus={() => setAbre('conductor')} onBlur={alSalirConductor} onKeyDown={cerrarCon} />
          </div>
        </div>
        <div>
          <label htmlFor="as-tel">Móvil del conductor (WhatsApp) <Req si={false} /></label>
          {/* La lista se abre al entrar en el NÚMERO, no en el selector de prefijo. */}
          <div ref={telCaja} data-envivo-ignorar="" onKeyDownCapture={cerrarCon}
            onFocusCapture={(ev) => { if ((ev.target as HTMLElement).tagName === 'INPUT') setAbre('tel'); }}>
            <CampoTelefono id="as-tel" valor={tel} onCambio={(v) => { setTel(v); setAbre('tel'); }} />
          </div>
        </div>
      </div>
      {/* UNA lista, la del campo en el que se está; flota fuera de la ventana. */}
      {abre && haySugerencias && (
        <ListaFlotante key={abre} ancla={cajaDe[abre]} lista={sugLista}>
          {usosVisibles.map((u) => filaUso(abre, u))}
          {camionesFicha.map((v) => (
            <button key={`f-${v.matricula}`} type="button" role="option" aria-selected={sinEsp(camion) === sinEsp(v.matricula)} onMouseDown={(ev) => ev.preventDefault()} onClick={() => elegirVehiculo(v)}>
              <strong>{v.matricula}</strong> <span>· {v.tipo === 'rigido' ? 'Rígido' : 'Tractora'} (de su ficha, sin viajes aún)</span>
            </button>
          ))}
          {remolquesFicha.map((v) => (
            <button key={`r-${v.matricula}`} type="button" role="option" aria-selected={sinEsp(remolque) === sinEsp(v.matricula)} onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { setRemolque(v.matricula); setAbre(null); }}>
              <strong>{v.matricula}</strong> <span>· Remolque (de su ficha, sin viajes aún)</span>
            </button>
          ))}
          {conductoresFicha.map((c) => (
            <button key={`c-${c.nombre}`} type="button" role="option" aria-selected={norm(conductor) === norm(c.nombre)} onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { setConductor(c.nombre); setTel(c.telefono ?? ''); setBase((b) => ({ ...b, conductor: c.nombre })); setAbre(null); }}>
              <strong>{c.nombre}</strong>{c.telefono ? <span> · {c.telefono}</span> : null} <span>· (de su ficha, sin viajes aún)</span>
            </button>
          ))}
        </ListaFlotante>
      )}
      {e.requiere_nima && t && !t.nima && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}><strong>Este envío requiere NIMA</strong> y la ficha de este transportista no lo tiene. Pídeselo y ponlo en su ficha.</div>}
      {(info?.estado ?? t?.estado) === 'no_ofertar' && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}>Este transportista está marcado como <strong>no ofertar</strong>: se le puede dar el envío, pero revisa por qué.</div>}
      {suspendido && (
        <div id="as-suspendido" className="aviso-cierre" role="alert" style={{ marginTop: '0.8rem' }}>
          <strong>⚠ SUSPENDIDO · no ofertar ni cargar.</strong>{info?.motivo ? ` ${info.motivo}.` : ''} No recibe ofertas ni puede aceptar cargas por su cuenta.
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
            <input id="as-forzar" type="checkbox" checked={forzar} onChange={(ev) => setForzar(ev.target.checked)} style={{ marginTop: 3 }} />
            Lo sé y se lo doy igualmente
          </label>
        </div>
      )}
      {info?.nota && (
        <div className="meta" style={{ marginTop: '0.6rem' }} id="as-nota" title={piezasNota(info.nota).join(' · ')}>
          Nota del transportista: {info.nota.nota != null
            ? <strong style={{ color: notaColor(info.nota.nota) }}>{notaTxt(info.nota.nota)} / 10</strong>
            : <>pocos envíos para dar nota ({info.nota.envios})</>}
          {info.nota.nota != null && <> · puntual en {info.nota.puntuales} de {info.nota.con_fechas} · {info.nota.con_incidencia} con incidencia</>}
        </div>
      )}
      {info && info.cancelaciones > 0 && (
        <div className="modal-warn-box" style={{ marginTop: '0.6rem' }} id="as-cancelaciones">
          Nos ha dejado tirados <strong>{info.cancelaciones} {info.cancelaciones === 1 ? 'vez' : 'veces'}</strong> de {info.cargas} cargas ({info.cancelaciones_ultimas} en sus últimas {info.ultimas}).
        </div>
      )}
      {cambiando && (
        <div style={{ marginTop: '0.8rem' }} id="as-cambio-por" role="radiogroup" aria-label="Por qué cambias de transportista">
          <label style={{ fontWeight: 700 }}>¿Por qué cambias de transportista? <Req /></label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
            <button type="button" className={cambioPor === 'deja_tirado' ? 'btn-primary' : 'btn-ghost'} aria-pressed={cambioPor === 'deja_tirado'} onClick={() => setCambioPor('deja_tirado')}>{ficha.transportista?.nombre ?? 'El anterior'} nos deja tirados</button>
            <button type="button" className={cambioPor === 'cambio_dynamo' ? 'btn-primary' : 'btn-ghost'} aria-pressed={cambioPor === 'cambio_dynamo'} onClick={() => setCambioPor('cambio_dynamo')}>Cambio nuestro u otro motivo</button>
          </div>
          <div className="meta" style={{ marginTop: '0.25rem' }}>«Nos deja tirados» cuenta para sus límites de cancelaciones (Parámetros).</div>
        </div>
      )}
      {pideQuitar && ficha.transportista && (
        <div id="as-quitar" style={{ marginTop: '0.8rem', padding: '0.8rem 0.9rem', border: '1.5px solid #f5b5b5', borderRadius: 10, background: '#fdecec' }}>
          <strong style={{ color: '#b42318' }}>¿Por qué quitas a {ficha.transportista.nombre}?</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button type="button" className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando}
              onClick={() => hacer('Quitando el transportista', () => quitarTransportista(e.id, 'deja_tirado'), 'Transportista quitado: el envío vuelve a «Sin asignar».')}>Nos deja tirados (cancela él)</button>
            <button type="button" className="btn-ghost" disabled={!!trabajando}
              onClick={() => hacer('Quitando el transportista', () => quitarTransportista(e.id, 'cambio_dynamo'), 'Transportista quitado: el envío vuelve a «Sin asignar».')}>Cambio nuestro u otro motivo</button>
            <button type="button" className="btn-ghost" onClick={() => setPideQuitar(false)} disabled={!!trabajando}>No quitar</button>
          </div>
        </div>
      )}
      {/* Dentro de la misma rejilla que los demás campos: fuera de ella la etiqueta salía más
          grande y el campo más estrecho (se vio en las fotos de las pantallas, 2026-11-18). */}
      <div className="ptar-sitio-grid" style={{ marginTop: '0.8rem' }}><div className="full">
        <label htmlFor="as-motivo">Motivo del cambio <Req si={false} /> <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>· sale en el DeCA si ya está emitido</span></label>
        <input id="as-motivo" type="text" maxLength={300} value={motivo} placeholder="Ej. Avería de la tractora" onChange={(ev) => setMotivo(ev.target.value)} />
      </div></div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Las matrículas y el conductor se pueden dejar para más tarde. Queda en el historial quién asignó y a qué hora.</p>
      {(error ?? fallo) && <div className="wiz-warn show" role="alert">⚠ {error ?? fallo}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
