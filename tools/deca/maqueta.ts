// MAQUETA del DeCA (copia del conductor) con datos de MENTIRA, para diseñar el PDF
// viéndolo en local sin base de datos. Uso:
//   npx tsx tools/deca/maqueta.ts /ruta/salida.pdf [firmas|sinfirmas] [orden|cmr]
// (con `cmr` saca el impreso del CMR —una carta por recogida × entrega— en vez del DeCA)
// Luego: pdftoppm -png -r 110 salida.pdf pagina
// El trazo de las firmas se dibuja con Chromium (canvas) para que parezca uno real.
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ordenDeCarga } from '@/lib/pdf/orden';
import { cmr } from '@/lib/pdf/cmr';
import type { DatosDoc, EnvioDoc, ParadaDoc, FirmaDoc } from '@/lib/pdf/datos';
import { DYNAMO } from '@/lib/pdf/datos';

async function trazo(semilla: number): Promise<Uint8Array> {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 220, height: 70 } })).newPage();
  await p.setContent(`<canvas id=c width=220 height=70 style="display:block"></canvas><script>
    const x = document.getElementById('c').getContext('2d');
    x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#0a0230'; x.beginPath();
    let px = 14, py = 42; x.moveTo(px, py);
    for (let i = 0; i < 46; i++) {
      px += 4 + Math.sin(i * 0.9 + ${semilla}) * 2.2;
      py = 36 + Math.sin(i * 0.55 + ${semilla} * 2) * 15 + Math.sin(i * 2.1) * 5;
      x.lineTo(px, py);
    }
    x.stroke();
  </script>`);
  const png = await p.locator('#c').screenshot({ omitBackground: true });
  await b.close();
  return new Uint8Array(png);
}

const parada = (n: number, tipo: 'carga' | 'descarga', emp: string, dir: string, cp: string, pob: string, prov: string, pais: string, extra: Partial<ParadaDoc> = {}): ParadaDoc => ({
  id: `p${n}`, orden: n, tipo, nombre_empresa: emp, direccion: dir, codigo_postal: cp, poblacion: pob,
  provincia: prov, pais, referencia: null, anotaciones: null,
  horarios: 'Lunes a jueves 8:00–14:00 y 15:00–18:00 · viernes 8:00–14:00', url_google_maps: null,
  notas_sitio: null, tipo_sitio: 'almacen_nave', requiere_cita: false, tiene_medios_carga: true, contacto: { nombre: 'Marta', telefono: '+34600000001' }, ...extra,
});

async function main() {
  const salida = process.argv[2] ?? '/tmp/deca.pdf';
  const conFirmas = (process.argv[3] ?? 'firmas') === 'firmas';
  const ahora = new Date().toISOString();
  const firmas: FirmaDoc[] = !conFirmas ? [] : [
    { rol: 'remitente', parada_id: 'p1', nombre: 'Jean Petit', documento: '···123T', firmado_en: ahora, extra: false, lat: null, lon: null, gps_precision_m: null, gps_direccion: null, sha256: null, png: await trazo(1) },
    { rol: 'remitente', parada_id: 'p2', nombre: 'Lucía Romero', documento: '···456W', firmado_en: ahora, extra: false, lat: null, lon: null, gps_precision_m: null, gps_direccion: null, sha256: null, png: await trazo(2) },
    { rol: 'transportista', parada_id: null, nombre: 'Adrián Aguirre Etxeberria', documento: '···309K', firmado_en: ahora, extra: false, lat: null, lon: null, gps_precision_m: null, gps_direccion: null, sha256: null, png: await trazo(3) },
    // Firma EXTRA de la recogida 1 (una segunda persona firmando la misma casilla).
    { rol: 'remitente', parada_id: 'p1', nombre: 'Marie Dubois', documento: '···771B', firmado_en: ahora, extra: true, lat: null, lon: null, gps_precision_m: null, gps_direccion: null, sha256: null, png: await trazo(4) },
  ];
  const envio = {
    referencia_gx: 'GX102345256', referencia_cliente: 'PED-7741', fecha_carga_prevista: '2026-11-12',
    fecha_carga_desde: '2026-11-12', fecha_carga_hasta: '2026-11-13', fecha_entrega_estimada: '2026-11-17',
    matricula_camion: '1681LXC', matricula_remolque: 'R0494BCB', conductor_nombre: 'Adrián Aguirre Etxeberria', conductor_telefono: '+34606402438',
    metros_lineales: 13.3, toneladas: 24, paletizado: true, descripcion_mercancia: 'Mercancía general',
    tipo_carga: 'grupaje', requiere_plataforma_elevadora: false, adr: false, carga_lateral: true, carga_techo: false, carga_trasera: true,
    importe_transportista: 850, importe_cliente: 980, iva_pct: 21, plazo_pago_transportista: 60,
  } as unknown as EnvioDoc;
  const d: DatosDoc = {
    envio, manual: false, pronto_pago: false,
    cliente: null,
    porteador: { razon_social: 'Adrián Aguirre Etxeberria', cif: '27233309K', codigo: 'T-332555',
      direccion: 'Calle del Comercio 79', codigo_postal: '24001', poblacion: 'León', provincia: 'León', pais_iso: 'ES',
      telefono: '+34606402438', email: null } as DatosDoc['porteador'],
    gestor: { nombre: 'Dynamo', telefono: DYNAMO.telefono, email: DYNAMO.email },
    paradas: [
      parada(1, 'carga', 'Société Rousseau SARL', 'Polígono Industrial Los Olivos, calle A 143', '94150', 'Rungis', 'Île-de-France', 'Francia'),
      parada(2, 'carga', 'Dynamo Almacén Sevilla (prueba)', 'Polígono Industrial La Isla, calle Río Viejo 12', '41703', 'Dos Hermanas', 'Sevilla', 'España'),
      parada(3, 'carga', 'Feut Madrid, S.A.', 'C/ de la Resina, 13', '28021', 'Madrid', 'Madrid', 'España',
        { tiene_medios_carga: false, horarios: 'Lunes a viernes 7:30–15:00 (horario de verano)' }),
      parada(4, 'descarga', 'Circular Polimeri SL', 'Carrer Nou 21', '46469', 'Beniparrell', 'València', 'España'),
    ],
    firmas,
    deca: { url: 'https://www.dynamotrans.com/cmr/a3853c97-be09-4213-9c99-c13000d5a0fe', creado_en: '2026-11-11T09:00:00Z' },
    dynamo: DYNAMO,
    // Panel de modificaciones del DeCA (Resolución 5-jun-2026, apdo. quinto): muestra.
    modificaciones: [
      { cuando: '12/11/2026 09:41', en: '2026-11-12T08:41:00Z', hito: 'fecha_carga_movida', detalle: '14/11/2026', antes: '13/11/2026', motivo: 'El cargador retrasa la mercancía un día' },
      { cuando: '13/11/2026 11:20', en: '2026-11-13T10:20:00Z', hito: 'transportista_asignado', primera: true, detalle: 'Adrián Aguirre Etxeberria' },
      { cuando: '13/11/2026 17:05', en: '2026-11-13T16:05:00Z', hito: 'ruta_cambiada', detalle: '94150 Rungis → 41703 Dos Hermanas → 28021 Madrid → 46469 Beniparrell', antes: '94150 Rungis → 41703 Dos Hermanas → 46469 Beniparrell' },
      { cuando: '14/11/2026 08:12', en: '2026-11-14T07:12:00Z', hito: 'matricula_asignada', detalle: '1681LXC + R0494BCB', antes: '4788MLN + R1102BBC' },
    ],

  };
  // 4.º argumento: orden (por defecto) o cmr. 5.º (solo orden): operativa | economica | cliente.
  const bytes = (process.argv[4] ?? 'orden') === 'cmr'
    ? await cmr(d, { sinDeca: true })
    : await ordenDeCarga(d, { pct: 3, minimo: 20, dias: 5, plazo: 60 },
        { copia: (process.argv[5] as 'operativa' | 'economica' | 'cliente') ?? 'operativa' });
  await writeFile(salida, bytes);
  console.log('PDF escrito en', salida);
}
main().catch((e) => { console.error(e); process.exit(1); });
