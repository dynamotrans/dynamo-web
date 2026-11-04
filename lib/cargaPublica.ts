// Nombre de la cookie con la reserva de una oferta (página pública "aceptar carga").
export const cookieReserva = (token: string) => `dyn_res_${token.replace(/[^a-f0-9]/gi, '').slice(0, 12)}`;
// Marca de que el transportista se dio de alta online desde esta carga (para enseñarle
// «estamos verificando tus datos» en vez de «estamos revisando tu precio»).
export const cookieAlta = (token: string) => `dyn_alta_${token.replace(/[^a-f0-9]/gi, '').slice(0, 12)}`;
