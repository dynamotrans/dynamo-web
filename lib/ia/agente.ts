import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { SB } from '@/lib/supabase/cliente';
import { hoyMadrid } from '@/lib/formato';

// ASISTENTE DE IA SOBRE LA BASE DE DATOS (usuario, 2026-11-11) — fase 1: solo Dynamo.
// El motor de Claude recibe la pregunta, el diccionario de datos y tres herramientas:
// `columnas` (detalle de una tabla), `sql` (UNA consulta de lectura, que la base de
// datos ejecuta CON LA SESIÓN del usuario que pregunta: la seguridad por filas manda,
// ver ia_consulta_sql) y `responder` (la respuesta final + 2-3 sugerencias de
// seguimiento). Las respuestas son cortas y numéricas a propósito (usuario: «no quiero
// textos largos, quiero datos objetivos»).

export type TurnoIA = { de: string; texto: string };   // de: 'yo' (usuario) | 'ia'
export type SalidaIA = {
  respuesta: string; sugerencias: string[];
  consultas: string[]; tokensEntrada: number; tokensSalida: number;
};

// claude-opus-5-5 por defecto; se puede cambiar sin tocar código (IA_MODELO en Vercel,
// p. ej. claude-haiku-5-5 si el coste manda sobre la finura).
const MODELO = process.env.IA_MODELO || 'claude-opus-5-5';
// Respaldo automático del servidor ante un rechazo de seguridad (recomendado para los
// modelos grandes; los pequeños no lo admiten).
const CON_RESPALDO = /opus-5-5|sonnet-5-5|fable/.test(MODELO);

const REGLAS = `Eres el asistente de datos de Dynamo Operador Logístico: respondes preguntas del equipo sobre la base de datos de la plataforma (envíos, clientes, transportistas, precios, incidencias…).

REGLAS DE ORO
- Responde SIEMPRE en español, CORTO y NUMÉRICO: la cifra primero y listas con «·»; nada de párrafos. Una línea de contexto como mucho (p. ej. «sin contar cancelados»).
- NUNCA inventes un dato: todo sale de la herramienta sql. Si el dato no existe o no aparece, dilo en una línea.
- Formatos españoles: euros «1.234 €» (sin decimales salvo que importen), fechas «13/11/26», números con punto de miles y coma decimal.
- La base de datos aplica los permisos del usuario por sí sola: si una consulta da error de permisos, di que no tiene acceso a eso.
- Antes de usar una tabla que no conozcas bien, pide su detalle con la herramienta columnas (tipos, listas de valores y descripciones).
- SQL de PostgreSQL: UNA sola consulta SELECT (o WITH) por llamada, sin punto y coma, máximo 200 filas. Prefiere agregados (count, sum, avg, group by) a traer filas de más. Las fechas «esta semana» son de lunes a domingo en Europa/Madrid.
- Si la consulta falla, corrígela y reintenta (máximo 3 intentos); si no sale, explica en una línea qué no se ha podido consultar.
- Al terminar llama SIEMPRE a la herramienta responder, con la respuesta y 2-3 sugerencias de seguimiento MUY cortas: preguntas que el usuario querría hacer a continuación y que tú puedas responder con estos datos.`;

type Fila = { tabla: string; columna: string; tipo: string; no_nulo: boolean; descripcion: string | null; tabla_descripcion: string | null };

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'columnas',
    description: 'Devuelve las columnas de una tabla con su tipo y su descripción del diccionario de datos (listas de valores admitidos incluidas).',
    input_schema: { type: 'object', properties: { tabla: { type: 'string', description: 'Nombre de la tabla, p. ej. envios' } }, required: ['tabla'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'sql',
    description: 'Ejecuta UNA consulta de LECTURA (SELECT o WITH, sin punto y coma) con los permisos del usuario y devuelve las filas en JSON (máximo 200).',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'La consulta SQL de lectura' } }, required: ['consulta'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'responder',
    description: 'Entrega la respuesta final al usuario. Llámala SIEMPRE para terminar.',
    input_schema: {
      type: 'object',
      properties: {
        respuesta: { type: 'string', description: 'La respuesta, corta y numérica' },
        sugerencias: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '2-3 preguntas de seguimiento muy cortas' },
      },
      required: ['respuesta', 'sugerencias'], additionalProperties: false,
    },
    strict: true,
  },
];

const recorta = (s: string, max: number) => (s.length > max ? s.slice(0, max) + ' …(recortado)' : s);

export async function preguntarAgenteIA(sb: SB, rol: string, historial: TurnoIA[], pregunta: string): Promise<SalidaIA> {
  const cliente = new Anthropic();   // ANTHROPIC_API_KEY del entorno (solo servidor)

  // El diccionario de datos (ya existía para n8n) es el mapa del asistente: la lista de
  // tablas va en el prompt y el detalle de columnas lo pide con la herramienta.
  const { data: dicc, error: errDicc } = await sb.rpc('diccionario_datos');
  if (errDicc || !dicc) throw new Error('No se ha podido leer el diccionario de datos.');
  const filas = dicc as Fila[];
  const tablas = [...new Map(filas.map((f) => [f.tabla, f.tabla_descripcion ?? ''])).entries()];
  const sistema = `${REGLAS}\n\nTABLAS (pide el detalle con la herramienta columnas):\n${tablas.map(([t, d]) => `- ${t}: ${d}`).join('\n')}`;

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    ...historial.map((m): Anthropic.Beta.BetaMessageParam => ({ role: m.de === 'yo' ? 'user' : 'assistant', content: m.texto })),
    { role: 'user', content: pregunta },
  ];

  const consultas: string[] = [];
  let tokensEntrada = 0, tokensSalida = 0;
  let final: { respuesta: string; sugerencias: string[] } | null = null;
  let textoSuelto = '';

  for (let paso = 0; paso < 8 && !final; paso++) {
    const r = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 1500,
      output_config: { effort: 'low' },
      ...(CON_RESPALDO ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system: [
        { type: 'text', text: sistema, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Hoy es ${hoyMadrid()} (Europa/Madrid). Quien pregunta tiene el rol «${rol}».` },
      ],
      tools: HERRAMIENTAS,
      messages: mensajes,
    });
    tokensEntrada += r.usage.input_tokens;
    tokensSalida += r.usage.output_tokens;
    if (r.stop_reason === 'refusal') {
      return { respuesta: 'No puedo ayudarte con esa pregunta.', sugerencias: [], consultas, tokensEntrada, tokensSalida };
    }
    for (const b of r.content) if (b.type === 'text' && b.text.trim()) textoSuelto = b.text.trim();
    const llamadas = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!llamadas.length) break;   // terminó hablando: usamos su texto tal cual

    mensajes.push({ role: 'assistant', content: r.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of llamadas) {
      if (u.name === 'responder') {
        const x = u.input as { respuesta?: string; sugerencias?: string[] };
        final = { respuesta: String(x.respuesta ?? '').trim(), sugerencias: (x.sugerencias ?? []).map(String).filter(Boolean).slice(0, 3) };
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: 'Entregada.' });
      } else if (u.name === 'columnas') {
        const t = String((u.input as { tabla?: string }).tabla ?? '').toLowerCase();
        const cols = filas.filter((f) => f.tabla === t).map((f) => `${f.columna} · ${f.tipo}${f.no_nulo ? '' : ' · opcional'} — ${f.descripcion ?? ''}`);
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: cols.length ? recorta(cols.join('\n'), 12000) : `La tabla «${t}» no existe.`, is_error: !cols.length });
      } else if (u.name === 'sql') {
        const q = String((u.input as { consulta?: string }).consulta ?? '');
        consultas.push(q);
        const { data, error } = await sb.rpc('ia_consulta_sql', { p_sql: q });
        resultados.push(error
          ? { type: 'tool_result', tool_use_id: u.id, content: `Error de la base de datos: ${error.message}`, is_error: true }
          : { type: 'tool_result', tool_use_id: u.id, content: recorta(JSON.stringify(data), 12000) });
      } else {
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: 'Herramienta desconocida.', is_error: true });
      }
    }
    mensajes.push({ role: 'user', content: resultados });
  }

  if (final?.respuesta) return { ...final, consultas, tokensEntrada, tokensSalida };
  if (textoSuelto) return { respuesta: textoSuelto, sugerencias: [], consultas, tokensEntrada, tokensSalida };
  return { respuesta: 'No he podido llegar a una respuesta; prueba a preguntarlo de otra forma.', sugerencias: [], consultas, tokensEntrada, tokensSalida };
}

/** Mensaje claro para los fallos de la API de Claude (clave, cupo, red). */
export function mensajeFalloIA(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave del asistente no es válida: revisa ANTHROPIC_API_KEY en Vercel.';
  if (e instanceof Anthropic.RateLimitError) return 'El motor de IA está saturado ahora mismo: espera unos segundos y repite la pregunta.';
  if (e instanceof Anthropic.APIConnectionError) return 'No hay conexión con el motor de IA: inténtalo de nuevo.';
  if (e instanceof Anthropic.APIError) return `El motor de IA ha fallado (${e.status ?? 'error'}): inténtalo de nuevo.`;
  return e instanceof Error ? e.message : 'El asistente ha fallado; inténtalo de nuevo.';
}
