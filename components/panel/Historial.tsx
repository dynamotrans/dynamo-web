'use client';

// «Quién y cuándo»: el historial de cambios de un registro (de la auditoría). Plegado de
// entrada; al abrirlo se carga. Cada línea: fecha y hora, la acción y quién (nombre y email).
import { useState } from 'react';
import { creadoTxt } from '@/lib/envios';
import { historialDe, type EntradaHistorial } from '@/app/panel/historial';

const CAMPOS: Record<string, string> = {
  estado: 'estado', fecha_carga_desde: 'fecha de carga', fecha_carga_hasta: 'fin de la ventana de carga', fecha_carga_real: 'fecha de carga real',
  fecha_entrega_estimada: 'entrega prevista', referencia_cliente: 'referencia', descripcion_mercancia: 'mercancía', metros_lineales: 'metros',
  toneladas: 'toneladas', tipo_carga: 'tipo de carga', importe_cliente: 'precio', importe_transportista: 'precio del transportista',
  anotaciones_cliente: 'anotaciones', matricula_camion: 'matrícula del camión', matricula_remolque: 'matrícula del remolque',
  conductor_nombre: 'conductor', conductor_telefono: 'teléfono del conductor', transportista_id: 'transportista', solicitud_estado: 'solicitud',
  pago_previo: 'pago previo', cambio_cliente_estado: 'cambio pedido', numero_bultos: 'bultos', embalaje: 'embalaje', volumen_m3: 'volumen',
  titulo: 'título', detalle: 'detalle', prioridad: 'prioridad', resolucion: 'resolución', nombre_empresa: 'nombre', direccion: 'dirección',
  codigo_postal: 'código postal', poblacion: 'población', provincia: 'provincia', horarios: 'horario', anotaciones: 'notas',
  razon_social: 'razón social', telefono: 'teléfono', email: 'email', persona_contacto: 'contacto', fecha_entrada: 'entrada', fecha_salida: 'salida',
  num_trailers: 'tráileres', num_repartos: 'repartos', pagado_en: 'pago', borrado: 'borrado', precio_fijado_a_mano: 'precio a mano',
};
const ESTADOS: Record<string, string> = { borrador: 'borrador', programado: 'programado', hacia_la_carga: 'hacia la carga', cargando: 'cargando',
  en_ruta: 'en ruta', entregado: 'entregado', cancelado: 'cancelado', abierto: 'abierta', en_curso: 'en curso', resuelto: 'resuelta', cerrado: 'cerrada' };
const valor = (v: unknown) => v === null || v === undefined || v === '' ? 'vacío' : typeof v === 'boolean' ? (v ? 'sí' : 'no')
  : typeof v === 'string' && ESTADOS[v] ? ESTADOS[v] : typeof v === 'object' ? '…' : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v);

function accion(h: EntradaHistorial): React.ReactNode {
  if (h.accion === 'alta') return <strong>Creado</strong>;
  if (h.accion === 'baja') return <strong>Borrado</strong>;
  const est = h.cambios?.estado;
  if (est && (est.despues === 'cancelado' || est.despues === 'cancelada')) return <strong style={{ color: '#b42318' }}>Cancelado</strong>;
  const partes = h.campos.map((k) => {
    const c = h.cambios?.[k];
    const n = CAMPOS[k] ?? k.replace(/_/g, ' ');
    return c && typeof c.despues !== 'object' ? `${n}: ${valor(c.antes)} → ${valor(c.despues)}` : n;
  });
  return <><strong>Modificado</strong> · {partes.join(' · ')}</>;
}

export default function Historial({ tabla, id }: { tabla: Parameters<typeof historialDe>[0]; id: string }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<EntradaHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function abrir() {
    setAbierto((v) => !v);
    if (filas || abierto) return;
    const r = await historialDe(tabla, id);
    if (r.ok) setFilas(r.filas); else setError(r.error);
  }
  return (
    <div style={{ marginTop: '0.9rem' }}>
      <button type="button" className="btn-ghost" onClick={abrir} aria-expanded={abierto} style={{ padding: '0.35rem 0.8rem' }}>
        {abierto ? '▾' : '▸'} Quién y cuándo (historial de cambios)
      </button>
      {abierto && (
        <div className="pen-envio-sum" style={{ marginTop: '0.5rem' }}>
          {error && <div className="pen-sum-row"><span className="k" style={{ color: 'var(--red)' }}>{error}</span><span className="v" /></div>}
          {!error && !filas && <div className="pen-sum-row"><span className="k">Cargando…</span><span className="v" /></div>}
          {filas?.length === 0 && <div className="pen-sum-row"><span className="k">Sin cambios registrados</span><span className="v" /></div>}
          {filas?.map((h, i) => (
            <div key={i} className="pen-sum-row" style={{ alignItems: 'flex-start' }}>
              <span className="k" style={{ whiteSpace: 'nowrap' }}>{creadoTxt(h.cuando)}</span>
              <span className="v" style={{ textAlign: 'right' }}>
                {accion(h)}
                <div style={{ color: 'var(--gray-500)', fontWeight: 500 }}>{h.quien_nombre}{h.quien_email && h.quien_email !== h.quien_nombre ? ` · ${h.quien_email}` : ''}</div>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
