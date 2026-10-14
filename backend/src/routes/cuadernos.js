const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');

const FILAS = 25;

// Lista de cuadernos con filas ocupadas
const { alcanceDe } = require('../territorio');

router.get('/', permitir(...TODOS), async (req, res) => {
  const { anio, comunidad } = req.query;
  const alcance = await alcanceDe(pool, req.usuario);
  const { rows } = await pool.query(`
    SELECT cu.*, e.nombre AS servicio, c.nombre AS comunidad, s.nombre AS sector,
           (SELECT count(*)::int FROM nino n WHERE n.cuaderno_id = cu.id) AS ocupadas
    FROM cuaderno cu JOIN establecimiento e ON e.id = cu.servicio_id
    LEFT JOIN comunidad c ON c.id = cu.comunidad_id LEFT JOIN sector s ON s.id = cu.sector_id
    WHERE ($1::int IS NULL OR cu.anio = $1) AND ($2::int IS NULL OR cu.comunidad_id = $2) AND ($3::int[] IS NULL OR cu.comunidad_id = ANY($3))
    ORDER BY cu.anio DESC, cu.numero`, [anio || null, comunidad || null, alcance]);
  res.json(rows);
});

// Sugerencia al registrar: cuaderno del año de la comunidad (o de su sector) con la siguiente fila libre
router.get('/sugerido', permitir(...TODOS), async (req, res) => {
  const { comunidad_id, anio = new Date().getFullYear() } = req.query;
  if (!comunidad_id) return res.json(null);
  const { rows } = await pool.query(`
    SELECT cu.id, cu.numero, cu.anio, cu.tipo,
           (SELECT min(f) FROM generate_series(1, ${FILAS}) f
             WHERE NOT EXISTS (SELECT 1 FROM nino n WHERE n.cuaderno_id = cu.id AND n.fila = f)) AS fila
    FROM cuaderno cu, comunidad c
    WHERE c.id = $1 AND cu.anio = $2 AND cu.tipo = 'produccion_cobertura'
      AND (cu.comunidad_id = c.id OR (cu.comunidad_id IS NULL AND cu.sector_id = c.sector_id))
    ORDER BY (cu.comunidad_id = c.id) DESC NULLS LAST, cu.numero`, [comunidad_id, anio]);
  res.json(rows.find((r) => r.fila) || null);
});

// Un cuaderno con sus 25 filas, como en el papel
router.get('/:id', permitir(...TODOS), async (req, res) => {
  const { rows: [cu] } = await pool.query(`
    SELECT cu.*, e.nombre AS servicio, c.nombre AS comunidad, s.nombre AS sector
    FROM cuaderno cu JOIN establecimiento e ON e.id = cu.servicio_id
    LEFT JOIN comunidad c ON c.id = cu.comunidad_id LEFT JOIN sector s ON s.id = cu.sector_id WHERE cu.id = $1`, [req.params.id]);
  const alcance = await alcanceDe(pool, req.usuario);
  if (cu && alcance && !alcance.includes(cu.comunidad_id)) return res.status(403).json({ error: 'Este cuaderno es de otro puesto de salud.' });
  if (!cu) return res.status(404).json({ error: 'Cuaderno no encontrado.' });
  const { rows: ninos } = await pool.query(`
    SELECT n.id, n.fila, n.nombre_completo, n.cui, n.fecha_nacimiento, n.sexo, n.estado, r.nombre_completo AS responsable, r.telefono,
           (SELECT count(*)::int FROM aplicacion a WHERE a.nino_id = n.id AND NOT a.anulada) AS dosis
    FROM nino n LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal
    LEFT JOIN responsable r ON r.id = nr.responsable_id WHERE n.cuaderno_id = $1`, [cu.id]);
  const filas = Array.from({ length: FILAS }, (_, i) => ({ fila: i + 1, nino: ninos.find((n) => n.fila === i + 1) || null }));
  res.json({ ...cu, filas });
});

// Registrar un cuaderno físico (portada): administrador o enfermera
router.post('/', permitir('administrador', 'enfermera'), async (req, res) => {
  const { numero, anio, tipo = 'produccion_cobertura', servicio_id, comunidad_id, sector_id } = req.body || {};
  if (!numero || !anio || !servicio_id) return res.status(400).json({ error: 'Indique número, año y servicio de salud.' });
  const cu = await transaccion(async (c) => {
    const { rows: [cu] } = await c.query(
      `INSERT INTO cuaderno (numero, anio, tipo, servicio_id, comunidad_id, sector_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [numero, anio, tipo, servicio_id, comunidad_id || null, sector_id || null]);
    await registrarBitacora(c, req, 'crear', 'cuaderno', cu.id, null, cu);
    return cu;
  });
  res.status(201).json(cu);
});

module.exports = router;
