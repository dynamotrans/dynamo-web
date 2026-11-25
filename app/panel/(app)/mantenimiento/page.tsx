import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Mantenimiento, { type Descuadre, type ResumenBrevo, type ResumenWhatsApp } from '@/components/panel/Mantenimiento';
import { whatsappConectado } from '@/lib/servidor/whatsapp';
import { brevoConectado } from '@/lib/servidor/brevo';

export const dynamic = 'force-dynamic';

// Modo mantenimiento (kill-switch de la plataforma, solo admin): la ventana del mockup.
export default async function PaginaMantenimiento() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [{ data: activo }, { data: p }, { data: descuadres }, { data: brevo }, { data: porSubir }, { data: wa }] = await Promise.all([
    supabase.rpc('mantenimiento_activo'),
    supabase.from('parametros').select('modificado_en, modificado_por').eq('clave', 'mantenimiento_activo').maybeSingle(),
    supabase.from('pantalla_descuadres').select('id, causa, ruta, navegador, corregido, datos, creado_en').order('creado_en', { ascending: false }).limit(25),
    supabase.rpc('brevo_sitios_resumen'),
    supabase.rpc('brevo_sitios_revisar'),
    supabase.rpc('whatsapp_resumen'),
  ]);
  let quien: string | null = null;
  if (p?.modificado_por) {
    const { data } = await supabase.from('usuarios').select('nombre, email').eq('id', p.modificado_por).maybeSingle();
    quien = data?.nombre || data?.email || null;
  }
  return <Mantenimiento activo={!!activo} esAdmin={perfil.rol === 'admin'} cambiado={p?.modificado_en ?? null} quien={quien} descuadres={(descuadres ?? []) as Descuadre[]}
    brevo={brevo ? { ...(brevo as unknown as ResumenBrevo), conClave: brevoConectado(), porSubir: (Array.isArray(porSubir) ? porSubir : []) as unknown as ResumenBrevo['porSubir'] } : null}
    whatsapp={wa ? { ...(wa as unknown as ResumenWhatsApp), conectado: whatsappConectado() } : null} />;
}
