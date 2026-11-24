import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoPorGoogle, tipoPorSuelo, tipoPorTexto, usosDeRespuesta } from '../../lib/tipoSitioAuto';

test('tipo por texto: polígono industrial y nave → almacén; finca y cortijo → finca', () => {
  assert.equal(tipoPorTexto('Pol. Ind. La Isla, C/ Río Viejo, 48'), 'almacen_nave');
  assert.equal(tipoPorTexto('Polígono Industrial Juncaril, C/ Loja 119'), 'almacen_nave');
  assert.equal(tipoPorTexto('Ctra. N-340, km 942, Nave 5'), 'almacen_nave');
  assert.equal(tipoPorTexto('Parque Empresarial A Grela'), 'almacen_nave');
  assert.equal(tipoPorTexto('Mercamadrid, nave F'), 'almacen_nave');
  assert.equal(tipoPorTexto('Finca El Rosal, Ctra. de Utrera km 7'), 'finca');
  assert.equal(tipoPorTexto('Cortijo de la Sierra'), 'finca');
  assert.equal(tipoPorTexto('Explotación agrícola Los Llanos'), 'finca');
});

test('tipo por texto: «polígono 12, parcela 5» es catastro rústico, no un polígono industrial', () => {
  assert.equal(tipoPorTexto('Polígono 12, Parcela 5, Carmona'), 'finca');
  assert.equal(tipoPorTexto('Parcela 31 Polígono 4'), 'finca');
  assert.equal(tipoPorTexto('Polígono 4'), 'almacen_nave');
});

test('tipo por texto: una calle cualquiera, una obra o nada → no se propone', () => {
  assert.equal(tipoPorTexto('Calle Mayor, 12, 28013 Madrid'), null);
  assert.equal(tipoPorTexto('Obra residencial Las Lomas'), null);
  assert.equal(tipoPorTexto('Avenida del Puerto Rico, 3'), 'almacen_nave');   // «puerto» manda: se puede cambiar a mano
  assert.equal(tipoPorTexto('', null, undefined), null);
});

test('tipo por Google: una granja → finca; cualquier otra empresa → almacén; la dirección manda si dice polígono', () => {
  assert.deepEqual(tipoPorGoogle({ tipos: ['farm', 'establishment'], empresa: 'Agrícola Los Olivos', direccion: 'Camino Viejo s/n' }), { tipo: 'finca', por: 'google' });
  assert.deepEqual(tipoPorGoogle({ tipos: ['supermarket', 'store'], empresa: 'Mercadona', direccion: 'Av. de la Constitución, 85' }), { tipo: 'almacen_nave', por: 'google' });
  assert.deepEqual(tipoPorGoogle({ tipos: ['farm'], empresa: 'Frutas del Sur', direccion: 'Polígono Industrial La Red, 4' }), { tipo: 'almacen_nave', por: 'direccion' });
  assert.deepEqual(tipoPorGoogle({ tipos: ['un_tipo_que_no_existe'], empresa: 'Cortijo El Álamo', direccion: 'Ctra. A-92 km 30' }), { tipo: 'finca', por: 'direccion' });
});

test('tipo por Google: una dirección sin empresa solo se decide por sus palabras', () => {
  assert.deepEqual(tipoPorGoogle({ tipos: ['route'], empresa: 'Calle E', direccion: 'Pol. Malpica, Calle E, 30', esDireccion: true }), { tipo: 'almacen_nave', por: 'direccion' });
  assert.equal(tipoPorGoogle({ tipos: ['street_address'], empresa: 'Finca rara', direccion: 'Calle Mayor, 12', esDireccion: true }), null);
});

test('tipo por suelo: industrial → almacén; agrícola → finca; viviendas, mezcla o nada → no se decide', () => {
  assert.deepEqual(tipoPorSuelo(['industrial']), { tipo: 'almacen_nave', por: 'suelo' });
  assert.deepEqual(tipoPorSuelo(['residential', 'retail']), { tipo: 'almacen_nave', por: 'suelo' });
  assert.deepEqual(tipoPorSuelo(['farmland']), { tipo: 'finca', por: 'suelo' });
  assert.equal(tipoPorSuelo(['residential']), null);
  assert.equal(tipoPorSuelo(['industrial', 'farmyard']), null);
  assert.equal(tipoPorSuelo([]), null);
});

test('tipo de suelo: se lee de la respuesta sin repetir y sin romperse con datos raros', () => {
  assert.deepEqual(usosDeRespuesta({ elements: [{ tags: { landuse: 'industrial', name: 'PI' } }, { tags: { landuse: 'industrial' } }, { tags: {} }, {}] }), ['industrial']);
  assert.deepEqual(usosDeRespuesta(null), []);
  assert.deepEqual(usosDeRespuesta({}), []);
});
