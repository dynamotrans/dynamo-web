'use server';

import { mensajeError } from '@/lib/mensajeError';
import { randomUUID } from 'node:crypto';
import { sesion, esGestor } from '@/lib/sesion';

// Documentos de Recursos que publica el equipo de Dynamo (condiciones, guías, certificados…).
// Los ve cualquier cuenta activa; los sube y los quita solo Dynamo (lo impone la base de datos:
// migración recursos_documentos). El fichero va directo del navegador al bucket privado.
export type RecursoSubido = { id: string; titulo: string; descripcion: string | null; nombre: string; mime: string | null; tamano: number | null; creado_en: string };
type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const sano = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'documento';

async function gestor() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return null;
  return s;
}

export async function rutaRecurso(nombre: string): Promise<Res<{ ruta: string }>> {
  const s = await gestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo publica documentos en Recursos.' };
  return { ok: true, ruta: `recursos/${randomUUID()}/${sano(nombre)}` };
}

export async function registrarRecurso(f: { ruta: string; nombre: string; mime: string; tamano: number; sha256: string; titulo: string; descripcion: string }): Promise<Res> {
  const s = await gestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo publica documentos en Recursos.' };
  const titulo = f.titulo.trim().slice(0, 120);
  if (!titulo) return { ok: false, error: 'Pon un título al documento.' };
  if (!/^recursos\/[0-9a-f-]{36}\/[^/]+$/.test(f.ruta)) return { ok: false, error: 'Ruta de subida no válida.' };
  const { error } = await s.supabase.from('documentos').insert({
    tipo: 'otro', es_recurso: true, recurso_titulo: titulo, recurso_descripcion: f.descripcion.trim().slice(0, 300) || null,
    storage_bucket: 'documentos', storage_ruta: f.ruta, nombre_archivo: f.nombre.slice(0, 200), tipo_mime: f.mime || null,
    tamano_bytes: f.tamano, sha256: /^[0-9a-f]{64}$/.test(f.sha256) ? f.sha256 : null, visible_cliente: false,
  });
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}

// Quitar = borrado suave: deja de verse, el fichero se conserva.
export async function quitarRecurso(id: string): Promise<Res> {
  const s = await gestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo quita documentos de Recursos.' };
  const { error } = await s.supabase.from('documentos').update({ borrado: true, borrado_en: new Date().toISOString() }).eq('id', id).eq('es_recurso', true);
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}
