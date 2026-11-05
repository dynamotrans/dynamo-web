import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PDFImage, PDFPage, RGB } from 'pdf-lib';
import { Lienzo, COLOR, A4, num, fechaCorta, limpio } from './lienzo';
import { DYNAMO, type DatosDoc, type ParadaDoc } from './datos';
import { importe } from '@/lib/formato';

// CMR (carta de porte internacional) RELLENO, copiado del mockup: los 4 ejemplares del
// impreso OFICIAL (remitente rojo · destinatario azul · porteador verde · administración
// negro) de fondo a página completa, y los datos en tinta azul en cada casilla (las
// coordenadas son las del impreso original, medidas casilla a casilla).
// Remitente = cliente · porteador = Dynamo (envío de Dynamo, con su logo en B/N) o el
// operador del cliente (envío manual: SIN logo ni mención a Dynamo). Sin precios.

const DIR_IMG = path.join(process.cwd(), 'images');
const lineaDir = (p: ParadaDoc | undefined) => p
  ? [p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia !== p.poblacion ? p.provincia : null, p.pais].filter(Boolean).join(', ')
  : '';

export async function cmr(d: DatosDoc): Promise<Uint8Array> {
  const e = d.envio, manual = d.manual;
  const D = d.dynamo ?? DYNAMO;
  const l = await Lienzo.crear();
  const fondos = await Promise.all([1, 2, 3, 4].map(async (n) => l.doc.embedJpg(await readFile(path.join(DIR_IMG, `cmr-fondo-${n}.jpg`)))));
  const logo = manual ? null : await l.doc.embedPng(await readFile(path.join(process.cwd(), 'lib', 'pdf', 'recursos', 'logo-bn.png')));

  const rec = d.paradas.filter((x) => x.tipo === 'carga'), ent = d.paradas.filter((x) => x.tipo === 'descarga');
  const carga = rec[0], entrega = ent[ent.length - 1];
  const cli = d.cliente;
  const porteador = manual
    ? { nombre: d.porteador?.razon_social ?? '—', cif: d.porteador?.cif ?? null, tel: d.porteador?.telefono ?? null }
    : { nombre: 'Dynamo Operador de Transportes', cif: D.cif, tel: D.telefono };
  const hoy = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  const ROJA = COLOR.rojo, TINTA = COLOR.tinta;

  // Firmas del CMR digital: 22 la PRIMERA recogida, 23 el transportista, 24 la ÚLTIMA entrega
  // (las de otras paradas quedan en el registro de firmas, que es la prueba completa).
  const fechaFirma = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
  const firmaDe = (rol: string, parada: string | null | undefined) => (d.firmas ?? []).find((f) => f.rol === rol && (rol === 'transportista' || f.parada_id === parada));
  const casillas = await Promise.all(([
    ['remitente', carga?.id, 38, 742, 150],
    ['transportista', null, 195, 742, 165],
    ['destinatario', entrega?.id, 369, 765, 185],
  ] as const).map(async ([rol, parada, x, top, ancho]) => {
    const f = firmaDe(rol, parada);
    let img: PDFImage | null = null;
    if (f?.png) { try { img = await l.doc.embedPng(f.png); } catch { img = null; } }
    return f ? { f, img, x, top, ancho, alto: rol === 'destinatario' ? 24 : 40 } : null;
  }));

  // Una página por ejemplar, con los mismos datos.
  for (let i = 0; i < 4; i++) {
    const pg: PDFPage = i === 0 ? l.pag : l.doc.addPage([A4.w, A4.h]);
    pg.drawImage(fondos[i], { x: 0, y: 0, width: A4.w, height: A4.h });
    const t = (x: number, top: number, s: unknown, size: number, bold = true, color: RGB = TINTA) =>
      l.texto(x, top, s, size, { bold, color, pag: pg });
    // Casilla con varias líneas; `maxc` = caracteres aprox. por línea (como en el mockup).
    // `max` = líneas como mucho (las casillas pequeñas no admiten más: se corta con «…»).
    const dato = (x: number, top: number, lineas: { t?: string | null; s?: number; b?: boolean; c?: RGB; max?: number }[], maxc = 50) => {
      let y = top;
      for (const ln of lineas) {
        if (!ln.t) continue;
        const size = ln.s ?? 8.2, bold = ln.b !== false, ancho = maxc * size * 0.5;
        let partes = l.partir(ln.t, size, ancho, bold);
        if (ln.max && partes.length > ln.max) {
          partes = partes.slice(0, ln.max);
          let u = partes[ln.max - 1] + '…';
          while (u.length > 2 && l.medida(u, size, bold) > ancho) u = u.slice(0, -2) + '…';
          partes[ln.max - 1] = u;
        }
        for (const parte of partes) { t(x, y, parte, size, bold, ln.c ?? TINTA); y += 10; }
      }
    };

    // Nº de envío, en la franja blanca de arriba (no pisa el texto legal de la cabecera).
    t(468, 40, `Nº ${e.referencia_gx ?? ''}`, 9);
    if (logo) { const h = 22, w = h * logo.width / logo.height; pg.drawImage(logo, { x: 36, y: A4.h - 12 - h, width: w, height: h }); }

    // 1 Remitente
    dato(42, 110, [
      { t: cli?.razon_social ?? '—', s: 8.8 },
      { t: `CIF ${cli?.cif ?? '—'}`, s: 7.6, b: false },
      { t: [cli?.direccion, [cli?.codigo_postal, cli?.poblacion].filter(Boolean).join(' '), cli?.pais].filter(Boolean).join(' · '), s: 7.6, b: false },
    ], 48);
    // 2 Destinatario
    dato(42, 196, [{ t: entrega?.nombre_empresa || '—', s: 8.8, max: 1 }, { t: lineaDir(entrega), s: 7.6, b: false, max: 2 }], 56);
    // 3 Lugar de entrega
    dato(42, 238, [{ t: lineaDir(entrega), s: 8, max: 2 }, { t: entrega?.horarios ? `Horario: ${entrega.horarios}` : '', s: 7.4, b: false, max: 1 }], 56);
    // 4 Lugar y fecha de carga (caben DOS líneas antes del rótulo de la 5)
    const fCarga = e.fecha_carga_real ?? e.fecha_carga_desde;
    dato(42, 288, [
      { t: [carga?.direccion, [carga?.codigo_postal, carga?.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', '), s: 7.8, max: 1 },
      { t: [carga?.provincia !== carga?.poblacion ? carga?.provincia : null, carga?.pais, fCarga ? fechaCorta(fCarga) : null].filter(Boolean).join(' · '), s: 7.4, b: false, max: 1 },
    ], 58);
    // 5 Documentos anexos (referencias)
    const refs = [e.referencia_cliente && `Ref. ${e.referencia_cliente}`, ...d.paradas.map((p) => p.referencia && `${p.tipo === 'carga' ? 'Carga' : 'Entrega'}: ${p.referencia}`)].filter(Boolean).join(' · ');
    dato(42, 324, [{ t: refs || '—', s: 8, b: false }], 60);

    // 16 Porteador (nombre y, en una línea pequeña, CIF y teléfono)
    const nomLineas = l.partir(porteador.nombre, 8.4, 26 * 8.4 * 0.5, true).length;
    dato(438, 190, [{ t: porteador.nombre, s: 8.4 }], 26);
    dato(438, 190 + nomLineas * 10, [{ t: [porteador.cif && `CIF ${porteador.cif}`, porteador.tel].filter(Boolean).join(' · '), s: 6.8, b: false }], 44);
    // 17 Porteadores sucesivos: el transportista efectivo, su camión y su conductor
    dato(438, 236, [
      { t: manual ? '' : d.porteador?.razon_social ?? '—', s: 7.8, max: 2 },
      { t: [e.matricula_camion && `Matr. ${e.matricula_camion}`, e.matricula_remolque && `Rem. ${e.matricula_remolque}`].filter(Boolean).join(' · '), s: 7.4, b: false },
      { t: e.conductor_nombre ? `Conductor: ${e.conductor_nombre}` : '', s: 7.4, b: false },
    ], 34);
    // 18 Reservas y observaciones del porteador
    const QUIEN: Record<string, string> = { remitente: 'Remitente', transportista: 'Porteador', destinatario: 'Destinatario' };
    dato(438, 290, [
      ...(e.adr ? [{ t: 'MERCANCÍA ADR (peligrosa) — Acuerdo ADR', s: 7.6, c: ROJA }] : []),
      ...(d.reservas ?? []).slice(0, 3).map((r) => ({ t: `Reservas (${QUIEN[r.rol] ?? r.rol}): ${r.texto}`, s: 6.8, c: ROJA, max: 3 })),
    ], 34);

    // 6-12: tabla de la mercancía
    dato(40, 385, [{ t: e.referencia_gx ?? '—', s: 7.2 }]);
    dato(117, 385, [{ t: e.numero_bultos != null ? String(e.numero_bultos) : '—', s: 8, b: e.numero_bultos != null }]);
    dato(196, 385, [{ t: e.embalaje || (e.paletizado === false ? 'Sin paletizar' : 'Palets'), s: 7.4, b: false }]);
    dato(276, 385, [
      { t: e.descripcion_mercancia || '—', s: 8 },
      { t: e.metros_lineales != null ? `Ocupación: ${num(e.metros_lineales)} m lineales` : '', s: 7, b: false },
      { t: e.adr ? 'MERCANCÍA ADR' : '', s: 7.4, c: ROJA },
    ], 24);
    dato(388, 385, [{ t: '—', b: false }]);
    dato(437, 385, [{ t: e.toneladas != null ? `${importe(Number(e.toneladas) * 1000).replace(/,00$/, '')} kg` : '—', s: 8 }]);
    dato(508, 385, [{ t: e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : '—', s: 8, b: e.volumen_m3 != null }]);

    // 13 Instrucciones del remitente: otras paradas y anotaciones
    const otras = [
      ...rec.slice(1).map((p) => `Otra carga: ${p.nombre_empresa ?? ''} ${lineaDir(p)}`),
      ...ent.slice(0, -1).map((p) => `Otra entrega: ${p.nombre_empresa ?? ''} ${lineaDir(p)}`),
    ];
    dato(42, 532, [...otras.map((o) => ({ t: o, s: 7.4, b: false })), { t: e.anotaciones_cliente || (otras.length ? '' : '—'), s: 7.8, b: false }], 50);
    // 19 Estipulaciones particulares
    dato(438, 532, [{ t: e.discrecion_comercial ? 'Discreción comercial' : '—', s: 7.8, b: false }], 34);
    // 14 Forma de pago
    dato(42, 660, [{ t: 'Porte pagado / Franco', s: 8, b: false }]);
    // 21 Formalizado en … a …
    dato(42, 714, [{ t: `${cli?.poblacion ?? '—'} · ${hoy}`, s: 8, b: false }]);
    // (15 Reembolso y los gastos de la 20 quedan en blanco: el CMR no lleva precios.)

    // 22 · 23 · 24 Firmas (trazo + quién y cuándo). En la 24, además, lugar y fecha de recepción.
    for (const c of casillas) {
      if (!c) continue;
      if (c.img) {
        const k = Math.min(c.ancho / c.img.width, c.alto / c.img.height), w = c.img.width * k, h = c.img.height * k;
        pg.drawImage(c.img, { x: c.x, y: A4.h - c.top - h, width: w, height: h });
      }
      dato(c.x, c.top + c.alto + 1, [{ t: `${c.f.nombre} · ${c.f.documento} · ${fechaFirma(c.f.firmado_en)}`, s: 6.2, b: false, max: 1 }], Math.floor(c.ancho / 3.1));
      if (c.f.rol === 'destinatario') {
        dato(395, 752, [{ t: entrega?.poblacion ?? '', s: 7.4, max: 1 }], 13);
        dato(452, 752, [{ t: fechaFirma(c.f.firmado_en).slice(0, 10), s: 7.4 }], 20);
      }
    }
  }
  l.doc.setTitle(limpio(`CMR ${e.referencia_gx ?? ''}`));
  l.doc.setAuthor(manual ? cli?.razon_social ?? '' : D.razon_social);
  return l.guardar();
}
