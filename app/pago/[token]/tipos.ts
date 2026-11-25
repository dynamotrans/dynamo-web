// Lo que devuelve pago_publico(llave): lo mínimo de un envío pendiente de pago.
export type ParadaPago = { num: number; tipo: 'carga' | 'descarga'; codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais: string | null; prevista: string | null };
export type PagoPublicoDatos = {
  resultado: 'pendiente' | 'pagado' | 'anulado' | 'no_disponible' | 'enlace_no_valido' | 'mantenimiento' | 'error';
  referencia?: string; cliente?: string | null;
  base?: number; iva_pct?: number; total?: number; a_cuenta?: number; pendiente?: number;
  pago_limite?: string | null; avisado_en?: string | null;
  /** Solo en un anulado por no pagar: se acabó el plazo, o no nos consta la transferencia avisada. */
  motivo?: 'plazo' | 'transferencia';
  fecha_carga_desde?: string | null; fecha_carga_hasta?: string | null;
  metros_lineales?: number | null; toneladas?: number | null; descripcion_mercancia?: string | null; paletizado?: boolean | null;
  paradas?: ParadaPago[];
  transferencia?: { beneficiario: string | null; iban: string; banco: string | null; bic: string | null; concepto: string } | null;
};
