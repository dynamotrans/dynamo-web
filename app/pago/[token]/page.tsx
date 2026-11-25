import type { Metadata } from 'next';
import { supabasePublico } from '@/lib/supabase/publico';
import { stripeListo } from '@/lib/stripe';
import PagoPublico from './PagoPublico';
import type { PagoPublicoDatos } from './tipos';
import '../../panel/(app)/dashboard.css';
import '../pago.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pago del envío · Dynamo', robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false, date: false } };

// PÁGINA PÚBLICA DE PAGO (usuario, 2026-11-25): el botón «Pagar el envío» del email abre esto
// SIN entrar en la plataforma, para poder reenviar el email a quien paga (otro departamento).
// Solo enseña lo mínimo de un envío pendiente de pago y deja pagarlo. La llave del enlace es
// la única credencial; aquí no hay sesión ni forma de llegar a nada más.
export default async function PaginaPago({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pago?: string }> }) {
  const { token } = await params;
  const { pago } = await searchParams;
  const sb = supabasePublico();
  let datos: PagoPublicoDatos = { resultado: 'error' };
  if (!/^[0-9a-f-]{36}$/i.test(token)) datos = { resultado: 'enlace_no_valido' };
  else if (sb) {
    const { data: mant } = await sb.rpc('mantenimiento_activo');
    if (mant) datos = { resultado: 'mantenimiento' };
    else {
      const { data, error } = await sb.rpc('pago_publico', { p_token: token });
      if (!error && data) datos = data as unknown as PagoPublicoDatos;
    }
  }
  return <PagoPublico token={token} datos={datos} conTarjeta={stripeListo()} vuelta={pago === 'ok' || pago === 'cancelado' ? pago : null} />;
}
