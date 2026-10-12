// Reglas de los indicadores del tablero (análisis del flujo operativo, sección 7.5)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/indicadores/reglas');

test('CP-14 deserción negativa: más terceras dosis que primeras', () => {
  assert.equal(R.desercion(2, 3), -50);
  assert.equal(R.desercion(0, 3), null);
  assert.equal(R.desercion(20, 18), 10);
});

test('CP-15 categoría RED: buen acceso y mala utilización = "no regresan" (2)', () => {
  assert.equal(R.categoriaRED(90, 15), 2);
  assert.equal(R.ESTRATEGIA[2].titulo, 'Llegan, pero no regresan');
  assert.equal(R.categoriaRED(90, 5), 1);
  assert.equal(R.categoriaRED(60, 5), 3);
  assert.equal(R.categoriaRED(60, 20), 4);
  assert.equal(R.categoriaRED(null, 5), null);
});

test('los umbrales vienen de los parámetros', () => {
  assert.equal(R.categoriaRED(90, 7, { umbral_desercion: '5' }), 2);
  assert.equal(R.categoriaRED(75, 2, { umbral_acceso: '70' }), 1);
});

test('CP-16 prioridad OPS-Guatemala: cobertura 70 % y deserción 12 % = prioridad 1', () => {
  assert.equal(R.prioridadRiesgo(70, 12), 1);
  assert.equal(R.prioridadRiesgo(70, 5), 2);
  assert.equal(R.prioridadRiesgo(88, 12), 2);
  assert.equal(R.prioridadRiesgo(88, 5), 3);
  assert.equal(R.prioridadRiesgo(97, 12), 3);
  assert.equal(R.prioridadRiesgo(97, 5), 0);
  assert.equal(R.prioridadRiesgo(130, 5), 2, 'más de 100 % es inaceptable: revisar el dato');
  assert.equal(R.prioridadRiesgo(97, -12), 3, 'deserción negativa fuera de rango tampoco se acepta');
});

test('CP-17 más de 100 %: rango "revisar dato" y lectura de revisión', () => {
  assert.equal(R.pct(7, 5), 140);
  assert.equal(R.rangoCobertura(140), 'mayor_100');
  assert.equal(R.lecturaMonitoreo({ nombre: 'Penta 3', valor: 140, mes: 6 }).estado, 'revisar');
});

test('rangos de cobertura de la guía guatemalteca', () => {
  assert.equal(R.rangoCobertura(null), 'sin_meta');
  assert.equal(R.rangoCobertura(30), 'menor_50');
  assert.equal(R.rangoCobertura(50), '50_79');
  assert.equal(R.rangoCobertura(80), '80_94');
  assert.equal(R.rangoCobertura(95), '95_100');
  assert.equal(R.rangoCobertura(100), '95_100');
});

test('CP-21 meta prorrateada: enero a marzo de un año no bisiesto es 90/365 de la meta', () => {
  assert.equal(R.metaPeriodo(120, '2026-01-01', '2026-03-31'), 29.6);
  assert.equal(R.metaPeriodo(120, '2026-01-01', '2026-12-31'), 120);
  assert.equal(R.metaPeriodo(null, '2026-01-01', '2026-03-31'), null);
});

test('monitoreo mensual: ideal de 8,3 % por mes y lectura según la distancia al ideal', () => {
  assert.equal(R.idealAlMes(6), 50);
  assert.equal(R.idealAlMes(12), 100);
  assert.equal(R.lecturaMonitoreo({ nombre: 'P3', valor: 52, mes: 6 }).estado, 'ok');
  assert.equal(R.lecturaMonitoreo({ nombre: 'P3', valor: 45, mes: 6 }).estado, 'atencion');
  assert.equal(R.lecturaMonitoreo({ nombre: 'P3', valor: 30, mes: 6 }).estado, 'critico');
  assert.match(R.lecturaMonitoreo({ nombre: 'P3', valor: 45, mes: 6 }).texto, /Proyección a diciembre: 90 %/);
});

test('CP-18 y CP-19 motivos: la contraindicación verdadera no es oportunidad perdida', () => {
  assert.equal(R.CAUSA_MOTIVO.contraindicacion, 'valida');
  assert.equal(R.CAUSA_MOTIVO.falsa_contraindicacion, 'personal');
  assert.equal(R.CAUSA_MOTIVO.desabastecimiento, 'servicio');
  assert.equal(R.CAUSA_MOTIVO.rechazo, 'familia');
});

test('mediana de días hasta vacunar', () => {
  assert.equal(R.mediana([5, 1, 3]), 3);
  assert.equal(R.mediana([4, 1, 3, 2]), 2.5);
  assert.equal(R.mediana([]), null);
});

test('lectura por comunidad sin meta o con categoría', () => {
  assert.match(R.lecturaComunidad({ nombre: 'Tempiscón', categoria: null }), /sin población meta/);
  assert.match(R.lecturaComunidad({ nombre: 'Chiquirín', categoria: 2 }), /no regresan → reforzar el seguimiento/);
});
