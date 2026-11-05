// Validaciones que también hace el servidor: CIF/NIF/IVA europeo y contraseña.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validaIdFiscal, validaIdFiscalPais } from '../../lib/idFiscal';
import { claveValida } from '../../lib/clave';

test('CIF y NIF españoles', () => {
  assert.equal(validaIdFiscal('B01596360')?.ok, true);      // el de Dynamo
  assert.equal(validaIdFiscal('ESB01596360')?.ok, true);
  assert.equal(validaIdFiscal('12345678Z')?.ok, true);
  assert.equal(validaIdFiscal('12345678A')?.ok, false);     // letra de control mala
  assert.equal(validaIdFiscalPais('ESB01596360', 'ES')?.ok, true);   // con «ES» delante, como el IVA europeo
  assert.equal(validaIdFiscal('ESB01596361')?.ok, false);
});

test('contraseña: 8 o más y 3 de las 5 reglas', () => {
  assert.equal(claveValida('corta1A'), false);
  assert.equal(claveValida('todominusculas'), false);
  assert.equal(claveValida('Dynamo2026'), true);
});
