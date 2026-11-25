'use client';

// MÓVIL VERIFICADO POR WHATSAPP (usuario, 2026-11-25): pantalla que sale en el panel, en vez de
// lo demás, a los clientes y transportistas que aún no han verificado su móvil (los nuevos tras
// confirmar el email; los de antes, una sola vez). «Para verificación de identidad: el móvil
// tiene un titular con DNI; evita suplantaciones.» Sin «No tengo WhatsApp» (usuario, 2026-11-25): quien
// de verdad no pueda, llama a Dynamo, que lo comprueba por teléfono y lo marca desde su ficha.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CampoTelefono from '@/components/CampoTelefono';
import Cargando from '@/components/Cargando';
import { esMovil } from '@/lib/whatsapp';
import { comprobarCodigoMovil, pedirCodigoMovil } from '@/app/panel/(app)/movil/acciones';
import { CONTACTO } from '@/lib/atencion';

const telBonito = (t: string) => t.replace(/^\+34(\d{3})(\d{3})(\d{3})$/, '+34 $1 $2 $3');

export default function VerificarMovil({ telefono: inicial }: { telefono: string | null }) {
  const router = useRouter();
  const [tel, setTel] = useState(inicial ?? '');
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function pedir() {
    setError(null);
    if (!esMovil(tel)) { setError('Tiene que ser un móvil: en España, 9 cifras que empiezan por 6 o 7; si es de otro país, con su prefijo.'); return; }
    setTrabajando(true);
    const r = await pedirCodigoMovil(tel).catch(() => ({ ok: false as const, error: 'No se ha podido mandar el código. Inténtalo de nuevo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setEnviadoA(r.telefono ?? tel); setCodigo(''); setEspera(60);
  }
  async function comprobar() {
    setError(null);
    if (codigo.replace(/\D/g, '').length !== 6) { setError('Escribe las 6 cifras del código.'); return; }
    setTrabajando(true);
    const r = await comprobarCodigoMovil(codigo, true).catch(() => ({ ok: false as const, error: 'No se ha podido comprobar. Inténtalo de nuevo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }
  return (
    <section className="section active" id="verificar-movil">
      <div className="vm-caja">
        <div className="vm-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z" /></svg>
        </div>
        <h2>Verifica tu móvil por WhatsApp</h2>
        <p className="vm-por-que">
          <strong>Para verificar tu identidad.</strong> Cada línea móvil está registrada a nombre de su titular, con su DNI:
          así evitamos suplantaciones y protegemos tus envíos. Te mandamos un <strong>código de 6 cifras por WhatsApp</strong>.
          Solo hay que hacerlo una vez.
        </p>

        {!enviadoA ? (
          <div className="vm-paso">
            <label htmlFor="vm-tel">Tu móvil (WhatsApp)</label>
            <CampoTelefono id="vm-tel" valor={tel} onCambio={(v) => { setTel(v); setError(null); }} placeholder="600 000 000" disabled={trabajando} />
            <button type="button" id="vm-pedir" className="btn-primary" disabled={trabajando || !tel} onClick={pedir}>Mandarme el código por WhatsApp</button>
          </div>
        ) : (
          <div className="vm-paso">
            <p className="meta" id="vm-enviado">Te lo hemos mandado al <strong className="notranslate" translate="no">{telBonito(enviadoA)}</strong>. Dura 10 minutos.</p>
            <label htmlFor="vm-codigo">Código de 6 cifras</label>
            <input id="vm-codigo" className="vm-codigo" value={codigo} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') comprobar(); }} placeholder="······" />
            <p className="meta vm-avisos" id="vm-avisos">
              Al verificar tu móvil, recibirás <strong>también por WhatsApp</strong> los avisos de tus envíos (te siguen llegando por email igual).
              Puedes quitarlo cuando quieras en <strong>Mi cuenta</strong>.
            </p>
            <button type="button" id="vm-comprobar" className="btn-primary" disabled={trabajando || codigo.length !== 6} onClick={comprobar}>Verificar</button>
            <div className="vm-otros">
              <button type="button" className="btn-ghost" disabled={trabajando || espera > 0} onClick={pedir}>{espera > 0 ? `Reenviar en ${espera} s` : 'Reenviar el código'}</button>
              <button type="button" className="btn-ghost" disabled={trabajando} onClick={() => { setEnviadoA(null); setCodigo(''); setError(null); }}>Cambiar el móvil</button>
            </div>
          </div>
        )}

        {error && <div className="wiz-warn show" role="alert" id="vm-error">⚠ {error}</div>}
        {trabajando && <Cargando texto="Un momento" />}

        <p className="meta vm-ayuda" id="vm-ayuda">
          ¿No te llega el código o no tienes WhatsApp? Llámanos al <a href={`tel:${CONTACTO.telefono.replace(/\s/g, '')}`}>{CONTACTO.telefono}</a> y lo comprobamos por teléfono.
        </p>
      </div>
    </section>
  );
}
