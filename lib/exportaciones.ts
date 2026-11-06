// Ficheros de exportación (solo Dynamo): las vistas de la migración 20261103020000, con
// sus columnas EXACTAS (las de las plantillas del Sheet del usuario).
export type Fichero = 'venta' | 'compra' | 'bolsa';
export type FilaExport = Record<string, string | number | null>;

export const FICHEROS: Record<Fichero, {
  vista: 'v_holded_pedido_venta' | 'v_holded_pedido_compra' | 'v_wtransnet'; titulo: string; sub: string; archivo: string; ref: string; fecha: string;
  marcar: string; marcado: string; desmarcar: string;
  columnas: [string, string][];   // [columna del fichero, título en la tabla de la pantalla]
}> = {
  venta: {
    vista: 'v_holded_pedido_venta', titulo: 'Pedidos de venta', sub: 'Holded · a clientes', archivo: 'Holded-pedidos-venta',
    ref: 'Num Pedido (referencia_gx_carga)', fecha: 'Fecha dd/mm/yyyy',
    marcar: 'Marcar como pasados a Holded', marcado: 'pasados a Holded', desmarcar: 'Volver a pendientes',
    columnas: [['Num Pedido (referencia_gx_carga)', 'Pedido'], ['Fecha dd/mm/yyyy', 'Fecha'], ['Nombre del contacto', 'Cliente'],
      ['Concepto', 'Concepto'], ['Descripción del producto', 'Descripción'], ['Precio unidad', 'Importe (sin IVA)'], ['ESTADO VIAJE', 'Estado'], ['ALB REC?', 'Albarán'], ['FACTURADO?', 'Facturado']],
  },
  compra: {
    vista: 'v_holded_pedido_compra', titulo: 'Pedidos de compra', sub: 'Holded · a transportistas', archivo: 'Holded-pedidos-compra',
    ref: 'Num Pedido (referencia_gx_carga)', fecha: 'Fecha dd/mm/yyyy',
    marcar: 'Marcar como pasados a Holded', marcado: 'pasados a Holded', desmarcar: 'Volver a pendientes',
    columnas: [['Num Pedido (referencia_gx_carga)', 'Pedido'], ['Fecha dd/mm/yyyy', 'Fecha'], ['Nombre del contacto', 'Transportista'],
      ['Concepto', 'Concepto'], ['Descripción del producto', 'Descripción'], ['Precio unidad', 'Importe (sin IVA)'], ['ESTADO VIAJE', 'Estado'], ['ALB REC?', 'Albarán'], ['FACTURADO?', 'Factura recibida']],
  },
  bolsa: {
    vista: 'v_wtransnet', titulo: 'Bolsa de carga', sub: 'Wtransnet · sin transportista', archivo: 'Wtransnet',
    ref: 'REF.', fecha: 'Fecha disponibilidad',
    marcar: 'Marcar como publicados en la bolsa', marcado: 'publicados en la bolsa', desmarcar: 'Volver a pendientes',
    columnas: [['REF.', 'Envío'], ['Fecha disponibilidad', 'Fecha'], ['Localidad origen', 'Origen'], ['Localidad destino', 'Destino'],
      ['Tipo Bolsa', 'Tipo'], ['Tipo Vehiculo', 'Vehículo'], ['Peso', 'Peso (kg)'], ['Largo', 'Metros'], ['Precio', 'Precio (sin IVA)']],
  },
};

const IMPORTES = new Set(['Precio unidad', 'Precio']);
export const esImporte = (col: string) => IMPORTES.has(col);

// CSV que abre bien el Excel en español: BOM, ';' de separador y coma decimal.
export function aCsv(columnas: string[], filas: FilaExport[]): string {
  const celda = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columnas.map(celda).join(';'), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(';'))].join('\r\n');
}

// "dd/mm/yyyy" → "yyyy-mm" (para filtrar por mes).
export const mesDe = (s: unknown) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '')); return m ? `${m[3]}-${m[2]}` : ''; };
