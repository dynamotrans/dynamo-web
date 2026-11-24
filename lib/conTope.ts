// Espera una respuesta como mucho «ms» milisegundos: si tarda más o falla, sigue con el valor
// por defecto. Para preguntas que mejoran una pantalla pero no deben dejarla colgada.
export function conTope<T>(p: Promise<T>, porDefecto: T, ms = 3000): Promise<T> {
  return new Promise<T>((resolver) => {
    const t = setTimeout(() => resolver(porDefecto), ms);
    p.then((v) => { clearTimeout(t); resolver(v); }, () => { clearTimeout(t); resolver(porDefecto); });
  });
}
