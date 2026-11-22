'use client';

import { useEffect, useRef, useState } from 'react';
import SelectorPais from '@/components/SelectorPais';
import CampoTelefono from '@/components/CampoTelefono';
import Req from '@/components/Req';
import Documentos from './Documentos';
import { paisDe } from '@/lib/paises';
import CampoProvincia from '@/components/CampoProvincia';
import { CampoCodigoPostal, CampoPoblacion, lugarDe, type Lugar } from '@/components/CamposLugar';
import { conProvinciaDelCp } from '@/lib/provinciasEs';
import { validaIdFiscalPais } from '@/lib/idFiscal';
import {
  empresaDeMiAlta, buscarEmpresaDeMiAlta, guardarEmpresaDeMiAlta, type EmpresaAlta as Datos, type PasoAlta,
} from '@/app/panel/(app)/mi-cuenta/acciones';
import { buscarEnRegistro } from '@/app/panel/(app)/autorrelleno/acciones';

// ---- La empresa de un alta pendiente, por pasos (usuario, 2026-11-16) --------------------
// El registro solo pide los datos de la persona. Aquí dice de qué empresa es:
//   1. Escribe el CIF / NIF y se busca entre los clientes de Dynamo.
//   2. Si ya es cliente → sigue: no rellena nada, Dynamo le asocia al verificar.
//      Si no → alta de la empresa: razón social, domicilio fiscal, teléfono y email.
//   3. Documentación (aparece cuando el paso anterior está hecho).

const VACIO: Datos = { empresa: '', cif: '', pais: 'ES', direccion: '', codigo_postal: '', poblacion: '', provincia: '', telefono: '', email: '' };
const ETIQ: React.CSSProperties = { display: 'block', fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--gray-700)', margin: '0 0 0.25rem' };
const cifLimpio = (v: string) => v.toUpperCase().replace(/[\s.\-/]/g, '');

export default function EmpresaAlta({ usuarioId }: { usuarioId: string }) {
  const [cargado, setCargado] = useState(false);
  const [paso, setPaso] = useState<PasoAlta>('buscar');
  const [guardada, setGuardada] = useState(false);
  const [d, setD] = useState<Datos>(VACIO);
  const [cifBuscado, setCifBuscado] = useState('');   // el CIF de lo que ya hay escrito debajo
  const [miEmail, setMiEmail] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mal, setMal] = useState<keyof Datos | null>(null);
  const [hecho, setHecho] = useState(false);
  // Autorrelleno desde el Registro (APIEmpresas.es; apagado hasta tener clave): una vez por CIF.
  const [delRegistro, setDelRegistro] = useState(false);
  const registroPara = useRef('');

  useEffect(() => {
    empresaDeMiAlta().then((r) => {
      if (!r) return;
      setPaso(r.paso); setGuardada(r.guardada); setMiEmail(r.miEmail); setCifBuscado(r.d.cif);
      setD({ ...r.d, email: r.d.email || r.miEmail });
    }).catch(() => {}).finally(() => setCargado(true));
  }, []);

  // En España la provincia sale sola del código postal (usuario, 2026-11-22).
  const ponLugar = (c: Partial<Lugar>) => {
    setD((x) => { const n = { ...x, ...c }; return 'codigo_postal' in c ? conProvinciaDelCp(n, n.pais) : n; });
    setHecho(false);
  };
  const pon = (k: keyof Datos, v: string) => {
    setD((x) => { const n = { ...x, [k]: v }; return k === 'codigo_postal' || k === 'pais' ? conProvinciaDelCp(n, n.pais) : n; });
    setHecho(false);
  };

  async function buscar() {
    setError(null); setMal(null); setTrabajando(true);
    const r = await buscarEmpresaDeMiAlta(d.cif, d.pais).catch(() => ({ ok: false as const, error: 'No se ha podido buscar. Vuelve a intentarlo.' }));
    setTrabajando(false);
    if (!r.ok) { setMal('cif'); setError(r.error); return; }
    // Otro CIF (o una empresa que ya es cliente): lo escrito de la empresa anterior ya no vale.
    const limpiar = r.paso === 'existente' || r.cif !== cifLimpio(cifBuscado);
    setD((x) => (limpiar ? { ...VACIO, cif: r.cif, pais: r.pais, email: miEmail } : { ...x, cif: r.cif, pais: r.pais, email: x.email || miEmail }));
    if (limpiar) setGuardada(false);
    setCifBuscado(r.cif); setPaso(r.paso);
  }
  async function guardar() {
    setError(null); setMal(null); setTrabajando(true);
    const r = await guardarEmpresaDeMiAlta(d).catch(() => ({ ok: false as const, error: 'No se ha podido guardar. Vuelve a intentarlo.', campo: undefined }));
    setTrabajando(false);
    if (!r.ok) { setMal(r.campo ?? null); setError(r.error); return; }
    if (r.paso === 'existente') { setPaso('existente'); setGuardada(false); return; }
    setGuardada(true); setHecho(true);
  }
  function cambiarCif() { setError(null); setMal(null); setHecho(false); setPaso('buscar'); }

  const rojo = (k: keyof Datos): React.CSSProperties => (mal === k ? { borderColor: 'var(--red)' } : {});
  const campo = (k: keyof Datos, label: string, ph: string, full = false, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`ea-${k}`} style={ETIQ}>{label} <Req /></label>
      <input id={`ea-${k}`} type="text" value={d[k]} placeholder={ph} autoComplete="off" {...extra}
        style={{ width: '100%', boxSizing: 'border-box', ...rojo(k) }} onChange={(e) => pon(k, e.target.value)} />
    </div>
  );
  const cifVisto = <strong style={{ whiteSpace: 'nowrap' }}>{d.cif}</strong>;
  const docs = paso === 'existente' || (paso === 'nueva' && guardada);
  // ¿El identificador es de una PERSONA (DNI o NIE español) o de una empresa (CIF, IVA…)?
  const persona = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(cifLimpio(d.cif).replace(/^ES/, ''));
  const tipoDoc = paso === 'nueva' && !persona ? 'hoja_cif' : 'dni';
  // Lo que se reconoce mientras escribe (usuario, 2026-11-16: «que autocalcule qué tipo es»).
  const visto = d.cif.trim().length >= 8 ? validaIdFiscalPais(d.cif, d.pais) : null;
  const queEs = persona ? 'DNI / NIE — autónomo' : 'CIF — empresa';

  // Empresa nueva (no autónomo: los autónomos no están en el Registro) y sin datos escritos: se
  // piden al Registro y se rellenan los campos vacíos. Si no está o está apagado, a mano.
  useEffect(() => {
    if (!cargado || paso !== 'nueva' || persona || guardada || d.empresa.trim() || registroPara.current === d.cif) return;
    registroPara.current = d.cif;
    let vivo = true;
    buscarEnRegistro(d.cif).then((r) => {
      const e = r.ok ? r.empresas.find((x) => x.cif === cifLimpio(d.cif)) : null;
      if (!vivo || !e) return;
      setD((x) => conProvinciaDelCp({ ...x, empresa: x.empresa || e.razon_social, direccion: x.direccion || e.direccion,
        codigo_postal: x.codigo_postal || e.codigo_postal, poblacion: x.poblacion || e.poblacion, provincia: x.provincia || e.provincia }, x.pais));
      setDelRegistro(true);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [cargado, paso, persona, guardada, d.cif, d.empresa]);

  return (
    <>
      {/* ---- 1. Tu empresa: el CIF / NIF ---- */}
      <div className="account-card" style={{ marginTop: '1rem' }}>
        <div className="account-card-title">1 · Tu empresa</div>
        {paso === 'buscar' && (
          <>
            <p className="account-card-desc">
              Escribe el <strong>CIF / NIF</strong> de tu empresa (o tu NIF si eres autónomo). Comprobamos si ya trabaja con Dynamo.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem 0.8rem', alignItems: 'end' }}>
              <div>
                <label htmlFor="ea-pais" style={ETIQ}>País</label>
                <SelectorPais id="ea-pais" valor={d.pais} disabled={!cargado || trabajando} onCambio={(v) => pon('pais', v)} />
              </div>
              <div>
                <label htmlFor="ea-cif" style={ETIQ}>CIF / NIF <Req /></label>
                <input id="ea-cif" type="text" value={d.cif} placeholder="B12345678 / 12345678Z" autoComplete="off" autoCapitalize="characters"
                  disabled={!cargado || trabajando} style={{ width: '100%', boxSizing: 'border-box', ...rojo('cif') }}
                  onChange={(e) => pon('cif', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={buscar} disabled={!cargado || trabajando || !d.cif.trim()} style={{ width: '100%' }}>
                  {trabajando ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </div>
            {visto && !error && (
              <p style={{ margin: '0.5rem 0 0', fontSize: 'var(--fs-s)', fontWeight: 700, color: visto.ok ? '#0f6b3a' : '#b45309' }}>
                {visto.ok
                  ? <>✓ Reconocido: {queEs}. Te pediremos {persona ? 'tu DNI' : 'la hoja del CIF'}.</>
                  : <>Revisa el número{visto.msg ? `: ${visto.msg}` : ''}.</>}
              </p>
            )}
          </>
        )}
        {paso === 'existente' && (
          <>
            <div className="pt-aviso ok" style={{ margin: '0.2rem 0 0.7rem' }}><div>
              <strong>✓ La empresa con CIF / NIF {cifVisto} ya trabaja con Dynamo.</strong> No tienes que rellenar sus datos: al verificar tu alta te asociamos a ella y te avisamos por email.
            </div></div>
            <button type="button" className="btn-ghost" onClick={cambiarCif}>No es ese CIF · cambiarlo</button>
          </>
        )}
        {paso === 'nueva' && (
          <>
            <p className="account-card-desc">
              {cifVisto} ({paisDe(d.pais)}) · reconocido como <strong>{queEs}</strong>. Todavía no es cliente de Dynamo: rellena el alta aquí debajo.
            </p>
            <button type="button" className="btn-ghost" onClick={cambiarCif}>Cambiar CIF</button>
          </>
        )}
        {error && paso === 'buscar' && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {error}</div>}
      </div>

      {/* ---- 2. Empresa nueva: sus datos ---- */}
      {paso === 'nueva' && (
        <div className="account-card" style={{ marginTop: '1rem' }}>
          <div className="account-card-title">{persona ? '2 · Alta de nuevo AUTÓNOMO' : '2 · Alta de nueva EMPRESA'}</div>
          <p className="account-card-desc">Con estos datos creamos tu ficha de cliente. Todos son obligatorios.</p>
          {delRegistro && <div className="pt-aviso info" style={{ marginBottom: '0.7rem' }}><div>Hemos rellenado los datos con los del <strong>Registro Mercantil</strong>. Revísalos y cambia lo que haga falta.</div></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.65rem 0.8rem' }}>
            {campo('empresa', persona ? 'Nombre y apellidos (como en tu DNI)' : 'Razón social', persona ? 'Ej. Marta Ruiz Gómez' : 'Ej. Marbex Industrial S.L.', true)}
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="ea-cif-fijo" style={ETIQ}>{persona ? 'DNI / NIE' : 'CIF'} <Req /></label>
              <input id="ea-cif-fijo" type="text" value={d.cif} readOnly style={{ width: '100%', boxSizing: 'border-box', background: 'var(--gray-100)', ...rojo('cif') }} />
            </div>
            <div className="ptar-section-head" style={{ gridColumn: '1/-1', marginTop: '0.3rem' }}>Domicilio fiscal</div>
            {campo('direccion', 'Dirección (calle y número)', 'Calle y número', true)}
            <div>
              <label htmlFor="ea-codigo_postal" style={ETIQ}>Código postal <Req /></label>
              <CampoCodigoPostal id="ea-codigo_postal" pais={d.pais} placeholder="41001" lugar={lugarDe(d)} disabled={!cargado || trabajando}
                style={{ width: '100%', boxSizing: 'border-box', ...rojo('codigo_postal') }} onCambio={ponLugar} />
            </div>
            <div>
              <label htmlFor="ea-poblacion" style={ETIQ}>Población <Req /></label>
              <CampoPoblacion id="ea-poblacion" pais={d.pais} placeholder="Sevilla" lugar={lugarDe(d)} disabled={!cargado || trabajando}
                style={{ width: '100%', boxSizing: 'border-box', ...rojo('poblacion') }} onCambio={ponLugar} />
            </div>
            <div>
              <label htmlFor="ea-provincia" style={ETIQ}>Provincia <Req /></label>
              <CampoProvincia id="ea-provincia" pais={d.pais} valor={d.provincia} disabled={!cargado || trabajando}
                style={{ width: '100%', boxSizing: 'border-box', ...rojo('provincia') }} onCambio={(v) => pon('provincia', v)} />
            </div>
            <div className="ptar-section-head" style={{ gridColumn: '1/-1', marginTop: '0.3rem' }}>Contacto</div>
            <div>
              <label htmlFor="ea-telefono" style={{ ...ETIQ, ...(mal === 'telefono' ? { color: 'var(--red)' } : {}) }}>Teléfono <Req /></label>
              <CampoTelefono id="ea-telefono" valor={d.telefono} onCambio={(v) => pon('telefono', v)} />
            </div>
            {campo('email', 'Email', 'administracion@tuempresa.com', false, { type: 'email', inputMode: 'email', autoCapitalize: 'none' })}
          </div>
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <button type="button" className="btn-primary" onClick={guardar} disabled={trabajando}>
              {trabajando ? 'Guardando…' : guardada ? 'Guardar cambios' : 'Guardar y continuar'}
            </button>
            {hecho && <span style={{ color: '#0f6b3a', fontWeight: 700, fontSize: 'var(--fs-m)' }}>✓ Datos guardados. Ahora sube la documentación.</span>}
          </div>
          {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.5rem' }}>⚠ {error}</div>}
        </div>
      )}

      {/* ---- Documentación: cuando la empresa ya está dicha. UN solo documento, sin elegir
          tipo (usuario, 2026-11-16): alta con CIF de empresa → la hoja del CIF; alta con
          DNI / NIE (autónomo) → el DNI. Si la empresa ya es cliente, el DNI de la persona. ---- */}
      {docs && (
        <div className="account-card" style={{ marginTop: '1rem' }}>
          <div className="account-card-title">{paso === 'existente' ? '2 · Documentación' : persona ? '3 · Documentación del alta de nuevo AUTÓNOMO' : '3 · Documentación del alta de nueva EMPRESA'}</div>
          <p className="account-card-desc">
            {paso === 'existente'
              ? <>Sube tu <strong>DNI</strong> (PDF o foto): con él comprobamos que eres de la empresa.</>
              : persona
                ? <>Sube tu <strong>DNI / NIE</strong> (PDF o foto), el mismo con el que das de alta la cuenta.</>
                : <>Sube la <strong>hoja del CIF</strong> de la empresa (PDF o foto).</>}
            {' '}Sin {paso === 'nueva' && !persona ? 'ella' : 'él'} el alta puede tardar más en verificarse.
          </p>
          <Documentos key={tipoDoc} dueno={{ campo: 'usuario_id', id: usuarioId }} tipos={[tipoDoc]} sinQuitar />
        </div>
      )}
    </>
  );
}
