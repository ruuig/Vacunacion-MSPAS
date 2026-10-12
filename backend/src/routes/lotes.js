const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');

const GESTION = ['enfermera', 'administrador'];
const { hoy } = require('../fecha');

/** Estado de un lote a una fecha: vencido, por vencer (dentro del aviso) o vigente. */
const ESTADO_SQL = `CASE
    WHEN l.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
    WHEN l.fecha_vencimiento <= CURRENT_DATE + (SELECT valor::int FROM parametro WHERE clave = 'dias_aviso_vencimiento') THEN 'por_vencer'
    ELSE 'vigente' END`;

// Lotes registrados, con las dosis aplicadas de cada uno. ?todos=1 incluye los retirados.
router.get('/', permitir(...TODOS), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT l.id, l.producto_id, p.nombre AS producto, l.codigo, l.fecha_vencimiento, l.activo, ${ESTADO_SQL} AS estado,
           (SELECT count(*) FROM aplicacion a WHERE a.lote_id = l.id AND NOT a.anulada)::int AS dosis_aplicadas
    FROM lote l JOIN producto p ON p.id = l.producto_id
    WHERE $1 OR l.activo
    ORDER BY p.nombre, l.fecha_vencimiento`, [req.query.todos === '1']);
  res.json(rows);
});

// Registrar un lote recibido
router.post('/', permitir(...GESTION), async (req, res) => {
  const { producto_id, fecha_vencimiento } = req.body || {};
  const codigo = String(req.body?.codigo || '').trim().toUpperCase();
  if (!producto_id || !codigo || !fecha_vencimiento) {
    return res.status(400).json({ error: 'Indique la vacuna, el número de lote y la fecha de vencimiento.' });
  }
  if (fecha_vencimiento < hoy()) {
    return res.status(422).json({ error: 'Ese lote ya está vencido; no puede registrarse para usarlo.' });
  }
  const l = await transaccion(async (c) => {
    const { rows: [l] } = await c.query(
      `INSERT INTO lote (producto_id, codigo, fecha_vencimiento, creado_por) VALUES ($1,$2,$3,$4)
       ON CONFLICT (producto_id, codigo) DO UPDATE SET fecha_vencimiento = EXCLUDED.fecha_vencimiento, activo = true
       RETURNING *`, [producto_id, codigo, fecha_vencimiento, req.usuario.id]);
    await registrarBitacora(c, req, 'crear', 'lote', l.id, null, l);
    return l;
  });
  res.status(201).json(l);
});

// Retirar o reactivar un lote (cuando se termina o se descarta)
router.put('/:id', permitir(...GESTION), async (req, res) => {
  const activo = Boolean(req.body?.activo);
  const l = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM lote WHERE id = $1', [req.params.id]);
    if (!antes) return null;
    const { rows: [l] } = await c.query('UPDATE lote SET activo = $2 WHERE id = $1 RETURNING *', [req.params.id, activo]);
    await registrarBitacora(c, req, 'editar', 'lote', l.id, antes, l);
    return l;
  });
  l ? res.json(l) : res.status(404).json({ error: 'Lote no encontrado.' });
});

// Trazabilidad: niños vacunados con un lote (por ejemplo, ante una alerta del fabricante)
router.get('/:id/ninos', permitir(...GESTION), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.id AS nino_id, n.nombre_completo, n.fecha_nacimiento, c.nombre AS comunidad, a.fecha_aplicacion,
           r.nombre_completo AS responsable, r.telefono
    FROM aplicacion a JOIN nino n ON n.id = a.nino_id JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal
    LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE a.lote_id = $1 AND NOT a.anulada
    ORDER BY a.fecha_aplicacion DESC, n.primer_apellido`, [req.params.id]);
  res.json(rows);
});

/**
 * Consumo de vacunas de un mes, por vacuna: dosis aplicadas en el servicio y en jornadas,
 * dosis llevadas y devueltas en las jornadas, y dosis registradas sin lote.
 * Sirve para preparar el pedido de biológicos al distrito sin contar a mano.
 */
router.get('/consumo', permitir(...GESTION), async (req, res) => {
  const anio = Number(req.query.anio), mes = Number(req.query.mes);
  if (!anio || !mes || mes < 1 || mes > 12) return res.status(400).json({ error: 'Indique el año y el mes.' });
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const { rows: vacunas } = await pool.query(`
    WITH ap AS (
      SELECT a.producto_id,
             count(*) FILTER (WHERE a.jornada_id IS NULL)::int AS en_servicio,
             count(*) FILTER (WHERE a.jornada_id IS NOT NULL)::int AS en_jornadas,
             count(*) FILTER (WHERE a.lote_id IS NULL AND coalesce(a.lote, '') = '')::int AS sin_lote
      FROM aplicacion a
      WHERE NOT a.anulada AND a.fuente_primaria AND a.fecha_aplicacion BETWEEN $1 AND $2
      GROUP BY 1),
    jo AS (
      SELECT jb.producto_id, sum(jb.dosis_llevadas)::int AS llevadas, sum(jb.dosis_devueltas)::int AS devueltas
      FROM jornada_biologico jb JOIN jornada j ON j.id = jb.jornada_id
      WHERE j.estado <> 'cancelada' AND j.fecha BETWEEN $1 AND $2
      GROUP BY 1)
    SELECT p.id AS producto_id, p.nombre,
           coalesce(ap.en_servicio, 0) AS en_servicio, coalesce(ap.en_jornadas, 0) AS en_jornadas,
           coalesce(ap.en_servicio, 0) + coalesce(ap.en_jornadas, 0) AS total,
           coalesce(ap.sin_lote, 0) AS sin_lote, jo.llevadas, jo.devueltas
    FROM producto p LEFT JOIN ap ON ap.producto_id = p.id LEFT JOIN jo ON jo.producto_id = p.id
    WHERE p.activo AND (ap.producto_id IS NOT NULL OR jo.producto_id IS NOT NULL)
    ORDER BY p.nombre`, [desde, hasta]);
  const { rows: lotes } = await pool.query(`
    SELECT p.nombre AS producto, l.codigo, l.fecha_vencimiento, count(*)::int AS dosis
    FROM aplicacion a JOIN lote l ON l.id = a.lote_id JOIN producto p ON p.id = l.producto_id
    WHERE NOT a.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2
    GROUP BY 1, 2, 3 ORDER BY 1, 3`, [desde, hasta]);
  res.json({ desde, hasta, vacunas, lotes });
});

module.exports = router;
