'use client';

import { useState } from 'react';
import { guardarMatriculas } from './acciones';
import { fecha, ventana, metros, pesoTn, diasEntre } from '@/lib/formato';
import CampoTelefono from '@/components/CampoTelefono';
import Req from '@/components/Req';
import AvisoDireccionesOcultas from '@/components/AvisoDireccionesOcultas';
import { CONTACTO } from '@/lib/atencion';
import { telBonito } from '@/lib/paises';
import { avisaFaltas } from '@/lib/faltas';
import { AVISO_MOVIL } from '@/lib/whatsapp';

export type DatosMatriculas = {
  resultado: 'ok' | 'no_valido' | 'cancelado' | 'error' | 'mantenimiento';
  referencia?: string; estado?: string; editable?: boolean; transportista?: string | null;
  fecha_carga_prevista?: string | null; fecha_carga_desde?: string | null; fecha_carga_hasta?: string | null;
  metros_lineales?: number | null; toneladas?: number | null; mercancia?: string | null; paletizado?: boolean | null; plataforma?: boolean | null;
  necesita_remolque?: boolean; matricula_camion?: string | null; matricula_remolque?: string | null;
  conductor_nombre?: string | null; conductor_telefono?: string | null; completas?: boolean;
  paradas?: { orden: number; tipo: 'carga' | 'descarga'; codigo_postal: string | null; pais_codigo_iso: string | null }[];
};

function Parar({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div id="matr-parar" style={{ textAlign: 'center' }}>
      <h1 style={{ margin: '0 0 0.5rem' }}>{titulo}</h1>
      {children}
      <p className="sub">¿Dudas? Llámanos al <a href={CONTACTO.telHref}>{telBonito(CONTACTO.telefono)}</a> o escríbenos a <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a>.</p>
    </div>
  );
}

export default function FormMatriculas({ token, clave, d }: { token: string; clave: string; d: DatosMatriculas }) {
  const [veh, setVeh] = useState({ camion: d.matricula_camion ?? '', remolque: d.matricula_remolque ?? '', conductor: d.conductor_nombre ?? '', telefono: d.conductor_telefono ?? '' });
  const dias = diasEntre(d.fecha_carga_desde ?? null, d.fecha_carga_hasta ?? null);
  const [dia, setDia] = useState(d.fecha_carga_prevista ?? '');
  const [completas, setCompletas] = useState(!!d.completas);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (d.resultado === 'mantenimiento') return <Parar titulo="Plataforma en mantenimiento"><p className="sub">Vuelve a intentarlo en un rato.</p></Parar>;
  if (d.resultado === 'error') return <Parar titulo="No se puede conectar ahora mismo"><p className="sub">Vuelve a intentarlo en un momento.</p></Parar>;
  if (d.resultado === 'cancelado') return <Parar titulo={`El envío #${d.referencia ?? ''} se ha cancelado`}><p className="sub">Ya no hace falta poner las matrículas.</p></Parar>;
  if (d.resultado !== 'ok') return <Parar titulo="Este enlace no es válido"><p className="sub">Ha caducado, se ha retirado o el envío ya no está con vosotros. Usa el enlace del último email que te hayamos mandado.</p></Parar>;

  const rec = (d.paradas ?? []).filter((p) => p.tipo === 'carga'), ent = (d.paradas ?? []).filter((p) => p.tipo === 'descarga');
  const cp = (p: { codigo_postal: string | null; pais_codigo_iso: string | null }) => `CP ${p.codigo_postal ?? '—'}${p.pais_codigo_iso && p.pais_codigo_iso !== 'ES' ? ` (${p.pais_codigo_iso})` : ''}`;
  const cargaTxt = d.fecha_carga_prevista ? fecha(d.fecha_carga_prevista)
    : d.fecha_carga_hasta && d.fecha_carga_hasta !== d.fecha_carga_desde ? ventana(d.fecha_carga_desde, d.fecha_carga_hasta) : fecha(d.fecha_carga_desde);
  const necesitaRem = !!d.necesita_remolque;

  async function guardar() {
    const faltan = [!veh.camion.trim() && 'mt-camion', necesitaRem && !veh.remolque.trim() && 'mt-remolque',
      !veh.conductor.trim() && 'mt-chofer', !veh.telefono.trim() && 'mt-tfno', dias.length > 1 && !dia && 'mt-dia'].filter(Boolean) as string[];
    if (faltan.length) { avisaFaltas(faltan); setMsg({ ok: false, txt: 'Rellena los campos marcados en rojo.' }); return; }
    setGuardando(true); setMsg(null);
    try {
      const x = await guardarMatriculas(token, clave, { ...veh, dia: dias.length > 1 ? dia : null });
      if (x.resultado === 'guardado') {
        setVeh((v) => ({ ...v, conductor: x.conductor ?? v.conductor, telefono: x.telefono ?? v.telefono }));
        setCompletas(!!x.completas);
        setMsg({ ok: true, txt: x.completas
          ? 'Matrículas guardadas. Te acabamos de enviar por email la orden de carga COMPLETA, con el enlace para firmar el e-CMR.'
          : 'Guardado. Falta la matrícula del semirremolque para completar el DeCA.' });
      } else {
        setMsg({ ok: false, txt: x.resultado === 'falta_camion' ? 'Pon la matrícula del camión o tractora.'
          : x.resultado === 'falta_fecha_prevista' ? 'Elige el día en que cargas.'
          : x.resultado === 'fecha_fuera_de_ventana' ? 'Ese día no está dentro de los días de recogida.'
          : x.resultado === 'matricula_larga' ? 'Esa matrícula es demasiado larga: revísala.'
          : x.resultado === 'telefono_no_movil' ? `El teléfono del conductor ${AVISO_MOVIL}`
          : x.resultado === 'ya_no_se_puede' ? 'Este envío ya no admite cambios desde aquí: llámanos.'
          : x.resultado === 'no_valido' ? 'Este enlace ya no es válido: usa el del último email.'
          : x.resultado === 'mantenimiento' ? 'Plataforma en mantenimiento: vuelve a intentarlo en un rato.'
          : 'No se ha podido guardar; vuelve a intentarlo o llámanos.' });
      }
    } catch { setMsg({ ok: false, txt: 'No se ha podido guardar; vuelve a intentarlo o llámanos.' }); }
    setGuardando(false);
  }

  return (
    <div id="matr-pagina" style={{ textAlign: 'left' }}>
      <h1 style={{ margin: '0 0 0.2rem', textAlign: 'center' }}>Matrículas del envío #{d.referencia}</h1>
      {d.transportista && <p className="sub" style={{ textAlign: 'center', margin: '0 0 0.7rem' }}>{d.transportista}</p>}
      {!completas && <AvisoDireccionesOcultas style={{ marginBottom: '0.7rem' }} />}
      {completas && !msg && (
        <div id="matr-ya" style={{ background: '#ecfdf5', border: '1px solid #b7ebcd', color: '#047857', fontWeight: 700, borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '0.7rem' }}>
          ✓ Este envío ya tiene las matrículas. La orden de carga completa, con el enlace del e-CMR, está en tu email. Si cambian, corrígelas aquí.
        </div>
      )}

      <div id="matr-resumen" className="fsec" style={{ marginBottom: '0.7rem' }}>
        <div className="sec-title">Resumen del envío</div>
        <div style={{ lineHeight: 1.6 }}>
          <div><strong>Carga:</strong> {cargaTxt}</div>
          {rec.map((p, i) => <div key={`r${i}`}><strong>Recogida{rec.length > 1 ? ` ${i + 1}` : ''}:</strong> {cp(p)}</div>)}
          {ent.map((p, i) => <div key={`e${i}`}><strong>Entrega{ent.length > 1 ? ` ${i + 1}` : ''}:</strong> {cp(p)}</div>)}
          <div><strong>Mercancía:</strong> {[d.metros_lineales != null && metros(d.metros_lineales), d.toneladas != null && pesoTn(d.toneladas),
            d.mercancia || (d.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ')}</div>
          <div><strong>Vehículo:</strong> {d.plataforma ? 'Camión rígido con plataforma elevadora' : 'Tráiler tauliner (lona corredera)'}</div>
        </div>
      </div>

      {d.editable ? (
        <div id="matr-form" className="fsec fsec-vehiculo">
          <div className="sec-title">Vehículo y conductor</div>
          <div className="row2">
            <div><label htmlFor="mt-camion">Matrícula camión / tractora <Req /></label>
              <input type="text" id="mt-camion" value={veh.camion} placeholder="Ej. 1234ABC" autoCapitalize="characters" maxLength={20} onChange={(e) => setVeh({ ...veh, camion: e.target.value })} /></div>
            <div><label htmlFor="mt-remolque">Matrícula semirremolque <Req si={necesitaRem} /></label>
              <input type="text" id="mt-remolque" value={veh.remolque} placeholder="Ej. R5678DEF" autoCapitalize="characters" maxLength={20} onChange={(e) => setVeh({ ...veh, remolque: e.target.value })} /></div>
          </div>
          {dias.length > 1 && <>
            <label htmlFor="mt-dia">Día en que cargas <Req /></label>
            <select id="mt-dia" value={dia} onChange={(e) => setDia(e.target.value)}>
              <option value="">Elige un día de la ventana…</option>
              {dias.map((x) => { const w = new Date(`${x}T12:00:00`).getDay(); return <option key={x} value={x} disabled={w === 0 || w === 6}>{fecha(x)}{w === 0 || w === 6 ? ' (no se circula)' : ''}</option>; })}
            </select>
          </>}
          <label htmlFor="mt-chofer">Conductor <Req /></label>
          <input type="text" id="mt-chofer" value={veh.conductor} placeholder="Nombre y apellidos" maxLength={120} onChange={(e) => setVeh({ ...veh, conductor: e.target.value })} />
          <label htmlFor="mt-tfno">Móvil del conductor (WhatsApp) <Req /></label>
          <CampoTelefono id="mt-tfno" valor={veh.telefono} onCambio={(v) => setVeh({ ...veh, telefono: v })} />
          <button id="mt-guardar" className="btn" disabled={guardando} onClick={guardar} style={{ marginTop: '0.8rem' }}>
            {guardando ? 'Guardando…' : completas ? 'Actualizar matrículas y conductor' : 'Guardar matrículas y recibir la orden completa'}
          </button>
          {msg && (
            <div id="mt-resultado" role="status" style={{ marginTop: '0.6rem', borderRadius: 10, padding: '0.55rem 0.8rem', fontWeight: 700,
              background: msg.ok ? '#ecfdf5' : '#fde8e8', border: `1px solid ${msg.ok ? '#b7ebcd' : '#dc2626'}`, color: msg.ok ? '#047857' : '#8c1414' }}>
              {msg.ok ? '✓ ' : ''}{msg.txt}
            </div>
          )}
        </div>
      ) : (
        <div className="fsec">
          <div className="sec-title">Vehículo y conductor</div>
          <p style={{ margin: 0 }}>{[d.matricula_camion, d.matricula_remolque].filter(Boolean).join(' / ') || 'Sin matrículas'}{d.conductor_nombre ? ` · ${d.conductor_nombre}` : ''}</p>
          <p className="sub" style={{ marginTop: '0.4rem' }}>Este envío ya está en marcha: si algo cambia, llámanos al <a href={CONTACTO.telHref}>{telBonito(CONTACTO.telefono)}</a>.</p>
        </div>
      )}
    </div>
  );
}
