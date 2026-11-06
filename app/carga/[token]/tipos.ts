// Lo que devuelven las funciones públicas de la bolsa (oferta_publica, carga_aceptada_publica):
// JSON de la base de datos, sin tipos generados. Aquí, los campos que usa la página.
type Num = number | string | null;

export type ParadaPublica = {
  orden: number; tipo: 'carga' | 'descarga'; codigo_postal: string | null; poblacion: string | null; provincia: string | null;
  pais_codigo_iso: string | null; tipo_sitio: string | null; horarios: string | null; requiere_cita: boolean; tiene_medios_carga: boolean;
  // Solo en la carga aceptada:
  nombre_empresa?: string | null; direccion?: string | null; referencia?: string | null; anotaciones?: string | null;
  notas_sitio?: string | null; url_google_maps?: string | null; contacto?: { nombre: string | null; telefono: string | null } | null;
};

// Datos del envío (los comparten la oferta y la carga ya aceptada).
type EnvioPublico = {
  referencia?: string | null; tipo_carga?: string | null; paradas?: ParadaPublica[];
  precio?: Num; metros_lineales?: Num; toneladas?: Num;
  fecha_carga_desde?: string | null; fecha_carga_hasta?: string | null; fecha_entrega_estimada?: string | null;
  descripcion_mercancia?: string | null; paletizado?: boolean | null;
  carga_lateral?: boolean | null; carga_trasera?: boolean | null; carga_techo?: boolean | null;
  adr?: boolean | null; requiere_nima?: boolean | null; requiere_plataforma_elevadora?: boolean | null;
  pronto_pago?: boolean | null; pronto_pago_pct?: Num; pronto_pago_minimo?: Num; pronto_pago_dias?: Num; plazo_pago_dias?: Num;
};

export type OfertaPublica = EnvioPublico & {
  resultado?: string; disponible?: boolean; en_tramite?: boolean; reserva_minutos?: Num; motivo?: string | null;
  para_transportista?: string | null; asignada_en?: string | null; banda_euros?: Num;
};

export type ReservaPublica = EnvioPublico & {
  resultado?: string; estado?: string | null; precio_propuesto?: Num; hasta?: string; ahora?: string;
  // Carga aceptada:
  token?: string | null; transportista?: string | null; aceptada_en?: string | null; discrecion_comercial?: boolean | null;
  matricula_camion?: string | null; matricula_remolque?: string | null; conductor_nombre?: string | null; conductor_telefono?: string | null;
};
