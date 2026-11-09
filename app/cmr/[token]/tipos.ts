// Lo que devuelve cmr_publico (JSON de la base de datos, sin tipos generados) más lo que
// añade la página: los campos que usa el CMR digital.
type Num = number | string | null;

export type ParadaCmr = {
  id: string; tipo: 'carga' | 'descarga'; nombre_empresa?: string | null; codigo_postal?: string | null;
  poblacion?: string | null; provincia?: string | null; contacto?: string | null; email?: string | null;
};
export type FirmaCmr = {
  rol: string; parada_id: string | null; ruta: string; nombre: string; documento: string;
  documento_pais?: string | null; firmado_en: string; extra?: boolean;
};
export type ReservaCmr = { rol: string; parada_id: string | null; texto: string };

export type CmrPublico = {
  resultado?: string; manual?: boolean; html?: string | null; referencia?: string | null;
  remitente?: string | null; porteador?: string | null; transportista?: string | null;
  transportista_email?: string | null; matricula?: string | null;
  conductor?: string | null; fecha_carga?: string | null; mercancia?: string | null;
  metros_lineales?: Num; toneladas?: Num; adr?: boolean | null;
  paradas?: ParadaCmr[]; firmas?: FirmaCmr[]; reservas?: ReservaCmr[];
};
