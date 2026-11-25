'use client';

import { fechaHora } from '@/lib/formato';

// Modo mantenimiento (solo admin), con el diseño de la ventana del mockup (.maint-control).
import { useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import { guardarParametro } from '@/app/panel/(app)/parametros/acciones';

import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import { contarArchivosSueltos, borrarArchivosSueltos, subirSitiosABrevoAhora } from '@/app/panel/(app)/mantenimiento/acciones';

const LLAVE = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';

export type Descuadre = { id: string; causa: string; ruta: string; navegador: string; corregido: boolean; datos: unknown; creado_en: string };

// Sitios → Brevo (usuario, 2026-11-25): cómo va la subida diaria de los emails de los sitios.
export type ResumenBrevo = {
  activo: boolean; lista: string; lista_id: number; candidatos: number; pendientes: number; subidos: number; errores: number;
  ultima: string | null; ultimos_errores: { email: string; error: string | null; cuando: string; intentos: number }[]; conClave?: boolean;
  /** Los que van a subir en la próxima subida, para revisarlos antes (500 como mucho). */
  porSubir?: { email: string; nombre: string | null; cargo: string | null; empresa: string | null; poblacion: string | null; provincia: string | null; motivo: 'nuevo' | 'cambiado' | 'reintento' }[];
};
export type ResumenWhatsApp = {
  activo: boolean; movil_dynamo: string; conversaciones: number; mensajes: number; sin_leer: number; archivos: number;
  archivos_bytes: number; texto_bytes: number; con_permiso: number; ultimo: string | null; conectado?: boolean;
};
const megas = (b: number) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(0, b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`);
const MOTIVO_BREVO = { nuevo: 'Nuevo', cambiado: 'Datos cambiados', reintento: 'Reintento' } as const;

export default function Mantenimiento({ activo, esAdmin, cambiado, quien, descuadres = [], brevo = null, whatsapp = null }: { activo: boolean; esAdmin: boolean; cambiado: string | null; quien: string | null; descuadres?: Descuadre[]; brevo?: ResumenBrevo | null; whatsapp?: ResumenWhatsApp | null }) {
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState(false);
  const [preguntar, setPreguntar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cambiar() {
    setError(null); setTrabajando(true);
    const r = await guardarParametro('mantenimiento_activo', !activo);
    setTrabajando(false); setPreguntar(false);
    if (!r.ok) { setError(r.error); return; }
    refrescar();
  }
  return (
    <section className="section active" id="sec-mantenimiento">
      <div className="sec-header"><h2>Modo mantenimiento</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Kill-switch de la plataforma, para un incidente o una actualización delicada.
      </p>
      <div style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
        <div className="maint-control">
          <div className="maint-control-info">
            <span className="maint-control-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={LLAVE} /></svg></span>
            <div className="maint-control-txt">
              <strong>Modo mantenimiento · {activo ? 'ACTIVADO' : 'desactivado'}</strong>
              <span>Cierra el portal para clientes y transportistas: ven la pantalla de mantenimiento en vez del panel, y la página pública de aceptar carga se para. El equipo de Dynamo sigue entrando.</span>
            </div>
          </div>
          {esAdmin && (
            <button type="button" className={`maint-control-btn${activo ? ' maint-on' : ''}`} aria-pressed={activo} disabled={trabajando}
              onClick={() => (activo ? cambiar() : setPreguntar(true))}>
              <span className="maint-control-btn-label">{activo ? 'Desactivar' : 'Activar'}</span>
            </button>
          )}
        </div>
        {cambiado && <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Último cambio: {fechaHora(cambiado)}{quien ? ` · por ${quien}` : ''}</p>}
        {!esAdmin && <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Solo un <strong>administrador</strong> lo puede activar o desactivar.</p>}
        {preguntar && (
          <div className="pt-aviso error" style={{ marginTop: '0.9rem' }}>
            <div>
              <strong>¿Seguro que quieres cerrar la plataforma?</strong> Ningún cliente ni transportista podrá entrar ni aceptar cargas hasta que la vuelvas a abrir.
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <button className="btn-ghost" onClick={() => setPreguntar(false)} disabled={trabajando}>No, volver</button>
                <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={cambiar} disabled={trabajando}>Sí, activar mantenimiento</button>
              </div>
            </div>
          </div>
        )}
        {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.8rem', maxWidth: 720 }}>
        Lo que ya está en marcha no se para: los envíos siguen su curso y las reservas abiertas caducan solas. Al desactivarlo, todo vuelve a funcionar al instante.
      </p>
      {esAdmin && <ArchivosSueltos />}
      {brevo && <BrevoSitios r={brevo} esAdmin={esAdmin} />}
      {whatsapp && <WhatsAppResumen r={whatsapp} />}
      <DescuadresPantalla lista={descuadres} />
      {trabajando && <Cargando texto={activo ? 'Abriendo la plataforma' : 'Cerrando la plataforma'} />}
    </section>
  );
}

// Limpieza del almacén de archivos: lo que se subió pero nunca llegó a registrarse.
function ArchivosSueltos() {
  const [estado, setEstado] = useState<{ n: number; bytes: number } | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const mb = (b: number) => `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  async function contar() {
    setError(null); setHecho(null); setTrabajando('Buscando archivos sueltos');
    const r = await contarArchivosSueltos();
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setEstado({ n: r.n, bytes: r.bytes });
  }
  async function borrar() {
    setError(null); setTrabajando('Borrando archivos sueltos');
    const r = await borrarArchivosSueltos();
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setEstado(null); setHecho(`Hecho: ${r.borrados} archivo${r.borrados === 1 ? '' : 's'} borrado${r.borrados === 1 ? '' : 's'}.`);
  }
  return (
    <div style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
      <strong style={{ color: 'var(--navy)' }}>Archivos sueltos</strong>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0.35rem 0 0.7rem' }}>
        Archivos que se subieron pero no llegaron a registrarse (se cortó la conexión a mitad de la subida). No los ve nadie y solo ocupan sitio.
        Se buscan los que llevan más de 24 horas sin dueño; los documentos de envíos, firmas y altas no se tocan nunca, ni siquiera los quitados.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-ghost" onClick={contar} disabled={!!trabajando}>Buscar</button>
        {estado && (estado.n > 0
          ? <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={borrar} disabled={!!trabajando}>Borrar {estado.n} archivo{estado.n === 1 ? '' : 's'} ({mb(estado.bytes)})</button>
          : <span style={{ fontSize: 'var(--fs-m)', color: '#0f6b3a', fontWeight: 700 }}>No hay ningún archivo suelto.</span>)}
        {hecho && <span style={{ fontSize: 'var(--fs-m)', color: '#0f6b3a', fontWeight: 700 }}>{hecho}</span>}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </div>
  );
}

// «Hueco vacío al final» en el móvil: cada vez que el navegador lo detecta y lo recoloca solo,
// queda apuntado aquí (lib/vistaPantalla.ts). Sirve para saber si sigue pasando y si se arregla.
const CAUSA: Record<string, string> = {
  pasado_del_final: 'La pantalla miraba más allá del final de la página',
  zona_desplazada: 'La zona visible estaba desplazada',
  scroll_de_mas: 'La página estaba bajada de más',
  pagina_larga: 'La página mide más que su contenido',
};
const MOTIVO: Record<string, string> = { scroll: 'al desplazarse', toque: 'al soltar el dedo', teclado: 'al cerrar el teclado', zona: 'al cambiar la zona visible', volver: 'al volver a la pestaña', pantalla: 'al entrar en la pantalla' };
function medidasTxt(m: unknown) {
  if (!m || typeof m !== 'object') return '—';
  const o = m as Record<string, unknown>;
  return ['y', 'alto', 'doc', 'contenido', 'vvAlto', 'vvArriba', 'vvPagina'].filter((k) => typeof o[k] === 'number').map((k) => `${k} ${o[k]}`).join(' · ') || '—';
}
// WhatsApp (usuario, 2026-11-25): si está conectado y encendido, y cuánto ocupa (el texto se
// guarda 2 años; fotos, audios y PDF, 6 meses).
function WhatsAppResumen({ r }: { r: ResumenWhatsApp }) {
  const listo = !!r.conectado && r.activo;
  return (
    <div id="whatsapp-resumen" style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--navy)' }}>WhatsApp</strong>
        <span id="whatsapp-estado" className={`badge badge-${listo ? 'green' : 'orange'}`}>{!r.conectado ? 'Sin conectar' : r.activo ? 'Encendido' : 'Apagado'}</span>
      </div>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0.35rem 0 0.7rem' }}>
        Las conversaciones se guardan enteras en la plataforma (Meta no guarda el historial): el texto, 2 años; las fotos, audios y PDF, 6 meses. Se borran solos.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', fontSize: 'var(--fs-m)' }}>
        <div><div className="meta">Conversaciones</div><strong id="whatsapp-conversaciones">{r.conversaciones}</strong></div>
        <div><div className="meta">Mensajes</div><strong>{r.mensajes}</strong></div>
        <div><div className="meta">Sin leer</div><strong>{r.sin_leer}</strong></div>
        <div><div className="meta">Texto</div><strong>{megas(r.texto_bytes)}</strong></div>
        <div><div className="meta">Archivos</div><strong id="whatsapp-archivos">{r.archivos} · {megas(r.archivos_bytes)}</strong></div>
        <div><div className="meta">Usuarios con permiso</div><strong>{r.con_permiso}</strong></div>
      </div>
      {r.ultimo && <div className="meta" style={{ marginTop: '0.5rem' }}>Último mensaje: {fechaHora(r.ultimo)}</div>}
      {!r.conectado && <div className="pt-aviso info" style={{ marginTop: '0.7rem' }}><div>Faltan las claves de Meta en Vercel (<span className="notranslate" translate="no">WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN</span>).</div></div>}
      {r.conectado && !r.activo && <div className="pt-aviso info" style={{ marginTop: '0.7rem' }}><div>Apagado: se enciende en <strong>Parámetros → «WhatsApp»</strong>.</div></div>}
    </div>
  );
}

function BrevoSitios({ r, esAdmin }: { r: ResumenBrevo; esAdmin: boolean }) {
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; txt: string } | null>(null);
  async function subir() {
    setRes(null); setTrabajando(true);
    const x = await subirSitiosABrevoAhora().catch(() => ({ ok: false as const, error: 'No se ha podido subir. Inténtalo de nuevo.' }));
    setTrabajando(false);
    setRes(x.ok ? { ok: true, txt: x.aviso } : { ok: false, txt: x.error });
    refrescar();
  }
  const conClave = !!r.conClave;
  const porSubir = r.porSubir ?? [];
  const pg = usePaginas(porSubir, '', 25);
  return (
    <div id="brevo-sitios" style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--navy)' }}>Emails de los sitios a Brevo</strong>
        <span id="brevo-sitios-estado" className={`badge badge-${!conClave ? 'orange' : r.activo ? 'green' : 'blue'}`}>{!conClave ? 'Falta la clave' : r.activo ? 'Suben solos cada mañana' : 'A mano: revisas y subes tú'}</span>
      </div>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0.35rem 0 0.7rem' }}>
        La plataforma sube a tu cuenta de Brevo, a la lista <strong className="notranslate" translate="no">{r.lista || '04-SITIOS-DYNAMO'}</strong>, los emails de los sitios de recogida y entrega
        (personas de contacto y emails de avisos). No envía ningún email: a quién y cuándo se escribe lo decides tú en Brevo.
        No suben los almacenes de Dynamo, los sitios borrados ni las direcciones de prueba.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', fontSize: 'var(--fs-m)' }}>
        <div><div className="meta">Emails de sitios</div><strong id="brevo-candidatos">{r.candidatos}</strong></div>
        <div><div className="meta">Subidos a Brevo</div><strong id="brevo-subidos">{r.subidos}</strong></div>
        <div><div className="meta">Por subir</div><strong id="brevo-pendientes">{r.pendientes}</strong></div>
        <div><div className="meta">Con fallo</div><strong style={{ color: r.errores ? 'var(--red)' : undefined }}>{r.errores}</strong></div>
      </div>
      {r.ultima && <div className="meta" style={{ marginTop: '0.5rem' }}>Última subida: {fechaHora(r.ultima)}</div>}
      <div className="pt-aviso info" id="brevo-sitios-modo" style={{ marginTop: '0.7rem' }}><div>
        {r.activo
          ? <>Los nuevos <strong>suben solos cada mañana</strong>. Para revisarlos tú antes de que suban, apágalo en <strong>Parámetros → «Brevo: sitios de la plataforma»</strong>.</>
          : <>No sube nada solo: <strong>revisas la lista de abajo y pulsas «Subir ahora»</strong>. Si prefieres que suban solos cada mañana, enciéndelo en <strong>Parámetros → «Brevo: sitios de la plataforma»</strong>.</>}
      </div></div>
      {!conClave && <div className="pt-aviso info" style={{ marginTop: '0.7rem' }}><div>Falta la clave de Brevo en Vercel (<span className="notranslate" translate="no">BREVO_API_KEY</span>): sin ella no se puede subir nada.</div></div>}

      <div id="brevo-por-subir" style={{ marginTop: '0.9rem' }}>
        <strong style={{ fontSize: 'var(--fs-m)', color: 'var(--navy)' }}>Los que van a subir ({porSubir.length}{r.pendientes > porSubir.length ? ` de ${r.pendientes}` : ''})</strong>
        {porSubir.length === 0
          ? <div className="meta" style={{ marginTop: '0.3rem' }}>No hay ninguno por subir.</div>
          : <>
            {/* En filas apiladas y no en tabla: caben enteras en el móvil y en esta caja, sin desplazar de lado. */}
            <div id="brevo-por-subir-lista" style={{ marginTop: '0.4rem', border: '1px solid var(--gray-200)', borderRadius: 10 }}>
              {pg.visibles.map((f, k) => (
                <div key={f.email} className="brevo-fila" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0.5rem 0.7rem', borderTop: k ? '1px solid var(--gray-200)' : undefined }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="notranslate" translate="no" style={{ fontWeight: 600, color: 'var(--navy)', overflowWrap: 'anywhere' }}>{f.email}</div>
                    <div className="meta" style={{ overflowWrap: 'anywhere' }}>
                      {[f.nombre, f.cargo, f.empresa, [f.poblacion, f.provincia && f.provincia !== f.poblacion ? f.provincia : null].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Sin más datos'}
                    </div>
                  </div>
                  <span className={`badge badge-${f.motivo === 'nuevo' ? 'green' : f.motivo === 'cambiado' ? 'blue' : 'orange'}`} style={{ flex: 'none' }}>{MOTIVO_BREVO[f.motivo] ?? f.motivo}</span>
                </div>
              ))}
            </div>
            <PaginadorLocal p={pg} nombre="emails" nombreUno="email" soloSiHace />
          </>}
      </div>

      {r.ultimos_errores.length > 0 && (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.3rem' }}>
          <strong style={{ fontSize: 'var(--fs-m)' }}>Últimos fallos</strong>
          {r.ultimos_errores.map((e) => (
            <div key={e.email} className="meta" style={{ overflowWrap: 'anywhere' }}>
              <span className="notranslate" translate="no">{e.email}</span> · {e.error ?? 'Sin detalle'} · {fechaHora(e.cuando)} · intento {e.intentos} de 3
            </div>
          ))}
        </div>
      )}
      {esAdmin && (
        <div style={{ marginTop: '0.8rem' }}>
          <button type="button" id="brevo-subir" className="btn-secondary" onClick={subir} disabled={trabajando || !conClave || porSubir.length === 0}>Subir ahora a Brevo{porSubir.length ? ` (${porSubir.length})` : ''}</button>
        </div>
      )}
      {res && <div className={res.ok ? 'modal-ok-box' : 'wiz-warn show'} role="status" style={{ marginTop: '0.6rem' }}>{res.ok ? res.txt : `⚠ ${res.txt}`}</div>}
      {trabajando && <Cargando texto="Subiendo a Brevo" />}
    </div>
  );
}

function DescuadresPantalla({ lista }: { lista: Descuadre[] }) {
  return (
    <div id="descuadres-pantalla" style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
      <strong style={{ color: 'var(--navy)' }}>Descuadres de pantalla en el móvil</strong>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0.35rem 0 0.7rem' }}>
        En el iPhone la pantalla a veces se queda mirando más abajo de donde acaba la página (zona vacía debajo del contenido). Es un fallo del navegador del teléfono:
        la plataforma lo detecta, lo recoloca sola y lo apunta aquí. Si vuelve a pasar y no se arregla solo, esta lista dice cuándo y por qué.
      </p>
      {lista.length === 0
        ? <span id="descuadres-vacio" style={{ fontSize: 'var(--fs-m)', color: '#0f6b3a', fontWeight: 700 }}>No se ha apuntado ninguno en los últimos 90 días.</span>
        : (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {lista.map((d) => {
              const o = (d.datos && typeof d.datos === 'object' ? d.datos : {}) as { motivo?: string; antes?: unknown; despues?: unknown };
              const soloAviso = d.causa === 'pagina_larga';
              return (
                <div key={d.id} className="descuadre-fila" style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '0.5rem', fontSize: 'var(--fs-m)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--navy)' }}>{fechaHora(d.creado_en)}</strong>
                    <span style={{ color: 'var(--gray-600)' }}>{d.navegador}</span>
                    {!soloAviso && <span style={{ fontWeight: 700, color: d.corregido ? '#0f6b3a' : 'var(--red)' }}>{d.corregido ? 'Recolocada sola' : 'No se recolocó'}</span>}
                  </div>
                  <div style={{ color: 'var(--gray-700)' }}>{CAUSA[d.causa] ?? d.causa}{o.motivo && MOTIVO[o.motivo] ? `, ${MOTIVO[o.motivo]}` : ''} · <span style={{ overflowWrap: 'anywhere' }}>{d.ruta}</span></div>
                  <div style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-s)', overflowWrap: 'anywhere' }}>Antes: {medidasTxt(o.antes)}{o.despues ? ` — Después: ${medidasTxt(o.despues)}` : ''}</div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
