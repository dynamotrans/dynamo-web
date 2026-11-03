import type { SupabaseClient } from '@supabase/supabase-js';

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
  horarios: string | null; url_google_maps: string | null; notas_sitio: string | null; tipo_lugar: string | null;
  requiere_cita: boolean; tiene_medios_carga: boolean;
  contacto: { nombre: string | null; telefono: string | null } | null;
};
export type DatosDoc = {
  envio: any;
  manual: boolean;                       // envío con el operador del cliente: SIN mención a Dynamo
  cliente: Empresa | null;
  porteador: Empresa | null;             // transportista asignado (Dynamo) u operador del cliente (manual)
  paradas: ParadaDoc[];
  pronto_pago: boolean;
  gestor: { nombre: string; telefono: string | null; email: string | null } | null;
  firmas?: FirmaDoc[];                   // CMR digital (solo para el CMR)
  logoPorteador?: Uint8Array | null;     // envío manual: el logo del operador del cliente (si lo subió)
};

// El logo del operador de un envío manual (último subido, del almacén privado).
export async function cargarLogoOperador(sb: SupabaseClient, operadorId: string | null | undefined): Promise<Uint8Array | null> {
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
export async function cargarFirmasCmr(sb: SupabaseClient, envioId: string): Promise<FirmaDoc[]> {
  const { data } = await sb.from('firmas_cmr').select('rol, parada_id, nombre, documento, firmado_en, firma_storage_ruta').eq('envio_id', envioId).order('firmado_en');
  return Promise.all(((data ?? []) as any[]).map(async (f) => {
    const { data: blob } = await sb.storage.from('documentos').download(f.firma_storage_ruta);
    return { rol: f.rol, parada_id: f.parada_id, nombre: f.nombre, documento: `•••${String(f.documento).slice(-4)}`, firmado_en: f.firmado_en,
      png: blob ? new Uint8Array(await blob.arrayBuffer()) : null };
  }));
}

// Datos fijos de Dynamo (los mismos que la orden de carga que se manda hoy por email).
export const DYNAMO = {
  razon_social: 'Dynamo Operador Logístico, S.L.',
  cif: 'ESB01596360',
  direccion: 'Paseo de las Delicias 1, planta 5ª', codigo_postal: '41001', poblacion: 'Sevilla', pais: 'España',
  email: 'info@dynamotrans.com', telefono: '+34 955 225 945', movil: '+34 628 995 709',
  wtransnet: '267017', tarjeta_ot: '12548918-1', web: 'www.dynamotrans.com',
};

const PAISES: Record<string, string> = { ES: 'España', PT: 'Portugal', FR: 'Francia', DE: 'Alemania', IT: 'Italia', NL: 'Países Bajos',
  BE: 'Bélgica', LU: 'Luxemburgo', AT: 'Austria', PL: 'Polonia', CZ: 'República Checa', CH: 'Suiza', DK: 'Dinamarca', GB: 'Reino Unido' };
export const nombrePais = (c: string | null | undefined) => (c ? PAISES[c.trim().toUpperCase()] ?? c : null);

export async function cargarDatosDoc(sb: SupabaseClient, id: string, usuarioId: string): Promise<{ datos: DatosDoc | null; error: string | null }> {
  const { data: e, error } = await sb.from('envios')
    .select('*, clientes(id, razon_social, nombre_visible, cif, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso), ' +
      'transportistas(id, codigo, razon_social, nombre_visible, cif, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, plazo_pago_dias), ' +
      'operadores(razon_social, cif, telefono, email, persona_contacto)')
    .eq('id', id).maybeSingle<any>();
  if (error) return { datos: null, error: error.message };
  if (!e) return { datos: null, error: 'Ese envío no existe.' };

  const [par, ctos, res, yo] = await Promise.all([
    sb.from('envio_paradas').select('id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia, anotaciones, ' +
      'lugares(tipo, horarios, anotaciones, url_google_maps, requiere_cita, tiene_medios_carga)').eq('envio_id', id).order('orden'),
    sb.from('contactos').select('cliente_id, transportista_id, lugar_id, nombre, telefono, email, funcion, es_principal')
      .or([`cliente_id.eq.${e.cliente_id}`, e.transportista_id ? `transportista_id.eq.${e.transportista_id}` : null].filter(Boolean).join(','))
      .order('es_principal', { ascending: false }).limit(200),
    e.transportista_id
      ? sb.from('envio_reservas').select('pronto_pago').eq('envio_id', id).eq('transportista_id', e.transportista_id).eq('estado', 'aceptada')
          .order('cerrada_en', { ascending: false }).limit(1).maybeSingle<{ pronto_pago: boolean | null }>()
      : Promise.resolve({ data: null }),
    sb.from('usuarios').select('nombre, email, telefono').eq('id', usuarioId).maybeSingle<{ nombre: string | null; email: string; telefono: string | null }>(),
  ]);

  const lugarIds = (par.data ?? []).map((p: any) => p.lugar_id).filter(Boolean) as string[];
  const contactoLugar = new Map<string, any>();
  if (lugarIds.length) {
    const { data } = await sb.from('contactos').select('lugar_id, nombre, telefono').in('lugar_id', lugarIds).eq('es_principal', true);
    (data ?? []).forEach((c: any) => contactoLugar.set(c.lugar_id, c));
  }
  const contactos = (ctos.data ?? []) as any[];
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
      paradas: (par.data ?? []).map((p: any) => ({
        id: p.id, orden: p.orden, tipo: p.tipo, nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.lugares?.horarios ?? null, url_google_maps: p.lugares?.url_google_maps ?? null, notas_sitio: p.lugares?.anotaciones ?? null,
        tipo_lugar: p.lugares?.tipo ?? null, requiere_cita: !!p.lugares?.requiere_cita, tiene_medios_carga: p.lugares?.tiene_medios_carga !== false,
        contacto: p.lugar_id ? contactoLugar.get(p.lugar_id) ?? null : null,
      })),
      pronto_pago: !!(res.data as any)?.pronto_pago,
      gestor: yo.data ? { nombre: yo.data.nombre || yo.data.email, telefono: yo.data.telefono, email: yo.data.email } : null,
    },
  };
}

// La orden de carga para el TRANSPORTISTA, desde datos_orden_transportista() (solo su
// viaje, sin el cliente de Dynamo). Mismo formato que cargarDatosDoc.
export async function cargarDatosDocTransportista(sb: SupabaseClient, id: string):
  Promise<{ datos: DatosDoc | null; parametros: Record<string, number>; error: string | null }> {
  const { data, error } = await sb.rpc('datos_orden_transportista', { p_envio: id });
  if (error || !data) return { datos: null, parametros: {}, error: error?.message ?? 'No se ha podido leer el viaje.' };
  const j = data as any, t = j.porteador ?? {};
  const parametros: Record<string, number> = {};
  Object.entries(j.parametros ?? {}).forEach(([k, v]) => { parametros[k] = Number(v); });
  return {
    error: null, parametros,
    datos: {
      envio: j.envio, manual: false, cliente: null,
      porteador: { nombre: t.nombre, razon_social: t.razon_social, cif: t.cif, codigo: t.codigo, direccion: t.direccion,
        codigo_postal: t.codigo_postal, poblacion: t.poblacion, provincia: t.provincia, pais: nombrePais(t.pais_codigo_iso),
        telefono: t.telefono ?? null, email: t.email ?? null, contacto: t.contacto ?? null },
      paradas: ((j.paradas ?? []) as any[]).map((p) => ({
        id: p.id, orden: p.orden, tipo: p.tipo, nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.horarios ?? null, url_google_maps: p.url_google_maps ?? null, notas_sitio: p.notas_sitio ?? null, tipo_lugar: null,
        requiere_cita: !!p.requiere_cita, tiene_medios_carga: p.tiene_medios_carga !== false,
        contacto: p.contacto_telefono || p.contacto_nombre ? { nombre: p.contacto_nombre ?? null, telefono: p.contacto_telefono ?? null } : null,
      })),
      pronto_pago: !!j.pronto_pago,
      gestor: null,
    },
  };
}

// La orden de transporte de un envío MANUAL, para el CLIENTE (datos_orden_manual(): su
// empresa, su operador y las paradas; nada de Dynamo).
export async function cargarDatosDocManual(sb: SupabaseClient, id: string): Promise<{ datos: DatosDoc | null; error: string | null }> {
  const { data, error } = await sb.rpc('datos_orden_manual', { p_envio: id });
  if (error || !data) return { datos: null, error: error?.message ?? 'No se ha podido leer el envío.' };
  const j = data as any, c = j.cliente ?? {}, o = j.porteador ?? {};
  return {
    error: null,
    datos: {
      envio: j.envio, manual: true,
      cliente: { nombre: c.nombre, razon_social: c.razon_social, cif: c.cif, direccion: c.direccion, codigo_postal: c.codigo_postal,
        poblacion: c.poblacion, provincia: c.provincia, pais: nombrePais(c.pais_codigo_iso), telefono: c.telefono ?? null, email: c.email ?? null, contacto: c.contacto ?? null },
      porteador: { nombre: o.nombre, razon_social: o.razon_social, cif: o.cif, direccion: null, codigo_postal: null, poblacion: null,
        provincia: null, pais: null, telefono: o.telefono ?? null, email: o.email ?? null, contacto: o.contacto ?? null },
      paradas: ((j.paradas ?? []) as any[]).map((p) => ({
        id: p.id, orden: p.orden, tipo: p.tipo, nombre_empresa: p.nombre_empresa, direccion: p.direccion, codigo_postal: p.codigo_postal,
        poblacion: p.poblacion, provincia: p.provincia, pais: nombrePais(p.pais_codigo_iso), referencia: p.referencia, anotaciones: p.anotaciones,
        horarios: p.horarios ?? null, url_google_maps: p.url_google_maps ?? null, notas_sitio: p.notas_sitio ?? null, tipo_lugar: null,
        requiere_cita: !!p.requiere_cita, tiene_medios_carga: p.tiene_medios_carga !== false,
        contacto: p.contacto_telefono || p.contacto_nombre ? { nombre: p.contacto_nombre ?? null, telefono: p.contacto_telefono ?? null } : null,
      })),
      pronto_pago: false, gestor: null,
    },
  };
}
