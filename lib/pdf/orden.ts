import { telBonito } from '@/lib/paises';
import { pesoTn, tipoCargaTxt } from '@/lib/formato';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rgb, type PDFImage } from 'pdf-lib';
import { Lienzo, COLOR, A4, eur, num, ventanaTxt, fechaCorta, ahoraMadrid } from './lienzo';
import { DYNAMO, type DatosDoc, type ParadaDoc } from './datos';
import { nombreTipo } from '@/components/panel/TipoSitio';

// ORDEN DE CARGA que Dynamo manda al transportista (el contenido y las condiciones son los
// de la orden que se manda hoy por email, p. ej. la GX61034 de febrero de 2026).
// En un envío MANUAL (el cliente con su propio operador) sale como ORDEN DE CARGA del
// cliente a su operador, SIN ninguna mención a Dynamo (como en el mockup).

export type ParamsPago = { pct: number; minimo: number; dias: number; plazo: number };

const NARANJA = rgb(0.98, 0.45, 0.09);

export async function ordenDeCarga(d: DatosDoc, pago: ParamsPago): Promise<Uint8Array> {
  const e = d.envio, manual = d.manual;
  const D = d.dynamo ?? DYNAMO;
  const l = await Lienzo.crear();
  let logo: PDFImage | null = null;
  if (!manual) logo = await l.doc.embedPng(await readFile(path.join(process.cwd(), 'images', '2.png')));
  const ref = e.referencia_gx ?? '';
  const emitida = ahoraMadrid();

  // ---- Cabecera (solo en la 1ª página) ----
  if (logo) {
    const h = 30, w = h * logo.width / logo.height;
    l.pag.drawImage(logo, { x: l.x0, y: A4.h - 40 - h, width: w, height: h });
  } else {
    l.texto(l.x0, 58, d.cliente?.razon_social ?? '', 15, { bold: true });
    l.texto(l.x0, 72, 'Ordenante del transporte', 8.5, { color: COLOR.gris });
  }
  const der = A4.w - l.margen.der;
  l.textoDer(der, 52, 'ORDEN DE CARGA', 16, { bold: true, color: COLOR.morado });
  l.textoDer(der, 66, `Referencia de envío: ${ref}`, 10, { bold: true });
  l.textoDer(der, 78, `Emitida el ${emitida}`, 8, { color: COLOR.gris });
  l.y = 92;
  if (!manual) {
    l.parrafo(`${D.razon_social} · CIF ${D.cif} · Wtransnet ${D.wtransnet} · ${D.direccion}, ${D.codigo_postal} ${D.poblacion} · ${D.email} · ${telBonito(D.telefono)}`, 7.5, { color: COLOR.gris });
  }
  l.linea(l.x0, l.y + 2, der, l.y + 2, COLOR.grisClaro, 1);
  l.y += 12;

  // ---- Transportista | Gestionada por ----
  const p = d.porteador, mitad = l.ancho / 2 - 8, xb = l.x0 + l.ancho / 2 + 8;
  const izq: [string, number, boolean][] = [];
  if (p) {
    izq.push([p.razon_social, 10, true]);
    izq.push([[p.cif ? `CIF ${p.cif}` : null, p.codigo ? `Código ${p.codigo}` : null].filter(Boolean).join(' · '), 8.5, false]);
    izq.push([[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia !== p.poblacion ? p.provincia : null].filter(Boolean).join(', '), 8, false]);
    izq.push([[p.contacto, p.telefono && telBonito(p.telefono), p.email].filter(Boolean).join(' · '), 8, false]);
  } else izq.push(['PENDIENTE DE ASIGNAR TRANSPORTISTA', 10, true]);
  const dchaTit = manual ? 'ORDENANTE' : 'GESTIONADA POR';
  const dcha: [string, number, boolean][] = manual
    ? [[d.cliente?.razon_social ?? '', 10, true], [d.cliente?.cif ? `CIF ${d.cliente.cif}` : '', 8.5, false],
       [[d.cliente?.contacto, d.cliente?.telefono && telBonito(d.cliente.telefono), d.cliente?.email].filter(Boolean).join(' · '), 8, false]]
    : [[`Operador de tráfico: ${d.gestor?.nombre ?? 'Dynamo'}`, 9.5, true],
       [[d.gestor?.telefono && telBonito(d.gestor.telefono), d.gestor?.email ?? D.email].filter(Boolean).join(' · '), 8, false],
       [`Urgencias e incidencias 24 h: ${telBonito(D.telefono)}`, 8, true],
       [`Operador autorizado de transporte · O.T. ${D.tarjeta_ot}`, 8, false]];
  const alto = (filas: [string, number, boolean][], w: number) => filas.reduce((a, [t, s, b]) => a + (t ? l.partir(t, s, w, b).length * s * 1.3 : 0), 0);
  const hCaja = Math.max(alto(izq, mitad - 20), alto(dcha, mitad - 20)) + 30;
  l.rect(l.x0, l.y, mitad, hCaja, COLOR.fondo);
  l.rect(xb, l.y, mitad, hCaja, COLOR.fondo);
  l.texto(l.x0 + 10, l.y + 14, manual ? 'TRANSPORTISTA' : 'TRANSPORTISTA (realiza el servicio)', 7.5, { bold: true, color: COLOR.gris });
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
    for (const [t, s, b] of filas) if (t) l.parrafo(t, s, { bold: b, x, ancho: mitad - 20 });
  }
  l.y = top0 + hCaja + 14;

  // ---- Resumen en una franja ----
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
  const franja: [string, string][] = [
    ['Nº DE ENVÍO', ref], ['FECHA DE CARGA', ventanaTxt(e.fecha_carga_desde, e.fecha_carga_hasta)],
    ['MATRÍCULAS AUTORIZADAS', matr || 'PENDIENTE DE ASIGNAR'],
  ];
  if (e.referencia_cliente) franja.push(['REFERENCIA', e.referencia_cliente]);
  const wCol = l.ancho / franja.length;
  const partesFranja = franja.map(([, v]) => l.partir(v, 9.5, wCol - 14, true).slice(0, 2));
  const hFranja = 22 + Math.max(...partesFranja.map((x) => x.length)) * 12;
  l.rect(l.x0, l.y, l.ancho, hFranja, COLOR.moradoSuave);
  franja.forEach(([k], i) => {
    const x = l.x0 + 10 + i * wCol;
    l.texto(x, l.y + 13, k, 7, { bold: true, color: COLOR.gris });
    partesFranja[i].forEach((ln, j) => l.texto(x, l.y + 26 + j * 12, ln, 9.5, { bold: true, color: !matr && i === 2 ? COLOR.rojo : COLOR.navy }));
  });
  l.y += hFranja + 14;

  // ---- Recogidas y entregas ----
  const seccion = (titulo: string) => {
    l.sitio(90);   // que el título no se quede solo al pie de la página
    l.texto(l.x0, l.y + 10, titulo, 9.5, { bold: true, color: COLOR.morado });
    l.linea(l.x0, l.y + 15, der, l.y + 15);
    l.y += 24;
  };
  const punto = (pa: ParadaDoc, n: number, recogida: boolean) => {
    const filas: [string, string, boolean?][] = [];
    filas.push(['Fecha', recogida ? `${ventanaTxt(e.fecha_carga_desde, e.fecha_carga_hasta)}` : (e.fecha_entrega_estimada ? `${fechaCorta(e.fecha_entrega_estimada)} (estimada)` : 'Por confirmar'), true]);
    filas.push(['Horario (hora local)', pa.horarios || 'Consultar con Dynamo', true]);
    filas.push(['Empresa', pa.nombre_empresa || 'FALTAN DATOS DE EMPRESA / ALMACÉN', true]);
    filas.push(['Dirección', [pa.direccion, [pa.codigo_postal, pa.poblacion].filter(Boolean).join(' '), pa.provincia !== pa.poblacion ? pa.provincia : null, pa.pais].filter(Boolean).join(', ')]);
    if (pa.contacto?.telefono || pa.contacto?.nombre) filas.push(['Contacto', [pa.contacto?.nombre, pa.contacto?.telefono && telBonito(pa.contacto.telefono)].filter(Boolean).join(': ')]);
    if (pa.referencia) filas.push(['Referencia', pa.referencia, true]);
    if (pa.tipo_sitio) filas.push(['Tipo de sitio', nombreTipo(pa.tipo_sitio)]);
    const avisos = [pa.requiere_cita && 'Con cita previa', !pa.tiene_medios_carga && 'Sin medios de carga: el camión debe llevar plataforma elevadora'].filter(Boolean) as string[];
    if (avisos.length) filas.push(['Atención', avisos.join(' · '), true]);
    if (pa.url_google_maps) filas.push(['Google Maps', pa.url_google_maps]);
    for (const n2 of [pa.notas_sitio, pa.anotaciones].filter(Boolean) as string[]) filas.push(['Indicaciones', n2]);

    const xK = l.x0 + 16, xV = l.x0 + 128, wV = der - xV - 6;
    const lineas = filas.map(([k, v, b]) => ({ k, v: l.partir(v, 8.8, wV, b), b }));
    const h = 22 + lineas.reduce((a, f) => a + f.v.length * 11.6 + 2, 0) + 6;
    l.sitio(Math.min(h, 300));
    const color = recogida ? NARANJA : COLOR.verde;
    l.rect(l.x0, l.y, 3, h - 4, color);
    l.texto(xK, l.y + 12, `${n} · ${recogida ? 'RECOGIDA' : 'ENTREGA'}`, 9, { bold: true, color });
    l.y += 22;
    for (const f of lineas) {
      l.sitio(f.v.length * 11.6);
      l.texto(xK, l.y + 8.8, f.k, 8, { bold: true, color: COLOR.gris });
      const rojo = f.k === 'Empresa' && !pa.nombre_empresa || f.k === 'Atención';
      f.v.forEach((ln, i) => l.texto(xV, l.y + 8.8 + i * 11.6, ln, 8.8, { bold: f.b, color: rojo ? COLOR.rojo : COLOR.navy }));
      l.y += f.v.length * 11.6 + 2;
    }
    l.y += 10;
  };
  const rec = d.paradas.filter((x) => x.tipo === 'carga'), ent = d.paradas.filter((x) => x.tipo === 'descarga');
  seccion(rec.length > 1 ? 'RECOGIDAS' : 'RECOGIDA');
  rec.forEach((pa, i) => punto(pa, i + 1, true));
  seccion(ent.length > 1 ? 'ENTREGAS' : 'ENTREGA');
  ent.forEach((pa, i) => punto(pa, i + 1, false));

  // ---- Mercancía, vehículo y conductor ----
  const kv = (filas: [string, string, { bold?: boolean; rojo?: boolean }?][]) => {
    const xV = l.x0 + 128, wV = der - xV;
    for (const [k, v, o] of filas) {
      if (!v) continue;
      const ls = l.partir(v, 8.8, wV, o?.bold);
      l.sitio(ls.length * 11.6 + 3);
      l.texto(l.x0, l.y + 8.8, k, 8, { bold: true, color: COLOR.gris });
      ls.forEach((ln, i) => l.texto(xV, l.y + 8.8 + i * 11.6, ln, 8.8, { bold: o?.bold, color: o?.rojo ? COLOR.rojo : COLOR.navy }));
      l.y += ls.length * 11.6 + 3;
    }
    l.y += 8;
  };
  seccion('MERCANCÍA Y VEHÍCULO');
  const forma = [e.carga_lateral && 'lateral', e.carga_trasera && 'trasera', e.carga_techo && 'por techo'].filter(Boolean).join(', ');
  kv([
    ['Mercancía', [e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada'),
      e.toneladas != null ? `${pesoTn(e.toneladas)}` : null, e.metros_lineales != null ? `${num(e.metros_lineales)} metros lineales` : null,
      e.num_bultos != null ? `${e.num_bultos} ${e.num_bultos === 1 ? 'bulto' : 'bultos'}${e.embalaje ? ` (${e.embalaje})` : ''}` : null,
      e.volumen_m3 != null ? `${num(e.volumen_m3)} m³` : null].filter(Boolean).join(' · '), { bold: true }],
    ['Tipo de transporte', e.requiere_plataforma_elevadora ? 'Camión rígido con plataforma elevadora' : 'Tráiler tauliner (lona corredera)'],
    ['Tipo de carga', `${tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora) || 'Grupaje'}${forma ? ` · carga ${forma}` : ''}`],
    ['Requisitos', [e.requiere_nima && `Requiere NIMA${e.transportista_nima ? ` (${e.transportista_nima})` : ''}`, e.adr && 'MERCANCÍA ADR (peligrosa)'].filter(Boolean).join(' · '), { bold: true, rojo: !!e.adr }],
    ['Importante', 'El transportista solo está autorizado a recoger la mercancía descrita en esta orden. Si el cargador quiere cargar otra mercancía, avísanos antes para autorizarla. No está permitido el transbordo: si lo necesitas, avísanos antes para consultarlo con el cliente.'],
  ]);
  seccion('MATRÍCULAS Y CONDUCTOR');
  kv([
    ['Matrículas autorizadas', matr || 'PENDIENTE DE ASIGNAR: envíanoslas antes de la carga', { bold: true, rojo: !matr }],
    ['Conductor', [e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ') || 'Pendiente de comunicar'],
    ['', 'Solo pueden cargar las matrículas autorizadas. Si cambian, avísanos antes de llegar a la carga.'],
  ]);

  // ---- Importe ----
  const precio = manual ? e.precio_acordado_operador : e.importe_transportista;
  if (precio != null || !manual) {
    seccion('IMPORTE');
    const filas: [string, string, { bold?: boolean }?][] = [['Importe', precio != null ? `${eur(precio)}  (impuestos aplicables no incluidos)` : 'Pendiente', { bold: true }]];
    if (!manual) {
      if (d.pronto_pago && precio != null) {
        const dto = Math.max(Math.round(Number(precio) * pago.pct) / 100, pago.minimo);
        filas.push(['Forma de pago', `PRONTO PAGO: transferencia a ${pago.dias} días de la fecha de factura con un descuento del ${num(pago.pct)} % (mínimo ${eur(pago.minimo)}). Cobrarás ${eur(Number(precio) - dto)}.`, { bold: true }]);
      } else {
        filas.push(['Forma de pago', `Transferencia a ${e.plazo_pago_transportista ?? pago.plazo} días de la fecha de factura.`]);
      }
      filas.push(['Factura', `Indica en tu factura nuestra REFERENCIA DE VIAJE: ${ref}. Envía la factura, los albaranes y los certificados por email a ${D.email}: te contestaremos con un «RECIBIDO».`, { bold: true }]);
    }
    kv(filas);
  }

  if (e.discrecion_comercial && !manual) {
    l.sitio(46);
    const t = 'DISCRECIÓN COMERCIAL: en la carga no informes del destino, ni en la entrega del origen. No enseñes a nadie precios ni esta orden.';
    const ls = l.partir(t, 8.8, l.ancho - 20, true);
    l.rect(l.x0, l.y, l.ancho, ls.length * 11.6 + 14, COLOR.ambarSuave, rgb(1, 0.84, 0.57));
    ls.forEach((ln, i) => l.texto(l.x0 + 10, l.y + 15 + i * 11.6, ln, 8.8, { bold: true, color: COLOR.ambar }));
    l.y += ls.length * 11.6 + 26;
  }

  // ---- Condiciones (solo en la orden de Dynamo) ----
  if (!manual) {
    seccion('CONDICIONES DE LA ORDEN DE CARGA');
    // Cada condición: su título en negrita y el texto debajo.
    const c = (t: string) => {
      const i = t.indexOf('. ');
      const [tit, cuerpo] = i > 0 && i < 40 ? [t.slice(0, i), t.slice(i + 2)] : ['', t];
      if (tit) { l.sitio(30); l.parrafo(tit, 7.8, { bold: true, despues: 0.5 }); }
      l.parrafo(cuerpo, 7.6, { color: COLOR.navy, despues: 5 });
    };
    c(`Aceptación. La ausencia de un rechazo escrito a esta orden de carga en un plazo de 30 minutos desde su envío equivale a su aceptación con todas sus condiciones. La aceptación de la orden y/o la realización del servicio de transporte supone aceptar estas condiciones y los Términos y condiciones generales de contratación para transportistas: https://www.dynamotrans.com/condiciones-transportistas Salvo acuerdo por escrito en contrario, para cualquier controversia derivada de esta orden de carga las partes se someten a los juzgados y tribunales de Sevilla.`);
    c('Recuento en la carga. El conductor debe estar presente en la carga de su camión, cerciorarse de los bultos que entran, contar personalmente el número de palés junto al personal que carga y cotejarlo con la documentación que se le entrega. Si encuentra alguna discrepancia, la comunicará al operario para solventarla en ese momento. Si el conductor se niega a estar presente en el recuento final, se asumirá que la mercancía se cargó completa y correctamente identificada en el albarán, y cualquier reserva de falta en la entrega se repercutirá al transportista efectivo.');
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
      : `${D.razon_social} · CIF ${D.cif} · O.T. ${D.tarjeta_ot} · Urgencias 24 h ${telBonito(D.telefono)} · ${ref}`;
    pg.drawLine({ start: { x: l.x0, y: 40 }, end: { x: der, y: 40 }, thickness: 0.6, color: COLOR.grisClaro });
    l.texto(l.x0, A4.h - 28, pie, 7, { color: COLOR.gris, pag: pg });
    const n = `Página ${i + 1} de ${pags.length}`;
    l.texto(der - l.medida(n, 7), A4.h - 28, n, 7, { color: COLOR.gris, pag: pg });
  });
  l.doc.setTitle(`${'Orden de carga'} ${ref}`);
  l.doc.setAuthor(manual ? d.cliente?.razon_social ?? '' : D.razon_social);
  return l.guardar();
}
