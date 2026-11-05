import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib';

// Ayudas comunes para escribir los PDF de la plataforma con pdf-lib: coordenadas desde
// ARRIBA (como se piensa una hoja), cortes de línea por anchura real del texto, paso de
// página automático y limpieza de caracteres que las fuentes estándar no tienen.

export const A4 = { w: 595.28, h: 841.89 };
export const COLOR = {
  navy: rgb(0.07, 0.09, 0.18), gris: rgb(0.42, 0.45, 0.5), grisClaro: rgb(0.85, 0.87, 0.9), fondo: rgb(0.95, 0.96, 0.98),
  morado: rgb(0.2, 0, 0.8), moradoSuave: rgb(0.93, 0.91, 0.99), verde: rgb(0.13, 0.65, 0.35), rojo: rgb(0.72, 0.13, 0.13),
  ambar: rgb(0.71, 0.33, 0.04), ambarSuave: rgb(1, 0.97, 0.9), blanco: rgb(1, 1, 1), tinta: rgb(0.08, 0.08, 0.42),
};

// Las fuentes estándar del PDF solo saben escribir el juego "WinAnsi" (español, portugués,
// francés, alemán… sí; polaco o checo, no del todo). Lo que no esté, se aproxima sin
// tilde, y si no, '?'. Así un nombre polaco nunca rompe el documento.
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function limpio(s: unknown): string {
  const t = String(s ?? '').replace(/[\r\t]/g, ' ').replace(/ /g, ' ');
  let o = '';
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255) || EXTRA.has(ch) || ch === '\n') { o += ch; continue; }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    o += base && [...base].every((b) => b.codePointAt(0)! < 127) ? base : ({ 'ł': 'l', 'Ł': 'L', '→': '>', '≤': '<=', '≥': '>=', '·': '·' } as Record<string, string>)[ch] ?? '?';
  }
  return o;
}

export class Lienzo {
  doc!: PDFDocument; f!: PDFFont; fb!: PDFFont; pag!: PDFPage;
  y = 0;                                  // cursor, en puntos desde ARRIBA
  margen = { izq: 40, der: 40, arriba: 40, abajo: 56 };
  alNuevaPagina: ((l: Lienzo) => void) | null = null;

  static async crear(): Promise<Lienzo> {
    const l = new Lienzo();
    l.doc = await PDFDocument.create();
    l.f = await l.doc.embedFont(StandardFonts.Helvetica);
    l.fb = await l.doc.embedFont(StandardFonts.HelveticaBold);
    l.nuevaPagina();
    return l;
  }
  get ancho() { return A4.w - this.margen.izq - this.margen.der; }
  get x0() { return this.margen.izq; }
  nuevaPagina() {
    this.pag = this.doc.addPage([A4.w, A4.h]);
    this.y = this.margen.arriba;
    this.alNuevaPagina?.(this);
  }
  // Si no caben `alto` puntos más, pasa de página.
  sitio(alto: number) { if (this.y + alto > A4.h - this.margen.abajo) this.nuevaPagina(); }

  medida(s: string, size: number, bold = false) { return (bold ? this.fb : this.f).widthOfTextAtSize(limpio(s), size); }
  texto(x: number, top: number, s: unknown, size: number, o: { bold?: boolean; color?: RGB; pag?: PDFPage } = {}) {
    const t = limpio(s).replace(/\n/g, ' ');
    if (!t) return;
    (o.pag ?? this.pag).drawText(t, { x, y: A4.h - top, size, font: o.bold ? this.fb : this.f, color: o.color ?? COLOR.navy });
  }
  textoDer(xDer: number, top: number, s: unknown, size: number, o: { bold?: boolean; color?: RGB } = {}) {
    this.texto(xDer - this.medida(String(s ?? ''), size, o.bold), top, s, size, o);
  }
  rect(x: number, top: number, w: number, h: number, color: RGB, borde?: RGB) {
    this.pag.drawRectangle({ x, y: A4.h - top - h, width: w, height: h, color, borderColor: borde, borderWidth: borde ? 0.8 : 0 });
  }
  linea(x1: number, top1: number, x2: number, top2: number, color: RGB = COLOR.grisClaro, grosor = 0.6) {
    this.pag.drawLine({ start: { x: x1, y: A4.h - top1 }, end: { x: x2, y: A4.h - top2 }, thickness: grosor, color });
  }
  // Corta un texto en líneas que caben en `ancho` (respeta los saltos de línea propios).
  partir(s: unknown, size: number, ancho: number, bold = false): string[] {
    const out: string[] = [];
    for (const parrafo of limpio(s).split('\n')) {
      let cur = '';
      for (const w of parrafo.split(/ +/)) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && this.medida(t, size, bold) > ancho) { out.push(cur); cur = w; } else cur = t;
        while (this.medida(cur, size, bold) > ancho && cur.length > 1) {   // palabra más larga que la línea (una URL)
          let i = cur.length - 1; while (i > 1 && this.medida(cur.slice(0, i), size, bold) > ancho) i--;
          out.push(cur.slice(0, i)); cur = cur.slice(i);
        }
      }
      out.push(cur);
    }
    return out;
  }
  // Párrafo que fluye con el cursor (y pasa de página si hace falta).
  parrafo(s: unknown, size = 8.5, o: { bold?: boolean; color?: RGB; x?: number; ancho?: number; interlinea?: number; despues?: number } = {}) {
    const x = o.x ?? this.x0, ancho = o.ancho ?? this.ancho, il = o.interlinea ?? size * 1.32;
    for (const ln of this.partir(s, size, ancho, o.bold)) {
      this.sitio(il);
      this.texto(x, this.y + size, ln, size, o);
      this.y += il;
    }
    this.y += o.despues ?? 0;
  }
  async guardar(): Promise<Uint8Array> { return this.doc.save(); }
}

// Fechas y dinero: los formatos de la plataforma (regla 0: "1.020,00 €"; fecha "Vie 10/07/26").
import { euros, fecha, fechaHora, ventana, numero } from '@/lib/formato';
export const fechaCorta = (iso: string | null | undefined) => (iso ? fecha(iso) : '');
export const eur = (n: unknown) => euros(Number(n) || 0);
export const ventanaTxt = (desde: string | null, hasta: string | null) => ventana(desde, hasta);
export const ahoraMadrid = () => fechaHora(new Date().toISOString());
// Metros y toneladas con 2 decimales (regla del usuario).
export const num = (n: unknown) => (n == null || n === '' ? '' : numero(Number(n), 2));
