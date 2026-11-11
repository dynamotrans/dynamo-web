'use client';

import { useEffect, useRef, useState } from 'react';
import { preguntarIA } from '@/app/panel/(app)/ia/acciones';

// ASISTENTE DE IA (usuario, 2026-11-11): botón flotante con la estrella de IA que abre
// un chat sobre los datos de la plataforma. Respuestas cortas y numéricas, y debajo de
// cada una 2-3 SUGERENCIAS de seguimiento: chips clicables con letra (A/B/C) que
// también se eligen escribiendo la letra en el cajetín. Fase 1: solo equipo Dynamo
// (lo decide el layout del panel y lo vuelve a comprobar el servidor).

type Msg = { de: 'yo' | 'ia'; texto: string; sugerencias?: string[]; error?: boolean };
const LETRAS = ['A', 'B', 'C'];

export default function ChatIA() {
  const [abierto, setAbierto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, cargando, abierto]);
  useEffect(() => { if (abierto) inputRef.current?.focus(); }, [abierto, cargando]);

  const enviar = async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || cargando) return;
    setTexto('');
    // El historial que viaja: solo texto (las sugerencias son de la pantalla).
    const historial = msgs.filter((m) => !m.error).map((m) => ({ de: m.de, texto: m.texto }));
    setMsgs((v) => [...v, { de: 'yo', texto: p }]);
    setCargando(true);
    try {
      const r = await preguntarIA(historial, p);
      setMsgs((v) => [...v, r.ok
        ? { de: 'ia', texto: r.respuesta, sugerencias: r.sugerencias }
        : { de: 'ia', texto: r.error, error: true }]);
    } catch {
      setMsgs((v) => [...v, { de: 'ia', texto: 'No se ha podido preguntar; inténtalo de nuevo.', error: true }]);
    }
    setCargando(false);
  };

  // Las sugerencias vivas son las del último mensaje del asistente.
  const ultimo = [...msgs].reverse().find((m) => m.de === 'ia' && !m.error);
  const sugerencias = msgs.length && msgs[msgs.length - 1] === ultimo ? ultimo?.sugerencias ?? [] : [];

  const mandar = () => {
    const t = texto.trim();
    // Escribir solo la letra (A, B o C) elige esa sugerencia (usuario, 2026-11-11).
    const i = LETRAS.indexOf(t.toUpperCase());
    if (t.length === 1 && i >= 0 && sugerencias[i]) return void enviar(sugerencias[i]);
    void enviar(t);
  };

  return (
    <>
      <button type="button" className={`ia-fab${abierto ? ' oculto' : ''}`} onClick={() => setAbierto(true)}
        aria-label="Abrir el asistente de datos (IA)" title="Asistente de datos (IA)">
        <Estrella />
      </button>
      {abierto && (
        <section className="ia-panel" role="dialog" aria-label="Asistente de datos">
          <header className="ia-head">
            <span className="ia-head-ico"><Estrella /></span>
            <span className="ia-head-tit">Asistente de datos<span className="ia-beta">beta</span></span>
            <button type="button" className="ia-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
          </header>
          <div className="ia-msgs">
            {!msgs.length && (
              <div className="ia-vacio">
                Pregunta sobre los datos de la plataforma y te respondo con cifras.
                <div className="ia-chips">
                  {['¿Cuántos envíos hay esta semana?', '¿Qué envíos van con retraso?', '¿Facturación de este mes?'].map((s) => (
                    <button key={s} type="button" className="ia-chip" onClick={() => void enviar(s)} disabled={cargando}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`ia-msg ${m.de}${m.error ? ' err' : ''}`}>{m.texto}</div>
            ))}
            {!cargando && sugerencias.length > 0 && (
              <div className="ia-chips" aria-label="Preguntas sugeridas">
                {sugerencias.map((s, i) => (
                  <button key={i} type="button" className="ia-chip" onClick={() => void enviar(s)}>
                    <strong>{LETRAS[i]}</strong> {s}
                  </button>
                ))}
              </div>
            )}
            {cargando && <div className="ia-msg ia ia-pensando" aria-label="Pensando"><span /><span /><span /></div>}
            <div ref={finRef} />
          </div>
          <div className="ia-entrada">
            <input ref={inputRef} type="text" value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') mandar(); }}
              placeholder={sugerencias.length ? 'Pregunta, o escribe A, B o C…' : 'Escribe tu pregunta…'}
              disabled={cargando} aria-label="Tu pregunta" maxLength={1000} />
            <button type="button" className="btn-primary ia-enviar" onClick={mandar} disabled={cargando || !texto.trim()}>Enviar</button>
          </div>
        </section>
      )}
    </>
  );
}

// La estrella de la IA (sparkle de 4 puntas).
function Estrella() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c.4 4.9 2.3 8.3 2.3 8.3S17.1 11.6 22 12c-4.9.4-7.7 1.7-7.7 1.7S12.4 17.1 12 22c-.4-4.9-2.3-8.3-2.3-8.3S6.9 12.4 2 12c4.9-.4 7.7-1.7 7.7-1.7S11.6 6.9 12 2z" />
      <path d="M19 2.5c.15 1.8.85 3 .85 3S21.2 6.35 23 6.5c-1.8.15-3.15.65-3.15.65S19.15 8.7 19 10.5c-.15-1.8-.85-3.35-.85-3.35S16.8 6.65 15 6.5c1.8-.15 3.15-.65 3.15-.65S18.85 4.3 19 2.5z" opacity="0.75" />
    </svg>
  );
}
