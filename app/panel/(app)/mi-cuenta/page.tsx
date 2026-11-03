import { sesion, esDynamo } from '@/lib/sesion';
import MiCuenta from '@/components/panel/MiCuenta';
import { DYNAMO } from '@/lib/pdf/datos';

export const dynamic = 'force-dynamic';

// Mi cuenta: diseño de #sec-mi-cuenta de dashboard.html (datos personales, seguridad y
// datos fiscales de la empresa).
export default async function PaginaMiCuenta() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const { supabase, perfil, user } = s;
  const { data: yo } = await supabase.from('usuarios').select('nombre, email, telefono, documento, cargo, idioma, rol, estado').eq('id', perfil.id).maybeSingle();
  let empresa: { razon_social: string; cif: string | null; direccion: string; pais: string | null } | null = null;
  if (esDynamo(perfil.rol)) {
    empresa = { razon_social: DYNAMO.razon_social, cif: DYNAMO.cif, direccion: `${DYNAMO.direccion}, ${DYNAMO.codigo_postal} ${DYNAMO.poblacion}`, pais: 'ES' };
  } else {
    const { data } = await supabase.rpc(perfil.rol === 'transportista' ? 'mi_empresa_transportista' : 'mi_empresa').maybeSingle<any>();
    if (data) empresa = { razon_social: data.razon_social, cif: data.cif, pais: data.pais_codigo_iso ?? null,
      direccion: [data.direccion, [data.codigo_postal, data.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') };
  }
  return <MiCuenta datos={{ nombre: yo?.nombre ?? '', telefono: yo?.telefono ?? '', documento: yo?.documento ?? '', cargo: yo?.cargo ?? '', idioma: yo?.idioma ?? 'es' }}
    email={yo?.email ?? user.email ?? ''} rol={perfil.rol} ultimaConexion={user.last_sign_in_at ?? null} empresa={empresa} />;
}
