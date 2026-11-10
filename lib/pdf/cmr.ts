import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PDFImage, PDFPage, RGB } from 'pdf-lib';
import { Lienzo, COLOR, A4, num, fechaCorta, limpio } from './lienzo';
import { DYNAMO, type DatosDoc, type FirmaDoc, type ParadaDoc } from './datos';
import { pesoKg, fecha, fechaDe, fechaHora, hoyMadrid, metros } from '@/lib/formato';
import { telBonito } from '@/lib/paises';

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
  const carga = rec[0];
  // UNA CARTA POR ENTREGA (art. 5.2 del Convenio CMR: cada destinatario firma el recibí
  // de SU lote, así que con varias entregas salen cartas 1/N, 2/N… en el mismo PDF). El
  // reparto exacto de la mercancía por entrega no viaja en la plataforma (se le indica al
  // conductor en la carga): las casillas 6-12 llevan los TOTALES de la expedición con esa
  // nota, más el detalle de mercancía propio de la entrega si la parada lo tiene.
  const cartas: (ParadaDoc | undefined)[] = ent.length ? ent : [undefined];
  const cli = d.cliente;
  const porteador = manual
    ? { nombre: d.porteador?.razon_social ?? '—', cif: d.porteador?.cif ?? null, tel: d.porteador?.telefono ?? null }
    : { nombre: D.razon_social, cif: D.cif, tel: D.telefono };
  const hoy = fecha(hoyMadrid());
  const ROJA = COLOR.rojo, TINTA = COLOR.tinta;

  // Firmas del CMR digital: en el impreso, 22 la PRIMERA recogida, 23 el transportista y
  // 24 la ÚLTIMA entrega (la firma PRINCIPAL de cada casilla, nunca una extra). Las demás
  // (paradas intermedias y extras) van en la hoja «Registro de firmas» del final.
  const fechaFirma = (iso: string) => fechaHora(iso);
  const firmas = d.firmas ?? [];
  const trazos = new Map<FirmaDoc, PDFImage | null>();
  for (const f of firmas) {
    let img: PDFImage | null = null;
    if (f.png) { try { img = await l.doc.embedPng(f.png); } catch { img = null; } }
    trazos.set(f, img);
  }
  const firmaDe = (rol: string, parada: string | null | undefined) => firmas.find((f) => !f.extra && f.rol === rol && (rol === 'transportista' || f.parada_id === parada));
  const casillasDe = (entrega: ParadaDoc | undefined) => ([
    ['remitente', carga?.id, 38, 742, 150],
    ['transportista', null, 195, 742, 165],
    ['destinatario', entrega?.id, 369, 765, 185],
  ] as const).map(([rol, parada, x, top, ancho]) => {
    const f = firmaDe(rol, parada);
    return f ? { f, img: trazos.get(f) ?? null, x, top, ancho, alto: rol === 'destinatario' ? 24 : 40 } : null;
  });
  const enCasilla = new Set(cartas.flatMap((en) => casillasDe(en)).filter(Boolean).map((c) => c!.f));

  for (let nc = 0; nc < cartas.length; nc++) {
    const entrega = cartas[nc];
    const casillas = casillasDe(entrega);
    const varias = cartas.length > 1;
    // Una página por ejemplar, con los mismos datos.
    for (let i = 0; i < 4; i++) {
      const pg: PDFPage = nc === 0 && i === 0 ? l.pag : l.doc.addPage([A4.w, A4.h]);
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
      if (varias) t(468, 51, `Carta ${nc + 1} de ${cartas.length}`, 7.5);
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
      dato(438, 190 + nomLineas * 10, [{ t: [porteador.cif && `CIF ${porteador.cif}`, porteador.tel && telBonito(porteador.tel)].filter(Boolean).join(' · '), s: 6.8, b: false }], 44);
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
      dato(117, 385, [{ t: e.num_bultos != null ? String(e.num_bultos) : '—', s: 8, b: e.num_bultos != null }]);
      dato(196, 385, [{ t: e.embalaje || (e.paletizado === false ? 'Sin paletizar' : 'Palets'), s: 7.4, b: false }]);
      const mercEnt = varias ? entrega?.anotaciones?.match(/MERCANCÍA:\s*(.+)$/)?.[1] ?? '' : '';
      dato(276, 385, [
        { t: e.descripcion_mercancia || '—', s: 8 },
        { t: e.metros_lineales != null ? `Ocupación: ${metros(e.metros_lineales)} lineales` : '', s: 7, b: false },
        { t: mercEnt ? `Esta entrega: ${mercEnt}` : '', s: 6.8, b: false, max: 4 },
        { t: varias ? 'Totales de la expedición; reparto por entrega indicado en la carga' : '', s: 6.4, b: false, c: COLOR.gris, max: 3 },
        { t: e.adr ? 'MERCANCÍA ADR' : '', s: 7.4, c: ROJA },
      ], 24);
      dato(388, 385, [{ t: '—', b: false }]);
      dato(437, 385, [{ t: e.toneladas != null ? pesoKg(Number(e.toneladas) * 1000) : '—', s: 8 }]);
      dato(508, 385, [{ t: e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : '—', s: 8, b: e.volumen_m3 != null }]);

      // 13 Instrucciones del remitente: otras paradas y anotaciones
      const otras = [
        ...rec.slice(1).map((p) => `Otra carga: ${p.nombre_empresa ?? ''} ${lineaDir(p)}`),
        ...(varias ? [`Expedición con ${ent.length} entregas — esta carta corresponde a la entrega ${nc + 1} (casilla 2)`] : []),
      ];
      dato(42, 532, [...otras.map((o) => ({ t: o, s: 7.4, b: false })), { t: e.anotaciones_cliente || (otras.length ? '' : '—'), s: 7.8, b: false }], 50);
      // 19 Estipulaciones particulares (con aviso de la hoja de firmas adjunta si la hay)
      dato(438, 532, [
        { t: e.discrecion_comercial ? 'Discreción comercial' : '', s: 7.8, b: false },
        { t: firmas.length ? `Firmado electrónicamente: ${firmas.length} ${firmas.length === 1 ? 'firma' : 'firmas'} según registro anexo (hoja final)`
           : 'Firma electrónica con registro anexo (hoja final)', s: 7, b: false, max: 2 },
        ], 34);
      // 14 Forma de pago
      dato(42, 660, [{ t: 'Porte pagado / Franco', s: 8, b: false }]);
      // 21 Formalizado en … a …
      dato(42, 714, [{ t: `${cli?.poblacion ?? '—'} · ${hoy}`, s: 8, b: false }]);
      // (15 Reembolso y los gastos de la 20 quedan en blanco: el CMR no lleva precios.)

      // 22 · 23 · 24 Firmas (trazo + quién y cuándo). En la 24, además, lugar y fecha de recepción.
      // Casilla 22 sin firma propia pero con firmas de carga en el registro (p. ej. firmó
      // la recogida 2 y la 1 todavía no): constancia en la casilla, estilo e-CMR.
      if (!casillas[0] && firmas.some((f) => f.rol === 'remitente' && !f.extra)) {
        dato(38, 752, [{ t: 'Firmado electrónicamente: ver registro anexo', s: 6.2, b: false, max: 3 }], 24);
      }
      for (const c of casillas) {
        if (!c) continue;
        if (c.img) {
          const k = Math.min(c.ancho / c.img.width, c.alto / c.img.height), w = c.img.width * k, h = c.img.height * k;
          pg.drawImage(c.img, { x: c.x, y: A4.h - c.top - h, width: w, height: h });
        }
        dato(c.x, c.top + c.alto + 1, [{ t: `${c.f.nombre} · ${c.f.documento} · ${fechaFirma(c.f.firmado_en)}`, s: 6.2, b: false, max: 1 }], Math.floor(c.ancho / 3.1));
        if (c.f.rol === 'destinatario') {
          dato(395, 752, [{ t: entrega?.poblacion ?? '', s: 7.4, max: 1 }], 13);
          dato(452, 752, [{ t: fechaDe(c.f.firmado_en), s: 7.4 }], 20);
        }
      }
    }
  }

  // HOJA «REGISTRO DE FIRMAS»: SIEMPRE, también sin ninguna firma (usuario, 2026-11-10:
  // «que se sepa que existe esa hoja») — el GPS con su dirección y la huella SHA-256 solo
  // se ven aquí. Va al final del PDF con TODAS las firmas del CMR digital, quepan o no en
  // las casillas 22/23/24; sin firmas, lo dice y explica qué quedará registrado.
  {
    const ROL: Record<string, string> = { remitente: 'Remitente / cargador — casilla 22', transportista: 'Porteador / transportista — casilla 23', destinatario: 'Destinatario — casilla 24' };
    const paradaTxt = (id: string | null) => {
      const iR = rec.findIndex((p) => p.id === id);
      if (iR >= 0) return `${rec.length > 1 ? `Recogida ${iR + 1} de ${rec.length}` : 'Recogida'} · ${[rec[iR].nombre_empresa, lineaDir(rec[iR])].filter(Boolean).join(' · ')}`;
      const iE = ent.findIndex((p) => p.id === id);
      if (iE >= 0) return `${ent.length > 1 ? `Entrega ${iE + 1} de ${ent.length}` : 'Entrega'} · ${[ent[iE].nombre_empresa, lineaDir(ent[iE])].filter(Boolean).join(' · ')}`;
      return '';
    };
    const ordenRol: Record<string, number> = { remitente: 0, transportista: 1, destinatario: 2 };
    const idx = (f: FirmaDoc) => { const i = d.paradas.findIndex((p) => p.id === f.parada_id); return i < 0 ? 99 : i; };
    const lista = [...firmas].sort((x, y) => (x.extra ? 1 : 0) - (y.extra ? 1 : 0) || (ordenRol[x.rol] ?? 9) - (ordenRol[y.rol] ?? 9)
      || idx(x) - idx(y) || x.firmado_en.localeCompare(y.firmado_en));

    l.nuevaPagina();
    l.texto(l.x0, l.y + 12, 'Registro de firmas', 15, { bold: true });
    l.textoDer(A4.w - l.margen.der, l.y + 12, `CMR Nº ${e.referencia_gx ?? ''}`, 10, { bold: true });
    l.y += 24;
    const intro = 'Las casillas 22, 23 y 24 del impreso solo admiten una firma cada una. Esta hoja forma parte del CMR y recoge TODAS las '
      + 'firmas del CMR digital, con su trazo, el documento de quien firma y la fecha y hora del servidor en el momento de firmar.';
    for (const ln of l.partir(intro, 8, l.ancho)) { l.texto(l.x0, l.y + 8, ln, 8, { color: COLOR.gris }); l.y += 11; }
    l.y += 8;
    if (!firmas.length) {
      l.texto(l.x0, l.y + 10, 'Aún no hay ninguna firma registrada.', 9, { bold: true });
      for (const ln of l.partir('Cada firma quedará aquí con su trazo, la casilla y parada que firma, el nombre y documento de quien firma, la fecha y hora del servidor, su ubicación GPS con la dirección (si da permiso) y la huella SHA-256 de lo firmado.', 8, l.ancho)) {
        l.y += 11; l.texto(l.x0, l.y + 10, ln, 8, { color: COLOR.gris });
      }
    }

    const ALTO = 80, tx = l.x0 + 150, anchoTexto = l.ancho - 150 - 10;
    for (const f of lista) {
      l.sitio(ALTO + 8);
      l.rect(l.x0, l.y, l.ancho, ALTO, COLOR.blanco, COLOR.grisClaro);
      const img = trazos.get(f);
      if (img) {
        const k = Math.min(126 / img.width, (ALTO - 14) / img.height), w = img.width * k, h = img.height * k;
        l.pag.drawImage(img, { x: l.x0 + 10, y: A4.h - l.y - (ALTO + h) / 2, width: w, height: h });
      }
      const donde = f.extra ? 'Firma extra (no ocupa casilla)' : enCasilla.has(f) ? 'Impresa en su casilla' : 'Solo en este registro';
      l.texto(tx, l.y + 17, ROL[f.rol] ?? f.rol, 8.6, { bold: true });
      l.textoDer(A4.w - l.margen.der - 10, l.y + 17, donde, 7, { color: f.extra ? COLOR.ambar : COLOR.gris });
      const par = paradaTxt(f.parada_id);
      if (par) {
        const partes = l.partir(par, 7.4, anchoTexto);
        l.texto(tx, l.y + 30, partes.length > 1 ? partes[0].slice(0, -1) + '…' : partes[0], 7.4, { color: COLOR.gris });
      }
      l.texto(tx, l.y + (par ? 44 : 34), `Firmado por ${f.nombre} · ${f.documento} · ${fechaFirma(f.firmado_en)}`, 7.8, { color: COLOR.tinta });
      if (f.lat != null && f.lon != null) {
        const gpsTxt = `GPS: ${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}${f.gps_precision_m != null ? ` (±${f.gps_precision_m} m)` : ''}${f.gps_direccion ? ` · ${f.gps_direccion}` : ''}`;
        const gl = l.partir(gpsTxt, 7.2, anchoTexto);
        l.texto(tx, l.y + (par ? 57 : 47), gl.length > 1 ? gl[0].slice(0, -1) + '…' : gl[0], 7.2, { color: COLOR.gris });
      }
      if (f.sha256) l.texto(tx, l.y + (par ? 69 : 59), `Huella SHA-256 de lo firmado: ${f.sha256}`, 5.8, { color: COLOR.gris });
      l.y += ALTO + 8;
    }
  }

  l.doc.setTitle(limpio(`CMR ${e.referencia_gx ?? ''}`));
  l.doc.setAuthor(manual ? cli?.razon_social ?? '' : D.razon_social);
  return l.guardar();
}
