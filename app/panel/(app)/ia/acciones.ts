'use server';

import { sesion } from '@/lib/sesion';
import { esDynamo } from '@/lib/roles';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { preguntarAgenteIA, mensajeFalloIA } from '@/lib/ia/agente';

// Asistente de IA del panel (usuario, 2026-11-11) — fase 1: SOLO equipo Dynamo (admin,
// empleados y los de solo lectura). La pregunta viaja al motor de Claude en el servidor
// y las consultas SQL corren con la sesión de quien pregunta (la seguridad por filas
// manda). Cada pregunta queda en la auditoría ia_consultas.

type Res = { ok: true; respuesta: string; sugerencias: string[] } | { ok: false; error: string };

export async function preguntarIA(historial: { de: string; texto: string }[], pregunta: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/ia/acciones#preguntarIA", [historial, pregunta]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) {
    return { ok: false, error: 'El asistente de datos es solo para el equipo Dynamo (de momento).' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'El asistente no está configurado todavía: falta la clave ANTHROPIC_API_KEY en las variables de Vercel.' };
  }
  const p = pregunta.trim();
  if (!p) return { ok: false, error: 'Escribe una pregunta.' };
  try {
    // Como mucho los últimos 12 turnos: el chat no necesita más memoria y el coste baja.
    const r = await preguntarAgenteIA(s.supabase, s.perfil.rol, historial.slice(-12), p);
    // Auditoría de la pregunta (si fallara, la respuesta no se pierde por eso).
    await s.supabase.from('ia_consultas').insert({
      usuario_id: s.user.id, rol: s.perfil.rol, pregunta: p, respuesta: r.respuesta,
      consultas: r.consultas, tokens_entrada: r.tokensEntrada, tokens_salida: r.tokensSalida,
    }).then(() => undefined, () => undefined);
    return { ok: true, respuesta: r.respuesta, sugerencias: r.sugerencias };
  } catch (e) {
    return { ok: false, error: mensajeFalloIA(e) };
  }
}
