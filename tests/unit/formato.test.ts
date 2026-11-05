// Formatos de toda la plataforma (regla de formato: «Vie 10/07/26», «13,30 m», «20,50 Tn»,
// «4.800 kg», «21 %», «1.234,50 €»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euros, numero, pesoTn, pesoKg, metros, medidasTxt, porcentaje, aNumero, fecha, ventana, tipoCargaTxt } from '../../lib/formato';

test('importes con 2 decimales, punto de miles y €', () => {
  assert.equal(euros(1234.5), '1.234,50 €');
  assert.equal(euros('600'), '600,00 €');
  assert.equal(euros(null), '—');
});

test('números: toneladas 2 decimales, kilos sin decimales, metros 2 decimales', () => {
  assert.equal(numero(13.3), '13,30');
  assert.equal(pesoTn(20.5), '20,50 Tn');
  assert.equal(pesoKg(4800), '4.800 kg');
  assert.equal(metros(13.3), '13,30 m');
  assert.equal(medidasTxt(13.3, 20.5), '13,30 m · 20,50 Tn');
  assert.equal(medidasTxt(null, 2), '2,00 Tn');
  assert.equal(porcentaje(21), '21 %');
});

test('leer números escritos a la española', () => {
  assert.equal(aNumero('1.234,5'), 1234.5);
  assert.equal(aNumero('13,30'), 13.3);
  assert.equal(aNumero(''), null);
});

test('fechas «Vie 10/07/26» y ventanas «del X al Y»', () => {
  assert.equal(fecha('2026-07-10'), 'Vie 10/07/26');
  assert.equal(ventana('2026-07-10'), 'Vie 10/07/26');
  assert.equal(ventana('2026-07-10', '2026-07-10'), 'Vie 10/07/26');
  assert.equal(ventana('2026-07-10', '2026-07-14'), 'del Vie 10/07/26 al Mar 14/07/26');
});

test('tipo de carga: camión completo por el camión', () => {
  assert.equal(tipoCargaTxt('completa', false), 'Tráiler completo');
  assert.equal(tipoCargaTxt('completa', true), 'Rígido completo');
  assert.equal(tipoCargaTxt('grupaje', true), 'Grupaje');
  assert.equal(tipoCargaTxt(null), '');
});
