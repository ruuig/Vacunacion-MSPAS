const router = require('express').Router();
const { pool } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');

// Listas de solo lectura para los formularios (el CRUD completo va en administración)
router.get('/comunidades', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre, c.tipo, c.sector_id, s.nombre AS sector, t.nombre AS territorio
    FROM comunidad c LEFT JOIN sector s ON s.id = c.sector_id LEFT JOIN territorio t ON t.id = s.territorio_id
    WHERE c.activo ORDER BY c.nombre`);
  res.json(rows);
});

router.get('/productos', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.codigo, p.nombre, p.activo, array_agg(s.codigo) AS series, bool_or(s.estacional) AS estacional
    FROM producto p JOIN producto_serie ps ON ps.producto_id = p.id JOIN serie s ON s.id = ps.serie_id
    GROUP BY p.id ORDER BY p.activo DESC, p.nombre`);
  res.json(rows);
});

router.get('/establecimientos', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, tipo, es_local FROM establecimiento ORDER BY es_local DESC, nombre');
  res.json(rows);
});

// Columnas impresas del cuaderno SIGSA 5a (vista de cuaderno de la ficha)
router.get('/columnas', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, p.codigo AS producto_codigo, s.codigo AS serie_codigo
    FROM columna_5a c JOIN esquema_dosis d ON d.id = c.esquema_dosis_id JOIN serie s ON s.id = d.serie_id
    LEFT JOIN producto p ON p.id = c.producto_id ORDER BY c.pagina, c.orden`);
  res.json(rows);
});

// Parámetros que el frontend necesita (temporada y formulación de influenza)
router.get('/parametros', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT clave, valor FROM parametro WHERE clave IN ('influenza_inicio','influenza_fin','influenza_formulacion','edad_egreso_meses')");
  res.json(Object.fromEntries(rows.map((r) => [r.clave, r.valor])));
});

module.exports = router;
