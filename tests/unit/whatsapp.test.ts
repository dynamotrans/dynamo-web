// WhatsApp (usuario, 2026-11-25): lo que llega de Meta se comprueba (firma) y se lee bien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { botonesReenvio, cuerpoArchivo, cuerpoBotones, cuerpoPlantilla, cuerpoReaccion, cuerpoTexto, dentroDe24h, extensionDe, leerAviso, telWhatsApp, textoPlantilla, tipoArchivoMeta } from '../../lib/whatsapp';
import { firmaValida } from '../../lib/whatsappFirma';

const SECRETO = 'secreto-de-prueba';
const firma = (c: string, s = SECRETO) => 'sha256=' + createHmac('sha256', s).update(c, 'utf8').digest('hex');

test('firma: solo vale la de la clave secreta de la app, sobre el cuerpo tal cual', () => {
  const cuerpo = '{"object":"whatsapp_business_account","entry":[]}';
  assert.equal(firmaValida(cuerpo, firma(cuerpo), SECRETO), true);
  assert.equal(firmaValida(cuerpo + ' ', firma(cuerpo), SECRETO), false);
  assert.equal(firmaValida(cuerpo, firma(cuerpo, 'otra'), SECRETO), false);
  assert.equal(firmaValida(cuerpo, null, SECRETO), false);
  assert.equal(firmaValida(cuerpo, firma(cuerpo), undefined), false);
  assert.equal(firmaValida(cuerpo, 'sha256=nohex', SECRETO), false);
});

test('teléfono en formato WhatsApp, igual que la base de datos', () => {
  assert.equal(telWhatsApp('600 11 12 22'), '+34600111222');
  assert.equal(telWhatsApp('34600111222'), '+34600111222');
  assert.equal(telWhatsApp('+34 600-111-222'), '+34600111222');
  assert.equal(telWhatsApp('0033612345678'), '+33612345678');
  assert.equal(telWhatsApp(''), null);
});

const aviso = (value: unknown) => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value }] }] });

test('mensajes que llegan: texto, foto con pie, documento, ubicación y nombre del perfil', () => {
  const { entradas, estados } = leerAviso(aviso({
    messaging_product: 'whatsapp',
    contacts: [{ wa_id: '34600111222', profile: { name: 'Marta' } }],
    messages: [
      { from: '34600111222', id: 'wamid.1', timestamp: '1764000000', type: 'text', text: { body: '¿Mi camión ha salido?' } },
      { from: '34600111222', id: 'wamid.2', timestamp: '1764000010', type: 'image', image: { id: 'media1', mime_type: 'image/jpeg', caption: 'Albarán' } },
      { from: '34600111222', id: 'wamid.3', type: 'document', document: { id: 'media2', mime_type: 'application/pdf', filename: 'cmr.pdf' } },
      { from: '34600111222', id: 'wamid.4', type: 'location', location: { latitude: 37.38, longitude: -5.98, name: 'Nave 5' } },
      { from: '34600111222', id: 'wamid.5', type: 'voice', voice: { id: 'media3', mime_type: 'audio/ogg; codecs=opus' } },
      { id: 'sin-remitente', type: 'text', text: { body: 'x' } },
    ],
  }));
  assert.equal(estados.length, 0);
  assert.equal(entradas.length, 5);
  assert.deepEqual(entradas[0], { telefono: '+34600111222', nombre: 'Marta', wa_id: 'wamid.1', tipo: 'texto', texto: '¿Mi camión ha salido?', meta_archivo_id: null, archivo_tipo: null, archivo_nombre: null, cuando: 1764000000, cita_wa_id: null, boton_id: null });
  assert.equal(entradas[1].tipo, 'imagen');
  assert.equal(entradas[1].texto, 'Albarán');
  assert.equal(entradas[1].meta_archivo_id, 'media1');
  assert.equal(entradas[2].archivo_nombre, 'cmr.pdf');
  assert.match(entradas[3].texto ?? '', /Nave 5 · 37.38, -5.98/);
  assert.equal(entradas[4].tipo, 'audio');
});

test('estados de lo que salió: entregado, leído y fallido con su motivo; nada de otros objetos', () => {
  const { estados } = leerAviso(aviso({
    statuses: [
      { id: 'wamid.a', status: 'delivered', timestamp: '1764000100' },
      { id: 'wamid.b', status: 'read' },
      { id: 'wamid.c', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] },
      { id: 'wamid.d', status: 'raro' },
    ],
  }));
  assert.deepEqual(estados.map((e) => e.estado), ['entregado', 'leido', 'fallido']);
  assert.equal(estados[2].error, '(131026) Message undeliverable');
  assert.deepEqual(leerAviso({ object: 'page', entry: [] }), { entradas: [], estados: [] });
  assert.deepEqual(leerAviso(null), { entradas: [], estados: [] });
});

test('extensión del archivo y plazo de 24 h de Meta', () => {
  assert.equal(extensionDe('image/jpeg'), 'jpg');
  assert.equal(extensionDe('audio/ogg; codecs=opus'), 'ogg');
  assert.equal(extensionDe('application/pdf', 'Albarán 12.PDF'), 'pdf');
  assert.equal(extensionDe('application/x-raro'), 'bin');
  const ahora = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(dentroDe24h('2026-11-24T12:30:00Z', ahora), true);
  assert.equal(dentroDe24h('2026-11-24T11:30:00Z', ahora), false);
  assert.equal(dentroDe24h(null, ahora), false);
});

test('reenvío al móvil de Dynamo: se lee la cita y el botón pulsado (mensaje con botones o plantilla)', () => {
  const v = (messages: unknown[]) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages } }] }] });
  const [cita] = leerAviso(v([{ from: '34611000000', id: 'w1', type: 'text', text: { body: 'Vale' }, context: { id: 'wamid.reenvio' } }])).entradas;
  assert.equal(cita.cita_wa_id, 'wamid.reenvio');
  assert.equal(cita.boton_id, null);
  const [b1] = leerAviso(v([{ from: '34611000000', id: 'w2', type: 'interactive', context: { id: 'wamid.r' },
    interactive: { type: 'button_reply', button_reply: { id: 'tomo:abc', title: 'Tomo yo' } } }])).entradas;
  assert.deepEqual([b1.tipo, b1.texto, b1.boton_id, b1.cita_wa_id], ['boton', 'Tomo yo', 'tomo:abc', 'wamid.r']);
  const [b2] = leerAviso(v([{ from: '34611000000', id: 'w3', type: 'button', button: { text: 'Que conteste Claude', payload: 'claude:abc' } }])).entradas;
  assert.deepEqual([b2.tipo, b2.boton_id], ['boton', 'claude:abc']);
});

test('cuerpos que se mandan a Meta: botones, plantilla, archivo, reacción y texto citando', () => {
  const bot = cuerpoBotones('+34611000000', 'x'.repeat(1500), botonesReenvio('c1'), { tipo: 'image', id: 'm1' });
  assert.equal(bot.to, '34611000000');
  assert.equal(bot.interactive.body.text.length, 1024);
  assert.deepEqual(bot.interactive.action.buttons.map((b) => [b.reply.id, b.reply.title]), [['tomo:c1', 'Tomo yo'], ['claude:c1', 'Que conteste Claude']]);
  assert.ok(bot.interactive.action.buttons.every((b) => b.reply.title.length <= 20));
  assert.deepEqual((bot.interactive as { header?: unknown }).header, { type: 'image', image: { id: 'm1' } });
  const doc = cuerpoBotones('+34611000000', 'hola', [], { tipo: 'document', id: 'd1', nombre: 'albaran.pdf' });
  assert.deepEqual((doc.interactive as { header?: unknown }).header, { type: 'document', document: { id: 'd1', filename: 'albaran.pdf' } });
  // Plantilla: sin saltos de línea en las variables y con la «payload» de cada botón.
  const pl = cuerpoPlantilla('+34611000000', 'dynamo_reenvio', ['Marta · Cliente (cliente)', 'Hola\n\n¿mi    camión?'], botonesReenvio('c1'));
  assert.deepEqual(pl.template.components[0], { type: 'body', parameters: [{ type: 'text', text: 'Marta · Cliente (cliente)' }, { type: 'text', text: 'Hola ¿mi camión?' }] });
  assert.deepEqual(pl.template.components[2], { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'claude:c1' }] });
  assert.equal(textoPlantilla(''), '—');
  // Archivos: la nota de voz no lleva pie; el documento, su nombre.
  assert.deepEqual(cuerpoArchivo('+34600', 'audio', 'a1', 'pie').audio, { id: 'a1' });
  assert.deepEqual(cuerpoArchivo('+34600', 'document', 'd1', 'pie', 'a.pdf').document, { id: 'd1', caption: 'pie', filename: 'a.pdf' });
  assert.equal(tipoArchivoMeta('image/jpeg'), 'image');
  assert.equal(tipoArchivoMeta('image/webp'), 'document');
  assert.equal(tipoArchivoMeta('audio/ogg; codecs=opus'), 'audio');
  assert.equal(tipoArchivoMeta('application/pdf'), 'document');
  assert.deepEqual(cuerpoReaccion('+34611', 'w1', '✅').reaction, { message_id: 'w1', emoji: '✅' });
  assert.deepEqual(cuerpoTexto('+34611', 'ok', 'w9').context, { message_id: 'w9' });
  assert.equal('context' in cuerpoTexto('+34611', 'ok'), false);
});
