import { sesion, esDynamo } from '@/lib/sesion';
import MiCuenta, { type TransporteDatos } from '@/components/panel/MiCuenta';
import { datosDynamo } from '@/lib/pdf/datos';
import type { Funcion } from '@/lib/supabase/tipos';

export const dynamic = 'force-dynamic';

// Mi cuenta: diseño de #sec-mi-cuenta de dashboard.html (datos personales, seguridad y
// datos fiscales de la empresa).
export default async function PaginaMiCuenta() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const { supabase, perfil, user } = s;
  const { data: yo } = await supabase.from('usuarios').select('nombre, email, telefono, documento, cargo, idioma, rol, estado').eq('id', perfil.id).maybeSingle();
  let empresa: { razon_social: string; cif: string | null; direccion: string; pais: string | null } | null = null;
  let transporte: TransporteDatos | null = null;
  if (esDynamo(perfil.rol)) {
    const D = await datosDynamo(supabase);
    empresa = { razon_social: D.razon_social, cif: D.cif, direccion: `${D.direccion}, ${D.codigo_postal} ${D.poblacion}`, pais: 'ES' };
  } else {
    const { data } = await supabase.rpc(perfil.rol === 'transportista' ? 'mi_empresa_transportista' : 'mi_empresa').maybeSingle();
    if (data) empresa = { razon_social: data.razon_social, cif: data.cif, pais: data.pais_codigo_iso ?? null,
      direccion: [data.direccion, [data.codigo_postal, data.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') };
    // El transportista: su empresa de transporte y su flota (lo que ve por sus permisos).
    if (data && perfil.rol === 'transportista') {
      const t = data as Funcion<'mi_empresa_transportista'>[number];
      const [veh, con] = await Promise.all([
        supabase.from('vehiculos').select('id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, tiene_plataforma_elevadora').eq('activo', true).order('matricula'),
        supabase.from('conductores').select('id, nombre, telefono, documento, documento_pais').eq('activo', true).order('nombre'),
      ]);
      transporte = { id: t.id, nima: t.nima, bolsa: t.bolsa, codigo_bolsa: t.codigo_bolsa, plazo_pago_dias: t.plazo_pago_dias,
        vehiculos: veh.data ?? [], conductores: con.data ?? [] };
    }
  }
  return <MiCuenta datos={{ nombre: yo?.nombre ?? '', telefono: yo?.telefono ?? '', documento: yo?.documento ?? '', cargo: yo?.cargo ?? '', idioma: yo?.idioma ?? 'es' }}
    email={yo?.email ?? user.email ?? ''} rol={perfil.rol} ultimaConexion={user.last_sign_in_at ?? null} empresa={empresa} transporte={transporte} />;
}
