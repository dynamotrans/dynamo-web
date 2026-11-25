import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { brevoConectado, brevoGuardarContacto, brevoListaPorNombre } from '@/lib/servidor/brevo';
import { atributosBrevo, type SitioParaBrevo } from '@/lib/brevoSitios';

// SITIOS → BREVO (usuario, 2026-11-25): «quiero que esos mails de sitios, de todos los sitios,
// se suban a Brevo… otra lista: 04-SITIOS-DYNAMO, por diferenciar». Sube a su lista de Brevo
// los emails de sitios que la base de datos dice que tocan (nuevos, cambiados o reintentos) y
// apunta el resultado. No envía ningún email: eso lo decide él en Brevo.
// Lo llaman la tarea diaria de la base de datos (/api/brevo/sitios), que solo sube si el
// interruptor está encendido, y el botón de Mantenimiento (`aunqueApagado`), que es la subida
// a mano después de revisar la lista («OK, reviso», 2026-11-25).

export type ResultadoBrevoSitios =
  | { estado: 'apagado' | 'sin_clave' | 'sin_servicio' }
  | { estado: 'error'; error: string }
  | { estado: 'ok'; subidos: number; errores: number; quedan: boolean; lista: string; listaCreada: boolean };

const TANDA = 200;

export async function subirSitiosABrevo(opciones?: { aunqueApagado?: boolean }): Promise<ResultadoBrevoSitios> {
  const sb = supabaseServicio();
  if (!sb) return { estado: 'sin_servicio' };
  const { data: ps } = await sb.from('parametros').select('clave, valor').in('clave', ['brevo_sitios_activo', 'brevo_sitios_lista', 'brevo_sitios_lista_id']);
  const p = new Map((ps ?? []).map((x) => [x.clave, x.valor as unknown]));
  const activo = p.get('brevo_sitios_activo');
  if (activo !== true && activo !== 'true' && !opciones?.aunqueApagado) return { estado: 'apagado' };
  if (!brevoConectado()) return { estado: 'sin_clave' };
  const nombre = String(p.get('brevo_sitios_lista') ?? '').trim() || '04-SITIOS-DYNAMO';

  // La lista: la ya localizada si sigue llamándose igual; si no, se busca (o se crea).
  const guardada = (p.get('brevo_sitios_lista_id') ?? {}) as { id?: number; nombre?: string };
  let lista = Number(guardada.id) > 0 && guardada.nombre === nombre ? Number(guardada.id) : 0;
  let listaCreada = false;
  if (!lista) {
    const l = await brevoListaPorNombre(nombre);
    if (!l.ok) { console.error('[Brevo] lista de sitios', l.error); return { estado: 'error', error: l.error }; }
    lista = l.datos.id; listaCreada = l.datos.creada;
    await sb.from('parametros').update({ valor: { id: lista, nombre } }).eq('clave', 'brevo_sitios_lista_id');
  }

  const { data, error } = await sb.rpc('brevo_sitios_pendientes', { p_limite: TANDA });
  if (error) { console.error('[Brevo] pendientes', error.message); return { estado: 'error', error: 'No se han podido leer los sitios pendientes.' }; }
  const filas = (data ?? []) as SitioParaBrevo[];
  const hechas: { email: string; sitio_id: string | null; huella: string; estado: 'subido' | 'error'; error: string | null }[] = [];
  // De cuatro en cuatro: rápido, y muy por debajo del límite de llamadas de Brevo.
  for (let i = 0; i < filas.length; i += 4) {
    const trozo = filas.slice(i, i + 4);
    const res = await Promise.all(trozo.map((f) => brevoGuardarContacto(lista, f.email, atributosBrevo(f))));
    trozo.forEach((f, k) => hechas.push({ email: f.email, sitio_id: f.sitio_id, huella: f.huella, estado: res[k].ok ? 'subido' : 'error', error: res[k].ok ? null : (res[k] as { error: string }).error }));
    // La clave no vale o no tiene permiso: no tiene sentido seguir con el resto.
    const fallo = res.find((r) => !r.ok) as { error: string } | undefined;
    if (fallo && /Brevo (401|403)/.test(fallo.error)) break;
  }
  if (hechas.length) {
    const { error: e2 } = await sb.rpc('brevo_sitios_marcar', { p_filas: hechas });
    if (e2) console.error('[Brevo] apuntar resultado', e2.message);
  }
  const subidos = hechas.filter((h) => h.estado === 'subido').length;
  const errores = hechas.length - subidos;
  if (hechas.length) console.info('[Brevo] sitios', { subidos, errores, lista });
  return { estado: 'ok', subidos, errores, quedan: filas.length >= TANDA, lista: nombre, listaCreada };
}
