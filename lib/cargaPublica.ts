// Nombre de la cookie con la reserva de una oferta (página pública "aceptar carga").
export const cookieReserva = (token: string) => `dyn_res_${token.replace(/[^a-f0-9]/gi, '').slice(0, 12)}`;
