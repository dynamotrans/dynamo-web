import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huellaCo2, kmDeEtapas } from '../../lib/co2';

test('huella de CO₂: tráiler completo, grupaje por la parte que ocupa y sin km nada', () => {
  // Sevilla–Madrid ~530 km en tráiler completo: 530 × 0,32 L/km × 3,17 kg/L ≈ 538 kg.
  const c = huellaCo2({ km: 530, ml: 13.3, toneladas: 24 })!;
  assert.equal(c.kg, 538);
  assert.equal(c.arboles, 24);
  // Grupaje de 6 m y 5 t: cuenta la mayor de las dos partes (6/13,3 ≈ 45 %).
  const g = huellaCo2({ km: 530, ml: 6, toneladas: 5 })!;
  assert.ok(g.parte > 0.44 && g.parte < 0.46);
  assert.equal(g.kg, Math.round(538.2 * g.parte));
  // El rígido con plataforma gasta menos por km.
  assert.ok(huellaCo2({ km: 530, ml: 8, toneladas: 14, plataforma: true })!.kg < c.kg);
  assert.equal(huellaCo2({ km: 0 }), null);
  assert.equal(huellaCo2({ km: null }), null);
  assert.equal(kmDeEtapas([{ km: 300 }, { km: null }, { km: 120 }]), 420);
});
