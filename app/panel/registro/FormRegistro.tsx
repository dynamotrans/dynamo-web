'use client';

// Formulario del alta de cliente: el de registro.html (email, empresa, CIF con aviso en
// vivo, país, teléfono, aceptación legal) más la dirección fiscal y la persona de
// contacto, que es lo que Dynamo necesita para dar de alta la empresa en «Altas».
import { useActionState, useState } from 'react';
import { registrar, type EstadoAlta, type DatosAlta } from './acciones';
import { validaIdFiscal, validaIdFiscalPais } from '@/lib/idFiscal';
import SelectorPais from '@/components/SelectorPais';
import { PAISES_MUNDO } from '@/lib/paises';

const prefijoDe = (c: string) => PAISES_MUNDO.find(([k]) => k === c)?.[2] ?? '';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';

const VACIO: DatosAlta = { email: '', empresa: '', cif: '', pais: 'ES', direccion: '', codigo_postal: '', poblacion: '', provincia: '', nombre: '', dni: '', prefijo: '+34', telefono: '' };

function Feedback({ valor, pais }: { valor: string; pais?: string }) {
  const r = pais ? validaIdFiscalPais(valor, pais) : validaIdFiscal(valor);
  if (!r) return <div className="fiscal-fb" />;
  if (r.soft) return <div className="fiscal-fb soft">{r.tipo}: formato correcto (se verificará al activar la cuenta)</div>;
  if (r.ok) return <div className="fiscal-fb ok">{r.tipo} válido</div>;
  return <div className="fiscal-fb bad">{r.tipo ? `${r.tipo}: ${r.msg}` : r.msg}</div>;
}

const IcoMail = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>;
const IcoEmpresa = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></svg>;
const IcoDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="9" x2="13" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /><line x1="7" y1="17" x2="11" y2="17" /></svg>;
const IcoPin = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IcoPersona = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

export default function FormRegistro() {
  const [estado, accion, enviando] = useActionState(registrar, { error: null } as EstadoAlta);
  const ini = estado.datos ?? VACIO;
  const [cif, setCif] = useState(ini.cif);
  const [dni, setDni] = useState(ini.dni);
  const [pais, setPais] = useState(ini.pais);
  const [prefijo, setPrefijo] = useState(ini.prefijo);
  const k = (c: string) => `${c}-${estado.campo === c ? 'mal' : 'ok'}-${estado.error ?? ''}`;
  const rojo = (c: string) => (estado.campo === c ? { borderColor: '#dc2626' } : undefined);

  return (
    <form action={accion} noValidate autoComplete="on">
      {enviando && <Cargando texto="Creando tu cuenta" />}
      {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
      <div className="reg-grid">
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-email">Correo electrónico</label>
          <div className="portal-input-wrap"><IcoMail />
            <input id="reg-email" key={k('email')} name="email" defaultValue={ini.email} className="portal-input" style={rojo('email')}
                   type="email" inputMode="email" placeholder="tu@empresa.com" autoComplete="email" required />
          </div>
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-empresa">Empresa o razón social / Nombre y apellidos</label>
          <div className="portal-input-wrap"><IcoEmpresa />
            <input id="reg-empresa" key={k('empresa')} name="empresa" defaultValue={ini.empresa} className="portal-input" style={rojo('empresa')}
                   placeholder="Empresa o nombre completo (autónomo)" autoComplete="organization" required />
          </div>
        </div>
        <div className="portal-field">
          <label className="portal-label" htmlFor="reg-cif">CIF / NIF</label>
          <div className="portal-input-wrap"><IcoDoc />
            <input id="reg-cif" name="cif" value={cif} onChange={(e) => setCif(e.target.value)} className="portal-input" style={rojo('cif')}
                   placeholder="B12345678 / 12345678Z" autoCapitalize="characters" required />
          </div>
          <Feedback valor={cif} pais={pais} />
        </div>
        <div className="portal-field">
          <label className="portal-label" htmlFor="reg-pais">País</label>
          <SelectorPais id="reg-pais" name="pais" valor={pais} onCambio={(v) => { setPais(v); if (!prefijo || prefijo === prefijoDe(pais)) { const d = prefijoDe(v); if (d) setPrefijo(d); } }} className="selpais-portal" />
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-dir">Dirección fiscal</label>
          <div className="portal-input-wrap"><IcoPin />
            <input id="reg-dir" key={k('direccion')} name="direccion" defaultValue={ini.direccion} className="portal-input" style={rojo('direccion')}
                   placeholder="Calle y número" autoComplete="street-address" required />
          </div>
        </div>
        <div className="portal-field">
          <label className="portal-label" htmlFor="reg-cp">Código postal</label>
          <input id="reg-cp" key={k('codigo_postal')} name="codigo_postal" defaultValue={ini.codigo_postal} className="portal-input sin-ico" style={rojo('codigo_postal')}
                 placeholder="41001" inputMode="numeric" autoComplete="postal-code" required />
        </div>
        <div className="portal-field">
          <label className="portal-label" htmlFor="reg-pob">Población</label>
          <input id="reg-pob" key={k('poblacion')} name="poblacion" defaultValue={ini.poblacion} className="portal-input sin-ico" style={rojo('codigo_postal')}
                 placeholder="Sevilla" autoComplete="address-level2" required />
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-prov">Provincia</label>
          <input id="reg-prov" name="provincia" defaultValue={ini.provincia} className="portal-input sin-ico" placeholder="Sevilla" autoComplete="address-level1" />
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-nombre">Tu nombre y apellidos</label>
          <div className="portal-input-wrap"><IcoPersona />
            <input id="reg-nombre" key={k('nombre')} name="nombre" defaultValue={ini.nombre} className="portal-input" style={rojo('nombre')}
                   placeholder="La persona que usará la cuenta" autoComplete="name" required />
          </div>
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-dni">DNI / NIE · opcional</label>
          <input id="reg-dni" name="dni" value={dni} onChange={(e) => setDni(e.target.value)} className="portal-input sin-ico" style={rojo('dni')}
                 placeholder="12345678Z" autoCapitalize="characters" />
          {dni && <Feedback valor={dni} />}
        </div>
        <div className="portal-field full">
          <label className="portal-label" htmlFor="reg-tel">Teléfono</label>
          <div className="reg-phone" style={rojo('telefono')}>
            <SelectorPais modo="prefijo" name="prefijo" valor={prefijo} onCambio={setPrefijo} />
            <input id="reg-tel" key={k('telefono')} name="telefono" defaultValue={ini.telefono} className="reg-phone-num"
                   type="tel" inputMode="tel" placeholder="600 000 000" autoComplete="tel-national" required />
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
