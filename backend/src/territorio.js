// Comunidades a cargo de un usuario: las que tiene como responsable y, si es responsable de un puesto,
// las comunidades de ese puesto que no tienen un responsable propio.
const SQL_TERRITORIO = `
  SELECT c.id FROM comunidad c LEFT JOIN comunidad p ON p.id = c.comunidad_padre_id
  WHERE c.activo AND (c.responsable_id = $1 OR (c.responsable_id IS NULL AND p.responsable_id = $1))`;

async function territorioDe(db, usuarioId) {
  const { rows } = await db.query(SQL_TERRITORIO, [usuarioId]);
  return rows.map((r) => r.id);
}

/**
 * Comunidades que un usuario puede ver y editar. null = todas (enfermera, administrador, encargada, o personal sin puesto).
 * El personal de un puesto o barrio solo trabaja en lo suyo: nadie se mete en el puesto de otro.
 */
async function alcanceDe(db, usuario) {
  if (usuario?.rol !== 'vacunador') return null;
  const t = await territorioDe(db, usuario.id);
  return t.length ? t : null;
}

/** ¿Puede este usuario ver al niño? Quien tiene sector, solo los de su sector o los de una jornada suya abierta. */
async function puedeVerNino(db, usuario, ninoId) {
  const alcance = await alcanceDe(db, usuario);
  if (!alcance) return true;
  // También los niños de una jornada abierta en la que esta persona va en el equipo (sale a vacunar a otro puesto)
  const { rows: [n] } = await db.query(`
    SELECT n.comunidad_id, EXISTS (
      SELECT 1 FROM jornada_nino jn JOIN jornada j ON j.id = jn.jornada_id
      WHERE jn.nino_id = n.id AND j.estado IN ('planificada', 'en_curso')
        AND (j.responsable_id = $2 OR EXISTS (SELECT 1 FROM jornada_equipo je WHERE je.jornada_id = j.id AND je.usuario_id = $2))
    ) AS en_su_jornada
    FROM nino n WHERE n.id = $1`, [ninoId, usuario.id]);
  return !n || alcance.includes(n.comunidad_id) || n.en_su_jornada;
}

/** Middleware para rutas con :id de niño: bloquea niños de otros puestos. */
const soloSuSector = (param) => async (req, res, next, valor) => {
  if (!/^\d+$/.test(String(valor))) return next();
  if (await puedeVerNino(require('./db').pool, req.usuario, Number(valor))) return next();
  res.status(403).json({ error: 'Este niño es de otro puesto de salud.' });
};

module.exports = { territorioDe, alcanceDe, puedeVerNino, soloSuSector, SQL_TERRITORIO };
