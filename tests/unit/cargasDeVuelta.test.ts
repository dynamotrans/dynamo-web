// Cargas de vuelta al final del email de la orden: grupos, completo/grupaje, lugares y botón.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlCargasDeVuelta, type CargaVuelta } from '../../lib/cargasDeVuelta';
import { lugarCorto } from '../../lib/provinciasEs';

const c = (x: Partial<CargaVuelta>): CargaVuelta => ({ token: 't1', referencia: 'GX1', criterio: 1, precio: 500, tipo_carga: 'completa',
  metros_lineales: 13.3, toneladas: 24, mercancia: null, paletizado: true,
  origen: { codigo_postal: '28020', pais: 'ES' }, destino: { codigo_postal: '46020', pais: 'ES' }, ...x });

test('sin cargas no pinta nada', () => {
  assert.equal(htmlCargasDeVuelta(null, 'https://x'), '');
  assert.equal(htmlCargasDeVuelta({ dia: '2026-11-30', desde: { codigo_postal: '28001' }, cargas: [] }, 'https://x'), '');
});

test('título con la provincia y el día, un título por grupo y el botón a la carga', () => {
  const h = htmlCargasDeVuelta({ dia: '2026-11-30', desde: { codigo_postal: '28001', pais: 'ES' }, cargas: [
    c({ token: 'a' }), c({ token: 'b', tipo_carga: 'grupaje', metros_lineales: 6, precio: 900 }), c({ token: 'c', criterio: 3, mercancia: 'Bobinas' })] }, 'https://web');
  assert.match(h, /Cargas desde Madrid el Lun 30\/11\/26/);
  assert.equal((h.match(/Hacia la provincia de tu base/g) ?? []).length, 1);
  assert.match(h, /Hacia provincias limítrofes de tu base/);
  assert.match(h, /500,00 € \+ IVA[\s\S]*Completo[\s\S]*900,00 € \+ IVA[\s\S]*Grupaje/);
  assert.match(h, /href="https:\/\/web\/carga\/a"[^>]*>Ver carga/);
  assert.match(h, /Origen:<\/strong> CP 28020 · Madrid \(ES\)/);
  assert.match(h, /Destino:<\/strong> CP 46020 · Valencia \(ES\)/);
  assert.match(h, /13,30 m · 24,00 Tn · Bobinas/);
});

test('lugar corto: provincia guardada, la del CP en España y el país fuera', () => {
  assert.equal(lugarCorto({ codigo_postal: '41001', pais: 'ES' }), 'CP 41001 · Sevilla (ES)');
  assert.equal(lugarCorto({ codigo_postal: '75001', pais: 'FR' }), 'CP 75001 (FR)');
  assert.equal(lugarCorto({ codigo_postal: '08001', provincia: 'Barcelona', pais: 'ES' }), 'CP 08001 · Barcelona (ES)');
});
