import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Lienzo, COLOR, A4, eur, fechaCorta } from './lienzo';
import type { DatosDynamo } from './datos';

// FACTURA PROFORMA de un almacenamiento con pago por adelantado (buildProforma de
// dashboard.html): cabecera morada, emisor y cliente, concepto, base + IVA + total, datos
// para la transferencia (con el aviso anti-fraude) y condiciones. Importes con 2 decimales.
export type DatosProforma = {
  codigo: string; referencia_cliente: string | null; creado_en: string;
  cliente: { razon_social: string; cif: string; direccion: string | null; codigo_postal: string | null; poblacion: string | null; pais: string | null };
  almacen: string; fecha_entrada: string; fecha_salida: string; num_trailers: number; descripcion: string | null;
  num_repartos: number; entrega: string | null;
  importe_almacenaje: number; importe_reparto: number; iva: number;   // % de IVA
  dynamo: DatosDynamo;
};

export async function proforma(d: DatosProforma): Promise<Uint8Array> {
  const l = await Lienzo.crear();
  const W = A4.w, mL = 40, mR = W - 40;
  const blanco = COLOR.blanco, morado = COLOR.morado, gris = COLOR.gris, navy = COLOR.navy;

  // Cabecera
  l.rect(0, 0, W, 74, morado);
  try {
    const logo = await l.doc.embedPng(await readFile(path.join(process.cwd(), 'images', '4.png')));
    const h = 30, w = h * logo.width / logo.height;
    l.pag.drawImage(logo, { x: mL, y: A4.h - 18 - h, width: w, height: h });
  } catch { l.texto(mL, 34, 'dynamo', 23, { bold: true, color: blanco }); }
  l.texto(mL + 2, 63, 'Operador Logístico', 9, { color: blanco });
  l.textoDer(mR, 33, 'FACTURA PROFORMA', 14, { bold: true, color: blanco });
  l.textoDer(mR, 50, 'Documento no contable · pago por adelantado', 8, { color: blanco });

  // Emisor y cliente
  const c = d.cliente, dy = d.dynamo;
  l.texto(mL, 104, 'EMISOR', 8, { bold: true, color: gris }); l.texto(320, 104, 'CLIENTE', 8, { bold: true, color: gris });
  l.texto(mL, 119, dy.razon_social, 10.5, { bold: true }); l.texto(320, 119, c.razon_social, 10.5, { bold: true });
  l.texto(mL, 133, `CIF ${dy.cif}`, 9); l.texto(320, 133, `CIF ${c.cif}`, 9);
  l.texto(mL, 146, dy.email, 9, { color: gris });
  l.texto(320, 146, [c.direccion, [c.codigo_postal, c.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', '), 9, { color: gris });
  l.texto(mL, 159, `${dy.telefono} · ${dy.web}`, 9, { color: gris }); l.texto(320, 159, c.pais ?? '', 9, { color: gris });

  // Nº, fecha y referencia
  l.rect(mL, 174, mR - mL, 26, COLOR.fondo);
  const pno = `PRO-${d.codigo}`;
  l.texto(mL + 10, 184, 'Nº PROFORMA', 7.5, { bold: true, color: gris }); l.texto(mL + 10, 196, pno, 10, { bold: true });
  l.texto(240, 184, 'FECHA', 7.5, { bold: true, color: gris }); l.texto(240, 196, fechaCorta(new Date().toISOString().slice(0, 10)), 10, { bold: true });
  l.texto(370, 184, 'REFERENCIA', 7.5, { bold: true, color: gris }); l.texto(370, 196, d.referencia_cliente || '—', 10, { bold: true });

  // Conceptos
  l.rect(mL, 214, mR - mL, 20, navy);
  l.texto(mL + 10, 228, 'CONCEPTO', 8.5, { bold: true, color: blanco }); l.textoDer(mR - 10, 228, 'IMPORTE', 8.5, { bold: true, color: blanco });
  let y = 254;
  const linea = (t: string, sub: string, imp: number) => {
    l.texto(mL + 10, y, t, 10, { bold: true }); l.textoDer(mR - 10, y, eur(imp), 10, { bold: true });
    l.texto(mL + 10, y + 13, sub, 8.5, { color: gris });
    y += 32;
  };
  linea(`Almacenamiento ${d.codigo} · ${d.almacen}`,
    `${d.num_trailers} tráiler${d.num_trailers === 1 ? '' : 'es'} · entrada ${fechaCorta(d.fecha_entrada)} · salida ${fechaCorta(d.fecha_salida)}${d.descripcion ? ` · ${d.descripcion}` : ''}`.slice(0, 120),
    d.importe_almacenaje);
  if (d.num_repartos > 0) linea(`Reparto urbano · ${d.num_repartos} ${d.num_repartos === 1 ? "camión" : "camiones"}`, d.entrega ? `Entrega en ${d.entrega}`.slice(0, 120) : 'Radio máximo 20 km del almacén', d.importe_reparto);
  l.linea(mL, y - 8, mR, y - 8);

  const base = Math.round((d.importe_almacenaje + d.importe_reparto) * 100) / 100;
  const iva = Math.round(base * d.iva) / 100, total = Math.round((base + iva) * 100) / 100;
  l.texto(360, y + 8, 'Base imponible', 9.5, { color: gris }); l.textoDer(mR - 10, y + 8, eur(base), 9.5);
  l.texto(360, y + 24, `IVA (${String(d.iva).replace('.', ',')}%)`, 9.5, { color: gris }); l.textoDer(mR - 10, y + 24, eur(iva), 9.5);
  l.rect(348, y + 32, mR - 348, 26, morado);
  l.texto(360, y + 49, 'TOTAL A PAGAR', 10.5, { bold: true, color: blanco }); l.textoDer(mR - 10, y + 50, eur(total), 12, { bold: true, color: blanco });
  y += 84;

  // Datos para la transferencia
  l.texto(mL, y, 'DATOS PARA LA TRANSFERENCIA', 9, { bold: true, color: morado });
  l.linea(mL, y + 6, mR, y + 6);
  y += 22;
  const filas: [string, string, boolean][] = [
    ['Titular', dy.razon_social, false], ['CIF', dy.cif, false],
    ['IBAN', dy.iban || 'Pídenoslo por teléfono (' + dy.telefono + ') antes de pagar', !!dy.iban],
    ['Banco', [dy.banco, dy.bic].filter(Boolean).join(' · '), false],
    ['Importe (IVA incluido)', eur(total), true], ['Concepto', pno, false],
  ];
  for (const [k, v, b] of filas) { l.texto(mL, y, k, 9, { bold: true, color: gris }); l.texto(200, y, v, 9, { bold: b }); y += 15; }
  y += 6;
  const seg = `Al ordenar la transferencia, tu banco mostrará el nombre del beneficiario: debe coincidir exactamente con ${dy.razon_social} (CIF ${dy.cif}). Si el titular no coincide, no autorices el pago. Nuestro IBAN es siempre este y nunca cambiamos de cuenta por email; ante cualquier duda llama al ${dy.telefono} antes de pagar.`;
  const segL = l.partir(seg, 7.8, mR - mL - 20);
  l.rect(mL, y, mR - mL, 18 + segL.length * 10.5, COLOR.ambarSuave);
  l.texto(mL + 10, y + 12, 'SEGURIDAD', 8, { bold: true, color: COLOR.ambar });
  segL.forEach((t, i) => l.texto(mL + 10, y + 24 + i * 10.5, t, 7.8, { color: navy }));
  y += 30 + segL.length * 10.5;

  // Condiciones
  l.y = y;
  l.parrafo('El almacenamiento no se gestiona ni se reserva espacio hasta validar el pago (la validación puede tardar hasta 24 h). El plazo de entrada empieza a contar desde que validamos el pago.', 7.6, { color: gris });

  // Pie
  l.linea(mL, 806, mR, 806);
  const pie1 = `${dy.razon_social} · CIF ${dy.cif} · ${dy.email} · ${dy.telefono} · ${dy.web}`;
  l.texto((W - l.medida(pie1, 7.5)) / 2, 818, pie1, 7.5, { color: gris });
  const pie2 = 'Documento proforma sin valor contable. Se emitirá factura al validar el pago.';
  l.texto((W - l.medida(pie2, 7.5)) / 2, 829, pie2, 7.5, { color: gris });
  return l.guardar();
}
