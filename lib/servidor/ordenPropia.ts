import 'server-only';
import type { SB } from '@/lib/supabase/cliente';
import { cargarDatosDocManual, cargarLogoOperador, cargarLogoCliente, type DatosDoc, type ParadaDoc } from '@/lib/pdf/datos';
import { ordenDeCarga } from '@/lib/pdf/orden';
import { euros, ventana, fecha, metros, pesoTn, tipoCargaTxt } from '@/lib/formato';

// ---- La orden de carga de un envío con transportista PROPIO, lista para mandar ---------
// (usuario, 2026-11-17: «enviar Orden de carga (PDF), y adjuntar pdf al mail y texto de
// envío detalle como la orden con precios, nombre transportista, detalles sitios fechas…
// todo, pero en texto plano también»). Es un envío del cliente con SU transportista:
// Dynamo no interviene y el documento no lo nombra.

// El PDF de la orden, con los dos logos (el del transportista y el de la empresa del cliente).
export async function pdfOrdenPropia(sb: SB, envioId: string): Promise<{ datos: DatosDoc; bytes: Uint8Array; nombre: string; operadorId: string | null } | { error: string }> {
  const r = await cargarDatosDocManual(sb, envioId);
  if (!r.datos) return { error: r.error ?? 'No se ha podido leer el envío.' };
  const { data: mio } = await sb.rpc('mis_envios').eq('id', envioId).maybeSingle<{ operador_id: string | null }>();
  const [logoPorteador, logoOrdenante] = await Promise.all([cargarLogoOperador(sb, mio?.operador_id), cargarLogoCliente(sb, envioId)]);
  const bytes = await ordenDeCarga({ ...r.datos, logoPorteador, logoOrdenante }, { pct: 0, minimo: 0, dias: 0, plazo: 0 });
  const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  return { datos: r.datos, bytes, nombre: `Orden-de-transporte-${ref}.pdf`, operadorId: mio?.operador_id ?? null };
}

const junta = (xs: (string | null | undefined | false)[], sep = ' · ') => xs.filter(Boolean).join(sep);

function bloqueParada(p: ParadaDoc, titulo: string): string[] {
  const dir = junta([p.direccion, junta([p.codigo_postal, p.poblacion], ' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', p.pais], ', ');
  return [
    titulo.toUpperCase(),
    p.nombre_empresa ?? '',
    dir,
    p.horarios ? `Horario: ${p.horarios}` : '',
    p.contacto ? `Contacto: ${junta([p.contacto.nombre, p.contacto.telefono])}` : '',
    p.referencia ? `Referencia: ${p.referencia}` : '',
    p.requiere_cita ? 'Requiere cita previa.' : '',
    !p.tiene_medios_carga ? (p.tipo === 'carga' ? 'Sin medios de carga en el sitio.' : 'Sin medios de descarga en el sitio.') : '',
    p.notas_sitio ? `Notas del sitio: ${p.notas_sitio}` : '',
    p.anotaciones ? `Anotaciones: ${p.anotaciones}` : '',
    p.url_google_maps ? `Mapa: ${p.url_google_maps}` : '',
  ].filter(Boolean);
}

// Todo el detalle de la orden en TEXTO LLANO, por bloques (cada bloque, sus líneas).
export function bloquesOrdenPropia(d: DatosDoc): string[][] {
  const e = d.envio, c = d.cliente, t = d.porteador;
  const cargas = d.paradas.filter((p) => p.tipo === 'carga'), descargas = d.paradas.filter((p) => p.tipo === 'descarga');
  const modos = junta([e.carga_lateral && 'lateral', e.carga_trasera && 'trasera', e.carga_techo && 'por techo'], ', ');
  const bloques: string[][] = [
    [`PEDIDO DE TRANSPORTE ${e.referencia_gx ?? ''}`.trim(), e.referencia_cliente ? `Referencia del cliente: ${e.referencia_cliente}` : ''],
    ['TRANSPORTISTA', junta([t?.razon_social, t?.cif]), junta([t?.contacto, t?.telefono, t?.email])],
    ['ORDENANTE', junta([c?.razon_social, c?.cif]),
      junta([c?.direccion, junta([c?.codigo_postal, c?.poblacion], ' '), c?.provincia && c.provincia !== c.poblacion ? c.provincia : '', c?.pais], ', '),
      junta([c?.contacto, c?.telefono, c?.email])],
    ['FECHAS',
      `Carga: ${e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}`,
      e.fecha_entrega_estimada ? `Entrega prevista: ${fecha(e.fecha_entrega_estimada)}` : ''],
    ...cargas.map((p, i) => bloqueParada(p, cargas.length > 1 ? `Recogida ${i + 1}` : 'Recogida')),
    ...descargas.map((p, i) => bloqueParada(p, descargas.length > 1 ? `Entrega ${i + 1}` : 'Entrega')),
    ['MERCANCÍA',
      e.descripcion_mercancia ?? '',
      junta([tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora), metros(e.metros_lineales), pesoTn(e.toneladas),
        e.paletizado === false ? 'No paletizada' : 'Paletizada']),
      modos ? `Carga y descarga: ${modos}` : '',
      junta([e.requiere_plataforma_elevadora && 'Con plataforma elevadora', e.adr && 'Mercancía peligrosa (ADR)', e.requiere_nima && 'Requiere NIMA (residuos)'])],
    ['VEHÍCULO',
      e.matricula_camion ? `Camión: ${e.matricula_camion}` : 'Matrículas: pendientes de indicar',
      e.matricula_remolque ? `Remolque: ${e.matricula_remolque}` : '',
      e.conductor_nombre || e.conductor_telefono ? `Conductor: ${junta([e.conductor_nombre, e.conductor_telefono])}` : ''],
    ['PRECIO ACORDADO', e.precio_acordado_operador != null ? `${euros(e.precio_acordado_operador)} + IVA` : 'Sin anotar'],
  ];
  return bloques.map((b) => b.filter(Boolean)).filter((b) => b.length > 1 || b[0].startsWith('PEDIDO'));
}
