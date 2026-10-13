const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularEsquema, validarAplicacion, dosisQueCumpleProducto, esRecuperacion, grupoInfluenza, temporadaDe, aDia, aFecha,
} = require('../src/motor/motorEsquema');
const { catalogo, id, SERIES_PRODUCTO, LIMITES } = require('./catalogo.fixture');

const NAC = '2026-01-01';
const mas = (dias, base = NAC) => aFecha(aDia(base) + dias);
const estadoDe = (r, serie, n) => r.dosis.find((d) => d.esquemaDosisId === id(serie, n))?.estado;
const ap = (serie, n, fecha, extra = {}) => ({ esquemaDosisId: id(serie, n), fecha, ...extra });
const ids = (lista) => lista.map((x) => x.esquemaDosisId).sort();
const cumple = (producto, fecha, aplicaciones = [], nac = NAC) =>
  dosisQueCumpleProducto({ seriesProducto: SERIES_PRODUCTO[producto], catalogo, aplicaciones, fechaNacimiento: nac, fecha });

const alNacer = [ap('HB_RN', 1, NAC), ap('BCG', 1, NAC)];
const de2Meses = (f = mas(60)) => [ap('DPT_HIB_HB', 1, f), ap('POLIO', 1, f), ap('ROTA', 1, f), ap('NEUMO', 1, f)];
const de4Meses = (f = mas(120)) => [ap('DPT_HIB_HB', 2, f), ap('POLIO', 2, f), ap('ROTA', 2, f), ap('NEUMO', 2, f)];

test('CP-01 recién nacido: BCG y HepB le tocan; resto sin atraso', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: NAC });
  assert.equal(estadoDe(r, 'BCG', 1), 'le_toca');
  assert.equal(estadoDe(r, 'HB_RN', 1), 'le_toca');
  assert.equal(estadoDe(r, 'DPT_HIB_HB', 1), 'pendiente');
  assert.ok(!r.dosis.some((d) => d.estado === 'atrasada'));
});

test('CP-02 al día: 5 meses con dosis de 2 y 4 meses, sin alertas de atraso', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(150),
    aplicaciones: [...alNacer, ...de2Meses(), ...de4Meses()] });
  assert.ok(['proximo', 'al_dia'].includes(r.estadoNino));
  assert.ok(!r.alertas.some((a) => a.tipo !== 'proxima'));
});

test('CP-03 atraso: 6 meses con solo dosis de 2 meses', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(182), aplicaciones: [...alNacer, ...de2Meses()] });
  assert.equal(estadoDe(r, 'DPT_HIB_HB', 2), 'atrasada');
  assert.equal(estadoDe(r, 'DPT_HIB_HB', 3), 'en_espera');
  assert.equal(r.estadoNino, 'atrasado');
  assert.ok(r.alertas.some((a) => a.tipo === 'atrasada' && a.prioridad === 'media'));
});

test('CP-04 dosis cero: 5 meses sin ninguna dosis', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(150) });
  assert.equal(r.estadoNino, 'dosis_cero');
  assert.ok(r.alertas.some((a) => a.tipo === 'dosis_cero' && a.prioridad === 'alta'));
});

test('CP-05 abandono: 10 meses con dosis de 2 meses y nada más', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(304), aplicaciones: [...alNacer, ...de2Meses()] });
  assert.equal(r.estadoNino, 'abandono');
  assert.ok(r.alertas.some((a) => a.tipo === 'abandono'));
});

test('CP-05b refuerzo vencido es atraso, no abandono: serie primaria completa y sin dosis de 12 meses', () => {
  const primaria = [...alNacer, ...de2Meses(), ...de4Meses(), ap('DPT_HIB_HB', 3, mas(180)), ap('POLIO', 3, mas(180))];
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(365 + 200), aplicaciones: primaria });
  assert.ok(!r.alertas.some((a) => a.tipo === 'abandono'));
  assert.ok(r.alertas.some((a) => a.tipo === 'atrasada'));
  assert.equal(r.estadoNino, 'atrasado');
});

test('CP-06 hexavalente 1a cumple Pentavalente 1a y Polio 1a', () => {
  assert.deepEqual(ids(cumple('HEXA', mas(60))), [id('DPT_HIB_HB', 1), id('POLIO', 1)].sort());
});

test('CP-07 transición: pentavalente + IPV 1a, luego hexavalente cumple las 2a', () => {
  const previas = [ap('DPT_HIB_HB', 1, mas(60)), ap('POLIO', 1, mas(60))];
  assert.deepEqual(ids(cumple('HEXA', mas(120), previas)), [id('DPT_HIB_HB', 2), id('POLIO', 2)].sort());
});

test('CP-08 intervalo: 2a dosis 20 días después de la 1a se rechaza', () => {
  const v = validarAplicacion({ fechaNacimiento: NAC, catalogo, aplicaciones: [ap('DPT_HIB_HB', 1, mas(60))],
    esquemaDosisId: id('DPT_HIB_HB', 2), fecha: mas(80) });
  assert.equal(v.ok, false);
  assert.match(v.error, /intervalo mínimo/);
});

test('CP-09 edad máxima: rotavirus 1a después de los 8 meses se rechaza y queda no aplicable', () => {
  const v = validarAplicacion({ fechaNacimiento: NAC, catalogo, esquemaDosisId: id('ROTA', 1), fecha: mas(250) });
  assert.equal(v.ok, false);
  assert.match(v.error, /edad máxima/);
  assert.equal(estadoDe(calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(250) }), 'ROTA', 1), 'no_aplicable');
});

test('CP-10 doble dosis: la misma dosis registrada dos veces se rechaza', () => {
  const v = validarAplicacion({ fechaNacimiento: NAC, catalogo, aplicaciones: [ap('BCG', 1, NAC)], esquemaDosisId: id('BCG', 1), fecha: mas(5) });
  assert.equal(v.ok, false);
  assert.match(v.error, /ya está registrada/);
});

test('CP-11 jornada futura: a 20 días aparecen dosis que hoy aún no tocan', () => {
  const rHoy = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(45), aplicaciones: alNacer });
  const rJor = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(65), aplicaciones: alNacer });
  assert.equal(estadoDe(rHoy, 'DPT_HIB_HB', 1), 'pendiente');
  assert.equal(estadoDe(rJor, 'DPT_HIB_HB', 1), 'le_toca');
  assert.ok(rJor.leTocaHoy.some((d) => d.esquemaDosisId === id('DPT_HIB_HB', 1)));
});

test('Nunca reiniciar y esquema acelerado: 2a tardía, la 3a va un mes después', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(400),
    aplicaciones: [ap('DPT_HIB_HB', 1, mas(60)), ap('DPT_HIB_HB', 2, mas(300))] });
  assert.equal(r.dosis.find((d) => d.esquemaDosisId === id('DPT_HIB_HB', 3)).fechaProgramada, mas(328));
});

const prog = (r, serie, n) => r.dosis.find((d) => d.esquemaDosisId === id(serie, n))?.fechaProgramada;

test('Acelerado: niño de 11 meses sin vacunas recibe la 1a hoy y luego una cada mes', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(331), aplicaciones: [ap('DPT_HIB_HB', 1, mas(330))] });
  assert.equal(prog(r, 'DPT_HIB_HB', 2), mas(358));
});

test('Acelerado: R1 seis meses después de la última hexa y R2 seis meses después del R1', () => {
  const tarde = [ap('DPT_HIB_HB', 1, mas(330)), ap('DPT_HIB_HB', 2, mas(358)), ap('DPT_HIB_HB', 3, mas(386))];
  let r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(400), aplicaciones: tarde });
  assert.equal(prog(r, 'DPT_HIB_HB', 4), mas(566));
  r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(700), aplicaciones: [...tarde, ap('DPT_HIB_HB', 4, mas(566))] });
  assert.equal(prog(r, 'DPT_HIB_HB', 5), mas(746));
});

test('A tiempo: el R1 sigue a los 18 meses y el R2 a los 4 años', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(200),
    aplicaciones: [ap('DPT_HIB_HB', 1, mas(60)), ap('DPT_HIB_HB', 2, mas(120)), ap('DPT_HIB_HB', 3, mas(180))] });
  assert.equal(prog(r, 'DPT_HIB_HB', 4), mas(548));
});

test('Hepatitis B solo antes del mes: después ya no aplica ni genera atraso', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(90) });
  assert.equal(estadoDe(r, 'HB_RN', 1), 'no_aplicable');
});

test('Neumococo: si la 1a fue a los 11 meses, la 2a se pierde y el refuerzo sigue desde la 1a', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(400), aplicaciones: [ap('NEUMO', 1, mas(340))] });
  assert.equal(estadoDe(r, 'NEUMO', 2), 'no_aplicable');
  assert.notEqual(estadoDe(r, 'NEUMO', 3), 'en_espera');
});

test('Rotavirus: la 2a va dos meses después de la 1a', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(130), aplicaciones: [ap('ROTA', 1, mas(120))] });
  assert.equal(prog(r, 'ROTA', 2), mas(180));
});

test('La hexavalente no cumple el R1 de polio (ese es OPV); sí el R1 hexavalente', () => {
  const primaria = [1, 2, 3].flatMap((n) => [ap('DPT_HIB_HB', n, mas(60 * n)), ap('POLIO', n, mas(60 * n))]);
  const r = dosisQueCumpleProducto({ seriesProducto: SERIES_PRODUCTO.HEXA, limites: LIMITES.HEXA, catalogo,
    aplicaciones: primaria, fechaNacimiento: NAC, fecha: mas(548) });
  assert.deepEqual(ids(r), [id('DPT_HIB_HB', 4)]);
  assert.deepEqual(ids(cumple('OPV', mas(548), primaria)), [id('POLIO', 4)]);
});

test('Anular una dosis la deja de contar', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: NAC, aplicaciones: [{ ...ap('BCG', 1, NAC), anulada: true }] });
  assert.equal(estadoDe(r, 'BCG', 1), 'le_toca');
});

test('Próxima cita incluye las vacunas de esa fecha', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(10), aplicaciones: alNacer });
  assert.equal(r.proximaCita, mas(60));
  assert.ok(r.proximaCitaVacunas.includes('Pentavalente 1a') && r.proximaCitaVacunas.includes('Rotavirus 1a'));
});

// ---- Recuperación (página 5 del 5a) ----
test('Recuperación: Pentavalente 1a a los 13 meses sí; a los 6 meses no; R2 nunca', () => {
  const penta1 = catalogo.find((d) => d.id === id('DPT_HIB_HB', 1));
  assert.equal(esRecuperacion(penta1, NAC, '2027-02-01'), true);
  assert.equal(esRecuperacion(penta1, NAC, '2026-07-01'), false);
  const spr1 = catalogo.find((d) => d.id === id('SPR', 1));
  assert.equal(esRecuperacion(spr1, NAC, '2027-06-01'), false);
  assert.equal(esRecuperacion(spr1, NAC, '2028-02-01'), true);
  const r2 = catalogo.find((d) => d.id === id('DPT_HIB_HB', 5));
  assert.equal(esRecuperacion(r2, NAC, '2032-06-01'), false);
});

// ---- Influenza ----
const TEMPORADA = { influenza_inicio: '2026-10-15', influenza_fin: '2027-02-15' };

test('Influenza: grupo de edad y temporada', () => {
  assert.equal(grupoInfluenza(NAC, '2026-08-01'), '6_11');
  assert.equal(grupoInfluenza(NAC, '2027-03-01'), '12_23');
  assert.equal(grupoInfluenza(NAC, '2026-05-01'), null);
  assert.equal(temporadaDe('2026-11-01'), 2026);
  assert.equal(temporadaDe('2027-02-01'), 2026);
});

test('Influenza sin antecedente: 1a en temporada y 2a al mes', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: '2026-10-20', params: TEMPORADA });
  assert.equal(estadoDe(r, 'INFLUENZA', 1), 'le_toca');
  assert.equal(estadoDe(r, 'INFLUENZA', 2), 'en_espera');
  const apps = [ap('INFLUENZA', 1, '2026-10-20')];
  const r2 = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: '2026-11-19', params: TEMPORADA, aplicaciones: apps });
  assert.equal(estadoDe(r2, 'INFLUENZA', 2), 'le_toca');
  assert.deepEqual(ids(cumple('INFL_PED', '2026-11-19', apps)), [id('INFLUENZA', 2)]);
});

test('Influenza con antecedente: solo 1 dosis en la temporada siguiente', () => {
  const apps = [ap('INFLUENZA', 1, '2026-10-20'), ap('INFLUENZA', 2, '2026-11-20')];
  const params = { influenza_inicio: '2027-10-15', influenza_fin: '2028-02-15' };
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: '2027-10-20', params, aplicaciones: apps });
  assert.equal(estadoDe(r, 'INFLUENZA', 1), 'le_toca');
  assert.equal(estadoDe(r, 'INFLUENZA', 2), undefined);
  const nueva = [...apps, ap('INFLUENZA', 1, '2027-10-20')];
  assert.deepEqual(cumple('INFL_PED', '2027-11-25', nueva), []);
  const v = validarAplicacion({ fechaNacimiento: NAC, catalogo, aplicaciones: nueva, esquemaDosisId: id('INFLUENZA', 2), fecha: '2027-11-25' });
  assert.equal(v.ok, false);
});

test('Influenza fuera de temporada no genera alertas ni atraso', () => {
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: '2026-08-01', params: TEMPORADA,
    aplicaciones: [...alNacer, ...de2Meses(), ...de4Meses(), ap('DPT_HIB_HB', 3, mas(180)), ap('POLIO', 3, mas(180))] });
  assert.equal(estadoDe(r, 'INFLUENZA', 1), undefined);
  assert.ok(!r.alertas.some((a) => a.esquemaDosisId === id('INFLUENZA', 1)));
});

// ---- SPR dosis cero ----
test('SPR antes de los 12 meses cae en dosis cero y no reemplaza SPR 1', () => {
  assert.deepEqual(ids(cumple('SPR', mas(250))), [id('SPR_CERO', 1)]);
  const apps = [ap('SPR_CERO', 1, mas(250))];
  assert.deepEqual(ids(cumple('SPR', mas(370), apps)), [id('SPR', 1)]);
  const r = calcularEsquema({ fechaNacimiento: NAC, catalogo, fechaRef: mas(300), aplicaciones: apps });
  assert.equal(estadoDe(r, 'SPR_CERO', 1), 'aplicada');
  assert.ok(!r.alertas.some((a) => a.esquemaDosisId === id('SPR_CERO', 1)));
});
