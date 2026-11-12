'use client';

// Lo que comparten la ficha y sus partes (iconos, celdas, nombres, ayudantes).
import { euros, ventana, pesoTn, metros, tipoCargaTxt } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { ESTADOS_ENVIO } from '@/lib/estados';

// [estado, nombre, color], de lib/estados.ts (programado primero: es el de por defecto).
export const ESTADOS: [string, string, string][] = (['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado', 'cancelado', 'borrador'] as const)
  .map((k) => [k, ESTADOS_ENVIO[k].label, ESTADOS_ENVIO[k].color]);
export const HITOS: Record<string, string> = {
  creado: 'Envío creado', confirmado: 'Envío confirmado', publicado_bolsa: 'Publicado en la bolsa de cargas',
  transportista_asignado: 'Transportista asignado', transportista_quitado: 'Transportista quitado',
  matricula_asignada: 'Matrícula asignada', hacia_la_carga: 'Sale hacia la carga', cargando: 'Llega y está cargando', descargando: 'Llega y está descargando', descargado: 'Descargado · sigue a la siguiente parada', etapa_corregida: 'Etapa marcada a mano', cargado: 'Cargado · en ruta', entregado: 'Entregado',
  cancelado: 'Cancelado', cancelacion_deshecha: 'Cancelación deshecha', ruta_cambiada: 'Ruta cambiada', fecha_carga_movida: 'Fecha de carga movida al pagar tarde', ofertado: 'Ofertado a un transportista',
  enlace_abierto: 'Enlace de la oferta abierto', reservado: 'Reservado por un transportista',
  reserva_caducada: 'Reserva caducada', reserva_liberada: 'Reserva liberada',
  contraoferta_propuesta: 'Contraoferta propuesta', contraoferta_resuelta: 'Contraoferta resuelta',
  orden_carga_enviada: 'Orden de carga enviada', cmr_firmado: 'CMR firmado',
  pin_enviado: 'PIN enviado', pin_validado: 'PIN validado', pin_validado_manual: 'PIN validado a mano',
  pin_fuera_de_orden: 'PIN fuera de orden', pin_bloqueado: 'PIN bloqueado', incidencia: 'Nota / incidencia',
};
export const ORIGEN: Record<string, string> = { app: '', trigger: 'automático', sistema: 'automático', migracion: 'migración' };

export const nombreEstado = (e: string) => ESTADOS.find(([k]) => k === e)?.[1] ?? e;
export const aNum = (t: string) => { const v = t.trim(); if (!v) return null; const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
export const txtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

// ---- Iconos (regla 0-ter) ---------------------------------------------------------
export const I = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
export const ICO = {
  camion: ['M1 4.5A1.5 1.5 0 0 1 2.5 3h12A1.5 1.5 0 0 1 16 4.5V16H1z', 'M16 8h4l3 3v5h-7z', 'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  editar: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  firma: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  fase: ['M5 12h14', 'M13 5l7 7-7 7'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  deshacer: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
  ojo: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  enviar: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'],
  aviso: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  ruta: ['M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M6 15V9a4 4 0 0 1 4-4h6', 'M18 9v6a4 4 0 0 1-4 4H8'],
  repetir: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
};
export const CANALES: Record<string, string> = {
  enlace: 'Enlace directo', email: 'Email', whatsapp: 'WhatsApp', telefono: 'Teléfono', panel: 'Panel',
  bolsa_wtransnet: 'Bolsa · Wtransnet', bolsa_teleroute: 'Bolsa · Teleroute', bolsa_otra: 'Bolsa · otra',
};
export const ESTADO_OFERTA: Record<string, [string, string]> = {
  activa: ['Activa', 'green'], aceptada: ['Aceptada', 'green'], caducada: ['Caducada', 'gray'], revocada: ['Retirada', 'red'], cerrada: ['Cerrada', 'gray'],
};
export const enlaceCmrUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/cmr/${token}`;
export const ROL_CMR: Record<string, string> = { remitente: 'Remitente (casilla 22)', transportista: 'Transportista (casilla 23)', destinatario: 'Destinatario (casilla 24)' };
export const enlaceOferta = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/carga/${token}`;
// Mensaje listo para WhatsApp o email (como el "Ofrecer carga" del mockup): sin cliente
// ni direcciones exactas, solo poblaciones; el detalle lo ve al aceptar.
export function mensajeOferta(f: Ficha, precio: number, token: string): string {
  const e = f.envio;
  const pts = (t: string) => f.paradas.filter((p) => p.tipo === t).map((p) => `${p.poblacion ?? ''}${p.codigo_postal ? ` (${p.codigo_postal.slice(0, 2)})` : ''}`).join(' + ');
  return [
    `Envío disponible · Dynamo · #${e.referencia_gx}`,
    `${pts('carga')} → ${pts('descarga')}`,
    `Recogida: ${ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}`,
    [e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && `${pesoTn(e.toneladas)}`, tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora)].filter(Boolean).join(' · '),
    [e.requiere_plataforma_elevadora && 'Plataforma elevadora', e.requiere_nima && 'NIMA', e.adr && 'ADR'].filter(Boolean).join(' · '),
    `Precio: ${euros(precio)} (sin IVA)`,
    `Acéptala aquí: ${enlaceOferta(token)}`,
  ].filter(Boolean).join('\n');
}

export function Celda({ l, children, span }: { l: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1/-1' } : undefined}><label>{l}</label><span className="v">{children ?? '—'}</span></div>;
}
export const Pend = () => <span style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontWeight: 500 }}>Pendiente</span>;
export function Interruptor({ k, l, v, on }: { k: string; l: string; v: boolean; on: (b: boolean) => void }) {
  return (
    <div>
      <label>{l}</label>
      <label className="ptar-tramp-box">
        <input id={k} type="checkbox" className="ptar-switch-input" checked={v} onChange={(e) => on(e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
      </label>
    </div>
  );
}

export type Vista = 'ficha' | 'asignar' | 'estado' | 'cancelar' | 'modificar' | 'ofrecer' | 'orden';

export type SubProps = { ficha: Ficha; onVolver: () => void; trabajando: string | null;
  // El error de la última acción: los submodales (Asignar, Cancelar…) lo pintan DENTRO,
  // porque el aviso rojo de la ficha no se ve mientras el submodal está abierto.
  fallo?: string | null;
  hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, okTxt?: string) => Promise<boolean> };

// ---- Sección plegable del acordeón: cerrada enseña su RESUMEN en la misma línea -----
export function Secc({ k, titulo, resumen, extra, abiertas, toggle, children }: {
  k: string; titulo: React.ReactNode; resumen?: React.ReactNode; extra?: number;
  abiertas: Set<string>; toggle: (k: string) => void; children: React.ReactNode;
}) {
  const open = abiertas.has(k);
  return (
    <section className={`ficha-sec${open ? ' open' : ''}`}>
      <button type="button" className="ficha-sec-head" aria-expanded={open} onClick={() => toggle(k)}>
        <span className="fsh-chev" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
        <span className="fsh-t">{titulo}{extra != null ? ` (${extra})` : ''}</span>
        {!open && resumen ? <span className="fsh-sum">{resumen}</span> : null}
      </button>
      {open && <div className="ficha-sec-body">{children}</div>}
    </section>
  );
}
