import { telBonito } from '@/lib/paises';
import QRCode from 'qrcode';
import { pesoTn, tipoCargaTxt } from '@/lib/formato';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import { Lienzo, COLOR, A4, eur, num, ventanaTxt, fechaCorta, ahoraMadrid } from './lienzo';
import { DYNAMO, type DatosDoc, type ParadaDoc } from './datos';
import { nombreTipo } from '@/components/panel/TipoSitio';
import { ORDEN_TXT, idiomaDePais, rellena, fechaLoc, ventanaLoc, type IdiomaOrden } from './ordenTextos';

// ORDEN DE CARGA que Dynamo manda al transportista (el contenido y las condiciones son los
// de la orden que se manda hoy por email, p. ej. la GX61034 de febrero de 2026).
// En un envío MANUAL (el cliente con su propio operador) sale como ORDEN DE CARGA del
// cliente a su operador, SIN ninguna mención a Dynamo (como en el mockup).
//
// Desde 2026-11-10 la orden sale en DOS COPIAS (usuario: «separa en 2»):
//   · operativa  → COPIA CONDUCTOR, sin información económica (sin la sección IMPORTE)
//   · economica  → COPIA ADMINISTRACIÓN, el documento completo
// y en el IDIOMA del transportista además del español (ordenCompuesta): primero su idioma,
// luego el español. Las CONDICIONES legales solo van en las páginas en español (que
// acompañan siempre); las traducidas remiten a ellas y dicen que la española prevalece.
// Desde 2026-11-14 hay además la copia CLIENTE (usuario: «los precios a cliente no son
// lo mismo que a transportista»): el mismo documento pero con el precio DEL CLIENTE
// (importe_cliente + IVA) y SIN los datos ni el precio del transportista — en su caja
// va el cliente como ordenante y del transporte solo quedan matrículas y conductor.
// Siempre en español (el cliente contrata en español) y sin las condiciones del
// transportista (al cliente le aplican las aceptadas al confirmar el envío).

export type ParamsPago = { pct: number; minimo: number; dias: number; plazo: number };
export type CopiaOrden = 'operativa' | 'economica' | 'cliente';
export type QueOrden = 'conjunta' | 'operativa' | 'economica' | 'cliente';

const NARANJA = rgb(0.98, 0.45, 0.09);

export async function ordenDeCarga(d: DatosDoc, pago: ParamsPago, op: { copia?: CopiaOrden; idioma?: IdiomaOrden } = {}): Promise<Uint8Array> {
  const e = d.envio, manual = d.manual;
  const copia: CopiaOrden = op.copia ?? 'economica';
  const esCli = copia === 'cliente';           // la copia del cliente, siempre en español
  const idioma: IdiomaOrden = esCli ? 'es' : op.idioma ?? 'es';
  const t = ORDEN_TXT[idioma], esES = idioma === 'es';
  const D = d.dynamo ?? DYNAMO;
  const l = await Lienzo.crear({ unicode: !esES });
  let logo: PDFImage | null = null;
  if (!manual) logo = await l.doc.embedPng(await readFile(path.join(process.cwd(), 'images', '2.png')));
  const ref = e.referencia_gx ?? '';
  const emitida = ahoraMadrid();
  // Con el día de carga YA ELEGIDO (al asignar el transportista), la orden enseña ESA
  // fecha — en cabecera y en las recogidas —, no la ventana (usuario, 2026-11-13). Las
  // entregas siguen con su fecha estimada, calculada desde ese día. Sin día elegido, la
  // ventana, como siempre.
  const ventanaCarga = e.fecha_carga_prevista
    ? (esES ? fechaCorta(e.fecha_carga_prevista) : fechaLoc(e.fecha_carga_prevista, idioma))
    : esES ? ventanaTxt(e.fecha_carga_desde, e.fecha_carga_hasta) : ventanaLoc(e.fecha_carga_desde, e.fecha_carga_hasta, idioma, t);
  const fEntrega = e.fecha_entrega_estimada ? (esES ? fechaCorta(e.fecha_entrega_estimada) : fechaLoc(e.fecha_entrega_estimada, idioma)) : null;

  // ---- Banda de la copia (usuario, 2026-11-10: como el diseño aprobado) ----
  const der = A4.w - l.margen.der;
  l.rect(l.x0, 36, l.ancho, 18, COLOR.fondo);
  l.texto(l.x0 + 8, 48.5, copia === 'operativa' ? t.copiaConductor : esCli ? 'COPIA CLIENTE' : t.copiaAdmin, 8, { bold: true, color: COLOR.navy });
  l.textoDer(der - 8, 48.5, copia === 'operativa' ? t.sinEco : esCli ? 'CON TU PRECIO · SIN DATOS DEL PORTEADOR' : t.completa, 7.5, { color: COLOR.gris });

  // ---- Cabecera (solo en la 1ª página) ----
  if (logo) {
    const h = 30, w = h * logo.width / logo.height;
    l.pag.drawImage(logo, { x: l.x0, y: A4.h - 64 - h, width: w, height: h });
  } else {
    l.texto(l.x0, 82, d.cliente?.razon_social ?? '', 15, { bold: true });
    l.texto(l.x0, 96, 'Ordenante del transporte', 8.5, { color: COLOR.gris });
  }
  l.textoDer(der, 76, t.titulo, 16, { bold: true, color: COLOR.morado });
  l.textoDer(der, 90, `${t.subRef}: ${ref}`, 10, { bold: true });
  l.textoDer(der, 102, `${t.emitida} ${emitida}`, 8, { color: COLOR.gris });
  l.y = 116;
  if (!manual) {
    l.parrafo(`${D.razon_social} · CIF ${D.cif} · Wtransnet ${D.wtransnet} · ${D.direccion}, ${D.codigo_postal} ${D.poblacion} · ${D.email} · ${telBonito(D.telefono)}`, 7.5, { color: COLOR.gris });
  }
  if (!esES) l.parrafo(t.prevalece, 7.5, { color: COLOR.gris });
  l.linea(l.x0, l.y + 2, der, l.y + 2, COLOR.grisClaro, 1);
  l.y += 12;

  // ---- Transportista | Gestionada por ----
  const p = d.porteador, mitad = l.ancho / 2 - 8, xb = l.x0 + l.ancho / 2 + 8;
  const izq: [string, number, boolean][] = [];
  // Copia CLIENTE: su caja lleva al CLIENTE como ordenante — del transportista no sale
  // ni el nombre (criterio de la plataforma: el cliente solo ve matrículas y conductor).
  if (esCli) {
    const cl = d.cliente;
    if (cl) {
      izq.push([cl.razon_social, 10, true]);
      if (cl.cif) izq.push([`CIF ${cl.cif}`, 8.5, false]);
      izq.push([[cl.direccion, [cl.codigo_postal, cl.poblacion].filter(Boolean).join(' '), cl.provincia !== cl.poblacion ? cl.provincia : null].filter(Boolean).join(', '), 8, false]);
    } else izq.push(['Cliente', 10, true]);
  } else if (p) {
    izq.push([p.razon_social, 10, true]);
    izq.push([[p.cif ? `CIF ${p.cif}` : null, p.codigo ? `Código ${p.codigo}` : null].filter(Boolean).join(' · '), 8.5, false]);
    izq.push([[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia !== p.poblacion ? p.provincia : null].filter(Boolean).join(', '), 8, false]);
    izq.push([[p.contacto, p.telefono && telBonito(p.telefono), p.email].filter(Boolean).join(' · '), 8, false]);
  } else izq.push([t.pendienteTransp, 10, true]);
  const dchaTit = manual ? t.ordenante : t.gestionadaPor;
  const dcha: [string, number, boolean][] = manual
    ? [[d.cliente?.razon_social ?? '', 10, true], [d.cliente?.cif ? `CIF ${d.cliente.cif}` : '', 8.5, false],
       [[d.cliente?.contacto, d.cliente?.telefono && telBonito(d.cliente.telefono), d.cliente?.email].filter(Boolean).join(' · '), 8, false]]
    : [[`${t.operadorTrafico}: ${d.gestor?.nombre ?? 'Dynamo'}`, 9.5, true],
       [[d.gestor?.telefono && telBonito(d.gestor.telefono), d.gestor?.email ?? D.email].filter(Boolean).join(' · '), 8, false],
       [`${t.urgencias}: ${telBonito(D.telefono)}`, 8, true],
       [`${t.operadorAut} ${D.tarjeta_ot}`, 8, false]];
  const alto = (filas: [string, number, boolean][], w: number) => filas.reduce((a, [tx, s, b]) => a + (tx ? l.partir(tx, s, w, b).length * s * 1.3 : 0), 0);
  const hCaja = Math.max(alto(izq, mitad - 20), alto(dcha, mitad - 20)) + 30;
  l.rect(l.x0, l.y, mitad, hCaja, COLOR.fondo);
  l.rect(xb, l.y, mitad, hCaja, COLOR.fondo);
  l.texto(l.x0 + 10, l.y + 14, esCli ? 'Cliente · Ordenante del transporte' : manual ? t.transp : t.transpRealiza, 7.5, { bold: true, color: COLOR.gris });
  // Envío manual: el logo del operador (si el cliente lo subió), arriba a la derecha de su caja.
  if (manual && d.logoPorteador) {
    try {
      const esPng = d.logoPorteador[0] === 0x89;
      const img = esPng ? await l.doc.embedPng(d.logoPorteador) : await l.doc.embedJpg(d.logoPorteador);
      const k = Math.min(70 / img.width, 22 / img.height);
      l.pag.drawImage(img, { x: l.x0 + mitad - 10 - img.width * k, y: A4.h - l.y - 6 - img.height * k, width: img.width * k, height: img.height * k });
    } catch { /* un logo en un formato que el PDF no admite (webp, heic) no impide la orden */ }
  }
  l.texto(xb + 10, l.y + 14, dchaTit, 7.5, { bold: true, color: COLOR.gris });
  const top0 = l.y;
  for (const [x, filas] of [[l.x0 + 10, izq], [xb + 10, dcha]] as const) {
    l.y = top0 + 22;
    for (const [tx, s, b] of filas) if (tx) l.parrafo(tx, s, { bold: b, x, ancho: mitad - 20 });
  }
  l.y = top0 + hCaja + 14;

  // ---- Resumen + QR en UNA banda compacta (usuario, 2026-11-13) ----
  // La franja morada (nº, fecha, matrículas) va a la IZQUIERDA con el texto del
  // documento de control debajo, y la tarjeta del QR a la DERECHA a la misma altura.
  // EN LAS DOS COPIAS (usuario, 2026-11-13: «con precio o sin precios, ambas deben
  // llevar el DeCA QR»): el QR abre el eCMR/DeCA público, que no enseña precios.
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
  const franja: [string, string][] = [
    [t.nEnvio, ref], [t.fechaCargaL, ventanaCarga],
    [t.matriculasAutL, matr || t.pendAsignar],
  ];
  if (e.referencia_cliente) franja.push([t.referenciaL, e.referencia_cliente]);
  {
    const cw = 96, ch = 91;
    // Envío manual (usuario, 2026-11-14): SIN tarjeta de QR — la franja ocupa todo el
    // ancho y debajo va una caja de aviso (el DeCA y el CMR se gestionan entre las partes).
    const wIzq = manual ? l.ancho : l.ancho - cw - 12;
    const wCol = wIzq / franja.length;
    const partesFranja = franja.map(([, v]) => l.partir(v, 9.5, wCol - 14, true).slice(0, 2));
    const hFranja = 22 + Math.max(...partesFranja.map((x) => x.length)) * 12;
    l.sitio(Math.max(ch, hFranja + 30) + 8);
    const ct = l.y;
    l.rect(l.x0, ct, wIzq, hFranja, COLOR.moradoSuave);
    franja.forEach(([k], i) => {
      const x = l.x0 + 10 + i * wCol;
      l.texto(x, ct + 13, k, 7, { bold: true, color: COLOR.gris });
      partesFranja[i].forEach((ln, j) => l.texto(x, ct + 26 + j * 12, ln, 9.5, { bold: true, color: !matr && i === 2 ? COLOR.rojo : COLOR.navy }));
    });
    // El texto del documento de control, debajo de la franja (misma columna izquierda).
    l.y = ct + hFranja + 10;
    if (manual) {
      const lineas = l.partir(t.decaManual, 8, wIzq - 20, true);
      const hAviso = lineas.length * 10.6 + 14;
      l.sitio(hAviso + 6);
      const cy = l.y + 2;
      l.pag.drawRectangle({ x: l.x0, y: A4.h - cy - hAviso, width: wIzq, height: hAviso, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 1 });
      lineas.forEach((ln, i) => l.texto(l.x0 + 10, cy + 15 + i * 10.6, ln, 8, { bold: true, color: COLOR.navy }));
      l.y = cy + hAviso + 4;
    } else {
      l.parrafo(t.qrDeca, 8, { bold: true, x: l.x0, ancho: wIzq - 4, color: COLOR.navy });
    }
    const finIzq = l.y;
    // Tarjeta del QR a la derecha, alineada arriba con la franja. Con transportista y
    // matrícula lleva el QR real (abre el PDF completo del CMR-DeCA con la hoja de
    // firmas); si no, el hueco punteado — el diseño no cambia al asignar.
    if (!manual) {
    let qrImg: PDFImage | null = null;
    // En la copia cliente el porteador no viaja en los datos (solo matrículas y
    // conductor): con matrícula ya hay transporte asignado y el QR va igual.
    if (d.deca && (p || esCli) && e.matricula_camion) {
      try { qrImg = await l.doc.embedPng(await QRCode.toBuffer(`${d.deca.url}/pdf`, { margin: 0, scale: 4 })); } catch { qrImg = null; }
    }
    const cx = der - cw, r = 8;
    l.pag.drawSvgPath(
      `M ${r} 0 H ${cw - r} Q ${cw} 0 ${cw} ${r} V ${ch - r} Q ${cw} ${ch} ${cw - r} ${ch} H ${r} Q 0 ${ch} 0 ${ch - r} V ${r} Q 0 0 ${r} 0 Z`,
      { x: cx, y: A4.h - ct, color: COLOR.blanco, borderColor: COLOR.grisClaro, borderWidth: 1 });
    const tTit = 'QR e-CMR / DeCA';
    l.texto(cx + (cw - l.medida(tTit, 6.8, true)) / 2, ct + 12, tTit, 6.8, { bold: true, color: COLOR.navy });
    if (qrImg) {
      l.pag.drawImage(qrImg, { x: cx + (cw - 62) / 2, y: A4.h - (ct + 16) - 62, width: 62, height: 62 });
    } else {
      l.pag.drawRectangle({ x: cx + (cw - 58) / 2, y: A4.h - (ct + 18) - 58, width: 58, height: 58, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 1, borderDashArray: [3, 3] });
      l.texto(cx + (cw - l.medida('QR', 9, true)) / 2, ct + 50, 'QR', 9, { bold: true, color: COLOR.gris });
    }
    const tPie = qrImg ? t.qrEscanea : t.qrPendiente;
    l.texto(cx + (cw - l.medida(tPie, 5.4)) / 2, ct + 86, tPie, 5.4, { color: COLOR.gris });
    }
    l.y = manual ? finIzq + 8 : Math.max(finIzq, ct + ch) + 12;
  }

  // ---- Recogidas y entregas ----
  const seccion = (titulo: string) => {
    l.sitio(90);   // que el título no se quede solo al pie de la página
    l.texto(l.x0, l.y + 10, titulo, 9.5, { bold: true, color: COLOR.morado });
    l.linea(l.x0, l.y + 15, der, l.y + 15);
    l.y += 24;
  };
  const punto = (pa: ParadaDoc, n: number, recogida: boolean) => {
    const filas: [string, string, boolean?][] = [];
    filas.push([t.fecha, recogida ? ventanaCarga : (fEntrega ? `${fEntrega} ${t.estimada}` : t.porConfirmar), true]);
    filas.push([t.horario, pa.horarios || t.consultaDynamo, true]);
    filas.push([t.empresa, pa.nombre_empresa || t.faltanEmpresa, true]);
    filas.push([t.direccion, [pa.direccion, [pa.codigo_postal, pa.poblacion].filter(Boolean).join(' '), pa.provincia !== pa.poblacion ? pa.provincia : null, pa.pais].filter(Boolean).join(', ')]);
    if (pa.contacto?.telefono || pa.contacto?.nombre) filas.push([t.contacto, [pa.contacto?.nombre, pa.contacto?.telefono && telBonito(pa.contacto.telefono)].filter(Boolean).join(': ')]);
    if (pa.referencia) filas.push([t.referencia, pa.referencia, true]);
    if (pa.tipo_sitio) filas.push([t.tipoSitio, nombreTipo(pa.tipo_sitio)]);
    const avisos = [pa.requiere_cita && t.citaPrevia, !pa.tiene_medios_carga && t.sinMedios].filter(Boolean) as string[];
    if (avisos.length) filas.push([t.atencion, avisos.join(' · '), true]);
    if (pa.url_google_maps) filas.push(['Google Maps', pa.url_google_maps]);
    // El DETALLE DE MERCANCÍA de la parada (el campo «A recoger / A entregar» de Nuevo
    // envío: «Parte de: …» por defecto con varias paradas, o lo escrito a mano) sale con
    // su propia etiqueta «Mercancía», no como una indicación más (usuario, 2026-11-13).
    const notas: string[] = [];
    let merc: string | null = null;
    for (const n2 of [pa.notas_sitio, pa.anotaciones].filter(Boolean) as string[]) {
      const m = n2.match(/(?:^|\n)MERCANCÍA:\s*([^\n]+)/);
      if (m && merc == null) {
        merc = m[1].trim();
        const resto = n2.replace(m[0], '\n').replace(/\n{2,}/g, '\n').trim();
        if (resto) notas.push(resto);
      } else notas.push(n2);
    }
    if (merc) filas.push([t.mercancia, merc, true]);
    for (const n2 of notas) filas.push([t.indicaciones, n2]);

    const xK = l.x0 + 16, xV = l.x0 + 128, wV = der - xV - 6;
    // La clave también se parte (los idiomas con etiquetas largas no deben pisar el valor).
    const lineas = filas.map(([k, v, b]) => ({ k0: k, k: l.partir(k, 8, xV - xK - 8, true), v: l.partir(v, 8.8, wV, b), b }));
    const altoF = (f: { k: string[]; v: string[] }) => Math.max(f.v.length * 11.6, f.k.length * 10.4);
    const h = 22 + lineas.reduce((a, f) => a + altoF(f) + 2, 0) + 6;
    l.sitio(Math.min(h, 300));
    const color = recogida ? NARANJA : COLOR.verde;
    l.rect(l.x0, l.y, 3, h - 4, color);
    l.texto(xK, l.y + 12, `${n} · ${recogida ? t.recogida : t.entrega}`, 9, { bold: true, color });
    l.y += 22;
    for (const f of lineas) {
      l.sitio(altoF(f));
      f.k.forEach((ln, i) => l.texto(xK, l.y + 8.8 + i * 10.4, ln, 8, { bold: true, color: COLOR.gris }));
      const rojo = f.k0 === t.empresa && !pa.nombre_empresa || f.k0 === t.atencion;
      f.v.forEach((ln, i) => l.texto(xV, l.y + 8.8 + i * 11.6, ln, 8.8, { bold: f.b, color: rojo ? COLOR.rojo : COLOR.navy }));
      l.y += altoF(f) + 2;
    }
    l.y += 10;
  };
  const rec = d.paradas.filter((x) => x.tipo === 'carga'), ent = d.paradas.filter((x) => x.tipo === 'descarga');
  seccion(rec.length > 1 ? t.recogidas : t.recogida);
  rec.forEach((pa, i) => punto(pa, i + 1, true));
  seccion(ent.length > 1 ? t.entregas : t.entrega);
  // Nº de PARADA correlativo en todo (usuario, 2026-11-11): 1-2 recogidas → 3-4 entregas.
  ent.forEach((pa, i) => punto(pa, rec.length + i + 1, false));

  // ---- Mercancía, vehículo y conductor ----
  const kv = (filas: [string, string, { bold?: boolean; rojo?: boolean }?][]) => {
    const xV = l.x0 + 128, wV = der - xV;
    for (const [k, v, o] of filas) {
      if (!v) continue;
      const ks = l.partir(k, 8, xV - l.x0 - 8, true);          // la clave también se parte
      const ls = l.partir(v, 8.8, wV, o?.bold);
      const alto = Math.max(ls.length * 11.6, ks.length * 10.4);
      l.sitio(alto + 3);
      ks.forEach((ln, i) => l.texto(l.x0, l.y + 8.8 + i * 10.4, ln, 8, { bold: true, color: COLOR.gris }));
      ls.forEach((ln, i) => l.texto(xV, l.y + 8.8 + i * 11.6, ln, 8.8, { bold: o?.bold, color: o?.rojo ? COLOR.rojo : COLOR.navy }));
      l.y += alto + 3;
    }
    l.y += 8;
  };
  seccion(t.secMercancia);
  const forma = [e.carga_lateral && t.cargaLateral, e.carga_trasera && t.cargaTrasera, e.carga_techo && t.cargaTecho].filter(Boolean).join(' · ');
  const tipoCarga = esES ? tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora)
    : e.tipo_carga === 'completa' ? (e.requiere_plataforma_elevadora ? t.rigidoCompleto : t.cargaCompleta) : e.tipo_carga === 'grupaje' ? t.grupaje : '';
  kv([
    [t.mercancia, [e.descripcion_mercancia || (e.paletizado === false ? t.noPaletizada : t.paletizada),
      e.toneladas != null ? `${pesoTn(e.toneladas)}` : null, e.metros_lineales != null ? `${num(e.metros_lineales)} ${t.metrosLineales}` : null,
      e.num_bultos != null ? `${e.num_bultos} ${e.num_bultos === 1 ? t.bulto : t.bultos}${e.embalaje ? ` (${e.embalaje})` : ''}` : null,
      e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : null].filter(Boolean).join(' · '), { bold: true }],
    // Altura máxima del hueco (usuario, 2026-11-12): que cliente y transportista la
    // vean en la orden. Tráiler 2,70 m; rígido con plataforma 2,60 m.
    [t.tipoTransporte, `${e.requiere_plataforma_elevadora ? t.rigido : t.tauliner} · ${rellena(t.alturaMax, { m: idioma === 'en' ? (e.requiere_plataforma_elevadora ? '2.60' : '2.70') : (e.requiere_plataforma_elevadora ? '2,60' : '2,70') })}`],
    [t.tipoCarga, [tipoCarga || t.grupaje, forma].filter(Boolean).join(' · ')],
    [t.requisitos, [e.requiere_nima && `${t.requiereNima}${e.transportista_nima && !esCli ? ` (${e.transportista_nima})` : ''}`, e.adr && t.adr].filter(Boolean).join(' · '), { bold: true, rojo: !!e.adr }],
    [t.importante, t.txtImportante],
  ]);
  seccion(t.secMatr);
  kv([
    [t.matriculasAutL, matr || t.pendMatrEnvia, { bold: true, rojo: !matr }],
    [t.conductor, [e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ') || t.pendComunicar],
    ['', t.txtSoloMatr],
  ]);

  // ---- Importe (SOLO en la copia completa; la del conductor va sin economía) ----
  // La copia CLIENTE lleva SU precio (importe_cliente + IVA), nunca el del transportista.
  if (esCli && !manual) {
    seccion(t.secImporte);
    const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
    kv([[t.importeL, pc != null ? `${eur(pc)} + IVA (${num(e.iva_pct != null ? Number(e.iva_pct) : 21)} %)` : t.pendiente, { bold: true }]]);
    l.sitio(24);
    l.parrafo('Aplican los Términos y condiciones aceptados al confirmar el envío en dynamotrans.com.', 8, { color: COLOR.gris, despues: 6 });
  }
  const precio = manual ? e.precio_acordado_operador : e.importe_transportista;
  if (copia === 'economica' && (precio != null || !manual)) {
    seccion(t.secImporte);
    const filas: [string, string, { bold?: boolean }?][] = [[t.importeL, precio != null ? `${eur(precio)}  ${t.impuestosNo}` : t.pendiente, { bold: true }]];
    if (!manual) {
      if (d.pronto_pago && precio != null) {
        const dto = Math.max(Math.round(Number(precio) * pago.pct) / 100, pago.minimo);
        filas.push([t.formaPago, rellena(t.txtProntoPago, { dias: String(pago.dias), pct: num(pago.pct), min: eur(pago.minimo), neto: eur(Number(precio) - dto) }), { bold: true }]);
      } else {
        filas.push([t.formaPago, rellena(t.txtTransferencia, { dias: String(e.plazo_pago_transportista ?? pago.plazo) })]);
      }
      filas.push([t.facturaL, rellena(t.txtFactura, { ref, email: D.email }), { bold: true }]);
    }
    kv(filas);
  }

  if (e.discrecion_comercial && !manual) {
    l.sitio(46);
    const tx = t.txtDiscrecion;
    const ls = l.partir(tx, 8.8, l.ancho - 20, true);
    l.rect(l.x0, l.y, l.ancho, ls.length * 11.6 + 14, COLOR.ambarSuave, rgb(1, 0.84, 0.57));
    ls.forEach((ln, i) => l.texto(l.x0 + 10, l.y + 15 + i * 11.6, ln, 8.8, { bold: true, color: COLOR.ambar }));
    l.y += ls.length * 11.6 + 26;
  }

  // ---- Condiciones: solo en las páginas en ESPAÑOL (las traducidas remiten a ellas) ----
  if (!manual && !esES) {
    l.sitio(30);
    l.parrafo(`${t.verCondEs} ${t.prevalece}`, 8, { bold: true, color: COLOR.navy, despues: 6 });
  }
  // Las condiciones del TRANSPORTISTA no van en la copia del cliente (a él le aplican
  // las condiciones generales aceptadas al confirmar el envío).
  if (!manual && esES && !esCli) {
    seccion(t.secCond);
    // Cada condición: su título en negrita y el texto debajo.
    const c = (tx: string) => {
      const i = tx.indexOf('. ');
      const [tit, cuerpo] = i > 0 && i < 40 ? [tx.slice(0, i), tx.slice(i + 2)] : ['', tx];
      if (tit) { l.sitio(30); l.parrafo(tit, 7.8, { bold: true, despues: 0.5 }); }
      l.parrafo(cuerpo, 7.6, { color: COLOR.navy, despues: 5 });
    };
    c(`Aceptación. La ausencia de un rechazo escrito a esta orden de carga en un plazo de 30 minutos desde su envío equivale a su aceptación con todas sus condiciones. La aceptación de la orden y/o la realización del servicio de transporte supone aceptar estas condiciones y los Términos y condiciones generales de contratación para transportistas: https://www.dynamotrans.com/condiciones-transportistas Salvo acuerdo por escrito en contrario, para cualquier controversia derivada de esta orden de carga las partes se someten a los juzgados y tribunales de Sevilla.`);
    c('Recuento en la carga. El conductor debe estar presente en la carga de su camión, cerciorarse de los bultos que entran, contar personalmente el número de palets junto al personal que carga y cotejarlo con la documentación que se le entrega. Si encuentra alguna discrepancia, la comunicará al operario para solventarla en ese momento. Si el conductor se niega a estar presente en el recuento final, se asumirá que la mercancía se cargó completa y correctamente identificada en el albarán, y cualquier reserva de falta en la entrega se repercutirá al transportista efectivo.');
    c('Cancelación. El transportista asignado renuncia expresamente a reclamar el cobro íntegro del envío, lucro cesante o cualquier importe distinto al aquí pactado. Si el transporte se cancela por cualquier causa, la única y máxima compensación a percibir queda limitada a un día de paralización, calculado conforme a la normativa de transporte vigente y al baremo legal del año en curso, con un máximo de 400 € por día completo.');
    c('Paralizaciones y esperas. Solo se aceptarán si se cumplen todos estos requisitos: (1) notificación previa por email a Dynamo en el mismo momento en que se produzca o se prevea, con el motivo y el tiempo estimado; no se aceptan paralizaciones comunicadas a posteriori; (2) acreditación en la carta de porte / CMR con la hora de entrada y de salida en carga y/o descarga, de forma clara y legible; (3) esas horas firmadas y selladas por el cargador en origen y por el destinatario en destino. Sin notificación previa y sin CMR firmado con horas, Dynamo no asumirá ningún coste por paralización, aunque haya existido demora.');
    c(`Siniestros. Ante cualquier daño, rotura o faltante de la mercancía, avisa a Dynamo (${telBonito(D.telefono)}, 24 h) en ese mismo momento y ANTES de terminar la carga o la descarga, y anota las reservas en el CMR o el albarán con la firma de las partes. Sin reservas documentadas no se puede declarar el siniestro al seguro.`);
    c('Documentación. Envíanos los albaranes, packing list, CMR y/o carta de porte y cualquier documentación entregada en carga y descarga, debidamente sellados y firmados por el transportista efectivo, los cargadores y los destinatarios. Si no hay sello de empresa, anota el nombre de la empresa y su CIF y, en todos los casos, el nombre, apellidos, DNI y firma de la persona que interviene. Archiva y guarda los originales por si hubiera que reclamarlos.');
    c('Facturación. No admitimos cesión de facturas a terceros: los pagos se hacen únicamente al proveedor que figura en esta orden de carga. En graneles con precio pactado por peso transportado, se aplicará el precio en €/Tn.');
  }

  // ---- Pie en todas las páginas ----
  const pags = l.doc.getPages();
  pags.forEach((pg, i) => {
    const pie = manual
      ? `Orden de carga ${ref} · emitida por ${d.cliente?.razon_social ?? ''} · ${emitida}`
      : `${D.razon_social} · CIF ${D.cif} · O.T. ${D.tarjeta_ot} · ${t.urgencias} ${telBonito(D.telefono)} · ${ref}`;
    pg.drawLine({ start: { x: l.x0, y: 40 }, end: { x: der, y: 40 }, thickness: 0.6, color: COLOR.grisClaro });
    l.texto(l.x0, A4.h - 28, pie, 7, { color: COLOR.gris, pag: pg });
    const n = `${t.pagina} ${i + 1} ${t.de} ${pags.length}`;
    l.texto(der - l.medida(n, 7), A4.h - 28, n, 7, { color: COLOR.gris, pag: pg });
  });
  l.doc.setTitle(`${t.titulo} ${ref}`);
  l.doc.setAuthor(manual ? d.cliente?.razon_social ?? '' : D.razon_social);
  return l.guardar();
}

// La orden COMPUESTA que se comparte con el transportista (usuario, 2026-11-10):
// las copias pedidas (conjunta = conductor + administración), primero en el idioma del
// transportista y después en español. Con idioma español, solo las páginas en español.
export async function ordenCompuesta(d: DatosDoc, pago: ParamsPago, que: QueOrden, idioma?: IdiomaOrden): Promise<Uint8Array> {
  const idi: IdiomaOrden = idioma ?? idiomaDePais(d.porteador?.pais_iso);
  // La copia CLIENTE va siempre y solo en español (el cliente contrata en español).
  const idiomas: IdiomaOrden[] = que === 'cliente' || idi === 'es' ? ['es'] : [idi, 'es'];
  const copias: CopiaOrden[] = que === 'conjunta' ? ['operativa', 'economica'] : [que];
  const partes: Uint8Array[] = [];
  for (const i of idiomas) for (const c of copias) partes.push(await ordenDeCarga(d, pago, { copia: c, idioma: i }));
  if (partes.length === 1) return partes[0];
  const doc = await PDFDocument.create();
  for (const b of partes) {
    const src = await PDFDocument.load(b);
    (await doc.copyPages(src, src.getPageIndices())).forEach((pg) => doc.addPage(pg));
  }
  doc.setTitle(`${ORDEN_TXT.es.titulo} ${d.envio.referencia_gx ?? ''}`);
  doc.setAuthor((d.dynamo ?? DYNAMO).razon_social);
  return doc.save();
}
