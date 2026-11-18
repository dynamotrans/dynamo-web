// El contenido REAL de un fichero (sus primeros bytes), no lo que dice su nombre o su tipo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoReal } from '../../lib/contenidoArchivo';

const bytes = (...trozos: (string | number[])[]) => new Uint8Array(trozos.flatMap((t) => (typeof t === 'string' ? [...Buffer.from(t, 'latin1')] : t)));
const relleno = new Array(40).fill(0);

test('reconoce lo que el almacén admite: PDF, JPG, PNG, WebP y HEIC', () => {
  assert.equal(tipoReal(bytes('%PDF-1.7\n', relleno)), 'application/pdf');
  assert.equal(tipoReal(bytes([0xff, 0xd8, 0xff, 0xe0], relleno)), 'image/jpeg');
  assert.equal(tipoReal(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], relleno)), 'image/png');
  assert.equal(tipoReal(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 ', relleno)), 'image/webp');
  assert.equal(tipoReal(bytes([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0], 'mif1heic', relleno)), 'image/heic');
  // HEIF de otros móviles: la marca principal no es «heic», pero va entre las compatibles.
  assert.equal(tipoReal(bytes([0, 0, 0, 0x1c], 'ftypmsf1', [0, 0, 0, 0], 'isomhevcmsf1', relleno)), 'image/heic');
});

test('un PDF con la marca de UTF-8 o un salto de línea delante sigue siendo un PDF', () => {
  assert.equal(tipoReal(bytes([0xef, 0xbb, 0xbf], '%PDF-1.4', relleno)), 'application/pdf');
  assert.equal(tipoReal(bytes('\r\n%PDF-1.4', relleno)), 'application/pdf');
});

test('rechaza lo que NO es imagen ni PDF, se llame como se llame', () => {
  assert.equal(tipoReal(bytes('MZ', [0x90, 0, 3, 0], relleno)), null);                    // programa de Windows
  assert.equal(tipoReal(bytes([0x7f], 'ELF', relleno)), null);                            // programa de Linux
  assert.equal(tipoReal(bytes('PK', [3, 4], relleno)), null);                             // ZIP, Word, Excel
  assert.equal(tipoReal(bytes([0xd0, 0xcf, 0x11, 0xe0], relleno)), null);                 // Word/Excel antiguos
  assert.equal(tipoReal(bytes('<!DOCTYPE html><script>alert(1)</script>', relleno)), null);
  assert.equal(tipoReal(bytes('<svg xmlns="http://www.w3.org/2000/svg">', relleno)), null);
  assert.equal(tipoReal(bytes('#!/bin/sh\nrm -rf /', relleno)), null);
  assert.equal(tipoReal(bytes('Hola, soy un texto.', relleno)), null);
  assert.equal(tipoReal(bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 0, 0], 'isommp42', relleno)), null);   // un vídeo MP4
  assert.equal(tipoReal(bytes('RIFF', [1, 2, 3, 4], 'AVI LIST', relleno)), null);          // un vídeo AVI
});

test('«%PDF-» escondido más adentro no cuela, ni un fichero vacío o de dos bytes', () => {
  assert.equal(tipoReal(bytes('<html><!-- ', '%PDF-1.4', relleno)), null);
  assert.equal(tipoReal(bytes('MZ', relleno, '%PDF-1.4')), null);
  assert.equal(tipoReal(new Uint8Array(0)), null);
  assert.equal(tipoReal(bytes([0xff, 0xd8])), null);
});
