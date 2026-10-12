const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');

const ORDEN_PRIORIDAD = "CASE a.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END";

// RF-14 bandeja filtrable por tipo, prioridad y comunidad
router.get('/', permitir(...TODOS), async (req, res) => {
  const { tipo, comunidad, estado, prioridad } = req.query;
  const { rows } = await pool.query(`
    SELECT a.*, d.etiqueta, n.nombre_completo, n.fecha_nacimiento, n.fila, c.nombre AS comunidad, s.nombre AS sector,
           cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio,
           r.nombre_completo AS responsable, r.telefono, r.idioma_preferente
    FROM alerta a JOIN nino n ON n.id = a.nino_id JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN sector s ON s.id = c.sector_id LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN esquema_dosis d ON d.id = a.esquema_dosis_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE a.estado = ANY($1) AND ($2::text IS NULL OR a.tipo = $2) AND ($3::int IS NULL OR n.comunidad_id = $3)
      AND ($4::text IS NULL OR a.prioridad = $4)
    ORDER BY ${ORDEN_PRIORIDAD}, a.fecha_generada LIMIT 500`,
    [estado ? [estado] : ['abierta', 'en_seguimiento'], tipo || null, comunidad || null, prioridad || null]);
  res.json(rows);
});

// RF-16 contador de alertas abiertas para el menú
router.get('/resumen', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT tipo, count(*)::int AS total FROM alerta WHERE estado IN ('abierta','en_seguimiento') GROUP BY tipo");
  res.json(rows);
});

router.get('/:id/seguimientos', permitir(...TODOS), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.nombre AS usuario FROM seguimiento s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.alerta_id = $1 ORDER BY s.fecha`, [req.params.id]);
  res.json(rows);
});

// RF-15 registrar intento de seguimiento
router.post('/:id/seguimientos', permitir(...OPERATIVOS), async (req, res) => {
  const { medio, resultado, fecha_compromiso, nota, fecha } = req.body || {};
  const s = await transaccion(async (c) => {
    const { rows: [a] } = await c.query(
      "SELECT * FROM alerta WHERE id = $1 AND estado IN ('abierta','en_seguimiento') FOR UPDATE", [req.params.id]);
    if (!a) return null;
    const { rows: [s] } = await c.query(
      `INSERT INTO seguimiento (alerta_id, nino_id, fecha, medio, resultado, fecha_compromiso, nota, usuario_id)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8) RETURNING *`,
      [a.id, a.nino_id, fecha || null, medio, resultado, fecha_compromiso || null, nota || null, req.usuario.id]);
    await c.query("UPDATE alerta SET estado = 'en_seguimiento' WHERE id = $1 AND estado = 'abierta'", [a.id]);
    await registrarBitacora(c, req, 'crear', 'seguimiento', s.id, null, s);
    return s;
  });
  s ? res.status(201).json(s) : res.status(404).json({ error: 'Alerta no encontrada o ya cerrada.' });
});

// RF-15 cerrar sin dosis con motivo (solo enfermera)
router.post('/:id/cerrar', permitir('enfermera'), async (req, res) => {
  const { motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Indique el motivo de cierre.' });
  const a = await transaccion(async (c) => {
    const { rows: [a] } = await c.query(
      `UPDATE alerta SET estado = 'cerrada', fecha_cierre = CURRENT_DATE, motivo_cierre = $2, cerrada_por = $3
       WHERE id = $1 AND estado IN ('abierta','en_seguimiento') RETURNING *`, [req.params.id, motivo, req.usuario.id]);
    if (a) await registrarBitacora(c, req, 'cerrar', 'alerta', a.id, null, a);
    return a;
  });
  a ? res.json(a) : res.status(404).json({ error: 'Alerta no encontrada o ya cerrada.' });
});

module.exports = router;
