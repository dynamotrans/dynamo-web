import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descuadre, destinoVista, navegadorCorto, paginaLarga, type MedidaVista } from '../../lib/vistaPantalla';

// Pantalla normal de un móvil: página de 2000 px, ventana de 750, bajada 400.
const bien: MedidaVista = { y: 400, alto: 750, doc: 2000, contenido: 1990, vvAlto: 750, vvArriba: 0, vvPagina: 400, escala: 1, campo: false };

test('hueco al final · una pantalla normal no está descuadrada, ni arriba ni al final', () => {
  assert.equal(descuadre(bien), null);
  assert.equal(descuadre({ ...bien, y: 0, vvPagina: 0 }), null);
  assert.equal(descuadre({ ...bien, y: 1250, vvPagina: 1250 }), null);
});
test('hueco al final · una página más corta que la pantalla tampoco', () => {
  assert.equal(descuadre({ ...bien, y: 0, doc: 750, contenido: 500, vvPagina: 0 }), null);
});
test('hueco al final · las barras del navegador al esconderse (unos 100 px) no cuentan', () => {
  assert.equal(descuadre({ ...bien, y: 1250, alto: 750, vvAlto: 850, vvPagina: 1250 }), null);
});
test('hueco al final · la captura del usuario: la pantalla mira 650 px más allá del final', () => {
  assert.equal(descuadre({ ...bien, y: 1250, vvPagina: 1900, vvArriba: 650 }), 'pasado_del_final');
});
test('hueco al final · la zona visible desplazada después de cerrar el teclado', () => {
  assert.equal(descuadre({ ...bien, vvArriba: 300, vvPagina: 700 }), 'zona_desplazada');
});
test('hueco al final · la página bajada más allá de su final', () => {
  assert.equal(descuadre({ ...bien, y: 1900, vvAlto: null, vvArriba: null, vvPagina: null }), 'scroll_de_mas');
});
test('hueco al final · no se toca con el teclado abierto, escribiendo o con zoom de pellizco', () => {
  const mal = { ...bien, y: 1250, vvPagina: 1900, vvArriba: 650 };
  assert.equal(descuadre({ ...mal, campo: true }), null);
  assert.equal(descuadre({ ...mal, vvAlto: 400 }), null);
  assert.equal(descuadre({ ...mal, escala: 1.6 }), null);
});
test('hueco al final · se recoloca donde estaba, sin pasarse del final', () => {
  assert.equal(destinoVista({ ...bien, y: 1900 }), 1250);
  assert.equal(destinoVista(bien), 400);
  assert.equal(destinoVista({ ...bien, y: 300, doc: 700 }), 0);
});
test('hueco al final · página que mide bastante más que su contenido', () => {
  assert.equal(paginaLarga(bien), false);
  assert.equal(paginaLarga({ ...bien, contenido: 1200 }), true);
  assert.equal(paginaLarga({ ...bien, doc: 750, contenido: 300 }), false);
});
test('hueco al final · teléfono y navegador en corto', () => {
  assert.equal(navegadorCorto('Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1'), 'iPhone/iPad (iOS 26.1) · Chrome');
  assert.equal(navegadorCorto('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'), 'iPhone/iPad (iOS 18.6) · Safari');
  assert.equal(navegadorCorto('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36'), 'Android 15 · Chrome');
  assert.equal(navegadorCorto('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36'), 'Ordenador · Chrome');
});
