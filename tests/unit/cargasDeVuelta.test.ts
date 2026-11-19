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
    c({ token: 'a' }), c({ token: 'c', criterio: 3, mercancia: 'Bobinas' }), c({ token: 'b', tipo_carga: 'grupaje', metros_lineales: 6, precio: 900 })] }, 'https://web');
  assert.match(h, /¿Ya tienes carga en Madrid cuando descargues el Lun 30\/11\/26\?/);
  // Una vez en los completos y otra en los grupajes.
  assert.equal((h.match(/Hacia la provincia de tu base/g) ?? []).length, 2);
  assert.match(h, /Hacia provincias limítrofes de tu base/);
  assert.match(h, /Completo[\s\S]*500,00 € <span[^>]*>\+ IVA[\s\S]*Grupaje[\s\S]*900,00 € <span[^>]*>\+ IVA/);
  assert.match(h, /href="https:\/\/web\/carga\/a"[^>]*>Ver carga/);
  assert.match(h, /Origen:<\/strong> CP 28020 · Madrid \(ES\)/);
  assert.match(h, /Destino:<\/strong> CP 46020 · Valencia \(ES\)/);
  assert.match(h, /13,30 m · 24,00 Tn · Bobinas/);
  // La fecha en cada carga, aunque se repita.
  assert.equal((h.match(/>Lun 30\/11\/26</g) ?? []).length, 3);
});

test('lugar corto: provincia guardada, la del CP en España y el país fuera', () => {
  assert.equal(lugarCorto({ codigo_postal: '41001', pais: 'ES' }), 'CP 41001 · Sevilla (ES)');
  assert.equal(lugarCorto({ codigo_postal: '75001', pais: 'FR' }), 'CP 75001 (FR)');
  assert.equal(lugarCorto({ codigo_postal: '08001', provincia: 'Barcelona', pais: 'ES' }), 'CP 08001 · Barcelona (ES)');
});

test('bloque de regreso: su título y el grupo 2 es la misma ruta', () => {
  const h = htmlCargasDeVuelta({ tramo: 'regreso', dia: '2026-11-25', desde: { codigo_postal: '28001', pais: 'ES' },
    cargas: [c({ criterio: 2, destino: { codigo_postal: '08001', pais: 'ES' } })] }, 'https://web');
  assert.match(h, /Y de nuevo en Madrid: cargas el Mié 25\/11\/26/);
  assert.match(h, /La misma ruta que este envío/);
  assert.doesNotMatch(h, /¿Ya tienes carga en/);
});

test('un título por tipo (completos / grupajes) y los grupos se repiten dentro de cada uno', () => {
  const h = htmlCargasDeVuelta({ dia: '2026-11-30', desde: { codigo_postal: '28001', pais: 'ES' }, tipo_envio: 'completa', cargas: [
    c({ token: 'a' }), c({ token: 'b', criterio: 3 }), c({ token: 'c', tipo_carga: 'grupaje', metros_lineales: 6 })] }, 'https://web');
  assert.match(h, /Cargas completas[\s\S]*Hacia la provincia de tu base[\s\S]*Hacia provincias limítrofes[\s\S]*Grupajes[\s\S]*Hacia la provincia de tu base/);
  assert.equal((h.match(/Cargas completas/g) ?? []).length, 1);
  assert.equal((h.match(/>Grupajes</g) ?? []).length, 1);
});

test('títulos con la provincia entre paréntesis, grupo 4 y «puedes combinar varios» con más de un grupaje', () => {
  const g = (x: Partial<CargaVuelta>) => c({ tipo_carga: 'grupaje', metros_lineales: 6, ...x });
  const h = htmlCargasDeVuelta({ dia: '2026-11-30', desde: { codigo_postal: '08001', pais: 'ES' }, tipo_envio: 'grupaje',
    base: { cp2: '46', pais: 'ES' }, previa: { cp2: '28', pais: 'ES' },
    cargas: [g({ token: 'a' }), g({ token: 'b', criterio: 2 }), g({ token: 'd', criterio: 4 })] }, 'https://web');
  const l = htmlCargasDeVuelta({ dia: '2026-11-30', desde: { codigo_postal: '08001', pais: 'ES' }, base: { cp2: '46', pais: 'ES' },
    cargas: [g({ criterio: 3 })] }, 'https://web');
  assert.match(l, /Hacia provincias limítrofes de tu base \(Valencia\)/);
  assert.match(h, /Hacia la provincia de tu base \(Valencia\)/);
  assert.match(h, /Hacia la provincia de donde vienes \(Madrid\)/);
  assert.match(h, /Desde provincias limítrofes de Barcelona/);
  assert.match(h, /Grupajes <span[^>]*>\(puedes combinar varios\)/);
  assert.doesNotMatch(h, /el resto|Otras desde/i);
  const r = htmlCargasDeVuelta({ tramo: 'regreso', dia: '2026-11-25', desde: { codigo_postal: '28001', pais: 'ES' },
    base: { cp2: '46', pais: 'ES' }, previa: { cp2: '08', pais: 'ES' }, cargas: [c({ criterio: 2 })] }, 'https://web');
  assert.match(r, /La misma ruta que este envío \(Madrid → Barcelona\)/);
});

test('6 del mismo tipo y 4 del otro, cada lista con «Ver más» si hay más', () => {
  const lista = [...Array.from({ length: 25 }, (_, i) => c({ token: `c${i}` })),
    ...Array.from({ length: 8 }, (_, i) => c({ token: `g${i}`, tipo_carga: 'grupaje', metros_lineales: 6 }))];
  const r = { dia: '2026-11-30', desde: { codigo_postal: '08001', pais: 'ES' }, tipo_envio: 'completa', cargas: lista };
  const h = htmlCargasDeVuelta(r, 'https://web', { verTodas: (t) => `https://web/cargas-de-vuelta/x?tipo=${t}` });
  assert.equal((h.match(/>Ver carga</g) ?? []).length, 10);   // 6 + 4
  assert.match(h, /href="https:\/\/web\/cargas-de-vuelta\/x\?tipo=completa"[^>]*>Ver más cargas completas \(25\)/);
  assert.match(h, /href="https:\/\/web\/cargas-de-vuelta\/x\?tipo=grupaje"[^>]*>Ver más grupajes \(8\)/);
  assert.ok(h.indexOf('Cargas completas') < h.indexOf('Grupajes'));
  // Si lleva un grupaje, primero los grupajes y luego los completos.
  const g = htmlCargasDeVuelta({ ...r, tipo_envio: 'grupaje' }, 'https://web', { verTodas: () => 'https://web/v' });
  assert.ok(g.indexOf('Grupajes') < g.indexOf('Cargas completas'));
  assert.equal((g.match(/>Ver carga</g) ?? []).length, 10);
  // Con pocas, sin botón; sin enlace, sin botón; la página «Ver todas» enseña un solo tipo, sin límite.
  const pocas = htmlCargasDeVuelta({ ...r, cargas: lista.slice(0, 3) }, 'https://web', { verTodas: () => 'https://web/v' });
  assert.doesNotMatch(pocas, /Ver más/);
  assert.doesNotMatch(htmlCargasDeVuelta(r, 'https://web'), /Ver más/);
  const p = htmlCargasDeVuelta(r, '', { mismo: Infinity, otro: Infinity, soloTipo: 'completa' });
  assert.equal((p.match(/>Ver carga</g) ?? []).length, 25);
  assert.doesNotMatch(p, /Grupaje/);
});
