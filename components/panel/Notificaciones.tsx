'use client';

import { useState } from 'react';
import Modal from '@/components/panel/Modal';
import { guardarNotificacion, verMensaje, type MensajeEjemplo } from '@/app/panel/(app)/notificaciones/acciones';
import { fechaHora } from '@/lib/formato';

// NOTIFICACIONES (usuario, 2026-11-28): «un botón de activar/desactivar, y cuando se activen,
// que venga marcado email y WhatsApp, y que se pueda desmarcar email y/o WhatsApp».
// Una fila por notificación, agrupadas por quién las recibe. Se guarda al momento.

export type NotificacionFila = {
  tipo: string; grupo: string; orden: number; titulo: string; descripcion: string | null;
  bloqueada: boolean; activa: boolean; email: boolean; whatsapp: boolean; whatsapp_plantilla: string | null;
};

const GRUPOS: [string, string, string][] = [
  ['cliente', 'Al cliente', 'Lo que reciben los usuarios de la empresa cliente (y su contabilidad cuando es dinero).'],
  ['transportista', 'Al transportista', 'Lo que recibe el transportista de sus envíos y de las ofertas de carga.'],
  ['sitios', 'A los sitios de carga y descarga', 'Lo que reciben los almacenes, obras y destinatarios del envío.'],
  ['cuentas', 'Cuentas de usuario', 'Altas, suspensiones, bajas y cambios de las cuentas.'],
  ['dynamo', 'Al equipo de Dynamo', 'Los avisos internos por email.'],
  ['seguridad', 'Seguridad (siempre activas)', 'Códigos y avisos de acceso: no se pueden apagar.'],
];

export default function Notificaciones({ filas: iniciales, puedeCambiar, error }: { filas: NotificacionFila[]; puedeCambiar: boolean; error: string | null }) {
  const [filas, setFilas] = useState(iniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  // «Ver mensaje»: el último email de ese tipo y el texto tal como iría por WhatsApp.
  const [ver, setVer] = useState<{ f: NotificacionFila; m: MensajeEjemplo | null; error: string | null; pestana: 'email' | 'whatsapp' } | null>(null);
  async function abrirMensaje(f: NotificacionFila) {
    setVer({ f, m: null, error: null, pestana: 'email' });
    const r = await verMensaje(f.tipo).catch(() => ({ ok: false as const, error: 'No se ha podido cargar el mensaje.' }));
    setVer((v) => (v && v.f.tipo === f.tipo ? { ...v, m: r.ok ? r.m : null, error: r.ok ? null : r.error } : v));
  }

  async function cambiar(f: NotificacionFila, c: Partial<Pick<NotificacionFila, 'activa' | 'email' | 'whatsapp'>>) {
    // Al ACTIVAR, vuelve con email y WhatsApp marcados (usuario: «que venga marcado email y WhatsApp»).
    const nueva = c.activa === true ? { ...f, activa: true, email: true, whatsapp: true } : { ...f, ...c };
    // Sin ningún canal no tiene sentido «activa»: se apaga sola.
    if (nueva.activa && !nueva.email && !nueva.whatsapp) nueva.activa = false;
    setFilas((xs) => xs.map((x) => (x.tipo === f.tipo ? nueva : x)));
    setGuardando(f.tipo); setAviso(null);
    const r = await guardarNotificacion(f.tipo, { activa: nueva.activa, email: nueva.email, whatsapp: nueva.whatsapp }).catch(() => ({ ok: false as const, error: 'No se ha podido guardar. Vuelve a intentarlo.' }));
    setGuardando(null);
    if (!r.ok) {
      setFilas((xs) => xs.map((x) => (x.tipo === f.tipo ? f : x)));
      setAviso({ ok: false, txt: r.error });
    } else {
      setAviso({ ok: true, txt: `«${f.titulo}»: ${!nueva.activa ? 'desactivada' : [nueva.email && 'email', nueva.whatsapp && 'WhatsApp'].filter(Boolean).join(' y ')}.` });
    }
  }

  return (
    <section className="section active" id="sec-notificaciones">
      <div className="sec-header"><h2>Notificaciones</h2></div>
      <p className="ntf-intro">
        Qué avisos manda la plataforma y por dónde. Al activar una, sale por <strong>email y WhatsApp</strong>; puedes quitar uno de los dos.
        Los avisos de la campana del panel salen siempre. Por WhatsApp solo salen las que ya tienen su plantilla aprobada por Meta.
        {!puedeCambiar && <> Solo un administrador puede cambiarlas.</>}
      </p>
      {error && <div className="pt-aviso error"><div>No se han podido cargar las notificaciones: {error}</div></div>}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {GRUPOS.map(([g, titulo, intro]) => {
        const del = filas.filter((f) => f.grupo === g);
        if (!del.length) return null;
        return (
          <div key={g} className="ntf-grupo" id={`ntf-${g}`}>
            <h3>{titulo}</h3>
            <p className="ntf-grupo-intro">{intro}</p>
            <div className="ntf-tabla" role="table" aria-label={titulo}>
              {del.map((f) => {
                const bloqueo = f.bloqueada || !puedeCambiar || guardando === f.tipo;
                const sinMeta = !f.whatsapp_plantilla;
                return (
                  <div key={f.tipo} className={`ntf-fila${f.activa ? '' : ' apagada'}`} role="row" data-tipo={f.tipo}>
                    <div className="ntf-que" role="cell">
                      <strong>{f.titulo}</strong>
                      {f.descripcion && <span>{f.descripcion}</span>}
                      <button type="button" className="ntf-ver" onClick={() => abrirMensaje(f)}>Ver mensaje</button>
                    </div>
                    <div className="ntf-ctl" role="cell">
                      <label className="ntf-switch" title={f.bloqueada ? 'Aviso de seguridad: siempre activo' : undefined}>
                        <input type="checkbox" role="switch" aria-checked={f.activa} checked={f.activa} disabled={bloqueo}
                          aria-label={`${f.titulo}: ${f.activa ? 'activada' : 'desactivada'}`}
                          onChange={(e) => cambiar(f, { activa: e.target.checked })} />
                        <span className="ntf-switch-pista" aria-hidden="true" />
                        <span className="ntf-switch-txt">{f.bloqueada ? 'Siempre' : f.activa ? 'Activa' : 'Apagada'}</span>
                      </label>
                      <label className={`ntf-canal${!f.activa ? ' off' : ''}`}>
                        <input type="checkbox" checked={f.activa && f.email} disabled={bloqueo || !f.activa}
                          onChange={(e) => cambiar(f, { email: e.target.checked })} /> Email
                      </label>
                      <label className={`ntf-canal${!f.activa ? ' off' : ''}`} title={sinMeta ? 'Falta la plantilla aprobada por Meta: de momento solo sale por email.' : undefined}>
                        <input type="checkbox" checked={f.activa && f.whatsapp} disabled={bloqueo || !f.activa}
                          onChange={(e) => cambiar(f, { whatsapp: e.target.checked })} /> WhatsApp
                        {sinMeta && <span className="ntf-meta">pendiente de Meta</span>}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {ver && (
        <Modal abierto plano ancho={760} onCerrar={() => setVer(null)} titulo={ver.f.titulo} sub={ver.f.descripcion ?? undefined}>
          <div className="tabs" role="tablist" style={{ marginBottom: '0.8rem' }}>
            <button type="button" role="tab" aria-selected={ver.pestana === 'email'} className={`tab${ver.pestana === 'email' ? ' active' : ''}`} onClick={() => setVer({ ...ver, pestana: 'email' })}>Email</button>
            <button type="button" role="tab" aria-selected={ver.pestana === 'whatsapp'} className={`tab${ver.pestana === 'whatsapp' ? ' active' : ''}`} onClick={() => setVer({ ...ver, pestana: 'whatsapp' })}>WhatsApp</button>
          </div>
          {ver.error ? <div className="pt-aviso error"><div>{ver.error}</div></div>
            : !ver.m ? <p className="meta">Cargando…</p>
            : !ver.m.email ? <div className="pt-aviso info"><div>Todavía no ha salido ninguno de este tipo. En cuanto salga el primero, lo verás aquí tal cual le llegó al destinatario.</div></div>
            : ver.pestana === 'email' ? (
              <div id="ntf-email">
                <p className="meta" style={{ margin: '0 0 0.4rem' }}>Último enviado: {fechaHora(ver.m.email.fecha)}{ver.m.email.estado !== 'enviado' ? ` (${ver.m.email.estado})` : ''} · es un email real, con los datos de ese envío.</p>
                <p style={{ margin: '0 0 0.6rem' }}><strong>Asunto:</strong> {ver.m.email.asunto}</p>
                {/* Aislado: sin scripts ni enlaces que se abran aquí. */}
                <iframe title={`Email: ${ver.f.titulo}`} className="ntf-iframe" sandbox="" srcDoc={ver.m.email.html} />
              </div>
            ) : (
              <div id="ntf-whatsapp">
                <p className="meta" style={{ margin: '0 0 0.6rem' }}>
                  {ver.f.whatsapp_plantilla ? 'Así sale por WhatsApp.' : 'Así iría por WhatsApp. Aún no sale: falta crear y aprobar su plantilla en Meta.'}
                </p>
                <div className="ntf-wa-fondo"><div className="ntf-wa-burbuja">{ver.m.whatsapp}</div></div>
              </div>
            )}
        </Modal>
      )}
    </section>
  );
}
