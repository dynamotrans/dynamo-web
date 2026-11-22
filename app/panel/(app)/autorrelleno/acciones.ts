'use server';

import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { consultarApiEmpresas, hayClaveApiEmpresas } from '@/lib/servidor/apiEmpresas';
import { cifNormal, type EmpresaRegistro } from '@/lib/apiEmpresas';

// AUTORRELLENO DE DATOS FISCALES con APIEmpresas.es (usuario, 2026-11-22; construido y APAGADO).
// Lo usan quien tiene el alta de cliente pendiente (paso «empresa nueva») y el equipo de Dynamo
// (cliente nuevo). Se enciende con el interruptor de Parámetros y la clave APIEMPRESAS_API_KEY.
// Orden: lo ya consultado (gratis) → apuntar la consulta (tope diario y saldo del bono, en la base
// de datos) → la API → guardar lo que devuelve (solo con la clave de servicio). Si algo falla, se
// rellena a mano: nunca bloquea el alta. Nunca devuelve datos de nuestros clientes.

export type ResultadoRegistro = { ok: true; empresas: EmpresaRegistro[] } | { ok: false; error: string; apagado?: boolean };
const A_MANO = 'Rellena los datos a mano.';

// ¿Está encendido para quien pregunta? (interruptor + clave + permiso)
export async function autorrellenoActivo(): Promise<boolean> {
  comprobarEntrada("app/panel/(app)/autorrelleno/acciones#autorrellenoActivo", []);
  if (!hayClaveApiEmpresas()) return false;
  const s = await sesion();
  if (!s?.perfil) return false;
  const { data } = await s.supabase.rpc('autorrelleno_empresas_estado');
  return !!(data as { activo?: boolean } | null)?.activo;
}

// Busca por CIF (si lo parece) o por nombre. Devuelve hasta 10 empresas.
export async function buscarEnRegistro(texto: string): Promise<ResultadoRegistro> {
  comprobarEntrada("app/panel/(app)/autorrelleno/acciones#buscarEnRegistro", [texto]);
  if (!hayClaveApiEmpresas()) return { ok: false, error: '', apagado: true };
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data: est } = await s.supabase.rpc('autorrelleno_empresas_estado');
  if (!(est as { activo?: boolean } | null)?.activo) return { ok: false, error: '', apagado: true };
  const limpio = (texto ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const cif = cifNormal(limpio);
  const esCif = /^[A-Z]?\d{7,8}[A-Z0-9]?$/.test(cif) && /\d{5}/.test(cif);
  if (!esCif && limpio.length < 3) return { ok: false, error: 'Escribe al menos 3 letras del nombre o el CIF completo.' };
  // 1. Lo ya consultado de ese CIF: sin coste.
  if (esCif) {
    const { data } = await s.supabase.rpc('empresa_registro_guardada', { p_cif: cif });
    const g = (data ?? [])[0];
    if (g) return { ok: true, empresas: [{ cif: g.cif, razon_social: g.razon_social, direccion: g.direccion ?? '', codigo_postal: g.codigo_postal ?? '',
      poblacion: g.poblacion ?? '', provincia: g.provincia ?? '', estado: g.estado ?? '' }] };
  }
  // 2. Apuntar la consulta de pago (tope del usuario y saldo del bono).
  const ap = await s.supabase.rpc('empresa_registro_apuntar_consulta', { p_tipo: esCif ? 'cif' : 'nombre', p_texto: esCif ? cif : limpio });
  if (ap.error) {
    const m = ap.error.message;
    if (m.includes('autorrelleno_apagado')) return { ok: false, error: '', apagado: true };
    if (m.includes('autorrelleno_tope')) return { ok: false, error: `Has llegado al máximo de búsquedas de hoy. ${A_MANO}` };
    return { ok: false, error: `Ahora no se puede buscar en el Registro. ${A_MANO}` };
  }
  // 3. La API.
  const r = await consultarApiEmpresas(esCif ? 'cif' : 'nombre', esCif ? cif : limpio);
  if (!r.ok) {
    if (r.motivo === 'sin_saldo') await s.supabase.rpc('empresa_registro_sin_saldo');
    if (r.motivo === 'no_encontrada') return { ok: false, error: `No la encontramos en el Registro (los autónomos y las sociedades muy recientes no salen). ${A_MANO}` };
    return { ok: false, error: `Ahora no se puede buscar en el Registro. ${A_MANO}` };
  }
  // 4. Guardar lo que devolvió (solo el servidor), para no volver a pagarlo.
  const sv = supabaseServicio();
  if (sv) {
    await Promise.all(r.empresas.map((e) => sv.rpc('empresa_registro_guardar', {
      p_cif: e.cif, p_razon_social: e.razon_social, p_direccion: e.direccion, p_codigo_postal: e.codigo_postal,
      p_poblacion: e.poblacion, p_provincia: e.provincia, p_estado: e.estado,
    }))).catch(() => {});
  }
  return { ok: true, empresas: r.empresas };
}
