// «Hueco vacío al final de la página» en el iPhone (usuario, 2026-11-22 y 2026-11-25).
//
// QUÉ ES: un fallo del motor de navegación del iPhone (iOS 26; lo llevan Safari y Chrome, que
// en iPhone es el mismo motor). La pantalla se queda mirando MÁS ABAJO de donde acaba la
// página: debajo del contenido sale una zona vacía por la que se puede seguir bajando, y los
// botones fijos (subir arriba, menú) se quedan pegados al final de la página en vez de al
// borde de la pantalla. Pasa al cerrar el teclado y al pasar de una pantalla larga a otra más
// corta. No es que la página mida de más: lo que mide de más es la zona por la que el
// navegador deja desplazarse.
//
// Aquí solo está la DECISIÓN (¿está descuadrada la pantalla?), sin tocar el navegador, para
// poder probarla. Quien mide y recoloca es components/GuardaVista.tsx.

export type MedidaVista = {
  y: number;                  // cuánto se ha bajado la página (window.scrollY)
  alto: number;               // alto de la ventana (window.innerHeight)
  doc: number;                // alto total de la página
  contenido: number | null;   // dónde acaba el contenido
  vvAlto: number | null;      // alto de la zona que se ve
  vvArriba: number | null;    // desplazamiento de la zona que se ve respecto a la ventana
  vvPagina: number | null;    // dónde empieza la zona que se ve, medido sobre la página
  escala: number;             // zoom de pellizco (1 = sin zoom)
  campo: boolean;             // hay un campo de escribir con el cursor dentro
};

export type CausaVista = 'pasado_del_final' | 'zona_desplazada' | 'scroll_de_mas';

// Las barras del navegador al esconderse mueven la pantalla unos 100 px sin que sea un fallo.
const HOLGURA = 120;
const HOLGURA_ZONA = 40;

export function descuadre(m: MedidaVista): CausaVista | null {
  if (Math.abs(m.escala - 1) > 0.01) return null;                  // zoom de pellizco: lo ha puesto el usuario
  if (m.campo) return null;                                        // escribiendo: el teclado mueve la pantalla a propósito
  if (m.vvAlto != null && m.vvAlto < m.alto - 120) return null;    // teclado abierto
  const fin = Math.max(m.doc, m.alto);
  if (m.vvPagina != null && m.vvAlto != null && m.vvPagina + m.vvAlto > fin + HOLGURA) return 'pasado_del_final';
  if (m.vvArriba != null && Math.abs(m.vvArriba) > HOLGURA_ZONA) return 'zona_desplazada';
  if (m.y > Math.max(0, m.doc - m.alto) + HOLGURA) return 'scroll_de_mas';
  return null;
}

// Dónde tiene que quedar la página: donde estaba, sin pasarse del final.
export function destinoVista(m: MedidaVista): number {
  return Math.min(Math.max(0, m.y), Math.max(0, m.doc - m.alto));
}

// Otra cosa distinta, que solo se apunta: la página mide bastante más que su contenido.
export function paginaLarga(m: MedidaVista): boolean {
  return m.contenido != null && m.doc - Math.max(m.contenido, m.alto) > 200;
}

// De qué teléfono y navegador viene, en corto, para la lista de Mantenimiento.
export function navegadorCorto(ua: string): string {
  const ios = /iP(hone|ad|od)/.test(ua);
  const version = (ua.match(/OS (\d+)[_.](\d+)/) ?? []).slice(1, 3).join('.');
  const android = (ua.match(/Android (\d+)/) ?? [])[1];
  const nav = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS|Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  const equipo = ios ? `iPhone/iPad${version ? ` (iOS ${version})` : ''}` : android ? `Android ${android}` : 'Ordenador';
  return `${equipo} · ${nav}`;
}
