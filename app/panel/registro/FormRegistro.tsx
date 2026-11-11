'use client';

// Formulario del alta de cliente, SOLO LA CUENTA (usuario, 2026-11-11: «1º cuenta aquí
// más simple y luego dentro busca qué empresa se le asocia»): email, nombre y apellidos,
// DNI opcional y teléfono. La empresa (razón social, CIF, dirección fiscal…) NO se pide
// aquí: la asocia o la crea el equipo de Dynamo en «Altas» al activar la cuenta.
import { useActionState, useState } from 'react';
import { registrar, type EstadoAlta, type DatosAlta } from './acciones';
import { validaIdFiscal } from '@/lib/idFiscal';
import SelectorPais from '@/components/SelectorPais';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';

const VACIO: DatosAlta = { email: '', nombre: '', dni: '', prefijo: '+34', telefono: '' };

function Feedback({ valor }: { valor: string }) {
  const r = validaIdFiscal(valor);
  if (!r) return <div className="fiscal-fb" />;
  if (r.soft) return <div className="fiscal-fb soft">{r.tipo}: formato correcto (se verificará al activar la cuenta)</div>;
  if (r.ok) return <div className="fiscal-fb ok">{r.tipo} válido</div>;
  return <div className="fiscal-fb bad">{r.tipo ? `${r.tipo}: ${r.msg}` : r.msg}</div>;
}

const IcoMail = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>;
const IcoPersona = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

export default function FormRegistro() {
  const [estado, accion, enviando] = useActionState(registrar, { error: null } as EstadoAlta);
  const ini = estado.datos ?? VACIO;
  const [dni, setDni] = useState(ini.dni);
  const [prefijo, setPrefijo] = useState(ini.prefijo);
  const k = (c: string) => `${c}-${estado.campo === c ? 'mal' : 'ok'}-${estado.error ?? ''}`;
  const rojo = (c: string) => (estado.campo === c ? { borderColor: '#dc2626' } : undefined);

  return (
    <form action={accion} noValidate autoComplete="on">
      {enviando && <Cargando texto="Creando tu cuenta" />}
      {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
      <div className="reg-grid">
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-email">Correo electrónico <Req /></label>
          <div className="portal-input-wrap"><IcoMail />
            <input id="reg-email" key={k('email')} name="email" defaultValue={ini.email} className="portal-input" style={rojo('email')}
                   type="email" inputMode="email" placeholder="Ej. tu@empresa.com" autoComplete="email" required />
          </div>
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-nombre">Tu nombre y apellidos <Req /></label>
          <div className="portal-input-wrap"><IcoPersona />
            <input id="reg-nombre" key={k('nombre')} name="nombre" defaultValue={ini.nombre} className="portal-input" style={rojo('nombre')}
                   placeholder="La persona que usará la cuenta" autoComplete="name" required />
          </div>
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-dni">DNI / NIE <Req si={false} /></label>
          <input id="reg-dni" name="dni" value={dni} onChange={(e) => setDni(e.target.value)} className="portal-input sin-ico" style={rojo('dni')}
                 placeholder="Ej. 12345678Z" autoCapitalize="characters" />
          {dni && <Feedback valor={dni} />}
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-tel">Teléfono <Req /></label>
          <div className="reg-phone" style={rojo('telefono')}>
            <SelectorPais modo="prefijo" name="prefijo" valor={prefijo} onCambio={setPrefijo} />
            <input id="reg-tel" key={k('telefono')} name="telefono" defaultValue={ini.telefono} className="reg-phone-num"
                   type="tel" inputMode="tel" placeholder="Ej. 600 000 000" autoComplete="tel-national" required />
          </div>
        </div>
      </div>

      <div className="reg-fraude">
        <strong>Verificación de identidad.</strong> Te enviaremos un <strong>código</strong> al email para comprobar que
        eres su titular, y el equipo de Dynamo revisará los datos de la empresa antes de activar la cuenta.
        La suplantación de identidad es un delito.
      </div>

      <label className="reg-terms" style={estado.campo === 'acepto' ? { color: '#dc2626' } : undefined}>
        <input type="checkbox" name="acepto" />
        <span>He leído y acepto el <a href="/#aviso-legal" target="_blank" rel="noopener">Aviso legal</a> y la{' '}
          <a href="/#privacidad" target="_blank" rel="noopener">Política de privacidad</a> de Dynamo Operador Logístico, S.L.</span>
      </label>

      <p className="reg-helper">Te enviaremos un enlace y un código al email para confirmar el alta. La contraseña la eliges después.</p>

      <button type="submit" className="portal-submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Continuar'}</button>
    </form>
  );
}
