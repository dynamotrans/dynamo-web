import { mensajeError } from '@/lib/mensajeError';
import type { SB } from '@/lib/supabase/cliente';
import type { Tabla } from '@/lib/supabase/tipos';
import { paisDe } from '@/lib/paises';
import { CONTACTO } from '@/lib/atencion';

// Todo lo que necesitan la orden de carga y el CMR de un envío, leído en el servidor
// con la sesión de quien lo pide (Dynamo: las tablas; los permisos por fila deciden).

export type Empresa = {
  nombre: string; razon_social: string; cif: string | null; codigo?: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais: string | null;
  telefono: string | null; email: string | null; contacto?: string | null;
};
export type ParadaDoc = {
  id: string; orden: number; tipo: 'carga' | 'descarga';
  nombre_empresa: string | null; direccion: string | null; codigo_postal: string | null; poblacion: string | null;
  provincia: string | null; pais: string | null; referencia: string | null; anotaciones: string | null;
  horarios: string | null; url_google_maps: string | null; notas_sitio: string | null; tipo_sitio: string | null;
  requiere_cita: boolean; tiene_medios_carga: boolean;
  contacto: { nombre: string | null; telefono: string | null } | null;
};
// El envío tal como lo usan los PDF: la fila de envios (o el JSON de las funciones de
// orden, con los mismos nombres) más lo que se le junta.
export type EnvioDoc = Tabla<'envios'> & { plazo_pago_transportista?: number | null; transportista_nima?: string | null };
export type DatosDoc = {
  envio: EnvioDoc;
  manual: boolean;                       // envío con el operador del cliente: SIN mención a Dynamo
  cliente: Empresa | null;
  porteador: Empresa | null;             // transportista asignado (Dynamo) u operador del cliente (manual)
  paradas: ParadaDoc[];
  pronto_pago: boolean;
  gestor: { nombre: string; telefono: string | null; email: string | null } | null;
  firmas?: FirmaDoc[];                   // CMR digital (solo para el CMR)
  reservas?: { rol: string; texto: string }[];   // reservas anotadas al firmar el CMR (casilla 18)
  logoPorteador?: Uint8Array | null;     // envío manual: el logo del operador del cliente (si lo subió)
  dynamo?: DatosDynamo;                  // los datos fijos de Dynamo (de Parámetros)
};

// El logo del operador de un envío manual (último subido, del almacén privado).
export async function cargarLogoOperador(sb: SB, operadorId: string | null | undefined): Promise<Uint8Array | null> {
  if (!operadorId) return null;
  const { data } = await sb.from('documentos').select('storage_ruta').eq('operador_id', operadorId).eq('tipo', 'logo').eq('borrado', false)
    .order('creado_en', { ascending: false }).limit(1).maybeSingle<{ storage_ruta: string }>();
  if (!data) return null;
  const { data: blob } = await sb.storage.from('documentos').download(data.storage_ruta);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
export type FirmaDoc = { rol: string; parada_id: string | null; nombre: string; documento: string; firmado_en: string; png: Uint8Array | null };

// Las firmas del CMR digital con su trazo (del almacén privado; los permisos los pone la
// base de datos). El documento va ENMASCARADO: el CMR lo reciben varias empresas.
export async function cargarFirmasCmr(sb: SB, envioId: string): Promise<FirmaDoc[]> {
  const { data } = await sb.rpc('firmas_envio', { p_envio: envioId });
  return Promise.all((data ?? []).map(async (f) => {
    const { data: blob } = await sb.storage.from('documentos').download(f.firma_storage_ruta);
    return { rol: f.rol, parada_id: f.parada_id, nombre: f.nombre, documento: `•••${String(f.documento).replace(/^•+/, '').slice(-4)}`, firmado_en: f.firmado_en,
      png: blob ? new Uint8Array(await blob.arrayBuffer()) : null };
  }));
}

// Datos fijos de Dynamo (los mismos que la orden de carga que se manda hoy por email).
// Los buenos viven en Parámetros (claves dynamo_*): esto es solo el respaldo si la base
// de datos no responde.
export const DYNAMO = {
  razon_social: 'Dynamo Operador Logístico, S.L.',
  cif: 'ESB01596360',
  direccion: 'Paseo de las Delicias 1, planta 5ª', codigo_postal: '41001', poblacion: 'Sevilla', pais: 'España',
  email: `${CONTACTO.email}`, telefono: `${CONTACTO.telefono}`, movil: `${CONTACTO.whatsapp}`,
  wtransnet: '267017', tarjeta_ot: '12548918-1', web: 'www.dynamotrans.com',
  iban: '', banco: 'Banco Santander', bic: 'BSCHESMM',
};
export type DatosDynamo = typeof DYNAMO;
export async function datosDynamo(sb: SB): Promise<DatosDynamo> {
  const { data } = await sb.rpc('datos_dynamo');
  const j = (data ?? {}) as Record<string, string>;
  const o: Record<string, string> = { ...DYNAMO };
  Object.keys(DYNAMO).forEach((k) => { if (j[k]) o[k] = j[k]; });
  return o as DatosDynamo;
}


export const nombrePais = (c: string | null | undefined) => (c ? paisDe(c.trim().toUpperCase()) : null);

type EmpresaFila = Pick<Tabla<'clientes'>, 'id' | 'razon_social' | 'nombre_visible' | 'cif' | 'direccion' | 'codigo_postal' | 'poblacion' | 'provincia' | 'pais_codigo_iso'>;
type FilaEnvioDoc = Tabla<'envios'> & {
  clientes: EmpresaFila | null;
  transportistas: (EmpresaFila & Pick<Tabla<'transportistas'>, 'codigo' | 'plazo_pago_dias'>) | null;
  operadores: Pick<Tabla<'operadores'>, 'razon_social' | 'cif' | 'telefono' | 'email' | 'persona_contacto'> | null;
};
type FilaParadaDoc = Pick<Tabla<'envio_paradas'>, 'id' | 'orden' | 'tipo' | 'sitio_id' | 'nombre_empresa' | 'direccion' | 'codigo_postal' | 'poblacion' | 'provincia' | 'pais_codigo_iso' | 'referencia' | 'anotaciones'>
  & { sitios: Pick<Tabla<'sitios'>, 'tipo' | 'horarios' | 'anotaciones' | 'url_google_maps' | 'requiere_cita' | 'tiene_medios_carga'> | null };
type ContactoDoc = Pick<Tabla<'contactos'>, 'cliente_id' | 'transportista_id' | 'sitio_id' | 'nombre' | 'telefono' | 'email' | 'funcion' | 'es_principal'>;

export async function cargarDatosDoc(sb: SB, id: string, usuarioId: string): Promise<{ datos: DatosDoc | null; error: string | null }> {
  const { data: e, error } = await sb.from('envios')
    .select('*, clientes(id, razon_social, nombre_visible, cif, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso), ' +
      'transportistas(id, codigo, razon_social, nombre_visible, cif, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, plazo_pago_dias), ' +
      'operadores(razon_social, cif, telefono, email, persona_contacto)')
    .eq('id', id).maybeSingle<FilaEnvioDoc>();
  if (error) return { datos: null, error: mensajeError(error.message) };
  if (!e) return { datos: null, error: 'Ese envío no existe.' };

  const [par, ctos, res, yo] = await Promise.all([
    sb.from('envio_paradas').select('id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia, anotaciones, ' +
      'sitios(tipo, horarios, anotaciones, url_google_maps, requiere_cita, tiene_medios_carga)').eq('envio_id', id).order('orden').overrideTypes<FilaParadaDoc[], { merge: false }>(),
    sb.from('contactos').select('cliente_id, transportista_id, sitio_id, nombre, telefono, email, funcion, es_principal')
      .or([`cliente_id.eq.${e.cliente_id}`, e.transportista_id ? `transportista_id.eq.${e.transportista_id}` : null].filter(Boolean).join(','))
      .order('es_principal', { ascending: false }).limit(200).overrideTypes<ContactoDoc[], { merge: false }>(),
    e.transportista_id
      ? sb.from('envio_reservas').select('pronto_pago').eq('envio_id', id).eq('transportista_id', e.transportista_id).eq('estado', 'aceptada')
          .order('cerrada_en', { ascending: false }).limit(1).maybeSingle<{ pronto_pago: boolean | null }>()
      : Promise.resolve({ data: null }),
    sb.from('usuarios').select('nombre, email, telefono').eq('id', usuarioId).maybeSingle<{ nombre: string | null; email: string; telefono: string | null }>(),
  ]);

  const sitioIds = (par.data ?? []).map((p) => p.sitio_id).filter(Boolean) as string[];
  const contactoSitio = new Map<string, { sitio_id: string | null; nombre: string | null; telefono: string | null }>();
  if (sitioIds.length) {
    const { data } = await sb.from('contactos').select('sitio_id, nombre, telefono').in('sitio_id', sitioIds).eq('es_principal', true);
    (data ?? []).forEach((c) => contactoSitio.set(c.sitio_id as string, c));
  }
  const contactos = ctos.data ?? [];
  // Del cliente: el de tráfico principal, y si no, el principal de cualquier función.
  const de = (campo: 'cliente_id' | 'transportista_id', valor: string | null) => {
    const suyos = contactos.filter((c) => valor && c[campo] === valor);
    return suyos.find((c) => c.funcion === 'trafico' && c.es_principal) ?? suyos.find((c) => c.funcion === 'trafico') ?? suyos.find((c) => c.es_principal) ?? suyos[0] ?? null;
  };

  const c = e.clientes, t = e.transportistas, o = e.operadores;
  const ctoCli = de('cliente_id', e.cliente_id);
  const cliente: Empresa | null = c ? {
    nombre: c.nombre_visible || c.razon_social, razon_social: c.razon_social, cif: c.cif,
    direccion: c.direccion, codigo_postal: c.codigo_postal, poblacion: c.poblacion, provincia: c.provincia, pais: nombrePais(c.pais_codigo_iso),
    telefono: ctoCli?.telefono ?? null, email: ctoCli?.email ?? null, contacto: ctoCli?.nombre ?? null,
  } : null;

  let porteador: Empresa | null = null;
  if (e.es_manual && o) {
    porteador = { nombre: o.razon_social, razon_social: o.razon_social, cif: o.cif, direccion: null, codigo_postal: null, poblacion: null,
      provincia: null, pais: null, telefono: o.telefono, email: o.email, contacto: o.persona_contacto };
  } else if (t) {
    const ctoT = de('transportista_id', e.transportista_id);
    porteador = { nombre: t.nombre_visible || t.razon_social, razon_social: t.razon_social, cif: t.cif, codigo: t.codigo,
      direccion: t.direccion, codigo_postal: t.codigo_postal, poblacion: t.poblacion, provincia: t.provincia, pais: nombrePais(t.pais_codigo_iso),
      telefono: ctoT?.telefono ?? null, email: ctoT?.email ?? null, contacto: ctoT?.nombre ?? null };
  }

  return {
    error: null,
    datos: {
      envio: { ...e, plazo_pago_transportista: t?.plazo_pago_dias ?? null },
      manual: !!e.es_manual,
      cliente, porteador,
      paradas: (par.data ?? []).map((p) => ({
        id: p.id, orden: p.orden, tipo: p.tipo as ParadaDoc['tipo'], nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.sitios?.horarios ?? null, url_google_maps: p.sitios?.url_google_maps ?? null, notas_sitio: p.sitios?.anotaciones ?? null,
        tipo_sitio: p.sitios?.tipo ?? null, requiere_cita: !!p.sitios?.requiere_cita, tiene_medios_carga: p.sitios?.tiene_medios_carga !== false,
        contacto: p.sitio_id ? contactoSitio.get(p.sitio_id) ?? null : null,
      })),
      pronto_pago: !!res.data?.pronto_pago,
      gestor: yo.data ? { nombre: yo.data.nombre || yo.data.email, telefono: yo.data.telefono, email: yo.data.email } : null,
    },
  };
}

// La orden de carga para el TRANSPORTISTA, desde datos_orden_transportista() (solo su
// viaje, sin el cliente de Dynamo). Mismo formato que cargarDatosDoc.
export async function cargarDatosDocTransportista(sb: SB, id: string):
  Promise<{ datos: DatosDoc | null; parametros: Record<string, number>; error: string | null }> {
  const { data, error } = await sb.rpc('datos_orden_transportista', { p_envio: id });
  if (error || !data) return { datos: null, parametros: {}, error: error?.message ?? 'No se ha podido leer el envío.' };
  return { error: null, ...ordenDesdeJson(data) };
}

// Lo mismo desde el enlace público /carga/<enlace>, sin cuenta: la llave es la reserva
// aceptada (cookie de esa página). Trae también los datos fijos de Dynamo.
export async function cargarDatosDocPublica(sb: SB, reserva: string):
  Promise<{ datos: DatosDoc | null; parametros: Record<string, number>; error: string | null }> {
  const { data, error } = await sb.rpc('datos_orden_publica', { p_reserva: reserva });
  if (error || !data) return { datos: null, parametros: {}, error: error?.message ?? 'No se ha podido leer el envío.' };
  return { error: null, ...ordenDesdeJson(data) };
}

// El JSON de datos_orden_*(): mismos nombres que las tablas.
type EmpresaJson = { nombre: string; razon_social: string; cif: string | null; codigo?: string | null; direccion: string | null;
  codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null;
  telefono?: string | null; email?: string | null; contacto?: string | null };
type ParadaJson = Omit<ParadaDoc, 'pais' | 'tipo_sitio' | 'contacto' | 'requiere_cita' | 'tiene_medios_carga'> & {
  pais_codigo_iso: string | null; requiere_cita?: boolean | null; tiene_medios_carga?: boolean | null;
  contacto_nombre?: string | null; contacto_telefono?: string | null };
type OrdenJson = { envio: EnvioDoc; porteador?: EmpresaJson; cliente?: EmpresaJson; paradas?: ParadaJson[];
  parametros?: Record<string, unknown>; dynamo?: Record<string, unknown>; pronto_pago?: boolean };

function ordenDesdeJson(data: unknown): { datos: DatosDoc; parametros: Record<string, number> } {
  const j = data as OrdenJson, t = j.porteador ?? ({} as EmpresaJson);
  const parametros: Record<string, number> = {};
  Object.entries(j.parametros ?? {}).forEach(([k, v]) => { parametros[k] = Number(v); });
  let dynamo: DatosDynamo | undefined;
  if (j.dynamo) {
    const o: Record<string, string> = { ...DYNAMO };
    Object.keys(DYNAMO).forEach((k) => { if (j.dynamo?.[k]) o[k] = String(j.dynamo[k]); });
    dynamo = o as DatosDynamo;
  }
  return {
    parametros,
    datos: {
      envio: j.envio, manual: false, cliente: null, dynamo,
      porteador: { nombre: t.nombre, razon_social: t.razon_social, cif: t.cif, codigo: t.codigo, direccion: t.direccion,
        codigo_postal: t.codigo_postal, poblacion: t.poblacion, provincia: t.provincia, pais: nombrePais(t.pais_codigo_iso),
        telefono: t.telefono ?? null, email: t.email ?? null, contacto: t.contacto ?? null },
      paradas: (j.paradas ?? []).map((p) => ({
        id: p.id, orden: p.orden, tipo: p.tipo, nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.horarios ?? null, url_google_maps: p.url_google_maps ?? null, notas_sitio: p.notas_sitio ?? null, tipo_sitio: null,
        requiere_cita: !!p.requiere_cita, tiene_medios_carga: p.tiene_medios_carga !== false,
        contacto: p.contacto_telefono || p.contacto_nombre ? { nombre: p.contacto_nombre ?? null, telefono: p.contacto_telefono ?? null } : null,
      })),
      pronto_pago: !!j.pronto_pago,
      gestor: null,
    },
  };
}

// La orden de carga de un envío MANUAL, para el CLIENTE (datos_orden_manual(): su
// empresa, su operador y las paradas; nada de Dynamo).
export async function cargarDatosDocManual(sb: SB, id: string): Promise<{ datos: DatosDoc | null; error: string | null }> {
  const { data, error } = await sb.rpc('datos_orden_manual', { p_envio: id });
  if (error || !data) return { datos: null, error: error?.message ?? 'No se ha podido leer el envío.' };
  const j = data as OrdenJson, c = j.cliente ?? ({} as EmpresaJson), o = j.porteador ?? ({} as EmpresaJson);
  return {
    error: null,
    datos: {
      envio: j.envio, manual: true,
      cliente: { nombre: c.nombre, razon_social: c.razon_social, cif: c.cif, direccion: c.direccion, codigo_postal: c.codigo_postal,
        poblacion: c.poblacion, provincia: c.provincia, pais: nombrePais(c.pais_codigo_iso), telefono: c.telefono ?? null, email: c.email ?? null, contacto: c.contacto ?? null },
      porteador: { nombre: o.nombre, razon_social: o.razon_social, cif: o.cif, direccion: null, codigo_postal: null, poblacion: null,
        provincia: null, pais: null, telefono: o.telefono ?? null, email: o.email ?? null, contacto: o.contacto ?? null },
      paradas: (j.paradas ?? []).map((p) => ({
        id: p.id, orden: p.orden, tipo: p.tipo, nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.horarios ?? null, url_google_maps: p.url_google_maps ?? null, notas_sitio: p.notas_sitio ?? null, tipo_sitio: null,
        requiere_cita: !!p.requiere_cita, tiene_medios_carga: p.tiene_medios_carga !== false,
        contacto: p.contacto_telefono || p.contacto_nombre ? { nombre: p.contacto_nombre ?? null, telefono: p.contacto_telefono ?? null } : null,
      })),
      pronto_pago: false, gestor: null,
    },
  };
}
