import 'server-only';
import { createHash } from 'node:crypto';

// Canal de la plataforma en vivo de una página con enlace (bolsa de cargas, firma del CMR):
// «enlace:» + SHA-256 de la llave, igual que lo calcula la base de datos (migración
// en_vivo_enlaces). La llave no viaja en claro por Realtime.
export function canalEnlace(token: string): string {
  return 'enlace:' + createHash('sha256').update(token.toLowerCase()).digest('hex');
}
