'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { origen } from '@/lib/origen';
import { validaIdFiscalPais } from '@/lib/idFiscal';
import { esPaisValido, PREFIJOS, normalizaTel } from '@/lib/paises';
import { CONTACTO } from '@/lib/atencion';
import { turnstileOk } from '@/lib/servidor/turnstile';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// ALTA DE CLIENTE desde el portal. No hay contraseña en este paso: Supabase manda al email
// un enlace y un código de 6 cifras; con cualquiera de los dos se entra y se crea la
// contraseña. La cuenta nace como CLIENTE y PENDIENTE DE VERIFICAR (lo impone la base de
// datos, fn_crear_perfil_usuario): no ve nada hasta que Dynamo la activa en «Altas».
// Lo que escribe aquí va en los metadatos de Auth; solo Dynamo lo lee (altas_pendientes).
// SOLO LA CUENTA (usuario, 2026-11-11: «1º cuenta aquí más simple»): email, nombre, DNI
// opcional y teléfono. La empresa (razón social, CIF, dirección…) NO se pide aquí: la
// asocia o la crea el equipo de Dynamo en «Altas» al activar la cuenta.
export type DatosAlta = { email: string; nombre: string; dni_pais: string; dni: string; prefijo: string; telefono: string };
export type EstadoAlta = { error: string | null; campo?: keyof DatosAlta | 'acepto'; datos?: DatosAlta };

const limpio = (v: FormDataEntryValue | null, max = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export async function registrar(_prev: EstadoAlta, f: FormData): Promise<EstadoAlta> {
  comprobarEntrada("app/panel/registro/acciones#registrar", [_prev, f]);
  const d: DatosAlta = {
    email: limpio(f.get('email'), 254).toLowerCase(), nombre: limpio(f.get('nombre')),
    dni_pais: limpio(f.get('dni_pais'), 2).toUpperCase() || 'ES', dni: limpio(f.get('dni'), 30).toUpperCase(),
    prefijo: limpio(f.get('prefijo'), 6) || '+34', telefono: limpio(f.get('telefono'), 30),
  };
  const mal = (campo: EstadoAlta['campo'], error: string): EstadoAlta => ({ error, campo, datos: d });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return mal('email', 'Escribe un email válido: ahí te llega el código para entrar.');
  if (d.nombre.length < 3) return mal('nombre', 'Escribe tu nombre y apellidos (la persona que usará la cuenta).');
  if (!PREFIJOS.some(([p]) => p === d.prefijo)) return mal('telefono', 'Elige el prefijo del teléfono.');
  // DNI / NIE obligatorio (usuario, 2026-11-11), validado según el país del documento:
  // España con la letra de control; otros países, formato razonable (letras y números).
  if (!esPaisValido(d.dni_pais)) return mal('dni', 'Elige el país del documento.');
  const doc = validaIdFiscalPais(d.dni, d.dni_pais);
  if (!doc || !doc.ok) return mal('dni', `El documento no es válido${doc?.tipo ? ` (${doc.tipo}: ${doc.msg})` : ''}. Revísalo.`);
  const tel = normalizaTel(d.prefijo + d.telefono);
  if (!/^\+[0-9]{8,15}$/.test(tel)) return mal('telefono', 'Escribe un teléfono de contacto (móvil, a ser posible).');
  if (f.get('acepto') !== 'on') return mal('acepto', 'Para crear la cuenta tienes que aceptar el Aviso legal y la Política de privacidad.');
  // Captcha (Cloudflare Turnstile, tarea 76): protege la cuota de emails frente a bots.
  if (!(await turnstileOk(f))) return mal(undefined, 'No hemos podido comprobar que no eres un robot. Recarga la página y vuelve a intentarlo.');

  const supabase = await supabaseServidor(true);
  if (!supabase) return mal(undefined, 'La plataforma no está conectada a la base de datos.');
  // Lista de bloqueo de altas (bloqueos_alta): mensaje neutro, sin revelar el bloqueo ni
  // dar vía de contacto (decisión del usuario, 2026-11-14). La base de datos lo rechaza
  // igualmente aunque alguien esquive este paso.
  const { data: bloqueada } = await supabase.rpc('alta_bloqueada', { p_email: d.email });
  if (bloqueada) return mal(undefined, 'Actualmente no estamos dando de alta nuevos usuarios. Sentimos las molestias.');
  const { error } = await supabase.auth.signInWithOtp({
    email: d.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await origen()}/panel/confirmar`,
      data: {
        tipo_usuario: 'cliente', nombre: d.nombre, dni: d.dni.replace(/[\s.\-]/g, ''), dni_pais: d.dni_pais, telefono: tel,
        condiciones_aceptadas_en: new Date().toISOString(),
      },
    },
  });
  if (error) {
    if (/rate limit|too many|security purposes/i.test(error.message)) {
      return mal(undefined, 'Se han pedido varios códigos seguidos. Espera unos minutos y vuelve a probar.');
    }
    if (!error.status || error.status >= 500) return mal(undefined, `Ahora mismo no se puede enviar el email. Prueba en un momento o llámanos al ${CONTACTO.telefono}.`);
    return mal(undefined, `No se ha podido crear la cuenta. Revisa el email o escríbenos a ${CONTACTO.email}.`);
  }
  redirect(`/panel/registro/codigo?email=${encodeURIComponent(d.email)}`);
}

export type EstadoCodigo = { error: string | null; reenviado?: boolean };

export async function comprobarCodigo(_prev: EstadoCodigo, f: FormData): Promise<EstadoCodigo> {
  comprobarEntrada("app/panel/registro/acciones#comprobarCodigo", [_prev, f]);
  const email = limpio(f.get('email'), 254).toLowerCase();
  const token = String(f.get('codigo') ?? '').replace(/\D/g, '');
  if (!email) return { error: 'Falta el email. Vuelve a empezar el alta.' };
  if (token.length !== 6) return { error: 'Escribe las 6 cifras del código que te hemos enviado.' };
  const supabase = await supabaseServidor(true);
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.' };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    if (!error.status || error.status >= 500) return { error: 'Ahora mismo no se puede comprobar el código. Prueba en un momento.' };
    return { error: 'El código no es correcto o ha caducado. Revísalo o pide otro.' };
  }
  redirect('/panel/nueva-contrasena');
}

export async function reenviarCodigo(_prev: EstadoCodigo, f: FormData): Promise<EstadoCodigo> {
  comprobarEntrada("app/panel/registro/acciones#reenviarCodigo", [_prev, f]);
  const email = limpio(f.get('email'), 254).toLowerCase();
  const supabase = await supabaseServidor(true);
  if (!supabase || !email) return { error: 'No se ha podido reenviar. Vuelve a empezar el alta.' };
  // Sin crear usuario: el alta ya existe. Misma respuesta pase lo que pase.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${await origen()}/panel/confirmar` } });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) {
    return { error: 'Espera un minuto antes de pedir otro código.' };
  }
  return { error: null, reenviado: true };
}
