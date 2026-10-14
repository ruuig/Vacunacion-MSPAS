// Reglas de suplementación del servicio (vitamina A, micronutrientes y desparasitante hasta los 6 años)
const { test } = require('node:test');
const assert = require('node:assert');
const { calcularSuplementos } = require('../src/motor/suplementos');

let id = 0;
const d = (insumo, grupo, numero, desde, hasta, intervalo, orden) => ({ id: ++id, insumo, grupo, numero, etiqueta: `${insumo} ${grupo} ${numero}`, edad_desde_dias: desde, edad_hasta_dias: hasta, intervalo_dias: intervalo, orden });
const CAT = [
  d('VIT_A', '6_11', 1, 180, 364, null, 10),
  d('VIT_A', '12_23', 1, 365, 729, 180, 20), d('VIT_A', '12_23', 2, 365, 729, 180, 21),
  d('DESPARASITANTE', '12_23', 1, 365, 729, null, 24),
  d('DESPARASITANTE', '60_71', 1, 1826, 2190, 180, 60),
];
const nac = '2025-01-01';
const est = (entregas, fechaRef) => Object.fromEntries(calcularSuplementos({ fechaNacimiento: nac, catalogo: CAT, entregas, fechaRef }).map((x) => [x.id, x]));

test('Vitamina A se puede dar desde los 6 meses, sin esperar al año', () => {
  assert.equal(est([], '2025-07-05')[1].estado, 'le_toca');
});

test('la siguiente Vitamina A: al año si la primera fue a los 6 meses', () => {
  const r = est([{ suplemento_dosis_id: 1, fecha: '2025-07-01' }], '2026-01-02');
  assert.equal(r[2].estado, 'le_toca');
  assert.equal(r[2].programada, '2026-01-01');
});

test('la siguiente Vitamina A espera 6 meses si la primera fue tarde', () => {
  const r = est([{ suplemento_dosis_id: 1, fecha: '2025-11-01' }], '2026-01-02');
  assert.equal(r[2].programada, '2026-04-30');
  assert.notEqual(r[2].estado, 'le_toca');
});

test('si no se dio a los 6-11 meses, la del año no queda bloqueada', () => {
  assert.equal(est([], '2026-01-05')[2].estado, 'le_toca');
});

test('desparasitante a los 5 años', () => {
  assert.equal(est([], '2030-02-01')[5].estado, 'le_toca');
});
