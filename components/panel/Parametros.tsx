'use client';

import { fechaHora } from '@/lib/formato';

// Parámetros de la plataforma: cada regla que tiene un número (descuento de bienvenida,
// pronto pago, tarifas de almacén, PIN, reservas…) se cambia aquí, sin tocar el código.
// Los ve todo Dynamo; solo un ADMIN los cambia. Cada cambio queda en la auditoría.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { guardarParametro, lanzarAutosuspension } from '@/app/panel/(app)/parametros/acciones';

import { AYUDA } from '@/lib/parametrosAyuda';

// Datos que deciden a quién paga el cliente: solo se cambian en Supabase (la base de datos
// lo impone; migración parametros_blindados). Aquí se ven, sin poder tocarlos.
const BLINDADOS = ['dynamo_iban', 'dynamo_banco', 'dynamo_bic', 'dynamo_razon_social', 'dynamo_cif'];
// La cuenta bancaria se enseña junta, en una sola caja (son tres datos de lo mismo).
const BANCO = ['dynamo_banco', 'dynamo_iban', 'dynamo_bic'];

export type Candidato = { usuario_id: string; email: string; motivo: string };
export type ParametroFila = { clave: string; valor: unknown; descripcion: string; modificado_en: string | null; anterior?: unknown };
// «03/11/26 · 13:31 (antes: 220)»: el valor que tenía justo antes del último cambio.
const antesTxt = (p: ParametroFila) => p.anterior === undefined ? '' : ` (antes: ${p.anterior === null ? 'vacío' : typeof p.anterior === 'boolean' ? (p.anterior ? 'Sí' : 'No') : texto(p.anterior)})`;

// Secciones y subsecciones, para encontrar cada cosa rápido. Cada subsección lista sus
// claves en el orden en que se enseñan (el interruptor general, primero). Un parámetro
// nuevo que no esté en ninguna lista sale en «Otros»: añadirlo aquí y en lib/parametrosAyuda.
type Sub = { titulo: string; claves: string[]; banco?: boolean };
type Seccion = { id: string; titulo: string; intro: string; subs: Sub[]; especial?: 'autosusp' };
const SECCIONES: Seccion[] = [
  { id: 'clientes', titulo: 'Clientes', intro: 'Precios, contraofertas y condiciones de los clientes.', subs: [
    { titulo: 'Descuento de bienvenida', claves: ['factor_bienvenida_pct', 'factor_bienvenida_envios'] },
    { titulo: 'Antelación y revisión del precio', claves: ['envio_antelacion_max_dias', 'precio_cerrado_dias', 'precio_revision_dias_habiles', 'precio_revision_margen_pct'] },
    { titulo: 'Contraoferta del cliente', claves: ['contraoferta_cliente_activa', 'contraoferta_cliente_auto_pct', 'contraoferta_cliente_max_pct'] },
    { titulo: 'Hora de corte para cargar el siguiente día hábil', claves: ['primer_dia_corte_fija_hora', 'primer_dia_corte_ventana_hora', 'primer_dia_corte_pago_fija_hora', 'primer_dia_corte_pago_ventana_hora'] },
    { titulo: 'Previo pago de envíos', claves: ['pago_previo_activo', 'pago_previo_primeros_envios', 'pago_previo_horas'] },
    { titulo: 'Contacto del conductor', claves: ['contacto_transportista_horas_tras_entrega'] },
    { titulo: 'Sectores de los clientes', claves: ['sectores_cliente'] },
  ] },
  { id: 'riesgos', titulo: 'CESCE - Riesgos', intro: 'Cómo se calcula el dinero pendiente de cobro de cada cliente.', subs: [
    { titulo: 'Riesgo asumido', claves: ['riesgo_dias_asumido'] },
  ] },
  { id: 'transportistas', titulo: 'Transportistas', intro: 'Ofertas de envíos, negociación, bolsa y pago a transportistas.', subs: [
    { titulo: 'Ofertas y reservas', claves: ['oferta_dias_caducidad', 'reserva_minutos'] },
    { titulo: 'Bolsa de cargas', claves: ['bolsa_espera_minutos'] },
    { titulo: 'Negociación (contraofertas)', claves: ['contraoferta_transportista_activa', 'contraoferta_auto_pct', 'negociacion_min_creada_min', 'negociacion_min_bolsa_min', 'negociacion_max_horas_carga', 'negociacion_min_cargas_hechas', 'negociacion_una_por_carga'] },
    { titulo: 'Seguridad del enlace del envío', claves: ['enlace_carga_horas_tras_carga', 'carga_publica_max_fallos_dia', 'carga_publica_max_fallos_reserva', 'tablon_enlace_dias'] },
    { titulo: 'Alta online de transportistas', claves: ['alta_online_max_pendientes_carga', 'alta_online_max_dia'] },
    { titulo: 'Plazo de pago', claves: ['plazo_pago_transportista_dias'] },
    { titulo: 'Pronto pago', claves: ['pronto_pago_encendido', 'pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'pronto_pago_linea_euros', 'pronto_pago_ventana_dias'] },
  ] },
  { id: 'operativa', titulo: 'Operativa', intro: 'Recogida, entrega, almacenaje y horarios.', subs: [
    { titulo: 'PIN de recogida y entrega', claves: ['pin_cifras', 'pin_max_intentos', 'pin_orden_obliga', 'pin_ventana_horas_antes', 'pin_ventana_horas_despues'] },
    { titulo: 'Almacenamientos', claves: ['almacen_precio_semana', 'almacen_precio_reparto'] },
    { titulo: 'Cobertura', claves: ['cobertura_paises'] },
    { titulo: 'Horario de verano de los almacenes', claves: ['verano_sitios_desde', 'verano_sitios_hasta'] },
    { titulo: 'Seguimiento automático del envío', claves: ['seguimiento_activo', 'seguimiento_hora_inicio_jornada', 'seguimiento_hora_primera_parada', 'seguimiento_hora_primera_parada_verano', 'seguimiento_minutos_hasta_carga', 'seguimiento_minutos_por_parada', 'seguimiento_velocidad_kmh', 'seguimiento_km_por_defecto', 'seguimiento_horas_asignando'] },
  ] },
  { id: 'autosusp', titulo: 'Suspensión automática de cuentas', intro: 'Cuándo se suspende sola una cuenta.', subs: [], especial: 'autosusp' },
  { id: 'facturacion', titulo: 'Facturación (Holded)', intro: 'Lo que lleva el fichero que se exporta a Holded.', subs: [
    { titulo: 'Ventas (a clientes)', claves: ['holded_formato_numeracion_venta', 'holded_canal_venta_nombre', 'holded_canal_venta_cuenta'] },
    { titulo: 'Compras (a transportistas)', claves: ['holded_formato_numeracion_compra', 'holded_canal_compra_nombre', 'holded_canal_compra_cuenta'] },
  ] },
  { id: 'plataforma', titulo: 'Plataforma', intro: 'Acceso y protección de datos.', subs: [
    { titulo: 'Mantenimiento', claves: ['mantenimiento_activo'] },
    { titulo: 'Sesión: días sin volver a escribir la contraseña', claves: ['sesion_recordar_dias', 'sesion_dias'] },
    { titulo: 'Protección de datos', claves: ['rgpd_limpieza_activa', 'rgpd_telefono_conductor_anios'] },
  ] },
  { id: 'dynamo', titulo: 'Datos de Dynamo en los documentos', intro: 'Lo que sale en la orden de carga, el CMR y las proformas.', subs: [
    { titulo: 'Empresa', claves: ['dynamo_razon_social', 'dynamo_cif', 'dynamo_tarjeta_ot', 'dynamo_wtransnet'] },
    { titulo: 'Cuenta bancaria', claves: [], banco: true },
    { titulo: 'Dirección', claves: ['dynamo_direccion', 'dynamo_codigo_postal', 'dynamo_poblacion'] },
    { titulo: 'Contacto', claves: ['dynamo_telefono', 'dynamo_movil', 'dynamo_email', 'dynamo_web'] },
  ] },
];
const CONOCIDAS = new Set([...SECCIONES.flatMap((s) => s.subs.flatMap((u) => u.claves)), ...BANCO]);
const texto = (v: unknown) => (v === null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : JSON.stringify(v));
// Quita tildes y mayúsculas para buscar («cesce» encuentra «CESCE», «dias» encuentra «días»).
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Parametros({ filas, esAdmin, error, candidatos = [] }: { filas: ParametroFila[]; esAdmin: boolean; error: string | null; candidatos?: Candidato[] }) {
  const [q, setQ] = useState('');
  const secciones = useMemo(() => {
    const porClave = new Map(filas.map((p) => [p.clave, p]));
    const b = norm(q.trim());
    const casa = (p: ParametroFila, ...extra: string[]) => !b || norm([p.clave, p.descripcion, AYUDA[p.clave]?.titulo ?? '', AYUDA[p.clave]?.explica ?? '', ...extra].join(' ')).includes(b);
    const otros = filas.filter((p) => !CONOCIDAS.has(p.clave) && !p.clave.startsWith('autosusp_'));
    const lista = [...SECCIONES, ...(otros.length ? [{ id: 'otros', titulo: 'Otros', intro: 'Parámetros sin sección todavía.', subs: [{ titulo: 'Sin clasificar', claves: otros.map((p) => p.clave) }] } as Seccion] : [])];
    return lista.map((s) => {
      if (s.especial === 'autosusp') {
        const f = filas.filter((p) => p.clave.startsWith('autosusp_'));
        const ver = f.length > 0 && (!b || norm(s.titulo + ' ' + s.intro + ' suspender cancelaciones consultas').includes(b) || f.some((p) => casa(p, ETIQUETAS[p.clave]?.[0] ?? '')));
        return { ...s, filasEsp: f, subsV: [] as { titulo: string; filas: ParametroFila[]; banco?: boolean }[], ver };
      }
      const enSec = !!b && norm(s.titulo + ' ' + s.intro).includes(b);
      const subsV = s.subs.map((u) => {
        const enSub = enSec || (!!b && norm(u.titulo).includes(b));
        const fs = u.claves.map((k) => porClave.get(k)).filter((p): p is ParametroFila => !!p).filter((p) => enSub || casa(p, s.titulo, u.titulo));
        const banco = !!u.banco && filas.some((p) => BANCO.includes(p.clave)) && (!b || enSub || norm('banco iban bic cuenta bancaria').includes(b));
        return { titulo: u.titulo, filas: fs, banco };
      }).filter((u) => u.filas.length > 0 || u.banco);
      return { ...s, filasEsp: [] as ParametroFila[], subsV, ver: subsV.length > 0 };
    }).filter((s) => s.ver);
  }, [filas, q]);
  const total = secciones.reduce((n, s) => n + s.subsV.reduce((m, u) => m + u.filas.length, 0) + s.filasEsp.length, 0);

  return (
    <section className="section active" id="sec-parametros">
      <div className="sec-header"><h2>Parámetros</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Los números que mueven las reglas de la plataforma. Cada uno explica para qué sirve y trae un ejemplo con el valor que tiene puesto. Se aplican al momento y cada cambio queda registrado (quién y cuándo).
        {!esAdmin && <> Los puede <strong>ver</strong> todo el equipo; solo un <strong>administrador</strong> los cambia.</>}
      </p>
      {error && <div className="pt-aviso error"><div>No se han podido cargar: {error}</div></div>}

      {/* Buscador e índice: para ir directo a lo que se busca. */}
      <div className="prm-indice">
        <input type="search" className="param-input" placeholder="Buscar: «negociación», «PIN», «IBAN», «días»…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar parámetro" style={{ maxWidth: 360, width: '100%' }} />
        {q && <span className="meta">{total ? `${total} encontrado${total === 1 ? '' : 's'}` : 'Nada con esa palabra'}</span>}
        <nav className="prm-saltos" aria-label="Secciones de parámetros">
          {secciones.map((s) => <a key={s.id} href={`#prm-${s.id}`} className="prm-salto">{s.titulo}</a>)}
        </nav>
      </div>

      {secciones.map((s) => (
        <div key={s.id} id={`prm-${s.id}`} className="prm-seccion">
          <div className="ptar-section-head" style={{ marginBottom: '0.15rem' }}>{s.titulo}</div>
          <div className="meta" style={{ marginBottom: '0.6rem' }}>{s.intro}</div>
          {s.especial === 'autosusp'
            ? <ReglasAutosuspension filas={s.filasEsp} candidatos={candidatos} esAdmin={esAdmin} />
            : s.subsV.map((u) => (
              <div key={u.titulo} className="prm-sub">
                <div className="prm-sub-titulo">{u.titulo}</div>
                {u.banco && <CuentaBancaria filas={filas} />}
                {u.filas.length > 0 && <TablaParametros filas={u.filas} esAdmin={esAdmin} />}
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}

// La cuenta bancaria de Dynamo (proformas), en una sola caja y solo para ver: por seguridad
// (fraude de cambio de IBAN) solo se cambia en Supabase. Por dentro siguen siendo tres datos.
function CuentaBancaria({ filas }: { filas: ParametroFila[] }) {
  const v = (k: string) => texto(filas.find((p) => p.clave === k)?.valor ?? '').trim();
  const iban = v('dynamo_iban');
  const ibanBonito = iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
  const dato = (etiqueta: string, valor: string, falta?: string) => (
    <div><div className="meta" style={{ fontWeight: 700 }}>{etiqueta}</div>
      <div style={{ fontWeight: 700, color: valor ? 'var(--navy)' : '#b45309', fontFamily: valor && etiqueta !== 'Banco' ? 'monospace' : undefined }}>{valor || falta || '—'}</div></div>
  );
  return (
    <div className="table-wrap prm-card">
      <div className="prm-titulo" style={{ marginBottom: '0.5rem' }}>Cuenta bancaria de Dynamo (proformas)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem' }}>
        {dato('Banco', v('dynamo_banco'))}
        {dato('IBAN', ibanBonito, 'Sin poner: la proforma sale sin cuenta')}
        {dato('BIC / SWIFT', v('dynamo_bic'))}
      </div>
      <div className="meta" style={{ color: '#b45309', fontWeight: 700, marginTop: '0.6rem' }}>Por seguridad, solo se cambia en Supabase (Table Editor → parametros → dynamo_banco, dynamo_iban y dynamo_bic).</div>
    </div>
  );
}

// ---- Suspensión automática: explicada regla a regla, con ejemplos hechos con los números
// que hay puestos ahora (si se cambia un número, el ejemplo cambia con él). Las condiciones
// exactas viven en la base de datos: autosuspension_candidatos() (migración
// 20261104170000_suspension_automatica). Si se toca una regla allí, actualizar este texto.
const ETIQUETAS: Record<string, [string, string]> = {
  autosuspension_sin_envios_dias: ['Días sin envíos', 'días'],
  autosuspension_sin_acceso_dias: ['Días sin entrar', 'días'],
  autosuspension_consultas_dia: ['Máximo en 24 horas', 'consultas'],
  autosuspension_consultas_semana: ['Máximo en 7 días', 'consultas'],
  autosuspension_consultas_mes: ['Máximo en 30 días', 'consultas'],
  autosuspension_cancel_pct: ['Porcentaje de cancelaciones', '%'],
  autosuspension_cancel_min_envios: ['Envíos mínimos antes de mirar el %', 'envíos'],
  autosuspension_cancel_recientes: ['Número de cancelaciones', ''],
  autosuspension_cancel_recientes_dias: ['En cuántos días', 'días'],
};
// Valores por defecto de la base de datos (parametro_num), por si falta alguno.
const DEFECTO: Record<string, number> = {
  autosuspension_sin_envios_dias: 45, autosuspension_sin_acceso_dias: 400, autosuspension_consultas_dia: 15, autosuspension_consultas_semana: 30,
  autosuspension_consultas_mes: 60, autosuspension_cancel_pct: 30, autosuspension_cancel_min_envios: 5, autosuspension_cancel_recientes: 3, autosuspension_cancel_recientes_dias: 10,
};
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
function duracion(d: number) {
  if (d >= 365) {
    const a = Math.floor(d / 365), m = Math.round((d % 365) / 30.4);
    return `≈ ${a} año${a === 1 ? '' : 's'}${m ? ` y ${m} mes${m === 1 ? '' : 'es'}` : ''}`;
  }
  return d >= 60 ? `≈ ${Math.round(d / 30.4)} meses` : '';
}
const fechaLarga = (d: Date) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(d);

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="prm-bloque">
      <div className="prm-bt">{titulo}</div>
      <div>{children}</div>
    </div>
  );
}

function Regla({ n, titulo, quien, hoy, salta, children, claves, filas, esAdmin }: {
  n: number | null; titulo: string; quien: string; hoy?: number; salta?: 'momento' | 'hora'; children: React.ReactNode;
  claves: string[]; filas: ParametroFila[]; esAdmin: boolean;
}) {
  const ps = claves.map((k) => filas.find((p) => p.clave === k)).filter(Boolean) as ParametroFila[];
  return (
    <div className="table-wrap prm-card">
      <div className="prm-cab">
        {n !== null && <span className="prm-chip">REGLA {n}</span>}
        <span className="prm-titulo">{titulo}</span>
        <span className="meta" style={{ marginLeft: 'auto' }}>Se aplica a: <strong>{quien}</strong></span>
      </div>
      {salta && <div className="meta" style={{ marginTop: '0.2rem', fontWeight: 700, color: salta === 'momento' ? '#b45309' : 'var(--gray-500)' }}>
        {salta === 'momento' ? 'Salta al momento: en cuanto pasa del límite.' : 'Salta en el repaso de cada hora.'}</div>}
      {children}
      {ps.length > 0 && (
        <div className="prm-campos">
          {ps.map((p) => {
            const [et, ud] = ETIQUETAS[p.clave] ?? [p.descripcion, ''];
            return (
              <div key={p.clave}>
                <div className="prm-et">{et}{ud && ud !== '%' ? ` (${ud})` : ud === '%' ? ' (%)' : ''}</div>
                <Control p={p} esAdmin={esAdmin} etiqueta={et} />
                <div className="meta" style={{ fontFamily: 'monospace' }}>{p.clave}{p.modificado_en ? ` · cambiado ${fechaHora(p.modificado_en)}${antesTxt(p)}` : ''}</div>
              </div>
            );
          })}
        </div>
      )}
      {hoy !== undefined && <div className="meta" style={{ marginTop: '0.5rem', fontWeight: 700, color: hoy ? '#b45309' : '#0f6b3a' }}>
        {hoy ? `Hoy la cumplen ${hoy} cuenta${hoy === 1 ? '' : 's'} (lista abajo).` : 'Hoy no la cumple nadie.'}</div>}
    </div>
  );
}

function ReglasAutosuspension({ filas, candidatos, esAdmin }: { filas: ParametroFila[]; candidatos: Candidato[]; esAdmin: boolean }) {
  const refrescar = useRefrescar();
  const [estado, setEstado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const num = (k: string) => {
    const x = Number(filas.find((p) => p.clave === k)?.valor);
    return Number.isFinite(x) ? x : DEFECTO[k];
  };
  const activa = filas.find((p) => p.clave === 'autosuspension_activa');
  const encendida = activa?.valor === true;
  const porRegla = (n: number) => candidatos.filter((c) => c.motivo.startsWith(`Regla ${n}:`)).length;
  async function lanzar() {
    setTrabajando(true); setEstado(null);
    const r = await lanzarAutosuspension();
    setTrabajando(false);
    setEstado(r.ok ? (r.n ? `Suspendidas ${r.n} cuenta${r.n === 1 ? '' : 's'}.` : 'Ninguna cuenta cumplía las reglas.') : r.error);
    if (r.ok) refrescar();
  }

  const r1 = num('autosuspension_sin_envios_dias');
  const r2 = num('autosuspension_sin_acceso_dias');
  const [qd, qs, qm] = [num('autosuspension_consultas_dia'), num('autosuspension_consultas_semana'), num('autosuspension_consultas_mes')];
  const [cp, cmin] = [num('autosuspension_cancel_pct'), num('autosuspension_cancel_min_envios')];
  const [cn, cd] = [num('autosuspension_cancel_recientes'), num('autosuspension_cancel_recientes_dias')];
  // Ejemplos de la regla 3: cuántas al día durante una semana hacen pasarse del máximo semanal.
  const qPorDia = Math.ceil((qs + 1) / 7);
  // Ejemplos de la regla 4.
  const e4 = Math.max(10, cmin);
  const c4 = Math.ceil((e4 * cp) / 100);
  const cMin = Math.ceil((cmin * cp) / 100);
  const usadas = new Set(['autosuspension_activa', ...Object.keys(ETIQUETAS)]);
  const sueltas = filas.filter((p) => !usadas.has(p.clave));

  return (
    <>
      {/* 1. Cómo funciona */}
      <div className="table-wrap prm-card">
        <div className="prm-titulo" style={{ marginBottom: '0.35rem' }}>Cómo funciona, en pocas palabras</div>
        <ul>
          <li><strong>Cuándo — al momento:</strong> las reglas <strong>3, 4 y 5</strong> se miran en el mismo instante en que la persona pide un precio o cancela un envío. Si con esa consulta o cancelación pasa del límite, la cuenta queda suspendida en ese segundo y en su siguiente clic ya no puede seguir.</li>
          <li><strong>Cuándo — cada hora:</strong> en el minuto 17 de cada hora la plataforma repasa todas las cuentas. Es lo que pilla las reglas <strong>1 y 2</strong>, que dependen de que pase el tiempo (nadie «hace» nada que las dispare).</li>
          <li><strong>Qué hace:</strong> si una cuenta cumple <strong>una sola</strong> de las 5 reglas de abajo, la suspende: esa persona ya no puede entrar.</li>
          <li><strong>A quién:</strong> solo a la <strong>persona</strong> (su usuario), nunca a la empresa entera ni a sus compañeros. Al equipo de Dynamo, nunca.</li>
          <li><strong>Dónde se ve:</strong> en <strong>Usuarios</strong> sale como «Suspendida (automática)» y, en su ficha, el motivo exacto (qué regla y con qué números).</li>
          <li><strong>Cómo se reactiva:</strong> a mano, en Usuarios → su ficha → Reactivar. Desde ese día las reglas <strong>vuelven a contar desde cero</strong> para esa persona.</li>
          <li><strong>Excepciones:</strong> en la ficha del usuario se puede marcar «No suspender nunca automáticamente» (un cliente de confianza, por ejemplo).</li>
          <li><strong>Dónde se cambian las reglas:</strong> aquí mismo. Cada número se cambia en su casilla y se pulsa Guardar; se aplica en la siguiente revisión. Solo un administrador puede cambiarlos.</li>
        </ul>
      </div>

      {/* 2. Interruptor general */}
      <Regla n={null} titulo="Interruptor general" quien="todas las reglas" claves={[]} filas={filas} esAdmin={esAdmin}>
        <div className="prm-fila">
          {activa && <Control p={activa} esAdmin={esAdmin} etiqueta="Suspensión automática encendida" />}
          <span style={{ color: encendida ? '#0f6b3a' : '#b45309', fontWeight: 700 }}>
            {encendida ? 'Encendida: suspende al momento (reglas 3, 4 y 5) y en el repaso de cada hora (todas).' : 'Apagada: no se suspende a nadie automáticamente (ni al momento, ni cada hora, ni con «Lanzar ahora»).'}
          </span>
        </div>
      </Regla>

      {/* 3. Las reglas */}
      <Regla n={1} salta="hora" titulo="Pide precios pero no hace envíos" quien="clientes" hoy={porRegla(1)} claves={['autosuspension_sin_envios_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Si la persona ha pedido algún precio en los últimos <strong>{r1} días</strong> y, en esos mismos {r1} días, <strong>nadie de su empresa</strong> ha generado ningún envío.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando pasan las dos cosas a la vez: pide precios <strong>y</strong> su empresa no envía nada en {r1} días.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul>
            <li>Juan (Muebles López) ha pedido 3 precios este mes. En los últimos {r1} días ni él ni nadie de Muebles López ha hecho un envío → <strong>se suspende la cuenta de Juan</strong>.</li>
            <li>Igual, pero su compañera Marta hizo un envío la semana pasada → <strong>no se suspende</strong> (cuenta la empresa, no la persona).</li>
            <li>Juan no ha pedido ningún precio en {r1} días → <strong>no se suspende</strong> por esta regla (no molesta).</li>
          </ul>
        </Bloque>
        <Bloque titulo="No se aplica">A cuentas con menos de {r1} días, ni durante los {r1} días siguientes a reactivarla.</Bloque>
      </Regla>

      <Regla n={2} salta="hora" titulo="No entra nunca" quien="clientes y transportistas" hoy={porRegla(2)} claves={['autosuspension_sin_acceso_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">La última vez que la persona <strong>inició sesión</strong> en la plataforma.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando lleva más de <strong>{r2} días</strong> sin iniciar sesión {duracion(r2) && <>({duracion(r2)})</>}. Es una medida de seguridad: una cuenta olvidada es una puerta abierta.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul>
            <li>Un transportista entró por última vez el {fechaLarga(new Date(Date.now() - (r2 + 10) * 86400000))} → hace más de {r2} días → <strong>se suspende</strong>.</li>
            <li>Un cliente que solo entra de vez en cuando, por ejemplo cada {Math.max(1, Math.floor(r2 / 2))} días, a descargar facturas → <strong>no se suspende</strong> (nunca llega a {r2} días sin entrar).</li>
          </ul>
        </Bloque>
        <Bloque titulo="No se aplica">A cuentas con menos de {r2} días, ni durante los {r2} días siguientes a reactivarla.</Bloque>
      </Regla>

      <Regla n={3} salta="momento" titulo="Demasiadas consultas de precio" quien="clientes" hoy={porRegla(3)} claves={['autosuspension_consultas_dia', 'autosuspension_consultas_semana', 'autosuspension_consultas_mes']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Cuántos precios pide la persona. Hoy cuenta cada <strong>solicitud de precio</strong>; cuando esté el tarifador, contará cada cálculo. Sirve para frenar a quien usa la plataforma solo para sacar precios (la competencia, por ejemplo).</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando pasa de <strong>{qd} en 24 horas</strong>, <strong>o</strong> de <strong>{qs} en 7 días</strong>, <strong>o</strong> de <strong>{qm} en 30 días</strong>. Basta con pasarse en una de las tres.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul>
            <li>Pide {qd} precios hoy → <strong>no pasa nada</strong>. Pide el {qd + 1}.º → <strong>se suspende en ese mismo momento</strong> (no le da tiempo a pedir 3.000).</li>
            {qPorDia <= qd && <li>Pide {qPorDia} precios al día durante una semana = {qPorDia * 7} → pasa de {qs} en 7 días → <strong>se suspende</strong>, aunque ningún día pase de {qd}.</li>}
            <li>Pide pocos al día pero, sumando el mes, llega a {qm + 1} → pasa de {qm} en 30 días → <strong>se suspende</strong>.</li>
          </ul>
        </Bloque>
        <Bloque titulo="Para un cliente concreto">El máximo de 24 horas se puede subir (o bajar) solo para él en Usuarios → su ficha → «Límite de consultas de precio al día». Si está vacío, vale el de aquí.</Bloque>
      </Regla>

      <Regla n={4} salta="momento" titulo="Cancela muchos de sus envíos" quien="clientes" hoy={porRegla(4)} claves={['autosuspension_cancel_pct', 'autosuspension_cancel_min_envios']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">De los envíos que ha pedido <strong>esa persona</strong>, cuántos ha cancelado <strong>ella misma</strong>. Las cancelaciones que hace Dynamo no cuentan. Se cuenta desde que se creó la cuenta (o desde que se reactivó).</Bloque>
        <Bloque titulo="Qué cancelaciones cuentan">Solo las que «hacen daño»: con <strong>camión ya asignado</strong>, o sin camión pero <strong>tarde</strong> (después de las 9:00 del día hábil anterior a la carga). Cancelar sin camión y con tiempo es gratis y <strong>no cuenta</strong>.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando ha pedido <strong>{cmin} envíos o más</strong> y ha cancelado el <strong>{cp} % o más</strong>.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul>
            <li>Ha pedido {e4} envíos y ha cancelado {c4} → {pct(c4, e4)} % → <strong>se suspende</strong>.</li>
            {c4 > 1 && <li>Ha pedido {e4} envíos y ha cancelado {c4 - 1} → {pct(c4 - 1, e4)} % → <strong>no se suspende</strong>.</li>}
            <li>Con justo {cmin} envíos pedidos, basta con cancelar {cMin} para llegar al {cp} % → <strong>se suspende</strong>.</li>
            {cmin > 1 && <li>Con {cmin - 1} envíos pedidos o menos, esta regla <strong>todavía no mira</strong>, aunque los cancele todos (para no castigar al que empieza).</li>}
          </ul>
        </Bloque>
      </Regla>

      <Regla n={5} salta="momento" titulo="Muchas cancelaciones seguidas" quien="clientes" hoy={porRegla(5)} claves={['autosuspension_cancel_recientes', 'autosuspension_cancel_recientes_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Cuántos envíos ha cancelado la persona en los <strong>últimos {cd} días</strong>, tenga los envíos que tenga. Cuentan las mismas que en la regla 4: con camión asignado, o sin camión pasadas las 9:00 del día hábil anterior a la carga.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando cancela <strong>{cn} o más</strong> en {cd} días.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul>
            <li>Cancela {cn} envío{cn === 1 ? '' : 's'} dentro de {cd} días → <strong>se suspende</strong>.</li>
            {cn > 1 && <li>Cancela {cn - 1} en {cd} días → <strong>no se suspende</strong> por esta regla.</li>}
            {cn > 1 && <li>Cancela {cn}, pero con más de {cd} días entre la primera y la última → <strong>no se suspende</strong> por esta regla (sí pueden contar para la regla 4).</li>}
          </ul>
        </Bloque>
      </Regla>

      {sueltas.length > 0 && <TablaParametros filas={sueltas} esAdmin={esAdmin} />}

      {/* 4. Quién caería hoy + lanzar */}
      <div className="table-wrap prm-card">
        <div className="prm-titulo">Si el repaso se lanzara ahora, caerían {candidatos.length}{candidatos.length ? ':' : ' (nadie).'}</div>
        {candidatos.length > 0 && <ul style={{ marginTop: '0.4rem' }}>{candidatos.map((c) => <li key={c.usuario_id}><strong>{c.email}</strong> · {c.motivo}</li>)}</ul>}
        <div className="meta" style={{ marginTop: '0.4rem' }}>Esta lista no suspende a nadie: solo enseña lo que haría el próximo repaso (cada hora) con los números de arriba. Sirve para probar un número antes de dejarlo. «Lanzar ahora» hace el repaso sin esperar.</div>
        {esAdmin && <div style={{ marginTop: '0.6rem' }}><button className="btn-secondary" onClick={lanzar} disabled={trabajando || !encendida}>{trabajando ? 'Lanzando…' : 'Lanzar ahora'}</button>
          {!encendida && <span className="meta" style={{ marginLeft: '0.5rem' }}>El interruptor general está apagado.</span>}</div>}
        {estado && <div className="meta" style={{ marginTop: '0.35rem', fontWeight: 700 }}>{estado}</div>}
      </div>
    </>
  );
}

function Control({ p, esAdmin, etiqueta }: { p: ParametroFila; esAdmin: boolean; etiqueta?: string }) {
  const refrescar = useRefrescar();
  const tipo = typeof p.valor === 'boolean' ? 'si_no' : typeof p.valor === 'number' ? 'numero' : 'texto';
  const [v, setV] = useState(texto(p.valor));
  const [estado, setEstado] = useState<null | 'guardando' | 'ok' | string>(null);
  const cambiado = v !== texto(p.valor);
  const blindado = BLINDADOS.includes(p.clave);
  const puede = esAdmin && !blindado;

  async function guardar(valor: unknown) {
    setEstado('guardando');
    const r = await guardarParametro(p.clave, valor);
    setEstado(r.ok ? 'ok' : r.error);
    if (r.ok) refrescar();
  }
  function guardarTexto() {
    if (tipo === 'numero') {
      const n = Number(v.replace(',', '.'));
      if (!v.trim() || !Number.isFinite(n)) { setEstado('Tiene que ser un número.'); return; }
      guardar(n);
    } else if (p.valor === null) {
      // Vacío = sin valor (null); si escriben un número, se guarda como número.
      const t = v.trim(), n = Number(t.replace(',', '.'));
      guardar(!t ? null : Number.isFinite(n) ? n : t);
    } else guardar(v);
  }

  return (
    <>
      {tipo === 'si_no' ? (
        <label className="ptar-tramp-box" style={{ display: 'inline-flex' }}>
          <input type="checkbox" className="ptar-switch-input" checked={p.valor === true} disabled={!puede || estado === 'guardando'}
            onChange={(e) => guardar(e.target.checked)} aria-label={etiqueta ?? p.descripcion} />
          <span className="ptar-switch" aria-hidden="true" />
          <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
        </label>
      ) : (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="text" inputMode={tipo === 'numero' ? 'decimal' : 'text'} value={v} disabled={!puede} onChange={(e) => { setV(e.target.value); setEstado(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && cambiado) guardarTexto(); }} className="param-input" style={{ maxWidth: 200 }} aria-label={etiqueta ?? p.descripcion} />
          {puede && cambiado && <button className="btn-primary" style={{ padding: '0.4rem 0.8rem' }} onClick={guardarTexto} disabled={estado === 'guardando'}>Guardar</button>}
        </div>
      )}
      {estado === 'guardando' && <div className="meta">Guardando…</div>}
      {estado === 'ok' && <div className="meta" style={{ color: '#0f6b3a', fontWeight: 700 }}>Guardado</div>}
      {estado && estado !== 'ok' && estado !== 'guardando' && <div className="meta" style={{ color: 'var(--red)', fontWeight: 700 }}>{estado}</div>}
    </>
  );
}

function TablaParametros({ filas, esAdmin }: { filas: ParametroFila[]; esAdmin: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th style={{ width: '45%' }}>Para qué sirve</th><th>Valor</th><th>Último cambio</th></tr></thead>
        <tbody>{filas.map((p) => <Fila key={p.clave} p={p} esAdmin={esAdmin} />)}</tbody>
      </table>
    </div>
  );
}

function Fila({ p, esAdmin }: { p: ParametroFila; esAdmin: boolean }) {
  return (
    <tr>
      <td>
        {AYUDA[p.clave] ? <>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{AYUDA[p.clave].titulo}</div>
          <div style={{ color: 'var(--gray-700)', marginTop: '0.15rem' }}>{AYUDA[p.clave].explica}</div>
          {AYUDA[p.clave].ejemplo && <div className="meta" style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>Ejemplo: {AYUDA[p.clave].ejemplo!(p.valor === null ? 'vacío' : typeof p.valor === 'boolean' ? (p.valor ? 'Sí' : 'No') : texto(p.valor))}</div>}
        </> : p.descripcion}
        <div className="meta" style={{ fontFamily: 'monospace' }}>{p.clave}</div>
        {BLINDADOS.includes(p.clave) && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Por seguridad, solo se cambia en Supabase (Table Editor → parametros).</div>}</td>
      <td style={{ minWidth: 220 }}><Control p={p} esAdmin={esAdmin} /></td>
      <td>{p.modificado_en ? <>{fechaHora(p.modificado_en)}{antesTxt(p) && <div className="meta">{antesTxt(p).trim()}</div>}</> : '—'}</td>
    </tr>
  );
}
