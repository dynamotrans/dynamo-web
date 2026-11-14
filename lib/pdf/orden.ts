import { telBonito } from '@/lib/paises';
import QRCode from 'qrcode';
import { pesoTn, tipoCargaTxt, fechaHora } from '@/lib/formato';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFImage, type RGB } from 'pdf-lib';
import { Lienzo, COLOR, A4, eur, num, ventanaTxt, fechaCorta, ahoraMadrid } from './lienzo';
import { DYNAMO, type DatosDoc, type FirmaDoc, type ParadaDoc } from './datos';
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

// La copia del CONDUCTOR es, legalmente, la copia del DeCA que debe llevar a bordo
// (Resolución de 5-jun-2026, apdo. séptimo): su título es «DeCA» —no «orden de carga»—
// y la banda lleva el nombre oficial completo (usuario, 2026-11-14). El nombre es el del
// documento español: no se traduce.
const DECA_NOMBRE = 'Documento electrónico de Control Administrativo';

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
  // FIRMAS ESTAMPADAS EN EL DeCA (usuario, 2026-11-14): en la copia del conductor —que
  // es el DeCA— el trazo de cada firma del e-CMR queda estampado junto a su sitio (y el
  // del transportista junto a la banda), con un hueco «pendiente» mientras no exista.
  // El acto de firmar sigue siendo único y del e-CMR (QR); esto es la constancia.
  const conFirmas = copia === 'operativa' && !manual;
  const firmaDe = (rol: string, parada: string | null) =>
    (d.firmas ?? []).find((f) => !f.extra && f.rol === rol && (rol === 'transportista' || f.parada_id === parada));
  // El mapa de trazos va POR FIRMA, no por casilla: una firma extra de la misma casilla
  // pisaba el trazo de la principal (bug visto por el usuario el 2026-11-14).
  const trazos = new Map<FirmaDoc, PDFImage>();
  if (conFirmas) for (const f of d.firmas ?? []) {
    if (f.png) { try { trazos.set(f, await l.doc.embedPng(f.png)); } catch { /* sin trazo */ } }
  }
  // REJILLA DE FIRMAS al pie del DeCA (usuario, 2026-11-14): cuadros seguidos de
  // izquierda a derecha, 4 por fila a lo ancho escribible; con más de 4 siguen en la
  // fila de abajo, empezando por la izquierda. Cada cuadro lleva PREIMPRESOS su papel
  // («RECOGIDA 1 · CARGADOR», «ENTREGA 1 · DESTINATARIO», numerados por tipo, y el del
  // transportista) y la empresa del sitio. Con firma digital del e-CMR, el trazo queda
  // estampado dentro; sin ella, el recuadro en blanco sirve para firmar A MANO el impreso.
  const cuadroFirma = (x: number, w: number, hB: number, f: FirmaDoc | undefined, rol: string, titulo: string, empresa: string, color: RGB) => {
    const casilla = rol === 'remitente' ? '22' : rol === 'transportista' ? '23' : '24';
    const yB = l.y;
    cajaR(x, yB, w, hB, COLOR.blanco, COLOR.grisClaro, 6);
    l.texto(x + 6, yB + 10, l.partir(titulo, 6.5, w - 42, true)[0] ?? '', 6.5, { bold: true, color });
    l.textoDer(x + w - 5, yB + 10, `e-CMR ${casilla}`, 5.4, { color: COLOR.gris });
    l.texto(x + 6, yB + 18.5, l.partir(empresa, 6.2, w - 12)[0] ?? '', 6.2, { color: COLOR.gris });
    l.linea(x + 5, yB + 22.5, x + w - 5, yB + 22.5);
    if (f) {
      const img = trazos.get(f);
      if (img) {
        const h = 22, wTr = Math.min(w - 14, h * img.width / img.height);
        l.pag.drawImage(img, { x: x + 7, y: A4.h - (yB + 26) - h, width: wTr, height: h });
      }
      l.texto(x + 6, yB + hB - 12, l.partir(`${f.nombre} · ${f.documento}`, 6.3, w - 12, true)[0] ?? '', 6.3, { bold: true, color: COLOR.navy });
      l.texto(x + 6, yB + hB - 5, fechaHora(f.firmado_en), 5.6, { color: COLOR.gris });
    } else {
      const ps = l.partir(t.firmaPend, 5.2, w - 12).slice(0, 2);
      ps.forEach((ln, i) => l.texto(x + 6, yB + hB - 13 + i * 6.5, ln, 5.2, { color: COLOR.gris }));
    }
  };
  // Con el día de carga YA ELEGIDO (al asignar el transportista), la orden enseña ESA
  // fecha — en cabecera y en las recogidas —, no la ventana (usuario, 2026-11-13). Las
  // entregas siguen con su fecha estimada, calculada desde ese día. Sin día elegido, la
  // ventana, como siempre.
  const ventanaCarga = e.fecha_carga_prevista
    ? (esES ? fechaCorta(e.fecha_carga_prevista) : fechaLoc(e.fecha_carga_prevista, idioma))
    : esES ? ventanaTxt(e.fecha_carga_desde, e.fecha_carga_hasta) : ventanaLoc(e.fecha_carga_desde, e.fecha_carga_hasta, idioma, t);
  const fEntrega = e.fecha_entrega_estimada ? (esES ? fechaCorta(e.fecha_entrega_estimada) : fechaLoc(e.fecha_entrega_estimada, idioma)) : null;

  // ---- Piezas de diseño (usuario, 2026-11-14: el encaje de la orden antigua —líneas,
  // cajas con borde fino, etiquetas espaciadas— mezclado con las cajas suaves) ----
  const der = A4.w - l.margen.der;
  const esp = (s2: string) => s2.toUpperCase().split('').join(' ');
  const cajaR = (x: number, top: number, w: number, h: number, fill: RGB, border?: RGB, r = 8) => {
    l.pag.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
      { x, y: A4.h - top, color: fill, borderColor: border, borderWidth: border ? 1 : 0 });
  };
  // PLAQUITA de matrícula: banda azul UE con la «E» y el número sobre fondo blanco.
  const AZUL_UE = rgb(0, 0.2, 0.6);
  const plaquita = (x: number, top: number, txt: string) => {
    const w = 13 + l.medida(txt, 9, true) + 12;
    cajaR(x, top, w, 17, COLOR.blanco, COLOR.navy, 3);
    l.pag.drawRectangle({ x: x + 1, y: A4.h - top - 16, width: 9, height: 15, color: AZUL_UE });
    l.texto(x + 3.4, top + 12.5, 'E', 6, { bold: true, color: COLOR.blanco });
    l.texto(x + 15, top + 12.5, txt, 9, { bold: true, color: COLOR.tinta });
    return w;
  };
  // Tintes suaves de las tarjetas de recogida (naranja) y entrega (verde).
  const TINTE_REC = rgb(1, 0.972, 0.945), TINTE_ENT = rgb(0.953, 0.982, 0.962);
  // Caja de AVISO del diseño antiguo: borde fino, barra de acento y la palabra clave en
  // negrita seguida del texto en la misma línea.
  const aviso = (lead: string, cuerpo: string, acento: RGB) => {
    const wT = l.ancho - 24, leadTxt = `${lead}. `, wLead = l.medida(`${lead}.`, 7.6, true) + 3.5;
    const palabras = cuerpo.split(/\s+/).filter(Boolean);
    let primera = '';
    while (palabras.length && l.medida(`${primera}${primera ? ' ' : ''}${palabras[0]}`, 7.6) <= wT - wLead) primera += `${primera ? ' ' : ''}${palabras.shift()}`;
    const lineas = l.partir(palabras.join(' '), 7.6, wT);
    const hA = 13 + (1 + (palabras.length ? lineas.length : 0)) * 9.6;
    l.sitio(hA + 8);
    const at = l.y;
    cajaR(l.x0, at, l.ancho, hA, COLOR.blanco, COLOR.grisClaro, 6);
    l.pag.drawRectangle({ x: l.x0 + 1.2, y: A4.h - at - hA + 5, width: 3, height: hA - 10, color: acento });
    l.texto(l.x0 + 12, at + 14, leadTxt, 7.6, { bold: true, color: COLOR.navy });
    l.texto(l.x0 + 12 + wLead, at + 14, primera, 7.6, { color: COLOR.tinta });
    if (palabras.length) lineas.forEach((ln, i) => l.texto(l.x0 + 12, at + 14 + (i + 1) * 9.6, ln, 7.6, { color: COLOR.tinta }));
    l.y = at + hA + 8;
  };

  // ---- Banda de la copia (rediseño 2026-11-14: la caja fina con el tic del diseño antiguo) ----
  cajaR(l.x0, 36, l.ancho, 18, COLOR.blanco, COLOR.grisClaro, 4);
  l.pag.drawRectangle({ x: l.x0 + 8, y: A4.h - 50.5, width: 3, height: 10, color: COLOR.navy });
  l.texto(l.x0 + 17, 48, esp(copia === 'operativa' ? 'DeCA' : esCli ? 'Copia cliente' : t.copiaAdmin), 6.8, { bold: true, color: COLOR.navy });
  l.textoDer(der - 10, 48, esp(copia === 'operativa' ? t.sinEco : esCli ? 'Con tu precio · sin porteador' : t.completa), 5.4, { bold: true, color: COLOR.gris });

  // ---- Cabecera: logo a la izquierda; a la derecha título, subtítulo espaciado,
  // referencia en grande y emisión. Debajo, la regla con la cinta tricolor. ----
  if (logo) {
    const h = 34, w = h * logo.width / logo.height;
    l.pag.drawImage(logo, { x: l.x0, y: A4.h - 66 - h, width: w, height: h });
  } else {
    l.texto(l.x0, 84, d.cliente?.razon_social ?? '', 15, { bold: true });
    l.texto(l.x0, 98, 'Ordenante del transporte', 8.5, { color: COLOR.gris });
  }
  l.textoDer(der, 81, copia === 'operativa' ? 'DeCA' : t.titulo, 17, { bold: true, color: COLOR.navy });
  l.textoDer(der, 92, esp(copia === 'operativa' ? DECA_NOMBRE : t.subConfirmado), 5, { bold: true, color: COLOR.gris });
  l.textoDer(der, 104, esp(t.subRef), 5.4, { bold: true, color: COLOR.gris });
  l.textoDer(der, 117, ref || '—', 12, { bold: true, color: COLOR.navy });
  l.textoDer(der, 127, `${t.emitida} ${emitida}`, 6.4, { color: COLOR.gris });
  l.linea(l.x0, 134, der, 134, COLOR.grisClaro, 1.2);
  [COLOR.morado, COLOR.verde, NARANJA].forEach((c2, i2) =>
    l.pag.drawRectangle({ x: l.x0 + i2 * 18, y: A4.h - 135.5, width: 16, height: 3, color: c2 }));
  l.y = 142;
  if (!esES) l.parrafo(t.prevalece, 7.5, { color: COLOR.gris });

  // ---- Barra de ruta (diseño antiguo): ORIGEN → DESTINO · SALIDA + recuento ----
  const rec = d.paradas.filter((x) => x.tipo === 'carga'), ent = d.paradas.filter((x) => x.tipo === 'descarga');
  {
    const lugarCorto = (pa?: ParadaDoc) => pa ? [[pa.codigo_postal, pa.poblacion].filter(Boolean).join(' '), pa.pais].filter(Boolean).join(' · ') : '—';
    const rt = l.y, hR = 34;
    cajaR(l.x0, rt, l.ancho, hR, COLOR.blanco, COLOR.grisClaro, 6);
    const xO = l.x0 + 12, xD = l.x0 + l.ancho * 0.40;
    const wSal = Math.max(l.medida(ventanaCarga, 9, true), l.medida(esp(t.salidaL), 5.4, true)) + 14;
    l.texto(xO, rt + 13, esp(t.origenL), 5.4, { bold: true, color: COLOR.gris });
    l.pag.drawCircle({ x: xO + 3, y: A4.h - rt - 23, size: 2.6, color: NARANJA });
    l.texto(xO + 9, rt + 26, l.partir(lugarCorto(rec[0]), 9, xD - xO - 38, true)[0] ?? '—', 9, { bold: true, color: COLOR.navy });
    {  // flecha dibujada (la «→» no está en la codificación del tipo de letra)
      const ay = A4.h - rt - 22, ax = xD - 26;
      l.pag.drawLine({ start: { x: ax, y: ay }, end: { x: ax + 13, y: ay }, thickness: 1.1, color: COLOR.gris });
      l.pag.drawLine({ start: { x: ax + 9, y: ay + 3.2 }, end: { x: ax + 13, y: ay }, thickness: 1.1, color: COLOR.gris });
      l.pag.drawLine({ start: { x: ax + 9, y: ay - 3.2 }, end: { x: ax + 13, y: ay }, thickness: 1.1, color: COLOR.gris });
    }
    l.texto(xD, rt + 13, esp(t.destinoL), 5.4, { bold: true, color: COLOR.gris });
    l.pag.drawCircle({ x: xD + 3, y: A4.h - rt - 23, size: 2.6, color: COLOR.verde });
    l.texto(xD + 9, rt + 26, l.partir(lugarCorto(ent[ent.length - 1]), 9, der - wSal - xD - 24, true)[0] ?? '—', 9, { bold: true, color: COLOR.navy });
    l.textoDer(der - 12, rt + 13, esp(t.salidaL), 5.4, { bold: true, color: COLOR.gris });
    l.textoDer(der - 12, rt + 26, ventanaCarga, 9, { bold: true, color: COLOR.navy });
    l.y = rt + hR + 5;
    l.texto(l.x0 + 2, l.y + 7, `${rec.length} ${(rec.length === 1 ? t.recogida : t.recogidas).toLowerCase()} · ${ent.length} ${(ent.length === 1 ? t.entrega : t.entregas).toLowerCase()}`, 6.6, { bold: true, color: COLOR.gris });
    l.y += 15;
  }

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
  // En el DeCA (copia del conductor) las partes van con sus FIGURAS LEGALES (usuario,
  // 2026-11-14): Dynamo es «cargador contractual y cargador» (como operador asume la
  // posición de cargador frente al transportista efectivo). En las páginas traducidas se
  // mantiene el término legal español delante de la etiqueta del idioma.
  const dchaTit = manual ? t.ordenante
    : copia === 'operativa' ? (esES ? 'CARGADOR CONTRACTUAL' : `CARGADOR CONTRACTUAL · ${t.gestionadaPor}`)
    : t.gestionadaPor;
  const dcha: [string, number, boolean][] = manual
    ? [[d.cliente?.razon_social ?? '', 10, true], [d.cliente?.cif ? `CIF ${d.cliente.cif}` : '', 8.5, false],
       [[d.cliente?.contacto, d.cliente?.telefono && telBonito(d.cliente.telefono), d.cliente?.email].filter(Boolean).join(' · '), 8, false]]
    // En el DeCA, la figura legal a secas: razón social, CIF, urgencias y autorización
    // (texto fijado por el usuario, 2026-11-14 — fuera «operador de tráfico» y el email).
    // Solo razón social y CIF (usuario, 2026-11-14: fuera urgencias y O.T. — el teléfono
    // de urgencias ya va en el pie de todas las páginas).
    : copia === 'operativa'
    ? [[D.razon_social, 9.5, true],
       [`CIF: ${D.cif}`, 8.5, true]]
    : [[`${t.operadorTrafico}: ${d.gestor?.nombre ?? 'Dynamo'}`, 9.5, true],
       [[d.gestor?.telefono && telBonito(d.gestor.telefono), d.gestor?.email ?? D.email].filter(Boolean).join(' · '), 8, false],
       [`${t.urgencias}: ${telBonito(D.telefono)}`, 8, true],
       [`${t.operadorAut} ${D.tarjeta_ot}`, 8, false]];
  const alto = (filas: [string, number, boolean][], w: number) => filas.reduce((a, [tx, s, b]) => a + (tx ? l.partir(tx, s, w, b).length * s * 1.3 : 0), 0);
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
  // Tarjeta del QR (compartida por las dos cabeceras). Con transportista y matrícula
  // lleva el QR real (abre el PDF completo del CMR-DeCA con la hoja de firmas); si no,
  // el hueco punteado — el diseño no cambia al asignar.
  const tarjetaQr = async (ct: number, cw: number, chX: number) => {
    let qrImg: PDFImage | null = null;
    // En la copia cliente el porteador no viaja en los datos (solo matrículas y
    // conductor): con matrícula ya hay transporte asignado y el QR va igual.
    if (d.deca && (p || esCli) && e.matricula_camion) {
      try { qrImg = await l.doc.embedPng(await QRCode.toBuffer(`${d.deca.url}/pdf`, { margin: 0, scale: 4 })); } catch { qrImg = null; }
    }
    const cx = der - cw, r = 8;
    l.pag.drawSvgPath(
      `M ${r} 0 H ${cw - r} Q ${cw} 0 ${cw} ${r} V ${chX - r} Q ${cw} ${chX} ${cw - r} ${chX} H ${r} Q 0 ${chX} 0 ${chX - r} V ${r} Q 0 0 ${r} 0 Z`,
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
    l.texto(cx + (cw - l.medida(tPie, 5.4)) / 2, ct + chX - 5, tPie, 5.4, { color: COLOR.gris });
  };

  if (!manual) {
    // ---- FRANJA DE TRES BLOQUES (usuario, 2026-11-14), en todas las copias: las dos
    // partes y la tarjeta del QR. Las matrículas, la referencia y el conductor ya van en
    // la tabla resumen de abajo (fuera el bloque de datos, que los repetía). El texto
    // del documento de control va debajo, a todo lo ancho.
    const gap = 8, cw = 96, wCaja = (l.ancho - cw - 2 * gap) / 2;
    const x2 = l.x0 + wCaja + gap;
    const titIzq = esCli ? 'Cliente · Ordenante del transporte'
      : copia === 'operativa' ? (esES ? 'TRANSPORTISTA EFECTIVO (realiza el servicio)' : `TRANSPORTISTA EFECTIVO · ${t.transpRealiza}`)
      : t.transpRealiza;
    // El título de cada caja se parte en BASE espaciada + coletilla en gris pequeño
    // («TRANSPORTISTA EFECTIVO» / «(realiza el servicio)»).
    const parteTit = (s3: string): [string, string[]] => {
      const m = s3.match(/^([^(·]+?)\s*((?:\(|·).+)?$/);
      const base = m?.[1]?.trim() ?? s3;
      return [base, m?.[2] ? l.partir(m[2].trim(), 5.8, wCaja - 16).slice(0, 2) : []];
    };
    const [base1, sub1] = parteTit(titIzq), [base2, sub2] = parteTit(dchaTit);
    const hTit = (sub: string[]) => 14 + 8 + sub.length * 7.2 + 2;
    const hFila = Math.max(96,
      hTit(sub1) + alto(izq, wCaja - 16) + 10,
      hTit(sub2) + alto(dcha, wCaja - 16) + 10);
    const ct = l.y;
    cajaR(l.x0, ct, wCaja, hFila, COLOR.blanco, COLOR.grisClaro, 7);
    cajaR(x2, ct, wCaja, hFila, COLOR.blanco, COLOR.grisClaro, 7);
    for (const [x, base, sub, filas] of [[l.x0, base1, sub1, izq], [x2, base2, sub2, dcha]] as const) {
      const sTit = l.medida(esp(base), 5.2, true) > wCaja - 16 ? 4.6 : 5.2;
      l.texto(x + 8, ct + 14, esp(base), sTit, { bold: true, color: COLOR.gris });
      sub.forEach((ln, i) => l.texto(x + 8, ct + 22 + i * 7.2, ln, 5.8, { color: COLOR.gris }));
      l.y = ct + hTit(sub);
      for (const [tx, s, b] of filas) if (tx) l.parrafo(tx, s, { bold: b, x: x + 8, ancho: wCaja - 16 });
    }
    await tarjetaQr(ct, cw, hFila);
    l.y = ct + hFila + 8;
    l.parrafo(t.qrDeca, 8, { bold: true, color: COLOR.navy });
    l.y += 4;
  } else {
  const hCaja = Math.max(alto(izq, mitad - 20), alto(dcha, mitad - 20)) + 26;
  l.rect(l.x0, l.y, mitad, hCaja, COLOR.fondo);
  l.rect(xb, l.y, mitad, hCaja, COLOR.fondo);
  l.texto(l.x0 + 10, l.y + 14, esCli ? 'Cliente · Ordenante del transporte' : manual ? t.transp
    : copia === 'operativa' ? (esES ? 'TRANSPORTISTA EFECTIVO (realiza el servicio)' : `TRANSPORTISTA EFECTIVO · ${t.transpRealiza}`)
    : t.transpRealiza, 7.5, { bold: true, color: COLOR.gris });
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
    l.y = top0 + 20;
    for (const [tx, s, b] of filas) if (tx) l.parrafo(tx, s, { bold: b, x, ancho: mitad - 20 });
  }
  l.y = top0 + hCaja + 10;

  // ---- Resumen + QR en UNA banda compacta (usuario, 2026-11-13) ----
  // La franja morada (nº, fecha, matrículas) va a la IZQUIERDA con el texto del
  // documento de control debajo, y la tarjeta del QR a la DERECHA a la misma altura.
  // EN LAS DOS COPIAS (usuario, 2026-11-13: «con precio o sin precios, ambas deben
  // llevar el DeCA QR»): el QR abre el eCMR/DeCA público, que no enseña precios.
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
    // Tarjeta del QR a la derecha, alineada arriba con la franja.
    if (!manual) await tarjetaQr(ct, cw, ch);
    l.y = manual ? finIzq + 8 : Math.max(finIzq, ct + ch) + 8;
  }
  }

  // ---- Recogidas y entregas ----
  const seccion = (titulo: string) => {
    l.sitio(90);   // que el título no se quede solo al pie de la página
    l.texto(l.x0, l.y + 9, esp(titulo), 7, { bold: true, color: COLOR.navy });
    l.linea(l.x0, l.y + 13, der, l.y + 13);
    l.y += 19;
  };
  // ---- TARJETAS DE PARADA EN COLUMNAS (usuario, 2026-11-14: el encaje de la orden
  // antigua): hasta 3 por fila, cada una con su chip de color, la EMPRESA de titular,
  // la dirección en gris y debajo las filas clave-valor. Tinte suave naranja/verde.
  type FilaT = { k: string; v: string; b?: boolean; rojo?: boolean };
  const filasDe = (pa: ParadaDoc, recogida: boolean): FilaT[] => {
    const fs: FilaT[] = [];
    fs.push({ k: t.fecha, v: recogida ? ventanaCarga : (fEntrega ? `${fEntrega} ${t.estimada}` : t.porConfirmar), b: true });
    fs.push({ k: t.horario, v: pa.horarios || t.consultaDynamo, b: true });
    if (pa.contacto?.telefono || pa.contacto?.nombre) fs.push({ k: t.contacto, v: [pa.contacto?.nombre, pa.contacto?.telefono && telBonito(pa.contacto.telefono)].filter(Boolean).join(': '), b: true });
    if (pa.referencia) fs.push({ k: t.referencia, v: pa.referencia, b: true });
    if (pa.tipo_sitio) fs.push({ k: t.tipoSitio, v: nombreTipo(pa.tipo_sitio) });
    const avisosP = [pa.requiere_cita && t.citaPrevia, !pa.tiene_medios_carga && t.sinMedios].filter(Boolean) as string[];
    if (avisosP.length) fs.push({ k: t.atencion, v: avisosP.join(' · '), b: true, rojo: true });
    // El DETALLE DE MERCANCÍA de la parada (el campo «A recoger / A entregar» de Nuevo
    // envío) sale con su etiqueta «Mercancía», no como una indicación más (2026-11-13).
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
    if (merc) fs.push({ k: t.mercancia, v: merc, b: true });
    for (const n2 of notas) fs.push({ k: t.indicaciones, v: n2 });
    if (pa.url_google_maps) fs.push({ k: 'Google Maps', v: pa.url_google_maps });
    return fs;
  };
  {
    const todas = [
      ...rec.map((pa, i) => ({ pa, recogida: true, titulo: rec.length > 1 ? `${t.recogida} ${i + 1}/${rec.length}` : t.recogida })),
      ...ent.map((pa, i) => ({ pa, recogida: false, titulo: ent.length > 1 ? `${t.entrega} ${i + 1}/${ent.length}` : t.entrega })),
    ];
    const porFila = todas.length <= 2 ? Math.max(todas.length, 1) : todas.length === 4 ? 2 : 3;
    const gapT = 8, wTar = (l.ancho - (porFila - 1) * gapT) / porFila;
    const xIn = 9, wIn = wTar - xIn * 2, kCol = 44, wVal = wIn - kCol - 4;
    const medir = (c: typeof todas[number]) => {
      const emp = l.partir(c.pa.nombre_empresa || t.faltanEmpresa, 8.6, wIn, true).slice(0, 2);
      const dir = l.partir([c.pa.direccion, [c.pa.codigo_postal, c.pa.poblacion].filter(Boolean).join(' '), c.pa.provincia !== c.pa.poblacion ? c.pa.provincia : null, c.pa.pais].filter(Boolean).join(', '), 7, wIn).slice(0, 4);
      const filasT = filasDe(c.pa, c.recogida).map((f) => ({ ...f, kl: l.partir(f.k, 6.1, kCol - 2, true), vl: l.partir(f.v, 7.1, wVal, f.b) }));
      const hFilas = filasT.reduce((a, f) => a + Math.max(f.kl.length * 7.6, f.vl.length * 8.8) + 3, 0);
      return { emp, dir, filasT, h: 24 + emp.length * 10.4 + dir.length * 8.6 + 8 + hFilas + 8 };
    };
    const dibuja = (c: typeof todas[number], m: ReturnType<typeof medir>, x: number, top: number, h: number) => {
      cajaR(x, top, wTar, h, c.recogida ? TINTE_REC : TINTE_ENT, COLOR.grisClaro, 7);
      // cabecera: punto de color + etiqueta espaciada + regla
      l.pag.drawCircle({ x: x + xIn + 3, y: A4.h - top - 12.5, size: 2.6, color: c.recogida ? NARANJA : COLOR.verde });
      l.texto(x + xIn + 9, top + 15, esp(c.titulo), 6, { bold: true, color: c.recogida ? NARANJA : COLOR.verde });
      l.linea(x + xIn, top + 20, x + wTar - xIn, top + 20, COLOR.grisClaro, 0.7);
      let y2 = top + 24;
      m.emp.forEach((ln) => { l.texto(x + xIn, y2 + 8, ln, 8.6, { bold: true, color: c.pa.nombre_empresa ? COLOR.navy : COLOR.rojo }); y2 += 10.4; });
      m.dir.forEach((ln) => { l.texto(x + xIn, y2 + 7, ln, 7, { color: COLOR.gris }); y2 += 8.6; });
      y2 += 3;
      l.linea(x + xIn, y2, x + wTar - xIn, y2, COLOR.grisClaro, 0.7);
      y2 += 5;
      for (const f of m.filasT) {
        f.kl.forEach((ln, i) => l.texto(x + xIn, y2 + 6.6 + i * 7.6, ln, 6.1, { bold: true, color: COLOR.gris }));
        f.vl.forEach((ln, i) => l.texto(x + xIn + kCol + 4, y2 + 7 + i * 8.8, ln, 7.1, { bold: f.b, color: f.rojo ? COLOR.rojo : COLOR.navy }));
        y2 += Math.max(f.kl.length * 7.6, f.vl.length * 8.8) + 3;
      }
    };
    for (let i = 0; i < todas.length; i += porFila) {
      const fila = todas.slice(i, i + porFila);
      const medidas = fila.map(medir);
      const hT = Math.max(...medidas.map((m) => m.h));
      l.sitio(Math.min(hT + 6, 420));
      const top = l.y;
      fila.forEach((c, j) => dibuja(c, medidas[j], l.x0 + j * (wTar + gapT), top, hT));
      l.y = top + hT + gapT;
    }
    l.y += 4;
  }

  // ---- Caja de IMPORTE estilo «tarifa» del diseño antiguo (2026-11-14): a la derecha
  // el precio en grande con acento navy arriba; a la izquierda, las condiciones.
  const cajaImporte = (precioTxt: string, sub: string, lineasIzq: [string, string][]) => {
    const wBox = 185;
    const izqLs = lineasIzq.filter(([, v]) => v).map(([k, v]) => ({ k, ls: l.partir(v, 7.2, l.ancho - wBox - 34) }));
    const hIzq = 10 + izqLs.reduce((a, x) => a + 9 + x.ls.length * 9 + 5, 0);
    const hBox = Math.max(62, hIzq);
    l.sitio(hBox + 14);
    const it = l.y;
    if (izqLs.length) {
      cajaR(l.x0, it, l.ancho - wBox - 10, hBox, COLOR.blanco, COLOR.grisClaro, 6);
      let yI = it + 8;
      for (const x of izqLs) {
        l.texto(l.x0 + 12, yI + 7, x.k.toUpperCase(), 5.8, { bold: true, color: COLOR.gris });
        x.ls.forEach((ln, i) => l.texto(l.x0 + 12, yI + 16 + i * 9, ln, 7.2, { color: COLOR.tinta }));
        yI += 9 + x.ls.length * 9 + 5;
      }
    }
    const xB = izqLs.length ? der - wBox : l.x0;
    cajaR(xB, it, izqLs.length ? wBox : l.ancho, hBox, COLOR.blanco, COLOR.grisClaro, 6);
    l.pag.drawRectangle({ x: xB + 6, y: A4.h - it - 3.6, width: (izqLs.length ? wBox : l.ancho) - 12, height: 2.4, color: COLOR.navy });
    l.textoDer(der - 12, it + 18, esp(t.secImporte), 5.6, { bold: true, color: COLOR.gris });
    l.textoDer(der - 12, it + 42, precioTxt, 19, { bold: true, color: COLOR.navy });
    if (sub) l.textoDer(der - 12, it + 55, sub, 6.6, { color: COLOR.gris });
    l.y = it + hBox + 12;
  };
  // ---- TABLA RESUMEN (usuario, 2026-11-14: como la orden antigua): mercancía · tipo de
  // transporte · tipo de carga · requisitos · matrículas (plaquitas) · conductor, en una
  // caja con separadores finos. Los textos largos van en cajas de aviso con acento.
  const forma = [e.carga_lateral && t.cargaLateral, e.carga_trasera && t.cargaTrasera, e.carga_techo && t.cargaTecho].filter(Boolean).join(' · ');
  const tipoCarga = esES ? tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora)
    : e.tipo_carga === 'completa' ? (e.requiere_plataforma_elevadora ? t.rigidoCompleto : t.cargaCompleta) : e.tipo_carga === 'grupaje' ? t.grupaje : '';
  {
    const conductorTxt = [e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ');
    const requisitos = [e.requiere_nima && `${t.requiereNima}${e.transportista_nima && !esCli ? ` (${e.transportista_nima})` : ''}`, e.adr && t.adr].filter(Boolean).join(' · ');
    const resumen: { k: string; v: string; b?: boolean; rojo?: boolean; placas?: boolean }[] = [
      { k: t.mercancia, v: [e.descripcion_mercancia || (e.paletizado === false ? t.noPaletizada : t.paletizada),
        e.toneladas != null ? `${pesoTn(e.toneladas)}` : null, e.metros_lineales != null ? `${num(e.metros_lineales)} ${t.metrosLineales}` : null,
        e.num_bultos != null ? `${e.num_bultos} ${e.num_bultos === 1 ? t.bulto : t.bultos}${e.embalaje ? ` (${e.embalaje})` : ''}` : null,
        e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : null].filter(Boolean).join(' · '), b: true },
      // Altura máxima del hueco (2026-11-12): que cliente y transportista la vean.
      { k: t.tipoTransporte, v: `${e.requiere_plataforma_elevadora ? t.rigido : t.tauliner} · ${rellena(t.alturaMax, { m: idioma === 'en' ? (e.requiere_plataforma_elevadora ? '2.60' : '2.70') : (e.requiere_plataforma_elevadora ? '2,60' : '2,70') })}` },
      { k: t.tipoCarga, v: [tipoCarga || t.grupaje, forma].filter(Boolean).join(' · ') },
      ...(requisitos ? [{ k: t.requisitos, v: requisitos, b: true, rojo: !!e.adr }] : []),
      { k: t.matriculasAutL, v: matr || t.pendMatrEnvia, placas: !!matr, b: true, rojo: !matr },
      { k: t.conductor, v: conductorTxt || t.pendComunicar, b: !!conductorTxt },
    ];
    const xL2 = l.x0 + 12, xVr = l.x0 + 150, wVr = der - xVr - 12;
    const medR = resumen.map((r) => {
      const kl = l.partir(r.k.toUpperCase(), 6.2, 130, true);
      if (r.placas) return { kl, vl: [] as string[], h: Math.max(27, kl.length * 8 + 10) };
      const vl = l.partir(r.v, 8.2, wVr, r.b);
      return { kl, vl, h: Math.max(vl.length * 10.2, kl.length * 8) + 9 };
    });
    const hRes = medR.reduce((a, m) => a + m.h, 0) + 8;
    l.sitio(Math.min(hRes + 6, 340));
    const rt2 = l.y;
    cajaR(l.x0, rt2, l.ancho, hRes, COLOR.blanco, COLOR.grisClaro, 6);
    let yR = rt2 + 4;
    resumen.forEach((r, i) => {
      const m = medR[i];
      m.kl.forEach((ln, j) => l.texto(xL2, yR + 12 + j * 8, ln, 6.2, { bold: true, color: COLOR.gris }));
      if (r.placas) {
        let xP = xVr;
        for (const m2 of [e.matricula_camion, e.matricula_remolque].filter(Boolean) as string[]) xP += plaquita(xP, yR + 4, m2) + 8;
      } else {
        m.vl.forEach((ln, j) => l.texto(xVr, yR + 12.6 + j * 10.2, ln, 8.2, { bold: r.b, color: r.rojo ? COLOR.rojo : COLOR.navy }));
      }
      yR += m.h;
      if (i < resumen.length - 1) l.linea(xL2, yR, der - 12, yR, COLOR.grisClaro, 0.6);
    });
    l.y = rt2 + hRes + 10;
  }
  // Los dos avisos NO van en el DeCA (usuario, 2026-11-14): son instrucciones de la
  // orden de carga, no del documento de control. Las demás copias los conservan.
  if (copia !== 'operativa') {
    aviso(t.importante, t.txtImportante, NARANJA);
    aviso(t.matriculasAutL, t.txtSoloMatr, COLOR.navy);
  }

  // ---- Firmas (solo en el DeCA): rejilla al pie, casillas 22/23/24 del e-CMR ----
  // Primero los huecos normales en orden de recorrido (recogidas → transportista →
  // entregas) y AL FINAL las firmas extra, en el orden en que se hicieron, cada una
  // diciendo a qué casilla se añadió (usuario, 2026-11-14).
  if (conFirmas) {
    seccion(t.secFirmas);
    const base: { f: FirmaDoc | undefined; rol: string; parada: string | null; titulo: string; empresa: string; color: RGB }[] = [
      ...rec.map((pa, i) => ({ f: firmaDe('remitente', pa.id), rol: 'remitente', parada: pa.id, titulo: `${t.recogida} ${i + 1} · ${t.cargadorRol}`, empresa: pa.nombre_empresa || '', color: NARANJA })),
      { f: firmaDe('transportista', null), rol: 'transportista', parada: null, titulo: t.transp, empresa: d.porteador?.razon_social ?? e.conductor_nombre ?? '', color: COLOR.navy },
      ...ent.map((pa, i) => ({ f: firmaDe('destinatario', pa.id), rol: 'destinatario', parada: pa.id, titulo: `${t.entrega} ${i + 1} · ${t.destinatarioRol}`, empresa: pa.nombre_empresa || '', color: COLOR.verde })),
    ];
    const extras = (d.firmas ?? []).filter((f) => f.extra)
      .sort((a, b) => (a.firmado_en < b.firmado_en ? -1 : 1));
    const huecos = [...base, ...extras.map((f, i) => {
      const b = base.find((h) => h.rol === f.rol && (f.rol === 'transportista' || h.parada === f.parada_id));
      return { f, rol: f.rol, parada: f.parada_id, titulo: `${t.firmaExtra}${extras.length > 1 ? ` ${i + 1}` : ''}`,
        empresa: [b?.titulo, b?.empresa].filter(Boolean).join(' · '), color: b?.color ?? COLOR.navy };
    })];
    const gap = 6, wC = (l.ancho - 3 * gap) / 4, hC = 66;
    for (let i = 0; i < huecos.length; i += 4) {
      l.sitio(hC + 4);
      huecos.slice(i, i + 4).forEach((hu, j) => cuadroFirma(l.x0 + j * (wC + gap), wC, hC, hu.f, hu.rol, hu.titulo, hu.empresa, hu.color));
      l.y += hC + gap;
    }
    l.y += 4;
  }

  // ---- Importe (SOLO en la copia completa; la del conductor va sin economía) ----
  // La copia CLIENTE lleva SU precio (importe_cliente + IVA), nunca el del transportista.
  if (esCli && !manual) {
    const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
    cajaImporte(pc != null ? eur(pc) : t.pendiente, pc != null ? `+ IVA (${num(e.iva_pct != null ? Number(e.iva_pct) : 21)} %)` : '',
      [['Condiciones', 'Aplican los Términos y condiciones aceptados al confirmar el envío en dynamotrans.com.']]);
  }
  const precio = manual ? e.precio_acordado_operador : e.importe_transportista;
  if (copia === 'economica' && (precio != null || !manual)) {
    const lineasIzq: [string, string][] = [];
    if (!manual) {
      if (d.pronto_pago && precio != null) {
        const dto = Math.max(Math.round(Number(precio) * pago.pct) / 100, pago.minimo);
        lineasIzq.push([t.formaPago, rellena(t.txtProntoPago, { dias: String(pago.dias), pct: num(pago.pct), min: eur(pago.minimo), neto: eur(Number(precio) - dto) })]);
      } else {
        lineasIzq.push([t.formaPago, rellena(t.txtTransferencia, { dias: String(e.plazo_pago_transportista ?? pago.plazo) })]);
      }
      lineasIzq.push([t.facturaL, rellena(t.txtFactura, { ref, email: D.email })]);
    }
    cajaImporte(precio != null ? eur(precio) : t.pendiente, precio != null ? t.impuestosNo : '', lineasIzq);
  }

  if (e.discrecion_comercial && !manual) {
    l.sitio(46);
    const tx = t.txtDiscrecion;
    const ls = l.partir(tx, 8.8, l.ancho - 20, true);
    l.rect(l.x0, l.y, l.ancho, ls.length * 11.6 + 14, COLOR.ambarSuave, rgb(1, 0.84, 0.57));
    ls.forEach((ln, i) => l.texto(l.x0 + 10, l.y + 15 + i * 11.6, ln, 8.8, { bold: true, color: COLOR.ambar }));
    l.y += ls.length * 11.6 + 26;
  }

  // ---- Condiciones: SOLO en la copia ADMINISTRACIÓN (usuario, 2026-11-14) y en sus
  // páginas en español (las traducidas remiten a ellas). Son condiciones contractuales
  // de la orden de carga: en la copia del conductor (el DeCA, documento de control) no
  // proceden, y en la del cliente ya regían sus condiciones generales.
  if (!manual && copia === 'economica' && !esES) {
    l.sitio(30);
    l.parrafo(`${t.verCondEs} ${t.prevalece}`, 8, { bold: true, color: COLOR.navy, despues: 6 });
  }
  if (!manual && copia === 'economica' && esES) {
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
    // Pie a DOS líneas como la orden antigua (2026-11-14): datos completos de Dynamo
    // (con dirección, email y Wtransnet, que ya no van en la cabecera) + ref y página.
    pg.drawLine({ start: { x: l.x0, y: 44 }, end: { x: der, y: 44 }, thickness: 0.6, color: COLOR.grisClaro });
    if (manual) {
      l.texto(l.x0, A4.h - 34, `Orden de carga ${ref} · emitida por ${d.cliente?.razon_social ?? ''} · ${emitida}`, 6.6, { color: COLOR.gris, pag: pg });
    } else {
      l.texto(l.x0, A4.h - 34, `${D.razon_social} · ${D.direccion}, ${D.codigo_postal} ${D.poblacion} · ${D.email} · ${telBonito(D.telefono)}`, 6.6, { color: COLOR.gris, pag: pg });
      l.texto(l.x0, A4.h - 25, `CIF ${D.cif} · O.T. ${D.tarjeta_ot} · Wtransnet ${D.wtransnet} · ${t.urgencias}: ${telBonito(D.telefono)}`, 6.6, { color: COLOR.gris, pag: pg });
    }
    const n = `${ref} · ${t.pagina} ${i + 1} ${t.de} ${pags.length}`;
    l.texto(der - l.medida(n, 6.6), A4.h - 34, n, 6.6, { color: COLOR.gris, pag: pg });
  });
  l.doc.setTitle(`${copia === 'operativa' ? 'DeCA' : t.titulo} ${ref}`);
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
