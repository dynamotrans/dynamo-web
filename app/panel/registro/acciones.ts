'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { origen } from '@/lib/origen';
import { validaIdFiscal, validaIdFiscalPais } from '@/lib/idFiscal';
import { esPaisValido, PREFIJOS, normalizaTel } from '@/lib/paises';

// ALTA DE CLIENTE desde el portal. No hay contraseña en este paso: Supabase manda al email
// un enlace y un código de 6 cifras; con cualquiera de los dos se entra y se crea la
// contraseña. La cuenta nace como CLIENTE y PENDIENTE DE VERIFICAR (lo impone la base de
// datos, fn_crear_perfil_usuario): no ve nada hasta que Dynamo la activa en «Altas».
// Lo que escribe aquí va en los metadatos de Auth; solo Dynamo lo lee (altas_pendientes).
export type DatosAlta = {
  email: string; empresa: string; cif: string; pais: string; direccion: string; codigo_postal: string;
  poblacion: string; provincia: string; nombre: string; dni: string; prefijo: string; telefono: string;
};
export type EstadoAlta = { error: string | null; campo?: keyof DatosAlta | 'acepto'; datos?: DatosAlta };

const limpio = (v: FormDataEntryValue | null, max = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export async function registrar(_prev: EstadoAlta, f: FormData): Promise<EstadoAlta> {
  const d: DatosAlta = {
    email: limpio(f.get('email'), 254).toLowerCase(), empresa: limpio(f.get('empresa')), cif: limpio(f.get('cif'), 30).toUpperCase(),
    pais: limpio(f.get('pais'), 2).toUpperCase() || 'ES', direccion: limpio(f.get('direccion')), codigo_postal: limpio(f.get('codigo_postal'), 12),
    poblacion: limpio(f.get('poblacion')), provincia: limpio(f.get('provincia')), nombre: limpio(f.get('nombre')),
    dni: limpio(f.get('dni'), 30).toUpperCase(), prefijo: limpio(f.get('prefijo'), 6) || '+34', telefono: limpio(f.get('telefono'), 30),
  };
  const mal = (campo: EstadoAlta['campo'], error: string): EstadoAlta => ({ error, campo, datos: d });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return mal('email', 'Escribe un email válido: ahí te llega el código para entrar.');
  if (d.empresa.length < 2) return mal('empresa', 'Escribe el nombre de la empresa o, si eres autónomo, tu nombre completo.');
  const id = validaIdFiscalPais(d.cif, d.pais);
  if (!id || !id.ok) return mal('cif', `El CIF / NIF no es válido${id?.tipo ? ` (${id.tipo}: ${id.msg})` : ''}. Revísalo: se usa para facturar.`);
  if (!esPaisValido(d.pais)) return mal('pais', 'Elige el país de la empresa.');
  if (!PREFIJOS.some(([p]) => p === d.prefijo)) return mal('telefono', 'Elige el prefijo del teléfono.');
  if (d.direccion.length < 3) return mal('direccion', 'Escribe la dirección fiscal (calle y número).');
  if (!d.codigo_postal || !d.poblacion) return mal('codigo_postal', 'Escribe el código postal y la población.');
  if (d.nombre.length < 3) return mal('nombre', 'Escribe tu nombre y apellidos (la persona que usará la cuenta).');
  if (d.dni) { const r = validaIdFiscal(d.dni); if (!r || !r.ok) return mal('dni', 'El DNI / NIE no es válido. Revísalo o déjalo en blanco.'); }
  const tel = normalizaTel(d.prefijo + d.telefono);
  if (!/^\+[0-9]{8,15}$/.test(tel)) return mal('telefono', 'Escribe un teléfono de contacto (móvil, a ser posible).');
  if (f.get('acepto') !== 'on') return mal('acepto', 'Para crear la cuenta tienes que aceptar el Aviso legal y la Política de privacidad.');

  const supabase = await supabaseServidor(true);
  if (!supabase) return mal(undefined, 'La plataforma no está conectada a la base de datos.');
  const { error } = await supabase.auth.signInWithOtp({
    email: d.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await origen()}/panel/confirmar`,
      data: {
        tipo_usuario: 'cliente', empresa: d.empresa, cif: d.cif.replace(/[\s.\-]/g, ''), pais: d.pais, direccion: d.direccion,
        codigo_postal: d.codigo_postal, poblacion: d.poblacion, provincia: d.provincia, nombre: d.nombre,
        dni: d.dni.replace(/[\s.\-]/g, ''), telefono: tel, condiciones_aceptadas_en: new Date().toISOString(),
      },
    },
  });
  if (error) {
    if (/rate limit|too many|security purposes/i.test(error.message)) {
      return mal(undefined, 'Se han pedido varios códigos seguidos. Espera unos minutos y vuelve a probar.');
    }
    if (!error.status || error.status >= 500) return mal(undefined, 'Ahora mismo no se puede enviar el email. Prueba en un momento o llámanos al +34 955 225 945.');
    return mal(undefined, 'No se ha podido crear la cuenta. Revisa el email o escríbenos a info@dynamotrans.com.');
  }
  redirect(`/panel/registro/codigo?email=${encodeURIComponent(d.email)}`);
}

export type EstadoCodigo = { error: string | null; reenviado?: boolean };

export async function comprobarCodigo(_prev: EstadoCodigo, f: FormData): Promise<EstadoCodigo> {
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
