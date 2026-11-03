'use server';

import { randomUUID } from 'node:crypto';
import { esGestor } from '@/lib/sesion';
import { supabaseServidor } from '@/lib/supabase/server';

// Documentos del almacén de archivos. El fichero se sube desde el navegador directamente a
// Supabase Storage (bucket privado `documentos`) y aquí se registra su fila. Los permisos
// los impone la base de datos (tabla `documentos` y políticas del bucket).
export type Dueno = { campo: 'envio_id' | 'incidencia_id' | 'almacenamiento_id' | 'transportista_id' | 'penalizacion_id' | 'operador_id' | 'usuario_id'; id: string };
export type DocumentoFila = { id: string; tipo: string; nombre_archivo: string; tamano_bytes: number | null; tipo_mime: string | null;
  visible_cliente: boolean; creado_en: string; autor: string | null };
type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const CAMPOS = ['envio_id', 'incidencia_id', 'almacenamiento_id', 'transportista_id', 'penalizacion_id', 'operador_id', 'usuario_id'];
const CARPETA: Record<string, string> = { envio_id: 'envios', incidencia_id: 'incidencias', almacenamiento_id: 'almacenamientos',
  transportista_id: 'transportistas', penalizacion_id: 'penalizaciones', operador_id: 'operadores', usuario_id: 'usuarios' };
// Quién pide (sin redirigir: estas acciones se llaman en segundo plano desde las fichas).
async function sesion() {
  const supabase = await supabaseServidor();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('usuarios').select('id, rol, estado').eq('id', user.id).maybeSingle<{ id: string; rol: string; estado: string }>();
  return perfil ? { supabase, perfil } : null;
}
const valido = (d: Dueno) => CAMPOS.includes(d.campo) && /^[0-9a-f-]{36}$/i.test(d.id);
// Nombre de fichero seguro para la ruta (sin tildes, espacios ni barras).
const sano = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'documento';

export async function documentosDe(d: Dueno): Promise<DocumentoFila[]> {
  const s = await sesion();
  if (!s?.perfil || !valido(d)) return [];
  const { data } = await s.supabase.from('documentos').select('id, tipo, nombre_archivo, tamano_bytes, tipo_mime, visible_cliente, creado_en, creado_por')
    .eq(d.campo, d.id).eq('borrado', false).order('creado_en', { ascending: false });
  const ids = [...new Set((data ?? []).map((x: any) => x.creado_por).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await s.supabase.from('usuarios').select('id, nombre, email').in('id', ids);
    (us ?? []).forEach((u: any) => nombres.set(u.id, u.nombre || u.email));
  }
  return (data ?? []).map((x: any) => ({ id: x.id, tipo: x.tipo, nombre_archivo: x.nombre_archivo, tamano_bytes: x.tamano_bytes, tipo_mime: x.tipo_mime,
    visible_cliente: x.visible_cliente, creado_en: x.creado_en, autor: x.creado_por ? nombres.get(x.creado_por) ?? null : null }));
}

// Dónde se sube: Dynamo, en la carpeta del dueño; cualquier otro, en la suya (u/<id>/…),
// que es la única en la que el bucket le deja escribir.
export async function rutaDeSubida(d: Dueno, nombre: string): Promise<Res<{ ruta: string }>> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!valido(d)) return { ok: false, error: 'No se sabe a qué pertenece el documento.' };
  const base = esGestor(s.perfil.rol) ? `${CARPETA[d.campo]}/${d.id}` : `u/${s.perfil.id}`;
  return { ok: true, ruta: `${base}/${randomUUID()}/${sano(nombre)}` };
}

export async function registrarDocumento(d: Dueno, f: { tipo: string; ruta: string; nombre: string; mime: string; tamano: number; sha256: string; visible_cliente: boolean }): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || !valido(d)) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { error } = await s.supabase.from('documentos').insert({
    [d.campo]: d.id, tipo: f.tipo, storage_bucket: 'documentos', storage_ruta: f.ruta, nombre_archivo: f.nombre.slice(0, 200),
    tipo_mime: f.mime || null, tamano_bytes: f.tamano, sha256: /^[0-9a-f]{64}$/.test(f.sha256) ? f.sha256 : null,
    visible_cliente: f.visible_cliente,
  });
  if (error) {
    if (/Maximo 5 documentos/i.test(error.message)) return { ok: false, error: 'Como máximo 5 documentos en la ficha del transportista: quita uno antes.' };
    if (/row-level|permission/i.test(error.message)) return { ok: false, error: 'No tienes permiso para añadir este documento.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// «Quitar» = borrado suave de la fila: el fichero se conserva (valor de prueba).
export async function quitarDocumento(id: string): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo quita documentos.' };
  const { error } = await s.supabase.from('documentos').update({ borrado: true, borrado_en: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function visibleParaCliente(id: string, visible: boolean): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo decide qué ve el cliente.' };
  const { error } = await s.supabase.from('documentos').update({ visible_cliente: visible }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
