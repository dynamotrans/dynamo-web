import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import forge from 'node-forge';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { sellarPdf, sellarSiHayCertificado, certificadoDynamo } from '../../lib/pdf/sello';

// Un certificado de SELLO de prueba (autofirmado, como el .p12 que dará Uanataca, sin valor legal).
function p12DePrueba(clave: string): Uint8Array {
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  const nombre = [{ name: 'commonName', value: 'DYNAMO PRUEBAS' }, { name: 'countryName', value: 'ES' }];
  cert.setSubject(nombre); cert.setIssuer(nombre);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(claves.privateKey, [cert], clave, { algorithm: '3des' });
  return Uint8Array.from(Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'));
}

async function pdfDePrueba(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]).drawText('CMR DE PRUEBA', { x: 20, y: 100, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  return doc.save();
}

test('sello del CMR: sin certificado en Vercel sale el PDF tal cual (apagado)', async () => {
  const antes = process.env.SELLO_DYNAMO_P12;
  delete process.env.SELLO_DYNAMO_P12;
  try {
    assert.equal(certificadoDynamo(), null);
    const pdf = await pdfDePrueba();
    assert.deepEqual(await sellarSiHayCertificado(pdf, 'CMR'), pdf);
  } finally { if (antes !== undefined) process.env.SELLO_DYNAMO_P12 = antes; }
});

test('sello del CMR: con el certificado, el PDF sale firmado y la firma cubre todo el documento', async () => {
  const pdf = await pdfDePrueba();
  const sellado = await sellarPdf(pdf, { p12: p12DePrueba('clave-de-prueba'), clave: 'clave-de-prueba' }, 'CMR GX1 emitido por DYNAMO');
  const txt = Buffer.from(sellado).toString('latin1');
  assert.match(txt, /\/SubFilter\s*\/adbe\.pkcs7\.detached/);
  const br = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(txt);
  assert.ok(br, 'lleva /ByteRange');
  const [a, b, c, d] = br!.slice(1).map(Number);
  // Lo firmado son los dos trozos de alrededor del hueco de la firma: llegan hasta el final del fichero.
  assert.equal(a, 0);
  assert.equal(c + d, sellado.length);
  const firmado = Buffer.concat([Buffer.from(sellado.subarray(a, a + b)), Buffer.from(sellado.subarray(c, c + d))]);
  // La firma (PKCS#7) guarda la huella de esos trozos: si se tocara una coma, no coincidiría.
  // (El hueco va relleno de ceros por detrás: se lee solo la firma, sin exigir que ocupe todo.)
  const der = forge.util.hexToBytes(txt.slice(a + b + 1, c - 1));
  const p7 = forge.pkcs7.messageFromAsn1((forge.asn1.fromDer as unknown as (b: string, o: object) => forge.asn1.Asn1)(der, { parseAllBytes: false })) as unknown as {
    rawCapture: { authenticatedAttributes: { value: { value: { value: string }[] }[] }[] } };
  const atributos = p7.rawCapture.authenticatedAttributes;
  const huellas = atributos.map((x) => x.value[1]?.value?.[0]?.value).filter((v): v is string => typeof v === 'string' && v.length === 32);
  assert.ok(huellas.includes(createHash('sha256').update(firmado).digest('binary')), 'la huella firmada es la del documento');
  // Sigue siendo un PDF que se abre.
  assert.equal((await PDFDocument.load(sellado)).getPageCount(), 1);
});

test('sello del CMR: si el certificado o su contraseña no valen, el CMR sale igual (sin sello) y no se rompe', async () => {
  const antes = { p: process.env.SELLO_DYNAMO_P12, c: process.env.SELLO_DYNAMO_CLAVE };
  process.env.SELLO_DYNAMO_P12 = Buffer.from(p12DePrueba('buena')).toString('base64');
  process.env.SELLO_DYNAMO_CLAVE = 'mala';
  const error = console.error; console.error = () => {};
  try {
    const pdf = await pdfDePrueba();
    assert.deepEqual(await sellarSiHayCertificado(pdf, 'CMR'), pdf);
  } finally {
    console.error = error;
    if (antes.p === undefined) delete process.env.SELLO_DYNAMO_P12; else process.env.SELLO_DYNAMO_P12 = antes.p;
    if (antes.c === undefined) delete process.env.SELLO_DYNAMO_CLAVE; else process.env.SELLO_DYNAMO_CLAVE = antes.c;
  }
});
