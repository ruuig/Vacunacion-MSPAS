// Tablero para la toma de decisiones (análisis del flujo operativo, sección 5). Solo lectura.
const router = require('express').Router();
const { pool } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');
const esq = require('../servicios/esquema');
const Q = require('../indicadores/consultas');
const R = require('../indicadores/reglas');

const { hoy } = require('../fecha');

/** Período a partir de la consulta: desde/hasta, o año completo (hasta hoy si es el año en curso). */
function periodo(q) {
  const anio = Number(q.anio) || new Date().getFullYear();
  let desde = q.desde || `${anio}-01-01`;
  let hasta = q.hasta || [`${anio}-12-31`, hoy()].sort()[0];
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  return { anio: Number(desde.slice(0, 4)), desde, hasta, comunidad: q.comunidad ? Number(q.comunidad) : null };
}

/**
 * Período y lugar según quién consulta: la Dirección ve el municipio; la enfermera encargada, solo su sector
 * (si elige una comunidad, debe ser de su sector; si no, se toma todo su sector).
 */
async function periodoDe(req) {
  const p = periodo(req.query);
  const alcance = await require('../territorio').alcanceDe(pool, req.usuario);
  if (!alcance) return { ...p, alcance: null };
  const comunidad = p.comunidad && alcance.includes(p.comunidad) ? p.comunidad : null;
  return { ...p, alcance, comunidad: comunidad || alcance, unaComunidad: comunidad };
}

// Tablero: la Dirección (todo el municipio) y la enfermera encargada (su sector). El personal no lo usa.
const VER = permitir('enfermera');
const GESTION = permitir('enfermera');
const SOLO_DIRECCION = permitir();

// Fila de indicadores principales y lecturas del mes
router.get('/resumen', VER, async (req, res) => {
  const p = await periodoDe(req);
  const params = await esq.cargarParametros(pool);
  const { comunidades, total } = await Q.coberturasPorComunidad(pool, p, params);
  const una = p.alcance ? p.unaComunidad : p.comunidad;
  const base = una ? comunidades.find((c) => c.id === una) || total : total;
  const mon = await Q.monitoreoMensual(pool, { anio: p.anio, comunidad: p.comunidad });
  const ideal = mon.mes_actual ? R.idealAlMes(mon.mes_actual) : null;
  // Cambio contra el mes anterior desde la foto mensual
  // La foto mensual es del municipio o de una comunidad: para un sector completo no hay comparación
  const anterior = mon.mes_actual > 1 && !Array.isArray(p.comunidad) ? await Q.tendencia(pool, { codigos: ['N1', 'N2'], anio: p.anio, comunidad: p.comunidad }) : [];
  const fotoPrev = (codigo) => anterior.filter((r) => r.codigo === codigo && r.mes === mon.mes_actual - 1)[0]?.valor ?? null;

  res.json({
    periodo: p, ideal_al_mes: ideal, mes_actual: mon.mes_actual,
    kpis: {
      C1: { valor: base.C1, numerador: base.p1, denominador: base.meta_periodo_menor_1 },
      C2: { valor: base.C2, numerador: base.p3, denominador: base.meta_periodo_menor_1 },
      C3: { valor: base.C3, numerador: base.spr1, denominador: base.meta_periodo_1_anio },
      D1: { valor: base.D1, numerador: base.d_elegibles - base.d_completaron, denominador: base.d_elegibles },
      N1: { valor: base.dosis_cero, anterior: fotoPrev('N1') },
      N2: { valor: base.N2, numerador: base.al_dia, denominador: base.activos, anterior: fotoPrev('N2') },
      por_contactar: { valor: base.por_contactar },
      activos: { valor: base.activos },
      C8: { valor: total.C8, numerador: total.comunidades_en_meta, denominador: comunidades.filter((c) => c.C2 != null).length },
    },
    umbrales: R.umbrales(params),
    lecturas: mon.lecturas,
    proyeccion_p3: mon.proyeccion_p3,
    // Avance del año contra la meta anual: es lo que muestra la gráfica y lo que se compara con el ritmo ideal
    avance: mon.mes_actual ? { p1: mon.meses[mon.mes_actual - 1].p1, p3: mon.meses[mon.mes_actual - 1].p3, spr1: mon.meses[mon.mes_actual - 1].spr1 } : null,
    faltan_p3_para_meta: mon.faltan_p3_para_meta,
    sin_vacunar: comunidades.filter((c) => c.sin_vacunar).map((c) => ({ id: c.id, nombre: c.nombre, sin_vacunar: c.sin_vacunar, meta: c.meta_periodo_menor_1 }))
      .sort((a, b) => b.sin_vacunar - a.sin_vacunar),
  });
});

router.get('/monitoreo', VER, async (req, res) => {
  const p = await periodoDe(req);
  res.json(await Q.monitoreoMensual(pool, { anio: p.anio, comunidad: p.comunidad }));
});

// Semáforo, clasificación RED y prioridad por comunidad (sin nombres de niños)
router.get('/territorio', VER, async (req, res) => {
  const p = await periodoDe(req);
  const params = await esq.cargarParametros(pool);
  const r = await Q.coberturasPorComunidad(pool, p, params);
  const prioritarias = r.comunidades.filter((c) => c.prioridad).sort((a, b) => a.prioridad - b.prioridad || (b.sin_vacunar ?? 0) - (a.sin_vacunar ?? 0));
  res.json({ ...r, prioritarias, umbrales: R.umbrales(params), periodo: p });
});

router.get('/seguimiento', GESTION, async (req, res) => {
  const p = await periodoDe(req);
  res.json(await Q.seguimiento(pool, p, await esq.cargarParametros(pool)));
});

router.get('/servicio', GESTION, async (req, res) => {
  const p = await periodoDe(req);
  const params = await esq.cargarParametros(pool);
  res.json({ ...(await Q.oportunidadesPerdidas(pool, p)), ...(await Q.oportunidad(pool, p, params)) });
});

router.get('/jornadas', VER, async (req, res) => {
  res.json(await Q.jornadas(pool, await periodoDe(req)));
});

router.get('/calidad', SOLO_DIRECCION, async (req, res) => {
  const p = periodo(req.query);
  res.json(await Q.calidad(pool, await esq.cargarParametros(pool), p));
});

// Tendencia mensual desde las fotos (N1, N2, N3, C1-C3, D1)
router.get('/tendencia', VER, async (req, res) => {
  const p = await periodoDe(req);
  if (Array.isArray(p.comunidad)) return res.json([]);
  const codigos = String(req.query.codigos || 'N1,N3_abandono,N3_atrasado').split(',');
  res.json(await Q.tendencia(pool, { codigos, anio: p.anio, comunidad: p.comunidad }));
});

module.exports = router;
