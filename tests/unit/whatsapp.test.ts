// WhatsApp (usuario, 2026-11-25): lo que llega de Meta se comprueba (firma) y se lee bien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { dentroDe24h, extensionDe, leerAviso, telWhatsApp } from '../../lib/whatsapp';
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
  assert.deepEqual(entradas[0], { telefono: '+34600111222', nombre: 'Marta', wa_id: 'wamid.1', tipo: 'texto', texto: '¿Mi camión ha salido?', meta_archivo_id: null, archivo_tipo: null, archivo_nombre: null, cuando: 1764000000 });
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
