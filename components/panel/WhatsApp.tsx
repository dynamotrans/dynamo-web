'use client';

// WhatsApp (usuario, 2026-11-25): la bandeja del equipo de Dynamo. Conversaciones a la izquierda
// (la última arriba, con las sin leer marcadas) y, al abrir una, sus mensajes y la caja para
// contestar. En el móvil, una cosa o la otra. Contestar con texto libre solo se puede dentro de
// las 24 h siguientes al último mensaje de la persona (regla de Meta); fuera, hacen falta
// plantillas aprobadas (llegan con los avisos, parte 2).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import { fechaHora, textoBusqueda } from '@/lib/formato';
import { dentroDe24h } from '@/lib/whatsapp';
import { marcarWhatsAppLeida, responderWhatsApp } from '@/app/panel/(app)/whatsapp/acciones';

export type ConversacionFila = {
  id: string; telefono: string; perfil: string | null; persona: string | null; empresa: string | null; empresaHref: string | null;
  quien: 'cliente' | 'transportista' | 'dynamo' | 'conductor' | 'contacto' | 'desconocido';
  ultimaEntrada: string | null; ultimo: string | null; ultimoTexto: string | null; sinLeer: number;
};
export type MensajeFila = {
  id: string; sentido: 'entrada' | 'salida'; tipo: string; texto: string | null;
  archivo: string | null; archivoTipo: string | null; archivoNombre: string | null; archivoEstado: 'guardado' | 'borrado' | 'bajando' | 'ninguno';
  estado: 'recibido' | 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido'; error: string | null;
  origen: 'persona' | 'aviso' | 'ia' | null; autor: string | null; cuando: string;
};

const QUIEN: Record<ConversacionFila['quien'], [string, string]> = {
  cliente: ['Cliente', 'badge-blue'], transportista: ['Transportista', 'badge-green'], dynamo: ['Equipo Dynamo', 'badge-gray'],
  conductor: ['Conductor', 'badge-green'], contacto: ['Contacto de un sitio', 'badge-yellow'], desconocido: ['Desconocido', 'badge-gray'],
};
const ESTADO: Record<MensajeFila['estado'], string> = {
  recibido: '', pendiente: 'Enviando…', enviado: '✓ Enviado', entregado: '✓✓ Entregado', leido: '✓✓ Leído', fallido: '⚠ No entregado',
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const telBonito = (t: string) => t.replace(/^\+34(\d{3})(\d{3})(\d{3})$/, '+34 $1 $2 $3');
const titulo = (c: ConversacionFila) => c.empresa || c.persona || c.perfil || telBonito(c.telefono);

export default function WhatsApp({ conversaciones, ver, mensajes, hayMas, conectado, activo, puedeContestar, error }: {
  conversaciones: ConversacionFila[]; ver: string | null; mensajes: MensajeFila[]; hayMas: boolean;
  conectado: boolean; activo: boolean; puedeContestar: boolean; error: string | null;
}) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const abajo = useRef<HTMLDivElement>(null);
  const actual = ver ? conversaciones.find((c) => c.id === ver) ?? null : null;

  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
    if (!w.length) return conversaciones;
    return conversaciones.filter((c) => {
      const b = norm([c.empresa, c.persona, c.perfil, c.telefono, c.telefono.replace(/^\+34/, ''), QUIEN[c.quien][0], c.ultimoTexto].filter(Boolean).join(' '));
      return w.every((t) => b.includes(t));
    });
  }, [conversaciones, q]);
  const pg = usePaginas(lista, q, 20);

  // Abrir una conversación la marca como leída.
  const sinLeer = actual?.sinLeer ?? 0;
  useEffect(() => {
    if (!ver || !sinLeer) return;
    marcarWhatsAppLeida(ver).then((r) => { if (r.ok) refrescar(); }).catch(() => {});
  }, [ver, sinLeer]); // eslint-disable-line react-hooks/exhaustive-deps
  // Al abrir o al llegar un mensaje, al final de la conversación.
  useEffect(() => { abajo.current?.scrollIntoView({ block: 'end' }); }, [ver, mensajes.length]);
  useEffect(() => { setTexto(''); setFallo(null); }, [ver]);

  const plazo = actual ? dentroDe24h(actual.ultimaEntrada) : false;
  const motivoNo = !conectado ? 'WhatsApp no está conectado todavía (faltan las claves de Meta en Vercel).'
    : !activo ? 'WhatsApp está apagado: se enciende en Parámetros → «WhatsApp».'
    : !puedeContestar ? 'Tu usuario es de solo lectura.'
    : !plazo ? 'Han pasado más de 24 h desde su último mensaje: Meta solo deja escribirle con una plantilla aprobada (llegan con los avisos por WhatsApp).'
    : null;

  async function enviar() {
    if (!ver || !texto.trim() || motivoNo) return;
    setFallo(null); setTrabajando(true);
    const r = await responderWhatsApp(ver, texto).catch(() => ({ ok: false as const, error: 'No se ha podido mandar. Inténtalo de nuevo.' }));
    setTrabajando(false);
    if (!r.ok) { setFallo(r.error); refrescar(); return; }
    setTexto('');
    refrescar();
  }

  return (
    <section className="section active" id="sec-whatsapp">
      <div className="sec-header"><h2>WhatsApp</h2></div>
      {!conectado && (
        <div className="pt-aviso info" id="wa-sin-conectar" style={{ maxWidth: 900, marginBottom: '0.8rem' }}><div>
          <strong>WhatsApp aún no está conectado.</strong> Faltan en Vercel las claves de Meta (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN)
          y dar de alta en Meta la dirección <span className="notranslate" translate="no">/api/whatsapp</span>. Mientras tanto, aquí verás las conversaciones que lleguen.
        </div></div>
      )}
      {conectado && !activo && (
        <div className="pt-aviso info" id="wa-apagado" style={{ maxWidth: 900, marginBottom: '0.8rem' }}><div>
          Los mensajes que llegan se guardan, pero <strong>no sale nada</strong> mientras WhatsApp esté apagado. Se enciende en <strong>Parámetros → «WhatsApp»</strong>.
        </div></div>
      )}
      {error && <div className="pt-aviso error">No se han podido cargar las conversaciones: {error}</div>}

      <div className={`wa-bandeja${ver ? ' con-chat' : ''}`}>
        <div className="wa-lista" id="wa-lista">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, empresa o teléfono…" aria-label="Buscar conversaciones" />
          {lista.length === 0 ? (
            <div className="wa-vacio">{conversaciones.length ? 'Ninguna conversación con esa búsqueda.' : 'Aún no ha escrito nadie por WhatsApp.'}</div>
          ) : (
            <ul>
              {pg.visibles.map((c) => (
                <li key={c.id}>
                  <Link href={`/panel/whatsapp?ver=${c.id}`} scroll={false} className={`wa-conv${c.id === ver ? ' activa' : ''}${c.sinLeer ? ' sin-leer' : ''}`} data-id={c.id}>
                    <span className="wa-conv-cab">
                      <strong>{titulo(c)}</strong>
                      <span className="meta">{c.ultimo ? fechaHora(c.ultimo) : ''}</span>
                    </span>
                    <span className="wa-conv-sub meta">
                      <span className={`badge ${QUIEN[c.quien][1]}`}>{QUIEN[c.quien][0]}</span>
                      <span className="notranslate" translate="no">{telBonito(c.telefono)}</span>
                    </span>
                    <span className="wa-conv-txt">
                      <span>{c.ultimoTexto ?? ''}</span>
                      {c.sinLeer > 0 && <span className="badge sb-red" aria-label={`${c.sinLeer} sin leer`}>{c.sinLeer}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <PaginadorLocal p={pg} nombre="conversaciones" nombreUno="conversación" soloSiHace />
        </div>

        <div className="wa-chat" id="wa-chat">
          {!actual ? (
            <div className="wa-vacio">Elige una conversación para verla.</div>
          ) : (
            <>
              <div className="wa-chat-cab">
                <button type="button" className="btn-ghost wa-volver" onClick={() => router.push('/panel/whatsapp', { scroll: false })}>← Conversaciones</button>
                <div>
                  <strong>{titulo(actual)}</strong>
                  <div className="meta">
                    <span className={`badge ${QUIEN[actual.quien][1]}`}>{QUIEN[actual.quien][0]}</span>{' '}
                    {[actual.persona && actual.persona !== titulo(actual) ? actual.persona : null, actual.perfil && actual.perfil !== titulo(actual) ? `«${actual.perfil}» en WhatsApp` : null]
                      .filter(Boolean).join(' · ')}{' '}
                    <span className="notranslate" translate="no">{telBonito(actual.telefono)}</span>
                    {actual.empresaHref && <> · <Link href={actual.empresaHref}>Ver ficha</Link></>}
                  </div>
                </div>
              </div>
              <div className="wa-mensajes" id="wa-mensajes">
                {hayMas && <div className="meta" style={{ textAlign: 'center' }}>Se ven los 200 mensajes más recientes.</div>}
                {mensajes.map((m) => (
                  <div key={m.id} className={`wa-msg ${m.sentido}`} data-estado={m.estado}>
                    <Archivo m={m} />
                    {m.texto && <div className="wa-msg-txt">{m.texto}</div>}
                    <div className="wa-msg-pie">
                      {m.sentido === 'salida' && <span>{m.origen === 'aviso' ? 'Aviso automático' : m.origen === 'ia' ? 'Respuesta automática' : m.autor ?? 'Equipo'} · </span>}
                      <span>{fechaHora(m.cuando)}</span>
                      {m.sentido === 'salida' && <span className={`wa-est ${m.estado}`}> · {ESTADO[m.estado]}</span>}
                    </div>
                    {m.estado === 'fallido' && m.error && <div className="wa-msg-err">{m.error}</div>}
                  </div>
                ))}
                <div ref={abajo} />
              </div>
              <div className="wa-responder">
                {motivoNo ? (
                  <div className="pt-aviso info" id="wa-no-contestar"><div>{motivoNo}</div></div>
                ) : (
                  <>
                    <textarea id="wa-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4096} placeholder="Escribe la respuesta…" aria-label="Respuesta"
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); } }} />
                    <button type="button" id="wa-enviar" className="btn-primary" disabled={trabajando || !texto.trim()} onClick={enviar}>Enviar</button>
                  </>
                )}
                {fallo && <div className="wiz-warn show" role="status">⚠ {fallo}</div>}
                {trabajando && <Cargando texto="Mandando por WhatsApp" />}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Archivo({ m }: { m: MensajeFila }) {
  if (m.archivoEstado === 'ninguno') return null;
  if (m.archivoEstado === 'bajando') return <div className="wa-archivo meta">Archivo pendiente de guardar…</div>;
  if (m.archivoEstado === 'borrado') return <div className="wa-archivo meta">Archivo borrado por antigüedad (se guardan 6 meses).</div>;
  if (!m.archivo) return null;
  const t = m.archivoTipo ?? '';
  if (t.startsWith('image/')) return <a href={m.archivo} target="_blank" rel="noopener noreferrer" className="wa-archivo"><img src={m.archivo} alt="Foto recibida por WhatsApp" loading="lazy" /></a>;
  if (t.startsWith('audio/')) return <div className="wa-archivo"><audio controls src={m.archivo} preload="none" /><div className="meta">Nota de voz (pasarla a texto llega en la v4).</div></div>;
  if (t.startsWith('video/')) return <div className="wa-archivo"><video controls src={m.archivo} preload="none" /></div>;
  return <div className="wa-archivo"><a href={m.archivo} target="_blank" rel="noopener noreferrer">📄 {m.archivoNombre || 'Documento'}</a></div>;
}
