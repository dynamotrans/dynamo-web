import { sesion, esDynamo, esSoloLectura, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import WhatsApp, { type ConversacionFila, type MensajeFila } from '@/components/panel/WhatsApp';
import { whatsappConectado } from '@/lib/servidor/whatsapp';

export const dynamic = 'force-dynamic';

// WhatsApp (usuario, 2026-11-25): la bandeja del equipo de Dynamo. A la izquierda las
// conversaciones (la última arriba); al abrir una (?ver=<id>), sus mensajes y la caja para
// contestar (solo dentro de las 24 h de Meta). Lo que llega lo guarda /api/whatsapp.
export default async function PaginaWhatsApp({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const ver = sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver) ? sp.ver : null;

  const [{ data: convs, error }, { data: activo }] = await Promise.all([
    supabase.from('whatsapp_conversaciones')
      .select('id, telefono, nombre_perfil, quien, usuario_id, conductor_id, contacto_id, empresa_cliente_id, empresa_transportista_id, ultima_entrada_en, ultimo_mensaje_en, ultimo_texto, sin_leer')
      .order('ultimo_mensaje_en', { ascending: false, nullsFirst: false }).limit(1000),
    supabase.from('parametros').select('valor').eq('clave', 'whatsapp_activo').maybeSingle(),
  ]);
  const filas = convs ?? [];
  const ids = (k: 'usuario_id' | 'conductor_id' | 'contacto_id' | 'empresa_cliente_id' | 'empresa_transportista_id') =>
    [...new Set(filas.map((f) => f[k]).filter(Boolean))] as string[];
  const vacio = Promise.resolve({ data: [] as never[] });
  const [us, co, ct, cl, tr] = await Promise.all([
    ids('usuario_id').length ? supabase.from('usuarios').select('id, nombre, email').in('id', ids('usuario_id')) : vacio,
    ids('conductor_id').length ? supabase.from('conductores').select('id, nombre').in('id', ids('conductor_id')) : vacio,
    ids('contacto_id').length ? supabase.from('contactos').select('id, nombre').in('id', ids('contacto_id')) : vacio,
    ids('empresa_cliente_id').length ? supabase.from('clientes').select('id, razon_social, nombre_visible').in('id', ids('empresa_cliente_id')) : vacio,
    ids('empresa_transportista_id').length ? supabase.from('transportistas').select('id, razon_social, nombre_visible').in('id', ids('empresa_transportista_id')) : vacio,
  ]);
  const mapa = <T extends { id: string }>(l: T[] | null) => new Map((l ?? []).map((x) => [x.id, x]));
  const mUs = mapa(us.data as { id: string; nombre: string | null; email: string }[]);
  const mCo = mapa(co.data as { id: string; nombre: string | null }[]);
  const mCt = mapa(ct.data as { id: string; nombre: string | null }[]);
  const mCl = mapa(cl.data as { id: string; razon_social: string; nombre_visible: string | null }[]);
  const mTr = mapa(tr.data as { id: string; razon_social: string; nombre_visible: string | null }[]);
  const lista: ConversacionFila[] = filas.map((f) => {
    const persona = (f.usuario_id && (mUs.get(f.usuario_id)?.nombre || mUs.get(f.usuario_id)?.email))
      || (f.conductor_id && mCo.get(f.conductor_id)?.nombre) || (f.contacto_id && mCt.get(f.contacto_id)?.nombre) || null;
    const cli = f.empresa_cliente_id ? mCl.get(f.empresa_cliente_id) : undefined;
    const tra = f.empresa_transportista_id ? mTr.get(f.empresa_transportista_id) : undefined;
    return {
      id: f.id, telefono: f.telefono, perfil: f.nombre_perfil, quien: f.quien as ConversacionFila['quien'], persona,
      empresa: cli ? cli.nombre_visible || cli.razon_social : tra ? tra.nombre_visible || tra.razon_social : null,
      empresaHref: f.empresa_cliente_id ? `/panel/clientes?ver=${f.empresa_cliente_id}` : f.empresa_transportista_id ? `/panel/transportistas?ver=${f.empresa_transportista_id}` : null,
      ultimaEntrada: f.ultima_entrada_en, ultimo: f.ultimo_mensaje_en, ultimoTexto: f.ultimo_texto, sinLeer: f.sin_leer,
    };
  });

  let mensajes: MensajeFila[] = [];
  let hayMas = false;
  if (ver) {
    const { data } = await supabase.from('whatsapp_mensajes')
      .select('id, sentido, tipo, texto, archivo_ruta, archivo_tipo, archivo_nombre, archivo_borrado_en, meta_archivo_id, estado, error, origen, enviado_por, enviado_en, creado_en')
      .eq('conversacion_id', ver).order('creado_en', { ascending: false }).limit(201);
    const m = (data ?? []);
    hayMas = m.length > 200;
    const rutas = m.slice(0, 200).map((x) => x.archivo_ruta).filter(Boolean) as string[];
    const firmadas = new Map<string, string>();
    if (rutas.length) {
      const { data: urls } = await supabase.storage.from('whatsapp').createSignedUrls(rutas, 3600);
      (urls ?? []).forEach((u) => { if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl); });
    }
    const autores = [...new Set(m.map((x) => x.enviado_por).filter(Boolean))] as string[];
    const { data: au } = autores.length ? await supabase.from('usuarios').select('id, nombre, email').in('id', autores) : { data: [] };
    const mAu = new Map((au ?? []).map((x: { id: string; nombre: string | null; email: string }) => [x.id, x.nombre || x.email]));
    mensajes = m.slice(0, 200).reverse().map((x) => ({
      id: x.id, sentido: x.sentido as MensajeFila['sentido'], tipo: x.tipo, texto: x.texto,
      archivo: x.archivo_ruta ? firmadas.get(x.archivo_ruta) ?? null : null, archivoTipo: x.archivo_tipo, archivoNombre: x.archivo_nombre,
      archivoEstado: x.archivo_ruta ? 'guardado' : x.archivo_borrado_en ? 'borrado' : x.meta_archivo_id ? 'bajando' : 'ninguno',
      estado: x.estado as MensajeFila['estado'], error: x.error, origen: x.origen as MensajeFila['origen'],
      autor: x.enviado_por ? mAu.get(x.enviado_por) ?? null : null, cuando: x.enviado_en ?? x.creado_en,
    }));
  }

  return (
    <WhatsApp conversaciones={lista} ver={ver} mensajes={mensajes} hayMas={hayMas}
      conectado={whatsappConectado()} activo={activo?.valor === true || activo?.valor === 'true'}
      puedeContestar={!esSoloLectura(perfil.rol)} error={error?.message ?? null} />
  );
}
