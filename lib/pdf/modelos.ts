import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { A4 } from './lienzo';

// Modelos EN BLANCO de la pantalla Recursos (copiados del mockup: cmrModeloVacioPDF y
// cartaPorteVaciaPDF de dashboard.html), para imprimir y rellenar a mano.

// CMR oficial en blanco: los 4 ejemplares del impreso (remitente rojo, destinatario azul,
// porteador verde, administración negro), sin ningún dato.
export async function cmrEnBlanco(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('CMR — modelo en blanco');
  for (const n of [1, 2, 3, 4]) {
    const img = await doc.embedJpg(await readFile(path.join(process.cwd(), 'images', `cmr-fondo-${n}.jpg`)));
    doc.addPage([A4.w, A4.h]).drawImage(img, { x: 0, y: 0, width: A4.w, height: A4.h });
  }
  return doc.save();
}

// Carta de porte nacional en blanco (mismo dibujo que el mockup).
export async function cartaPorteEnBlanco(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Carta de porte nacional — modelo en blanco');
  const pg = doc.addPage([A4.w, A4.h]);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0.08, 0.08, 0.28), borde = rgb(0.6, 0.6, 0.65);
  const txt = (x: number, top: number, s: string, size: number, bold = false) =>
    pg.drawText(s, { x, y: A4.h - top, size, font: bold ? fb : f, color: tinta });
  const campo = (x: number, top: number, w: number, h: number, rotulo: string) => {
    txt(x, top, rotulo, 8, true);
    pg.drawRectangle({ x, y: A4.h - (top + 4 + h), width: w, height: h, borderColor: borde, borderWidth: 1 });
  };
  txt(42, 60, 'CARTA DE PORTE', 20, true);
  txt(42, 78, 'Transporte nacional de mercancías por carretera', 9);
  txt(430, 60, 'Nº __________', 10, true);
  txt(430, 76, 'Fecha ___ / ___ / ______', 9);
  const L = 42, R = 305, col = 248;
  campo(L, 100, col, 58, '1. Remitente (nombre, dirección, CIF)');
  campo(R, 100, col, 58, '2. Destinatario (nombre, dirección, CIF)');
  campo(L, 176, col, 44, '3. Lugar y fecha de carga');
  campo(R, 176, col, 44, '4. Lugar de entrega');
  campo(L, 236, 511, 96, '5. Mercancía (naturaleza, embalaje, marcas)');
  campo(L, 348, 160, 40, '6. Nº de bultos');
  campo(214, 348, 160, 40, '7. Peso bruto (kg)');
  campo(388, 348, 165, 40, '8. Volumen (m³)');
  campo(L, 404, 511, 60, '9. Instrucciones / observaciones');
  campo(L, 480, 160, 40, '10. Matrícula');
  campo(214, 480, 160, 40, '11. Conductor');
  campo(388, 480, 165, 40, '12. Portes');
  campo(L, 560, 160, 70, 'Firma y sello del REMITENTE');
  campo(214, 560, 160, 70, 'Firma y sello del TRANSPORTISTA');
  campo(388, 560, 165, 70, 'Firma y sello del DESTINATARIO');
  txt(42, 660, 'Documento orientativo. Cumplimenta a mano los datos, fecha, firmas y sellos según proceda.', 8);
  return doc.save();
}
