import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

// SELLO ELECTRÓNICO DE DYNAMO EN EL CMR (e-CMR paso 4; usuario, 2026-11-22: prestador Uanataca;
// 2026-11-28: «déjalo apagado»). Con el certificado de SELLO electrónico de la empresa (fichero
// .p12, nunca el de representante del administrador), cada CMR digital sale firmado (PAdES):
// quien lo abra en un lector de PDF ve «firmado por DYNAMO…» y, si alguien cambia algo después,
// que la firma ya no vale. Sin certificado en Vercel, el PDF sale igual que siempre (apagado).
//
// En Vercel (Sensitive, nunca en el repositorio ni en el chat):
//   SELLO_DYNAMO_P12    → el fichero .p12 en base64
//   SELLO_DYNAMO_CLAVE  → su contraseña

export type Certificado = { p12: Uint8Array; clave: string };

/** El certificado de Vercel, o null si no está puesto (sello apagado). Se lee al atender, no al compilar. */
export function certificadoDynamo(): Certificado | null {
  const e = process.env as Record<string, string | undefined>;
  const b64 = (e.SELLO_DYNAMO_P12 ?? '').replace(/\s+/g, '');
  if (!b64) return null;
  try {
    const p12 = Uint8Array.from(Buffer.from(b64, 'base64'));
    return p12.length > 100 ? { p12, clave: e.SELLO_DYNAMO_CLAVE ?? '' } : null;
  } catch { return null; }
}

/** Sella un PDF con el certificado dado. Lanza si el certificado o el PDF no valen. */
export async function sellarPdf(bytes: Uint8Array, cert: Certificado, motivo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: motivo.slice(0, 200),
    contactInfo: 'www.dynamotrans.com',
    name: 'DYNAMO',
    location: 'España',
    signatureLength: 16384,   // sitio para la firma y la cadena de certificados del prestador
  });
  const conHueco = Buffer.from(await doc.save({ useObjectStreams: false }));
  const firmado = await new SignPdf().sign(conHueco, new P12Signer(Buffer.from(cert.p12), { passphrase: cert.clave }));
  return new Uint8Array(firmado);
}

/**
 * Sella el CMR si el certificado de Dynamo está puesto; si no, lo devuelve tal cual. Un fallo al
 * sellar (certificado caducado, contraseña mala…) NO deja al conductor sin su CMR: sale sin sello
 * y queda en el registro de errores para arreglarlo.
 */
export async function sellarSiHayCertificado(bytes: Uint8Array, motivo: string): Promise<Uint8Array> {
  const cert = certificadoDynamo();
  if (!cert) return bytes;
  try { return await sellarPdf(bytes, cert, motivo); }
  catch (e) { console.error('[Sello CMR] no se ha podido sellar:', (e as Error).message); return bytes; }
}
