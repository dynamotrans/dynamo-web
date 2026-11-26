'use client';

// Administración → Facturas (usuario, 2026-11-25). Las facturas EMITIDAS por Dynamo, leídas de
// la copia que la plataforma mantiene al día sola: Dynamo las ve todas (con empresa, CIF y
// cuenta contable) y cada cliente, las suyas. La base de datos manda una página cada vez
// (25 filas), con el total y las sumas de lo filtrado: va igual con 700 que con 20.000.
// Los ABONOS (facturas rectificativas) salen en la misma lista, en negativo y con su etiqueta:
// restan en las sumas, y uno «por compensar» resta de lo que queda por cobrar.
// Es SOLO LECTURA: las facturas se crean, se modifican y se cobran en el programa de
// facturación. Las recibidas no se enseñan aquí. Al cliente nunca se le nombra ese programa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { euros, fecha, haceTxt, numero } from '@/lib/formato';
import PaginadorLocal from './PaginadorLocal';
import FiltroFechas from './FiltroFechas';
import CampoFecha from '@/components/CampoFecha';
import { facturasPagina, actualizarFacturas, repasarFacturas, type FacturaFila, type PaginaFacturas, type EstadoCopia } from '@/app/panel/(app)/administracion/acciones';

const POR_PAGINA = 25;
const COPIA_VALE_MS = 15 * 60_000;
const PLAZO_REAL = 60;   // días desde la emisión: el plazo real de pago de los clientes

// CONSULTAS A LA FACTURACIÓN GASTADAS ESTE MES (usuario, 2026-11-26: «8565/30.000 con barra de
// progreso y fecha de renovación»). Normal hasta el 70 %, naranja hasta el 90 % y rojo después:
// con el 90 % la copia deja de actualizarse sola hasta el mes siguiente.
function UsoConsultas({ uso }: { uso: NonNullable<EstadoCopia['uso']> }) {
  const pct = Math.min(100, Math.round((uso.usadas / uso.limite) * 100));
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : 'var(--purple)';
  return (
    <span id="facturas-uso" className="meta" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
      title={uso.oficial ? 'Consultas a la facturación de toda tu cuenta este mes, según la propia facturación.' : 'Consultas a la facturación que ha hecho la plataforma este mes (contadas por ella: la facturación no deja leer su cifra con esta clave).'}>
      <span>Consultas: <strong style={{ color: pct >= 70 ? color : 'var(--navy)' }}>{numero(uso.usadas, 0)}</strong> / {numero(uso.limite, 0)}</span>
      <span role="progressbar" aria-label="Consultas a la facturación gastadas este mes" aria-valuemin={0} aria-valuemax={uso.limite} aria-valuenow={Math.min(uso.usadas, uso.limite)}
        style={{ display: 'inline-block', width: 110, height: 7, borderRadius: 4, background: 'var(--gray-200)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
      </span>
      <span>{pct} %{uso.oficial ? '' : ' (solo la plataforma)'}{uso.renueva ? ` · se renueva el ${fecha(uso.renueva)}` : ''}</span>
    </span>
  );
}
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const nDias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

// PAGO: pendiente → cuándo vence; vencida → desde cuándo; pagada → cuándo se cobró y cuántos
// días tardó desde la factura (y si fue después del vencimiento, cuántos de retraso; esto
// último solo lo ve Dynamo). Manda el IMPORTE pendiente: con algo por cobrar, se dice cuánto.
function Pago({ f, hoy, dynamo }: { f: FacturaFila; hoy: string; dynamo: boolean }) {
  // UN ABONO (factura rectificativa, en negativo) no se cobra ni vence: o está por compensar
  // (aún resta de lo que debe el cliente) o ya se ha devuelto o compensado.
  if (f.tipo === 'abono') {
    if (f.estado === 'anulada') return <span className="badge badge-gray">Anulada</span>;
    if (f.estado === 'pagada') return <><span className="badge badge-green">Compensado</span>{f.pagada_el && <span className="fac-pagada-el" style={{ marginLeft: '0.4rem', fontWeight: 600 }}>{fecha(f.pagada_el)}</span>}</>;
    return <><span className="badge badge-orange">Por compensar</span>
      {f.parcial && <span className="meta" style={{ display: 'block', marginTop: 2, fontWeight: 700 }}>quedan {euros(Math.abs(f.pendiente))}</span>}</>;
  }
  if (f.estado === 'pagada') {
    const tarde = dynamo && f.pagada_el && f.vence && f.pagada_el > f.vence ? dias(f.vence, f.pagada_el) : 0;
    return <>
      {/* La fecha del cobro, al lado de la etiqueta (usuario, 2026-11-26). */}
      <span className="badge badge-green">Pagada</span>{f.pagada_el && <span className="fac-pagada-el" style={{ marginLeft: '0.4rem', fontWeight: 600 }}>{fecha(f.pagada_el)}</span>}
      {f.pagada_el && dynamo && <span className="meta" style={{ display: 'block', marginTop: 2 }}>a los {nDias(Math.max(0, dias(f.fecha, f.pagada_el)))}</span>}
      {tarde > 0 && <span className="meta" style={{ display: 'block', color: '#b42318', fontWeight: 700 }}>{nDias(tarde)} tarde</span>}
    </>;
  }
  if (f.estado === 'vencida' || f.estado === 'pendiente') {
    // Días desde la emisión (solo Dynamo): el plazo real de pago son 60 días desde la factura,
    // ponga lo que ponga su vencimiento. Pasados, se marca en rojo (filtro «Vencidas 60 días»).
    const desde = Math.max(0, dias(f.fecha, hoy));
    return <>
    <span className={`badge ${f.estado === 'vencida' ? 'badge-red' : 'badge-orange'}`}>{f.estado === 'vencida' ? 'Vencida' : 'Pendiente'}</span>
    {f.parcial && <span className="meta" style={{ display: 'block', marginTop: 2, fontWeight: 700 }}>faltan {euros(f.pendiente)}</span>}
    {dynamo && f.pendiente > 0 && <span className="meta fac-dias" style={{ display: 'block', marginTop: 2, ...(desde > PLAZO_REAL ? { color: '#b42318', fontWeight: 700 } : {}) }}>{nDias(desde)} desde la factura</span>}
    {f.vence && <span className="meta" style={{ display: 'block', marginTop: 2 }}>{f.estado === 'vencida' ? `venció ${fecha(f.vence)} · hace ${nDias(Math.max(0, dias(f.vence, hoy)))}` : `vence ${fecha(f.vence)}`}</span>}
    </>;
  }
  if (f.estado === 'anulada') return <span className="badge badge-gray">Anulada</span>;
  return <span className="meta">—</span>;
}

export default function Facturas({ dynamo }: { dynamo: boolean }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('todas');
  const [ff, setFf] = useState({ valor: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [r, setR] = useState<PaginaFacturas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [alDia, setAlDia] = useState<{ leyendo: boolean; fallo: string | null }>({ leyendo: false, fallo: null });
  const [vuelta, setVuelta] = useState(0);
  const turno = useRef(0);
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

  // La página que toca. El buscador espera a que se deje de escribir; lo demás, al momento.
  // Si llega una respuesta vieja (se ha vuelto a filtrar mientras tanto), no se pinta.
  const filtros = `${q}|${estado}|${ff.valor}|${ff.desde}|${ff.hasta}`;
  const anterior = useRef(filtros);
  useEffect(() => {
    const cambio = anterior.current !== filtros;
    anterior.current = filtros;
    if (cambio && pagina !== 1) { setPagina(1); return; }
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      setCargando(true);
      let res: PaginaFacturas;
      try { res = await facturasPagina({ q, estado, fecha: ff.valor, desde: ff.desde, hasta: ff.hasta, pagina }); }
      catch { res = { ok: false, error: 'No se han podido leer las facturas. Prueba otra vez en un momento.' }; }
      if (mio === turno.current) { setR(res); setCargando(false); }
    }, cambio ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina, vuelta]);

  // «Actualizar ahora» (solo Dynamo): una pasada de la puesta al día. Mientras la primera
  // carga no acabe, repite sola (hasta 12 veces) y va pintando lo que entra.
  const copia: EstadoCopia | null = r?.ok ? r.copia : null;
  // Con `repasarDesde`, la primera llamada además empieza un repaso de todo desde ese día.
  const actualizar = useCallback(async (repasarDesde?: string) => {
    setAlDia({ leyendo: true, fallo: null });
    let fallo: string | null = null;
    for (let i = 0; i < 12; i++) {
      let res;
      try { res = i === 0 && repasarDesde ? await repasarFacturas(repasarDesde) : await actualizarFacturas(); }
      catch { fallo = 'No se ha podido leer la facturación. Prueba otra vez en un momento.'; break; }
      if (!res.ok) { fallo = res.error; break; }
      setVuelta((n) => n + 1);
      if (!res.cargando) break;
      await new Promise((ok) => setTimeout(ok, 16_000));
    }
    setAlDia({ leyendo: false, fallo });
    setVuelta((n) => n + 1);
  }, []);
  // Al entrar: si la copia es vieja, está a medias o no existe, se pone al día sola una vez.
  const hecho = useRef(false);
  const [repaso, setRepaso] = useState<{ abierto: boolean; desde: string }>({ abierto: false, desde: '' });
  useEffect(() => {
    if (!dynamo || hecho.current || !copia?.conectado) return;
    const ultimo = copia.ultima ? Date.parse(copia.ultima) : 0;
    if (!copia.cargada || Date.now() - ultimo > COPIA_VALE_MS) { hecho.current = true; void actualizar(); }
  }, [dynamo, copia, actualizar]);

  const filas = r?.ok ? r.filas : [];
  const total = r?.ok ? r.total : 0;
  const columnas = dynamo ? 9 : 7;
  const sinNada = r?.ok && total === 0 && !q && estado === 'todas' && !ff.valor;

  return (
    <div id="facturas">
      <div className="filters">
        <input type="search" id="fac-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder={dynamo ? 'Buscar por nº de factura, empresa, CIF, importe…' : 'Buscar por nº de factura o importe…'} />
        <select className="filter-estado" id="fac-estado" style={{ minWidth: 200 }} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado del pago">
          <option value="todas">Todas</option>
          <option value="por_cobrar">{dynamo ? 'Por cobrar (pendientes y vencidas)' : 'Pendientes de pago'}</option>
          {dynamo ? <option value="vencida_60">Vencidas 60 días</option> : <option value="vencida">Vencidas</option>}
          <option value="pagada">Pagadas</option>
          <option value="abono">Abonos</option>
          {dynamo && <option value="anulada">Anuladas</option>}
        </select>
        <FiltroFechas id="fac-periodo" valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={(valor, desde, hasta) => setFf({ valor, desde, hasta })} etiqueta="Filtrar por fecha de la factura" />
      </div>

      {dynamo && copia && !copia.conectado && !copia.enCopia && (
        <div className="pt-aviso info" id="facturas-sin-conectar" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Las facturas emitidas llegarán aquí al conectar la plataforma con la facturación.</strong> Mientras tanto, se emiten y consultan como siempre. Las recibidas no se traen: se gestionan en el programa de facturación.
        </div></div>
      )}
      {dynamo && copia && (copia.conectado || copia.enCopia > 0) && (
        <p className="meta" id="facturas-nota" style={{ margin: '0 0 0.6rem', display: 'flex', gap: '0.3rem 1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}><span>
          {alDia.leyendo ? (copia.cargada ? 'Leyendo de la facturación… (si es un repaso largo, puede tardar unos minutos)' : `Primera carga: trayendo las facturas de los últimos 12 meses… (${numero(copia.enCopia, 0)} hasta ahora)`)
            : <>Copia de las facturas emitidas{copia.desde ? ` desde el ${fecha(copia.desde)}` : ''}: {numero(copia.enCopia - copia.anteriores, 0)} {copia.enCopia - copia.anteriores === 1 ? 'factura' : 'facturas'}
                {/* Las más antiguas están solo porque debían algo: se dicen aparte, para que la fecha no engañe. */}
                {copia.anteriores > 0 && <span id="facturas-anteriores">, y {numero(copia.anteriores, 0)} {copia.anteriores === 1 ? 'anterior que aún debía algo' : 'anteriores que aún debían algo'}</span>}
                {copia.ultimaOk ? ` · al día ${haceTxt(copia.ultimaOk)}` : ' · aún sin leer'}. Se actualiza sola.</>}
          {copia.conectado && !alDia.leyendo && <>{' '}<button type="button" className="enlace-paso" id="facturas-actualizar" onClick={() => actualizar()}>Actualizar ahora</button>
            {copia.cargada && <>{' · '}<button type="button" className="enlace-paso" id="facturas-repasar" aria-expanded={repaso.abierto} onClick={() => setRepaso((x) => ({ ...x, abierto: !x.abierto }))}>Repasar desde una fecha…</button></>}</>}
          </span>{copia.uso && (copia.conectado || copia.uso.usadas > 0) && <UsoConsultas uso={copia.uso} />}
        </p>
      )}
      {dynamo && copia?.conectado && copia.uso && copia.uso.usadas >= copia.uso.limite * 0.9 && (
        <div className="pt-aviso error" id="facturas-sin-cupo" role="alert" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Casi no quedan consultas a la facturación este mes.</strong> Para no quedarse a cero, la copia ha dejado de actualizarse sola{copia.uso.renueva ? ` hasta el ${fecha(copia.uso.renueva)}` : ''}. «Actualizar ahora» sigue funcionando.
        </div></div>
      )}
      {/* Para lo que el repaso de cada noche (los últimos 6 meses) no mira: una factura antigua ya
          pagada a la que se le corrige el importe o el cliente en la facturación. */}
      {dynamo && copia?.conectado && copia.cargada && repaso.abierto && !alDia.leyendo && (
        <div className="pt-aviso info" id="facturas-repaso" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Volver a leer de la facturación todas las facturas desde un día.</strong> Cada noche se repasan solas las de los últimos 6 meses, y las que deben algo, cada pocos minutos. Esto es para una corrección en una factura más antigua ya pagada.
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <CampoFecha className="param-input" value={repaso.desde} onChange={(v) => setRepaso((x) => ({ ...x, desde: v }))} aria-label="Repasar desde" max={hoy} permitirBorrar style={{ width: 'auto', minWidth: 170 }} />
            <button type="button" className="btn-primary" id="facturas-repasar-ir" disabled={!repaso.desde}
              onClick={() => { const d = repaso.desde; setRepaso({ abierto: false, desde: '' }); void actualizar(d); }}>Repasar desde ese día</button>
            <button type="button" className="btn-ghost" onClick={() => setRepaso({ abierto: false, desde: '' })}>Cancelar</button>
          </div>
        </div></div>
      )}
      {dynamo && (alDia.fallo ?? copia?.error) && (
        <div className="pt-aviso error" id="facturas-error" role="alert" style={{ marginBottom: '0.8rem' }}><div>
          <strong>La última lectura de la facturación ha fallado.</strong> {alDia.fallo ?? copia?.error} {copia?.ultimaOk ? 'Se sigue enseñando lo último que se leyó bien.' : ''}
        </div></div>
      )}
      {r && !r.ok && (
        <div className="pt-aviso error" id="facturas-fallo" role="alert" style={{ marginBottom: '0.8rem' }}><div>
          {r.error}{' '}<button type="button" className="enlace-paso" onClick={() => setVuelta((n) => n + 1)}>Reintentar</button>
        </div></div>
      )}
      {dynamo && <p className="meta" style={{ margin: '0 0 0.6rem' }}>Solo lectura: las facturas se crean, se modifican y se cobran en el programa de facturación; aquí se consultan.</p>}

      {r?.ok && total > 0 && (
        <div className="meta" id="facturas-totales" style={{ margin: '0 0 0.6rem', display: 'flex', gap: '0.3rem 1.2rem', flexWrap: 'wrap' }}>
          {dynamo && <span>Base: <strong style={{ color: '#1e3a8a' }}>{euros(r.base)}</strong></span>}
          <span>Total facturado: <strong style={{ color: 'var(--navy)' }}>{euros(r.importe)}</strong></span>
          <span>{dynamo ? 'Por cobrar' : 'Pendiente de pago'}: <strong style={{ color: r.porCobrar > 0 ? '#b45309' : 'var(--navy)' }}>{euros(r.porCobrar)}</strong></span>
          {r.vencido > 0 && <span>De eso, vencido: <strong style={{ color: '#dc2626' }}>{euros(r.vencido)}</strong></span>}
        </div>
      )}

      <div className="table-wrap" tabIndex={0} aria-busy={cargando}>
        <table className="data" id="facturas-lista" style={cargando && r ? { opacity: 0.6 } : undefined}>
          <thead><tr>
            <th>Fecha</th><th>Nº factura</th>{dynamo && <th>CIF · Empresa</th>}
            <th className="amount">Base</th><th className="amount">IVA</th><th className="amount">Retención</th><th className="amount">Total</th><th>Pago</th>{dynamo && <th>Cuenta contable</th>}
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={columnas} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {!r ? 'Leyendo las facturas…' : !r.ok ? 'No se han podido leer las facturas.'
                  : sinNada ? (dynamo ? 'Aún no hay facturas en la plataforma.' : 'Aún no tienes facturas aquí. Te las seguimos enviando por email como siempre.')
                  : 'No hay facturas con estos filtros.'}
              </td></tr>
            ) : filas.map((f) => {
              const pdf = /^[0-9a-f]{24}$/.test(f.id) ? `/api/facturas/${f.id}/pdf` : null;
              return (
                <tr key={f.id} data-estado={f.estado} data-tipo={f.tipo} title={pdf ? (f.tipo === 'abono' ? 'Abrir el abono en PDF' : 'Abrir la factura en PDF') : undefined}
                  onClick={pdf ? () => { const w = window.open(pdf, '_blank'); if (!w) location.href = pdf; } : undefined} style={pdf ? { cursor: 'pointer' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fecha(f.fecha)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><strong style={{ color: 'var(--navy)' }}>{f.numero ?? '—'}</strong>
                    {f.tipo === 'abono' && <span className="badge badge-gray fac-abono" style={{ marginLeft: '0.4rem' }}>Abono</span>}
                    {f.tipo === 'abono' && f.rectifica && <span className="meta fac-rectifica" style={{ display: 'block' }}>de la factura {f.rectifica}</span>}</td>
                  {dynamo && <td style={{ minWidth: 150 }}>{f.empresa ?? '—'}
                    <span className="meta" style={{ display: 'block' }}>{f.cif ?? 'CIF sin consultar'}{f.cif && !f.es_cliente ? ' · no es cliente de la plataforma' : ''}</span></td>}
                  <td className="amount" style={{ whiteSpace: 'nowrap' }}>{euros(f.base)}</td>
                  <td className="amount" style={{ whiteSpace: 'nowrap' }}>{euros(f.iva)}</td>
                  <td className="amount" style={{ whiteSpace: 'nowrap' }}>{f.retencion ? `−${euros(f.retencion)}` : '—'}</td>
                  <td className="amount" style={{ whiteSpace: 'nowrap' }}><strong>{euros(f.total)}</strong></td>
                  <td style={{ whiteSpace: 'nowrap' }}><Pago f={f} hoy={hoy} dynamo={dynamo} /></td>
                  {/* El NOMBRE de la cuenta (usuario, 2026-11-26), con su número debajo. */}
                  {dynamo && <td className="fac-cuenta" style={{ minWidth: 130 }}>{f.cuenta ? f.cuenta.split(' / ').map((c, i) => { const [a, ...b] = c.split(' · '); const nombre = b.join(' · ');
                    return <span key={i} style={{ display: 'block' }}>{nombre || a}{nombre && <span className="meta" style={{ display: 'block' }}>{a}</span>}</span>; }) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginadorLocal p={{ visibles: filas, total, pagina, porPagina: POR_PAGINA, ir: setPagina }} nombre="facturas" nombreUno="factura" />
    </div>
  );
}
