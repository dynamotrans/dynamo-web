// Horarios de los sitios: el mismo resumen que escribe la base de datos (horario_texto()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenHorario, validarHorario, enTemporada } from '../../lib/horarios';

const t = (abre: string, cierra: string) => ({ abre, cierra });

test('resumen «Lunes a jueves … · viernes …»', () => {
  assert.equal(resumenHorario([
    { dias: [1, 2, 3, 4], tramos: [t('08:00', '14:00'), t('15:00', '17:30')] },
    { dias: [5], tramos: [t('08:00', '14:00')] },
  ]), 'Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00');
});

test('dos días seguidos: «Lunes y martes»', () => {
  assert.equal(resumenHorario([{ dias: [1, 2], tramos: [t('07:00', '15:00')] }]), 'Lunes y martes 7:00–15:00');
});

test('tramos que se pisan o cierran antes de abrir no valen', () => {
  assert.ok(validarHorario([{ dias: [1], tramos: [t('10:00', '09:00')] }]));
  assert.ok(validarHorario([{ dias: [1], tramos: [t('08:00', '14:00'), t('13:00', '16:00')] }]));
  assert.equal(validarHorario([{ dias: [1, 2, 3, 4, 5], tramos: [t('08:00', '14:00')] }]), null);
});

test('temporada de verano, también cruzando el año', () => {
  assert.equal(enTemporada('2026-07-01', '05-25', '09-15'), true);
  assert.equal(enTemporada('2026-10-01', '05-25', '09-15'), false);
  assert.equal(enTemporada('2026-12-30', '12-22', '01-06'), true);
});
