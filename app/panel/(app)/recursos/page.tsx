import { sesion, esGestor } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Recursos from '@/components/panel/Recursos';
import type { RecursoSubido } from './acciones';

export const dynamic = 'force-dynamic';

// Recursos: diseño de #sec-recursos de dashboard.html. Documentos y herramientas de apoyo,
// más los documentos que publica el equipo de Dynamo («Subir documento»).
export default async function PaginaRecursos() {
  const s = await sesion();
  if (!s) return null;
  if (!s.perfil || s.perfil.estado !== 'activa') return <AvisoCuenta perfil={s.perfil} />;
  const { data } = await s.supabase.from('documentos').select('id, recurso_titulo, recurso_descripcion, nombre_archivo, tipo_mime, tamano_bytes, creado_en')
    .eq('es_recurso', true).eq('borrado', false).order('creado_en', { ascending: false }).limit(200);
  const subidos: RecursoSubido[] = (data ?? []).map((d) => ({ id: d.id, titulo: d.recurso_titulo as string, descripcion: d.recurso_descripcion,
    nombre: d.nombre_archivo, mime: d.tipo_mime, tamano: d.tamano_bytes, creado_en: d.creado_en }));
  return <Recursos subidos={subidos} gestor={esGestor(s.perfil.rol)} />;
}
