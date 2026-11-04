'use client';

// Parámetros de la plataforma: cada regla que tiene un número (descuento de bienvenida,
// pronto pago, tarifas de almacén, PIN, reservas…) se cambia aquí, sin tocar el código.
// Los ve todo Dynamo; solo un ADMIN los cambia. Cada cambio queda en la auditoría.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { guardarParametro, lanzarAutosuspension } from '@/app/panel/(app)/parametros/acciones';
import { creadoTxt } from '@/lib/envios';

// Datos que deciden a quién paga el cliente: solo se cambian en Supabase (la base de datos
// lo impone; migración parametros_blindados). Aquí se ven, sin poder tocarlos.
const BLINDADOS = ['dynamo_iban', 'dynamo_banco', 'dynamo_bic', 'dynamo_razon_social', 'dynamo_cif'];
// La cuenta bancaria se enseña junta, en una sola caja (son tres datos de lo mismo).
const BANCO = ['dynamo_banco', 'dynamo_iban', 'dynamo_bic'];

export type Candidato = { usuario_id: string; email: string; motivo: string };
export type ParametroFila = { clave: string; valor: unknown; descripcion: string; modificado_en: string | null };

// Grupos por el principio de la clave (lo que no encaje, en «Otros»).
const GRUPOS: [string, string, (k: string) => boolean][] = [
  ['clientes', 'Clientes y precios', (k) => k.startsWith('factor_') || k.startsWith('contraoferta')],
  ['pronto', 'Pronto pago a transportistas', (k) => k.startsWith('pronto_pago') || k.startsWith('plazo_pago')],
  ['ofertas', 'Ofertas, reservas y bolsas de carga', (k) => k.startsWith('oferta') || k.startsWith('reserva') || k.startsWith('bolsa')],
  ['almacen', 'Almacenamientos', (k) => k.startsWith('almacen')],
  ['pin', 'PIN de recogida y entrega', (k) => k.startsWith('pin_')],
  ['holded', 'Holded (facturación)', (k) => k.startsWith('holded')],
  ['pago', 'Previo pago de envíos', (k) => k.startsWith('previo_pago')],
  ['autosusp', 'Suspensión automática de cuentas', (k) => k.startsWith('autosusp_')],
  ['plataforma', 'Plataforma', (k) => k.startsWith('mantenimiento')],
  ['dynamo', 'Datos de Dynamo en los documentos', (k) => k.startsWith('dynamo_')],
];
const grupoDe = (k: string) => GRUPOS.find(([, , f]) => f(k))?.[0] ?? 'otros';
const texto = (v: unknown) => (v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

export default function Parametros({ filas, esAdmin, error, candidatos = [] }: { filas: ParametroFila[]; esAdmin: boolean; error: string | null; candidatos?: Candidato[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, ParametroFila[]>();
    filas.filter((p) => !BANCO.includes(p.clave)).forEach((p) => m.set(grupoDe(p.clave), [...(m.get(grupoDe(p.clave)) ?? []), p]));
    if (filas.some((p) => BANCO.includes(p.clave)) && !m.has('dynamo')) m.set('dynamo', []);
    return [...GRUPOS.map(([k, t]) => [k, t] as [string, string]), ['otros', 'Otros'] as [string, string]]
      .filter(([k]) => m.has(k)).map(([k, t]) => ({ k, t, filas: m.get(k)! }));
  }, [filas]);
  return (
    <section className="section active" id="sec-parametros">
      <div className="sec-header"><h2>Parámetros</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Los números que mueven las reglas de la plataforma. Se aplican al momento y cada cambio queda registrado (quién y cuándo).
        {!esAdmin && <> Los puede <strong>ver</strong> todo el equipo; solo un <strong>administrador</strong> los cambia.</>}
      </p>
      {error && <div className="pt-aviso error"><div>No se han podido cargar: {error}</div></div>}
      {grupos.map((g) => (
        <div key={g.t} style={{ marginBottom: '1.1rem' }}>
          <div className="ptar-section-head" style={{ marginBottom: '0.5rem' }}>{g.t}</div>
          {g.k === 'dynamo' && <CuentaBancaria filas={filas} />}
          {g.k === 'autosusp' ? <ReglasAutosuspension filas={g.filas} candidatos={candidatos} esAdmin={esAdmin} /> : <TablaParametros filas={g.filas} esAdmin={esAdmin} />}
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
    <div className="table-wrap" style={{ padding: '0.9rem 1rem', marginBottom: '0.7rem' }}>
      <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.5rem' }}>Cuenta bancaria de Dynamo (proformas)</div>
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
  autosusp_sin_envios_dias: ['Días sin envíos', 'días'],
  autosusp_sin_acceso_dias: ['Días sin entrar', 'días'],
  autosusp_consultas_dia: ['Máximo en 24 horas', 'consultas'],
  autosusp_consultas_semana: ['Máximo en 7 días', 'consultas'],
  autosusp_consultas_mes: ['Máximo en 30 días', 'consultas'],
  autosusp_cancel_pct: ['Porcentaje de cancelaciones', '%'],
  autosusp_cancel_min_envios: ['Envíos mínimos antes de mirar el %', 'envíos'],
  autosusp_cancel_recientes: ['Número de cancelaciones', ''],
  autosusp_cancel_recientes_dias: ['En cuántos días', 'días'],
};
// Valores por defecto de la base de datos (p_num), por si falta alguno.
const DEFECTO: Record<string, number> = {
  autosusp_sin_envios_dias: 45, autosusp_sin_acceso_dias: 400, autosusp_consultas_dia: 15, autosusp_consultas_semana: 30,
  autosusp_consultas_mes: 60, autosusp_cancel_pct: 30, autosusp_cancel_min_envios: 5, autosusp_cancel_recientes: 3, autosusp_cancel_recientes_dias: 10,
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
    <div style={{ marginTop: '0.55rem' }}>
      <div className="meta" style={{ fontWeight: 800, color: 'var(--navy)' }}>{titulo}</div>
      <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-700)', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function Regla({ n, titulo, quien, hoy, salta, children, claves, filas, esAdmin }: {
  n: number | null; titulo: string; quien: string; hoy?: number; salta?: 'momento' | 'hora'; children: React.ReactNode;
  claves: string[]; filas: ParametroFila[]; esAdmin: boolean;
}) {
  const ps = claves.map((k) => filas.find((p) => p.clave === k)).filter(Boolean) as ParametroFila[];
  return (
    <div className="table-wrap" style={{ padding: '0.9rem 1rem', marginBottom: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {n !== null && <span style={{ background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 800, borderRadius: 6, padding: '1px 8px', fontSize: 'var(--fs-s)' }}>REGLA {n}</span>}
        <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 'var(--fs-l)' }}>{titulo}</span>
        <span className="meta" style={{ marginLeft: 'auto' }}>Se aplica a: <strong>{quien}</strong></span>
      </div>
      {salta && <div className="meta" style={{ marginTop: '0.3rem', fontWeight: 700, color: salta === 'momento' ? '#b45309' : 'var(--gray-500)' }}>
        {salta === 'momento' ? 'Salta al momento: en cuanto pasa del límite.' : 'Salta en el repaso de cada hora.'}</div>}
      {children}
      {ps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem', marginTop: '0.8rem', paddingTop: '0.7rem', borderTop: '1px solid var(--gray-200)' }}>
          {ps.map((p) => {
            const [et, ud] = ETIQUETAS[p.clave] ?? [p.descripcion, ''];
            return (
              <div key={p.clave}>
                <div className="meta" style={{ fontWeight: 700 }}>{et}{ud && ud !== '%' ? ` (${ud})` : ud === '%' ? ' (%)' : ''}</div>
                <Control p={p} esAdmin={esAdmin} etiqueta={et} />
                <div className="meta" style={{ fontFamily: 'monospace' }}>{p.clave}{p.modificado_en ? ` · cambiado ${creadoTxt(p.modificado_en)}` : ''}</div>
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
  const activa = filas.find((p) => p.clave === 'autosusp_activa');
  const encendida = activa?.valor === true;
  const porRegla = (n: number) => candidatos.filter((c) => c.motivo.startsWith(`Regla ${n}:`)).length;
  async function lanzar() {
    setTrabajando(true); setEstado(null);
    const r = await lanzarAutosuspension();
    setTrabajando(false);
    setEstado(r.ok ? (r.n ? `Suspendidas ${r.n} cuenta${r.n === 1 ? '' : 's'}.` : 'Ninguna cuenta cumplía las reglas.') : r.error);
    if (r.ok) refrescar();
  }

  const r1 = num('autosusp_sin_envios_dias');
  const r2 = num('autosusp_sin_acceso_dias');
  const [qd, qs, qm] = [num('autosusp_consultas_dia'), num('autosusp_consultas_semana'), num('autosusp_consultas_mes')];
  const [cp, cmin] = [num('autosusp_cancel_pct'), num('autosusp_cancel_min_envios')];
  const [cn, cd] = [num('autosusp_cancel_recientes'), num('autosusp_cancel_recientes_dias')];
  // Ejemplos de la regla 3: cuántas al día durante una semana hacen pasarse del máximo semanal.
  const qPorDia = Math.ceil((qs + 1) / 7);
  // Ejemplos de la regla 4.
  const e4 = Math.max(10, cmin);
  const c4 = Math.ceil((e4 * cp) / 100);
  const cMin = Math.ceil((cmin * cp) / 100);
  const usadas = new Set(['autosusp_activa', ...Object.keys(ETIQUETAS)]);
  const sueltas = filas.filter((p) => !usadas.has(p.clave));

  return (
    <>
      {/* 1. Cómo funciona */}
      <div className="ptar-admin-precio-note" style={{ marginBottom: '0.7rem' }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.35rem' }}>Cómo funciona, en pocas palabras</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.55 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
          {activa && <Control p={activa} esAdmin={esAdmin} etiqueta="Suspensión automática encendida" />}
          <span style={{ fontSize: 'var(--fs-m)', color: encendida ? '#0f6b3a' : '#b45309', fontWeight: 700 }}>
            {encendida ? 'Encendida: suspende al momento (reglas 3, 4 y 5) y en el repaso de cada hora (todas).' : 'Apagada: no se suspende a nadie automáticamente (ni al momento, ni cada hora, ni con «Lanzar ahora»).'}
          </span>
        </div>
      </Regla>

      {/* 3. Las reglas */}
      <Regla n={1} salta="hora" titulo="Pide precios pero no hace envíos" quien="clientes" hoy={porRegla(1)} claves={['autosusp_sin_envios_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Si la persona ha pedido algún precio en los últimos <strong>{r1} días</strong> y, en esos mismos {r1} días, <strong>nadie de su empresa</strong> ha generado ningún envío.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando pasan las dos cosas a la vez: pide precios <strong>y</strong> su empresa no envía nada en {r1} días.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Juan (Muebles López) ha pedido 3 precios este mes. En los últimos {r1} días ni él ni nadie de Muebles López ha hecho un envío → <strong>se suspende la cuenta de Juan</strong>.</li>
            <li>Igual, pero su compañera Marta hizo un envío la semana pasada → <strong>no se suspende</strong> (cuenta la empresa, no la persona).</li>
            <li>Juan no ha pedido ningún precio en {r1} días → <strong>no se suspende</strong> por esta regla (no molesta).</li>
          </ul>
        </Bloque>
        <Bloque titulo="No se aplica">A cuentas con menos de {r1} días, ni durante los {r1} días siguientes a reactivarla.</Bloque>
      </Regla>

      <Regla n={2} salta="hora" titulo="No entra nunca" quien="clientes y transportistas" hoy={porRegla(2)} claves={['autosusp_sin_acceso_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">La última vez que la persona <strong>inició sesión</strong> en la plataforma.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando lleva más de <strong>{r2} días</strong> sin iniciar sesión {duracion(r2) && <>({duracion(r2)})</>}. Es una medida de seguridad: una cuenta olvidada es una puerta abierta.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Un transportista entró por última vez el {fechaLarga(new Date(Date.now() - (r2 + 10) * 86400000))} → hace más de {r2} días → <strong>se suspende</strong>.</li>
            <li>Un cliente que solo entra de vez en cuando, por ejemplo cada {Math.max(1, Math.floor(r2 / 2))} días, a descargar facturas → <strong>no se suspende</strong> (nunca llega a {r2} días sin entrar).</li>
          </ul>
        </Bloque>
        <Bloque titulo="No se aplica">A cuentas con menos de {r2} días, ni durante los {r2} días siguientes a reactivarla.</Bloque>
      </Regla>

      <Regla n={3} salta="momento" titulo="Demasiadas consultas de precio" quien="clientes" hoy={porRegla(3)} claves={['autosusp_consultas_dia', 'autosusp_consultas_semana', 'autosusp_consultas_mes']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Cuántos precios pide la persona. Hoy cuenta cada <strong>solicitud de precio</strong>; cuando esté el tarifador, contará cada cálculo. Sirve para frenar a quien usa la plataforma solo para sacar precios (la competencia, por ejemplo).</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando pasa de <strong>{qd} en 24 horas</strong>, <strong>o</strong> de <strong>{qs} en 7 días</strong>, <strong>o</strong> de <strong>{qm} en 30 días</strong>. Basta con pasarse en una de las tres.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Pide {qd} precios hoy → <strong>no pasa nada</strong>. Pide el {qd + 1}.º → <strong>se suspende en ese mismo momento</strong> (no le da tiempo a pedir 3.000).</li>
            {qPorDia <= qd && <li>Pide {qPorDia} precios al día durante una semana = {qPorDia * 7} → pasa de {qs} en 7 días → <strong>se suspende</strong>, aunque ningún día pase de {qd}.</li>}
            <li>Pide pocos al día pero, sumando el mes, llega a {qm + 1} → pasa de {qm} en 30 días → <strong>se suspende</strong>.</li>
          </ul>
        </Bloque>
        <Bloque titulo="Para un cliente concreto">El máximo de 24 horas se puede subir (o bajar) solo para él en Usuarios → su ficha → «Límite de consultas de precio al día». Si está vacío, vale el de aquí.</Bloque>
      </Regla>

      <Regla n={4} salta="momento" titulo="Cancela muchos de sus envíos" quien="clientes" hoy={porRegla(4)} claves={['autosusp_cancel_pct', 'autosusp_cancel_min_envios']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">De los envíos que ha pedido <strong>esa persona</strong>, cuántos ha cancelado <strong>ella misma</strong>. Las cancelaciones que hace Dynamo no cuentan. Se cuenta desde que se creó la cuenta (o desde que se reactivó).</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando ha pedido <strong>{cmin} envíos o más</strong> y ha cancelado el <strong>{cp} % o más</strong>.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Ha pedido {e4} envíos y ha cancelado {c4} → {pct(c4, e4)} % → <strong>se suspende</strong>.</li>
            {c4 > 1 && <li>Ha pedido {e4} envíos y ha cancelado {c4 - 1} → {pct(c4 - 1, e4)} % → <strong>no se suspende</strong>.</li>}
            <li>Con justo {cmin} envíos pedidos, basta con cancelar {cMin} para llegar al {cp} % → <strong>se suspende</strong>.</li>
            {cmin > 1 && <li>Con {cmin - 1} envíos pedidos o menos, esta regla <strong>todavía no mira</strong>, aunque los cancele todos (para no castigar al que empieza).</li>}
          </ul>
        </Bloque>
      </Regla>

      <Regla n={5} salta="momento" titulo="Muchas cancelaciones seguidas" quien="clientes" hoy={porRegla(5)} claves={['autosusp_cancel_recientes', 'autosusp_cancel_recientes_dias']} filas={filas} esAdmin={esAdmin}>
        <Bloque titulo="Qué mira">Cuántos envíos ha cancelado la persona en los <strong>últimos {cd} días</strong>, tenga los envíos que tenga.</Bloque>
        <Bloque titulo="Cuándo se suspende">Cuando cancela <strong>{cn} o más</strong> en {cd} días.</Bloque>
        <Bloque titulo="Ejemplos">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Cancela {cn} envío{cn === 1 ? '' : 's'} dentro de {cd} días → <strong>se suspende</strong>.</li>
            {cn > 1 && <li>Cancela {cn - 1} en {cd} días → <strong>no se suspende</strong> por esta regla.</li>}
            {cn > 1 && <li>Cancela {cn}, pero con más de {cd} días entre la primera y la última → <strong>no se suspende</strong> por esta regla (sí pueden contar para la regla 4).</li>}
          </ul>
        </Bloque>
      </Regla>

      {sueltas.length > 0 && <TablaParametros filas={sueltas} esAdmin={esAdmin} />}

      {/* 4. Quién caería hoy + lanzar */}
      <div className="table-wrap" style={{ padding: '0.9rem 1rem', marginBottom: '0.7rem' }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)' }}>Si el repaso se lanzara ahora, caerían {candidatos.length}{candidatos.length ? ':' : ' (nadie).'}</div>
        {candidatos.length > 0 && <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>{candidatos.map((c) => <li key={c.usuario_id}><strong>{c.email}</strong> · {c.motivo}</li>)}</ul>}
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
      <td>{p.descripcion}<div className="meta" style={{ fontFamily: 'monospace' }}>{p.clave}</div>
        {BLINDADOS.includes(p.clave) && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Por seguridad, solo se cambia en Supabase (Table Editor → parametros).</div>}</td>
      <td style={{ minWidth: 220 }}><Control p={p} esAdmin={esAdmin} /></td>
      <td>{p.modificado_en ? creadoTxt(p.modificado_en) : '—'}</td>
    </tr>
  );
}
