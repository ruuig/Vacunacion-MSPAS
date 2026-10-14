const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');
const esq = require('../servicios/esquema');
const { hoy } = require('../fecha');

// La enfermera y el administrador ven todas las jornadas; el personal de vacunación, solo las de su equipo
const veTodas = (u) => ['enfermera', 'administrador', 'encargado'].includes(u.rol);
const EN_EQUIPO = `(j.responsable_id = $1 OR EXISTS (SELECT 1 FROM jornada_equipo je WHERE je.jornada_id = j.id AND je.usuario_id = $1))`;

async function esDelEquipo(db, jornadaId, usuario) {
  if (veTodas(usuario)) return true;
  const { rows } = await db.query(`SELECT 1 FROM jornada j WHERE j.id = $2 AND ${EN_EQUIPO}`, [usuario.id, jornadaId]);
  return rows.length > 0;
}

/** Solo el equipo asignado (o la enfermera) puede ver y registrar en una jornada. */
const soloEquipo = async (req, res, next) => {
  if (await esDelEquipo(pool, req.params.id, req.usuario)) return next();
  res.status(403).json({ error: 'Esta jornada no está asignada a usted.' });
};

async function guardarEquipo(c, jornadaId, responsableId, equipoIds = []) {
  await c.query('DELETE FROM jornada_equipo WHERE jornada_id = $1', [jornadaId]);
  for (const id of new Set([responsableId, ...equipoIds].filter(Boolean).map(Number))) {
    await c.query('INSERT INTO jornada_equipo (jornada_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [jornadaId, id]);
  }
}

/**
 * Productos que hay que llevar para las dosis que le tocan a un niño.
 * La hexavalente cubre Penta y Polio 1a a 3a; el R1 es hexavalente + OPV (gotas) y el R2, DPT + OPV.
 */
function productosNecesarios(dosis) {
  const out = new Set();
  const conPenta = new Set(dosis.filter((d) => d.serieCodigo === 'DPT_HIB_HB').map((d) => d.numero));
  for (const d of dosis) {
    // Polio sola (la pentavalente ya está o no toca): IPV la 1a, OPV las demás; si tocan juntas, una hexavalente
    if (d.serieCodigo === 'POLIO') out.add(d.numero <= 3 && conPenta.has(d.numero) ? 'HEXA' : d.numero === 1 ? 'IPV' : 'OPV');
    else if (d.serieCodigo === 'DPT_HIB_HB') out.add(d.numero <= 4 ? 'HEXA' : 'DPT');
    else {
      const p = { HB_RN: 'HB_PED', BCG: 'BCG', ROTA: 'ROTA', NEUMO: 'NEUMO', SPR: 'SPR', INFLUENZA: 'INFL_PED', VARICELA: 'VARICELA' }[d.serieCodigo];
      if (p) out.add(p);
    }
  }
  return [...out];
}

/** Niños de las comunidades (todas si no se indican) con dosis para la fecha, y lo que le toca a cada uno. */
async function convocables(db, fecha, comunidadIds, ctx) {
  const { rows: ninos } = await db.query(
    `SELECT id, fecha_nacimiento, estado, comunidad_id FROM nino
     WHERE estado = 'activo' AND ($1::int[] IS NULL OR comunidad_id = ANY($1))`, [comunidadIds]);
  const out = [];
  for (const n of ninos) {
    if (esq.cumpleEgreso(n, fecha, ctx.params)) continue;
    const r = await esq.calcularNino(db, n, fecha, ctx);
    const dosis = r.leTocaHoy.map((d) => ({ esquemaDosisId: d.esquemaDosisId, etiqueta: d.etiqueta, serieCodigo: d.serieCodigo,
      numero: d.numero, estado: d.estado }));
    if (dosis.length) out.push({ nino: n, dosis });
  }
  return out;
}

// Vista previa al planificar: por comunidad, cuántos niños tendrán dosis ese día y qué vacunas llevar
router.get('/vista-previa', permitir(...TODOS), async (req, res) => {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : hoy();
  const ctx = { params: await esq.cargarParametros(pool), catalogo: await esq.cargarCatalogo(pool) };
  const porComunidad = {};
  for (const { nino, dosis } of await convocables(pool, fecha, null, ctx)) {
    const c = (porComunidad[nino.comunidad_id] ||= { comunidad_id: nino.comunidad_id, ninos: 0, dosis: 0, atrasados: 0, productos: {} });
    c.ninos += 1;
    c.dosis += dosis.length;
    if (dosis.some((d) => d.estado === 'atrasada')) c.atrasados += 1;
    for (const p of productosNecesarios(dosis)) c.productos[p] = (c.productos[p] || 0) + 1;
  }
  res.json({ fecha, comunidades: Object.values(porComunidad) });
});

router.get('/', permitir(...TODOS), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT j.*, u.nombre AS responsable,
      (SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre) FROM jornada_comunidad jc JOIN comunidad c ON c.id = jc.comunidad_id WHERE jc.jornada_id = j.id) AS comunidades,
      (SELECT string_agg(ue.nombre, ', ' ORDER BY ue.nombre) FROM jornada_equipo je JOIN usuario ue ON ue.id = je.usuario_id WHERE je.jornada_id = j.id) AS equipo,
      (SELECT count(*) FROM jornada_nino jn WHERE jn.jornada_id = j.id)::int AS convocados,
      (SELECT count(DISTINCT a.nino_id) FROM aplicacion a WHERE a.jornada_id = j.id AND NOT a.anulada)::int AS vacunados
    FROM jornada j LEFT JOIN usuario u ON u.id = j.responsable_id
    WHERE $2 OR ${EN_EQUIPO}
    ORDER BY j.fecha DESC LIMIT 100`, [req.usuario.id, veTodas(req.usuario)]);
  res.json(rows);
});

// Planificar: listado nominal y biológicos calculados a la fecha de la jornada (no a hoy)
router.post('/', permitir('enfermera'), async (req, res) => {
  const { fecha, comunidad_ids = [], porcentaje_reserva, observaciones, responsable_id, equipo_ids = [] } = req.body || {};
  if (!fecha || !comunidad_ids.length) return res.status(400).json({ error: 'Indique fecha y al menos una comunidad.' });
  if (fecha < hoy()) return res.status(400).json({ error: 'La jornada debe ser hoy o en una fecha futura.' });

  const j = await transaccion(async (c) => {
    const params = await esq.cargarParametros(c);
    const catalogo = await esq.cargarCatalogo(c);
    const reserva = Number(porcentaje_reserva ?? params.porcentaje_reserva_jornada ?? 0);
    const { rows: [j] } = await c.query(
      'INSERT INTO jornada (fecha, responsable_id, porcentaje_reserva, observaciones) VALUES ($1,$2,$3,$4) RETURNING *',
      [fecha, responsable_id || req.usuario.id, reserva, observaciones || null]);
    for (const id of comunidad_ids) await c.query('INSERT INTO jornada_comunidad (jornada_id, comunidad_id) VALUES ($1,$2)', [j.id, id]);
    await guardarEquipo(c, j.id, j.responsable_id, equipo_ids);

    const totales = {};
    for (const { nino: n, dosis } of await convocables(c, fecha, comunidad_ids.map(Number), { catalogo, params })) {
      await c.query('INSERT INTO jornada_nino (jornada_id, nino_id, dosis_programadas) VALUES ($1,$2,$3)', [j.id, n.id, JSON.stringify(dosis)]);
      for (const p of productosNecesarios(dosis)) totales[p] = (totales[p] || 0) + 1;
    }
    const { rows: productos } = await c.query('SELECT id, codigo FROM producto WHERE codigo = ANY($1)', [Object.keys(totales)]);
    for (const p of productos) {
      const n = totales[p.codigo];
      await c.query('INSERT INTO jornada_biologico (jornada_id, producto_id, dosis_estimadas, dosis_llevadas) VALUES ($1,$2,$3,$4)',
        [j.id, p.id, n, Math.ceil(n * (1 + reserva / 100))]);
    }
    await registrarBitacora(c, req, 'crear', 'jornada', j.id, null, { ...j, comunidad_ids });
    return j;
  });
  res.status(201).json(j);
});

// Detalle: listado nominal (hoja de jornada), biológicos y resultados
router.get('/:id', permitir(...TODOS), soloEquipo, async (req, res) => {
  const { rows: [j] } = await pool.query(
    'SELECT j.*, u.nombre AS responsable, u.cargo FROM jornada j LEFT JOIN usuario u ON u.id = j.responsable_id WHERE j.id = $1', [req.params.id]);
  if (!j) return res.status(404).json({ error: 'Jornada no encontrada.' });
  const [comunidades, ninos, biologicos, equipo] = await Promise.all([
    pool.query(`SELECT c.id, c.nombre, s.nombre AS sector FROM jornada_comunidad jc JOIN comunidad c ON c.id = jc.comunidad_id
                LEFT JOIN sector s ON s.id = c.sector_id WHERE jc.jornada_id = $1 ORDER BY c.nombre`, [j.id]),
    pool.query(`
      SELECT jn.*, n.nombre_completo, n.fecha_nacimiento, n.sexo, n.fila, c.nombre AS comunidad,
             cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio, r.nombre_completo AS responsable, r.telefono,
             r.direccion_detalle, r.numero_casa,
             (SELECT json_agg(json_build_object('producto', p.nombre, 'fecha', a.fecha_aplicacion, 'lote', a.lote,
                                                'en_jornada', a.jornada_id = jn.jornada_id))
                FROM aplicacion a JOIN producto p ON p.id = a.producto_id
               WHERE a.nino_id = jn.nino_id AND NOT a.anulada
                 AND (a.jornada_id = jn.jornada_id OR a.fecha_aplicacion = (SELECT fecha FROM jornada WHERE id = jn.jornada_id))) AS aplicadas
      FROM jornada_nino jn JOIN nino n ON n.id = jn.nino_id JOIN comunidad c ON c.id = n.comunidad_id
      LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
      LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
      WHERE jn.jornada_id = $1 ORDER BY c.nombre, n.primer_apellido, n.primer_nombre`, [j.id]),
    pool.query(`
      SELECT p.id AS producto_id, p.nombre, coalesce(jb.dosis_estimadas, 0) AS dosis_estimadas, jb.dosis_llevadas, jb.dosis_devueltas,
             (SELECT count(*) FROM aplicacion a WHERE a.jornada_id = $1 AND a.producto_id = p.id AND NOT a.anulada)::int AS aplicadas
      FROM producto p LEFT JOIN jornada_biologico jb ON jb.producto_id = p.id AND jb.jornada_id = $1
      WHERE jb.jornada_id IS NOT NULL OR EXISTS (SELECT 1 FROM aplicacion a WHERE a.jornada_id = $1 AND a.producto_id = p.id)
      ORDER BY p.nombre`, [j.id]),
    pool.query(`SELECT u.id, u.nombre, u.cargo FROM jornada_equipo je JOIN usuario u ON u.id = je.usuario_id
                WHERE je.jornada_id = $1 ORDER BY u.nombre`, [j.id]),
  ]);
  const vacunados = ninos.rows.filter((n) => n.aplicadas?.length).length;
  const { rows: [{ nuevos }] } = await pool.query(
    `SELECT count(DISTINCT a.nino_id)::int AS nuevos FROM aplicacion a
     WHERE a.jornada_id = $1 AND NOT a.anulada AND a.nino_id NOT IN (SELECT nino_id FROM jornada_nino WHERE jornada_id = $1)`, [j.id]);
  res.json({ ...j, comunidades: comunidades.rows, ninos: ninos.rows, biologicos: biologicos.rows, equipo: equipo.rows,
    resumen: { convocados: ninos.rows.length, vacunados, no_convocados_vacunados: nuevos } });
});

// Cambiar el equipo de una jornada que aún no se cierra
router.put('/:id/equipo', permitir('enfermera'), async (req, res) => {
  const { responsable_id, equipo_ids = [] } = req.body || {};
  const r = await transaccion(async (c) => {
    const { rows: [j] } = await c.query("SELECT * FROM jornada WHERE id = $1 AND estado IN ('planificada','en_curso') FOR UPDATE", [req.params.id]);
    if (!j) return null;
    const responsable = responsable_id || j.responsable_id;
    await c.query('UPDATE jornada SET responsable_id = $2 WHERE id = $1', [j.id, responsable]);
    await guardarEquipo(c, j.id, responsable, equipo_ids);
    await registrarBitacora(c, req, 'editar', 'jornada_equipo', j.id, null, { responsable_id: responsable, equipo_ids });
    return true;
  });
  r ? res.json({ ok: true }) : res.status(404).json({ error: 'Jornada no encontrada o ya cerrada.' });
});

// Iniciar: el día de la jornada se abre para vacunar; desde aquí las vacunas llevadas quedan fijas
router.post('/:id/iniciar', permitir(...OPERATIVOS), soloEquipo, async (req, res) => {
  const { rows: [j] } = await pool.query('SELECT * FROM jornada WHERE id = $1', [req.params.id]);
  if (!j) return res.status(404).json({ error: 'Jornada no encontrada.' });
  if (j.estado === 'en_curso') return res.json(j); // ya la inició otra persona del equipo
  if (j.estado !== 'planificada') return res.status(409).json({ error: 'La jornada ya está cerrada o cancelada.' });
  if (j.fecha > hoy()) return res.status(409).json({ error: `La jornada es el ${j.fecha.split('-').reverse().join('/')}; se inicia ese día.` });
  const { rows: [act] } = await pool.query(
    "UPDATE jornada SET estado = 'en_curso', iniciada_en = now(), iniciada_por = $2 WHERE id = $1 RETURNING *", [j.id, req.usuario.id]);
  await registrarBitacora(pool, req, 'iniciar', 'jornada', j.id, j, act);
  res.json(act);
});

// Marcar asistencia o inasistencia con motivo
router.post('/:id/asistencia', permitir(...OPERATIVOS), soloEquipo, async (req, res) => {
  const { nino_id, asistio, motivo_inasistencia } = req.body || {};
  const { rowCount } = await pool.query(
    `UPDATE jornada_nino jn SET asistio = $3, motivo_inasistencia = $4 FROM jornada j
     WHERE j.id = jn.jornada_id AND j.estado = 'en_curso' AND jn.jornada_id = $1 AND jn.nino_id = $2`,
    [req.params.id, nino_id, asistio, asistio ? null : motivo_inasistencia || null]);
  rowCount ? res.json({ ok: true }) : res.status(409).json({ error: 'Niño no convocado, o la jornada no está en curso.' });
});

// Biológicos llevados y devueltos; también vacunas que se agregan a mano además de las calculadas
router.put('/:id/biologicos', permitir(...OPERATIVOS), soloEquipo, async (req, res) => {
  const { biologicos = [] } = req.body || {};
  const { rows: [j] } = await pool.query('SELECT estado FROM jornada WHERE id = $1', [req.params.id]);
  if (j?.estado !== 'planificada') return res.status(409).json({ error: 'La jornada ya inició: las vacunas llevadas no se pueden cambiar.' });
  await transaccion(async (c) => {
    for (const b of biologicos) {
      await c.query(`INSERT INTO jornada_biologico (jornada_id, producto_id, dosis_llevadas, dosis_devueltas) VALUES ($1,$2,$3,$4)
                     ON CONFLICT (jornada_id, producto_id) DO UPDATE SET dosis_llevadas = $3, dosis_devueltas = $4`,
      [req.params.id, b.producto_id, b.dosis_llevadas === '' ? null : b.dosis_llevadas, b.dosis_devueltas === '' ? null : b.dosis_devueltas]);
    }
    await registrarBitacora(c, req, 'editar', 'jornada_biologico', req.params.id, null, { biologicos });
  });
  res.json({ ok: true });
});

// Cerrar: quien no recibió dosis queda como inasistencia y genera alerta
router.post('/:id/cerrar', permitir('enfermera'), async (req, res) => {
  const { devueltas = [] } = req.body || {};
  const r = await transaccion(async (c) => {
    const { rows: [j] } = await c.query("SELECT * FROM jornada WHERE id = $1 AND estado IN ('planificada','en_curso') FOR UPDATE", [req.params.id]);
    if (!j) return null;
    for (const d of devueltas) {
      await c.query(`INSERT INTO jornada_biologico (jornada_id, producto_id, dosis_devueltas) VALUES ($1,$2,$3)
                     ON CONFLICT (jornada_id, producto_id) DO UPDATE SET dosis_devueltas = $3`,
      [j.id, d.producto_id, d.dosis_devueltas === '' || d.dosis_devueltas == null ? null : Number(d.dosis_devueltas)]);
    }
    // Asistió si se vacunó en la jornada o ese mismo día (o después) en el servicio: no es inasistencia
    await c.query(`UPDATE jornada_nino jn SET asistio = true WHERE jn.jornada_id = $1 AND EXISTS (
      SELECT 1 FROM aplicacion a WHERE a.nino_id = jn.nino_id AND NOT a.anulada AND (a.jornada_id = $1 OR a.fecha_aplicacion >= $2))`, [j.id, j.fecha]);
    const { rows: faltaron } = await c.query(
      'UPDATE jornada_nino SET asistio = false WHERE jornada_id = $1 AND asistio IS NOT true RETURNING nino_id', [j.id]);
    for (const f of faltaron) {
      await c.query(`INSERT INTO alerta (nino_id, esquema_dosis_id, tipo, prioridad) VALUES ($1, NULL, 'inasistencia', 'media')
                     ON CONFLICT DO NOTHING`, [f.nino_id]);
    }
    await c.query("UPDATE jornada SET estado = 'cerrada' WHERE id = $1", [j.id]);
    await registrarBitacora(c, req, 'cerrar', 'jornada', j.id, j, { inasistencias: faltaron.length });
    return { inasistencias: faltaron.length };
  });
  r ? res.json(r) : res.status(404).json({ error: 'Jornada no encontrada o ya cerrada.' });
});

router.post('/:id/cancelar', permitir('enfermera'), async (req, res) => {
  const { rowCount } = await pool.query("UPDATE jornada SET estado = 'cancelada' WHERE id = $1 AND estado = 'planificada'", [req.params.id]);
  if (rowCount) await registrarBitacora(pool, req, 'cancelar', 'jornada', req.params.id);
  rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Jornada no encontrada o ya cerrada.' });
});

module.exports = router;
module.exports.productosNecesarios = productosNecesarios;
module.exports.esDelEquipo = esDelEquipo;
