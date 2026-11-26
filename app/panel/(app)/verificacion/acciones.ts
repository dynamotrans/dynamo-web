'use server';

// VERIFICACIÓN DE EMPRESA (usuario, 2026-11-26). La verificación es de la empresa (CIF):
// sin verificar trabaja con pago previo (tarjeta o transferencia); verificada, su crédito
// cuenta. Quién puede qué lo decide la base de datos (funciones de la migración
// verificacion_de_empresa); aquí solo se piden y se traducen los resultados.
import { sesion, esDynamo } from '@/lib/sesion';
import { mensajeError } from '@/lib/mensajeError';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { comprobarMiClave } from '@/lib/servidor/miClave';
import { consultarCesce } from '@/lib/servidor/cesce';
import { CONTACTO } from '@/lib/atencion';

type Res = { ok: true } | { ok: false; error: string };
export type MiVerificacion = {
  estado: 'no_verificada' | 'verificada'; metodo: string | null; verificada_en: string | null;
  solicitada: 'transferencia' | 'documento' | null; solicitada_en: string | null; codigo: string;
  aviso_credito: boolean; razon_social: string; cif: string; usuario_id: string;
  banco: { titular: string; iban: string; banco: string; bic: string };
};
const limpia = (m: string) => mensajeError(m.replace(/^.*?ERROR:\s*/i, ''));

// Alta de una empresa NUEVA sin esperar a Dynamo: nace sin verificar y la cuenta queda activa.
export async function crearMiEmpresa(): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#crearMiEmpresa", []);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('alta_crear_mi_empresa');
  if (error) return { ok: false, error: limpia(error.message) };
  const r = String(data ?? '');
  if (r.startsWith('ok:')) {
    // CESCE se consulta al momento, aunque la empresa no esté verificada (el cliente no lo ve).
    await consultarCesce(r.slice(3)).catch(() => 'error');
    return { ok: true };
  }
  const textos: Record<string, string> = {
    existente: 'Esa empresa ya trabaja con Dynamo. Pide a un compañero que te invite desde «Mi cuenta → Tu equipo», o espera: lo revisamos nosotros y te avisamos por email.',
    no_admitido: `Esta empresa no se puede dar de alta como cliente. Si crees que es un error, llámanos al ${CONTACTO.telefono}.`,
    faltan_datos: 'Faltan datos de la empresa: revísalos y guárdalos otra vez.',
    email_sin_confirmar: 'Confirma primero tu email con el código que te enviamos.',
    movil_sin_verificar: 'Verifica primero tu móvil con el código de WhatsApp.',
    registro_cerrado: 'Ahora mismo no estamos dando de alta empresas nuevas. Escríbenos y lo vemos contigo.',
  };
  return { ok: false, error: textos[r] ?? 'Tu alta ya está hecha o no se puede completar aquí.' };
}

export async function miVerificacion(): Promise<MiVerificacion | null> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#miVerificacion", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.rol !== 'cliente') return null;
  const [{ data }, { data: dy }] = await Promise.all([s.supabase.rpc('mi_empresa_verificacion'), s.supabase.rpc('datos_dynamo')]);
  if (!data) return null;
  const v = data as Omit<MiVerificacion, 'banco'>;
  const d = (dy ?? {}) as Record<string, string>;   // los parámetros dynamo_* sin el prefijo
  return { ...v, usuario_id: s.perfil.id, banco: d.verificacion_iban
    // La cuenta secundaria solo para los céntimos de verificación (usuario, 2026-11-26).
    ? { titular: d.razon_social ?? '', iban: d.verificacion_iban, banco: d.verificacion_banco ?? '', bic: '' }
    : { titular: d.razon_social ?? '', iban: d.iban ?? '', banco: d.banco ?? '', bic: d.bic ?? '' } };
}

export async function pedirVerificacion(metodo: 'transferencia' | 'documento'): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#pedirVerificacion", [metodo]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (metodo === 'documento') {
    const { count } = await s.supabase.from('documentos').select('id', { count: 'exact', head: true }).eq('tipo', 'hoja_cif').eq('usuario_id', s.perfil.id).eq('borrado', false);
    if (!count) return { ok: false, error: 'Sube primero el documento (la tarjeta del CIF o similar).' };
  }
  const { data, error } = await s.supabase.rpc('solicitar_verificacion_empresa', { p_metodo: metodo });
  if (error) return { ok: false, error: limpia(error.message) };
  return data === 'ya_verificada' ? { ok: false, error: 'Tu empresa ya está verificada.' } : { ok: true };
}

// ---- Dynamo -----------------------------------------------------------------------
async function dynamoConClave(clave: string) {
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return { s: null, error: 'Solo el equipo de Dynamo.' };
  const mal = await comprobarMiClave(s.supabase, clave);
  return mal ? { s: null, error: mal } : { s, error: null };
}

export async function verificarEmpresa(clienteId: string, metodo: 'transferencia' | 'documento' | 'manual', motivo: string, clave: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#verificarEmpresa", [clienteId, metodo, motivo, clave]);
  if (motivo.trim().length < 5) return { ok: false, error: 'Escribe qué has comprobado (el motivo).' };
  const { s, error: e } = await dynamoConClave(clave);
  if (!s) return { ok: false, error: e! };
  const { data, error } = await s.supabase.rpc('verificar_empresa', { p_cliente: clienteId, p_metodo: metodo, p_motivo: motivo.trim() });
  if (error) return { ok: false, error: limpia(error.message) };
  return data === 'ya_verificada' ? { ok: false, error: 'La empresa ya estaba verificada.' } : { ok: true };
}

export async function rechazarVerificacion(clienteId: string, motivo: string, clave: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#rechazarVerificacion", [clienteId, motivo, clave]);
  if (motivo.trim().length < 5) return { ok: false, error: 'Escribe el motivo.' };
  const { s, error: e } = await dynamoConClave(clave);
  if (!s) return { ok: false, error: e! };
  const { data, error } = await s.supabase.rpc('rechazar_verificacion_empresa', { p_cliente: clienteId, p_motivo: motivo.trim() });
  if (error) return { ok: false, error: limpia(error.message) };
  return data === 'sin_solicitud' ? { ok: false, error: 'No tenía ninguna verificación pedida.' } : { ok: true };
}

export async function quitarVerificacion(clienteId: string, motivo: string, clave: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#quitarVerificacion", [clienteId, motivo, clave]);
  if (motivo.trim().length < 5) return { ok: false, error: 'Escribe el motivo.' };
  const { s, error: e } = await dynamoConClave(clave);
  if (!s) return { ok: false, error: e! };
  const { data, error } = await s.supabase.rpc('quitar_verificacion_empresa', { p_cliente: clienteId, p_motivo: motivo.trim() });
  if (error) return { ok: false, error: limpia(error.message) };
  return data === 'no_verificada' ? { ok: false, error: 'La empresa no estaba verificada.' } : { ok: true };
}

export type RegistroVerificacion = { accion: string; metodo: string | null; motivo: string | null; creado_en: string; quien: string | null };
export async function registroVerificacion(clienteId: string): Promise<RegistroVerificacion[]> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#registroVerificacion", [clienteId]);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return [];
  const { data } = await s.supabase.from('verificaciones_empresa').select('accion, metodo, motivo, creado_en, usuarios(nombre, email)')
    .eq('cliente_id', clienteId).order('creado_en', { ascending: false }).limit(30)
    .overrideTypes<{ accion: string; metodo: string | null; motivo: string | null; creado_en: string; usuarios: { nombre: string | null; email: string | null } | null }[], { merge: false }>();
  return (data ?? []).map((x) => ({ accion: x.accion, metodo: x.metodo, motivo: x.motivo, creado_en: x.creado_en, quien: x.usuarios?.nombre || x.usuarios?.email || null }));
}

export type VerificacionCliente = {
  estado: 'no_verificada' | 'verificada'; metodo: string | null; verificada_en: string | null; verificada_por: string | null;
  motivo: string | null; solicitada: string | null; solicitada_en: string | null; codigo: string;
  cesce: string; cesce_en: string | null; registro: RegistroVerificacion[]; conDocumentos: { id: string; nombre: string }[];
};
// Lo que ve Dynamo en la ficha del cliente: estado, quién y cómo, la petición pendiente con su
// código de transferencia, el resultado de CESCE, el registro y quién de la empresa ha subido documentos.
export async function verificacionDeCliente(clienteId: string): Promise<VerificacionCliente | null> {
  comprobarEntrada("app/panel/(app)/verificacion/acciones#verificacionDeCliente", [clienteId]);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return null;
  const { data: c } = await s.supabase.from('clientes')
    .select('estado_verificacion, metodo_verificacion, verificada_en, verificacion_motivo, verificacion_solicitada, verificacion_solicitada_en, codigo_transferencia, cesce_resultado, cesce_consultado_en, verificada_por')
    .eq('id', clienteId).maybeSingle();
  if (!c) return null;
  const [registro, { data: us }] = await Promise.all([
    registroVerificacion(clienteId),
    s.supabase.from('usuarios').select('id, nombre, email').eq('cliente_id', clienteId),
  ]);
  const ids = (us ?? []).map((u) => u.id);
  if (c.verificada_por) ids.push(c.verificada_por);
  const { data: docs } = ids.length
    ? await s.supabase.from('documentos').select('usuario_id').in('usuario_id', (us ?? []).map((u) => u.id)).in('tipo', ['hoja_cif', 'dni']).eq('borrado', false)
    : { data: [] as { usuario_id: string | null }[] };
  const conDocs = new Set((docs ?? []).map((d) => d.usuario_id));
  let quien: string | null = null;
  if (c.verificada_por) {
    const { data: q } = await s.supabase.from('usuarios').select('nombre, email').eq('id', c.verificada_por).maybeSingle();
    quien = q?.nombre || q?.email || null;
  }
  return {
    estado: c.estado_verificacion, metodo: c.metodo_verificacion, verificada_en: c.verificada_en, verificada_por: quien,
    motivo: c.verificacion_motivo, solicitada: c.verificacion_solicitada, solicitada_en: c.verificacion_solicitada_en,
    codigo: c.codigo_transferencia, cesce: c.cesce_resultado, cesce_en: c.cesce_consultado_en, registro,
    conDocumentos: (us ?? []).filter((u) => conDocs.has(u.id)).map((u) => ({ id: u.id, nombre: u.nombre || u.email || 'Usuario' })),
  };
}
