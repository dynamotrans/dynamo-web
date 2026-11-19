// Firmas del CMR registradas «en papel» SIN teclear quién firmó (usuario, 2026-11-19): el
// nombre y el documento constan en el papel anexo. En la base de datos queda el nombre de
// la parte (la empresa del sitio o el transportista) y, como documento, esta marca.
export const DOC_EN_PAPEL = 'EN PAPEL';

/** «Nombre · documento» de una firma; en las de papel sin datos, solo la parte. */
export const quienFirmo = (f: { nombre: string; documento: string }): string =>
  f.documento === DOC_EN_PAPEL ? f.nombre : `${f.nombre} · ${f.documento}`;
