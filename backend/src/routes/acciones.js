// Plan de acción de la sala situacional (análisis del flujo operativo, F7): cada problema con acción, responsable y fecha.
const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir } = require('../middleware/auth');

const CAMPOS = ['fecha', 'comunidad_id', 'indicador_codigo', 'problema', 'accion', 'responsable_id', 'fecha_limite', 'estado',
  'valor_inicial', 'valor_final', 'resultado'];
const limpiar = (b) => Object.fromEntries(CAMPOS.filter((k) => k in b).map((k) => [k, b[k] === '' ? null : b[k]]));

router.get('/', permitir(), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ac.*, c.nombre AS comunidad, u.nombre AS responsable,
           (ac.estado IN ('pendiente','en_curso') AND ac.fecha_limite < CURRENT_DATE) AS vencida
    FROM accion ac LEFT JOIN comunidad c ON c.id = ac.comunidad_id LEFT JOIN usuario u ON u.id = ac.responsable_id
    WHERE ($1::text IS NULL OR ac.estado = $1)
    ORDER BY CASE ac.estado WHEN 'pendiente' THEN 1 WHEN 'en_curso' THEN 2 WHEN 'cumplida' THEN 3 ELSE 4 END, ac.fecha_limite NULLS LAST`,
  [req.query.estado || null]);
  res.json(rows);
});

router.post('/', permitir(), async (req, res) => {
  const d = limpiar(req.body || {});
  if (!d.problema || !d.accion) return res.status(400).json({ error: 'Escriba el problema y la acción acordada.' });
  const a = await transaccion(async (c) => {
    const k = Object.keys(d);
    const { rows: [a] } = await c.query(
      `INSERT INTO accion (${[...k, 'creado_por']}) VALUES (${[...k, 'x'].map((_, i) => '$' + (i + 1))}) RETURNING *`,
      [...Object.values(d), req.usuario.id]);
    await registrarBitacora(c, req, 'crear', 'accion', a.id, null, a);
    return a;
  });
  res.status(201).json(a);
});

router.put('/:id', permitir(), async (req, res) => {
  const d = limpiar(req.body || {});
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nada que actualizar.' });
  const a = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM accion WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!antes) return null;
    const k = Object.keys(d);
    const { rows: [a] } = await c.query(
      `UPDATE accion SET ${k.map((x, i) => `${x} = $${i + 2}`)} WHERE id = $1 RETURNING *`, [req.params.id, ...Object.values(d)]);
    await registrarBitacora(c, req, 'editar', 'accion', a.id, antes, a);
    return a;
  });
  a ? res.json(a) : res.status(404).json({ error: 'Acción no encontrada.' });
});

module.exports = router;
