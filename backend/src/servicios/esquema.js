// Puente entre la base de datos y el motor puro.
const { calcularEsquema } = require('../motor/motorEsquema');

const { hoy } = require('../fecha');

async function cargarCatalogo(db) {
  const { rows } = await db.query(`
    SELECT d.id, s.codigo AS "serieCodigo", s.estacional, s.informativa, d.numero, d.etiqueta, d.orden,
           d.edad_recomendada_dias AS "edadRecomendadaDias", d.edad_minima_dias AS "edadMinimaDias",
           d.edad_maxima_dias AS "edadMaximaDias", d.intervalo_minimo_dias AS "intervaloMinimoDias",
           d.intervalo_recomendado_dias AS "intervaloRecomendadoDias", d.dosis_previa_id AS "dosisPreviaId",
           d.aplica_nacidos_desde AS "aplicaNacidosDesde", d.activo
    FROM esquema_dosis d JOIN serie s ON s.id = d.serie_id WHERE d.activo`);
  return rows;
}

async function cargarParametros(db) {
  const { rows } = await db.query('SELECT clave, valor FROM parametro');
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor !== '' && !isNaN(r.valor) ? Number(r.valor) : r.valor]));
}

async function cargarAplicaciones(db, ninoId) {
  const { rows } = await db.query(`
    SELECT ad.esquema_dosis_id AS "esquemaDosisId", a.fecha_aplicacion AS fecha, ad.temporada
    FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
    WHERE ad.nino_id = $1 AND NOT ad.anulada`, [ninoId]);
  return rows;
}

/** Calcula el esquema de un niño a una fecha. ctx permite reutilizar catálogo y parámetros. */
async function calcularNino(db, nino, fechaRef, ctx = {}) {
  const catalogo = ctx.catalogo || (await cargarCatalogo(db));
  const params = ctx.params || (await cargarParametros(db));
  const aplicaciones = await cargarAplicaciones(db, nino.id);
  return calcularEsquema({ fechaNacimiento: nino.fecha_nacimiento, aplicaciones, catalogo, fechaRef, params });
}

function cumpleEgreso(nino, fechaRef, params) {
  const egreso = new Date(nino.fecha_nacimiento + 'T00:00:00Z');
  egreso.setUTCMonth(egreso.getUTCMonth() + (params.edad_egreso_meses || 84));
  return new Date(fechaRef + 'T00:00:00Z') >= egreso;
}

/**
 * Sincroniza las alertas calculadas con la tabla alerta: crea las nuevas (sin duplicar abiertas)
 * y resuelve las que ya no aplican. Las alertas de inasistencia no las toca el motor.
 */
async function sincronizarAlertas(db, nino, ctx = {}) {
  const params = ctx.params || (await cargarParametros(db));
  if (nino.estado !== 'activo' || cumpleEgreso(nino, hoy(), params)) {
    await db.query(`UPDATE alerta SET estado='cerrada', fecha_cierre=CURRENT_DATE, motivo_cierre='Niño inactivo o egresado'
                    WHERE nino_id=$1 AND estado IN ('abierta','en_seguimiento')`, [nino.id]);
    return { estadoNino: 'inactivo', proximaCita: null, proximaCitaVacunas: [] };
  }

  const abiertas = (await db.query(
    `SELECT id, esquema_dosis_id, tipo FROM alerta
     WHERE nino_id = $1 AND estado IN ('abierta','en_seguimiento') AND tipo <> 'inasistencia'`, [nino.id])).rows;
  const r = await calcularNino(db, nino, hoy(), { ...ctx, params });
  const clave = (a) => `${a.esquemaDosisId ?? a.esquema_dosis_id}|${a.tipo}`;
  const nuevas = new Set(r.alertas.map(clave));
  const aplicadas = new Set(r.dosis.filter((d) => d.estado === 'aplicada').map((d) => d.esquemaDosisId));

  for (const a of abiertas) {
    if (!nuevas.has(clave(a))) {
      const motivo = aplicadas.has(a.esquema_dosis_id) ? 'Dosis aplicada' : 'Recalculada por el motor';
      await db.query(`UPDATE alerta SET estado='resuelta', fecha_cierre=CURRENT_DATE, motivo_cierre=$2 WHERE id=$1`, [a.id, motivo]);
    }
  }
  // La inasistencia (jornada o cita) se resuelve cuando el niño recibe una dosis después de generada
  await db.query(
    `UPDATE alerta al SET estado='resuelta', fecha_cierre=CURRENT_DATE, motivo_cierre='Dosis aplicada después de la inasistencia'
     WHERE al.nino_id = $1 AND al.tipo = 'inasistencia' AND al.estado IN ('abierta','en_seguimiento')
       AND EXISTS (SELECT 1 FROM aplicacion a WHERE a.nino_id = $1 AND NOT a.anulada AND a.fecha_aplicacion >= al.fecha_generada)`,
    [nino.id]);
  for (const a of r.alertas) {
    await db.query(
      'INSERT INTO alerta (nino_id, esquema_dosis_id, tipo, prioridad) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [nino.id, a.esquemaDosisId, a.tipo, a.prioridad]);
  }
  return r;
}

/** Proceso diario: marca egresados (7 años) y recalcula a todos los niños activos. */
async function recalcularTodos(pool) {
  const params = await cargarParametros(pool);
  await pool.query(
    `UPDATE nino SET estado = 'egresado' WHERE estado = 'activo'
     AND fecha_nacimiento + make_interval(months => $1::int) <= CURRENT_DATE`, [params.edad_egreso_meses || 84]);
  const catalogo = await cargarCatalogo(pool);
  const { rows } = await pool.query("SELECT id, fecha_nacimiento, estado FROM nino WHERE estado = 'activo'");
  for (const nino of rows) await sincronizarAlertas(pool, nino, { catalogo, params });
  return rows.length;
}

// ---- Cuaderno SIGSA 5a ----

async function cargarColumnas(db) {
  const { rows } = await db.query('SELECT * FROM columna_5a ORDER BY pagina, orden');
  return rows;
}

/**
 * Columna del cuaderno donde se anota una dosis aplicada. Prioriza: influenza por grupo y formulación;
 * página de recuperación si la dosis lo es; columna exclusiva del producto (fIPV) o la general.
 */
function ubicarColumna(columnas, { esquema_dosis_id, producto_id, es_recuperacion, grupo_influenza, formulacion }) {
  let c = columnas.filter((x) => x.esquema_dosis_id === esquema_dosis_id);
  if (c.some((x) => x.grupo_influenza)) c = c.filter((x) => x.grupo_influenza === grupo_influenza && x.formulacion === formulacion);
  const porPagina = c.filter((x) => x.es_recuperacion === Boolean(es_recuperacion));
  if (porPagina.length) c = porPagina;
  return c.find((x) => x.producto_id === producto_id) || c.find((x) => x.producto_id == null) || c[0] || null;
}

const NOMBRE_PAGINA = { menor_1: 'Menor de 1 año', uno_a_7: '1 año a menor de 7', recuperacion: 'Recuperación de 1 año a menor de 7' };

/** Texto "dónde anotar" para copiar al cuaderno: "Cuaderno 3/2026, fila 17, página Menor de 1 año, columnas ..." */
function dondeAnotar(cuaderno, fila, columnasUsadas) {
  const cols = columnasUsadas.filter(Boolean);
  const paginas = [...new Set(cols.map((c) => NOMBRE_PAGINA[c.pagina]))].join(' y ');
  const nombres = cols.map((c) => (c.grupo === c.etiqueta || c.etiqueta.startsWith(c.grupo) ? c.etiqueta : `${c.grupo} ${c.etiqueta}`));
  const ubicacion = cuaderno ? `Cuaderno ${cuaderno.numero}/${cuaderno.anio}, fila ${fila}` : 'Sin cuaderno asignado';
  return { texto: `${ubicacion}, página ${paginas}, ${nombres.length > 1 ? 'columnas' : 'columna'} ${nombres.join(' y ')}`,
    cuaderno: cuaderno && { numero: cuaderno.numero, anio: cuaderno.anio }, fila, paginas, columnas: nombres };
}

module.exports = {
  cargarCatalogo, cargarParametros, cargarAplicaciones, calcularNino, sincronizarAlertas, recalcularTodos,
  cargarColumnas, ubicarColumna, dondeAnotar, cumpleEgreso,
};
