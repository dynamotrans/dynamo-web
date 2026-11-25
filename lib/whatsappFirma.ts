// Firma de los avisos de Meta (WhatsApp): solo en el servidor (usa node:crypto). Va aparte de
// lib/whatsapp.ts porque aquello también lo usa el navegador.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta firma cada aviso con la clave secreta de la app: «sha256=<hex>» del cuerpo tal cual. */
export function firmaValida(cuerpo: string, cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || !cabecera || !cabecera.startsWith('sha256=')) return false;
  const esperada = createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex');
  const recibida = cabecera.slice('sha256='.length).trim();
  if (!/^[0-9a-f]{64}$/i.test(recibida)) return false;
  return timingSafeEqual(Buffer.from(esperada, 'hex'), Buffer.from(recibida.toLowerCase(), 'hex'));
}
