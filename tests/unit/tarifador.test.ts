// El motor del tarifador en borrador (lib/tarifador.ts): el cálculo es puro, así que se
// comprueban las reglas del mockup una a una. Los NÚMEROS son provisionales (MOCK): si se
// cambian con la tarifa real, estas pruebas se actualizan con ellos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTarifa, precioTransportistaSugerido, type EntradaTarifa } from '../../lib/tarifador';

// Un envío de referencia: tráiler completo Sevilla→Madrid (530 km), almacenes, ventana.
const BASE: EntradaTarifa = {
  km: 530, puntos: 2, tiposSitio: ['almacen_nave', 'almacen_nave'],
  ml: 13.3, peso: 24, mlMax: 13.3, pesoMax: 24,
  paletizada: true, techo: false, plataforma: false, nima: false, adr: false,
  urgencia: 'estandar', fecha: '2026-11-18', primerDia: '2026-11-10', hoy: '2026-11-09', festivos: [],
};
const linea = (t: ReturnType<typeof calcularTarifa>, k: string) => t.lineas.find((l) => l.k.startsWith(k));

test('importe del envío FIJO: 700 € para todos, completos y grupajes, a cualquier distancia', () => {
  const t = calcularTarifa(BASE);
  assert.equal(t.grupaje, false);
  assert.equal(linea(t, 'Importe del envío')!.v, 700);
  assert.equal(t.lineas.length, 1);
  assert.equal(t.neto, 700);
  const grup = calcularTarifa({ ...BASE, ml: 2, peso: 2, km: 40 });
  assert.equal(grup.grupaje, true);
  assert.equal(linea(grup, 'Importe del envío')!.v, 700);
  assert.equal(calcularTarifa({ ...BASE, km: 2000 }).neto, 700);
});

test('paradas extra: 40 € por punto a partir del tercero', () => {
  const t = calcularTarifa({ ...BASE, puntos: 4, tiposSitio: ['almacen_nave', 'almacen_nave', 'almacen_nave', 'almacen_nave'] });
  assert.equal(linea(t, 'Paradas extra')!.v, 80);
});

test('recargo por tipo de sitio: % del envío base por punto, redondeado a 10', () => {
  const t = calcularTarifa({ ...BASE, tiposSitio: ['obra_zona_urbana', 'finca'] });
  const base = linea(t, 'Importe del envío')!.v;
  assert.equal(linea(t, 'Recargo Obra · zona urbana')!.v, Math.round(base * 0.20 / 10) * 10);
  assert.equal(linea(t, 'Recargo Finca')!.v, Math.round(base * 0.25 / 10) * 10);
});

test('suplementos: no paletizada 70, techo 50 (90 en verano), plataforma 60, NIMA 50', () => {
  const t = calcularTarifa({ ...BASE, paletizada: false, techo: true, nima: true });
  assert.equal(linea(t, 'Mercancía no paletizada')!.v, 70);
  assert.equal(linea(t, 'Carga/descarga por techo')!.v, 50);
  assert.equal(linea(t, 'Residuos · NIMA')!.v, 50);
  const verano = calcularTarifa({ ...BASE, techo: true, fecha: '2026-07-20' });
  assert.equal(linea(verano, 'Carga/descarga por techo')!.v, 90);
  const plat = calcularTarifa({ ...BASE, plataforma: true, ml: 8, peso: 14, mlMax: 8, pesoMax: 14 });
  assert.equal(linea(plat, 'Plataforma elevadora')!.v, 60);
});

test('ADR: el 50 % de lo acumulado, redondeado a 10', () => {
  const t = calcularTarifa({ ...BASE, adr: true });
  const sub = linea(t, 'Importe del envío')!.v;
  assert.equal(linea(t, 'Mercancía peligrosa')!.v, Math.round(sub * 0.5 / 10) * 10);
});

test('fecha fija: 100 el primer día disponible (urgente), 50 después, nada pasada o en ventana', () => {
  const urgente = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-10' });
  assert.equal(linea(urgente, 'Fecha fija (urgente)')!.v, 100);
  const normal = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-18' });
  assert.equal(linea(normal, 'Fecha fija')!.v, 50);
  const pasada = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-02' });
  assert.equal(linea(pasada, 'Fecha fija'), undefined);
  assert.equal(linea(calcularTarifa(BASE), 'Fecha fija'), undefined);
});

test('descuento por peso bajo: solo tráiler completo, tramos por toneladas, techo a decena', () => {
  const t = calcularTarifa({ ...BASE, peso: 4 });
  const base = linea(t, 'Importe del envío')!.v;
  assert.equal(linea(t, 'Descuento peso')!.v, -Math.ceil(base * 3.5 / 100 / 10) * 10);
  assert.equal(linea(calcularTarifa({ ...BASE, peso: 24 }), 'Descuento peso'), undefined);       // peso > 20: sin descuento
  assert.equal(linea(calcularTarifa({ ...BASE, ml: 6, peso: 4 }), 'Descuento peso'), undefined); // grupaje: sin descuento
});

test('ventana corta de grupaje (1 a 2 días): +10 % o 80 € (el mayor), alternativa 1 a 4 recomendada y ETA de 2 días; en completo no existe', () => {
  const grup = calcularTarifa({ ...BASE, ml: 2, peso: 2, urgencia: 'corta', fecha: '2026-11-18' });
  assert.equal(grup.grupaje, true);
  assert.equal(linea(grup, 'Ventana corta')!.v, 80);            // 10 % de 700 = 70 → manda el mínimo de 80
  assert.deepEqual([grup.alternativas.length, grup.alternativas[0].ahorro, grup.alternativas[0].recomendada, grup.alternativas[0].urgencia],
    [1, 80, true, 'estandar']);
  assert.equal(grup.alternativas[0].titulo, 'Recogida de 1 a 4 días');
  // ETA: la corta cierra la ventana a 2 días (mié 18 + 1 hábil = jue 19; tránsito 1 día → vie 20)…
  assert.deepEqual([grup.etaDesde, grup.etaHasta], ['2026-11-19', '2026-11-20']);
  // …y la estándar de grupaje la abre a 4 (mié 18 + 3 hábiles = lun 23; tránsito 1 → mar 24).
  assert.equal(calcularTarifa({ ...BASE, ml: 2, peso: 2, fecha: '2026-11-18' }).etaHasta, '2026-11-24');
  // En carga completa la opción no existe: sin suplemento aunque llegue 'corta'.
  assert.equal(linea(calcularTarifa({ ...BASE, urgencia: 'corta' }), 'Ventana corta'), undefined);
});

test('alternativas: fija urgente ofrece día siguiente (50) y ventana recomendada (100); fija normal, ventana (50); ventana, nada', () => {
  const urgente = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-10' });
  assert.equal(urgente.alternativas.length, 2);
  assert.equal(urgente.alternativas[0].ahorro, 50);
  assert.equal(urgente.alternativas[0].fecha, '2026-11-11');
  assert.deepEqual([urgente.alternativas[1].ahorro, urgente.alternativas[1].recomendada, urgente.alternativas[1].urgencia], [100, true, 'estandar']);
  const normal = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-18' });
  assert.deepEqual([normal.alternativas.length, normal.alternativas[0].ahorro], [1, 50]);
  assert.equal(calcularTarifa(BASE).alternativas.length, 0);
});

test('entrega estimada: ~600 km por día hábil; la ventana añade sus 2 días al final del rango', () => {
  const fija = calcularTarifa({ ...BASE, urgencia: 'dia', fecha: '2026-11-18' });   // miércoles, 530 km → 1 día
  assert.deepEqual([fija.diasTransito, fija.etaDesde, fija.etaHasta], [1, '2026-11-19', '2026-11-19']);
  const lejos = calcularTarifa({ ...BASE, km: 1900, urgencia: 'dia', fecha: '2026-11-18' });    // 1.900 km → 4 días, salta el finde
  assert.deepEqual([lejos.diasTransito, lejos.etaDesde], [4, '2026-11-24']);
  const ventana = calcularTarifa({ ...BASE, fecha: '2026-11-18' });
  assert.deepEqual([ventana.etaDesde, ventana.etaHasta], ['2026-11-19', '2026-11-23']);
  assert.equal(calcularTarifa({ ...BASE, fecha: null }).etaDesde, null);
});

test('el precio del transportista sugerido: 85 % a la decena', () => {
  assert.equal(precioTransportistaSugerido(1000), 850);
  assert.equal(precioTransportistaSugerido(933), 790);
});

// ---- La tabla «Precios internos» del mockup ----
import { compraTarifador, tablaInterna, diasDesde } from '../../lib/tarifador';

test('compra del tarifador: 600 € fijos para todos (hasta la tarifa real); sin venta, 0', () => {
  assert.equal(compraTarifador(1030), 600);
  assert.equal(compraTarifador(700), 600);
  assert.equal(compraTarifador(0), 0);
});

test('tabla interna: el caso de la captura del mockup (último viejo no entra en la media; margen con todo)', () => {
  const hoy = '2026-11-08';
  const mismo = { venta: null, compra: null, fecha: null, ref: null };
  const todos = { venta: 1080, compra: 840, fecha: '2026-10-05', ref: 'X' };   // hace 34 días
  const t = tablaInterna(1030, 800, mismo, todos, hoy);
  assert.deepEqual([t.vApl, t.cApl], [1030, 800]);           // la media solo usa el tarifador
  assert.deepEqual([t.margenMin, t.margenMax], [190, 280]);  // 1030−840 · 1080−800 (los viejos sí cuentan)
  assert.equal(t.compraMin, 800);
});

test('tabla interna: un último reciente sí entra (venta ↑decena, compra ↓decena) y manda la compra más baja', () => {
  const hoy = '2026-11-08';
  const mismo = { venta: 990, compra: 750, fecha: '2026-11-01', ref: 'A' };    // hace 7 días
  const todos = { venta: null, compra: null, fecha: null, ref: null };
  const t = tablaInterna(1030, 800, mismo, todos, hoy);
  assert.equal(t.vApl, Math.ceil((1030 + 990) / 2 / 10) * 10);     // 1010
  assert.equal(t.cApl, Math.floor((800 + 750) / 2 / 10) * 10);     // 770
  assert.equal(t.compraMin, 750);
  assert.deepEqual([t.margenMin, t.margenMax], [990 - 800, 1030 - 750]);
});

test('diasDesde: hoy 0, ayer 1, futuro negativo, sin fecha null', () => {
  assert.equal(diasDesde('2026-11-08', '2026-11-08'), 0);
  assert.equal(diasDesde('2026-11-07', '2026-11-08'), 1);
  assert.equal(diasDesde('2026-11-10', '2026-11-08'), -2);
  assert.equal(diasDesde(null, '2026-11-08'), null);
});
