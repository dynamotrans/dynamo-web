import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import type { PDFImage, PDFPage, RGB } from 'pdf-lib';
import { Lienzo, COLOR, A4, num, fechaCorta, limpio } from './lienzo';
import { DYNAMO, type DatosDoc, type FirmaDoc, type ParadaDoc } from './datos';
import { pesoKg, fecha, fechaDe, fechaHora, hoyMadrid, metros, ventana } from '@/lib/formato';
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

export async function cmr(d: DatosDoc, op: { sinDeca?: boolean } = {}): Promise<Uint8Array> {
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

  // QR del e-CMR (el enlace https ÚNICO del documento): va en la cabecera de TODAS las
  // páginas (usuario, 2026-11-10), con tamaño legible con el móvil, y en la hoja de firmas.
  // SOLO existe con transportista y matrícula asignados (usuario, 2026-11-11): sin ellos
  // el DeCA no puede generarse ni mostrarse — en su rincón va el porqué, en «pendiente».
  const conTransporte = !!(d.porteador && e.matricula_camion);
  let qrImg: PDFImage | null = null;
  // El QR abre el PDF del e-CMR relleno (usuario, 2026-11-11: «esté donde esté el QR»),
  // no la página de firmas; el texto de verificación en línea sigue siendo la página.
  if (d.deca && conTransporte) { try { qrImg = await l.doc.embedPng(await QRCode.toBuffer(`${d.deca.url}/pdf`, { margin: 0, scale: 4 })); } catch { qrImg = null; } }

  // HOJA DeCA INDEPENDIENTE, PRIMERA del PDF (usuario, 2026-11-11): aunque el propio
  // e-CMR ya vale como documento de control, delante va un DeCA aparte con los datos del
  // art. 5 de la Orden FOM/2861/2012, con nuestro estilo. Solo puede existir con
  // transportista y matrícula, y nunca en envíos manuales (ahí Dynamo no es el operador).
  // Con sinDeca, la hoja DeCA no se pinta: la ORDEN DE CARGA operativa va delante
  // del impreso y hace su papel (usuario, 2026-11-11).
  const hojaDeca = !op.sinDeca && !manual && !!d.deca && conTransporte && !!qrImg;
  if (hojaDeca && d.deca) {
    const der = A4.w - l.margen.der;
    const cabY = l.y;
    let xTit = l.x0;
    if (logo) { const h = 20, w = h * logo.width / logo.height; l.pag.drawImage(logo, { x: l.x0, y: A4.h - cabY - 1 - h, width: w, height: h }); xTit = l.x0 + w + 12; }
    l.texto(xTit, cabY + 16, 'Documento de control · DeCA', 15, { bold: true, color: COLOR.navy });
    const numE = `Envío Nº ${e.referencia_gx ?? ''}`;
    const anchoNum = l.medida(numE, 9, true) + 16;
    l.rect(der - anchoNum, cabY + 1, anchoNum, 20, COLOR.moradoSuave);
    l.textoDer(der - 8, cabY + 15, numE, 9, { bold: true, color: COLOR.morado });
    l.y = cabY + 28;
    l.linea(l.x0, l.y, der, l.y, COLOR.morado, 1.4);
    l.y += 8;
    const introD = 'Documento de control administrativo del transporte público de mercancías por carretera (Orden FOM/2861/2012), con los '
      + 'datos que exige su art. 5. En soporte electrónico (art. 6): basta mostrarlo, en el móvil o impreso, en una inspección en '
      + 'carretera. Acompaña al e-CMR de este envío (hojas siguientes), que recoge las firmas y hace también de documento de control.';
    for (const ln of l.partir(introD, 8, l.ancho)) { l.texto(l.x0, l.y + 8, ln, 8, { color: COLOR.gris }); l.y += 11; }
    l.y += 5;
    // Identificación del documento (nº único, creación y verificación), con el QR dentro.
    const nUnico = d.deca.url.split('/').pop() ?? '';
    const altoId = 92;
    l.rect(l.x0, l.y, l.ancho, altoId, COLOR.fondo, COLOR.grisClaro);
    l.pag.drawImage(qrImg!, { x: der - 82, y: A4.h - (l.y + 10) - 72, width: 72, height: 72 });
    l.textoDer(der - 10, l.y + 90, 'Escanéalo para verificar', 6.2, { color: COLOR.gris });
    const wId = l.ancho - 100 - 24;
    let yId = l.y + 9;
    for (const [k, v, b] of [
      ['Nº único del documento', nUnico, true],
      ['Creado el', fechaHora(d.deca.creado_en), false],
      ['Verificación en línea', d.deca.url, false],
    ] as const) {
      l.texto(l.x0 + 12, yId + 6.2, k.toUpperCase(), 6.2, { bold: true, color: COLOR.gris });
      yId += 9;
      for (const ln of l.partir(v, 8, wId, b)) { l.texto(l.x0 + 12, yId + 8, ln, 8, { bold: b, color: COLOR.navy }); yId += 11; }
      yId += 3;
    }
    l.y += altoId + 6;
    // Secciones con los datos del art. 5, en filas etiqueta · valor (nuestro estilo).
    const sec = (titulo: string) => {
      l.y += 5;
      l.texto(l.x0, l.y + 8, titulo, 8, { bold: true, color: COLOR.morado });
      l.y += 12;
      l.linea(l.x0, l.y, der, l.y, COLOR.grisClaro, 0.8);
      l.y += 4;
    };
    const filaD = (k: string, v: string | null | undefined, b = false) => {
      if (!v) return;
      const xV = l.x0 + 160;
      l.texto(l.x0, l.y + 8, k, 7.2, { color: COLOR.gris });
      for (const ln of l.partir(v, 8.2, der - xV, b)) { l.texto(xV, l.y + 8.2, ln, 8.2, { bold: b, color: COLOR.tinta }); l.y += 11; }
      l.y += 1;
    };
    const p = d.porteador!;
    sec('CARGADOR CONTRACTUAL · OPERADOR DE TRANSPORTE');
    filaD('Razón social', D.razon_social, true);
    filaD('NIF', D.cif);
    filaD('Domicilio', [D.direccion, [D.codigo_postal, D.poblacion].filter(Boolean).join(' '), D.pais].filter(Boolean).join(', '));
    filaD('Autorización', `Operador de transporte · O.T. ${D.tarjeta_ot}`);
    sec('TRANSPORTISTA EFECTIVO');
    filaD('Razón social', p.razon_social, true);
    filaD('NIF', p.cif);
    filaD('Domicilio', [p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.pais].filter(Boolean).join(', ') || null);
    filaD('Contacto', [p.contacto, p.telefono && telBonito(p.telefono), p.email].filter(Boolean).join(' · ') || null);
    sec('VEHÍCULO Y CONDUCTOR');
    filaD('Matrícula tractora', e.matricula_camion, true);
    filaD('Matrícula remolque', e.matricula_remolque);
    filaD('Conductor', e.conductor_nombre ? [e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ') : null);
    sec('NATURALEZA Y PESO DE LA CARGA');
    filaD('Mercancía', [e.descripcion_mercancia || (e.paletizado === false ? 'Mercancía sin paletizar' : 'Mercancía paletizada'),
      e.adr ? 'ADR (peligrosa)' : null].filter(Boolean).join(' · '), true);
    filaD('Peso', e.toneladas != null ? pesoKg(Number(e.toneladas) * 1000) : 'Por determinar');
    filaD('Ocupación', [e.metros_lineales != null && `${metros(e.metros_lineales)} lineales`, e.num_bultos != null && `${e.num_bultos} bultos`,
      e.volumen_m3 != null && `${num(e.volumen_m3)} m³`].filter(Boolean).join(' · ') || null);
    sec('ORIGEN · LUGAR Y FECHA DE CARGA');
    filaD('Lugar', [carga?.nombre_empresa, lineaDir(carga)].filter(Boolean).join(' · ') || '—', true);
    // El día REAL si ya se cargó; si no, el día ELEGIDO al asignar; y si no, la ventana.
    filaD('Fecha de carga', (e.fecha_carga_real ?? e.fecha_carga_prevista) ? fecha(e.fecha_carga_real ?? e.fecha_carga_prevista) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta) || null);
    sec('DESTINO · LUGAR Y FECHA DE ENTREGA');
    const ultEnt = ent[ent.length - 1];
    filaD('Lugar', [ultEnt?.nombre_empresa, lineaDir(ultEnt)].filter(Boolean).join(' · ') || '—', true);
    filaD('Fecha de entrega', e.fecha_entrega_estimada ? `Estimada: ${fecha(e.fecha_entrega_estimada)}` : null);
    if (d.paradas.length > 2) {
      filaD('Paradas', `${rec.length} ${rec.length === 1 ? 'recogida' : 'recogidas'} · ${ent.length} ${ent.length === 1 ? 'entrega' : 'entregas'} — detalle completo en el e-CMR`);
    }
    if (e.referencia_cliente) { sec('REFERENCIAS'); filaD('Ref. del cliente', e.referencia_cliente); }
  }

  for (let nc = 0; nc < cartas.length; nc++) {
    const entrega = cartas[nc];
    const casillas = casillasDe(entrega);
    const varias = cartas.length > 1;
    // Una página por ejemplar, con los mismos datos.
    for (let i = 0; i < 4; i++) {
      const pg: PDFPage = nc === 0 && i === 0 && !hojaDeca ? l.pag : l.doc.addPage([A4.w, A4.h]);
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

      // CABECERA del impreso (usuario, 2026-11-11): a la imagen del impreso se le quitó
      // una franja VACÍA de 34pt del final de la fila 6-12 (solo aire, nada se escala) y
      // se le dio a la cabecera, que pasa de ~77 a ~111pt. Ahí vive la TARJETA del QR,
      // igual que en la hoja de firmas: borde fino redondeado, título «QR e-CMR / DeCA»,
      // el QR real (o su hueco punteado) y el rótulo debajo («Escanéalo con el móvil» /
      // «Pendiente de asignar transporte»). Guarda 15pt (~5 mm) con el borde del papel y
      // ~5pt con el marco rojo (que ahora empieza a ~111pt): nada se recorta al imprimir.
      // El Nº y la carta, alineados a la derecha con 14pt de hueco fijo hasta la tarjeta.
      // DER = borde derecho del marco rojo (medido: 561pt). Las casillas de la 1 a la 12
      // bajan 34pt con la imagen; de la 13 para abajo nada se mueve.
      const DER = 561;
      const esquina = !!qrImg || !conTransporte;
      if (esquina) {
        const cw = 96, ch = 91, cx = DER - cw, ct = 15, r = 8;
        pg.drawSvgPath(
          `M ${r} 0 H ${cw - r} Q ${cw} 0 ${cw} ${r} V ${ch - r} Q ${cw} ${ch} ${cw - r} ${ch} H ${r} Q 0 ${ch} 0 ${ch - r} V ${r} Q 0 0 ${r} 0 Z`,
          { x: cx, y: A4.h - ct, color: COLOR.blanco, borderColor: COLOR.grisClaro, borderWidth: 1 });
        const tTit = 'QR e-CMR / DeCA';
        t(cx + (cw - l.medida(tTit, 6.8, true)) / 2, ct + 12, tTit, 6.8, true, COLOR.navy);
        if (qrImg) {
          pg.drawImage(qrImg, { x: cx + (cw - 62) / 2, y: A4.h - (ct + 16) - 62, width: 62, height: 62 });
        } else {
          pg.drawRectangle({ x: cx + (cw - 58) / 2, y: A4.h - (ct + 18) - 58, width: 58, height: 58, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 1, borderDashArray: [3, 3] });
          t(cx + (cw - l.medida('QR', 9, true)) / 2, ct + 50, 'QR', 9, true, COLOR.gris);
        }
        const tPie = qrImg ? 'Escanéalo con el móvil' : 'Pendiente de asignar transporte';
        t(cx + (cw - l.medida(tPie, 5.4, false)) / 2, ct + 86, tPie, 5.4, false, COLOR.gris);
      }
      const finX = esquina ? DER - 96 - 14 : DER;
      const numTxt = `Nº ${e.referencia_gx ?? ''}`;
      t(finX - (esquina ? l.medida(numTxt, 9, true) : 93), esquina ? 52 : 40, numTxt, 9);
      if (varias) {
        const cTxt = `Carta ${nc + 1} de ${cartas.length}`;
        t(finX - (esquina ? l.medida(cTxt, 7.5, true) : 93), esquina ? 64 : 51, cTxt, 7.5);
      }
      if (logo) { const h = 22, w = h * logo.width / logo.height; pg.drawImage(logo, { x: 36, y: A4.h - 15 - h, width: w, height: h }); }

      // 1 Remitente
      dato(42, 144, [
        { t: cli?.razon_social ?? '—', s: 8.8 },
        { t: `CIF ${cli?.cif ?? '—'}`, s: 7.6, b: false },
        { t: [cli?.direccion, [cli?.codigo_postal, cli?.poblacion].filter(Boolean).join(' '), cli?.pais].filter(Boolean).join(' · '), s: 7.6, b: false },
      ], 48);
      // 2 Destinatario
      dato(42, 230, [{ t: entrega?.nombre_empresa || '—', s: 8.8, max: 1 }, { t: lineaDir(entrega), s: 7.6, b: false, max: 2 }], 56);
      // 3 Lugar de entrega
      dato(42, 272, [{ t: lineaDir(entrega), s: 8, max: 2 }, { t: entrega?.horarios ? `Horario: ${entrega.horarios}` : '', s: 7.4, b: false, max: 1 }], 56);
      // 4 Lugar y fecha de carga (caben DOS líneas antes del rótulo de la 5)
      const fCarga = e.fecha_carga_real ?? e.fecha_carga_prevista ?? e.fecha_carga_desde;
      dato(42, 322, [
        { t: [carga?.direccion, [carga?.codigo_postal, carga?.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', '), s: 7.8, max: 1 },
        { t: [carga?.provincia !== carga?.poblacion ? carga?.provincia : null, carga?.pais, fCarga ? fechaCorta(fCarga) : null].filter(Boolean).join(' · '), s: 7.4, b: false, max: 1 },
      ], 58);
      // 5 Documentos anexos (referencias)
      const refs = [e.referencia_cliente && `Ref. ${e.referencia_cliente}`, ...d.paradas.map((p) => p.referencia && `${p.tipo === 'carga' ? 'Carga' : 'Entrega'}: ${p.referencia}`)].filter(Boolean).join(' · ');
      dato(42, 358, [{ t: refs || '—', s: 8, b: false }], 60);

      // 16 Porteador: el texto fijo de Dynamo (usuario, 2026-11-11) — razón social, CIF
      // y la reserva online; en envíos MANUALES, el operador del cliente con CIF y teléfono.
      if (manual) {
        const nomLineas = l.partir(porteador.nombre, 8.4, 26 * 8.4 * 0.5, true).length;
        dato(438, 224, [{ t: porteador.nombre, s: 8.4 }], 26);
        dato(438, 224 + nomLineas * 10, [{ t: [porteador.cif && `CIF ${porteador.cif}`, porteador.tel && telBonito(porteador.tel)].filter(Boolean).join(' · '), s: 6.8, b: false }], 44);
      } else {
        // Compacto: razón social en UNA línea (7.6pt cabe entera) e interlineado de 9pt,
        // para que las 4 líneas queden dentro de la casilla sin pisar el borde de la 17.
        const nl16 = l.partir(D.razon_social, 7.6, 32 * 7.6 * 0.5, true).length;
        dato(438, 220, [{ t: D.razon_social, s: 7.6 }], 32);
        const y16 = 220 + nl16 * 10 - 1;
        dato(438, y16, [{ t: `CIF ${D.cif}`, s: 6.8, b: false }], 40);
        dato(438, y16 + 9, [{ t: 'Reserva transporte ONLINE:', s: 6.8, b: false }], 40);
        dato(438, y16 + 18, [{ t: D.web, s: 7.2 }], 40);
      }
      // 17 Porteadores sucesivos: el transportista EFECTIVO con su CIF (DeCA: debe constar
      // frente al cargador contractual de la 16), su camión y su conductor.
      dato(438, 270, [
        { t: manual ? '' : [d.porteador?.razon_social, d.porteador?.cif && `CIF ${d.porteador.cif}`].filter(Boolean).join(' · ') || '—', s: 7.8, max: 2 },
        { t: [e.matricula_camion && `Matr. ${e.matricula_camion}`, e.matricula_remolque && `Rem. ${e.matricula_remolque}`].filter(Boolean).join(' · '), s: 7.4, b: false },
        { t: e.conductor_nombre ? `Conductor: ${e.conductor_nombre}` : '', s: 7.4, b: false },
      ], 34);
      // 18 Reservas y observaciones del porteador
      const QUIEN: Record<string, string> = { remitente: 'Remitente', transportista: 'Porteador', destinatario: 'Destinatario' };
      // La casilla 18 empieza en x≈273 (no en 438): se usa el ancho ENTERO (2026-11-11;
      // el hueco de la izquierda no estaba reservado para nada).
      dato(276, 324, [
        ...(e.adr ? [{ t: 'MERCANCÍA ADR (peligrosa) — Acuerdo ADR', s: 7.6, c: ROJA }] : []),
        ...(d.reservas ?? []).slice(0, 3).map((r) => ({ t: `Reservas (${QUIEN[r.rol] ?? r.rol}): ${r.texto}`, s: 6.8, c: ROJA, max: 3 })),
      ], 76);

      // 6-12: tabla de la mercancía. La fila es 34pt más baja desde 2026-11-11 (el aire
      // sobrante se dio a la cabecera), así que las líneas van con tope y «…» por si acaso.
      dato(40, 419, [{ t: e.referencia_gx ?? '—', s: 7.2 }]);
      dato(117, 419, [{ t: e.num_bultos != null ? String(e.num_bultos) : '—', s: 8, b: e.num_bultos != null }]);
      dato(196, 419, [{ t: e.embalaje || (e.paletizado === false ? 'Sin paletizar' : 'Palets'), s: 7.4, b: false }]);
      const mercEnt = varias ? entrega?.anotaciones?.match(/MERCANCÍA:\s*(.+)$/)?.[1] ?? '' : '';
      dato(276, 419, [
        { t: e.descripcion_mercancia || '—', s: 8, max: 3 },
        { t: e.metros_lineales != null ? `Ocupación: ${metros(e.metros_lineales)} lineales` : '', s: 7, b: false },
        { t: mercEnt ? `Esta entrega: ${mercEnt}` : '', s: 6.8, b: false, max: 2 },
        { t: varias ? 'Totales de la expedición; reparto por entrega indicado en la carga' : '', s: 6.4, b: false, c: COLOR.gris, max: 2 },
        { t: e.adr ? 'MERCANCÍA ADR' : '', s: 7.4, c: ROJA },
      ], 24);
      dato(388, 419, [{ t: '—', b: false }]);
      dato(437, 419, [{ t: e.toneladas != null ? pesoKg(Number(e.toneladas) * 1000) : '—', s: 8 }]);
      dato(508, 419, [{ t: e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : '—', s: 8, b: e.volumen_m3 != null }]);

      // 13 Instrucciones del remitente: otras paradas y anotaciones
      const otras = [
        ...rec.slice(1).map((p) => `Otra carga: ${p.nombre_empresa ?? ''} ${lineaDir(p)}`),
        ...(varias ? [`Expedición con ${ent.length} entregas — esta carta corresponde a la parada ${rec.length + nc + 1} (casilla 2)`] : []),
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

      // DeCA (Orden FOM/2861/2012): junto a la casilla de firma del porteador (23) debe
      // constar el CARGADOR CONTRACTUAL (Dynamo, con su NIF) además del transportista
      // efectivo con el suyo (usuario, 2026-11-10). Línea pequeña bajo las casillas de firma.
      if (!manual) {
        const efect = [d.porteador?.razon_social, d.porteador?.cif && `NIF ${d.porteador.cif}`].filter(Boolean).join(' · ');
        dato(40, 791, [{ t: `Cargador contractual: ${D.razon_social} · NIF ${D.cif}${efect ? ` — Transportista efectivo: ${efect}` : ''}`, s: 5.6, b: false, c: COLOR.gris, max: 1 }], 190);
      }
    }
  }

  // HOJA «REGISTRO DE FIRMAS»: SIEMPRE, también sin ninguna firma (usuario, 2026-11-10:
  // «que se sepa que existe esa hoja») — el GPS con su dirección y la huella SHA-256 solo
  // se ven aquí. Va al final del PDF con TODAS las firmas del CMR digital, quepan o no en
  // las casillas 22/23/24; sin firmas, lo dice y explica qué quedará registrado.
  {
    const ROL: Record<string, string> = { remitente: 'Remitente / cargador', transportista: 'Porteador / transportista', destinatario: 'Destinatario' };
    const CASILLA: Record<string, number> = { remitente: 22, transportista: 23, destinatario: 24 };
    // A qué carta corresponde la firma (usuario, 2026-11-10: con varias partidas en el
    // mismo camión hay una carta por entrega, y cada firma debe decir la suya): el
    // destinatario firma SU carta; remitente y porteador salen en todas.
    const cartaTxt = (f: FirmaDoc) => {
      if (cartas.length <= 1) return '';
      if (f.rol === 'destinatario') {
        const iE = ent.findIndex((p) => p.id === f.parada_id);
        return iE >= 0 ? `Carta ${iE + 1} de ${cartas.length}` : '';
      }
      return `Todas las cartas (1–${cartas.length})`;
    };
    // Nº de PARADA correlativo del recorrido (usuario, 2026-11-11), tipología detrás.
    const paradaTxt = (id: string | null) => {
      const tot = d.paradas.length;
      const iR = rec.findIndex((p) => p.id === id);
      if (iR >= 0) return `${tot > 2 ? `Parada ${iR + 1} de ${tot} · ` : ''}Recogida · ${[rec[iR].nombre_empresa, lineaDir(rec[iR])].filter(Boolean).join(' · ')}`;
      const iE = ent.findIndex((p) => p.id === id);
      if (iE >= 0) return `${tot > 2 ? `Parada ${rec.length + iE + 1} de ${tot} · ` : ''}Entrega · ${[ent[iE].nombre_empresa, lineaDir(ent[iE])].filter(Boolean).join(' · ')}`;
      return '';
    };
    const ordenRol: Record<string, number> = { remitente: 0, transportista: 1, destinatario: 2 };
    const idx = (f: FirmaDoc) => { const i = d.paradas.findIndex((p) => p.id === f.parada_id); return i < 0 ? 99 : i; };
    const lista = [...firmas].sort((x, y) => (x.extra ? 1 : 0) - (y.extra ? 1 : 0) || (ordenRol[x.rol] ?? 9) - (ordenRol[y.rol] ?? 9)
      || idx(x) - idx(y) || x.firmado_en.localeCompare(y.firmado_en));

    // CABECERA moderna (usuario, 2026-11-10): logo de Dynamo, título, nº en pastilla
    // morada y línea de acento; el bloque DeCA va en un panel claro con el QR dentro.
    l.nuevaPagina();
    const pagsFirmas = [l.pag];
    const cabY = l.y;
    let xTit = l.x0;
    if (logo) {
      const h = 20, w = h * logo.width / logo.height;
      l.pag.drawImage(logo, { x: l.x0, y: A4.h - cabY - 1 - h, width: w, height: h });
      xTit = l.x0 + w + 12;
    }
    l.texto(xTit, cabY + 16, 'Hoja de firmas eCMR / DeCA', 15, { bold: true, color: COLOR.navy });
    const num = `CMR Nº ${e.referencia_gx ?? ''}`;
    const anchoNum = l.medida(num, 9, true) + 16;
    l.rect(A4.w - l.margen.der - anchoNum, cabY + 1, anchoNum, 20, COLOR.moradoSuave);
    l.textoDer(A4.w - l.margen.der - 8, cabY + 15, num, 9, { bold: true, color: COLOR.morado });
    l.y = cabY + 28;
    l.linea(l.x0, l.y, A4.w - l.margen.der, l.y, COLOR.morado, 1.4);
    l.y += 8;
    // Caja del QR ARRIBA, con su espacio (usuario, 2026-11-11): borde fino redondeado,
    // título «QR e-CMR / DeCA» y el hueco punteado con «Pendiente» mientras no exista;
    // los párrafos de la izquierda le dejan el sitio.
    const cajaQR = !conTransporte;
    const qrCardW = 112, qrCardH = 114, qrCardX = A4.w - l.margen.der - qrCardW, qrCardTop = l.y;
    if (cajaQR) {
      const r = 8;
      l.pag.drawSvgPath(
        `M ${r} 0 H ${qrCardW - r} Q ${qrCardW} 0 ${qrCardW} ${r} V ${qrCardH - r} Q ${qrCardW} ${qrCardH} ${qrCardW - r} ${qrCardH} H ${r} Q 0 ${qrCardH} 0 ${qrCardH - r} V ${r} Q 0 0 ${r} 0 Z`,
        { x: qrCardX, y: A4.h - qrCardTop, color: COLOR.blanco, borderColor: COLOR.grisClaro, borderWidth: 1 });
      const tQ = 'QR e-CMR / DeCA';
      l.texto(qrCardX + (qrCardW - l.medida(tQ, 6.8, true)) / 2, qrCardTop + 14, tQ, 6.8, { bold: true, color: COLOR.navy });
      l.pag.drawRectangle({ x: qrCardX + 21, y: A4.h - (qrCardTop + 21) - 70, width: 70, height: 70, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 1, borderDashArray: [3, 3] });
      l.texto(qrCardX + (qrCardW - l.medida('QR', 10, true)) / 2, qrCardTop + 60, 'QR', 10, { bold: true, color: COLOR.gris });
      const tP = 'Pendiente';
      l.texto(qrCardX + (qrCardW - l.medida(tP, 6.2, false)) / 2, qrCardTop + 103, tP, 6.2, { color: COLOR.gris });
    }
    const anchoIntro = cajaQR ? l.ancho - qrCardW - 14 : l.ancho;
    const intro = 'Las casillas 22, 23 y 24 del impreso solo admiten una firma cada una. Esta hoja forma parte del CMR y recoge TODAS las '
      + 'firmas del CMR digital, con su trazo, el documento de quien firma y la fecha y hora del servidor en el momento de firmar.';
    for (const ln of l.partir(intro, 8, anchoIntro)) { l.texto(l.x0, l.y + 8, ln, 8, { color: COLOR.gris }); l.y += 11; }
    if (d.deca && conTransporte) {
      l.y += 6;
      const nUnico = d.deca.url.split('/').pop() ?? '';
      // EL PORQUÉ LEGAL, CLARO Y EN NEGRITA (usuario, 2026-11-10): tres cajas —la ley que
      // acepta el soporte electrónico, los datos exigidos y qué comprueba el QR— para que
      // quien lo mire (conductor, agente, cliente) lo entienda de un vistazo.
      const colAncho = l.ancho - (qrImg ? 100 : 0) - 16;
      const cab = l.partir('Este e-CMR es también el documento de control (DeCA) del transporte nacional', 8.6, colAncho, true);
      const cajas = [
        { tit: 'La ley lo acepta en electrónico: Orden FOM/2861/2012, art. 6', txt: 'El documento de control (DeCA) puede llevarse en soporte electrónico: basta mostrar este e-CMR, en el móvil o impreso, en una inspección en carretera.' },
        { tit: 'Con todos los datos que exige el art. 5', txt: 'Cargador contractual y transportista efectivo con su NIF, vehículo, naturaleza y peso de la carga, origen, destino y fechas: todos constan en este documento.' },
        { tit: 'El QR lo verifica en línea', txt: 'Abre el e-CMR original, con su nº único, sus firmas y su registro, para comprobarlo al momento. En transporte internacional rigen el Convenio CMR y el Protocolo e-CMR (Ginebra, 2008).' },
        { tit: 'Las firmas valen: Reglamento eIDAS (UE 910/2014), art. 25', txt: 'Firma electrónica con evidencias de identidad, tiempo y ubicación (hora del servidor, GPS y huella SHA-256): no se le pueden negar efectos jurídicos y es admisible como prueba ante organismos, peritos y tribunales.' },
      ].map((c) => {
        const tit = l.partir(c.tit, 7.4, colAncho - 18, true);
        const txt = l.partir(c.txt, 6.6, colAncho - 18);
        return { tit, txt, alto: 6 + tit.length * 9 + txt.length * 8 + 5 };
      });
      // Los datos del documento van bajo las cajas, ya por debajo del QR: a todo el ancho.
      const datos = [
        `Nº único del documento: ${nUnico} · creado el ${fechaHora(d.deca.creado_en)}`,
        `Verificación en línea: ${d.deca.url}`,
        ...(!manual ? [`Cargador contractual: ${D.razon_social} · NIF ${D.cif}`
          + ([d.porteador?.razon_social, d.porteador?.cif && `NIF ${d.porteador.cif}`].filter(Boolean).length
            ? ` — Transportista efectivo: ${[d.porteador?.razon_social, d.porteador?.cif && `NIF ${d.porteador.cif}`].filter(Boolean).join(' · ')}` : '')
          + (e.matricula_camion ? ` · Matr. ${e.matricula_camion}` : '')] : []),
      ].flatMap((tx) => l.partir(tx, 6.8, l.ancho - 20));
      const altoCajas = cajas.reduce((s, c) => s + c.alto + 5, 0);
      const altoPanel = Math.max(9 + cab.length * 11 + 3 + altoCajas + 2 + datos.length * 9 + 8, qrImg ? 100 : 0);
      l.rect(l.x0, l.y, l.ancho, altoPanel, COLOR.fondo, COLOR.grisClaro);
      if (qrImg) {
        l.pag.drawImage(qrImg, { x: A4.w - l.margen.der - 80, y: A4.h - (l.y + 10) - 70, width: 70, height: 70 });
        l.textoDer(A4.w - l.margen.der - 10, l.y + 89, 'Escanéalo para verificar', 6.2, { color: COLOR.gris });
      }
      let yTxt = l.y + 9;
      for (const ln of cab) { l.texto(l.x0 + 10, yTxt + 8.6, ln, 8.6, { bold: true, color: COLOR.navy }); yTxt += 11; }
      yTxt += 3;
      for (const c of cajas) {
        l.rect(l.x0 + 10, yTxt, colAncho, c.alto, COLOR.blanco, COLOR.grisClaro);
        l.rect(l.x0 + 10, yTxt, 3, c.alto, COLOR.morado);
        let yC = yTxt + 6;
        for (const ln of c.tit) { l.texto(l.x0 + 20, yC + 7.4, ln, 7.4, { bold: true, color: COLOR.navy }); yC += 9; }
        for (const ln of c.txt) { l.texto(l.x0 + 20, yC + 6.6, ln, 6.6, { color: COLOR.gris }); yC += 8; }
        yTxt += c.alto + 5;
      }
      yTxt += 2;
      for (const ln of datos) { l.texto(l.x0 + 10, yTxt + 6.8, ln, 6.8, { color: COLOR.gris }); yTxt += 9; }
      l.y += altoPanel + 8;
    } else if (!conTransporte) {
      // El porqué del DeCA pendiente, a la izquierda de la caja del QR de arriba.
      l.y += 4;
      for (const ln of l.partir('Documento de control (DeCA): pendiente. Se genera, con su QR de verificación, cuando el envío tiene transportista y matrícula asignados (Orden FOM/2861/2012, art. 5).', 7.4, anchoIntro)) {
        l.texto(l.x0, l.y + 8, ln, 7.4, { color: COLOR.gris }); l.y += 10;
      }
      l.y = Math.max(l.y, qrCardTop + qrCardH) + 8;
    } else { l.y += 4; }
    if (!firmas.length) {
      l.texto(l.x0, l.y + 10, 'Aún no hay ninguna firma registrada.', 9, { bold: true });
      for (const ln of l.partir('Cada firma quedará aquí con su trazo, la casilla y parada que firma, el nombre y documento de quien firma, la fecha y hora del servidor, su ubicación GPS con la dirección (si da permiso) y la huella SHA-256 de lo firmado.', 8, l.ancho)) {
        l.y += 11; l.texto(l.x0, l.y + 10, ln, 8, { color: COLOR.gris });
      }
    }

    // COMPACTO (usuario, 2026-11-10): hasta 6 firmas en la misma hoja, cada una con su
    // casilla, SU CARTA (M de N), parada, firmante, hora, GPS y huella.
    const ALTO = 64, tx = l.x0 + 150, anchoTexto = l.ancho - 150 - 10;
    const linea1 = (f: FirmaDoc) => {
      const carta = cartaTxt(f);
      return `Casilla ${CASILLA[f.rol] ?? '—'} · ${ROL[f.rol] ?? f.rol}${carta ? ` — ${carta}` : ''}`;
    };
    const corta = (t: string, s: number) => { const p = l.partir(t, s, anchoTexto); return p.length > 1 ? p[0].slice(0, -1) + '…' : p[0]; };
    // Sin tope de firmas (usuario, 2026-11-10): si no caben (más destinos, extras…),
    // siguen en otra hoja, que lleva su propia cabecera de continuación.
    const cabCont = () => {
      pagsFirmas.push(l.pag);
      if (logo) { const h = 14, w = h * logo.width / logo.height; l.pag.drawImage(logo, { x: l.x0, y: A4.h - l.y - h, width: w, height: h }); }
      l.texto(l.x0 + (logo ? 14 * logo.width / logo.height + 10 : 0), l.y + 11, 'Hoja de firmas eCMR / DeCA (continuación)', 11, { bold: true, color: COLOR.navy });
      l.textoDer(A4.w - l.margen.der, l.y + 11, `CMR Nº ${e.referencia_gx ?? ''}`, 8.5, { bold: true, color: COLOR.morado });
      l.y += 18;
      l.linea(l.x0, l.y, A4.w - l.margen.der, l.y, COLOR.morado, 1);
      l.y += 8;
    };
    // Cada reserva con SU firmante (usuario, 2026-11-11: en la casilla 18 van mezcladas
    // sin identificar): la reserva se anota al firmar, así que se asigna a la firma de su
    // rol y parada más cercana en el tiempo y se enseña, en rojo, dentro de su tarjeta.
    const resDe = new Map<FirmaDoc, string[]>();
    for (const rsv of d.reservas ?? []) {
      const candidatas = lista.filter((x) => x.rol === rsv.rol && (rsv.rol === 'transportista' || !rsv.parada_id || x.parada_id === rsv.parada_id));
      if (!candidatas.length) continue;
      const tRes = rsv.creado_en ? Date.parse(rsv.creado_en) : 0;
      const f = candidatas.reduce((a, b) => Math.abs(Date.parse(a.firmado_en) - tRes) <= Math.abs(Date.parse(b.firmado_en) - tRes) ? a : b);
      resDe.set(f, [...(resDe.get(f) ?? []), rsv.texto]);
    }
    for (const f of lista) {
      const reservasF = (resDe.get(f) ?? []).flatMap((txv) => l.partir(`Reservas: ${txv}`, 6.8, anchoTexto, true));
      const alto = ALTO + (reservasF.length ? reservasF.length * 9 + 4 : 0);
      const pgAntes = l.pag;
      l.sitio(alto + 6);
      if (l.pag !== pgAntes) cabCont();
      l.rect(l.x0, l.y, l.ancho, alto, COLOR.blanco, COLOR.grisClaro);
      // Barra de acento: morada (impresa en su casilla), gris (solo registro), ámbar (extra).
      l.rect(l.x0, l.y, 3, alto, f.extra ? COLOR.ambar : enCasilla.has(f) ? COLOR.morado : COLOR.gris);
      const img = trazos.get(f);
      if (img) {
        const k = Math.min(126 / img.width, (ALTO - 10) / img.height), w = img.width * k, h = img.height * k;
        l.pag.drawImage(img, { x: l.x0 + 10, y: A4.h - l.y - (ALTO + h) / 2, width: w, height: h });
      }
      const donde = f.extra ? 'Firma extra (no ocupa casilla)' : enCasilla.has(f) ? 'Impresa en su casilla' : 'Solo en este registro';
      l.texto(tx, l.y + 13, linea1(f), 8.2, { bold: true });
      l.textoDer(A4.w - l.margen.der - 10, l.y + 13, donde, 6.6, { color: f.extra ? COLOR.ambar : COLOR.gris });
      const par = paradaTxt(f.parada_id);
      if (par) l.texto(tx, l.y + 24, corta(par, 7), 7, { color: COLOR.gris });
      l.texto(tx, l.y + (par ? 35 : 27), `Firmado por ${f.nombre} · ${f.documento} · ${fechaFirma(f.firmado_en)}`, 7.4, { color: COLOR.tinta });
      if (f.lat != null && f.lon != null) {
        const gpsTxt = `GPS: ${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}${f.gps_precision_m != null ? ` (±${f.gps_precision_m} m)` : ''}${f.gps_direccion ? ` · ${f.gps_direccion}` : ''}`;
        l.texto(tx, l.y + (par ? 46 : 38), corta(gpsTxt, 6.8), 6.8, { color: COLOR.gris });
      }
      if (f.sha256) l.texto(tx, l.y + (par ? 56 : 48), `Huella SHA-256 de lo firmado: ${f.sha256}`, 5.4, { color: COLOR.gris });
      let yR = l.y + (par ? 66 : 58);
      for (const ln of reservasF) { l.texto(tx, yR, ln, 6.8, { bold: true, color: ROJA }); yR += 9; }
      l.y += alto + 6;
    }

    // NUMERACIÓN DE LAS HOJAS DE FIRMAS (usuario, 2026-11-11): «Hoja N de M» y el total
    // de firmas en el pie de CADA hoja — si alguien retirase la última, el propio pie de
    // las anteriores lo delata («1 de 2» sin la 2, o menos firmas de las declaradas).
    for (let nh = 0; nh < pagsFirmas.length; nh++) {
      const pie = `Hoja de firmas ${nh + 1} de ${pagsFirmas.length} · ${lista.length} ${lista.length === 1 ? 'firma registrada' : 'firmas registradas'} en total · CMR Nº ${e.referencia_gx ?? ''}`;
      const pagF = pagsFirmas[nh];
      pagF.drawLine({ start: { x: l.x0, y: A4.h - 800 }, end: { x: A4.w - l.margen.der, y: A4.h - 800 }, color: COLOR.grisClaro, thickness: 0.8 });
      l.texto((A4.w - l.medida(pie, 7, false)) / 2, 811, pie, 7, { color: COLOR.gris, pag: pagF });
    }
  }

  l.doc.setTitle(limpio(`CMR ${e.referencia_gx ?? ''}`));
  l.doc.setAuthor(manual ? cli?.razon_social ?? '' : D.razon_social);
  return l.guardar();
}
