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
 * Comunidades que un usuario puede ver y editar (null = todas). Tres roles:
 *  · Dirección (administrador): todo el municipio.
 *  · Enfermera encargada de puesto: su puesto y sus aldeas (si aún no tiene lugar asignado, ve todo).
 *  · Personal de vacunación: busca a cualquier niño (rota de área), pero su menú no tiene seguimiento ni gestión.
 */
async function alcanceDe(db, usuario) {
  if (usuario?.rol === 'enfermera') {
    const t = await territorioDe(db, usuario.id);
    return t.length ? t : null;
  }
  // El personal de vacunación (auxiliares que rotan de área o atienden los cuadernillos del centro) busca a
  // cualquier niño del municipio para vacunarlo o darle suplementos; no ve seguimiento, tablero ni pedido.
  return null;
}

/**
 * ¿Consolida el pedido del municipio? La Dirección y la enfermera encargada del casco urbano (el centro de salud),
 * porque en el centro se junta lo que necesita cada puesto para pedirlo a la DDRISS.
 */
async function consolidaPedido(db, usuario) {
  if (usuario?.rol === 'administrador') return true;
  if (usuario?.rol !== 'enfermera') return false;
  const { rows } = await db.query("SELECT 1 FROM comunidad WHERE activo AND tipo = 'casco_urbano' AND responsable_id = $1", [usuario.id]);
  return rows.length > 0;
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

module.exports = { territorioDe, alcanceDe, consolidaPedido, puedeVerNino, soloSuSector, SQL_TERRITORIO };
