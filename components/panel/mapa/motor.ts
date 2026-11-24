// EL MOTOR DEL MAPA. Las pantallas (mapa del envío y mapa general) dibujan contra estas pocas
// piezas —líneas, marcas con su HTML, etiquetas y ventanitas— y el motor las pinta:
//   · GOOGLE MAPS cuando la plataforma tiene su clave del navegador (usuario, 2026-11-24:
//     «todo entorno Google», nada de Leaflet ni de OpenStreetMap a la vista);
//   · la reserva libre (Leaflet + OpenStreetMap) sin clave: pruebas automáticas y local.
// Así el dibujo (qué tramo va hecho, qué etiqueta cabe, qué se resalta) es UNO solo.
export type LL = [number, number];
export type Direccion = 'top' | 'bottom' | 'left' | 'right';
export type EstiloLinea = { color: string; grosor: number; opacidad: number; discontinua?: boolean };

export interface Linea { estilo(e: EstiloLinea): void; alFrente(): void }
export interface Marca { el(): HTMLElement | null }
export interface Etiqueta {
  contenido(html: string): void;
  colocar(dir: Direccion, desplazamiento: [number, number]): void;
  el(): HTMLElement | null;
  quitar(): void;
}
export type OpcionesMarca = {
  html: string; ancho: number; alto: number; clase: string; titulo?: string;
  encima?: boolean;          // por delante de las demás (los camiones)
  ventana?: string;          // HTML de la ventanita que se abre al pulsarla
  alPulsar?: () => void;
};
export interface Grupo {
  linea(puntos: LL[], estilo: EstiloLinea, alPulsar?: () => void): Linea;
  /** Línea invisible y ancha, para acertar con el dedo. */
  toque(puntos: LL[], alPulsar: () => void): void;
  marca(en: LL, o: OpcionesMarca): Marca;
  etiqueta(en: LL, html: string, clase: string): Etiqueta;
  mostrar(): void;
  ocultar(): void;
  vaciar(): void;
}
export interface Motor {
  nombre: 'google' | 'libre';
  grupo(visible?: boolean): Grupo;
  alPulsarFondo(f: () => void): void;
  /** Tras cada cambio de zoom, con el mapa ya recolocado. Devuelve cómo dejar de escuchar. */
  alCambiarZoom(f: () => void): () => void;
  contenedor(): HTMLElement;
  encuadrar(puntos: LL[], zoomMaximo: number): void;
  centrar(en: LL, zoom: number): void;
  recalcular(): void;
  destruir(): void;
}

export const CLAVE_GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

export async function crearMotor(div: HTMLElement, centro: LL, zoom: number): Promise<Motor> {
  if (CLAVE_GOOGLE) {
    try { return await (await import('./motorGoogle')).crearMotorGoogle(div, centro, zoom, CLAVE_GOOGLE); }
    catch (e) { console.error('[mapa] Google Maps no ha cargado; se usa el mapa de reserva', e); }
  }
  return (await import('./motorLibre')).crearMotorLibre(div, centro, zoom);
}
