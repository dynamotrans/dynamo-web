'use server';

import { mensajeError } from '@/lib/mensajeError';
import { esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { validarHorario, tramosDe, MMDD, type GrupoHorario, type Verano } from '@/lib/horarios';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { gestorOCliente, soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type SitioDatos = {
  cliente_id: string; nombre_empresa: string; tipo: string;
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  horario: GrupoHorario[];        // obligatorio (tabla sitio_horarios, temporada general)
  verano?: Verano;                // horario de verano (opcional; temporada verano)
  url_google_maps: string; anotaciones: string;
  requiere_cita: boolean; tiene_medios_carga: boolean;
  contactos: ContactoDatos[];     // personas (tabla contactos, una o varias)
  emails_avisos: string;          // uno o varios, separados por comas (sitios.emails_avisos)
  // Solo en los almacenes de Dynamo (catálogo interno): disponibilidad y tarifa propia.
  almacen?: { disponible: boolean; precio_almacenamiento_semana: number | null; precio_reparto: number | null };
};
type Res = { ok: true; id: string } | { ok: false; error: string; duplicado?: { id: string; nombre: string } };

function traducir(msg: string): string {
  if (/contactos_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/contactos_email_check/i.test(msg)) return 'Hay un email que no es válido.';
  if (/ck_sitios_dueno/i.test(msg)) return 'Elige de qué cliente es el sitio.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const vacio = (s: string) => (s ?? '').trim() || null;
// Mismo criterio que el índice de posibles duplicados de la base de datos.
const clave = (s: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const puede = gestorOCliente;

// Buscador de clientes de la agenda de Sitios (filtro y ficha nueva; solo Dynamo): los 12
// que mejor casan con lo escrito, más el ya elegido (`incluir`).
export type ClienteOpcion = { id: string; nombre: string; cif: string; principal_id: string | null; estado: string; iva_pct?: number | null };
export async function buscarClientes(q: string, incluir: string | null = null): Promise<ClienteOpcion[]> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#buscarClientes", [q, incluir]);
  const s = await soloGestor();
  if (!s) return [];
  const { data } = await s.supabase.rpc('buscar_clientes', { p_q: (q ?? '').slice(0, 200), p_limite: 12, p_incluir: incluir && /^[0-9a-f-]{36}$/i.test(incluir) ? incluir : null });
  return (data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, cif: x.cif, principal_id: x.principal_id, estado: x.estado, iva_pct: x.iva_pct == null ? null : Number(x.iva_pct) }));
}

export async function guardarSitio(id: string | null, d: SitioDatos, aunqueParezcaRepetido = false): Promise<Res> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#guardarSitio", [id, d, aunqueParezcaRepetido]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso para gestionar sitios.' };
  const esAlmacen = !!d.almacen;
  if (esAlmacen && !esGestor(s.perfil!.rol)) return { ok: false, error: 'Los almacenes Dynamo solo los gestiona Dynamo.' };
  if (!esAlmacen && !d.cliente_id) return { ok: false, error: 'Elige de qué cliente es el sitio.' };
  const precioMal = [d.almacen?.precio_almacenamiento_semana, d.almacen?.precio_reparto].some((v) => v != null && (!Number.isFinite(v) || v < 0));
  if (precioMal) return { ok: false, error: 'Los precios tienen que ser un número (o vacíos para usar los de por defecto).' };
  if (!d.nombre_empresa.trim() || !d.direccion.trim() || !d.codigo_postal.trim() || !d.poblacion.trim()) {
    return { ok: false, error: 'Empresa, dirección, código postal y población son obligatorios.' };
  }

  // Emails de avisos: varios separados por comas, cada uno válido, máximo 10.
  const emails = [...new Set(d.emails_avisos.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 10) return { ok: false, error: `Máximo 10 emails de avisos por sitio (has puesto ${emails.length}).` };
  const malo = emails.find((e) => !EMAIL.test(e));
  if (id && emails.length === 0) {
    const { data: antes } = await s.supabase.from('sitios').select('emails_avisos').eq('id', id).single();
    if ((antes?.emails_avisos ?? []).length) return { ok: false, error: 'El email de avisos no se puede dejar vacío: solo se puede cambiar por otro válido.' };
  }
  if (malo) return { ok: false, error: `«${malo}» no es un email válido. Si pones varios, sepáralos por comas.` };

  const malHorario = validarHorario(d.horario);
  if (malHorario) return { ok: false, error: malHorario };
  if (d.verano?.activo) {
    if (!MMDD.test(d.verano.desde) || !MMDD.test(d.verano.hasta)) return { ok: false, error: 'Pon las fechas del horario de verano (desde y hasta).' };
    const malV = validarHorario(d.verano.horario);
    if (malV) return { ok: false, error: `Horario de verano: ${malV.charAt(0).toLowerCase()}${malV.slice(1)}` };
  }
  const contactos = sinVacios(d.contactos);
  const malContacto = validarContactos(contactos);
  if (malContacto) return { ok: false, error: malContacto };

  // Aviso de duplicado (no bloquea): mismo cliente, mismo nombre y mismo código postal.
  if (!id && !aunqueParezcaRepetido) {
    const base = s.supabase.from('sitios').select('id, nombre_empresa, codigo_postal')
      .eq('borrado', false).eq('codigo_postal', d.codigo_postal.trim());
    const { data: suyos } = await (esAlmacen ? base.eq('es_almacen_dynamo', true) : base.eq('cliente_id', d.cliente_id));
    const rep = (suyos ?? []).find((x) => clave(x.nombre_empresa) === clave(d.nombre_empresa));
    if (rep) return { ok: false, error: 'repetido', duplicado: { id: rep.id, nombre: rep.nombre_empresa } };
  }

  const fila: Record<string, unknown> = {
    nombre_empresa: d.nombre_empresa.trim(), tipo: d.tipo || 'almacen_nave',
    direccion: d.direccion.trim(), codigo_postal: d.codigo_postal.trim(), poblacion: d.poblacion.trim(),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    anotaciones: vacio(d.anotaciones),
    requiere_cita: d.requiere_cita, tiene_medios_carga: d.tiene_medios_carga,
    emails_avisos: emails,
  };
  // El enlace de Google Maps solo lo toca Dynamo (en el mockup, el cliente lo ve fijo).
  if (esGestor(s.perfil!.rol)) fila.url_google_maps = vacio(d.url_google_maps);
  if (esAlmacen) {
    fila.disponible = d.almacen!.disponible;
    fila.precio_almacenamiento_semana = d.almacen!.precio_almacenamiento_semana;
    fila.precio_reparto = d.almacen!.precio_reparto;
    if (!id) fila.es_almacen_dynamo = true;
  } else if (!id) fila.cliente_id = d.cliente_id;

  const q = id
    ? s.supabase.from('sitios').update(fila as TablaUpdate<'sitios'>).eq('id', id).select('id').single()
    : s.supabase.from('sitios').insert(fila as TablaInsert<'sitios'>).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const sitioId = data.id as string;

  // Horario: de una vez (todo o nada). Al crear, sustituye al de por defecto.
  const eh = await s.supabase.rpc('guardar_horario', { p_sitio: sitioId, p_tramos: tramosDe(d.horario) });
  if (eh.error) return { ok: false, error: /se pisan/i.test(eh.error.message) ? 'Hay dos tramos del mismo día que se pisan.' : traducir(eh.error.message) };
  if (d.verano) {
    const ev = await s.supabase.rpc('guardar_horario_verano', { p_sitio: sitioId, p_activo: d.verano.activo, p_desde: d.verano.desde, p_hasta: d.verano.hasta,
      p_tramos: d.verano.activo ? tramosDe(d.verano.horario) : [] });
    if (ev.error) return { ok: false, error: /se pisan/i.test(ev.error.message) ? 'Horario de verano: hay dos tramos del mismo día que se pisan.' : traducir(ev.error.message) };
  }
  const e2 = await guardarContactos(s.supabase, { sitio_id: sitioId }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: sitioId };
}

// Borrado SUAVE: sale de la agenda y del buscador; los envíos ya hechos conservan la
// dirección. Si tenía la estrella, la base de datos se la quita sola.
export async function borrarSitio(id: string): Promise<{ ok: boolean; error?: string }> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#borrarSitio", [id]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso para borrar sitios.' };
  const { error } = await s.supabase.from('sitios')
    .update({ borrado: true }).eq('id', id);   // la hora la pone la base de datos
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function marcarPrincipal(clienteId: string, sitioId: string | null): Promise<{ ok: boolean; error?: string }> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#marcarPrincipal", [clienteId, sitioId]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso.' };
  const { error } = await s.supabase.rpc('marcar_sitio_principal', { p_cliente: clienteId, p_sitio: sitioId });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

// =====================================================================================
// BUSCADOR «PARA AUTORRELLENAR» DEL NUEVO SITIO (como el mockup): agenda + Google.
// =====================================================================================
// Nivel GOOGLE: con GOOGLE_MAPS_API_KEY puesta (en Vercel, nunca en el repo) busca de
// verdad en Google Places y los resultados salen reales; sin clave, una lista de EJEMPLO
// (la del mockup) para que el flujo completo se pueda probar ya. El usuario lo decidió
// así el 2026-11-09: «cuando paguemos la API saldrán reales en búsqueda».
export type SitioGoogle = {
  empresa: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string;
  pais_codigo_iso: string; telefono: string; url_google_maps: string; etiqueta: string;
};
const GOOGLE_EJEMPLO: SitioGoogle[] = [
  { empresa: 'Grupal Art SL', direccion: 'Carrer Perdellot, 12', codigo_postal: '08185', poblacion: 'Lliçà de Vall', provincia: 'Barcelona', pais_codigo_iso: 'ES', telefono: '+34938445187', url_google_maps: 'https://goo.gl/maps/q4ECJQVWoezFTaHA6', etiqueta: 'Carrer Perdellot, 12, 08185 Lliçà de Vall, Barcelona' },
  { empresa: 'Modular Normalizada S.L.', direccion: 'Calle del Berilio, 3', codigo_postal: '28946', poblacion: 'Fuenlabrada', provincia: 'Madrid', pais_codigo_iso: 'ES', telefono: '+34916421761', url_google_maps: 'https://maps.app.goo.gl/wm2DhtjTyovfFkXe6', etiqueta: 'Calle del Berilio, 3, 28946 Fuenlabrada, Madrid' },
  { empresa: 'Circular Polimeri', direccion: 'Carrer Nou, 21', codigo_postal: '46469', poblacion: 'Beniparrell', provincia: 'Valencia', pais_codigo_iso: 'ES', telefono: '+34961214088', url_google_maps: 'https://maps.app.goo.gl/a9eiXJTidcnLHVjD6', etiqueta: 'Carrer Nou, 21, 46469 Beniparrell, Valencia' },
  { empresa: 'Talleres Norte SL', direccion: 'Pol. Malpica, Calle E, 30', codigo_postal: '50016', poblacion: 'Zaragoza', provincia: 'Zaragoza', pais_codigo_iso: 'ES', telefono: '+34976573021', url_google_maps: 'https://maps.app.goo.gl/talleresnorte', etiqueta: 'Pol. Malpica, Calle E, 30, 50016 Zaragoza' },
  { empresa: 'Logística Manchega SL', direccion: 'Pol. Campollano, Av. 2ª, 40', codigo_postal: '02007', poblacion: 'Albacete', provincia: 'Albacete', pais_codigo_iso: 'ES', telefono: '+34967218450', url_google_maps: 'https://maps.app.goo.gl/logmanchega', etiqueta: 'Pol. Campollano, Av. 2ª, 40, 02007 Albacete' },
  { empresa: 'Cerámicas Levante SA', direccion: 'Ctra. Alcora, km 9', codigo_postal: '12006', poblacion: 'Castellón de la Plana', provincia: 'Castellón', pais_codigo_iso: 'ES', telefono: '+34964257133', url_google_maps: 'https://maps.app.goo.gl/ceramicaslevante', etiqueta: 'Ctra. Alcora, km 9, 12006 Castellón de la Plana' },
  { empresa: 'Frutas del Sur SCA', direccion: 'Ctra. de la Mojonera, km 3', codigo_postal: '04745', poblacion: 'La Mojonera', provincia: 'Almería', pais_codigo_iso: 'ES', telefono: '+34950581247', url_google_maps: 'https://maps.app.goo.gl/frutasdelsur', etiqueta: 'Ctra. de la Mojonera, km 3, 04745 La Mojonera, Almería' },
  { empresa: 'Hierros Cantabria SL', direccion: 'Pol. Barros, Nave 12', codigo_postal: '39408', poblacion: 'Los Corrales de Buelna', provincia: 'Cantabria', pais_codigo_iso: 'ES', telefono: '+34942830719', url_google_maps: 'https://maps.app.goo.gl/hierroscantabria', etiqueta: 'Pol. Barros, Nave 12, 39408 Los Corrales de Buelna, Cantabria' },
];
const normTxt = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function buscarSitiosGoogle(q: string): Promise<SitioGoogle[]> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#buscarSitiosGoogle", [q]);
  const s = await puede();
  if (!s) return [];
  q = (q ?? '').trim().slice(0, 120);
  if (q.length < 2) return [];
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) {
    // SIN clave: como en el mockup, «casi cualquier empresa aparece en Google» — si la
    // lista curada no casa, se generan fichas de EJEMPLO deterministas a partir de lo
    // escrito (mismo texto → mismos resultados), para poder probar el flujo con todo.
    const w = normTxt(q);
    const lista = GOOGLE_EJEMPLO.filter((g) => normTxt(`${g.empresa} ${g.etiqueta}`).includes(w)).slice(0, 3);
    if (lista.length >= 2) return lista;
    const DIRS = [
      { direccion: 'Pol. Ind. La Isla, C/ Río Viejo, 48', codigo_postal: '41703', poblacion: 'Dos Hermanas', provincia: 'Sevilla' },
      { direccion: 'C/ de la Resina, 13', codigo_postal: '28021', poblacion: 'Madrid', provincia: 'Madrid' },
      { direccion: 'Pol. Ind. Can Salvatella, Av. Arraona, 60', codigo_postal: '08210', poblacion: 'Barberà del Vallès', provincia: 'Barcelona' },
      { direccion: 'Ctra. N-340, km 942, Nave 5', codigo_postal: '12550', poblacion: 'Almassora', provincia: 'Castellón' },
      { direccion: 'Pol. Ind. Juncaril, C/ Loja, 119', codigo_postal: '18220', poblacion: 'Albolote', provincia: 'Granada' },
      { direccion: 'Pol. Ind. El Oliveral, C/ G, 24', codigo_postal: '46394', poblacion: 'Riba-roja de Túria', provincia: 'Valencia' },
      { direccion: 'Pol. Ind. Villalonquéjar, C/ López Bravo, 82', codigo_postal: '09001', poblacion: 'Burgos', provincia: 'Burgos' },
      { direccion: 'Parque Empresarial A Grela, C/ Gutenberg, 26', codigo_postal: '15008', poblacion: 'A Coruña', provincia: 'A Coruña' },
    ];
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 100000;
    const nombre = q.replace(/\s+/g, ' ').trim().replace(/\p{L}/gu, (c) => c.toUpperCase());
    const inventada = (i: number): SitioGoogle => {
      const dir = DIRS[(h + i * 3) % DIRS.length];
      const tel = `+349${String((h * 7 + i * 1234567) % 100000000).padStart(8, '0')}`;
      const empresa = i === 0 ? `${nombre}, S.L.` : `${nombre} ${dir.provincia}, S.A.`;
      return {
        empresa, ...dir, pais_codigo_iso: 'ES', telefono: tel,
        url_google_maps: `https://maps.google.com/?q=${encodeURIComponent(`${empresa} ${dir.poblacion}`)}`,
        etiqueta: `${dir.direccion}, ${dir.codigo_postal} ${dir.poblacion}, ${dir.provincia}`,
      };
    };
    return [...lista, inventada(0), inventada(1)].slice(0, 3);
  }
  try {
    // Places API (New) · Text Search. Campos mínimos para autorrellenar la ficha.
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'es', regionCode: 'ES', pageSize: 4 }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { places?: { displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; googleMapsUri?: string; addressComponents?: { longText?: string; shortText?: string; types?: string[] }[] }[] };
    return (j.places ?? []).map((p) => {
      const comp = (tipo: string, corto = false) => {
        const c = (p.addressComponents ?? []).find((x) => x.types?.includes(tipo));
        return (corto ? c?.shortText : c?.longText) ?? '';
      };
      return {
        empresa: p.displayName?.text ?? '',
        direccion: [comp('route'), comp('street_number')].filter(Boolean).join(', '),
        codigo_postal: comp('postal_code'), poblacion: comp('locality'),
        provincia: comp('administrative_area_level_2'), pais_codigo_iso: comp('country', true) || 'ES',
        telefono: (p.nationalPhoneNumber ?? '').replace(/\s/g, ''), url_google_maps: p.googleMapsUri ?? '',
        etiqueta: p.formattedAddress ?? '',
      };
    }).filter((g) => g.empresa);
  } catch {
    return [];
  }
}

// La agenda del cliente para el buscador de la ficha (los 4 que mejor casan).
export async function buscarAgendaSitios(q: string, clienteId: string | null): Promise<{ id: string; nombre: string; direccion: string }[]> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#buscarAgendaSitios", [q, clienteId]);
  const s = await puede();
  if (!s || !(q ?? '').trim()) return [];
  const cli = clienteId && /^[0-9a-f-]{36}$/i.test(clienteId) ? clienteId : null;
  const { data } = await s.supabase.rpc('sitios_pagina', { p_q: q.trim().slice(0, 120), p_cliente: cli, p_pagina: 1, p_por_pagina: 4 });
  const ids = (data ?? []).map((x) => x.id);
  if (!ids.length) return [];
  const { data: filas } = await s.supabase.from('sitios').select('id, nombre_empresa, direccion, codigo_postal, poblacion').in('id', ids);
  return ids.map((id) => {
    const f = (filas ?? []).find((x) => x.id === id);
    return f ? { id: f.id, nombre: f.nombre_empresa, direccion: [f.direccion, f.codigo_postal, f.poblacion].filter(Boolean).join(', ') } : null;
  }).filter(Boolean) as { id: string; nombre: string; direccion: string }[];
}

// La ficha completa de UN sitio (para abrir un registro que no está en la página, y para
// el comparador de duplicados). Los permisos por fila deciden qué puede leer cada uno.
export async function leerSitio(id: string) {
  comprobarEntrada("app/panel/(app)/sitios/acciones#leerSitio", [id]);
  const s = await puede();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { cargarSitios } = await import('@/lib/sitiosDatos');
  const { filas } = await cargarSitios(s.supabase, false, [id]);
  return filas[0] ?? null;
}

// ¿Hay un sitio guardado MUY PARECIDO a estos datos? Mismo criterio que el mockup: la
// primera palabra «fuerte» (≥4 letras) del nombre coincide, o mismo CP con parte del
// nombre. Para el aviso en vivo al elegir un resultado de Google.
export async function sitioParecido(clienteId: string | null, empresa: string, cp: string): Promise<{ id: string; nombre: string } | null> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#sitioParecido", [clienteId, empresa, cp]);
  const s = await puede();
  if (!s) return null;
  const tok = normTxt(empresa ?? '').split(/\s+/).filter((w) => w.length >= 4)[0] ?? '';
  if (!tok && !(cp ?? '').trim()) return null;
  let base = s.supabase.from('sitios').select('id, nombre_empresa, codigo_postal').eq('borrado', false).limit(200);
  if (clienteId && /^[0-9a-f-]{36}$/i.test(clienteId)) base = base.eq('cliente_id', clienteId);
  const { data } = await (tok ? base.ilike('nombre_empresa', `%${tok}%`) : base.eq('codigo_postal', (cp ?? '').trim()));
  const hit = (data ?? []).find((x) => {
    const sTok = normTxt(x.nombre_empresa).split(/\s+/).filter((w) => w.length >= 4)[0] ?? '';
    return (tok && sTok && tok === sTok) || ((cp ?? '').trim() && x.codigo_postal === cp.trim() && tok && normTxt(x.nombre_empresa).includes(tok));
  });
  return hit ? { id: hit.id, nombre: hit.nombre_empresa } : null;
}
