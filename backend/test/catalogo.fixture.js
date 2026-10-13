// Copia del esquema de db/seed.sql para probar el motor sin base de datos.
const filas = [
  ['HB_RN', 1, 'Hepatitis B', 0, 0, 29, null, null, 1],
  ['BCG', 1, 'BCG', 0, 0, 364, null, null, 2],
  ['POLIO', 1, 'Polio 1a', 60, 42, null, null, null, 10],
  ['POLIO', 2, 'Polio 2a', 120, 70, null, 28, 60, 11],
  ['POLIO', 3, 'Polio 3a', 180, 98, null, 28, 60, 12],
  ['POLIO', 4, 'R1 (OPV)', 548, 278, null, 180, 368, 13],
  ['POLIO', 5, 'Polio R2', 1461, 458, null, 180, 913, 14],
  ['DPT_HIB_HB', 1, 'Pentavalente 1a', 60, 42, null, null, null, 20],
  ['DPT_HIB_HB', 2, 'Pentavalente 2a', 120, 70, null, 28, 60, 21],
  ['DPT_HIB_HB', 3, 'Pentavalente 3a', 180, 98, null, 28, 60, 22],
  ['DPT_HIB_HB', 4, 'R1 Hexavalente', 548, 278, null, 180, 368, 23],
  ['DPT_HIB_HB', 5, 'DPT R2', 1461, 458, null, 180, 913, 24],
  ['ROTA', 1, 'Rotavirus 1a', 60, 42, 243, null, null, 30],
  ['ROTA', 2, 'Rotavirus 2a', 120, 70, 243, 60, 60, 31],
  ['NEUMO', 1, 'Neumococo 1a', 60, 42, null, null, null, 40],
  ['NEUMO', 2, 'Neumococo 2a', 120, 70, 364, 28, 60, 41],
  ['NEUMO', 3, 'Neumococo R1', 365, 365, null, 56, 245, 42],
  ['SPR', 1, 'SPR 1', 365, 365, null, null, null, 50],
  ['SPR', 2, 'SPR 2', 548, 395, null, 30, 183, 51],
  ['INFLUENZA', 1, 'Influenza 1a', 180, 180, 1094, null, null, 60],
  ['INFLUENZA', 2, 'Influenza 2a', 210, 208, 1094, 28, 30, 61],
  ['VARICELA', 1, 'Varicela 1a', 456, 365, null, null, null, 70],
  ['VARICELA', 2, 'Varicela refuerzo', 1461, 455, null, 90, 1005, 71],
  ['SPR_CERO', 1, 'SPR dosis cero', 180, 180, 364, null, null, 80],
];

const catalogo = filas.map(([serieCodigo, numero, etiqueta, rec, min, max, imin, irec, orden], i) => ({
  id: i + 1, serieCodigo, numero, etiqueta, orden,
  estacional: serieCodigo === 'INFLUENZA',
  informativa: serieCodigo === 'SPR_CERO',
  edadRecomendadaDias: rec, edadMinimaDias: min, edadMaximaDias: max,
  intervaloMinimoDias: imin, intervaloRecomendadoDias: irec,
  dosisPreviaId: null, aplicaNacidosDesde: null, activo: true,
}));
for (const d of catalogo) {
  const p = catalogo.find((x) => x.serieCodigo === d.serieCodigo && x.numero === d.numero - 1);
  if (p) d.dosisPreviaId = p.id;
}

const id = (serie, numero) => catalogo.find((d) => d.serieCodigo === serie && d.numero === numero).id;

const SERIES_PRODUCTO = {
  HEXA: ['DPT_HIB_HB', 'POLIO'], PENTA: ['DPT_HIB_HB'], IPV: ['POLIO'], OPV: ['POLIO'], DPT: ['DPT_HIB_HB'],
  ROTA: ['ROTA'], NEUMO: ['NEUMO'], BCG: ['BCG'], HB_PED: ['HB_RN'], SPR: ['SPR', 'SPR_CERO'], INFL_PED: ['INFLUENZA'],
};

// Hasta qué dosis cubre cada producto (producto_serie.numero_hasta)
const LIMITES = { HEXA: { POLIO: 3, DPT_HIB_HB: 4 }, PENTA: { DPT_HIB_HB: 3 } };

module.exports = { catalogo, id, SERIES_PRODUCTO, LIMITES };
