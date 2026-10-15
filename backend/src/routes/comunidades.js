const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');

// Campo enviado (aunque sea vacío para quitarlo) o el valor que ya tenía
const siEnviado = (v, antes) => (v === undefined ? antes : v || null);

// Cada niño cuenta una sola vez, en su caso más grave: así los números suman lo mismo que la bandeja de Pendientes
const PEOR_CASO = `
  peor AS (
    SELECT DISTINCT ON (al.nino_id) al.nino_id, n.comunidad_id, al.tipo
    FROM alerta al JOIN nino n ON n.id = al.nino_id
    WHERE n.estado = 'activo' AND al.estado IN ('abierta','en_seguimiento')
    ORDER BY al.nino_id, CASE al.tipo WHEN 'dosis_cero' THEN 1 WHEN 'abandono' THEN 2 WHEN 'atrasada' THEN 3
                                      WHEN 'inasistencia' THEN 4 ELSE 5 END)`;
const cuenta = (tipo) => `(SELECT count(*) FROM peor p WHERE p.comunidad_id = c.id AND p.tipo = '${tipo}')::int`;

// Tablero por comunidad: activos, atrasados, dosis cero, abandono, cobertura (sale de las alertas que mantiene el motor)
router.get('/tablero', permitir(...TODOS), async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const { rows } = await pool.query(`
    WITH ${PEOR_CASO}
    SELECT c.id, c.nombre, c.tipo, s.nombre AS sector, t.nombre AS territorio, c.es_central, c.responsable, c.distancia_km,
      c.comunidad_padre_id, (SELECT nombre FROM comunidad p WHERE p.id = c.comunidad_padre_id) AS puesto,
      (SELECT count(*) FROM nino n WHERE n.comunidad_id = c.id AND n.estado = 'activo')::int AS activos,
      (SELECT count(*) FROM nino n WHERE n.comunidad_id = c.id AND n.estado = 'activo'
         AND n.fecha_nacimiento > CURRENT_DATE - interval '1 year')::int AS menores_1,
      ${cuenta('atrasada')} AS atrasados, ${cuenta('dosis_cero')} AS dosis_cero, ${cuenta('abandono')} AS abandono,
      ${cuenta('inasistencia')} AS inasistencia, ${cuenta('proxima')} AS proximos,
      (SELECT cantidad FROM poblacion_meta pm WHERE pm.comunidad_id = c.id AND pm.anio = $1 AND pm.grupo_edad = 'menor_1') AS meta_menor_1,
      (SELECT count(*) FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id JOIN nino n ON n.id = ad.nino_id
         JOIN esquema_dosis d ON d.id = ad.esquema_dosis_id JOIN serie se ON se.id = d.serie_id
       WHERE n.comunidad_id = c.id AND NOT ad.anulada AND se.codigo = 'DPT_HIB_HB' AND d.numero = 3
         AND extract(year FROM a.fecha_aplicacion) = $1)::int AS dpt3_anio,
      (SELECT max(j.fecha) FROM jornada j JOIN jornada_comunidad jc ON jc.jornada_id = j.id
       WHERE jc.comunidad_id = c.id AND j.estado <> 'cancelada') AS ultima_jornada
    FROM comunidad c LEFT JOIN sector s ON s.id = c.sector_id LEFT JOIN territorio t ON t.id = s.territorio_id
    WHERE c.activo AND ($2::int[] IS NULL OR c.id = ANY($2)) ORDER BY c.nombre`, [anio, await require('../territorio').alcanceDe(pool, req.usuario)]);
  res.json(rows.map((r) => ({ ...r, cobertura_dpt3: r.meta_menor_1 ? Math.round((r.dpt3_anio / r.meta_menor_1) * 1000) / 10 : null })));
});

// ---- Catálogo territorial (administrador) ----
router.post('/', permitir('administrador'), async (req, res) => {
  const { nombre, tipo, comunidad_padre_id, sector_id, distancia_km, responsable_id, es_central } = req.body || {};
  if (!String(nombre || '').trim()) return res.status(400).json({ error: 'Escriba el nombre.' });
  const c = await transaccion(async (cl) => {
    const { rows: [c] } = await cl.query(
      `INSERT INTO comunidad (nombre, tipo, comunidad_padre_id, sector_id, distancia_km, responsable_id, es_central) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [String(nombre).trim(), tipo, comunidad_padre_id || null, sector_id || null, distancia_km || null, responsable_id || null, Boolean(es_central)]);
    await registrarBitacora(cl, req, 'crear', 'comunidad', c.id, null, c);
    return c;
  });
  res.status(201).json(c);
});

router.get('/territorios', permitir(...TODOS), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT t.id, t.nombre, e.nombre AS servicio, t.servicio_id,
           coalesce(json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre) FILTER (WHERE s.id IS NOT NULL), '[]') AS sectores
    FROM territorio t JOIN establecimiento e ON e.id = t.servicio_id LEFT JOIN sector s ON s.territorio_id = t.id
    GROUP BY t.id, e.nombre ORDER BY e.nombre, t.nombre`);
  res.json(rows);
});

router.post('/territorios', permitir('administrador'), async (req, res) => {
  const { servicio_id, nombre } = req.body || {};
  const t = await transaccion(async (c) => {
    const { rows: [t] } = await c.query('INSERT INTO territorio (servicio_id, nombre) VALUES ($1,$2) RETURNING *', [servicio_id, nombre]);
    await registrarBitacora(c, req, 'crear', 'territorio', t.id, null, t);
    return t;
  });
  res.status(201).json(t);
});

router.post('/sectores', permitir('administrador'), async (req, res) => {
  const { territorio_id, nombre } = req.body || {};
  const s = await transaccion(async (c) => {
    const { rows: [s] } = await c.query('INSERT INTO sector (territorio_id, nombre) VALUES ($1,$2) RETURNING *', [territorio_id, nombre]);
    await registrarBitacora(c, req, 'crear', 'sector', s.id, null, s);
    return s;
  });
  res.status(201).json(s);
});

// ---- Población meta (enfermera y administrador): denominador de cobertura ----
router.get('/poblacion-meta', permitir(...TODOS), async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const { rows } = await pool.query(`
    SELECT c.id AS comunidad_id, c.nombre,
      max(pm.cantidad) FILTER (WHERE pm.grupo_edad = 'menor_1') AS menor_1,
      max(pm.cantidad) FILTER (WHERE pm.grupo_edad = '1_anio') AS "1_anio",
      max(pm.cantidad) FILTER (WHERE pm.grupo_edad = '1_a_6') AS "1_a_6"
    FROM comunidad c LEFT JOIN poblacion_meta pm ON pm.comunidad_id = c.id AND pm.anio = $1
    WHERE c.activo GROUP BY c.id ORDER BY c.nombre`, [anio]);
  res.json(rows);
});

router.put('/poblacion-meta', permitir(), async (req, res) => {
  const { anio, filas = [] } = req.body || {};
  await transaccion(async (c) => {
    for (const f of filas) {
      for (const grupo of ['menor_1', '1_anio', '1_a_6']) {
        if (f[grupo] === '' || f[grupo] == null) {
          await c.query('DELETE FROM poblacion_meta WHERE comunidad_id = $1 AND anio = $2 AND grupo_edad = $3', [f.comunidad_id, anio, grupo]);
        } else {
          await c.query(`INSERT INTO poblacion_meta (comunidad_id, anio, grupo_edad, cantidad) VALUES ($1,$2,$3,$4)
                         ON CONFLICT (comunidad_id, anio, grupo_edad) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
          [f.comunidad_id, anio, grupo, Number(f[grupo])]);
        }
      }
    }
    await registrarBitacora(c, req, 'editar', 'poblacion_meta', anio, null, { filas });
  });
  res.json({ ok: true });
});

router.put('/:id', permitir('administrador'), async (req, res) => {
  const { nombre, tipo, comunidad_padre_id, sector_id, distancia_km, activo, responsable_id, es_central } = req.body || {};
  const c = await transaccion(async (cl) => {
    const { rows: [antes] } = await cl.query('SELECT * FROM comunidad WHERE id = $1', [req.params.id]);
    if (!antes) return null;
    const { rows: [c] } = await cl.query(
      `UPDATE comunidad SET nombre = $2, tipo = $3, comunidad_padre_id = $4, sector_id = $5, distancia_km = $6, activo = $7,
         responsable_id = $8, es_central = $9
       WHERE id = $1 RETURNING *`,
      [antes.id, nombre ?? antes.nombre, tipo ?? antes.tipo, siEnviado(comunidad_padre_id, antes.comunidad_padre_id),
        siEnviado(sector_id, antes.sector_id), siEnviado(distancia_km, antes.distancia_km), activo ?? antes.activo,
        siEnviado(responsable_id, antes.responsable_id), es_central ?? antes.es_central]);
    await registrarBitacora(cl, req, 'editar', 'comunidad', c.id, antes, c);
    return c;
  });
  c ? res.json(c) : res.status(404).json({ error: 'Comunidad no encontrada.' });
});

// Deja de ser puesto: la aldea del puesto y todas sus comunidades pasan a otro puesto
router.post('/:id/quitar-puesto', permitir('administrador'), async (req, res) => {
  const destino = Number(req.body?.destino_id);
  const r = await transaccion(async (cl) => {
    const { rows: [p] } = await cl.query('SELECT * FROM comunidad WHERE id = $1 AND es_central', [req.params.id]);
    if (!p) return { status: 404, error: 'Ese lugar no es un puesto.' };
    const { rows: [d] } = await cl.query('SELECT id FROM comunidad WHERE id = $1 AND es_central AND activo AND id <> $2', [destino, p.id]);
    if (!d) return { status: 400, error: 'Elija a qué puesto pasan sus comunidades.' };
    const { rowCount } = await cl.query('UPDATE comunidad SET comunidad_padre_id = $2 WHERE comunidad_padre_id = $1', [p.id, d.id]);
    await cl.query('UPDATE comunidad SET es_central = false, comunidad_padre_id = $2 WHERE id = $1', [p.id, d.id]);
    await registrarBitacora(cl, req, 'editar', 'comunidad', p.id, p, { quitar_puesto: true, destino_id: d.id, movidas: rowCount });
    return { status: 200, movidas: rowCount };
  });
  res.status(r.status).json(r.error ? { error: r.error } : r);
});

// Cuántos registros dependen de una comunidad (para saber si se puede eliminar)
async function usoDe(db, id) {
  const { rows: [u] } = await db.query(`SELECT
    (SELECT count(*) FROM nino WHERE comunidad_id = $1)::int AS ninos,
    (SELECT count(*) FROM nino WHERE comunidad_id = $1 AND estado = 'activo')::int AS ninos_activos,
    (SELECT count(*) FROM responsable WHERE comunidad_id = $1)::int AS responsables,
    (SELECT count(*) FROM comunidad WHERE comunidad_padre_id = $1 AND activo)::int AS hijas,
    (SELECT count(*) FROM cuaderno WHERE comunidad_id = $1)::int AS cuadernos,
    (SELECT count(*) FROM jornada_comunidad WHERE comunidad_id = $1)::int AS jornadas`, [id]);
  return u;
}

// Desactivar: deja de aparecer en listas; se conserva el historial. No se puede con niños activos o comunidades a cargo.
router.post('/:id/desactivar', permitir('administrador'), async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM comunidad WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Comunidad no encontrada.' });
  const u = await usoDe(pool, c.id);
  if (u.hijas) return res.status(409).json({ error: `Tiene ${u.hijas} comunidades a cargo: páselas a otro puesto primero.` });
  if (u.ninos_activos) return res.status(409).json({ error: `Tiene ${u.ninos_activos} niños activos: cámbielos de comunidad primero.` });
  await pool.query('UPDATE comunidad SET activo = false, responsable_id = NULL WHERE id = $1', [c.id]);
  await registrarBitacora(pool, req, 'editar', 'comunidad', c.id, c, { activo: false });
  res.json({ ok: true });
});

// Eliminar: solo si nunca se usó (sin niños, responsables, cuadernos ni jornadas); si no, se desactiva
router.delete('/:id', permitir('administrador'), async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM comunidad WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Comunidad no encontrada.' });
  const u = await usoDe(pool, c.id);
  if (u.ninos || u.responsables || u.hijas || u.cuadernos || u.jornadas)
    return res.status(409).json({ error: 'Ya tiene registros (niños, familias, cuadernos o jornadas): desactívela en lugar de eliminarla.' });
  await pool.query('DELETE FROM poblacion_meta WHERE comunidad_id = $1', [c.id]);
  await pool.query('DELETE FROM comunidad WHERE id = $1', [c.id]);
  await registrarBitacora(pool, req, 'eliminar', 'comunidad', c.id, c, null);
  res.json({ ok: true });
});

// Reactivar una comunidad desactivada
router.post('/:id/activar', permitir('administrador'), async (req, res) => {
  const { rows: [c] } = await pool.query('UPDATE comunidad SET activo = true WHERE id = $1 RETURNING *', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Comunidad no encontrada.' });
  await registrarBitacora(pool, req, 'editar', 'comunidad', c.id, null, { activo: true });
  res.json(c);
});

// Inactivas (para reactivarlas desde Administración)
router.get('/inactivas', permitir('administrador'), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, tipo FROM comunidad WHERE NOT activo ORDER BY nombre');
  res.json(rows);
});

module.exports = router;
